/*
 * Comando /get.
 */

const { MessageMedia } = require('whatsapp-web.js');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs-extra');

const { formatErrorCommand, commandUsage } = require('./base');
const { completeNotice } = require('../client');
const { BIN_FFMPEG, BIN_FFPROBE, BIN_YT, CACHE_DIR, GET_MAX_CONCURRENT, TMP_DIR } = require('../constants');
const { printDebug, printError, printInfo } = require('../log');
const { STICKER_ANIMATED_MAX_BYTES, ATTEMPTS_STICKER, argsDoFfmpeg, applyPosShortcuts, fitSticker, readPosition, thumbnailDoLink } = require('../media');
const { getSetting, isDebugMode, stickerMeta } = require('../settings');
const { t } = require('../i18n');
const { WITHOUT_KEY, keyOpenAi, errorOpenAi, askOnChat, transcribeAudio } = require('../openaiChat');
const { downloadPhoto, postPhotos } = require('../postPhotos');
const { CHATGPT, engineProcessing, pickEngine, withEngineTip } = require('../engines');
const { readSttOptions, transcriptionCommand, transcribeFile } = require('../transcription');
const { humanSize } = require('../util/files');
const { wait } = require('../util/format');
const { captureOutput, runCommand } = require('../util/processes');
const { extractFirstUrl, isUrlPublic, isValidHttpUrl } = require('../util/url');

let getInProgress = 0;

const MSG_STICKER = { sendMediaAsSticker: true };
const msgDocument = (caption = t('get.documentCaption')) => ({ caption, sendMediaAsDocument: true });
const documentForMedia = (size) => !getSetting('get.showAsMedia')
    || size > getSetting('get.maxInlineSizeMB') * 1024 * 1024;
const isXUrl = (url) => {
    try {
        return /(^|\.)x\.com$|(^|\.)twitter\.com$/i.test(new URL(url).hostname);
    } catch {
        return false;
    }
};

function errorGet(e, verbose) {
    if (!verbose && !e?.cmd && !e?.cause) return formatErrorCommand(e);
    if (verbose) {
        const textAlt = formatErrorCommand(e);
        return e.details ? `${textAlt}\n🧾 *Detalhes*:\n\`\`\`\n${e.details}\n\`\`\`` : textAlt;
    }
    const message = e.noMedia ? e.message : t('get.mediaFailed');
    return `❌ ${message}`;
}

async function cmdGet(ctx) {
    await downloadMedia(ctx, { cmd: '/get' });
}

/**
 * /get: validates the options, finds the source (the typed URL, the replied media
 * or the replied message's link) and sends the media, converted by ffmpeg
 * when needed.
 * @param {object} ctx  the command context
 * @param {object} o
 * @param {string} o.cmd  the typed command (for the syntax)
 */
async function downloadMedia({ msg, opts, quotedMsg, senderName }, { cmd }) {
    // Several links typed (/get <url> <url> ...): one after the other, each with its own reply
    const urls = typedLinks(opts);
    if (urls.length > 1) {
        // What picks a piece of ONE link (the time, the photo of the carousel, the sticker and its position) has no
        // meaning for several: -audio and the transcription (-stt) are the same for all
        const perLink = PER_LINK_OPTIONS.filter(o => opts.given.has(o) || (o === 'sticker' && opts.opt.sticker));
        if (cmd === '/sticker') {
            await msg.reply(t('get.stickerOneLink'));
            return;
        }
        if (perLink.length) {
            await msg.reply(t('get.perLinkOptions', { options: perLink.map(o => `-${o}`).join(', '), cmd }));
            return;
        }
        if (urls.length > MAX_LINKS) {
            await msg.reply(t('get.tooManyLinks', { max: MAX_LINKS, n: urls.length }));
            return;
        }
        if (!(await optionsValid(msg, opts, cmd))) return;
        for (const [i, url] of urls.entries()) {
            await msg.reply(t('get.linkOf', { i: i + 1, n: urls.length, url }), null, { linkPreview: false });
            await downloadOne({ msg, opts: { ...opts, argv: [url] }, quotedMsg: null, senderName });
        }
        return;
    }

    if (!(await optionsValid(msg, opts, cmd))) return;
    await downloadOne({ msg, opts, quotedMsg, senderName }, { cmd });
}

/*
 * The links typed in the command: only when there are two or more and all of them are http(s) addresses (a text with a
 * word that is not a link is, as always, the first argument alone).
 */
const MAX_LINKS = 10;
const PER_LINK_OPTIONS = ['startSec', 'endSec', 'photo', 'sticker', 'pos', 'pb', 'pc', 'pt'];
function typedLinks(opts) {
    const urls = opts.argv.filter(Boolean);
    return urls.length > 1 && urls.every(u => /^https?:\/\/\S+$/i.test(u)) ? urls : [];
}

