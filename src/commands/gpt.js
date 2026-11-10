/*
 * Comando /gpt.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const sharp = require('sharp');
const { MessageMedia } = require('whatsapp-web.js');

const { completeNotice } = require('../client');
const { getCommandSyntax } = require('./base');
const { BIN_FFMPEG, TMP_DIR } = require('../constants');
const { OPENAI_MODELS } = require('../openai');
const {
    WITHOUT_KEY, keyAdminOpenAi, keyOpenAi, queryConsumption, queryLimits, errorOpenAi, generateImage,
    listModels, askOnChat, synthesizeVoice, transcribeAudio, VOICE_MAX_CHARACTERS
} = require('../openaiChat');
const { envOuSetting, getSetting, setSetting } = require('../settings');
const { runCommand } = require('../util/processes');
const { fmtInA } = require('../util/format');

/*
 * /gpt: asks ChatGPT (the call and the errors live in openaiChat.js).
 */
const GPT_INSTRUCTIONS = 'Você é um assistente no WhatsApp. Responda de forma direta, em português, salvo se pedirem outro idioma.';

/*
 * /gpt -m: the models per use and the swap for each one. Without a model, lists (with -gif, -audio or -voz, only
 * that use); with a model, saves that of the requested use: without an option, the questions'; with -img/-gif, the image's;
 * with -audio, the transcription's; with -voz, the voice's. The list is the key's (GET /v1/models), with the fixed one of the
 * fallback code when the key does not respond.
 */
const MODEL_USES = [
    {
        nome: 'Padrão', detalhe: 'perguntas', opcoes: [], setting: 'openai.api.model',
        exemplo: '/gpt -m <modelo>', daConta: (id) => OPENAI_MODELS.includes(id), reserva: OPENAI_MODELS
    },
    {
        nome: '-img, -gif', detalhe: 'imagens e GIF', opcoes: ['img', 'gif'], setting: 'openai.image.model',
        exemplo: '/gpt -m <modelo> -gif', daConta: (id) => /image|dall-e/i.test(id)
    },
    {
        nome: '-audio', detalhe: 'transcrição de áudio', opcoes: ['audio'], setting: 'openai.transcribe.model',
        exemplo: '/gpt -m <modelo> -audio', daConta: (id) => /transcribe|whisper/i.test(id)
    },
    {
        nome: '-voz', detalhe: 'voz', opcoes: ['voz'], setting: 'openai.tts.model',
        exemplo: '/gpt -m <modelo> -voz', daConta: (id) => /tts/i.test(id)
    }
];

// The usage that -m asks for: the one of the options that came along (the 1st that matches) or the default
const usageRequest = (opts) => MODEL_USES.find(u => u.opcoes.some(o => opts?.given.has(o))) ?? null;

// The key's models, or null (no key or no response)
async function accountModels() {
    if (!keyOpenAi()) return null;
    try {
        return await listModels({ cmd: '/gpt' });
    } catch {
        return null;
    }
}

// The model in use: the .env's (only the default) or the setting
const modelCurrent = (usage) => (usage.setting === 'openai.api.model'
    ? envOuSetting('OPENAI_MODEL', 'openai.api.model')
    : getSetting(usage.setting));

