/*
 * Comando /gpt.
 */

const { MessageMedia } = require('whatsapp-web.js');

const { getCommandSyntax } = require('./base');
const { OPENAI_MODELS } = require('../openai');
const {
    WITHOUT_KEY, keyAdminOpenAi, keyOpenAi, queryConsumption, queryLimits, errorOpenAi, askOnChat, synthesizeVoice,
    transcribeAudio, VOICE_MAX_CHARACTERS
} = require('../openaiChat');
const { envOuSetting, getSetting, setSetting } = require('../settings');
const { fmtInA } = require('../util/format');

/*
 * /gpt: asks ChatGPT (the call and the errors live in openaiChat.js).
 */
const GPT_INSTRUCTIONS = 'Você é um assistente no WhatsApp. Responda de forma direta, em português, salvo se pedirem outro idioma.';

// /gpt -m: without a model lists the current one and the accepted ones; with a model, saves the setting
async function swapModel(msg, modelAlt) {
    const doEnv = process.env.OPENAI_MODEL?.trim();

    if (!modelAlt) {
        const current = envOuSetting('OPENAI_MODEL', 'openai.api.model');
        await msg.reply(`🤖 *Modelo do /gpt:* ${current}${doEnv ? ' _(do OPENAI_MODEL no .env)_' : ''}\n\n` +
            '*Aceitos:*\n' + OPENAI_MODELS.map(m => `${m === current ? '✅' : '▫️'} ${m}`).join('\n') +
            '\n\n💡 _/gpt -m <modelo> troca (setting openai.api.model)._');
        return;
    }

    try {
        await setSetting('openai.api.model', modelAlt);
    } catch (e) {
        await msg.reply(`❌ Modelo ${e.message}`);
        return;
    }
    await msg.reply(`✅ Modelo do /gpt: *${getSetting('openai.api.model')}*` +
        (doEnv ? `\n⚠️ _O OPENAI_MODEL do .env (${doEnv}) tem prioridade enquanto estiver definido._` : ''));
}

// The replied photo: only those OpenAI reads, and up to a size that does not blow the request
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const PHOTO_MAX_BYTES = 15 * 1024 * 1024;
const PHOTO_QUESTION = 'Descreva esta imagem.';

/**
 * The image of the replied message (photo or sticker), downloaded as base64.
 * @returns {Promise<null | { imagem: { mimetype: string, data: string } } | { erro: string }>}
 * null: the replied message is not an image (only the text follows)
 */
async function replyImage(quotedMsg) {
    if (!quotedMsg?.hasMedia || !['image', 'sticker'].includes(quotedMsg.type)) return null;

    const mediaAlt = await quotedMsg.downloadMedia().catch(() => null);
    if (!mediaAlt?.data) return { erro: '❌ Não consegui baixar a imagem (ela pode ter expirado no WhatsApp).' };
    if (!PHOTO_TYPES.includes(mediaAlt.mimetype)) {
        return { erro: `❌ A OpenAI não lê imagem ${mediaAlt.mimetype}: só ${PHOTO_TYPES.map(t => t.split('/')[1]).join(', ')}.` };
    }
    if (mediaAlt.data.length * 0.75 > PHOTO_MAX_BYTES) {
        return { erro: `❌ A imagem tem mais de ${PHOTO_MAX_BYTES / 1024 / 1024} MB: é grande demais para o /gpt.` };
    }
    return { imagem: { mimetype: mediaAlt.mimetype, data: mediaAlt.data } };
}

// The replied audio: the right extension for OpenAI (the format comes from the file name) and its ceiling
const AUDIO_EXTENSIONS = {
    'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a',
    'audio/m4a': 'm4a', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/webm': 'webm', 'audio/flac': 'flac'
};
const AUDIO_MAX_BYTES = 25 * 1024 * 1024;

/**
 * The replied message's audio (audio or voice note), downloaded as base64.
 * @returns {Promise<null | { audio: { arquivo: string, mimetype: string, data: string } } | { erro: string }>}
 * null: the replied message is not audio
 */
async function replyAudio(quotedMsg) {
    if (!quotedMsg?.hasMedia || !['audio', 'ptt'].includes(quotedMsg.type)) return null;

    const mediaAlt = await quotedMsg.downloadMedia().catch(() => null);
    if (!mediaAlt?.data) return { erro: '❌ Não consegui baixar o áudio (ele pode ter expirado no WhatsApp).' };

    // "audio/ogg; codecs=opus" (the WhatsApp voice note) → "audio/ogg"
    const type = String(mediaAlt.mimetype).split(';')[0].trim().toLowerCase();
    const extension = AUDIO_EXTENSIONS[type];
    if (!extension) {
        return { erro: `❌ A OpenAI não transcreve áudio ${type}: só ${[...new Set(Object.values(AUDIO_EXTENSIONS))].join(', ')}.` };
    }
    if (mediaAlt.data.length * 0.75 > AUDIO_MAX_BYTES) {
        return { erro: `❌ O áudio tem mais de ${AUDIO_MAX_BYTES / 1024 / 1024} MB: é grande demais para transcrever.` };
    }
    return { audio: { arquivo: `audio.${extension}`, mimetype: type, data: mediaAlt.data } };
}