// Downloads and sends one source (the typed link, the replied media or the replied message's link)
async function downloadOne({ msg, opts, quotedMsg, senderName }, { cmd = '/get' } = {}) {
    const origin = mediaOrigin(opts, quotedMsg, msg);
    if (!origin) {
        await msg.reply(quotedMsg ? t('get.quotedNoMedia') : commandUsage(cmd));
        return;
    }

    let media = null;
    if (origin.quoted) {
        media = await downloadQuoted(msg, origin.quoted);
        if (!media) return;
        if (opts.opt.stt) {
            if (!isAudioOrVideo(media)) {
                await msg.reply(t('get.transcribeNeedsAudio'));
                return;
            }
        } else if (await sendWithoutConverter(msg, media, opts)) return;
        // Audio only becomes audio: with -ss/-es it comes out as mp3
        if (mediaType(media) === 'audio') opts = { ...opts, opt: { ...opts.opt, audio: true } };
    }

    // Allowed users use it too: two downloads already put enough work on the CPU.
    if (getInProgress >= GET_MAX_CONCURRENT) {
        await msg.reply(t('get.busy', { max: GET_MAX_CONCURRENT }));
        return;
    }

    getInProgress++;

    try {
        if (opts.opt.stt) {
            await transcribeAndSend({ msg, opts, senderName, url: origin.url, media });
            return;
        }
        // Sticker from a link without video (article, photo post): the link preview
        const preview = opts.opt.sticker ? origin.doLink : null;
        await converterAndSend({ msg, opts, senderName, url: origin.url, media, preview });
    } finally {
        getInProgress--;
    }
}

/*
 * -ss/-es time in seconds: "22", "2.5", "09:33" (min:sec) or "1:02:03"
 * (h:min:sec). Minutes and seconds after the ":" go up to 59. With "-" in front
 * ("-10", "-01:44") counted from the end of the video and the result is negative. Invalid
 * (or "-0", which says nothing): null.
 */
function readTime(valueAlt) {
    const m = String(valueAlt ?? '').match(/^(-)?(?:(?:(\d+):)?(\d+):)?(\d+(?:\.\d+)?)$/);
    if (!m) return null;
    const [, signalAlt, h, min, seg] = m;
    if (min !== undefined && Number(seg) >= 60) return null;
    if (h !== undefined && Number(min) >= 60) return null;
    const total = Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Number(seg);
    if (signalAlt && total === 0) return null;
    // Without the floating-point noise: "1:00.1" is 60.1, not 60.099999...
    const rounded = Number.isFinite(total) ? Math.round(total * 1000) / 1000 : total;
    return signalAlt ? -rounded : rounded;
}

// Some time counted from the end: the exact point can only be known with the video duration
const hasTimeNegative = (opts) => ['startSec', 'endSec'].some(nameAlt => Number(opts.opt[nameAlt]) < 0);

/*
 * Swaps negative times (counted from the end) for video points, given the
 * duration: -ss -10 is duration-10 (at least 0) and -es -10 is duration-10.
 */
function resolveTimes(opts, duration) {
    const opt = { ...opts.opt };
    const round = (n) => String(Math.round(n * 1000) / 1000);
    if (Number(opt.startSec) < 0) opt.startSec = round(Math.max(0, duration + Number(opt.startSec)));
    if (Number(opt.endSec) < 0) opt.endSec = round(duration + Number(opt.endSec));
    if (opt.endSec != null && Number(opt.endSec) <= Number(opt.startSec ?? 0)) {
        throw new Error(t('get.emptyClip', { duration: duration, end: opt.endSec, start: opt.startSec ?? 0 }));
    }
    return { ...opts, opt };
}

const FILE_COOKIES = path.join(CACHE_DIR, 'cookies.txt');

// cache/cookies.txt (make cookies), if it exists: content that requires login, like X's NSFW
function argsDeCookies() {
    return fs.existsSync(FILE_COOKIES) ? ['--cookies', FILE_COOKIES] : [];
}

const errorDuration = () => new Error(t('get.noDuration'));

async function fileDuration(fileAlt) {
    const duration = await captureOutput(BIN_FFPROBE, [
        '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', fileAlt
    ]).then(Number, () => NaN);
    if (!(duration > 0)) throw errorDuration();
    return duration;
}

// The link duration without downloading anything; null if the site does not report it (then it downloads everything and measures the file)
async function linkDuration(url) {
    const duration = await captureOutput(BIN_YT, [...argsDeCookies(), '--no-playlist', '--print', 'duration', '--', url]).then(Number, () => NaN);
    return duration > 0 ? duration : null;
}

async function optionsValid(msg, opts, cmd) {
    // The parser leaves the option it does not know in argv: without this, it would become the URL
    const unknown = opts.argv.find(a => /^-\S/.test(a));
    if (unknown) {
        await msg.reply(t('get.unknownOption', { option: unknown, cmd }));
        return false;
    }
    for (const nameAlt of ['startSec', 'endSec']) {
        if (!opts.given.has(nameAlt)) continue;
        const seconds = readTime(opts.opt[nameAlt]);
        if (seconds === null) {
            await msg.reply(t('get.badTime', { name: nameAlt }));
            return false;
        }
        if (!Number.isFinite(seconds)) {
            await msg.reply(t('get.timeTooBig', { name: nameAlt }));
            return false;
        }
        // ffmpeg always receives seconds
        opts.opt[nameAlt] = String(seconds);
    }
    // Mixing start and end (-ss 10 -es -5) can only be checked with the video duration
    const [start, end] = [Number(opts.opt.startSec ?? 0), opts.opt.endSec == null ? null : Number(opts.opt.endSec)];
    if (end !== null && (start < 0) === (end < 0) && end <= start) {
        await msg.reply(t('get.endBeforeStart'));
        return false;
    }
    if (opts.opt.stt && (opts.opt.audio || opts.opt.sticker || opts.given.has('pos'))) {
        await msg.reply(t('get.transcribeAlone'));
        return false;
    }
    if (!applyPosShortcuts(opts)) {
        await msg.reply(t('get.posConflict'));
        return false;
    }
    if (opts.given.has('pos')) {
        const pos = readPosition(opts.opt.pos);
        if (!pos) {
            await msg.reply(t('get.badPos', { value: opts.opt.pos ?? '' }));
            return false;
        }
        if (!opts.opt.sticker) {
            await msg.reply(t('get.posNeedsSticker'));
            return false;
        }
        opts.opt.pos = pos;
    }
    if (opts.opt.audio && opts.opt.sticker) {
        await msg.reply(t('get.audioOrSticker'));
        return false;
    }
    return true;
}

