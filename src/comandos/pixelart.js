/*
 * Comando /pixelart.
 */

const { MessageMedia } = require('whatsapp-web.js');
const axios = require('axios');
const sharp = require('sharp');

const { DAY_MS } = require('../constantes');
const { printError } = require('../log');
const { getSetting } = require('../settings');

/*
 * /pixelart: arte ANSI/ASCII aleatória do 16colo.rs (arquivo da cena artística de BBS).
 *   /pixelart            → de um dos packs do setting 'pixelart.packs'
 *   /pixelart <pack>     → do pack informado (ex.: chuck-norris-lvl)
 *   /pixelart -r         → de qualquer pack do arquivo
 *   /pixelart -y 1996    → de um pack do ano
 * A imagem vem renderizada pelo próprio site (/x1/<arquivo>.png). Título, artista e
 * grupo vêm do registro SAUCE gravado no fim do arquivo original.
 */
const SIXTEEN_URL = 'https://16colo.rs';
const SIXTEEN_API = 'https://api.16colo.rs/v0';
const PIXELART_EXT = /\.(ans|asc|ice|bin|xb|adf|idf|pcb|tnd)$/i;
const PACK_NOME = /^[A-Za-z0-9._-]{1,100}$/;
const WA_HD_MAX_PX = 4096; // maior lado aceito pelo WhatsApp com sendMediaAsHd
const HTTP_TIMEOUT_MS = 15000;

let todosOsPacksCache = { at: 0, nomes: [] };

const sortear = (lista) => lista[Math.floor(Math.random() * lista.length)];

// Lista completa de packs (~800 KB): baixada no máximo uma vez por dia
async function todosOsPacks() {
    if (Date.now() - todosOsPacksCache.at < DAY_MS) return todosOsPacksCache.nomes;

    const { data } = await axios.get(`${SIXTEEN_API}/pack`, { timeout: 30000, maxContentLength: 20 * 1024 * 1024 });
    todosOsPacksCache = { at: Date.now(), nomes: data.map(p => p.name).filter(n => PACK_NOME.test(n)) };

    return todosOsPacksCache.nomes;
}

// Esquece a lista completa (os testes partem sem ela)
function reiniciarPacks() {
    todosOsPacksCache = { at: 0, nomes: [] };
}

async function packsDoAno(ano) {
    const { data } = await axios.get(`${SIXTEEN_API}/year/${ano}`, { timeout: HTTP_TIMEOUT_MS });
    return data.map(p => p.name).filter(n => PACK_NOME.test(n));
}

// null se o pack não existe (a API responde 200 com [] em vez de 404)
async function lerPack(pack) {
    try {
        const { data } = await axios.get(`${SIXTEEN_API}/pack/${encodeURIComponent(pack)}`, { timeout: HTTP_TIMEOUT_MS });
        if (!data?.name) return null;

        const artes = (data.files ?? []).filter(f => PIXELART_EXT.test(f.filename) && !/^FILE_ID\./i.test(f.filename));
        return { nome: data.name, ano: data.year, artes };
    } catch (err) {
        if (err.response?.status === 404) return null;
        throw err;
    }
}

// SAUCE: registro de 128 bytes no fim do arquivo (título 35, autor 20, grupo 20, data 8)
function lerSauce(buf) {
    const i = buf.lastIndexOf('SAUCE00');
    if (i < 0 || buf.length - i < 128) return null;

    const campo = (ini, tam) => buf.subarray(i + ini, i + ini + tam).toString('latin1').replace(/\0/g, '').trim();
    const data = campo(82, 8);

    return {
        titulo: campo(7, 35),
        autor: campo(42, 20),
        grupo: campo(62, 20),
        data: /^\d{8}$/.test(data) ? `${data.slice(6, 8)}/${data.slice(4, 6)}/${data.slice(0, 4)}` : ''
    };
}

/*
 * Pixel art sofre com a compressão do WhatsApp: dobra o tamanho sem suavizar
 * (nearest) quando cabe no limite do HD, e fatia artes mais altas que o limite.
 */
