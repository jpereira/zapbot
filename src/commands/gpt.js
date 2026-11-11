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
    WITHOUT_KEY, keyAdminOpenAi, keyOpenAi, queryConsumption, queryCosts, queryLimits, queryServices, errorOpenAi, generateImage,
    listModels, askOnChat, synthesizeVoice, transcribeAudio, VOICE_MAX_CHARACTERS
} = require('../openaiChat');
const { envOuSetting, getSetting, setSetting } = require('../settings');
const { captureOutput, runCommand } = require('../util/processes');
const { fmtInA } = require('../util/format');

/*
 * /gpt: asks ChatGPT (the call and the errors live in openaiChat.js).
 */
const GPT_INSTRUCTIONS = 'Você é um assistente no WhatsApp. Responda de forma direta, em português, salvo se pedirem outro idioma. ' +
    'Formate para o WhatsApp, que não é Markdown: *negrito* com um asterisco só, _itálico_, ~tachado~, ' +
    'listas com "- " ou "1. ", código entre crases (``` para blocos). Não use títulos com #, tabelas, ' +
    'linhas "---" nem **dois asteriscos**.';

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

/*
 * The replied document: plain text (txt, md, csv, json, code...) and PDF (through pdftotext). The content
 * goes to the chat as text, after the question. Other formats (docx, xlsx...) are not read.
 */
const DOC_MAX_BYTES = 10 * 1024 * 1024;
const DOC_MAX_CHARACTERS = 60000;
const TEXT_DOC_TYPES = /^(text\/|application\/(json|xml|x-yaml|yaml|javascript|x-sh|sql|csv))/i;
const TEXT_DOC_EXTENSIONS = /\.(txt|md|csv|tsv|json|xml|ya?ml|log|ini|conf|sh|js|ts|py|rb|go|rs|c|h|cpp|java|sql|html?|css)$/i;

/**
 * @returns {Promise<null | { documento: { nome: string, texto: string } } | { erro: string }>}
 * null: the replied message is not a document
 */