/*
 * The typed URL beats the replied message, and that beats the media of the
 * message (the command in the caption). On the replied one, the media
 * counts more than a link in its caption.
 */
function mediaOrigin(opts, quotedMsg, msg) {
    if (opts.argv[0]) return { url: opts.argv[0] };
    // Without a reply: the message itself with the media and the command in the caption (image with "/sticker")
    if (!quotedMsg) return msg?.hasMedia ? { quoted: msg } : null;
    if (quotedMsg.hasMedia) return { quoted: quotedMsg };

    const url = quotedMsg.links?.length ? quotedMsg.links[0].link : extractFirstUrl(quotedMsg.body);
    return url ? { url, doLink: quotedMsg } : null;
}

async function downloadQuoted(msg, quoted) {
    const media = await quoted.downloadMedia().catch((err) => {
        printError('/get: failed to download the replied media:', err.message);
        return null;
    });
    if (!media?.data) {
        await msg.reply(t('get.quotedDownloadFailed'));
        return null;
    }
    return media;
}

// To transcribe: audio, video, or a media file sent as a document (ffmpeg decides)
const isAudioOrVideo = (media) => /^(audio|video)\/|^application\/(octet-stream|ogg|mp4|mpeg|x-matroska)/i.test(String(media?.mimetype ?? ''));

function mediaType(media) {
    const type = String(media?.mimetype ?? '').split('/')[0];
    return { image: 'imagem', video: 'video', audio: 'audio' }[type] ?? null;
}

/*
 * Replied media that does not need ffmpeg (image, or the file as
 * came) or that does not serve the request.
 * @returns {Promise<boolean>} true = already replied
 */
async function sendWithoutConverter(msg, media, opts) {
    const type = mediaType(media);
    const cut = opts.given.has('startSec') || opts.given.has('endSec');
    const { audio, sticker } = opts.opt;

    const errorAlt = !type ? t('get.quotedNotMedia')
        : type === 'imagem' && cut ? t('get.cutOnlyVideo')
            : type === 'imagem' && audio ? t('get.imageNoAudio')
                : type === 'audio' && sticker ? t('get.audioNoSticker')
                    : null;
    if (errorAlt) {
        await msg.reply(errorAlt);
        return true;
    }

    if (type === 'imagem' && sticker) {
        await msg.reply(await fitSticker(media, opts.opt.pos), null, { ...MSG_STICKER, ...stickerMeta() });
        return true;
    }

    // Without a requested conversion: sends the original media in the configured inline/document mode
    if (type === 'imagem' || (!audio && !sticker && !cut)) {
        const fileAlt = media.filename ? media : new MessageMedia(media.mimetype, media.data, `zapbot.${extension(media)}`);
        const size = Buffer.from(fileAlt.data, 'base64').length;
        await msg.reply(fileAlt, null, documentForMedia(size)
            ? { ...msgDocument(), linkPreview: false }
            : { linkPreview: false, ...stickerMeta() });
        return true;
    }

    return false;
}

/*
 * Downloads cache (setting get.cache.tmp): the original file of a link stays in
 * cache/tmp/<sha1 of the link and the snippet>_original.mp4. The snippet (-ss/-es) goes into the key
 * because yt-dlp downloads only it. A request with a snippet also reuses the whole video
 * already downloaded (ffmpeg cuts).
 */
function cacheFile(url, snippet) {
    const keyAlt = `${url}|${snippet ? `${snippet.start}-${snippet.end ?? 'inf'}` : 'inteiro'}`;
    return path.join(TMP_DIR, `${crypto.createHash('sha1').update(keyAlt).digest('hex')}_original.mp4`);
}

// What is already in the cache for the link and the requested snippet: { file, snippet } (snippet null: the whole video)
function searchInCache(url, snippet) {
    for (const candidateAlt of snippet ? [snippet, null] : [null]) {
        const fileAlt = cacheFile(url, candidateAlt);
        if (fs.existsSync(fileAlt)) return { file: fileAlt, snippet: candidateAlt };
    }
    return null;
}

// The extension of the replied media, by mimetype (ffmpeg looks at the content, not the name)
const extension = (media) => String(media.mimetype).split(/[/;]/)[1]?.replace(/[^a-z0-9]/gi, '') || 'bin';

// The URL must be http(s) and public (anti-SSRF); otherwise it throws the error
async function checkUrl(url, senderName) {
    if (!isValidHttpUrl(url)) {
        throw errorOnDownload(t('get.invalidUrl', { url }));
    }
    if (!(await isUrlPublic(url))) {
        printInfo(`/get: URL refused (private or unresolved host) from '${senderName}': ${url}`);
        throw errorOnDownload(t('get.forbiddenUrl', { url }));
    }
}

