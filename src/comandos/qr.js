/*
 * Comandos /qr e /decodeqr: gera e lê QR Codes.
 *   /qr <texto>            → o QR Code do texto (sem texto: o da mensagem respondida)
 *   /qr -decode            → lê o QR Code de uma imagem (respondida, ou a foto com a legenda)
 *   /decodeqr              → o mesmo que /qr -decode
 *   /decodeqr -encode <t>  → o mesmo que /qr <texto>
 */

const jsQR = require('jsqr');
const qrcode = require('qrcode');
const sharp = require('sharp');
const { MessageMedia } = require('whatsapp-web.js');

const { ehFoto } = require('./openaiComum');
const { t } = require('../i18n');
const { printError } = require('../log');

const MAX_CARACTERES = 1000;
const LADO_MAX = 1600; // a foto de um QR Code não precisa de mais

// O texto do comando sem a opção de modo (preserva as quebras de linha do que foi digitado)
const semModo = (args) => args.replace(/(^|\s)-(?:decode|d|encode|e)(?=\s|$)/g, ' ').trim();

async function gerar({ msg, args, quotedMsg }) {
    const texto = semModo(args) || String(quotedMsg?.body ?? '').trim();
    if (!texto) {
        await msg.reply(t('qr.usage'));
        return;
    }
    if (texto.length > MAX_CARACTERES) {
        await msg.reply(t('qr.tooLong', { n: texto.length, max: MAX_CARACTERES }));
        return;
    }

    const png = await qrcode.toBuffer(texto, { type: 'png', width: 512, margin: 2 });
    await msg.reply(new MessageMedia('image/png', png.toString('base64'), 'qrcode.png'));
}

/**
 * O texto do QR Code de uma imagem (null: não achou nenhum).
 * @param {Buffer} imagem
 */
async function lerQr(imagem) {
    const { data, info } = await sharp(imagem)
        .resize({ width: LADO_MAX, height: LADO_MAX, fit: 'inside', withoutEnlargement: true })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    return jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data ?? null;
}

async function ler({ msg, quotedMsg }) {
    const origem = [quotedMsg, msg].find(ehFoto);
    if (!origem) {
        await msg.reply(t('qr.decodeUsage'));
        return;
    }

    const midia = await origem.downloadMedia().catch(() => null);
    if (!midia?.data) {
        await msg.reply(t('qr.download'));
        return;
    }

    try {
        const texto = await lerQr(Buffer.from(midia.data, 'base64'));
        // O 📱 na frente também garante que a resposta nunca começa com "/" (ver marcarEnviadaPeloBot)
        await msg.reply(texto ? `📱 ${texto}` : t('qr.notFound'));
    } catch (err) {
        printError('/qr: não consegui ler a imagem:', err.message);
        await msg.reply(t('qr.notFound'));
    }
}

const cmdQr = (ctx) => (ctx.opts?.given.has('decode') ? ler(ctx) : gerar(ctx));
const cmdDecodeqr = (ctx) => (ctx.opts?.given.has('encode') ? gerar(ctx) : ler(ctx));

module.exports = { cmdDecodeqr, cmdQr, lerQr };
