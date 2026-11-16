/*
 * Comando /contacts.
 */

const { MessageMedia } = require('whatsapp-web.js');

const { findCommand, formatCommandHelp } = require('./base');
const { client, completeNotice } = require('../client');
const { scheduleName, resolveLidToPhone } = require('../contacts');
const { contactPhoto, cleanCache } = require('../contactPhotos');
const { t } = require('../i18n');
const { printError } = require('../log');
const { getSetting } = require('../settings');
const { humanSize } = require('../util/files');
const { assembleVcard } = require('../vcard');

/*
 * /contacts                → how many contacts, how many photos in cache
 * /contacts -l [filter]    → list (name · number)
 * /contacts -e [filter]    → a .vcf with all of them (name, number, company and message) in this chat
 * -p  with the profile photos (slow; cache in cache/contacts);  -n  without reading or writing the cache;
 * -r  downloads the photos again (-n and -r only work with -p)
 * /contacts -c             → apaga cache/contacts
 * Owner only, in their own private chat: the output is the whole schedule.
 */
const MAX_VCF_BYTES = 90 * 1024 * 1024; // WhatsApp refuses documents over 100 MB
const MAX_LINES_IN_CHAT = 40; // acima disso a lista vai num arquivo .txt
let exportando = false;

const today = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');

const pause = (ms) => new Promise(r => setTimeout(r, ms));

/*
 * The filter: several /Compound Name/ (with slashes) and/or loose words, which count together (one OR another).
 * Each one matches part of the name or, if it has digits, part of the number.
 */