async function converterAndSend({ msg, opts, senderName, url, media, preview }) {
    // Random: with Date.now() two /get in the same millisecond would use the same files
    const id = crypto.randomUUID();
    let originalFile = null;
    let inCache = false; // the original is in the downloads cache: it is not deleted
    let outputFile = null;
    let logCmdFile = null;
    let logCmd = null;
    let notice = null; // the "Processando…": edited with the result (success or error)

    try {
        const { audio: isAudio, sticker: isSticker, verbose: isVerbose } = opts.opt;

        if (isDebugMode()) {
            printDebug(`url=${url} media=${media?.mimetype} opts=`, opts);
        }

        if (url) await checkUrl(url, senderName);

        notice = await msg.reply(t(isSticker ? 'get.processingSticker' : 'get.processingMedia'), null, { linkPreview: false });

        fs.mkdirSync(TMP_DIR, { recursive: true });

        originalFile = path.join(TMP_DIR, `${id}_original.${media ? extension(media) : 'mp4'}`);
        outputFile = path.join(TMP_DIR, `${id}_output.${isAudio ? 'mp3' : isSticker ? 'webp' : 'mp4'}`);
        logCmdFile = path.join(TMP_DIR, `${id}_cmd.log`);
        logCmd = fs.openSync(logCmdFile, 'a');

        printInfo(`> All the commands' output saved in ${logCmdFile}`);

        let cmdYt = null;
        let optsFfmpeg = opts; // with the snippet downloaded, ffmpeg's cut starts at 0
        if (media) {
            fs.writeFileSync(originalFile, Buffer.from(media.data, 'base64'));
            if (hasTimeNegative(opts)) opts = optsFfmpeg = resolveTimes(opts, await fileDuration(originalFile));
        } else {
            if (hasTimeNegative(opts)) {
                const duration = await linkDuration(url);
                if (duration) opts = optsFfmpeg = resolveTimes(opts, duration);
            }
            const snippet = downloadSnippet(opts);
            const useCache = getSetting('get.cache.tmp');
            const inCacheAlt = useCache ? searchInCache(url, snippet) : null;

            if (inCacheAlt) {
                originalFile = inCacheAlt.file;
                inCache = true;
                if (inCacheAlt.snippet) optsFfmpeg = snippetOpts(opts, inCacheAlt.snippet);
                printInfo(`> From the cache (get.cache.tmp), without downloading: ${path.basename(originalFile)}`);
            } else {
                // With a cut, tries to download only the snippet; if the site does not allow it, downloads everything and ffmpeg cuts
                if (snippet) {
                    try {
                        cmdYt = await downloadWithYtDlp(url, originalFile, logCmd, snippet, logCmdFile);
                        optsFfmpeg = snippetOpts(opts, snippet);
                    } catch (inner) {
                        printInfo(`> The snippet failed (${inner.message}): downloading the whole video`);
                        fs.rmSync(originalFile, { force: true });
                    }
                }
                if (optsFfmpeg === opts) {
                    cmdYt = await downloadWithYtDlp(url, originalFile, logCmd, null, logCmdFile);
                }

                // Above --max-filesize yt-dlp aborts with no error and no file
                if (!fs.existsSync(originalFile)) {
                    throw errorOnDownload(t('get.nothingDownloaded', { max: getSetting('get.maxDownloadMB') }));
                }
                printInfo(`> Downloaded ${optsFfmpeg === opts ? 'the whole video' : 'the snippet'}: ${humanSize(fs.statSync(originalFile).size)}`);

                // Renames only at the end: whoever asks for the same link in the middle of the download does not get a half file
                if (useCache) {
                    const saved = cacheFile(url, optsFfmpeg === opts ? null : snippet);
                    fs.renameSync(originalFile, saved);
                    originalFile = saved;
                    inCache = true;
                }
            }

            // The site did not report the duration: measures the whole file that came
            if (hasTimeNegative(opts)) opts = optsFfmpeg = resolveTimes(opts, await fileDuration(originalFile));
        }

        // Convert. The sticker lowers quality and fps until it fits WhatsApp's limit
        const attempts = isSticker ? ATTEMPTS_STICKER : [undefined];
        let cmdFfmpeg = null;

        for (const attemptAlt of attempts) {
            const ffmpegArgs = argsDoFfmpeg(optsFfmpeg, originalFile, outputFile, attemptAlt);
            cmdFfmpeg = [BIN_FFMPEG, ...ffmpegArgs].join(' ');

            try {
                printInfo(`> Running: ${cmdFfmpeg}`);
                fs.writeSync(logCmd, `\n\n# Executando: ${cmdFfmpeg}\n`);
                await runCommand(BIN_FFMPEG, ffmpegArgs, logCmd);
            } catch (inner) {
                const errorAlt = new Error(t('get.decodeFailed', { bin: BIN_FFMPEG }), { cause: inner });
                errorAlt.cmd = cmdFfmpeg;
                errorAlt.details = tailLog(logCmdFile);
                throw errorAlt;
            }

            if (!isSticker || fs.statSync(outputFile).size <= STICKER_ANIMATED_MAX_BYTES) break;
            if (attemptAlt === attempts.at(-1)) {
                throw new Error(t('get.stickerTooBig', { max: STICKER_ANIMATED_MAX_BYTES / 1024 }));
            }
        }

        const maxSizeMB = getSetting('get.maxSizeMB');
        if (fs.statSync(outputFile).size > maxSizeMB * 1024 * 1024) {
            throw new Error(t('get.fileTooBig', { max: maxSizeMB }));
        }

        try {
            const outputAlt = MessageMedia.fromFilePath(outputFile);
            const outputSize = fs.statSync(outputFile).size;
            const sendAsDocument = documentForMedia(outputSize);
            let caption = '';
            if (url && isXUrl(url) && !isAudio && !isSticker) {
                try {
                    caption = (await postPhotos(url, argsDeCookies())).text;
                } catch (err) {
                    printInfo(`> X post text unavailable: ${err.message}`);
                }
            }

            if (isVerbose) {
                let textMsg = '🛠️ *Verbose Mode*\n\n';
                if (cmdYt) textMsg += `💾 *yt-dlp*: _${cmdYt}_\n\n`;
                textMsg += `🔗 *ffmpeg*: _${cmdFfmpeg}_\n\n`;
                textMsg += '🧩 *cmdArgs*:```\n' + JSON.stringify(opts, null, 4) + '\n```';

                await msg.reply(textMsg, null, { linkPreview: false });
            }

            if (isSticker) {
                printInfo(`> Sending the media as a sticker to '${senderName}'`);
                await msg.reply(outputAlt, null, { linkPreview: false, ...MSG_STICKER, ...stickerMeta() });
            } else {
                printInfo(`> Sending the media ${outputFile} to '${senderName}'`);
                const captionText = caption.slice(0, CAPTION_MAX);
                await msg.reply(outputAlt, null, sendAsDocument
                    ? { linkPreview: false, ...msgDocument(), ...stickerMeta() }
                    : { linkPreview: false, caption: captionText, ...stickerMeta() });
                if (sendAsDocument && caption) await msg.reply(caption.slice(0, CAPTION_MAX), null, { linkPreview: false });
                if (caption.length > CAPTION_MAX) {
                    await msg.reply(caption.slice(CAPTION_MAX), null, { linkPreview: false });
                }
            }
        } catch (inner) {
            throw new Error(t('get.sendFailed', { file: outputFile }), {
                cause: inner
            });
        }

        // WhatsApp only edits text: the media goes separately and the notice becomes the confirmation
        await completeNotice(msg, notice, t(isSticker ? 'get.stickerDone' : 'get.mediaDone'), { linkPreview: false });
    } catch (e) {
        // Photo-only post (carousel): without -a, -st or -t, the photos go to the chat, the last one with the post text
        if (url && !opts.opt.audio && !opts.opt.sticker && (e.noMedia || isXUrl(url))
            && (await postSendPhotos(msg, notice, url, opts))) return;
        if (e.noMedia && url && opts.opt.sticker && (await postPhotoSticker(msg, notice, url, opts))) return;
        if (e.onDownload && preview && (await previewSticker(msg, preview, notice, e, opts.opt.pos))) return;
        printError(e.message);
        await completeNotice(msg, notice, errorGet(e, opts.opt.verbose), { linkPreview: false });
    } finally {
        if (logCmd !== null) {
            try { fs.closeSync(logCmd); } catch { /* already closed */ }
        }

        for (const tmp of [inCache ? null : originalFile, outputFile, logCmdFile]) {
            if (!tmp) continue;
            try { fs.unlinkSync(tmp); } catch { /* file may not exist */ }
        }
    }
}

