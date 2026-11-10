/*
 * Do Markdown que o ChatGPT escreve para a formatação do WhatsApp.
 *
 * O WhatsApp entende *negrito*, _itálico_, ~tachado~, `código`, blocos entre ``` , listas com "- " ou
 * "1. " e citações com "> ". Não entende títulos (#), **negrito duplo**, tabelas, linhas "---" nem
 * [links](url): aparecem como símbolos soltos. As tabelas viram um bloco de código alinhado (é o único
 * jeito de manter as colunas), e o que está dentro de um bloco de código fica como está.
 */

const CERCA = /(```[\s\S]*?```)/g;

// Largura na tela: um emoji conta como uma letra (o monoespaçado do WhatsApp o desenha mais largo, mas é o que dá)
const largura = (texto) => Array.from(texto).length;

// "**Nome**" ou "`x`" dentro de uma célula da tabela: sem a marcação, que ali não renderiza
const celulaLimpa = (texto) => texto.replace(/\*\*|__|`/g, '').trim();

const ehSeparador = (celulas) => celulas.length > 0 && celulas.every(c => /^:?-+:?$/.test(c));

// Uma tabela Markdown (as linhas que começam com "|") → o bloco de código alinhado
function tabelaEmCodigo(linhas) {
    const linhasDaTabela = linhas.map(l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim()));
    const dados = linhasDaTabela.filter(c => !ehSeparador(c)).map(c => c.map(celulaLimpa));
    const colunas = Math.max(...dados.map(c => c.length));
    const larguras = Array.from({ length: colunas }, (_, i) => Math.max(...dados.map(c => largura(c[i] ?? ''))));
    const linha = (cel) => cel.map((c, i) => c + ' '.repeat(larguras[i] - largura(c))).join('  ').trimEnd();

    const [cabecalho, ...resto] = dados;
    const traco = larguras.map(n => '-'.repeat(n)).join('  ');
    return '```\n' + [linha(cabecalho), traco, ...resto.map(linha)].join('\n') + '\n```';
}

// As tabelas do texto (fora de blocos de código) viram blocos de código
function tabelas(prosa) {
    const linhas = prosa.split('\n');
    const saida = [];
    for (let i = 0; i < linhas.length;) {
        if (/^\s*\|.*\|\s*$/.test(linhas[i])) {
            const inicio = i;
            while (i < linhas.length && /^\s*\|.*\|\s*$/.test(linhas[i])) i++;
            saida.push(tabelaEmCodigo(linhas.slice(inicio, i)));
        } else {
            saida.push(linhas[i++]);
        }
    }
    return saida.join('\n');
}

// O texto corrido: títulos, negrito, tachado, links, listas e linhas
function prosa(texto) {
    return texto
        // Título: vira uma linha em negrito
        .replace(/^[ \t]{0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/gm, (_, t) => `*${t.replace(/\*\*|__/g, '').replace(/\*/g, '')}*`)
        // "---", "***" e "___" sozinhos na linha
        .replace(/^[ \t]*([-*_])([ \t]*\1){2,}[ \t]*$/gm, '')
        // Listas de "*" e "+" viram "-" (antes do negrito, para o "* item" não ser tomado por ele); o "•" já serve
        .replace(/^([ \t]*)[*+][ \t]+/gm, '$1- ')
        // Negrito e itálico: ***x*** → *_x_*; **x** e __x__ → *x*; ~~x~~ → ~x~
        .replace(/\*\*\*(.+?)\*\*\*/g, '*_$1_*')
        .replace(/\*\*(.+?)\*\*/g, '*$1*')
        .replace(/__(.+?)__/g, '*$1*')
        .replace(/~~(.+?)~~/g, '~$1~')
        // Imagem vira o endereço; link vira "texto (endereço)"
        .replace(/!\[[^\]]*\]\((\S+?)\)/g, '$1')
        .replace(/\[([^\]]+)\]\((\S+?)\)/g, (_, rotulo, url) => (rotulo === url ? url : `${rotulo} (${url})`))
        // Quebra de linha do Markdown (dois espaços no fim) e linhas em branco demais
        .replace(/[ \t]+$/gm, '')
        .replace(/\n{3,}/g, '\n\n');
}

/**
 * @param {string} texto  Markdown
 * @returns {string}  o mesmo texto na formatação do WhatsApp
 */
function paraWhatsapp(texto) {
    // 1º as tabelas (viram blocos de código); 2º o resto, sem mexer dentro dos blocos
    const comTabelas = String(texto ?? '').split(CERCA)
        .map((parte, i) => (i % 2 ? parte : tabelas(parte))).join('');

    return comTabelas.split(CERCA)
        // O bloco de código sem o nome da linguagem (```text): no WhatsApp ele apareceria no texto
        .map((parte, i) => (i % 2 ? parte.replace(/^```[^\n`]*\n/, '```\n') : prosa(parte)))
        .join('')
        .trim();
}

module.exports = {
    paraWhatsapp
};