async function prepararPixelArt(png) {
    const { width, height } = await sharp(png).metadata();
    const escala = Math.max(width, height) * 2 <= WA_HD_MAX_PX ? 2 : 1;
    const base = escala > 1
        ? await sharp(png).resize(width * escala, height * escala, { kernel: 'nearest' }).png().toBuffer()
        : png;

    const altura = height * escala;
    const partes = [];

    for (let top = 0; top < altura && partes.length < getSetting('pixelart.maxParts'); top += WA_HD_MAX_PX) {
        const h = Math.min(WA_HD_MAX_PX, altura - top);
        partes.push(h === altura ? base : await sharp(base).extract({ left: 0, top, width: width * escala, height: h }).png().toBuffer());
    }

    return { partes, cortada: altura > partes.length * WA_HD_MAX_PX };
}

async function cmdPixelArt({ msg, opts }) {
    try {
        let candidatos;

        if (opts.opt.random) {
            candidatos = await todosOsPacks();
        } else if (opts.opt.year !== null) {
            const ano = Number(opts.opt.year);
            if (!Number.isInteger(ano) || ano < 1980 || ano > new Date().getFullYear()) {
                await msg.reply('❌ Ano inválido. Ex.: /pixelart -y 1996');
                return;
            }
            candidatos = await packsDoAno(ano);
        } else if (opts.argv[0]) {
            if (!PACK_NOME.test(opts.argv[0])) {
                await msg.reply('❌ Nome de pack inválido. Ex.: /pixelart chuck-norris-lvl');
                return;
            }
            candidatos = [opts.argv[0]];
        } else {
            candidatos = getSetting('pixelart.packs');
        }

        if (!candidatos.length) {
            await msg.reply('❌ Nenhum pack encontrado.');
            return;
        }

        // Sorteando entre muitos packs, alguns só têm executáveis/textos: tenta outros
        let pack = null;
        for (let tentativa = 0; tentativa < 5 && !pack?.artes.length; tentativa++) {
            pack = await lerPack(sortear(candidatos));
            if (candidatos.length === 1) break;
        }

        if (!pack) {
            await msg.reply(`❌ Pack não encontrado: ${candidatos[0]}\n💡 _Veja os packs em ${SIXTEEN_URL}_`);
            return;
        }

        if (!pack.artes.length) {
            await msg.reply(`❌ O pack ${pack.nome} não tem artes ANSI/ASCII.`);
            return;
        }

        const arte = sortear(pack.artes);
        const arquivo = encodeURIComponent(arte.filename);
        const pagina = `${SIXTEEN_URL}/pack/${pack.nome}/${arquivo}`;

        const { data: png } = await axios.get(`${SIXTEEN_URL}/pack/${pack.nome}/x1/${arquivo}.png`, {
            responseType: 'arraybuffer', timeout: HTTP_TIMEOUT_MS, maxContentLength: 20 * 1024 * 1024
        });

        // O SAUCE é opcional: sem ele a arte sai só com o nome do arquivo
        const sauce = await axios.get(`${SIXTEEN_URL}/pack/${pack.nome}/raw/${arquivo}`, { responseType: 'arraybuffer', timeout: HTTP_TIMEOUT_MS })
            .then(({ data }) => lerSauce(Buffer.from(data)))
            .catch(() => null);

        const { partes, cortada } = await prepararPixelArt(Buffer.from(png));

        const autoria = [sauce?.autor, sauce?.grupo].filter(Boolean).join(' / ');
        let legenda = `🎨 *${sauce?.titulo || arte.filename}*\n`;
        if (autoria) legenda += `👤 ${autoria}\n`;
        legenda += `📦 ${pack.nome} (${sauce?.data || pack.ano})\n🔗 ${pagina}`;
        if (partes.length > 1) legenda += `\n🧩 Parte 1/${partes.length}${cortada ? ' _(arte cortada: veja inteira no link)_' : ''}`;

        for (const [i, parte] of partes.entries()) {
            const media = new MessageMedia('image/png', parte.toString('base64'), `${arte.filename}.png`);
            await msg.reply(media, null, {
                caption: i === 0 ? legenda : `🧩 Parte ${i + 1}/${partes.length}`,
                sendMediaAsHd: true,
                linkPreview: false
            });
        }
    } catch (err) {
        printError('/pixelart:', err.message);
        await msg.reply('❌ Não consegui buscar a arte no 16colo.rs agora.');
    }
}

module.exports = {
    cmdPixelArt,
    lerSauce,
    reiniciarPacks
};
