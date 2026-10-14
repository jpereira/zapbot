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
const { STICKER_ANIMADO_MAX_BYTES, TENTATIVAS_STICKER, argsDoFfmpeg, enquadrarSticker, thumbnailDoLink } = require('../midia');
const { getSetting, isDebugMode, stickerMeta } = require('../settings');
const { humanSize } = require('../util/arquivos');
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
    if (!(await opcoesValidas(msg, opts, cmd))) return;

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
        // Figurinha de um link sem vídeo (matéria, post de foto): a prévia do link
        const previa = opts.opt.sticker ? origem.doLink : null;
        await converterEEnviar({ msg, opts, senderName, url: origem.url, media, previa });
    } finally {
        getEmAndamento--;
    }
}

/*
 * Tempo do -ss/-es em segundos: "22", "2.5", "09:33" (min:seg) ou "1:02:03"
 * (h:min:seg). Minutos e segundos depois do ":" vão até 59. Inválido: null.
 */
function lerTempo(valor) {
    const m = String(valor ?? '').match(/^(?:(?:(\d+):)?(\d+):)?(\d+(?:\.\d+)?)$/);
    if (!m) return null;
    const [, h, min, seg] = m;
    if (min !== undefined && Number(seg) >= 60) return null;
    if (h !== undefined && Number(min) >= 60) return null;
    const total = Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Number(seg);
    // Sem o ruído do ponto flutuante: "1:00.1" é 60.1, não 60.099999...
    return Number.isFinite(total) ? Math.round(total * 1000) / 1000 : total;
}

