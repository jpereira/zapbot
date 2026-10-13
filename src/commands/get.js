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
const { getSetting, isDebugMode, stickerMeta } = require('../settings');
const { runCommand } = require('../util/processes');
const { extractFirstUrl, isUrlPublic, isValidHttpUrl } = require('../util/url');

function GetOptFromCommandForFfmpeg(opts, originalFile, outputFile) {
    const isSticker = opts.opt.sticker;  // -sticker  | -st
    const isAudio   = opts.opt.audio;    // -audio    | -a
    const startSec  = opts.opt.startSec; // -startSec | -ss
    const endSec    = opts.opt.endSec;   // -endSec   | -es
    // The input is a local file downloaded from the internet: ffmpeg must not open
    // rede nem outros protocolos a partir dele (playlists/concat maliciosos)
    const args      = ['-y', '-protocol_whitelist', 'file'];

    if (startSec != null) {
        args.push('-ss', String(startSec));
    }

    args.push('-i', originalFile);

    const duration = endSec == null ? null : Number(endSec) - Number(startSec ?? 0);
    if (isSticker || duration != null) {
        args.push('-t', String(isSticker ? Math.min(duration ?? 6, 6) : duration));
    }

    if (isAudio) {
        // Audio only
        args.push(
            '-vn',
            '-c:a', 'libmp3lame',
            '-b:a', '192k',
            outputFile
        );
    } else if (isSticker) {
        // 512x512 animated sticker framed in the middle of the video (like /sticker):
        // scales until it covers the square and the crop (centered by default) cuts off the excess
        args.push(
            '-vf',
            'fps=15,scale=512:512:force_original_aspect_ratio=increase,crop=512:512,setsar=1',
            '-an',
            '-c:v', 'libx264',
            '-b:v', '500k',
            '-maxrate', '500k',
            '-bufsize', '1000k',
            '-pix_fmt', 'yuv420p',
            '-profile:v', 'baseline',
            '-movflags', '+faststart',
            outputFile
        );
    } else {
        // Normal video
        args.push(
            '-c:v', 'libx264',
            '-b:v', '800k',
            '-maxrate', '800k',
            '-bufsize', '1600k',
            '-pix_fmt', 'yuv420p',
            '-profile:v', 'baseline',
            '-movflags', '+faststart',
            '-c:a', 'aac',
            outputFile
        );
    }

    return args;
}

let getInProgress = 0;

async function cmdGet({ msg, opts, quotedMsg, senderName }) {
    // Allowed users use it too: two downloads already put enough work on the CPU.
    if (getInProgress >= GET_MAX_CONCURRENT) {
        await msg.reply(`⏳ Já existem ${GET_MAX_CONCURRENT} downloads em andamento. Tente de novo em instantes.`);
        return;
    }

    getInProgress++;

    try {
        await runGet({ msg, opts, quotedMsg, senderName });
    } finally {
        getInProgress--;
    }
}