// "agora transcreva isso", "transcreve": it is only the transcription (no question for the chat)
const soTranscribe = (args) => !args.trim() ||
    (/^(agora\s+)?transcrev\w*/i.test(args.trim()) && args.trim().split(/\s+/).length <= 6);

/*
 * Replying to an audio: transcribes (v1/audio/transcriptions). Without a question, or just "transcreva", replies the
 * transcription; with another question ("resuma", "traduza para o inglês"), sends the transcription along to the chat.
 */
async function replyOnAudio(msg, { audio, erro: errorAlt }, args) {
    if (errorAlt) {
        await msg.reply(errorAlt);
        return;
    }

    try {
        const transcription = await transcribeAudio({ cmd: '/gpt', audio });
        if (!transcription) {
            await msg.reply('🤖 Não ouvi fala nenhuma nesse áudio.');
            return;
        }
        if (soTranscribe(args)) {
            await msg.reply(`🤖 *Transcrição:*\n${transcription}`);
            return;
        }

        const reply = await askOnChat({
            cmd: '/gpt', sistema: GPT_INSTRUCTIONS, texto: `${args.trim()}\n\nTranscrição do áudio:\n${transcription}`
        });
        await msg.reply(`🤖 ${reply}`);
    } catch (err) {
        await msg.reply(errorOpenAi(err, '/gpt'));
    }
}

/*
 * /gpt -voz [text]: the voice of the text (v1/audio/speech), robot by default, in a voice note. Without
 * typed text, speaks the replied message's.
 */
async function talkText(msg, args, quotedMsg) {
    const typed = args.replace(/(^|\s)-(?:voz|v)(?=\s|$)/, '').trim();
    const textAlt = typed || String(quotedMsg?.body ?? '').trim();

    if (!textAlt) {
        await msg.reply('❌ Use: /gpt -voz <texto> (ou responda uma mensagem de texto)');
        return;
    }
    if (textAlt.length > VOICE_MAX_CHARACTERS) {
        await msg.reply(`❌ O texto tem ${textAlt.length} caracteres: a voz aceita até ${VOICE_MAX_CHARACTERS}.`);
        return;
    }

    try {
        const voice = await synthesizeVoice({ cmd: '/gpt', texto: textAlt });
        await msg.reply(new MessageMedia('audio/ogg; codecs=opus', voice.toString('base64'), 'voz.ogg'), null, { sendAudioAsVoice: true });
    } catch (err) {
        await msg.reply(errorOpenAi(err, '/gpt'));
    }
}

const DAYS_DEFAULT = 7;
const DAYS_MAX = 31;

const sum = () => ({ entrada: 0, saida: 0, cache: 0, requisicoes: 0 });
const tokens = (t) => t.entrada + t.saida;
const summary = (t) => `${fmtInA(tokens(t))} tokens · ${fmtInA(t.requisicoes)} req`;

// The Usage API buckets → the chat text: the total, per day and per model
function consumptionText(buckets, daysAlt) {
    const total = sum();
    const byDay = new Map();
    const byModel = new Map();
    const accumulate = (map, keyAlt, r) => {
        const t = map.get(keyAlt) ?? sum();
        t.entrada += r.input_tokens ?? 0;
        t.saida += r.output_tokens ?? 0;
        t.cache += r.input_cached_tokens ?? 0;
        t.requisicoes += r.num_model_requests ?? 0;
        map.set(keyAlt, t);
    };

    for (const b of buckets) {
        for (const r of b.results ?? []) {
            accumulate(new Map([[0, total]]), 0, r);
            accumulate(byDay, b.start_time, r);
            accumulate(byModel, r.model ?? '(sem modelo)', r);
        }
    }

    const day = (start) => new Date(start * 1000).toISOString().slice(5, 10).split('-').reverse().join('/');
    const linesAlt = [
        `📊 *Consumo da OpenAI* — ${daysAlt === 1 ? 'hoje' : `últimos ${daysAlt} dias`}`,
        `🔢 ${fmtInA(tokens(total))} tokens · entrada ${fmtInA(total.entrada)} (cache ${fmtInA(total.cache)}) · saída ${fmtInA(total.saida)}`,
        `🔁 ${fmtInA(total.requisicoes)} requisições`
    ];

    if (byDay.size) {
        linesAlt.push('', '📅 *Por dia* _(UTC)_');
        for (const [start, t] of [...byDay].sort((a, b) => a[0] - b[0])) linesAlt.push(`• ${day(start)} · ${summary(t)}`);
    }
    if (byModel.size) {
        linesAlt.push('', '🧠 *Por modelo*');
        for (const [modelAlt, t] of [...byModel].sort((a, b) => tokens(b[1]) - tokens(a[1])).slice(0, 8)) {
            linesAlt.push(`• ${modelAlt} · ${summary(t)}`);
        }
    }
    if (!byDay.size && !byModel.size) linesAlt.push('', 'ℹ️ Nenhum uso nesse período.');
    return linesAlt.join('\n');
}

