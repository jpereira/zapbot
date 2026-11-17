/*
 * /draw: draws an image with GPT Image (OpenAI); with -gif, an animated GIF. On a photo (the one from the
 * message, in the caption, or the replied one), edits the photo or animates it. /gpt -img and /gpt -gif use the same
 * desenhar(), so both commands behave the same.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { MessageMedia } = require('whatsapp-web.js');

const { completeNotice } = require('../client');
const { commandUsage } = require('./base');
const { BIN_FFMPEG, TMP_DIR } = require('../constants');
const { t } = require('../i18n');
const { unescape } = require('../util/format');
const { printError } = require('../log');
const { imagesContext, textReadProfile, readProfileImplicit, resolverProfiles } = require('./profileInAi');
const { WITHOUT_KEY, keyOpenAi, errorOpenAi, generateImage, measureConsumption } = require('../openaiChat');
const { SETTINGS_SCHEMA, getSetting } = require('../settings');
const { runCommand } = require('../util/processes');
const {
    GIF_MODEL, IMAGE_MODEL, DRAW_USES, IMAGE_USAGE, notifyProcessing, modelError,
    photoInPng, messageImage, replyConsumption, swapModel
} = require('./openaiCommon');

// The caption carries the request, cut if long
const CAPTION_MAX = 200;

// The -frames and -ms limits are those of the settings they override
const LIMIT_FRAMES = SETTINGS_SCHEMA['gpt.gif.frames'];
const LIMIT_MS = SETTINGS_SCHEMA['gpt.gif.frameMs'];

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

// The photo that serves as the base: the message's own (caption "/draw -gif ...") or, failing that, the replied one
async function referencePhoto(msg, quotedMsg, cmd) {
    return (await messageImage(msg, cmd)) ?? (await messageImage(quotedMsg, cmd));
}

// The GIF goes as a looping video; if ffmpeg fails, the .gif still arrives, as a document
async function sendGif(msg, b64, captionAlt, cmd) {
    let mp4;
    try {
        mp4 = await gifParaMp4(Buffer.from(b64, 'base64'));
    } catch (err) {
        printError(`${cmd} -gif: ffmpeg falhou:`, err.message);
        await msg.reply(new MessageMedia('image/gif', b64, 'desenho.gif'), null, { caption: captionAlt, sendMediaAsDocument: true });
        return;
    }
    await msg.reply(new MessageMedia('video/mp4', mp4.toString('base64'), 'desenho.mp4'), null, { caption: captionAlt, sendVideoAsGif: true });
}

/**
 * Draws (or, with `gif`, animates) and replies with the media. Without the request, replies `withoutRequest`.
 * @param {object} o
 * @param {object} o.msg
 * @param {string} o.cmd        the command that called ("/draw", "/gpt"): notice, log and errors
 * @param {string} o.pedido     what the user typed, without the options
 * @param {object} [o.quotedMsg]  the replied message: its text goes into the request and its photo is the base
 * @param {{ frames?: number, frameMs?: number } | null} [o.gif]  asks for the GIF (whatever is missing comes from the settings)
 * @param {Array<{ nome: string, imagem: object }>} [o.perfis]  the -p profile photos: they go along with the base photo
 * @param {string} o.withoutRequest  the reply when there is nothing to draw
 */
