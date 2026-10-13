/*
 * Comando /get.
 */

const { MessageMedia } = require('whatsapp-web.js');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs-extra');

const { formatarErroComando, getCommandSyntax } = require('./base');
const { concluirAviso } = require('../cliente');
const { BIN_FFMPEG, BIN_YT, GET_MAX_CONCURRENT, TMP_DIR } = require('../constantes');
const { printDebug, printError, printInfo } = require('../log');
const { argsDoFfmpeg, enquadrarSticker } = require('../midia');
const { getSetting, isDebugMode, stickerMeta } = require('../settings');
const { runCommand } = require('../util/processos');
const { extractFirstUrl, isUrlPublica, isValidHttpUrl } = require('../util/url');

let getEmAndamento = 0;

const MSG_STICKER = { sendMediaAsSticker: true };
const MSG_DOCUMENTO = { caption: '📥 Aqui está a mídia para download.', sendMediaAsDocument: true };

async function cmdGet(ctx) {
    await baixarMidia(ctx, { cmd: '/get' });
}

/**
 * O /get: valida as opções, acha a origem (a URL digitada, a mídia respondida
 * ou o link da mensagem respondida) e manda a mídia, convertida pelo ffmpeg
 * quando precisa.
 * @param {object} ctx  o contexto do comando
 * @param {object} o
 * @param {string} o.cmd  o comando digitado (para a sintaxe)
 */
async function baixarMidia({ msg, opts, quotedMsg, senderName }, { cmd }) {
    if (!(await opcoesValidas(msg, opts))) return;

    const origem = origemDaMidia(opts, quotedMsg);
    if (!origem) {
        await msg.reply(quotedMsg ? '❌ A mensagem respondida não tem mídia nem link.' : '```' + getCommandSyntax(cmd) + '```');
        return;
    }

    let media = null;
    if (origem.citada) {
        media = await baixarCitada(msg, origem.citada);
        if (!media) return;
        if (await enviarSemConverter(msg, media, opts)) return;
        // Áudio só vira áudio: com -ss/-es sai em mp3
        if (tipoDaMidia(media) === 'audio') opts = { ...opts, opt: { ...opts.opt, audio: true } };
    }

    // Usuários liberados também usam: dois downloads já dão trabalho suficiente à CPU.
    if (getEmAndamento >= GET_MAX_CONCURRENT) {
        await msg.reply(`⏳ Já existem ${GET_MAX_CONCURRENT} downloads em andamento. Tente de novo em instantes.`);
        return;
    }

    getEmAndamento++;

    try {
        await converterEEnviar({ msg, opts, senderName, url: origem.url, media });
    } finally {
        getEmAndamento--;
    }
}