const FORMAT_AUDIO_LIGHT = 'worstaudio[language_preference>0]/worstaudio/worst';

const mmss = (seg) => `${Math.floor(seg / 60)}:${String(Math.round(seg % 60)).padStart(2, '0')}`;

// O WhatsApp aceita ~65 mil caracteres numa message
const TRANSCRIPTION_MAX_CHARACTERS = 60000;

/**
 * /get -stt: the speech of the link (or of the replied video/audio) as text, transcribed
 * locally. From the link it downloads only the lowest-quality audio (it is the lightest and whisper
 * works at 16 kHz mono), converts to 16 kHz mono wav (with the -ss/-es cut) and transcribes.
 * O notice "Processando" vira o text.
 */
async function transcribeAndSend({ msg, opts, senderName, url, media }) {
    let engine;
    try {
        engine = pickEngine(opts, 'stt.engine');
    } catch (e) {
        await msg.reply(e.message);
        return;
    }
    const gpt = engine === 'gpt';
    // -lang, -model, -beam and -vad: of the call (the stt.* settings are the default)
    let sttOptions;
    try {
        sttOptions = readSttOptions(opts);
    } catch (e) {
        await msg.reply(e.message);
        return;
    }
    const id = crypto.randomUUID();
    const raw = path.join(TMP_DIR, `${id}_fala.${media ? extension(media) : '%(ext)s'}`);
    // -gpt sends the audio to OpenAI (25 MB ceiling): a small Opus; the local engine reads 16 kHz mono wav
    const wav = path.join(TMP_DIR, `${id}_fala_16k.${gpt ? 'ogg' : 'wav'}`);
    let logCmdFile = null;
    let logCmd = null;
    let notice = null;
    let engineTip;

    try {
        if (url) await checkUrl(url, senderName);
        // -gpt and -sum use the OpenAI key (/gpt): better to know before spending the CPU
        if ((gpt || opts.opt.summary) && !keyOpenAi()) throw new Error(WITHOUT_KEY('/stt'));
        // Who transcribes (and summarizes), in the wait notice and in the final tip
        const engineName = (gpt ? CHATGPT : 'faster-whisper') + (opts.opt.summary && !gpt ? ` + ${CHATGPT}` : '');
        engineTip = engineName;
        // -quiet: no "transcribing..." notice either (the text comes straight away)
        notice = opts.opt.quiet ? null : await msg.reply(engineProcessing('stt', engineName), null, { linkPreview: false });

        fs.mkdirSync(TMP_DIR, { recursive: true });
        logCmdFile = path.join(TMP_DIR, `${id}_cmd.log`);
        logCmd = fs.openSync(logCmdFile, 'a');

        let fileAlt = raw;
        let cmdYt = null;
        if (media) {
            fs.writeFileSync(raw, Buffer.from(media.data, 'base64'));
        } else {
            cmdYt = await downloadAudioLight(url, raw, logCmd, logCmdFile);
            fileAlt = find(`${id}_fala.`);
            if (!fileAlt) throw errorOnDownload(t('get.nothingDownloaded', { max: getSetting('get.maxDownloadMB') }));
        }
        printInfo(`> Audio to transcribe: ${humanSize(fs.statSync(fileAlt).size)}`);

        // The cut (-ss/-es), with the time counted from the end resolved by the audio duration
        let cuts = opts;
        if (hasTimeNegative(opts)) cuts = resolveTimes(opts, await fileDuration(fileAlt));
        const { startSec, endSec } = cuts.opt;
        const ffmpegArgs = [
            '-y',
            ...(startSec != null ? ['-ss', String(startSec)] : []),
            ...(endSec != null ? ['-to', String(endSec)] : []),
            '-i', fileAlt, '-vn', '-ac', '1', '-ar', '16000', ...(gpt ? ['-c:a', 'libopus', '-b:a', '24k'] : ['-c:a', 'pcm_s16le']), wav
        ];
        const cmdFfmpeg = [BIN_FFMPEG, ...ffmpegArgs].join(' ');
        fs.writeSync(logCmd, `\n# Executando: ${cmdFfmpeg}\n`);
        try {
            await runCommand(BIN_FFMPEG, ffmpegArgs, logCmd);
        } catch (inner) {
            const errorAlt = new Error(t('get.decodeFailed', { bin: BIN_FFMPEG }), { cause: inner });
            errorAlt.cmd = cmdFfmpeg;
            errorAlt.details = tailLog(logCmdFile);
            throw errorAlt;
        }

        const duration = await fileDuration(wav);
        const maxMin = getSetting('stt.maxMinutes');
        if (duration > maxMin * 60) throw new Error(t('get.transcribeTooLong', { dur: mmss(duration), max: maxMin }));

        let r;
        const start = Date.now();
        try {
            r = gpt
                ? {
                    text: await transcribeAudio({
                        cmd: '/stt', language: sttOptions.language ?? getSetting('stt.language'), model: sttOptions.model,
                        audio: { file: 'speech.ogg', mimetype: 'audio/ogg', data: fs.readFileSync(wav).toString('base64') }
                    }),
                    language: 'auto',
                    duration
                }
                : await transcribeFile(wav, sttOptions);
        } catch (inner) {
            throw new Error(t('get.transcribeFailed'), { cause: inner });
        }

        if (opts.opt.verbose) {
            let textMsg = '🛠️ *Verbose Mode*\n\n';
            if (cmdYt) textMsg += `💾 *yt-dlp*: _${cmdYt}_\n\n`;
            textMsg += `🔗 *ffmpeg*: _${cmdFfmpeg}_\n\n`;
            textMsg += gpt
                ? `🧠 *OpenAI* (${((Date.now() - start) / 1000).toFixed(1)} s): _${sttOptions.model ?? getSetting('gpt.transcribe.model')}_\n\n`
                : `🧠 *faster-whisper* (${((Date.now() - start) / 1000).toFixed(1)} s): _${transcriptionCommand(wav, sttOptions)}_\n\n`;
            textMsg += '🧩 *cmdArgs*:```\n' + JSON.stringify(opts, null, 4) + '\n```';
            await msg.reply(textMsg, null, { linkPreview: false });
        }

        const textAlt = r.text.length > TRANSCRIPTION_MAX_CHARACTERS ? `${r.text.slice(0, TRANSCRIPTION_MAX_CHARACTERS)}…` : r.text;
        printInfo(`> Transcribed (${r.language}, ${mmss(duration)}): ${r.text.length} characters`);
        if (!textAlt) {
            await completeNotice(msg, notice, t('get.transcribeEmpty'), { linkPreview: false });
        } else if (opts.opt.summary) {
            await completeNotice(msg, notice, withEngineTip(await speechSummary(r, duration, textAlt, opts.opt.quiet), 'stt', engineTip, { quiet: opts.opt.quiet }), { linkPreview: false });
        } else {
            // -quiet: only the text, with no header and no footer
            const result = opts.opt.quiet ? textAlt : t('get.transcribeResult', { lang: r.language, dur: mmss(duration), text: textAlt });
            await completeNotice(msg, notice, withEngineTip(result, 'stt', engineTip, { quiet: opts.opt.quiet }), { linkPreview: false });
        }
    } catch (e) {
        printError(e.message);
        await completeNotice(msg, notice, errorGet(e, opts.opt.verbose), { linkPreview: false });
    } finally {
        if (logCmd !== null) {
            try { fs.closeSync(logCmd); } catch { /* already closed */ }
        }
        for (const tmp of [find(`${id}_fala.`), wav, logCmdFile]) {
            if (!tmp) continue;
            try { fs.unlinkSync(tmp); } catch { /* file may not exist */ }
        }
    }

    // The downloaded audio: yt-dlp picks the extension (m4a, webm...), so it searches by the prefix
    function find(prefix) {
        const nameAlt = fs.existsSync(TMP_DIR) ? fs.readdirSync(TMP_DIR).find(f => f.startsWith(prefix)) : null;
        return nameAlt ? path.join(TMP_DIR, nameAlt) : null;
    }
}

