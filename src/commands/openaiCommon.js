/*
 * What the OpenAI commands (/gpt, /draw) share: the "Processando" notice, the status footer of the
 * media, the model error for a model the account does not have, the per-use model swap (-m) and the reference photo.
 * The API calls and errors live in openaiChat.js.
 */

const sharp = require('sharp');

const { t } = require('../i18n');
const { OPENAI_MODELS } = require('../openai');
const { keyOpenAi, listModels, consumptionFooter } = require('../openaiChat');
const { envOuSetting, getSetting, setSetting } = require('../settings');

/*
 * As in /get: the "⏳ Processando…" goes out before the call and becomes the reply (WhatsApp edits the message).
 * Media cannot be edited: on it the notice becomes "generated below" (completeNotice) and the media goes out afterward.
 */
const notifyProcessing = (msg, cmd) => msg.reply(t('openai.processing', { cmd }), null, { linkPreview: false });

// Media (voice, image, GIF) has no footer: with the status on, the usage goes in a separate message
async function replyConsumption(msg) {
    const footer = (await consumptionFooter()).trim();
    if (footer) await msg.reply(footer);
}

// The message for whoever is neither owner nor admin
const SO_OWNER_GENERATE = (action) => t('openai.ownerOnly', { action });

// The request text without the options (-img, -gif; every one of them, so "-q -local text" leaves only the text)
const withoutOption = (args, names) => args.replace(new RegExp(`(^|\\s)-(?:${names})(?=\\s|$)`, 'g'), ' ').replace(/ {2,}/g, ' ').trim();

/*
 * For the model error and for -m: the model setting, the account's model list filter and the
 * recurso.
 */
const AUDIO_MODEL = { setting: 'gpt.transcribe.model', type: /whisper|transcribe|audio/i, get name() { return t('openai.kindAudio'); } };
const VOICE_MODEL = { setting: 'gpt.tts.model', type: /tts|speech|audio/i, get name() { return t('openai.kindVoice'); } };
const IMAGE_MODEL = { setting: 'gpt.image.model', type: /image|dall/i, get name() { return t('openai.kindImage'); } };
const GIF_MODEL = { setting: 'gpt.image.gifModel', type: /image/i, get name() { return t('openai.kindGif'); } };

/*
 * "The model 'x' does not exist": the setting points to a model the account does not have. Instead of the raw error,
 * lists the ones the key sees (GET /v1/models) similar to the requested type and says how to swap.
 * @param {object} err
 * @param {{ setting: string, type: RegExp, name: string }} o  the model setting, the list filter and the resource name
 * @param {string} cmd  the command that called (for the log)
 * @returns {Promise<string | null>}  null: the error is not a model one
 */
async function modelError(err, { setting, type, name: nameAlt }, cmd) {
    const messageAlt = err.response?.data?.error?.message ?? '';
    if (!/does not exist|model_not_found|not found/i.test(`${messageAlt} ${err.response?.data?.error?.code ?? ''}`)
        || !/model/i.test(messageAlt)) {
        return null;
    }

    const modelAlt = getSetting(setting);
    let candidates = [];
    try {
        candidates = (await listModels({ cmd })).filter(id => type.test(id));
    } catch { /* without the list, only the warning */ }

    return t('openai.modelMissing', { model: modelAlt, name: nameAlt }) +
        (candidates.length ? t('openai.modelCandidates', { list: candidates.join(', ') }) : t('openai.modelNoCandidates')) +
        t('openai.modelSwitch', { setting });
}

/*
 * -m: the models per use and the swap for each one. Each command lists its uses (/gpt, all; /draw,
 * the image and the GIF) and says how to swap it with your name. The list is the key's (GET /v1/models), with the fixed one of the
 * fallback code when the key does not respond.
 */
const QUESTION_USAGE = {
    get name() { return t('openai.useDefault'); }, get detail() { return t('openai.detailQuestions'); }, options: [], setting: 'gpt.api.model',
    example: (cmd) => `${cmd} -m <modelo>`, ofAccount: (id) => OPENAI_MODELS.includes(id), reserve: OPENAI_MODELS
};
const IMAGE_USAGE = {
    name: '-img', get detail() { return t('openai.detailImages'); }, options: ['img'], setting: 'gpt.image.model',
    example: (cmd) => (cmd === '/gpt' ? '/gpt -m <modelo> -img' : `${cmd} -m <modelo>`), ofAccount: (id) => /image|dall-e/i.test(id)
};
const GIF_USAGE = {
    name: '-gif', get detail() { return t('openai.detailGif'); }, options: ['gif', 'frames', 'ms'], setting: 'gpt.image.gifModel',
    example: (cmd) => (cmd === '/gpt' ? '/gpt -m <modelo> -gif' : `${cmd} -gif -m <modelo>`), ofAccount: (id) => /image/i.test(id)
};
const AUDIO_USAGE = {
    name: '-audio', get detail() { return t('openai.detailAudio'); }, options: ['audio'], setting: 'gpt.transcribe.model',
    example: (cmd) => `${cmd} -m <modelo> -audio`, ofAccount: (id) => /stt|whisper/i.test(id)
};
const VOICE_USAGE = {
    name: '-voice', get detail() { return t('openai.detailVoice'); }, options: ['voice'], setting: 'gpt.tts.model',
    example: (cmd) => `${cmd} -m <modelo> -v`, ofAccount: (id) => /tts/i.test(id)
};