function textFilters(textAlt) {
    const items = [...textAlt.matchAll(/\/([^/]+)\//g)].map(m => m[1].trim());
    const rest = textAlt.replace(/\/[^/]+\//g, ' ').trim();
    if (rest) items.push(rest);
    return items.filter(Boolean).map(i => ({ texto: i.toLowerCase(), digitos: i.replace(/\D/g, '') }));
}

// The address book contacts (without groups), one per phone, with the filter (name or digits) applied.
// WhatsApp lists the same person twice (the @c.us, with or without an internal `number`, and the @lid):
// the @lid only enters if its phone is not on the list.
async function scheduleContacts(filter) {
    const allAlt2 = (await client.getContacts()).filter(c => c.isMyContact && !c.isGroup);
    const byNumber = new Map();

    // The phone is the id.user: the `number` of one of the two copies comes with an internal number (15 digits)
    for (const c of allAlt2.filter(c => c.id?._serialized?.endsWith('@c.us') && c.id.user)) {
        if (!byNumber.has(c.id.user)) byNumber.set(c.id.user, Object.assign(Object.create(c), { number: c.id.user }));
    }
    for (const c of allAlt2.filter(c => c.id?._serialized?.endsWith('@lid'))) {
        const phoneAlt = await resolveLidToPhone(c.id._serialized).catch(() => null);
        const numberAlt = phoneAlt?.endsWith('@c.us') ? phoneAlt.split('@')[0] : null;
        if (numberAlt && !byNumber.has(numberAlt)) byNumber.set(numberAlt, Object.assign(Object.create(c), { number: numberAlt }));
    }

    const filters = textFilters(filter);
    const home = (c) => !filters.length || filters.some(({ texto: textAlt, digitos: digits }) =>
        (scheduleName(c) ?? '').toLowerCase().includes(textAlt) || (digits && c.number.includes(digits)));
    return [...byNumber.values()]
        .filter(home)
        .sort((a, b) => (scheduleName(a) ?? a.number).localeCompare(scheduleName(b) ?? b.number));
}

/*
 * Sends the file as a document. WhatsApp Web sometimes refuses the upload ("media-fault: sendToChat
 * filehash undefined"): tries again and, if it persists, with the generic type (the name keeps the extension).
 */
async function sendFile(msg, buffer, nameAlt, mime, caption) {
    const attempts = [mime, mime, 'application/octet-stream'];
    let last;
    for (const [i, type] of attempts.entries()) {
        try {
            await msg.reply(new MessageMedia(type, buffer.toString('base64'), nameAlt), undefined,
                { sendMediaAsDocument: true, caption });
            return;
        } catch (err) {
            last = err;
            printError(`/contacts: sending ${nameAlt} failed (${i + 1}/${attempts.length}):`, err.message.split('\n')[0]);
            await pause(1500);
        }
    }
    throw last;
}

const nameAltAlt = (c) => scheduleName(c) || c.pushname || `+${c.number}`;

async function exportar(msg, notice, contacts, { fotos: photos, refresh, cache }) {

    const delay = getSetting('contacts.delayMs');
    const cards = [];
    let withPhoto = 0, doCache = 0, failures = 0;

    for (const c of contacts) {
        try {
            const { foto: photo, doCache: cacheCame } = photos
                ? await contactPhoto(c, c.number, { refresh, cache })
                : { foto: null, doCache: false };
            if (photo) withPhoto++;
            if (cacheCame) doCache++;
            const message = await c.getAbout().catch(() => null);
            cards.push(assembleVcard({
                telefone: c.number, nome: nameAltAlt(c), recado: message,
                empresa: c.isBusiness ? c.verifiedName || c.name : null, foto: photo
            }));
            if (photos && !cacheCame && delay) await pause(delay);
        } catch (err) {
            failures++;
            printError(`/contacts: ${c.number}:`, err.message);
        }
    }

    const vcf = Buffer.from(cards.join(''), 'utf8');
    if (vcf.length > MAX_VCF_BYTES) {
        await completeNotice(msg, notice, t('contacts.tooBig', { size: humanSize(vcf.length) }));
        return;
    }

    await sendFile(msg, vcf, `contacts-${today()}.vcf`, 'text/vcard', t('contacts.done', {
        count: cards.length, photos: withPhoto, cached: doCache, size: humanSize(vcf.length),
        failed: failures ? t('contacts.failed', { count: failures }) : ''
    }));
    // A file cannot be edited: the notice goes out when the file arrives
    await notice?.delete?.(true).catch(() => {});
}

// Your private chat with yourself: the chat id may come as @c.us or as @lid
async function isMyPrivate(msg, chatId) {
    const my = client.info.wid._serialized;
    if (chatId === my || (msg.fromMe && msg.from === msg.to)) return true;
    return chatId.endsWith('@lid') && (await resolveLidToPhone(chatId).catch(() => null)) === my;
}

async function cmdContacts({ msg, opts, chatId, isGroup }) {
    if (isGroup || !(await isMyPrivate(msg, chatId))) {
        await msg.reply(t('contacts.privateOnly'));
        return;
    }

    const o = opts.opt;
    const filter = opts.argv.join(' ').trim();

    if (o.clear) {
        const r = await cleanCache();
        await msg.reply(t('contacts.cleared', { count: r.fotos + r.semFoto, size: humanSize(r.bytes) }));
        return;
    }

    if (!o.export && !o.list) {
        await msg.reply(formatCommandHelp(findCommand('/contacts')));
        return;
    }

    if (o.export && exportando) {
        await msg.reply(t('contacts.busy'));
        return;
    }

    // As in /get: the "⏳ Processando…" goes out first and becomes the result (or the error)
    const notice = await msg.reply(t('contacts.processing'));
    if (o.export) exportando = true;
    try {
        const contacts = await scheduleContacts(filter);
        if (!contacts.length) {
            await completeNotice(msg, notice, t('contacts.none'));
        } else if (o.export) {
            await completeNotice(msg, notice, t('contacts.exporting', { count: contacts.length }));
            await exportar(msg, notice, contacts, { fotos: Boolean(o.photos), refresh: Boolean(o.refresh), cache: o.nocache ? false : getSetting('contacts.cache') });
        } else {
            const linesAlt = contacts.map(c => `• ${nameAltAlt(c)} · +${c.number}`).join('\n');
            const title = t('contacts.listTitle', { count: contacts.length });
            if (contacts.length <= MAX_LINES_IN_CHAT) {
                await completeNotice(msg, notice, `${title}\n\n${linesAlt}`);
            } else {
                // The WhatsApp message truncates the big list: it goes in a .txt
                await sendFile(msg, Buffer.from(`${title}\n\n${linesAlt}\n`, 'utf8'), `contacts-${today()}.txt`,
                    'text/plain', title);
                await notice?.delete?.(true).catch(() => {});
            }
        }
    } catch (err) {
        printError('/contacts:', err.message);
        await completeNotice(msg, notice, t('contacts.error', { error: err.message }));
    } finally {
        if (o.export) exportando = false;
    }
}

module.exports = { cmdContacts };