/*
 * -sum: the summary (ChatGPT, the /gpt key) on top and the whole transcription below. If the summary
 * fail (no balance, timeout), the transcription goes out anyway, with the reason in place of the summary.
 */
async function speechSummary(r, duration, textAlt, plain = false) {
    let summary;
    try {
        summary = await askOnChat({
            cmd: '/stt',
            system: t('get.sumInstructions'),
            text: t('get.sumPrompt', { text: textAlt })
        });
    } catch (err) {
        summary = errorOpenAi(err, '/stt');
    }
    // With the summary, the 60 thousand character cap applies to the sum
    // -quiet: the summary and the transcription, with no titles
    const format = (text) => (plain ? `${summary}\n\n${text}` : t('get.transcribeSummary', { lang: r.language, dur: mmss(duration), summary: summary, text }));
    const head = format('');
    const space = Math.max(1000, TRANSCRIPTION_MAX_CHARACTERS - head.length);
    return format(textAlt.length > space ? `${textAlt.slice(0, space)}…` : textAlt);
}

/*
 * Downloads only the lowest-quality audio (worstaudio; without an audio-only track, the smallest video), from the
 * in the ORIGINAL language: YouTube offers automatic dubs and worstaudio inverts the preference
 * of yt-dlp, picking exactly the dubbed one (the original's language_preference is 10, the rest is lower or
 * does not exist; on sites without that field the plain worstaudio applies). The speech
 * needs no more, and it is much less than the video. `output` ends in .%(ext)s: yt-dlp
 * picks the extension.
 */
