/*
 * PDF simples, sem dependências: A4, Helvetica (fonte base do PDF), texto com quebra de linha,
 * paginação e cabeçalho/rodapé em todas as páginas e imagens JPEG (RGB). Só Latin-1: emojis e o que
 * não couber saem.
 */

const LARGURA = 595;
const ALTURA = 842;
const MARGEM = 50;
const TOPO_CORPO = ALTURA - 80;
const BASE_CORPO = 70;
const IMAGEM_MAX_L = 300;  // a imagem cabe numa caixa de 300 x 260 pontos
const IMAGEM_MAX_A = 260;

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


/*
 * Ícones desenhados à mão (a Helvetica não tem emoji): cada um é uma função (x, y, t) → comandos
 * do PDF, num quadrado de lado t com o canto de baixo à esquerda em (x, y).
 */
const circulo = (cx, cy, r) => {
    const k = 0.5523 * r;
    const f = (n) => n.toFixed(2);
    return `${f(cx + r)} ${f(cy)} m ${f(cx + r)} ${f(cy + k)} ${f(cx + k)} ${f(cy + r)} ${f(cx)} ${f(cy + r)} c ` +
        `${f(cx - k)} ${f(cy + r)} ${f(cx - r)} ${f(cy + k)} ${f(cx - r)} ${f(cy)} c ` +
        `${f(cx - r)} ${f(cy - k)} ${f(cx - k)} ${f(cy - r)} ${f(cx)} ${f(cy - r)} c ` +
        `${f(cx + k)} ${f(cy - r)} ${f(cx + r)} ${f(cy - k)} ${f(cx + r)} ${f(cy)} c h `;
};

const ICONES = {
    // 🔗 duas argolas entrelaçadas
    link: (x, y, t) => `q 0.15 0.4 0.8 RG ${(t * 0.14).toFixed(2)} w ${circulo(x + t * 0.34, y + t * 0.5, t * 0.22)}S ` +
        `${circulo(x + t * 0.66, y + t * 0.5, t * 0.22)}S Q\n`,
    // 🏷️ etiqueta amarela com furo
    tag: (x, y, t) => `q 0.96 0.65 0.12 rg ${x + t * 0.05} ${y + t * 0.15} m ${x + t * 0.6} ${y + t * 0.15} l ` +
        `${x + t} ${y + t * 0.5} l ${x + t * 0.6} ${y + t * 0.85} l ${x + t * 0.05} ${y + t * 0.85} l h f ` +
        `1 g ${circulo(x + t * 0.25, y + t * 0.5, t * 0.08)}f Q\n`,
    // 🕐 relógio
    relogio: (x, y, t) => `q 0.35 0.35 0.35 RG 1 g ${(t * 0.09).toFixed(2)} w ${circulo(x + t / 2, y + t / 2, t * 0.42)}B ` +
        `${x + t / 2} ${y + t / 2} m ${x + t / 2} ${y + t * 0.78} l S ${x + t / 2} ${y + t / 2} m ${x + t * 0.72} ${y + t / 2} l S Q\n`,
    // 📝 folha com linhas
    nota: (x, y, t) => `q 0.45 0.45 0.45 RG 1 g ${(t * 0.07).toFixed(2)} w ${x + t * 0.15} ${y + t * 0.05} ${t * 0.7} ${t * 0.9} re B ` +
        `0.2 0.45 0.75 RG ${[0.3, 0.5, 0.7].map(h => `${x + t * 0.28} ${y + t * h} m ${x + t * 0.72} ${y + t * h} l S `).join('')}Q\n`
};

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
 * @param {object[]} o.blocos     { texto, tipo: 'titulo' | 'texto' | 'negrito' | 'meta' | 'espaco', icone?: 'link' | 'tag' | 'relogio' | 'nota' } ou
 *                          { tipo: 'imagem', jpeg: Buffer, largura, altura } (JPEG RGB, em pixels)
 * @returns {Buffer}
 */
