/*
 * Comando /news.
 */

const axios = require('axios');

const { commandUsage } = require('./base');
const { t } = require('../i18n');
const { printError } = require('../log');
const { SETTINGS_SCHEMA, getSetting } = require('../settings');
const { formatData } = require('../util/format');

/*
 * /news <-category> [amount]: headlines from the category's RSS feeds.
 * Categories in NEWS_CATEGORIES, each with its feeds in the 'news.<category>' setting;
 * several together add up the feeds (/news -g1 -gazeta). Without a category shows the help.
 * amount → 1 to 10 (default: 'news.max' setting)
 */
const NEWS_CATEGORIES = {
    hack: '🏴‍☠️ *Hacking News*',
    g1: '📰 *g1*',
    gazeta: '📰 *Gazeta do Povo*',
    get brazil() { return t('news.brazil'); }
};

const ENTITIES_XML = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

// A single pass: "&amp;lt;" becomes "&lt;" (and not "<"), as it should
const decodeEntities = (s) => String(s ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (ent, dec, hex, nameAlt) => {
        if (nameAlt) return ENTITIES_XML[nameAlt.toLowerCase()] ?? ent;
        const codeAlt = dec ? Number(dec) : parseInt(hex, 16);
        return codeAlt <= 0x10FFFF ? String.fromCodePoint(codeAlt) : ent;
    })
    .trim();

// Decoded content of the first <tag> of the XML snippet
const tagXml = (xml, tag) => decodeEntities(xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1]);

async function readFeed(url) {
    // Some sites (e.g.: BleepingComputer) refuse axios' default User-Agent with 403
    const { data: xml } = await axios.get(url, { responseType: 'text', timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (ZapBot RSS reader)' } });
    const sourceAlt = tagXml(xml.match(/<channel>[\s\S]*?<\/title>/)?.[0] ?? '', 'title') || new URL(url).hostname;

    return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/g)]
        .map(([item]) => ({
            fonte: sourceAlt,
            titulo: tagXml(item, 'title'),
            link: tagXml(item, 'link'),
            data: Date.parse(tagXml(item, 'pubDate')) || 0
        }))
        .filter(i => i.titulo)
        .sort((a, b) => b.data - a.data);
}

async function cmdNews({ msg, opts }) {
    const categories = Object.keys(NEWS_CATEGORIES).filter(c => opts.opt[c]);

    if (!categories.length) {
        await msg.reply(commandUsage('/news'));
        return;
    }

    const { max: limitAlt } = SETTINGS_SCHEMA['news.max'];
    const valueAlt = opts.argv[0] ?? getSetting('news.max');
    const max = Number(valueAlt);

    if (!Number.isInteger(max) || max < 1 || max > limitAlt) {
        await msg.reply(t('news.invalidCount', { value: valueAlt, max: limitAlt }));
        return;
    }

    const feeds = categories.flatMap(c => getSetting(`news.${c}`));

    if (!feeds.length) {
        await msg.reply(t('news.noFeeds', { cat: categories[0] }));
        return;
    }

    const results = await Promise.allSettled(feeds.map(readFeed));
    const bySource = [];

    results.forEach((r, i) => {
        if (r.status === 'fulfilled') bySource.push(r.value);
        else printError(`/news: feed ${feeds[i]} falhou:`, r.reason?.message);
    });

    // Each source takes at most its slice: otherwise the one that publishes more takes the whole list
    const slice = Math.ceil(max / Math.max(1, bySource.length));
    const items = bySource
        .flatMap(list => list.slice(0, slice))
        .sort((a, b) => b.data - a.data)
        .slice(0, max);

    if (!items.length) {
        await msg.reply(t('news.failed'));
        return;
    }

    const linesAlt = items.map((i, n) =>
        `${n + 1}. *${i.titulo}*\n_${i.fonte}${i.data ? ` · ${formatData(i.data)}` : ''}_${i.link ? `\n${i.link}` : ''}`);

    const title = categories.length === 1 ? NEWS_CATEGORIES[categories[0]] : t('news.title');

    await msg.reply(`${title}\n\n${linesAlt.join('\n\n')}`, null, { linkPreview: false });
}

module.exports = {
    cmdNews
};