const GPT_USES = [QUESTION_USAGE, IMAGE_USAGE, GIF_USAGE, AUDIO_USAGE, VOICE_USAGE];
const DRAW_USES = [IMAGE_USAGE, GIF_USAGE];

// The key's models, or null (no key or no response)
async function accountModels(cmd) {
    if (!keyOpenAi()) return null;
    try {
        return await listModels({ cmd });
    } catch {
        return null;
    }
}

// The model in use: the .env's (only for the questions) or the setting
const modelCurrent = (usage) => (usage.setting === 'gpt.api.model'
    ? envOuSetting('OPENAI_MODEL', 'gpt.api.model')
    : getSetting(usage.setting));

/**
 * @param {object} msg
 * @param {string} [model]  empty: lists the models
 * @param {{ given: Set<string> }} opts  the command options (the one that matches a use picks the use)
 * @param {object} o
 * @param {string} o.cmd      o command ("/gpt", "/draw")
 * @param {string} o.icon    the emoji of the list title
 * @param {object[]} o.uses   the uses the command has
 * @param {object} o.fallback   the use of -m without another option
 */
async function swapModel(msg, modelAlt, opts, { cmd, icon: iconAlt, uses, fallback: defaults }) {
    const doEnv = process.env.OPENAI_MODEL?.trim();
    const request = uses.find(u => u.options.some(o => opts?.given.has(o))) ?? null;
    const ids = await accountModels(cmd);

    if (!modelAlt) {
        const showAlt = request ? [request] : uses;
        const blocks = showAlt.map(usage => {
            const current = modelCurrent(usage);
            const usageAlt = ids ? ids.filter(usage.ofAccount) : (usage.reserve ?? []);
            const list = [...new Set([current, ...(usageAlt.length ? usageAlt : (usage.reserve ?? []))])];
            const linesAlt = list.map(m => `${m === current ? '✅' : '▫️'} ${m}${ids && !ids.includes(m) ? t('openai.keyCantSeeTag') : ''}`);
            const origin = usage.setting === 'gpt.api.model' && doEnv ? t('openai.envOrigin') : '';
            return t('openai.modelBlock', { name: usage.name, detail: usage.detail, example: usage.example(cmd), origin, lines: linesAlt.join('\n') });
        });
        await msg.reply(`${t('openai.modelsTitle', { icon: iconAlt, cmd })}\n\n${blocks.join('\n\n')}\n\n` + (ids
            ? t('openai.listFromKey')
            : t('openai.listDefaults')));
        return;
    }

    // A model the key cannot see is pointless to save (the image, audio and voice ones are free, with no fixed list)
    const usage = request ?? defaults;
    if (usage.setting !== 'gpt.api.model' && ids && !ids.includes(modelAlt)) {
        const candidates = ids.filter(usage.ofAccount);
        await msg.reply(t('openai.keyCantSee', { model: modelAlt, detail: usage.detail }) +
            (candidates.length ? t('openai.keySees', { list: candidates.join(', ') }) : ''));
        return;
    }

    try {
        await setSetting(usage.setting, modelAlt);
    } catch (e) {
        await msg.reply(t('openai.modelError', { error: e.message }));
        return;
    }

    if (request) {
        await msg.reply(t('openai.modelSetFor', { detail: request.detail, cmd, model: getSetting(usage.setting) }));
        return;
    }
    await msg.reply(t('openai.modelSet', { cmd, model: getSetting(usage.setting) }) +
        (doEnv && usage.setting === 'gpt.api.model'
            ? t('openai.envPriority', { env: doEnv })
            : ''));
}

// The photo: only those OpenAI reads, and up to a size that does not blow the request
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const PHOTO_MAX_BYTES = 15 * 1024 * 1024;

const isPhoto = (m) => Boolean(m?.hasMedia) && ['image', 'sticker'].includes(m.type);

/**
 * A message's image (photo or sticker), downloaded as base64.
 * @param {object} m    the replied message or the message itself (the photo with the caption "/draw ...")
 * @param {string} cmd  the command, for the size notice
 * @returns {Promise<null | { image: { mimetype: string, data: string } } | { error: string }>}
 * null: the message is not an image
 */
async function messageImage(m, cmd) {
    if (!isPhoto(m)) return null;

    const mediaAlt = await m.downloadMedia().catch(() => null);
    if (!mediaAlt?.data) return { error: t('openai.photoDownload') };
    if (!PHOTO_TYPES.includes(mediaAlt.mimetype)) {
        return { error: t('openai.photoType', { type: mediaAlt.mimetype, types: PHOTO_TYPES.map(x => x.split('/')[1]).join(', ') }) };
    }
    if (mediaAlt.data.length * 0.75 > PHOTO_MAX_BYTES) {
        return { error: t('openai.photoSize', { mb: PHOTO_MAX_BYTES / 1024 / 1024, cmd }) };
    }
    return { image: { mimetype: mediaAlt.mimetype, data: mediaAlt.data } };
}

// The photo as PNG (the OpenAI edit asks for png, jpeg or webp; gif and sticker become png)
const photoInPng = async (photo) => sharp(Buffer.from(photo.image.data, 'base64')).png().toBuffer();

module.exports = {
    AUDIO_MODEL,
    GIF_MODEL,
    IMAGE_MODEL,
    VOICE_MODEL,
    SO_OWNER_GENERATE,
    DRAW_USES,
    GPT_USES,
    IMAGE_USAGE,
    QUESTION_USAGE,
    notifyProcessing,
    isPhoto,
    modelError,
    photoInPng,
    messageImage,
    replyConsumption,
    withoutOption,
    swapModel
};