async function downloadAudioLight(url, outputAlt, logCmd, logFile) {
    const cmdYtArgs = [
        '-f', FORMAT_AUDIO_LIGHT,
        ...argsDeCookies(),
        '--no-playlist',
        '--max-filesize', `${getSetting('get.maxDownloadMB')}M`,
        '-o', outputAlt,
        '--', url
    ];
    const cmdYt = [BIN_YT, ...cmdYtArgs].join(' ');
    try {
        printInfo(`> Running: ${cmdYt}`);
        fs.writeSync(logCmd, `# Executando: ${cmdYt}\n`);
        await runCommand(BIN_YT, cmdYtArgs, logCmd);
    } catch (inner) {
        throw downloadError(logFile, inner, cmdYt);
    }
    return cmdYt;
}

/*
 * The snippet requested with -ss/-es, in seconds, for yt-dlp's --download-sections
 * yt-dlp (end null: until the end). The sticker takes at most the 6 s
 * following. Without a cut: null.
 */
function downloadSnippet(opts) {
    const { startSec, endSec, sticker } = opts.opt;
    // Time counted from the end without the duration: downloads the whole video
    if (hasTimeNegative(opts)) return null;
    if (startSec == null && endSec == null && !sticker) return null;
    const start = Number(startSec ?? 0);
    // The sticker is at most 6 s: downloading more than that is a waste
    const end = sticker ? Math.min(Number(endSec ?? Infinity), start + 6) : endSec != null ? Number(endSec) : null;
    return { start, end: end === null ? null : Math.round(end * 1000) / 1000 };
}

// The snippet file already starts at -ss: ffmpeg only limits the duration
function snippetOpts(opts, { start, end }) {
    const endSec = end === null ? null : String(Math.round((end - start) * 1000) / 1000);
    return { ...opts, opt: { ...opts.opt, startSec: null, endSec } };
}

/**
 * Downloads the URL with yt-dlp; with `snippet`, only that (cut at the exact time).
 * @returns {Promise<string>} o command executado
 */
async function downloadWithYtDlp(url, originalFile, logCmd, snippet = null, logFile = null) {
    // --no-playlist: a playlist link would download everything; --max-filesize: does not fill the disk
    // --force-keyframes-at-cuts: without it the snippet starts at the previous keyframe, before the -ss
    const cmdYtArgs = [
        '-f', 'mp4', '--merge-output-format', 'mp4',
        ...argsDeCookies(),
        '--no-playlist',
        '--max-filesize', `${getSetting('get.maxDownloadMB')}M`,
        ...(snippet ? ['--download-sections', `*${snippet.start}-${snippet.end ?? 'inf'}`, '--force-keyframes-at-cuts'] : []),
        '-o', originalFile,
        '--', url
    ];
    const cmdYt = [BIN_YT, ...cmdYtArgs].join(' ');

    try {
        printInfo(`> Running: ${cmdYt}`);
        fs.writeSync(logCmd, `# Executando: ${cmdYt}\n`);
        await runCommand(BIN_YT, cmdYtArgs, logCmd);
    } catch (inner) {
        throw downloadError(logFile, inner, cmdYt);
    }
    return cmdYt;
}

const CAPTION_MAX = 1000;     // the caption of the last photo; whatever goes over goes in another message
const PHOTOS_PAUSE_MS = 250;   // between one photo and another: not dumping everything at once

/*
 * /get on a photo-only post: downloads all of them and sends them to the chat, the last one with the post text (if the text goes over
 * of CAPTION_MAX, the rest goes in a message afterward). The "Processando" notice becomes "✅ N photos sent".
 * @returns {Promise<boolean>} false = it was not a photo post (or nothing could be downloaded): the usual error follows
 */
