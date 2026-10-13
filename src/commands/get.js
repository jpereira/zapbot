/*
 * Comando /get.
 */

const { MessageMedia } = require('whatsapp-web.js');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs-extra');

const { formatErrorCommand, getCommandSyntax } = require('./base');
const { completeNotice } = require('../client');
const { BIN_FFMPEG, BIN_YT, GET_MAX_CONCURRENT, TMP_DIR } = require('../constants');
const { printDebug, printError, printInfo } = require('../log');
const { argsDoFfmpeg, fitSticker, thumbnailDoLink } = require('../media');
const { getSetting, isDebugMode, stickerMeta } = require('../settings');
const { runCommand } = require('../util/processes');
const { extractFirstUrl, isUrlPublic, isValidHttpUrl } = require('../util/url');

let getInProgress = 0;

const MSG_STICKER = { sendMediaAsSticker: true };
const MSG_DOCUMENT = { caption: '📥 Aqui está a mídia para download.', sendMediaAsDocument: true };

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
    if (!(await optionsValid(msg, opts, cmd))) return;

    const origin = mediaOrigin(opts, quotedMsg);
    if (!origin) {
        await msg.reply(quotedMsg ? '❌ A mensagem respondida não tem mídia nem link.' : '```' + getCommandSyntax(cmd) + '```');
        return;
    }

    let media = null;
    if (origin.citada) {
        media = await downloadQuoted(msg, origin.citada);
        if (!media) return;
        if (await sendWithoutConverter(msg, media, opts)) return;
        // Audio only becomes audio: with -ss/-es it comes out as mp3
        if (mediaType(media) === 'audio') opts = { ...opts, opt: { ...opts.opt, audio: true } };
    }

    // Allowed users use it too: two downloads already put enough work on the CPU.
    if (getInProgress >= GET_MAX_CONCURRENT) {
        await msg.reply(`⏳ Já existem ${GET_MAX_CONCURRENT} downloads em andamento. Tente de novo em instantes.`);
        return;
    }

    getInProgress++;

    try {
        // Sticker from a link without video (article, photo post): the link preview
        const preview = opts.opt.sticker ? origin.doLink : null;
        await converterAndSend({ msg, opts, senderName, url: origin.url, media, previa: preview });
    } finally {
        getInProgress--;
    }
}

async function optionsValid(msg, opts, cmd) {
    // The parser leaves the option it does not know in argv: without this, it would become the URL
    const unknown = opts.argv.find(a => /^-\S/.test(a));
    if (unknown) {
        await msg.reply(`❌ Opção desconhecida: ${unknown}\n💡 _Veja as opções com ${cmd} -h_`);
        return false;
    }
    for (const nameAlt of ['startSec', 'endSec']) {
        if (opts.given.has(nameAlt) && !/^\d+(?:\.\d+)?$/.test(String(opts.opt[nameAlt] ?? ''))) {
            await msg.reply(`❌ -${nameAlt} precisa de segundos não negativos, como 0, 10 ou 2.5.`);
            return false;
        }
        if (opts.given.has(nameAlt) && !Number.isFinite(Number(opts.opt[nameAlt]))) {
            await msg.reply(`❌ Valor de -${nameAlt} grande demais.`);
            return false;
        }
    }
    if (opts.opt.endSec != null && Number(opts.opt.endSec) <= Number(opts.opt.startSec ?? 0)) {
        await msg.reply('❌ O segundo final (-es) deve ser maior que o inicial (-ss, padrão 0).');
        return false;
    }
    if (opts.opt.audio && opts.opt.sticker) {
        await msg.reply('❌ Escolha áudio (-a) ou figurinha (-st) para esta execução.');
        return false;
    }
    return true;
}

/*
 * The typed URL beats the replied message. On the replied one, the media
 * counts more than a link in its caption.
 */
function mediaOrigin(opts, quotedMsg) {
    if (opts.argv[0]) return { url: opts.argv[0] };
    if (!quotedMsg) return null;
    if (quotedMsg.hasMedia) return { citada: quotedMsg };

    const url = quotedMsg.links?.length ? quotedMsg.links[0].link : extractFirstUrl(quotedMsg.body);
    return url ? { url, doLink: quotedMsg } : null;
}