// The x-ratelimit-* headers → the chat text
function limitsText({ modelo: modelAlt, tokens: t, requisicoes: r }) {
    const line = (nameAlt, x) => (x.limite
        ? `• ${nameAlt}: ${fmtInA(x.restante ?? 0)} de ${fmtInA(x.limite)}${x.reseta ? ` · reseta em ${x.reseta}` : ''}`
        : null);
    const linesAlt = [line('tokens', t), line('requisições', r)].filter(Boolean);
    return [`⏱️ *Limites agora* — ${modelAlt}`, ...(linesAlt.length ? linesAlt : ['• A OpenAI não informou os limites.'])].join('\n');
}

/*
 * /gpt -usage [days]: the consumption (Usage API, with the admin key) and the current limits (headers
 * of a minimal call, with the normal key). Only the owner and the admins (role in comandos).
 */
async function showUsage(msg, daysTyped) {
    const daysAlt = daysTyped == null ? DAYS_DEFAULT : Number(daysTyped);
    if (!Number.isInteger(daysAlt) || daysAlt < 1 || daysAlt > DAYS_MAX) {
        await msg.reply(`❌ Use: /gpt -usage [dias] (de 1 a ${DAYS_MAX}; padrão ${DAYS_DEFAULT})`);
        return;
    }

    const withAdmin = Boolean(keyAdminOpenAi());
    const withKey = Boolean(keyOpenAi());
    if (!withAdmin && !withKey) {
        await msg.reply(`${WITHOUT_KEY('/gpt')}\n💡 _Para o consumo, a chave de admin: OPENAI_ADMIN_KEY ou /set openai.admin.key_`);
        return;
    }

    const partsAlt = [];

    if (withAdmin) {
        try {
            partsAlt.push(consumptionText((await queryConsumption({ cmd: '/gpt', dias: daysAlt })).buckets, daysAlt));
        } catch (err) {
            const status = err.response?.status;
            partsAlt.push(status === 401 || status === 403
                ? '🔑 A chave de admin foi recusada. A Usage API pede uma Admin key (sk-admin-...), criada em ' +
                    'platform.openai.com › Organization › Admin keys.'
                : errorOpenAi(err, '/gpt -usage'));
        }
    } else {
        partsAlt.push('💡 _Para ver o consumo, defina a chave de admin: OPENAI_ADMIN_KEY no config/.env ou /set openai.admin.key <chave>_');
    }

    if (withKey) {
        try {
            partsAlt.push(limitsText(await queryLimits({ cmd: '/gpt' })));
        } catch (err) {
            partsAlt.push(errorOpenAi(err, '/gpt -usage'));
        }
    }

    await msg.reply(partsAlt.join('\n\n'));
}

async function cmdGpt({ msg, args, opts, quotedMsg }) {
    if (opts?.given.has('usage')) {
        await showUsage(msg, opts.opt.usage);
        return;
    }

    if (opts?.given.has('model')) {
        await swapModel(msg, opts.opt.model);
        return;
    }

    if (!keyOpenAi()) {
        await msg.reply(WITHOUT_KEY('/gpt'));
        return;
    }

    // -voz: the text becomes a voice note
    if (opts?.given.has('voz')) {
        await talkText(msg, args, quotedMsg);
        return;
    }

    // Replying to an audio: the transcription (and, with a question, the chat on top of it)
    const audio = await replyAudio(quotedMsg);
    if (audio) {
        await replyOnAudio(msg, audio, args);
        return;
    }

    // Replying to a message, its text (or the photo caption) goes before the question
    let question = [quotedMsg?.body, args].filter(Boolean).join('\n\n').trim();

    // Replying to a photo, it goes along with the question (without a question, /gpt describes the photo)
    const photo = await replyImage(quotedMsg);
    if (photo?.erro) {
        await msg.reply(photo.erro);
        return;
    }
    if (photo && !question) question = PHOTO_QUESTION;

    if (!question) {
        await msg.reply('```' + getCommandSyntax('/gpt') + '```');
        return;
    }

    try {
        const reply = await askOnChat({
            cmd: '/gpt', sistema: GPT_INSTRUCTIONS, texto: question, imagem: photo?.imagem
        });

        // The 🤖 in front also guarantees the reply never starts with "/" (see markSentByBot)
        await msg.reply(`🤖 ${reply}`);
    } catch (err) {
        await msg.reply(errorOpenAi(err, '/gpt'));
    }
}

module.exports = {
    cmdGpt
};
