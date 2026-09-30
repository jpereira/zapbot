/*
 * Comando /news.
 */

const axios = require('axios');

const { getCommandSyntax } = require('./base');
const { printError } = require('../log');
const { SETTINGS_SCHEMA, getSetting } = require('../settings');
const { formatarData } = require('../util/formatar');

/*
 * /news <-categoria> [quantidade]: manchetes dos feeds RSS da categoria.
 *   Categorias em NEWS_CATEGORIAS, cada uma com os feeds no setting 'news.<categoria>';
 *   várias juntas somam os feeds (/news -g1 -gazeta). Sem categoria mostra a ajuda.
 *   quantidade → 1 a 10 (padrão: setting 'news.max')
 */
const NEWS_CATEGORIAS = {
    hack: '🏴‍☠️ *Hacking News*',
    g1: '📰 *g1*',
    gazeta: '📰 *Gazeta do Povo*',
    brasil: '🇧🇷 *Brasil*'
};

const ENTIDADES_XML = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

// Uma passada só: "&amp;lt;" vira "&lt;" (e não "<"), como deve ser
const decodificarEntidades = (s) => String(s ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (ent, dec, hex, nome) => {
        if (nome) return ENTIDADES_XML[nome.toLowerCase()] ?? ent;
        const codigo = dec ? Number(dec) : parseInt(hex, 16);
        return codigo <= 0x10FFFF ? String.fromCodePoint(codigo) : ent;
    })
    .trim();

// Conteúdo decodificado da primeira <tag> do trecho de XML
const tagXml = (xml, tag) => decodificarEntidades(xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1]);

async function lerFeed(url) {
    // Alguns sites (ex.: BleepingComputer) recusam o User-Agent padrão do axios com 403
    const { data: xml } = await axios.get(url, { responseType: 'text', timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (ZapBot RSS reader)' } });
    const fonte = tagXml(xml.match(/<channel>[\s\S]*?<\/title>/)?.[0] ?? '', 'title') || new URL(url).hostname;

    return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/g)]
        .map(([item]) => ({
            fonte,
            titulo: tagXml(item, 'title'),
            link: tagXml(item, 'link'),
            data: Date.parse(tagXml(item, 'pubDate')) || 0
        }))
        .filter(i => i.titulo)
        .sort((a, b) => b.data - a.data);
}

async function cmdNews({ msg, opts }) {
    const categorias = Object.keys(NEWS_CATEGORIAS).filter(c => opts.opt[c]);

    if (!categorias.length) {
        await msg.reply('```' + getCommandSyntax('/news') + '```');
        return;
    }

    const { max: limite } = SETTINGS_SCHEMA['news.max'];
    const valor = opts.argv[0] ?? getSetting('news.max');
    const max = Number(valor);

    if (!Number.isInteger(max) || max < 1 || max > limite) {
        await msg.reply(`❌ Quantidade inválida: ${valor}. Use de 1 a ${limite}.\n💡 _/news -g1 5_`);
        return;
    }

    const feeds = categorias.flatMap(c => getSetting(`news.${c}`));

    if (!feeds.length) {
        await msg.reply(`ℹ️ Nenhum feed configurado.\n💡 _Adicione com /set news.${categorias[0]} <url1> <url2>_`);
        return;
    }

    const resultados = await Promise.allSettled(feeds.map(lerFeed));
    const porFonte = [];

    resultados.forEach((r, i) => {
        if (r.status === 'fulfilled') porFonte.push(r.value);
        else printError(`/news: feed ${feeds[i]} falhou:`, r.reason?.message);
    });

    // Cada fonte ocupa no máximo a sua fatia: senão a que publica mais toma a lista toda
    const fatia = Math.ceil(max / Math.max(1, porFonte.length));
    const itens = porFonte
        .flatMap(lista => lista.slice(0, fatia))
        .sort((a, b) => b.data - a.data)
        .slice(0, max);

    if (!itens.length) {
        await msg.reply('❌ Não consegui buscar as manchetes agora.');
        return;
    }

    const linhas = itens.map((i, n) =>
        `${n + 1}. *${i.titulo}*\n_${i.fonte}${i.data ? ` · ${formatarData(i.data)}` : ''}_${i.link ? `\n${i.link}` : ''}`);

    const titulo = categorias.length === 1 ? NEWS_CATEGORIAS[categorias[0]] : '📰 *News*';

    await msg.reply(`${titulo}\n\n${linhas.join('\n\n')}`, null, { linkPreview: false });
}

module.exports = {
    cmdNews
};