async function downloadQuoted(msg, quoted) {
    const media = await quoted.downloadMedia().catch((err) => {
        printError('/get: falha ao baixar a mídia respondida:', err.message);
        return null;
    });
    if (!media?.data) {
        await msg.reply('❌ Não consegui baixar a mídia respondida: ela pode não estar mais disponível no WhatsApp.');
        return null;
    }
    return media;
}

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

    const errorAlt = !type ? '❌ A mídia respondida não é imagem, vídeo nem áudio.'
        : type === 'imagem' && cut ? '❌ O -ss e o -es só valem para vídeo.'
            : type === 'imagem' && audio ? '❌ A imagem respondida não tem áudio.'
                : type === 'audio' && sticker ? '❌ Não dá para fazer figurinha de um áudio.'
                    : null;
    if (errorAlt) {
        await msg.reply(errorAlt);
        return true;
    }

    if (type === 'imagem' && sticker) {
        await msg.reply(await fitSticker(media), null, { ...MSG_STICKER, ...stickerMeta() });
        return true;
    }

    // Without a requested conversion: the original file, as a document (without a name, WhatsApp shows "Sem título")
    if (type === 'imagem' || (!audio && !sticker && !cut)) {
        const fileAlt = media.filename ? media : new MessageMedia(media.mimetype, media.data, `zapbot.${extension(media)}`);
        await msg.reply(fileAlt, null, { ...MSG_DOCUMENT, linkPreview: false });
        return true;
    }

    return false;
}

// The extension of the replied media, by mimetype (ffmpeg looks at the content, not the name)
const extension = (media) => String(media.mimetype).split(/[/;]/)[1]?.replace(/[^a-z0-9]/gi, '') || 'bin';

