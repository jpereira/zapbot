/*
 * PDF simples, sem dependências: A4, Helvetica (fonte base do PDF), texto com quebra de linha,
 * paginação e cabeçalho/rodapé em todas as páginas. Só Latin-1: emojis e o que não couber saem.
 */

const LARGURA = 595;
const ALTURA = 842;
const MARGEM = 50;
const TOPO_CORPO = ALTURA - 80;
const BASE_CORPO = 70;

// Larguras da Helvetica (1/1000 em) dos caracteres ASCII 32..126
const LARGURAS = [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
    556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
    1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
    667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
    333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
    556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584
];
const NEGRITO = 1.06;  // a Helvetica-Bold é um pouco mais larga: sobra de segurança

const TROCAS = { '“': '"', '”': '"', '‘': "'", '’': "'", '–': '-', '—': '-', '…': '...', '•': '\x95', '\t': '    ' };

// Texto → só caracteres que a WinAnsi tem (Latin-1); emoji e afins somem
function limpar(texto) {
    return String(texto ?? '')
        .replace(/[“”‘’–—…•\t]/g, c => TROCAS[c])
        .replace(/\r/g, '')
        .replace(/‍|️|⃣/g, '')
        .replace(/[^\n\x20-\x7e\x95\xa0-\xff]/gu, '')
        .replace(/ +\n/g, '\n');
}

function larguraDe(texto, tamanho, negrito = false) {
    let w = 0;
    for (const c of texto) {
        const base = c.normalize('NFD')[0];
        const cod = base.charCodeAt(0);
        w += cod >= 32 && cod <= 126 ? LARGURAS[cod - 32] : 556;
    }
    return (w * tamanho * (negrito ? NEGRITO : 1)) / 1000;
}

// Quebra um parágrafo nas palavras que cabem em `max` pontos (palavra enorme é cortada)
function quebrar(paragrafo, tamanho, max, negrito = false) {
    const linhas = [];
    let atual = '';

    for (let palavra of paragrafo.split(' ')) {
        while (larguraDe(palavra, tamanho, negrito) > max) {
            let n = palavra.length;
            while (n > 1 && larguraDe(palavra.slice(0, n), tamanho, negrito) > max) n--;
            if (atual) linhas.push(atual);
            linhas.push(palavra.slice(0, n));
            atual = '';
            palavra = palavra.slice(n);
        }
        const teste = atual ? `${atual} ${palavra}` : palavra;
        if (atual && larguraDe(teste, tamanho, negrito) > max) {
            linhas.push(atual);
            atual = palavra;
        } else {
            atual = teste;
        }
    }
    linhas.push(atual);
    return linhas;
}

const escapar = (t) => t.replace(/[\\()]/g, '\\$&');

/*
 * @param {object}   o
 * @param {string}   o.titulo     cabeçalho, à esquerda
 * @param {string}   o.direita    cabeçalho, à direita (data/hora)
 * @param {string}   o.rodape     rodapé, à esquerda ("Página X de Y" vai à direita)
 * @param {object[]} o.blocos     { texto, tipo: 'titulo' | 'texto' | 'meta' | 'espaco' }
 * @returns {Buffer}
 */
function gerarPdf({ titulo, direita = '', rodape = '', blocos }) {
    const ESTILOS = {
        titulo: { fonte: 'F2', tamanho: 13, entre: 18, antes: 14, cor: '0.1 0.3 0.5' },
        texto: { fonte: 'F1', tamanho: 10.5, entre: 14, antes: 0, cor: '0 0 0' },
        meta: { fonte: 'F1', tamanho: 8.5, entre: 11, antes: 0, cor: '0.45 0.45 0.45' }
    };
    const paginas = [[]];
    let y = TOPO_CORPO;

    for (const b of blocos) {
        if (b.tipo === 'espaco') {
            y -= b.altura ?? 8;
            continue;
        }
        const e = ESTILOS[b.tipo ?? 'texto'];
        const recuo = b.recuo ?? 0;
        const linhas = limpar(b.texto).split('\n')
            .flatMap(p => quebrar(p, e.tamanho, LARGURA - 2 * MARGEM - recuo, e.fonte === 'F2'));

        y -= e.antes;
        // Título nunca fica sozinho no fim da página
        if (y - e.entre * (b.tipo === 'titulo' ? 3 : 1) < BASE_CORPO && y !== TOPO_CORPO) {
            paginas.push([]);
            y = TOPO_CORPO;
        }
        for (const linha of linhas) {
            if (y - e.entre < BASE_CORPO) {
                paginas.push([]);
                y = TOPO_CORPO;
            }
            y -= e.entre;
            if (linha) paginas.at(-1).push({ ...e, x: MARGEM + recuo, y, texto: linha });
        }
    }

    const total = paginas.length;
    const cab = limpar(titulo);
    const dir = limpar(direita);
    const rod = limpar(rodape);

    const objetos = [];  // 1-indexed pelo número do objeto
    const novo = (conteudo) => objetos.push(conteudo);
    novo('<< /Type /Catalog /Pages 2 0 R >>');
    novo(null);  // /Pages, preenchido abaixo
    novo('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    novo('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

    const texto = (fonte, tam, cor, x, y, t) =>
        `BT /${fonte} ${tam} Tf ${cor} rg ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapar(t)}) Tj ET\n`;
    const linhaHorizontal = (y) => `0.7 0.7 0.7 RG 0.5 w ${MARGEM} ${y} m ${LARGURA - MARGEM} ${y} l S\n`;
    const filhas = [];

    paginas.forEach((itens, i) => {
        let c = texto('F2', 11, '0.1 0.3 0.5', MARGEM, ALTURA - 45, cab);
        c += texto('F1', 9, '0.4 0.4 0.4', LARGURA - MARGEM - larguraDe(dir, 9), ALTURA - 45, dir);
        c += linhaHorizontal(ALTURA - 55);
        for (const it of itens) c += texto(it.fonte, it.tamanho, it.cor, it.x, it.y, it.texto);
        c += linhaHorizontal(52);
        const pag = `Página ${i + 1} de ${total}`;
        c += texto('F1', 8, '0.4 0.4 0.4', MARGEM, 38, rod);
        c += texto('F1', 8, '0.4 0.4 0.4', LARGURA - MARGEM - larguraDe(pag, 8), 38, pag);

        const bytes = Buffer.from(c, 'latin1');
        const conteudo = novo(`<< /Length ${bytes.length} >>\nstream\n${bytes.toString('latin1')}endstream`);
        const pagina = novo(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LARGURA} ${ALTURA}] ` +
            `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${conteudo} 0 R >>`);
        filhas.push(`${pagina} 0 R`);
    });
    objetos[1] = `<< /Type /Pages /Kids [${filhas.join(' ')}] /Count ${total} >>`;

    let pdf = '%PDF-1.4\n';
    const offsets = [];
    objetos.forEach((o, i) => {
        offsets.push(Buffer.byteLength(pdf, 'latin1'));
        pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
    });
    const xref = Buffer.byteLength(pdf, 'latin1');
    pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n` +
        offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('') +
        `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(pdf, 'latin1');
}

module.exports = { gerarPdf };
