/*
 * /sticker -txt: figurinha animada com um texto que pisca trocando as cores do
 * -fg (letra) e do -bg (fundo). Os quadros saem em PNG pelo sharp (Pango: quebra
 * as linhas e ajusta a fonte à área) e o ffmpeg junta num WEBP animado, que o
 * WhatsApp aceita como figurinha sem conversão.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const { BIN_FFMPEG, TMP_DIR } = require('./constantes');
const { runCommand } = require('./util/processos');

const TAMANHO = 512;
const MARGEM = 40;           // o texto fica numa área de 432x432, longe da borda
const MAX_CARACTERES = 200;
const QUADROS_POR_SEGUNDO = 2;   // pisca a cada meio segundo

// "#fff", "FFFFFF" ou "#ffffff" → "#FFFFFF"; inválida → null
function lerCor(valor) {
    const m = String(valor ?? '').trim().replace(/^#/, '').match(/^([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) return null;
    const hex = m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1];
    return `#${hex.toUpperCase()}`;
}

// O Pango lê marcação (<b>, &...): o texto do usuário vai escapado
const escapar = (texto) => texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Os dois quadros: letra fg no fundo bg, e o contrário.
 * @returns {Promise<Buffer[]>} PNGs 512x512
 */
async function quadrosDoTexto(texto, { fg, bg }) {
    const quadro = async (letra, fundo) => {
        const area = TAMANHO - 2 * MARGEM;
        const escrito = await sharp({
            text: {
                text: `<span foreground="${letra}">${escapar(texto)}</span>`,
                font: 'sans bold',
                width: area,
                height: area,
                align: 'centre',
                wrap: 'word-char',
                rgba: true
            }
        }).png().toBuffer();

        return sharp({ create: { width: TAMANHO, height: TAMANHO, channels: 4, background: fundo } })
            .composite([{ input: escrito, gravity: 'centre' }])
            .png()
            .toBuffer();
    };

    return [await quadro(fg, bg), await quadro(bg, fg)];
}

/**
 * O WEBP animado (base64) do texto, pronto para ir como figurinha.
 */
async function stickerDeTexto(texto, cores) {
    const pasta = path.join(TMP_DIR, `sticker-${crypto.randomBytes(6).toString('hex')}`);
    fs.mkdirSync(pasta, { recursive: true });

    try {
        const quadros = await quadrosDoTexto(texto, cores);
        quadros.forEach((png, i) => fs.writeFileSync(path.join(pasta, `quadro_${i}.png`), png));

        const saida = path.join(pasta, 'sticker.webp');
        await runCommand(BIN_FFMPEG, [
            '-y', '-loglevel', 'error',
            '-framerate', String(QUADROS_POR_SEGUNDO),
            '-i', path.join(pasta, 'quadro_%d.png'),
            '-c:v', 'libwebp', '-lossless', '0', '-q:v', '75',
            '-loop', '0', '-an',
            saida
        ], 'ignore', 30_000);

        return fs.readFileSync(saida).toString('base64');
    } finally {
        fs.rmSync(pasta, { recursive: true, force: true });
    }
}

module.exports = {
    MAX_CARACTERES,
    lerCor,
    quadrosDoTexto,
    stickerDeTexto
};
