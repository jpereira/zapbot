/*
 * /draw: desenha uma imagem com o GPT Image (OpenAI); com -gif, um GIF animado. Numa foto (a da própria
 * mensagem, na legenda, ou a respondida), edita a foto ou a anima. O /gpt -img e o /gpt -gif usam o mesmo
 * desenhar(), então os dois comandos se comportam igual.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { MessageMedia } = require('whatsapp-web.js');

const { concluirAviso } = require('../cliente');
const { getCommandSyntax } = require('./base');
const { BIN_FFMPEG, TMP_DIR } = require('../constantes');
const { printError } = require('../log');
const { SEM_CHAVE, chaveOpenAi, erroOpenAi, gerarImagem, medirConsumo } = require('../openaiChat');
const { SETTINGS_SCHEMA, getSetting } = require('../settings');
const { runCommand } = require('../util/processos');
const {
    MODELO_DE_GIF, MODELO_DE_IMAGEM, USOS_DO_DESENHE, USO_DE_IMAGEM, apagarAviso, avisarProcessando, erroDoModelo,
    fotoEmPng, imagemDaMensagem, responderConsumo, trocarModelo
} = require('./openaiComum');

// A legenda leva o pedido, cortado se for longo
const LEGENDA_MAX = 200;

// Os limites do -frames e do -ms são os dos settings que eles sobrepõem
const LIMITE_QUADROS = SETTINGS_SCHEMA['openai.gif.frames'];
const LIMITE_MS = SETTINGS_SCHEMA['openai.gif.frameMs'];

// O GIF da OpenAI vira um MP4 sem áudio: é assim que o WhatsApp toca um GIF (como o /giphy manda)
async function gifParaMp4(gif) {
    const pasta = path.join(TMP_DIR, `gif-${crypto.randomBytes(6).toString('hex')}`);
    fs.mkdirSync(pasta, { recursive: true });

    try {
        const entrada = path.join(pasta, 'entrada.gif');
        const saida = path.join(pasta, 'saida.mp4');
        fs.writeFileSync(entrada, gif);
        await runCommand(BIN_FFMPEG, [
            '-y', '-loglevel', 'error', '-i', entrada,
            '-movflags', 'faststart', '-pix_fmt', 'yuv420p',
            '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-an',
            saida
        ], 'ignore', 60_000);
        return fs.readFileSync(saida);
    } finally {
        fs.rmSync(pasta, { recursive: true, force: true });
    }
}

// A foto que serve de base: a da própria mensagem (legenda "/draw -gif ...") ou, na falta, a respondida
async function fotoDeReferencia(msg, quotedMsg, cmd) {
    return (await imagemDaMensagem(msg, cmd)) ?? (await imagemDaMensagem(quotedMsg, cmd));
}

// O GIF vai como vídeo em loop; se o ffmpeg falhar, o .gif ainda chega, como documento
async function enviarGif(msg, b64, legenda, cmd) {
    let mp4;
    try {
        mp4 = await gifParaMp4(Buffer.from(b64, 'base64'));
    } catch (err) {
        printError(`${cmd} -gif: ffmpeg falhou:`, err.message);
        await msg.reply(new MessageMedia('image/gif', b64, 'desenho.gif'), null, { caption: legenda, sendMediaAsDocument: true });
        return;
    }
    await msg.reply(new MessageMedia('video/mp4', mp4.toString('base64'), 'desenho.mp4'), null, { caption: legenda, sendVideoAsGif: true });
}

/**
 * Desenha (ou, com `gif`, anima) e responde com a mídia. Sem o pedido, responde `semPedido`.
 * @param {object} o
 * @param {object} o.msg
 * @param {string} o.cmd        o comando que chamou ("/draw", "/gpt"): aviso, log e erros
 * @param {string} o.pedido     o que o usuário digitou, sem as opções
 * @param {object} [o.quotedMsg]  a mensagem respondida: o texto dela entra no pedido e a foto dela é a base
 * @param {{ frames?: number, frameMs?: number } | null} [o.gif]  pede o GIF (o que faltar vem dos settings)
 * @param {string} o.semPedido  a resposta quando não há o que desenhar
 */