async function converterAndSend({ msg, opts, senderName, url, media, previa: preview }) {
    // Random: with Date.now() two /get in the same millisecond would use the same files
    const id = crypto.randomUUID();
    let originalFile = null;
    let outputFile = null;
    let logCmdFile = null;
    let logCmd = null;
    let notice = null; // the "Processando…": edited with the result (success or error)

    try {
        const { audio: isAudio, sticker: isSticker, verbose: isVerbose } = opts.opt;

        if (isDebugMode()) {
            printDebug(`url=${url} media=${media?.mimetype} opts=`, opts);
        }

        if (url && !isValidHttpUrl(url)) {
            throw errorOnDownload(`A URL '${url}' é inválida. Ignorando`);
        }

        if (url && !(await isUrlPublic(url))) {
            printInfo(`/get: URL recusada (host privado ou não resolvido) de '${senderName}': ${url}`);
            throw errorOnDownload(`A URL '${url}' aponta para um endereço não permitido. Ignorando`);
        }

        notice = await msg.reply(`💡 Processando ${isSticker ? 'seu sticker' : 'sua mídia'}, aguarde.`, null, { linkPreview: false });

        fs.mkdirSync(TMP_DIR, { recursive: true });

        originalFile = path.join(TMP_DIR, `${id}_original.${media ? extension(media) : 'mp4'}`);
        outputFile = path.join(TMP_DIR, `${id}_output.${isAudio ? 'mp3' : 'mp4'}`);
        logCmdFile = path.join(TMP_DIR, `${id}_cmd.log`);
        logCmd = fs.openSync(logCmdFile, 'a');

        printInfo(`> Todo o output dos comandos salvo em ${logCmdFile}`);

        let cmdYt = null;
        if (media) {
            fs.writeFileSync(originalFile, Buffer.from(media.data, 'base64'));
        } else {
            // Download video
            // --no-playlist: a playlist link would download everything; --max-filesize: does not fill the disk
            const cmdYtArgs = [
                '-f', 'mp4', '--merge-output-format', 'mp4',
                '--no-playlist',
                '--max-filesize', `${getSetting('get.maxDownloadMB')}M`,
                '-o', originalFile,
                '--', url
            ];
            cmdYt = [BIN_YT, ...cmdYtArgs].join(' ');

            try {
                printInfo(`> Executando: ${cmdYt}`);
                fs.writeSync(logCmd, `# Executando: ${cmdYt}\n`);
                await runCommand(BIN_YT, cmdYtArgs, logCmd);
            } catch (inner) {
                const errorAlt = errorOnDownload(`Problemas para baixar com '${BIN_YT}'`, { cause: inner });
                errorAlt.cmd = cmdYt;
                throw errorAlt;
            }

            // Above --max-filesize yt-dlp aborts with no error and no file
            if (!fs.existsSync(originalFile)) {
                throw errorOnDownload(`Nada foi baixado (acima de ${getSetting('get.maxDownloadMB')} MB? veja o setting get.maxDownloadMB)`);
            }
        }

        // Converter
        const ffmpegArgs = argsDoFfmpeg(opts, originalFile, outputFile);
        const cmdFfmpeg = [BIN_FFMPEG, ...ffmpegArgs].join(' ');

        try {
            printInfo(`> Executando: ${cmdFfmpeg}`);
            fs.writeSync(logCmd, `\n\n# Executando: ${cmdFfmpeg}\n`);
            await runCommand(BIN_FFMPEG, ffmpegArgs, logCmd);
        } catch (inner) {
            const errorAlt = new Error(`Problemas para decodificar com '${BIN_FFMPEG}'`, { cause: inner });
            errorAlt.cmd = cmdFfmpeg;
            throw errorAlt;
        }

        const maxSizeMB = getSetting('get.maxSizeMB');
        if (fs.statSync(outputFile).size > maxSizeMB * 1024 * 1024) {
            throw new Error(`Arquivo muito grande para WhatsApp Web (máx. ${maxSizeMB} MB)`);
        }

        try {
            const outputAlt = MessageMedia.fromFilePath(outputFile);

            if (isVerbose) {
                let textMsg = '🛠️ *Verbose Mode*\n\n';
                if (cmdYt) textMsg += `💾 *yt-dlp*: _${cmdYt}_\n\n`;
                textMsg += `🔗 *ffmpeg*: _${cmdFfmpeg}_\n\n`;
                textMsg += '🧩 *cmdArgs*:```\n' + JSON.stringify(opts, null, 4) + '\n```';

                await msg.reply(textMsg, null, { linkPreview: false });
            }

            if (isSticker) {
                printInfo(`> Enviando a mídia como sticker para '${senderName}'`);
                await msg.reply(outputAlt, null, { linkPreview: false, ...MSG_STICKER, ...stickerMeta() });
            } else {
                printInfo(`> Enviando a mídia ${outputFile} para '${senderName}'`);
                await msg.reply(outputAlt, null, { linkPreview: false, ...MSG_DOCUMENT, ...stickerMeta() });
            }
        } catch (inner) {
            throw new Error(`Problemas para enviar com 'MessageMedia.fromFilePath(${outputFile})'`, {
                cause: inner
            });
        }

        // WhatsApp only edits text: the media goes separately and the notice becomes the confirmation
        await completeNotice(msg, notice, `✅ ${isSticker ? 'Sticker criado' : 'Mídia baixada'} com sucesso!`, { linkPreview: false });
    } catch (e) {
        if (e.aoBaixar && preview && (await previewSticker(msg, preview, notice, e))) return;
        printError(e.message);
        await completeNotice(msg, notice, formatErrorCommand(e), { linkPreview: false });
    } finally {
        if (logCmd !== null) {
            try { fs.closeSync(logCmd); } catch { /* already closed */ }
        }

        for (const tmp of [originalFile, outputFile, logCmdFile]) {
            if (!tmp) continue;
            try { fs.unlinkSync(tmp); } catch { /* file may not exist */ }
        }
    }
}

// Fails before having the video: a link's sticker can still come from the preview
function errorOnDownload(messageAlt, optionsAlt) {
    return Object.assign(new Error(messageAlt, optionsAlt), { aoBaixar: true });
}

/*
 * The link video did not come: the sticker comes from the preview WhatsApp shows
 * to the link (as /sticker did before downloading the video).
 * @returns {Promise<boolean>} true = a figurinha foi enviada
 */
async function previewSticker(msg, quoted, notice, reasonAlt) {
    try {
        const thumb = await thumbnailDoLink(quoted);
        if (!thumb) return false;

        printInfo(`/sticker: sem o vídeo do link (${reasonAlt.message}); usando a prévia`);
        await msg.reply(await fitSticker(thumb), null, { ...MSG_STICKER, ...stickerMeta() });
        if (notice) await completeNotice(msg, notice, '✅ Sticker criado com sucesso!', { linkPreview: false });
        return true;
    } catch (err) {
        printError('/sticker: falha ao usar a prévia do link:', err.message);
        return false;
    }
}

module.exports = {
    downloadMedia,
    cmdGet
};