async function replyDocument(quotedMsg) {
    if (!quotedMsg?.hasMedia || quotedMsg.type !== 'document') return null;

    const mediaAlt = await quotedMsg.downloadMedia().catch(() => null);
    if (!mediaAlt?.data) return { erro: '❌ Não consegui baixar o documento (ele pode ter expirado no WhatsApp).' };
    if (mediaAlt.data.length * 0.75 > DOC_MAX_BYTES) {
        return { erro: `❌ O documento tem mais de ${DOC_MAX_BYTES / 1024 / 1024} MB: é grande demais para o /gpt.` };
    }

    const nameAlt = mediaAlt.filename || 'documento';
    const type = String(mediaAlt.mimetype).split(';')[0].trim().toLowerCase();
    const bytes = Buffer.from(mediaAlt.data, 'base64');
    let textAlt;

    if (type === 'application/pdf' || /\.pdf$/i.test(nameAlt)) {
        const folder = path.join(TMP_DIR, `doc-${crypto.randomBytes(6).toString('hex')}`);
        fs.mkdirSync(folder, { recursive: true });
        try {
            const fileAlt = path.join(folder, 'doc.pdf');
            fs.writeFileSync(fileAlt, bytes);
            textAlt = await captureOutput('pdftotext', ['-layout', fileAlt, '-'], 60_000);
        } catch {
            return { erro: '❌ Não consegui ler o PDF (o pdftotext, do poppler-utils, precisa estar instalado).' };
        } finally {
            fs.rmSync(folder, { recursive: true, force: true });
        }
    } else if (TEXT_DOC_TYPES.test(type) || TEXT_DOC_EXTENSIONS.test(nameAlt)) {
        textAlt = bytes.toString('utf8');
    } else {
        return { erro: `❌ O /gpt lê documento de texto e PDF, não ${type || nameAlt}.` };
    }

    textAlt = textAlt.trim();
    if (!textAlt) return { erro: '❌ Não achei texto nesse documento (um PDF escaneado, talvez).' };
    return { documento: { nome: nameAlt, texto: textAlt.slice(0, DOC_MAX_CHARACTERS) } };
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

// Dollars in pt-BR: cents, or 4 decimals when it is less than 1 cent ($0,0012)
const usd = (v) => `$${v.toLocaleString('pt-BR', v === 0 || v >= 0.01
    ? { minimumFractionDigits: 2, maximumFractionDigits: 2 }
    : { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;

const sumCosts = (buckets) => buckets.reduce((t, b) => t + (b.results ?? []).reduce((s, r) => s + Number(r.amount?.value ?? 0), 0), 0);
const dateShort = (start) => new Date(start * 1000).toISOString().slice(5, 10).split('-').reverse().join('/');

// The usage of images, voice, transcription and embeddings (whatever did not come or is zero does not show)
function servicesLines(services) {
    const sumAlt = (buckets, campo) => (buckets ?? []).reduce((t, b) => t + (b.results ?? []).reduce((s, r) => s + (r[campo] ?? 0), 0), 0);
    const defs = [
        ['images', '🖼️ Imagens', 'images', 'imagens'],
        ['audio_speeches', '🔊 Voz', 'characters', 'caracteres'],
        ['audio_transcriptions', '🎙️ Transcrição', 'seconds', 's de áudio'],
        ['embeddings', '🧬 Embeddings', 'input_tokens', 'tokens']
    ];
    return defs.flatMap(([nameAlt, label, campo, unit]) => {
        const req = sumAlt(services?.[nameAlt], 'num_model_requests');
        return req ? [`• ${label} · ${fmtInA(sumAlt(services[nameAlt], campo))} ${unit} · ${fmtInA(req)} req`] : [];
    });
}

/*
 * The Usage API buckets (+ the costs and the other uses) → the chat text: the money, the total, per day,
 * per model, per service. The costs and services are extras: without them, only the tokens.
 */
function consumptionText(buckets, daysAlt, { custos: costs = null, servicos: services = null } = {}) {
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

    // The period's costs (the item is "model, input"; the prefix is the model) per day and per model
    const period = costs ?? [];
    const costDay = new Map();
    const costItem = new Map();
    for (const b of period) {
        for (const r of b.results ?? []) {
            const v = Number(r.amount?.value ?? 0);
            costDay.set(b.start_time, (costDay.get(b.start_time) ?? 0) + v);
            const item = String(r.line_item ?? '(outros)').split(', ')[0];
            costItem.set(item, (costItem.get(item) ?? 0) + v);
        }
    }
    const withCost = costs !== null;
    const cost = (v) => (withCost ? ` · ${usd(v ?? 0)}` : '');

    const linesAlt = [`📊 *Consumo da OpenAI* — ${daysAlt === 1 ? 'hoje' : `últimos ${daysAlt} dias`}`];
    if (withCost) linesAlt.push(`💵 Gasto: *${usd(sumCosts(period))}*`);
    linesAlt.push(
        `🔢 ${fmtInA(tokens(total))} tokens · entrada ${fmtInA(total.entrada)} (cache ${fmtInA(total.cache)}) · saída ${fmtInA(total.saida)}`,
        `🔁 ${fmtInA(total.requisicoes)} requisições`
    );

    if (byDay.size) {
        linesAlt.push('', '📅 *Por dia* _(UTC)_');
        for (const [day, t] of [...byDay].sort((a, b) => a[0] - b[0])) {
            linesAlt.push(`• ${dateShort(day)} · ${summary(t)}${cost(costDay.get(day))}`);
        }
    }
    if (byModel.size) {
        linesAlt.push('', '🧠 *Por modelo*');
        for (const [modelAlt, t] of [...byModel].sort((a, b) => tokens(b[1]) - tokens(a[1])).slice(0, 8)) {
            linesAlt.push(`• ${modelAlt} · ${summary(t)}${cost(costItem.get(modelAlt))}`);
        }
    }

    // What was spent that is not chat (image, voice, transcription...): the cost items without a chat model
    const other = [...costItem].filter(([item, v]) => !byModel.has(item) && v > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const extras = servicesLines(services);
    if (other.length) {
        linesAlt.push('', '🧾 *Outros custos*', ...other.map(([item, v]) => `• ${item} · ${usd(v)}`));
    }
    if (extras.length) linesAlt.push('', '🧰 *Outros usos*', ...extras);

    if (!byDay.size && !byModel.size && !extras.length) linesAlt.push('', 'ℹ️ Nenhum uso nesse período.');
    return linesAlt.join('\n');
}

/*
 * The balance in dollars: $used/$total. The API does not report the balance, so the total is openai.credit.total
 * (what was bought) and the used one is the spend since openai.credit.since (without it, the last 180 days).
 */
function balanceText(used, total, since) {
    const remains = total - used;
    return `💰 *Créditos:* ${usd(used)}/${usd(total)} · ${remains >= 0 ? `restam *${usd(remains)}*` : `*${usd(-remains)} acima do total*`}` +
        ` _(gasto ${since ? `desde ${since.split('-').reverse().join('/')}` : 'nos últimos 180 dias'})_`;
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
            const total = getSetting('openai.credit.total');
            const sinceData = getSetting('openai.credit.since');
            const nowAlt = Math.floor(Date.now() / 1000);
            const startBalance = sinceData ? Math.floor(Date.parse(sinceData) / 1000) : nowAlt - 180 * 86400;

            // The usage is required (its error is the key's); the cost, the balance and the other uses are extras
            const [consumption, costs, balanceCosts, services] = await Promise.all([
                queryConsumption({ cmd: '/gpt', dias: daysAlt }),
                queryCosts({ cmd: '/gpt', desde: nowAlt - daysAlt * 86400 }).catch(() => null),
                total ? queryCosts({ cmd: '/gpt', desde: startBalance }).catch(() => null) : null,
                queryServices({ cmd: '/gpt', dias: daysAlt })
            ]);

            if (balanceCosts) partsAlt.push(balanceText(sumCosts(balanceCosts), total, sinceData));
            partsAlt.push(consumptionText(consumption.buckets, daysAlt, { custos: costs, servicos: services }));
            if (!total && costs) {
                partsAlt.push('💡 _Para ver $usado/$total: /set openai.credit.total <dólares comprados> e ' +
                    '/set openai.credit.since AAAA-MM-DD (a API da OpenAI não informa o saldo)._');
            }
        } catch (err) {
            const status = err.response?.status;
            const reasonAlt = err.response?.data?.error?.message ?? '';
            const scope = /api\.usage\.read/.test(reasonAlt);
            partsAlt.push(status === 401 || status === 403
                ? '🔑 A chave de admin foi recusada' + (scope ? ': ela não tem o escopo api.usage.read.' : '.') +
                    '\n💡 _A Usage API pede uma Admin key (sk-admin-..., em platform.openai.com › Organization › ' +
                    'Admin keys) ou uma chave com o escopo Usage em Read. Uma chave de projeto (sk-proj-...) comum não serve._'
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

    // Replying to a document: its content goes along with the question
    const doc = await replyDocument(quotedMsg);
    if (doc?.erro) {
        await msg.reply(doc.erro);
        return;
    }

    // Replying to a message, its text (or the photo caption, or the document) goes before the question
    const replied = doc
        ? `Documento "${doc.documento.nome}":\n${doc.documento.texto}`
        : String(quotedMsg?.body ?? '').trim();
    let question = [replied, args.trim()].filter(Boolean).join('\n\n');

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
