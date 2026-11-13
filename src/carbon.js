/*
 * /carbon: o código numa imagem de "janela de editor", desenhada em SVG e convertida em PNG pelo sharp
 * (nada de serviço externo). O realce é simples: comentários, textos, números e palavras-chave.
 */

const sharp = require('sharp');

const TEMAS = {
    dark: {
        fundo: '#7c5cff', janela: '#1e1e2e', barra: '#181825', texto: '#cdd6f4',
        comentario: '#6c7086', texto_str: '#a6e3a1', numero: '#fab387', palavra: '#cba6f7'
    },
    light: {
        fundo: '#ffb86b', janela: '#fafafa', barra: '#ececec', texto: '#383a42',
        comentario: '#a0a1a7', texto_str: '#50a14f', numero: '#b76b01', palavra: '#a626a4'
    }
};

const FONTE = 14;
const LARGURA_CHAR = FONTE * 0.6; // fonte monoespaçada
const ALTURA_LINHA = 22;
const MARGEM = 32;         // entre a imagem e a janela
const PREENCHIMENTO = 24;  // dentro da janela
const BARRA = 40;
const MAX_LINHAS = 60;
const MAX_COLUNAS = 120;

const PALAVRAS = new Set((
    'abstract as async await break case catch class const continue def default defer do elif else enum except ' +
    'export extends false fi finally fn for from func function if impl import in interface lambda let loop match ' +
    'new nil none null package private public pub pass raise return self static struct switch then this throw ' +
    'true try type use var void while with yield'
).split(' '));

const TOKEN = /(\/\/.*|(?:^|\s)#.*|\/\*.*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_]\w*)\b/g;

const escapar = (s) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * O código sem a cerca de Markdown (```lang ... ```), com os tabs em 4 espaços e dentro dos limites.
 * @returns {string[]} as linhas
 */
function linhasDoCodigo(codigo) {
    const limpo = String(codigo).replace(/^\s*```[\w+-]*\n?/, '').replace(/\n?```\s*$/, '').replace(/\t/g, '    ');
    return limpo.replace(/\s+$/, '').split('\n').slice(0, MAX_LINHAS).map(l => l.replace(/\s+$/, '').slice(0, MAX_COLUNAS));
}

// Os <tspan> coloridos de uma linha
function realcar(linha, tema) {
    let saida = '';
    let ultimo = 0;
    for (const m of linha.matchAll(TOKEN)) {
        saida += escapar(linha.slice(ultimo, m.index));
        ultimo = m.index + m[0].length;

        const [inteiro, comentario, texto, numero, palavra] = m;
        if (comentario) saida += `<tspan fill="${tema.comentario}">${escapar(inteiro)}</tspan>`;
        else if (texto) saida += `<tspan fill="${tema.texto_str}">${escapar(inteiro)}</tspan>`;
        else if (numero) saida += `<tspan fill="${tema.numero}">${escapar(inteiro)}</tspan>`;
        else if (PALAVRAS.has(palavra)) saida += `<tspan fill="${tema.palavra}">${escapar(inteiro)}</tspan>`;
        else saida += escapar(inteiro);
    }
    return saida + escapar(linha.slice(ultimo));
}

/**
 * @param {string} codigo
 * @param {'dark'|'light'} [tema]
 * @returns {string}  o SVG
 */
function montarSvg(codigo, tema = 'dark') {
    const cores = TEMAS[tema] ?? TEMAS.dark;
    const linhas = linhasDoCodigo(codigo);
    const colunas = Math.max(20, ...linhas.map(l => l.length));
    const larguraJanela = Math.ceil(colunas * LARGURA_CHAR + 2 * PREENCHIMENTO);
    const alturaJanela = BARRA + linhas.length * ALTURA_LINHA + 2 * PREENCHIMENTO;
    const largura = larguraJanela + 2 * MARGEM;
    const altura = alturaJanela + 2 * MARGEM;

    const texto = linhas.map((l, i) =>
        `<text x="${MARGEM + PREENCHIMENTO}" y="${MARGEM + BARRA + PREENCHIMENTO + i * ALTURA_LINHA + FONTE}" ` +
        `xml:space="preserve">${realcar(l, cores)}</text>`).join('');

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}">` +
        `<rect width="${largura}" height="${altura}" fill="${cores.fundo}"/>` +
        `<rect x="${MARGEM}" y="${MARGEM}" width="${larguraJanela}" height="${alturaJanela}" rx="10" fill="${cores.janela}"/>` +
        `<path d="M${MARGEM} ${MARGEM + BARRA}V${MARGEM + 10}a10 10 0 0 1 10-10H${MARGEM + larguraJanela - 10}a10 10 0 0 1 10 10V${MARGEM + BARRA}z" fill="${cores.barra}"/>` +
        ['#ff5f56', '#ffbd2e', '#27c93f'].map((c, i) =>
            `<circle cx="${MARGEM + 22 + i * 20}" cy="${MARGEM + BARRA / 2}" r="6" fill="${c}"/>`).join('') +
        `<g font-family="FreeMono, DejaVu Sans Mono, Menlo, Consolas, monospace" font-size="${FONTE}" fill="${cores.texto}">${texto}</g>` +
        '</svg>';
}

/** @returns {Promise<Buffer>}  o PNG (em 2x, nítido no celular) */
const gerarImagem = (codigo, tema) => sharp(Buffer.from(montarSvg(codigo, tema)), { density: 192 }).png().toBuffer();

module.exports = { MAX_COLUNAS, MAX_LINHAS, TEMAS, gerarImagem, linhasDoCodigo, montarSvg };