function gerarPdf({ titulo, direita = '', rodape = '', blocos }) {
    const ESTILOS = {
        titulo: { fonte: 'F2', tamanho: 13, entre: 18, antes: 14, cor: '0.1 0.3 0.5' },
        texto: { fonte: 'F1', tamanho: 10.5, entre: 14, antes: 0, cor: '0 0 0' },
        negrito: { fonte: 'F2', tamanho: 10.5, entre: 14, antes: 0, cor: '0 0 0' },
        meta: { fonte: 'F1', tamanho: 8.5, entre: 11, antes: 0, cor: '0.45 0.45 0.45' }
    };
    const paginas = [[]];
    let y = TOPO_CORPO;

    const alturaDaImagem = (b) => b.altura * Math.min(1, IMAGEM_MAX_L / b.largura, IMAGEM_MAX_A / b.altura);

    for (const [indice, b] of blocos.entries()) {
        if (b.tipo === 'espaco') {
            y -= b.altura ?? 8;
            continue;
        }
        if (b.tipo === 'imagem') {
            const escala = Math.min(1, IMAGEM_MAX_L / b.largura, IMAGEM_MAX_A / b.altura);
            const [w, h] = [b.largura * escala, b.altura * escala];
            if (y - h < BASE_CORPO && y !== TOPO_CORPO) {
                paginas.push([]);
                y = TOPO_CORPO;
            }
            y -= h;
            paginas.at(-1).push({ imagem: b, x: MARGEM, y, w, h });
            y -= 6;
            continue;
        }
        const e = ESTILOS[b.tipo ?? 'texto'];
        const recuo = b.recuo ?? 0;
        const linhas = limpar(b.texto).split('\n')
            .flatMap(p => quebrar(p, e.tamanho, LARGURA - 2 * MARGEM - recuo - (b.icone && ICONES[b.icone] ? e.tamanho + 3 : 0), e.fonte === 'F2'));

        const desloca = b.icone && ICONES[b.icone] ? e.tamanho + 3 : 0;
        y -= e.antes;
        // Título nunca fica sozinho no fim da página (nem o texto que vem antes de uma imagem)
        const daImagem = blocos[indice + 1]?.tipo === 'imagem' ? alturaDaImagem(blocos[indice + 1]) + 6 : 0;
        if (y - e.entre * (b.tipo === 'titulo' ? 3 : 1) - daImagem < BASE_CORPO && y !== TOPO_CORPO) {
            paginas.push([]);
            y = TOPO_CORPO;
        }
        for (const [i, linha] of linhas.entries()) {
            if (y - e.entre < BASE_CORPO) {
                paginas.push([]);
                y = TOPO_CORPO;
            }
            y -= e.entre;
            // O ícone só na primeira linha do bloco; o texto sempre alinhado depois dele
            if (i === 0 && desloca) paginas.at(-1).push({ icone: b.icone, tamanho: e.tamanho, x: MARGEM + recuo, y: y - 1.5 });
            if (linha) paginas.at(-1).push({ ...e, x: MARGEM + recuo + desloca, y, texto: linha });
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

    // Cada imagem vira um objeto só, mesmo que a página a cite
    for (const it of paginas.flat().filter(x => x.imagem)) {
        const b = it.imagem;
        b.objeto ??= novo(`<< /Type /XObject /Subtype /Image /Width ${b.largura} /Height ${b.altura} ` +
            `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${b.jpeg.length} >>\n` +
            `stream\n${b.jpeg.toString('latin1')}\nendstream`);
    }

    const texto = (fonte, tam, cor, x, y, t) =>
        `BT /${fonte} ${tam} Tf ${cor} rg ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapar(t)}) Tj ET\n`;
    const linhaHorizontal = (y) => `0.7 0.7 0.7 RG 0.5 w ${MARGEM} ${y} m ${LARGURA - MARGEM} ${y} l S\n`;
    const filhas = [];

    paginas.forEach((itens, i) => {
        let c = texto('F2', 11, '0.1 0.3 0.5', MARGEM, ALTURA - 45, cab);
        c += texto('F1', 9, '0.4 0.4 0.4', LARGURA - MARGEM - larguraDe(dir, 9), ALTURA - 45, dir);
        c += linhaHorizontal(ALTURA - 55);
        for (const it of itens) {
            if (it.icone) c += ICONES[it.icone](it.x, it.y, it.tamanho);
            else if (it.imagem) c += `q ${it.w.toFixed(2)} 0 0 ${it.h.toFixed(2)} ${it.x} ${it.y.toFixed(2)} cm /Im${it.imagem.objeto} Do Q\n`;
            else c += texto(it.fonte, it.tamanho, it.cor, it.x, it.y, it.texto);
        }
        c += linhaHorizontal(52);
        const pag = `Página ${i + 1} de ${total}`;
        c += texto('F1', 8, '0.4 0.4 0.4', MARGEM, 38, rod);
        c += texto('F1', 8, '0.4 0.4 0.4', LARGURA - MARGEM - larguraDe(pag, 8), 38, pag);

        const bytes = Buffer.from(c, 'latin1');
        const conteudo = novo(`<< /Length ${bytes.length} >>\nstream\n${bytes.toString('latin1')}endstream`);
        const usadas = [...new Set(itens.filter(x => x.imagem).map(x => x.imagem.objeto))];
        const imagens = usadas.length ? ` /XObject << ${usadas.map(o => `/Im${o} ${o} 0 R`).join(' ')} >>` : '';
        const pagina = novo(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LARGURA} ${ALTURA}] ` +
            `/Resources << /Font << /F1 3 0 R /F2 4 0 R >>${imagens} >> /Contents ${conteudo} 0 R >>`);
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