async function runGet({ msg, opts, quotedMsg, senderName }) {
    for (const nameAlt of ['startSec', 'endSec']) {
        if (opts.given.has(nameAlt) && !/^\d+(?:\.\d+)?$/.test(String(opts.opt[nameAlt] ?? ''))) {
            await msg.reply(`❌ -${nameAlt} precisa de segundos não negativos, como 0, 10 ou 2.5.`);
            return;
        }
        if (opts.given.has(nameAlt) && !Number.isFinite(Number(opts.opt[nameAlt]))) {
            await msg.reply(`❌ Valor de -${nameAlt} grande demais.`);
            return;
        }
    }
    if (opts.opt.endSec != null && Number(opts.opt.endSec) <= Number(opts.opt.startSec ?? 0)) {
        await msg.reply('❌ O segundo final (-es) deve ser maior que o inicial (-ss, padrão 0).');
        return;
    }
    if (opts.opt.audio && opts.opt.sticker) {
        await msg.reply('❌ Escolha áudio (-a) ou figurinha (-st) para esta execução.');
        return;
    }
    // Random: with Date.now() two /get in the same millisecond would use the same files
    const id = crypto.randomUUID();
    let originalFile = null;
    let outputFile = null;
    let logCmdFile = null;
    let logCmd = null;
    let notice = null; // the "Processando…": edited with the result (success or error)

    try {
        let urlInput;

        if (quotedMsg) {
            urlInput = quotedMsg.links?.length ? quotedMsg.links[0].link : extractFirstUrl(quotedMsg.body);
        } else {
            urlInput = opts.argv[0];
        }

        if (!urlInput) {
            await msg.reply('```' + getCommandSyntax('/get') + '```');
            return;
        }

        const { audio: isAudio, sticker: isSticker, verbose: isVerbose } = opts.opt;

        if (isDebugMode()) {
            printDebug(`urlInput=${urlInput} opts=`, opts);
        }

        if (!isValidHttpUrl(urlInput)) {
            throw new Error(`A URL '${urlInput}' é inválida. Ignorando`);
        }

        if (!(await isUrlPublic(urlInput))) {
            printInfo(`/get: URL recusada (host privado ou não resolvido) de '${senderName}': ${urlInput}`);
            throw new Error(`A URL '${urlInput}' aponta para um endereço não permitido. Ignorando`);
        }

        notice = await msg.reply(`💡 Processando ${isSticker ? 'seu sticker' : 'sua mídia'}, aguarde.`, null, { linkPreview: false });

        fs.mkdirSync(TMP_DIR, { recursive: true });

        originalFile = path.join(TMP_DIR, `${id}_original.mp4`);
        outputFile = path.join(TMP_DIR, `${id}_output.${isAudio ? 'mp3' : 'mp4'}`);
        logCmdFile = path.join(TMP_DIR, `${id}_cmd.log`);
        logCmd = fs.openSync(logCmdFile, 'a');

        printInfo(`> Todo o output dos comandos salvo em ${logCmdFile}`);

        // Download video
        // --no-playlist: a playlist link would download everything; --max-filesize: does not fill the disk
        const cmdYtArgs = [
            '-f', 'mp4', '--merge-output-format', 'mp4',
            '--no-playlist',
            '--max-filesize', `${getSetting('get.maxDownloadMB')}M`,
            '-o', originalFile,
            '--', urlInput
        ];
        const cmdYt = [BIN_YT, ...cmdYtArgs].join(' ');

        try {
            printInfo(`> Executando: ${cmdYt}`);
            fs.writeSync(logCmd, `# Executando: ${cmdYt}\n`);
            await runCommand(BIN_YT, cmdYtArgs, logCmd);
        } catch (inner) {
            const errorAlt = new Error(`Problemas para baixar com '${BIN_YT}'`, { cause: inner });
            errorAlt.cmd = cmdYt;
            throw errorAlt;
        }

        // Above --max-filesize yt-dlp aborts with no error and no file
        if (!fs.existsSync(originalFile)) {
            throw new Error(`Nada foi baixado (acima de ${getSetting('get.maxDownloadMB')} MB? veja o setting get.maxDownloadMB)`);
        }

        // Converter
        const ffmpegArgs = GetOptFromCommandForFfmpeg(opts, originalFile, outputFile);
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
            const media = MessageMedia.fromFilePath(outputFile);

            if (isVerbose) {
                let textMsg = '🛠️ *Verbose Mode*\n\n';
                textMsg += `💾 *yt-dlp*: _${cmdYt}_\n\n`;
                textMsg += `🔗 *ffmpeg*: _${cmdFfmpeg}_\n\n`;
                textMsg += '🧩 *cmdArgs*:```\n' + JSON.stringify(opts, null, 4) + '\n```';

                await msg.reply(textMsg, null, { linkPreview: false });
            }

            const msgOpts = { linkPreview: false, ...stickerMeta() };

            if (isSticker) {
                msgOpts.sendMediaAsSticker = true;
                printInfo(`> Enviando a mídia como sticker para '${senderName}'`);
            } else {
                msgOpts.caption = '📥 Aqui está a mídia para download.';
                msgOpts.sendMediaAsDocument = true;
                printInfo(`> Enviando a mídia ${outputFile} para '${senderName}'`);
            }

            await msg.reply(media, null, msgOpts);
        } catch (inner) {
            throw new Error(`Problemas para enviar com 'MessageMedia.fromFilePath(${outputFile})'`, {
                cause: inner
            });
        }

        // WhatsApp only edits text: the media goes separately and the notice becomes the confirmation
        await completeNotice(msg, notice, `✅ ${isSticker ? 'Sticker criado' : 'Mídia baixada'} com sucesso!`, { linkPreview: false });
    } catch (e) {
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

module.exports = {
    cmdGet
};