async function opcoesValidas(msg, opts) {
    for (const nome of ['startSec', 'endSec']) {
        if (opts.given.has(nome) && !/^\d+(?:\.\d+)?$/.test(String(opts.opt[nome] ?? ''))) {
            await msg.reply(`❌ -${nome} precisa de segundos não negativos, como 0, 10 ou 2.5.`);
            return false;
        }
        if (opts.given.has(nome) && !Number.isFinite(Number(opts.opt[nome]))) {
            await msg.reply(`❌ Valor de -${nome} grande demais.`);
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
 * A URL digitada vale mais que a mensagem respondida. Na respondida, a mídia
 * vale mais que um link na legenda dela.
 */
function origemDaMidia(opts, quotedMsg) {
    if (opts.argv[0]) return { url: opts.argv[0] };
    if (!quotedMsg) return null;
    if (quotedMsg.hasMedia) return { citada: quotedMsg };

    const url = quotedMsg.links?.length ? quotedMsg.links[0].link : extractFirstUrl(quotedMsg.body);
    return url ? { url, doLink: quotedMsg } : null;
}

async function baixarCitada(msg, citada) {
    const media = await citada.downloadMedia().catch((err) => {
        printError('/get: falha ao baixar a mídia respondida:', err.message);
        return null;
    });
    if (!media?.data) {
        await msg.reply('❌ Não consegui baixar a mídia respondida (ela ainda está no celular?).');
        return null;
    }
    return media;
}

function tipoDaMidia(media) {
    const tipo = String(media?.mimetype ?? '').split('/')[0];
    return { image: 'imagem', video: 'video', audio: 'audio' }[tipo] ?? null;
}

/*
 * Mídia respondida que não precisa do ffmpeg (imagem, ou o arquivo como
 * veio) ou que não serve para o pedido.
 * @returns {Promise<boolean>} true = já respondeu
 */
async function enviarSemConverter(msg, media, opts) {
    const tipo = tipoDaMidia(media);
    const corte = opts.given.has('startSec') || opts.given.has('endSec');
    const { audio, sticker } = opts.opt;

    const erro = !tipo ? '❌ A mídia respondida não é imagem, vídeo nem áudio.'
        : tipo === 'imagem' && corte ? '❌ O -ss e o -es só valem para vídeo.'
            : tipo === 'imagem' && audio ? '❌ A imagem respondida não tem áudio.'
                : tipo === 'audio' && sticker ? '❌ Não dá para fazer figurinha de um áudio.'
                    : null;
    if (erro) {
        await msg.reply(erro);
        return true;
    }

    if (tipo === 'imagem' && sticker) {
        await msg.reply(await enquadrarSticker(media), null, { ...MSG_STICKER, ...stickerMeta() });
        return true;
    }

    // Sem conversão pedida: o arquivo original, como documento
    if (tipo === 'imagem' || (!audio && !sticker && !corte)) {
        await msg.reply(media, null, { ...MSG_DOCUMENTO, linkPreview: false });
        return true;
    }

    return false;
}

// A extensão do arquivo temporário da mídia respondida (o ffmpeg olha o conteúdo)
const extensaoDe = (media) => String(media.mimetype).split(/[/;]/)[1]?.replace(/[^a-z0-9]/gi, '') || 'bin';

async function converterEEnviar({ msg, opts, senderName, url, media }) {
    // Aleatório: com Date.now() dois /get no mesmo milissegundo usariam os mesmos arquivos
    const id = crypto.randomUUID();
    let originalFile = null;
    let outputFile = null;
    let logCmdFile = null;
    let logCmd = null;
    let aviso = null; // o "Processando…": editado com o resultado (sucesso ou erro)

    try {
        const { audio: isAudio, sticker: isSticker, verbose: isVerbose } = opts.opt;

        if (isDebugMode()) {
            printDebug(`url=${url} media=${media?.mimetype} opts=`, opts);
        }

        if (url && !isValidHttpUrl(url)) {
            throw new Error(`A URL '${url}' é inválida. Ignorando`);
        }

        if (url && !(await isUrlPublica(url))) {
            printInfo(`/get: URL recusada (host privado ou não resolvido) de '${senderName}': ${url}`);
            throw new Error(`A URL '${url}' aponta para um endereço não permitido. Ignorando`);
        }

        aviso = await msg.reply(`💡 Processando ${isSticker ? 'seu sticker' : 'sua mídia'}, aguarde.`, null, { linkPreview: false });

        fs.mkdirSync(TMP_DIR, { recursive: true });

        originalFile = path.join(TMP_DIR, `${id}_original.${media ? extensaoDe(media) : 'mp4'}`);
        outputFile = path.join(TMP_DIR, `${id}_output.${isAudio ? 'mp3' : 'mp4'}`);
        logCmdFile = path.join(TMP_DIR, `${id}_cmd.log`);
        logCmd = fs.openSync(logCmdFile, 'a');

        printInfo(`> Todo o output dos comandos salvo em ${logCmdFile}`);

        let cmdYt = null;
        if (media) {
            fs.writeFileSync(originalFile, Buffer.from(media.data, 'base64'));
        } else {
            // Baixar vídeo
            // --no-playlist: um link de playlist baixaria tudo; --max-filesize: não enche o disco
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
                const erro = new Error(`Problemas para baixar com '${BIN_YT}'`, { cause: inner });
                erro.cmd = cmdYt;
                throw erro;
            }

            // Acima do --max-filesize o yt-dlp aborta sem erro e sem gerar o arquivo
            if (!fs.existsSync(originalFile)) {
                throw new Error(`Nada foi baixado (acima de ${getSetting('get.maxDownloadMB')} MB? veja o setting get.maxDownloadMB)`);
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
            const erro = new Error(`Problemas para decodificar com '${BIN_FFMPEG}'`, { cause: inner });
            erro.cmd = cmdFfmpeg;
            throw erro;
        }

        const maxSizeMB = getSetting('get.maxSizeMB');
        if (fs.statSync(outputFile).size > maxSizeMB * 1024 * 1024) {
            throw new Error(`Arquivo muito grande para WhatsApp Web (máx. ${maxSizeMB} MB)`);
        }

        try {
            const saida = MessageMedia.fromFilePath(outputFile);

            if (isVerbose) {
                let textMsg = '🛠️ *Verbose Mode*\n\n';
                if (cmdYt) textMsg += `💾 *yt-dlp*: _${cmdYt}_\n\n`;
                textMsg += `🔗 *ffmpeg*: _${cmdFfmpeg}_\n\n`;
                textMsg += '🧩 *cmdArgs*:```\n' + JSON.stringify(opts, null, 4) + '\n```';

                await msg.reply(textMsg, null, { linkPreview: false });
            }

            if (isSticker) {
                printInfo(`> Enviando a mídia como sticker para '${senderName}'`);
                await msg.reply(saida, null, { linkPreview: false, ...MSG_STICKER, ...stickerMeta() });
            } else {
                printInfo(`> Enviando a mídia ${outputFile} para '${senderName}'`);
                await msg.reply(saida, null, { linkPreview: false, ...MSG_DOCUMENTO, ...stickerMeta() });
            }
        } catch (inner) {
            throw new Error(`Problemas para enviar com 'MessageMedia.fromFilePath(${outputFile})'`, {
                cause: inner
            });
        }

        // O WhatsApp só edita texto: a mídia vai à parte e o aviso vira a confirmação
        await concluirAviso(msg, aviso, `✅ ${isSticker ? 'Sticker criado' : 'Mídia baixada'} com sucesso!`, { linkPreview: false });
    } catch (e) {
        printError(e.message);
        await concluirAviso(msg, aviso, formatarErroComando(e), { linkPreview: false });
    } finally {
        if (logCmd !== null) {
            try { fs.closeSync(logCmd); } catch { /* já fechado */ }
        }

        for (const tmp of [originalFile, outputFile, logCmdFile]) {
            if (!tmp) continue;
            try { fs.unlinkSync(tmp); } catch { /* arquivo pode não existir */ }
        }
    }
}

module.exports = {
    baixarMidia,
    cmdGet
};