async function drawAlt({ msg, cmd, pedido: request, quotedMsg = null, gif = null, perfis: profiles = [], semPedido: withoutRequest }) {
    const base = await referencePhoto(msg, quotedMsg, cmd);
    if (base?.erro) {
        await msg.reply(base.erro);
        return;
    }
    // The message photo first and then the profile ones (the context tells the AI which is which)
    const images = [base?.imagem, ...profiles.map(p => p.imagem)].filter(Boolean);
    const photo = images.length ? images : null;

    // Replying to a message, its text (on a photo, the caption) goes before the request
    const textAlt = [quotedMsg?.body, request].filter(Boolean).join('\n\n').trim();
    if (!textAlt && !(gif && photo)) {
        await msg.reply(withoutRequest);
        return;
    }

    const animation = gif && {
        frames: gif.frames ?? getSetting('gpt.gif.frames'),
        frameMs: gif.frameMs ?? getSetting('gpt.gif.frameMs')
    };
    const context = imagesContext({ comFotoDaMensagem: Boolean(base?.imagem), perfis: profiles });
    const withContext = (x) => [x, context].filter(Boolean).join('\n\n');
    const prompt = animation && photo
        ? withContext(t('draw.animatePrompt', { texto: textAlt || t('draw.animateDefault') }))
        : withContext(textAlt);
    const captionAlt = `${animation ? '🎞️' : '🎨'} ${textAlt.length > CAPTION_MAX ? `${textAlt.slice(0, CAPTION_MAX)}…` : textAlt}`.trim();

    const notice = await notifyProcessing(msg, cmd);
    try {
        const b64 = await generateImage({
            cmd, prompt, gif: animation,
            imagens: photo ? await Promise.all(photo.map(image => photoInPng({ imagem: image }))) : []
        });
        // Media does not become an edit of the notice: it says the result comes below (and stays), and the media goes out afterward
        await completeNotice(msg, notice, t(animation ? 'draw.gifBelow' : 'draw.imageBelow'));
        if (animation) await sendGif(msg, b64, captionAlt, cmd);
        else await msg.reply(new MessageMedia('image/png', b64, 'desenho.png'), null, { caption: captionAlt });
        await replyConsumption(msg);
    } catch (err) {
        const messageAlt = err.response?.data?.error?.message ?? '';
        await completeNotice(msg, notice, await modelError(err, animation ? GIF_MODEL : IMAGE_MODEL, cmd) ||
            (animation && /gif|preview/i.test(messageAlt)
                ? t('draw.gifDenied', { mensagem: messageAlt })
                : errorOpenAi(err, cmd)));
    }
}

// -frames/-ms: integer within the limits of the setting that override them; null if absent; throws if invalid
function readInteger(valueAlt, { min, max }, nameAlt) {
    if (valueAlt == null) return null;
    const n = Number(valueAlt);
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(t('draw.intRange', { nome: nameAlt, min, max }));
    return n;
}

async function draw({ msg, args, opts, quotedMsg, chatId, isGroup }) {
    if (opts?.given.has('model')) {
        await swapModel(msg, opts.opt.model, opts, { cmd: '/draw', icone: '🎨', usos: DRAW_USES, padrao: IMAGE_USAGE });
        return;
    }

    if (!keyOpenAi()) {
        await msg.reply(WITHOUT_KEY('/draw'));
        return;
    }

    // -frames and -ms count as -gif
    let gif = null;
    if (['gif', 'frames', 'ms'].some(o => opts?.given.has(o))) {
        try {
            gif = {
                frames: readInteger(opts.opt.frames, LIMIT_FRAMES, '-frames') ?? undefined,
                frameMs: readInteger(opts.opt.ms, LIMIT_MS, '-ms') ?? undefined
            };
        } catch (e) {
            await msg.reply(`❌ ${e.message}`);
            return;
        }
    }

    // Without options, the text goes as typed (with the Enters); with them, only what is left of them
    let request = unescape(opts?.given.size ? opts.argv.join(' ') : args);

    // -p [people]: the profile photos come along (the people leave the request)
    let profiles = [];
    // (without -p, @me/@this at the start of the request count the same: /draw @me @this desenhe nós dois)
    const withP = opts?.given.has('profile');
    const profile = withP ? await textReadProfile(args) : readProfileImplicit(request);
    if (withP || profile) {
        for (const item of profile?.itens ?? []) request = request.replace(item, '');
        request = request.replace(/\s{2,}/g, ' ').trim();
        profiles = await resolverProfiles({ msg, quotedMsg, chatId, isGroup, itens: profile?.itens ?? [], cmd: '/draw' });
        if (!profiles) return;
    }

    await drawAlt({ msg, cmd: '/draw', pedido: request, quotedMsg, gif, perfis: profiles, semPedido: commandUsage('/draw') });
}

// The -status|-s (or the gpt.status setting) shows the call usage in the footer
const cmdDraw = (ctx) => measureConsumption(ctx.opts?.given.has('status'), () => draw(ctx));

module.exports = {
    cmdDraw,
    drawAlt
};