async function swapModel(msg, modelAlt, opts) {
    const doEnv = process.env.OPENAI_MODEL?.trim();
    const request = usageRequest(opts);
    const ids = await accountModels();

    if (!modelAlt) {
        const uses = request ? [request] : MODEL_USES;
        const blocks = uses.map(usage => {
            const current = modelCurrent(usage);
            const usageAlt = ids ? ids.filter(usage.daConta) : (usage.reserva ?? []);
            const list = [...new Set([current, ...(usageAlt.length ? usageAlt : (usage.reserva ?? []))])];
            const linesAlt = list.map(m => `${m === current ? '✅' : '▫️'} ${m}${ids && !ids.includes(m) ? ' ⚠️ a sua chave não vê' : ''}`);
            const origin = usage.setting === 'openai.api.model' && doEnv ? ' _(o atual vem do OPENAI_MODEL no .env)_' : '';
            return `*${usage.nome}* (${usage.detalhe}) — ${usage.exemplo}${origin}\n${linesAlt.join('\n')}`;
        });
        await msg.reply(`🤖 *Modelos do /gpt*\n\n${blocks.join('\n\n')}\n\n` + (ids
            ? '💡 _A lista é a da sua chave (GET /v1/models)._'
            : '💡 _Sem a lista da sua chave (sem chave ou sem resposta da OpenAI): só os padrões._'));
        return;
    }

    // A model the key cannot see is pointless to save (the image, audio and voice ones are free, with no fixed list)
    if (request && ids && !ids.includes(modelAlt)) {
        const candidates = ids.filter(request.daConta);
        await msg.reply(`❌ A sua chave não vê o modelo ${modelAlt} (${request.detalhe}).` +
            (candidates.length ? `\n💡 _Os que ela vê: ${candidates.join(', ')}_` : ''));
        return;
    }

    const setting = request?.setting ?? 'openai.api.model';
    try {
        await setSetting(setting, modelAlt);
    } catch (e) {
        await msg.reply(`❌ Modelo ${e.message}`);
        return;
    }

    if (request) {
        await msg.reply(`✅ Modelo de ${request.detalhe} do /gpt: *${getSetting(setting)}*`);
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
 * As in /get: the "⏳ Processando…" goes out before the call and becomes the reply (WhatsApp edits the message).
 * Media cannot be edited: on it the notice is deleted when the media goes out.
 */
const notifyProcessing = (msg) => msg.reply('⏳ Processando o /gpt, aguarde.', null, { linkPreview: false });

async function deleteNotice(notice) {
    try {
        await notice?.delete?.(true);
    } catch { /* the notice stays: it does not get in the way of the reply */ }
}

/*
 * Replying to an audio: transcribes (v1/audio/transcriptions). Without a question, or just "transcreva", replies the
 * transcription; with another question ("resuma", "traduza para o inglês"), sends the transcription along to the chat.
 */
async function replyOnAudio(msg, { audio, erro: errorAlt }, args) {
    if (errorAlt) {
        await msg.reply(errorAlt);
        return;
    }

    const notice = await notifyProcessing(msg);
    let transcribing = true;
    try {
        const transcription = await transcribeAudio({ cmd: '/gpt', audio });
        transcribing = false;
        if (!transcription) {
            await completeNotice(msg, notice, '🤖 Não ouvi fala nenhuma nesse áudio.');
            return;
        }
        if (soTranscribe(args)) {
            await completeNotice(msg, notice, `🤖 *Transcrição:*\n${transcription}`);
            return;
        }

        const reply = await askOnChat({
            cmd: '/gpt', sistema: GPT_INSTRUCTIONS, texto: `${args.trim()}\n\nTranscrição do áudio:\n${transcription}`
        });
        await completeNotice(msg, notice, `🤖 ${reply}`);
    } catch (err) {
        await completeNotice(msg, notice, (transcribing && await modelError(err, AUDIO_MODEL)) || errorOpenAi(err, '/gpt'));
    }
}

// For the model error: the setting, the account's model list filter and the resource name
const AUDIO_MODEL = { setting: 'openai.transcribe.model', tipo: /whisper|transcribe|audio/i, nome: 'transcrição' };
const VOICE_MODEL = { setting: 'openai.tts.model', tipo: /tts|speech|audio/i, nome: 'voz' };
const IMAGE_MODEL = { setting: 'openai.image.model', tipo: /image|dall/i, nome: 'imagem' };

/*
 * "The model 'x' does not exist": the setting points to a model the account does not have. Instead of the raw error,
 * lists the ones the key sees (GET /v1/models) similar to the requested type and says how to swap.
 * @param {object} err
 * @param {{ setting: string, tipo: RegExp, nome: string }} o  the model setting, the list filter and the resource name
 */
async function modelError(err, { setting, tipo: type, nome: nameAlt }) {
    const messageAlt = err.response?.data?.error?.message ?? '';
    if (!/does not exist|model_not_found|not found/i.test(`${messageAlt} ${err.response?.data?.error?.code ?? ''}`)
        || !/model/i.test(messageAlt)) {
        return null;
    }

    const modelAlt = getSetting(setting);
    let candidates = [];
    try {
        candidates = (await listModels({ cmd: '/gpt' })).filter(id => type.test(id));
    } catch { /* without the list, only the warning */ }

    return `❌ O modelo ${modelAlt} não existe na sua conta da OpenAI (${nameAlt}).\n` +
        (candidates.length ? `💡 _A sua chave vê: ${candidates.join(', ')}_\n` : '💡 _Não achei na lista da sua chave nenhum modelo parecido._\n') +
        `💡 _Troque com /set ${setting} <modelo>_`;
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

    const notice = await notifyProcessing(msg);
    try {
        const voice = await synthesizeVoice({ cmd: '/gpt', texto: textAlt });
        await msg.reply(new MessageMedia('audio/ogg; codecs=opus', voice.toString('base64'), 'voz.ogg'), null, { sendAudioAsVoice: true });
        await deleteNotice(notice);
    } catch (err) {
        await completeNotice(msg, notice, (await modelError(err, VOICE_MODEL)) || errorOpenAi(err, '/gpt'));
    }
}

/*
 * /gpt -img [request] and /gpt -gif [request]: create an image and an animated GIF (both through the images API,
 * v1/images; the GIF is the output_format gif of the gpt-image-2.6-* models). Replying to a photo, it is the base:
 * the edit. Both cost money, so they are owner and admins only.
 */

// "gere um gif animado de ...", "faça uma animação...": the GIF request without -gif (only when replying to a photo)
const ASKED_GIF = /\b(gif|anima[çc][ãa]o|animad[oa]|v[ií]deo)\b/i;
const CREATE_VERB = /\b(ger[ae]r?|cri[ae]r?|fa[çc]a|fazer|faz|anim[ae]r?|transform\w*)\b/i;
const asksGif = (textAlt) => ASKED_GIF.test(textAlt) && CREATE_VERB.test(textAlt);

const isPhoto = (quotedMsg) => Boolean(quotedMsg?.hasMedia) && ['image', 'sticker'].includes(quotedMsg.type);

// The request text without the option (-img, -gif)
const withoutOption = (args, names) => args.replace(new RegExp(`(^|\\s)-(?:${names})(?=\\s|$)`), '').trim();

// The message for whoever is neither owner nor admin
const SO_OWNER_GENERATE = (o) => `⛔ Apenas o dono do bot (ou um admin) pode ${o}.`;

// The replied photo as PNG (the OpenAI edit asks for png, jpeg or webp; gif and sticker become png)
const photoInPng = async (photo) => sharp(Buffer.from(photo.imagem.data, 'base64')).png().toBuffer();

async function createImage(msg, args, quotedMsg) {
    const request = withoutOption(args, 'img');
    const photo = await replyImage(quotedMsg);
    if (photo?.erro) {
        await msg.reply(photo.erro);
        return;
    }
    if (!request) {
        await msg.reply('❌ Use: /gpt -img <o que criar> (respondendo uma foto, ela é editada)');
        return;
    }

    const notice = await notifyProcessing(msg);
    try {
        const b64 = await generateImage({ cmd: '/gpt', prompt: request, imagem: photo ? await photoInPng(photo) : null });
        await msg.reply(new MessageMedia('image/png', b64, 'imagem.png'));
        await deleteNotice(notice);
    } catch (err) {
        await completeNotice(msg, notice, (await modelError(err, IMAGE_MODEL)) || errorOpenAi(err, '/gpt'));
    }
}

// OpenAI's GIF becomes an MP4 with no audio: that is how WhatsApp plays a GIF (as /giphy sends it)
async function gifParaMp4(gif) {
    const folder = path.join(TMP_DIR, `gif-${crypto.randomBytes(6).toString('hex')}`);
    fs.mkdirSync(folder, { recursive: true });

    try {
        const inputAlt = path.join(folder, 'entrada.gif');
        const outputAlt = path.join(folder, 'saida.mp4');
        fs.writeFileSync(inputAlt, gif);
        await runCommand(BIN_FFMPEG, [
            '-y', '-loglevel', 'error', '-i', inputAlt,
            '-movflags', 'faststart', '-pix_fmt', 'yuv420p',
            '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-an',
            outputAlt
        ], 'ignore', 60_000);
        return fs.readFileSync(outputAlt);
    } finally {
        fs.rmSync(folder, { recursive: true, force: true });
    }
}

async function createGif(msg, args, quotedMsg) {
    const request = withoutOption(args, 'gif');
    const photo = await replyImage(quotedMsg);
    if (photo?.erro) {
        await msg.reply(photo.erro);
        return;
    }
    if (!request && !photo) {
        await msg.reply('❌ Use: /gpt -gif <o que animar> (respondendo uma foto, ela é animada)');
        return;
    }

    const notice = await notifyProcessing(msg);
    try {
        const b64 = await generateImage({
            cmd: '/gpt',
            prompt: photo ? `Anime esta imagem em um GIF. ${request || 'Com um movimento sutil e natural.'}` : request,
            imagem: photo ? await photoInPng(photo) : null,
            gif: { frames: getSetting('openai.gif.frames'), frameMs: getSetting('openai.gif.frameMs') }
        });
        const mp4 = await gifParaMp4(Buffer.from(b64, 'base64'));
        await msg.reply(new MessageMedia('video/mp4', mp4.toString('base64'), 'gif.mp4'), null, { sendVideoAsGif: true });
        await deleteNotice(notice);
    } catch (err) {
        const messageAlt = err.response?.data?.error?.message ?? '';
        await completeNotice(msg, notice, await modelError(err, IMAGE_MODEL) ||
            (/gif|preview/i.test(messageAlt)
                ? `🔒 A sua conta/modelo não faz GIF animado: ${messageAlt}\n💡 _Só os gpt-image-2.6-* fazem GIF, e pedem acesso à prévia. Troque com /set openai.image.model <modelo>_`
                : errorOpenAi(err, '/gpt')));
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

async function cmdGpt({ msg, args, opts, quotedMsg, admin }) {
    if (opts?.given.has('usage')) {
        await showUsage(msg, opts.opt.usage);
        return;
    }

    if (opts?.given.has('model')) {
        await swapModel(msg, opts.opt.model, opts);
        return;
    }

    if (!keyOpenAi()) {
        await msg.reply(WITHOUT_KEY('/gpt'));
        return;
    }

    // -img: creates (or, replying to a photo, edits) an image; -gif: a GIF (replying to a photo, animates it).
    // Without -gif, "gere um gif animado..." replying to a photo also works (and is also owner and admins only).
    if (opts?.given.has('img')) {
        await createImage(msg, args, quotedMsg);
        return;
    }
    if (opts?.given.has('gif') || (isPhoto(quotedMsg) && asksGif(args))) {
        if (!admin) {
            await msg.reply(SO_OWNER_GENERATE('gerar GIF'));
            return;
        }
        await createGif(msg, args, quotedMsg);
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

    const notice = await notifyProcessing(msg);
    try {
        const reply = await askOnChat({
            cmd: '/gpt', sistema: GPT_INSTRUCTIONS, texto: question, imagem: photo?.imagem
        });

        // The 🤖 in front also guarantees the reply never starts with "/" (see markSentByBot)
        await completeNotice(msg, notice, `🤖 ${reply}`);
    } catch (err) {
        await completeNotice(msg, notice, errorOpenAi(err, '/gpt'));
    }
}

module.exports = {
    cmdGpt
};