async function postSendPhotos(msg, notice, url, opts) {
    let post;
    try {
        post = await postPhotos(url, argsDeCookies());
    } catch (err) {
        printInfo(`> Post photos: could not get the data (${err.message})`);
        return false;
    }
    if (!post.photos.length) return false;

    // -photo N: only that one, with the post text
    const only = photoIndex(opts, url, post.photos.length);
    if (only !== null) {
        if (only < 0 || only >= post.photos.length) {
            await completeNotice(msg, notice, t('get.photoOutOfRange', { n: opts.opt.photo, total: post.photos.length }), { linkPreview: false });
            return true;
        }
        post.photos = [post.photos[only]];
        post.total = 1;
    }

    const photos = [];
    for (const [i, photo] of post.photos.entries()) {
        try {
            photos.push(await downloadPhoto(photo, i + 1));
        } catch (err) {
            printError(`/get: photo ${i + 1} of the post was not downloaded:`, err.message);
        }
    }
    if (!photos.length) return false;
    printInfo(`> Photo post: ${photos.length} of ${post.total} photos`);

    // Each photo carries "Image i/N"; the last one also carries the post text (what goes over the caption limit comes after)
    let rest = '';
    for (const [i, photo] of photos.entries()) {
        const last = i === photos.length - 1;
        let captionAlt = t('get.photoCaption', { i: i + 1, total: photos.length });
        if (last && post.text) {
            const space = CAPTION_MAX - captionAlt.length - 2;
            captionAlt += `\n\n${post.text.length > space ? `${post.text.slice(0, space - 1)}…` : post.text}`;
            if (post.text.length > space) rest = post.text.slice(space - 1);
        }
        await msg.reply(photo, null, {
            linkPreview: false,
            caption: captionAlt,
            ...(documentForMedia(Buffer.from(photo.data, 'base64').length) ? { sendMediaAsDocument: true } : {})
        });
        if (!last) await wait(PHOTOS_PAUSE_MS);
    }
    if (rest) await msg.reply(rest, null, { linkPreview: false });

    const missing = post.total - photos.length;
    await completeNotice(msg, notice, t('get.photosDone', { n: photos.length }) + (missing > 0 ? t('get.photosMissing', { n: missing }) : ''), { linkPreview: false });
    return true;
}

/*
 * Which photo of the post (0-based): -photo N (1-based; negative counts from the end); for the sticker, else
 * the ?img_index=N of the link (Instagram), else the first. null = no -photo (and not a sticker): all of them.
 */
function photoIndex(opts, url, total) {
    let n = opts.opt.photo == null ? 0 : Number(opts.opt.photo);
    if (opts.opt.photo == null && opts.opt.sticker) {
        try {
            n = Number(new URL(url).searchParams.get('img_index'));
        } catch { /* not a valid URL: the first one */ }
        if (!n) n = 1;
    }
    if (!n) return null;
    return Number.isInteger(n) ? (n < 0 ? total + n : n - 1) : -1;
}

/*
 * /sticker on a photo-only post (Instagram, X/Twitter): the sticker is made from one of the photos.
 * @returns {Promise<boolean>} false = it was not a photo post (or the photo could not be downloaded)
 */
async function postPhotoSticker(msg, notice, url, opts) {
    try {
        const post = await postPhotos(url, argsDeCookies());
        if (!post.photos.length) return false;

        const i = photoIndex(opts, url, post.photos.length);
        if (i < 0 || i >= post.photos.length) {
            await completeNotice(msg, notice, t('get.photoOutOfRange', { n: opts.opt.photo, total: post.photos.length }), { linkPreview: false });
            return true;
        }

        const photo = await downloadPhoto(post.photos[i], i + 1);
        printInfo(`> Photo post: sticker from photo ${i + 1} of ${post.photos.length}`);
        await msg.reply(await fitSticker(photo, opts.opt.pos), null, { ...MSG_STICKER, ...stickerMeta() });
        await completeNotice(msg, notice, t('get.stickerDone'), { linkPreview: false });
        return true;
    } catch (err) {
        printError('/sticker: photo of the post failed:', err.message);
        return false;
    }
}

// yt-dlp found the post but without video (photo-only carousel, image post): there is nothing to download
const WITHOUT_MEDIA = /No video formats found|There is no video in this post|No video could be found in this tweet|Media #\d+ is not a video/i;
function withoutMediaInLink(fileLog) {
    try {
        return Boolean(fileLog) && WITHOUT_MEDIA.test(fs.readFileSync(fileLog, 'utf8'));
    } catch {
        return false;
    }
}

// The yt-dlp error: the right message (no media on the link, or the general download problem) and the command
function downloadError(logFile, inner, cmd) {
    const errorAlt = errorOnDownload(t(withoutMediaInLink(logFile) ? 'get.noMediaInLink' : 'get.downloadFailed', { bin: BIN_YT }), { cause: inner });
    errorAlt.cmd = cmd;
    errorAlt.noMedia = withoutMediaInLink(logFile);
    errorAlt.details = tailLog(logFile);
    return errorAlt;
}

function tailLog(file) {
    try {
        return fs.readFileSync(file, 'utf8').trim().slice(-2000);
    } catch {
        return '';
    }
}

// Fails before having the video: a link's sticker can still come from the preview
function errorOnDownload(messageAlt, optionsAlt) {
    return Object.assign(new Error(messageAlt, optionsAlt), { onDownload: true });
}

/*
 * The link video did not come: the sticker comes from the preview WhatsApp shows
 * to the link (as /sticker did before downloading the video).
 * @returns {Promise<boolean>} true = a figurinha foi sent
 */
async function previewSticker(msg, quoted, notice, reasonAlt, pos) {
    try {
        const thumb = await thumbnailDoLink(quoted);
        if (!thumb) return false;

        printInfo(`/sticker: no video from the link (${reasonAlt.message}); using the preview`);
        await msg.reply(await fitSticker(thumb, pos), null, { ...MSG_STICKER, ...stickerMeta() });
        if (notice) await completeNotice(msg, notice, t('get.stickerDone'), { linkPreview: false });
        return true;
    } catch (err) {
        printError('/sticker: failed to use the link preview:', err.message);
        return false;
    }
}

module.exports = {
    downloadMedia,
    cmdGet
};