async function opcoesValidas(msg, opts, cmd) {
    // O parser deixa a opção que não conhece no argv: sem isto, ela viraria a URL
    const desconhecida = opts.argv.find(a => /^-\S/.test(a));
    if (desconhecida) {
        await msg.reply(`❌ Opção desconhecida: ${desconhecida}\n💡 _Veja as opções com ${cmd} -h_`);
        return false;
    }
    for (const nome of ['startSec', 'endSec']) {
        if (!opts.given.has(nome)) continue;
        const segundos = lerTempo(opts.opt[nome]);
        if (segundos === null) {
            await msg.reply(`❌ -${nome} precisa de um tempo em segundos (0, 10, 2.5) ou em minutos (09:33, 1:02:03).`);
            return false;
        }
        if (!Number.isFinite(segundos)) {
            await msg.reply(`❌ Valor de -${nome} grande demais.`);
            return false;
        }
        // O ffmpeg recebe sempre segundos
        opts.opt[nome] = String(segundos);
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
        await msg.reply('❌ Não consegui baixar a mídia respondida: ela pode não estar mais disponível no WhatsApp.');
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

    // Sem conversão pedida: o arquivo original, como documento (sem nome, o WhatsApp mostra "Sem título")
    if (tipo === 'imagem' || (!audio && !sticker && !corte)) {
        const arquivo = media.filename ? media : new MessageMedia(media.mimetype, media.data, `zapbot.${extensaoDe(media)}`);
        await msg.reply(arquivo, null, { ...MSG_DOCUMENTO, linkPreview: false });
        return true;
    }

    return false;
}

// A extensão da mídia respondida, pelo mimetype (o ffmpeg olha o conteúdo, não o nome)
const extensaoDe = (media) => String(media.mimetype).split(/[/;]/)[1]?.replace(/[^a-z0-9]/gi, '') || 'bin';

async function converterEEnviar({ msg, opts, senderName, url, media, previa }) {
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
            throw erroAoBaixar(`A URL '${url}' é inválida. Ignorando`);
        }

        if (url && !(await isUrlPublica(url))) {
            printInfo(`/get: URL recusada (host privado ou não resolvido) de '${senderName}': ${url}`);
            throw erroAoBaixar(`A URL '${url}' aponta para um endereço não permitido. Ignorando`);
        }

        aviso = await msg.reply(`⏳ Processando ${isSticker ? 'seu sticker' : 'sua mídia'}, aguarde.`, null, { linkPreview: false });

        fs.mkdirSync(TMP_DIR, { recursive: true });

        originalFile = path.join(TMP_DIR, `${id}_original.${media ? extensaoDe(media) : 'mp4'}`);
        outputFile = path.join(TMP_DIR, `${id}_output.${isAudio ? 'mp3' : isSticker ? 'webp' : 'mp4'}`);
        logCmdFile = path.join(TMP_DIR, `${id}_cmd.log`);
        logCmd = fs.openSync(logCmdFile, 'a');

        printInfo(`> Todo o output dos comandos salvo em ${logCmdFile}`);

        let cmdYt = null;
        let optsFfmpeg = opts; // com o trecho baixado, o corte do ffmpeg começa no 0
        const trecho = trechoDoDownload(opts);
        if (media) {
            fs.writeFileSync(originalFile, Buffer.from(media.data, 'base64'));
        } else {
            // Com corte, tenta baixar só o trecho; se o site não deixar, baixa tudo e o ffmpeg corta
            if (trecho) {
                try {
                    cmdYt = await baixarComYtDlp(url, originalFile, logCmd, trecho);
                    optsFfmpeg = optsDoTrecho(opts, trecho);
                } catch (inner) {
                    printInfo(`> O trecho falhou (${inner.message}): baixando o vídeo inteiro`);
                    fs.rmSync(originalFile, { force: true });
                }
            }
            if (optsFfmpeg === opts) {
                cmdYt = await baixarComYtDlp(url, originalFile, logCmd);
            }

            // Acima do --max-filesize o yt-dlp aborta sem erro e sem gerar o arquivo
            if (!fs.existsSync(originalFile)) {
                throw erroAoBaixar(`Nada foi baixado (acima de ${getSetting('get.maxDownloadMB')} MB? veja o setting get.maxDownloadMB)`);
            }
            printInfo(`> Baixado ${optsFfmpeg === opts ? 'o vídeo inteiro' : 'o trecho'}: ${humanSize(fs.statSync(originalFile).size)}`);
        }

        // Converter. A figurinha reduz qualidade e fps até caber no limite do WhatsApp
        const tentativas = isSticker ? TENTATIVAS_STICKER : [undefined];
        let cmdFfmpeg = null;

        for (const tentativa of tentativas) {
            const ffmpegArgs = argsDoFfmpeg(optsFfmpeg, originalFile, outputFile, tentativa);
            cmdFfmpeg = [BIN_FFMPEG, ...ffmpegArgs].join(' ');

            try {
                printInfo(`> Executando: ${cmdFfmpeg}`);
                fs.writeSync(logCmd, `\n\n# Executando: ${cmdFfmpeg}\n`);
                await runCommand(BIN_FFMPEG, ffmpegArgs, logCmd);
            } catch (inner) {
                const erro = new Error(`Problemas para decodificar com '${BIN_FFMPEG}'`, { cause: inner });
                erro.cmd = cmdFfmpeg;
                throw erro;
            }

            if (!isSticker || fs.statSync(outputFile).size <= STICKER_ANIMADO_MAX_BYTES) break;
            if (tentativa === tentativas.at(-1)) {
                throw new Error(`Figurinha grande demais para o WhatsApp (máx. ${STICKER_ANIMADO_MAX_BYTES / 1024} KB): `
                    + 'tente um trecho menor com -ss e -es');
            }
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
        if (e.aoBaixar && previa && (await stickerDaPrevia(msg, previa, aviso, e))) return;
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

/*
 * O trecho pedido com -ss/-es, em segundos, para o --download-sections do
 * yt-dlp (fim null: até o final). A figurinha leva no máximo os 6 s
 * seguintes. Sem corte: null.
 */
function trechoDoDownload(opts) {
    const { startSec, endSec, sticker } = opts.opt;
    if (startSec == null && endSec == null && !sticker) return null;
    const inicio = Number(startSec ?? 0);
    // A figurinha tem no máximo 6 s: baixar além disso é desperdício
    const fim = sticker ? Math.min(Number(endSec ?? Infinity), inicio + 6) : endSec != null ? Number(endSec) : null;
    return { inicio, fim: fim === null ? null : Math.round(fim * 1000) / 1000 };
}

// O arquivo do trecho já começa no -ss: o ffmpeg só limita a duração
function optsDoTrecho(opts, { inicio, fim }) {
    const endSec = fim === null ? null : String(Math.round((fim - inicio) * 1000) / 1000);
    return { ...opts, opt: { ...opts.opt, startSec: null, endSec } };
}

/**
 * Baixa a URL com o yt-dlp; com `trecho`, só ele (cortado no tempo exato).
 * @returns {Promise<string>} o comando executado
 */
async function baixarComYtDlp(url, originalFile, logCmd, trecho = null) {
    // --no-playlist: um link de playlist baixaria tudo; --max-filesize: não enche o disco
    // --force-keyframes-at-cuts: sem ele o trecho começa no keyframe anterior, antes do -ss
    const cmdYtArgs = [
        '-f', 'mp4', '--merge-output-format', 'mp4',
        '--no-playlist',
        '--max-filesize', `${getSetting('get.maxDownloadMB')}M`,
        ...(trecho ? ['--download-sections', `*${trecho.inicio}-${trecho.fim ?? 'inf'}`, '--force-keyframes-at-cuts'] : []),
        '-o', originalFile,
        '--', url
    ];
    const cmdYt = [BIN_YT, ...cmdYtArgs].join(' ');

    try {
        printInfo(`> Executando: ${cmdYt}`);
        fs.writeSync(logCmd, `# Executando: ${cmdYt}\n`);
        await runCommand(BIN_YT, cmdYtArgs, logCmd);
    } catch (inner) {
        const erro = erroAoBaixar(`Problemas para baixar com '${BIN_YT}'`, { cause: inner });
        erro.cmd = cmdYt;
        throw erro;
    }
    return cmdYt;
}

// Falha antes de ter o vídeo: a figurinha de um link ainda pode sair da prévia
function erroAoBaixar(mensagem, opcoes) {
    return Object.assign(new Error(mensagem, opcoes), { aoBaixar: true });
}

/*
 * O vídeo do link não veio: a figurinha sai da prévia que o WhatsApp mostra
 * para o link (como o /sticker fazia antes de baixar o vídeo).
 * @returns {Promise<boolean>} true = a figurinha foi enviada
 */
async function stickerDaPrevia(msg, citada, aviso, motivo) {
    try {
        const thumb = await thumbnailDoLink(citada);
        if (!thumb) return false;

        printInfo(`/sticker: sem o vídeo do link (${motivo.message}); usando a prévia`);
        await msg.reply(await enquadrarSticker(thumb), null, { ...MSG_STICKER, ...stickerMeta() });
        if (aviso) await concluirAviso(msg, aviso, '✅ Sticker criado com sucesso!', { linkPreview: false });
        return true;
    } catch (err) {
        printError('/sticker: falha ao usar a prévia do link:', err.message);
        return false;
    }
}

module.exports = {
    baixarMidia,
    cmdGet
};