async function desenhar({ msg, cmd, pedido, quotedMsg = null, gif = null, semPedido }) {
    const foto = await fotoDeReferencia(msg, quotedMsg, cmd);
    if (foto?.erro) {
        await msg.reply(foto.erro);
        return;
    }

    // Respondendo uma mensagem, o texto dela (numa foto, a legenda) entra antes do pedido
    const texto = [quotedMsg?.body, pedido].filter(Boolean).join('\n\n').trim();
    if (!texto && !(gif && foto)) {
        await msg.reply(semPedido);
        return;
    }

    const animacao = gif && {
        frames: gif.frames ?? getSetting('openai.gif.frames'),
        frameMs: gif.frameMs ?? getSetting('openai.gif.frameMs')
    };
    const prompt = animacao && foto ? `Anime esta imagem em um GIF. ${texto || 'Com um movimento sutil e natural.'}` : texto;
    const legenda = `${animacao ? '🎞️' : '🎨'} ${texto.length > LEGENDA_MAX ? `${texto.slice(0, LEGENDA_MAX)}…` : texto}`.trim();

    const aviso = await avisarProcessando(msg, cmd);
    try {
        const b64 = await gerarImagem({ cmd, prompt, imagem: foto ? await fotoEmPng(foto) : null, gif: animacao });
        if (animacao) await enviarGif(msg, b64, legenda, cmd);
        else await msg.reply(new MessageMedia('image/png', b64, 'desenho.png'), null, { caption: legenda });
        await apagarAviso(aviso);
        await responderConsumo(msg);
    } catch (err) {
        const mensagem = err.response?.data?.error?.message ?? '';
        await concluirAviso(msg, aviso, await erroDoModelo(err, animacao ? MODELO_DE_GIF : MODELO_DE_IMAGEM, cmd) ||
            (animacao && /gif|preview/i.test(mensagem)
                ? `🔒 A sua conta/modelo não faz GIF animado: ${mensagem}\n💡 _Só os gpt-image-2.6-* fazem GIF, e pedem acesso à prévia. Troque com /set openai.image.gifModel <modelo>_`
                : erroOpenAi(err, cmd)));
    }
}

// -frames/-ms: inteiro dentro dos limites do setting que sobrepõem; null se ausente; lança se inválido
function lerInteiro(valor, { min, max }, nome) {
    if (valor == null) return null;
    const n = Number(valor);
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${nome} precisa ser um inteiro de ${min} a ${max}.`);
    return n;
}

async function desenhe({ msg, args, opts, quotedMsg }) {
    if (opts?.given.has('model')) {
        await trocarModelo(msg, opts.opt.model, opts, { cmd: '/draw', icone: '🎨', usos: USOS_DO_DESENHE, padrao: USO_DE_IMAGEM });
        return;
    }

    if (!chaveOpenAi()) {
        await msg.reply(SEM_CHAVE('/draw'));
        return;
    }

    // -frames e -ms valem como -gif
    let gif = null;
    if (['gif', 'frames', 'ms'].some(o => opts?.given.has(o))) {
        try {
            gif = {
                frames: lerInteiro(opts.opt.frames, LIMITE_QUADROS, '-frames') ?? undefined,
                frameMs: lerInteiro(opts.opt.ms, LIMITE_MS, '-ms') ?? undefined
            };
        } catch (e) {
            await msg.reply(`❌ ${e.message}`);
            return;
        }
    }

    // Sem opções, o texto vai como foi digitado (com os Enters); com elas, só o que sobra delas
    const pedido = opts?.given.size ? opts.argv.join(' ') : args;
    await desenhar({ msg, cmd: '/draw', pedido, quotedMsg, gif, semPedido: '```' + getCommandSyntax('/draw') + '```' });
}

// O -status|-s (ou o setting openai.status) mostra o consumo da chamada no rodapé
const cmdDraw = (ctx) => medirConsumo(ctx.opts?.given.has('status'), () => desenhe(ctx));

module.exports = {
    cmdDraw,
    desenhar
};
