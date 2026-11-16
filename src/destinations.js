/*
 * Destination of a notice or target of a command: a contact, a group, a number
 * or (where it makes sense) emails. It is the -to of all commands: /cron, the
 * price alerts (/rates and /crypto -alert), /defi -alert, /watch and
 * /backup -send; and the /mute target. All accept several -to.
 */

const { client, completeNotice } = require('./client');
const { contactName: nameScheduleFirst, resolveLidToPhone } = require('./contacts');
const { sendEmail, smtpForSend } = require('./email');
const { waitChoice, authorAlt } = require('./choices');
const { t } = require('./i18n');
const { printDebug, printError } = require('./log');
const { isDebugMode } = require('./settings');
const { withoutAccents } = require('./util/format');
const { isChannelAlt } = require('./util/origin');
const { contextDebug } = require('./debugContext');
const { maskPhones } = require('./util/phone');

/*
 * Formas aceitas:
 * +5521999999999   → the number's private chat: country code + area code + number (the "+" is optional)
 * /Jorge Pereira/  → first, a contact in your address book with all the words
 * "Jorge Pereira"    in the name; with no contact, a group. In any order, without
 * Jorge              regardless of case or accents; /.../ and quotes
 * allow spaces
 * @Fulano          → the mentioned person (picked from WhatsApp's @ list):
 * in the text comes "@<id>", and the real id, in msg.mentionedIds.
 * A typed "@number", not as a mention, is refused
 * email            → (acceptsEmail) the QRCODE_EMAIL_SMTP_TO, through the bot's SMTP
 * voce@exemplo.com → (acceptsEmail) one or more emails, comma-separated
 * The same name (whole) beats one that only contains the words. If still
 * more than one fits, the command lists and you reply with the no. (resolverOrChoose).
 */
const DESTINATION = /(^|\s)-to(?=\s|$)(?:\s+("([^"]*)"|'([^']*)'|\/([^/]*)\/|(\S+)))?/;
const example = () => t('grp.dest.examples');
const LIMIT = 10;

const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
const isWordEmail = (s) => /^e-?mail$/i.test(s);

// The QRCODE_EMAIL_SMTP_TO addresses, which may come as "Me <me@example.com>, other@x.com"
const emailsDoSmtpTo = () => String(process.env.QRCODE_EMAIL_SMTP_TO ?? '').split(',')
    .map(e => (e.match(/<([^>]*)>/)?.[1] ?? e).trim());

/**
 * Removes the "-to <destination>" from the command text.
 * @returns {{ destino: string|null, informado: boolean, resto: string }}
 * given: -to appeared (even without a value, which is an error for the caller)
 */
function extractDestination(textAlt) {
    const m = String(textAlt ?? '').match(DESTINATION);
    if (!m) return { destino: null, informado: false, resto: String(textAlt ?? '') };

    const valueAlt = (m[3] ?? m[4] ?? m[5] ?? m[6] ?? '').trim();
    // Only removes the option snippet: the rest (including line breaks) stays as it came
    const rest = (textAlt.slice(0, m.index) + m[1] + textAlt.slice(m.index + m[0].length)).trim();

    return { destino: valueAlt || null, informado: true, resto: rest };
}

/**
 * Removes all the "-to <destination>" from the text (every command with -to accepts several).
 * @returns {{ destinos: Array<string|null>, informado: boolean, resto: string }}
 * destinations: one per -to, in order (null: -to without a value)
 */
function extractDestinations(textAlt) {
    const destinations = [];
    let rest = String(textAlt ?? '');

    for (;;) {
        const r = extractDestination(rest);
        if (!r.informado) break;
        destinations.push(r.destino);
        rest = r.resto;
    }

    return { destinos: destinations, informado: destinations.length > 0, resto: rest };
}

const normalize = (s) => withoutAccents(s).trim();

// "+5521999999999", "5521 99999-9999" → only the digits; null if it is not a number
function readNumber(textAlt) {
    if (!/^\+?[\d\s().-]+$/.test(textAlt)) return null;
    return textAlt.replace(/\D/g, '');
}

/*
 * The contacts saved in the address book (with a name). WhatsApp may bring the same
 * person twice: by phone and by LID (the internal id, of ~15 digits),
 * and the LID's sometimes comes as @lid, sometimes as a @c.us with the digits of the
 * LID. Among those with the same name, the one that is another's LID in the list leaves (by the map
 * LID → WhatsApp phone) and the @lid when there is a @c.us.
 */
async function withoutAsCopiesByLid(contacts) {
    const byName = Map.groupBy(contacts, c => normalize(c.name));
    const copies = new Set();

    for (const name of byName.values()) {
        if (name.length < 2) continue;

        const ids = new Set(name.map(c => c.id._serialized));
        for (const c of name) {
            const lid = c.id._serialized.endsWith('@lid') ? c.id._serialized : `${c.id._serialized.split('@')[0]}@lid`;
            const phoneAlt = await resolveLidToPhone(lid);
            if (phoneAlt && phoneAlt !== c.id._serialized && ids.has(phoneAlt)) copies.add(c);
        }

        // Without the map: the @lid leaves if the same name has a @c.us
        if (name.some(c => c.id._serialized.endsWith('@c.us') && !copies.has(c))) {
            name.filter(c => c.id._serialized.endsWith('@lid')).forEach(c => copies.add(c));
        }
    }

    return contacts.filter(c => !copies.has(c));
}

/*
 * Contacts and groups with all the words in the name, read straight from the memory of the
 * WhatsApp Web. Does NOT use client.getContacts() nor client.getChats(): they
 * build the full model of everything, and getChats() queries the servers of the
 * WhatsApp for EACH group (groupMetadata.update); with many groups, the page
 * stays busy for minutes and the next messages wait in the queue.
 * Here the filter runs inside and only what is needed comes back. A LID contact
 * (the internal id) comes with its phone, if WhatsApp knows which one it is.
 * The name and the "is in the address book" come from the same functions as whatsapp-web.js
 * uses (WAWebContactGetters and WAWebFrontendContactGetters): in the raw model of the
 * contact, c.name and c.isMyContact come empty. Your own account also counts
 * (by the saved name or by your profile name): becomes your private chat.
 */
const SEARCH_TIMEOUT_MS = 20_000;

function searchInWhatsApp(words) {
    const search = client.pupPage.evaluate((words) => {
        const attempt = (fn, defaults = null) => {
            try {
                return fn() ?? defaults;
            } catch {
                return defaults;
            }
        };

        // Without some module (another WhatsApp Web version), the model properties apply
        const { Contact, Chat } = window.require('WAWebCollections');
        const { getAlternateUserWid } = attempt(() => window.require('WAWebApiContact'), {});
        const getters = attempt(() => window.require('WAWebContactGetters'), {});
        const { getIsMyContact } = attempt(() => window.require('WAWebFrontendContactGetters'), {});
        const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const home = (nameAlt) => Boolean(nameAlt) && words.every(p => norm(nameAlt).includes(p));
        const serial = (wid) => wid?._serialized ?? null;

        const contacts = Contact.getModelsArray()
            .filter(c => c.id?.server !== 'g.us')
            .map(c => ({ c, nome: attempt(() => getters.getName(c), c.name), eu: Boolean(attempt(() => getters.getIsMe(c), c.isMe)) }))
            .filter(({ c, nome: nameAlt, eu }) => home(nameAlt) && (eu || attempt(() => getIsMyContact(c), c.isMyContact)))
            .map(({ c, nome: nameAlt, eu }) => {
                // You: whoever calls swaps in their own id (the model's may be the LID)
                if (eu) return { id: null, nome: nameAlt, eu };

                const id = serial(c.id);
                const phoneAlt = id?.endsWith('@lid')
                    ? serial(c.phoneNumber) ?? serial(attempt(() => getAlternateUserWid(c.id)))
                    : null;
                return { id: phoneAlt ?? id, nome: nameAlt };
            });

        const groups = Chat.getModelsArray()
            .filter(ch => ch.id?.server === 'g.us' && home(ch.formattedTitle || ch.name))
            .map(ch => ({ id: serial(ch.id), nome: ch.formattedTitle || ch.name }));

        return { contatos: contacts, grupos: groups };
    }, words);

    let limitAlt;
    const time = new Promise((_, reject) => {
        limitAlt = setTimeout(() => reject(new Error(t('grp.dest.timeout', { s: SEARCH_TIMEOUT_MS / 1000 }))), SEARCH_TIMEOUT_MS);
    });
    return Promise.race([search, time]).finally(() => clearTimeout(limitAlt));
}

/*
 * You (the bot account) enter with your id, found by the name saved in the address book
 * or by your profile name (pushname): -to /Your Name/ is your private chat.
 */
function withYou(contacts, home) {
    const myId = client.info?.wid?._serialized;
    if (!myId) return contacts.filter(c => !c.eu);

    const myName = contacts.find(c => c.eu)?.nome ?? (home(client.info.pushname) ? client.info.pushname : null);
    const other = contacts.filter(c => !c.eu && c.id !== myId);
    return myName ? [{ id: myId, nome: myName }, ...other] : other;
}

// Same shape as whatsapp-web.js (Contact and Chat), so the rest of the code does not depend on the origin
async function contactsAndGroups(words) {
    const home = (nameAlt) => Boolean(nameAlt) && words.every(p => normalize(nameAlt).includes(p));

    if (client.pupPage) {
        const { contatos: contacts, grupos: groups } = await searchInWhatsApp(words);
        const allAlt2 = withYou(contacts, home).filter(c => c.id);
        const unique = [...new Map(allAlt2.map(c => [c.id, c])).values()];
        return {
            contatos: unique.map(c => ({ id: { _serialized: c.id }, name: c.nome, number: c.id.split('@')[0], isMyContact: true })),
            grupos: groups.filter(g => g.id).map(g => ({ id: { _serialized: g.id }, name: g.nome, isGroup: true }))
        };
    }

    // Without the page (the tests): the client's lists
    const [contacts, chats] = await Promise.all([client.getContacts?.().catch(() => []) ?? [], client.getChats().catch(() => [])]);
    const schedule = contacts
        .filter(c => (c?.isMyContact || c?.isMe) && !c.isGroup && c.name && c.id?._serialized && home(c.name))
        .map(c => ({ id: c.id._serialized, nome: c.name, eu: Boolean(c.isMe) }));
    return {
        contatos: withYou(schedule, home).map(c => ({ id: { _serialized: c.id }, name: c.nome, number: c.id.split('@')[0], isMyContact: true })),
        grupos: chats.filter(c => c.isGroup && c.name && home(c.name))
    };
}

const contact = (c) => ({ id: c.id._serialized, nome: c.name, grupo: false, numero: c.number ?? null });
const group = (g) => ({ id: g.id._serialized, nome: g.name, grupo: true });

/**
 * "email" and/or addresses → the email destination; null if the text is not that.
 * @returns {{ email: string, nome: string, grupo: false } | { erro: string } | null}
 */
function readEmails(textAlt) {
    const partsAlt = textAlt.split(/[\s,;]+/).filter(Boolean);
    if (!partsAlt.length || !partsAlt.every(p => isWordEmail(p) || EMAIL.test(p))) return null;

    const emails = partsAlt.flatMap(p => (isWordEmail(p) ? emailsDoSmtpTo() : [p])).map(e => e.trim());

    if (emails.some(e => !EMAIL.test(e))) {
        return { erro: t('grp.dest.emptySmtpTo') };
    }
    if (!smtpForSend()) {
        return { erro: t('grp.dest.noSmtp') };
    }

    const list = [...new Set(emails)].join(', ');
    return { email: list, nome: list, grupo: false };
}

/**
 * Resolves the text to a chat (or to emails).
 * @param {string} valor  what came in -to (or in the /mute target)
 * @param {object} [o]
 * @param {boolean} [o.acceptsEmail]  "email" and addresses count (alerts, /backup); otherwise, error
 * @param {string} [o.withoutEmail]      the error when it does not accept (the command's why)
 * @param {'grupo'|'contato'} [o.tipo]  restricts the search to the type indicated by the notice
 * @param {Array<string|{_serialized: string}>} [o.mencoes]  msg.mentionedIds (the @ mentions)
 * @returns {Promise<{ id: string, nome: string, grupo: boolean }
 *   | { email: string, nome: string, grupo: false }
 *   | { erro: string }
 * | { options: Array<{ id, name, group }>, search: string, more: number }>}
 * options: more than one fit; the caller offers the choice (resolverOrChoose)
 */
async function resolverDestination(valueAlt, {
    aceitaEmail: acceptsEmail = false, aceitaCanal: acceptsChannel = false, tipo: type,
    semEmail: withoutEmail = t('grp.dest.noEmail'), mencoes: mentions = []
} = {}) {
    const textAlt = String(valueAlt ?? '').trim();
    if (acceptsChannel && isChannelAlt(textAlt)) {
        const channel = await client.getChatById(textAlt).catch(() => null);
        return channel ? { id: textAlt, nome: channel.name || textAlt, grupo: false, canal: true }
            : { erro: t('grp.dest.channelNotFound', { text: textAlt }) };
    }

    if (!textAlt) {
        return { erro: t(acceptsEmail ? 'grp.dest.needDestEmail' : 'grp.dest.needDest', { examples: example() }) };
    }

    // Mention: "@<id>" in the text, with the same id in msg.mentionedIds
    const mention = type === 'grupo' ? null : textAlt.match(/^@(\d+)$/);
    if (mention) return personMentioned(mention[1], mentions);

    // Email: "email" (the QRCODE_EMAIL_SMTP_TO) and/or addresses
    const byEmail = type === 'grupo' ? null : readEmails(textAlt);
    if (byEmail) return acceptsEmail ? byEmail : { erro: withoutEmail };

    // Number: digits only, with + and separators
    const digits = type === 'grupo' ? null : readNumber(textAlt);
    if (digits !== null) {
        if (digits.length < 10 || digits.length > 15) {
            return { erro: t('grp.dest.badNumber', { text: textAlt }) };
        }

        const wid = await client.getNumberId(digits).catch(() => null);
        if (!wid) return { erro: t('grp.dest.notOnWhatsApp', { number: digits }) };

        return { id: wid._serialized, nome: await contactName(wid._serialized, digits), grupo: false };
    }

    // Name: all the words, first in the contacts, then in the groups
    const search = normalize(textAlt);
    const words = search.split(/\s+/);

    let foundAlt6;
    try {
        foundAlt6 = await contactsAndGroups(words);
    } catch (err) {
        printError(`[DESTINO] busca por "${textAlt}" falhou:`, err.message);
        return { erro: t('grp.dest.searchFailed', { text: textAlt, error: err.message }) };
    }
    const contacts = type === 'grupo' ? [] : await withoutAsCopiesByLid(foundAlt6.contatos);
    const groups = type === 'contato' ? [] : foundAlt6.grupos;
    const channels = acceptsChannel
        ? (await (client.getChannels ? client.getChannels() : client.getChats()))
            .filter(c => isChannelAlt(c.id?._serialized) &&
                words.every(p => normalize(c.name ?? '').includes(p)))
            .map(c => ({ id: c.id._serialized, nome: c.name, grupo: false, canal: true })) : [];

    if (isDebugMode()) {
        printDebug(`[DESTINO] "${textAlt}": contatos ${contacts.map(c => `${c.name}=${c.id._serialized}`).join(', ') || '-'}; ` +
            `grupos ${groups.map(g => `${g.name}=${g.id._serialized}`).join(', ') || '-'}`);
    }

    const exact = contacts.find(c => normalize(c.name) === search) ?? null;
    const groupExact = groups.find(g => normalize(g.name) === search) ?? null;

    if (exact && contacts.filter(c => normalize(c.name) === search).length === 1) return contact(exact);
    if (!exact && groupExact && groups.filter(g => normalize(g.name) === search).length === 1) return group(groupExact);
    const channelExact = channels.filter(c => normalize(c.nome) === search);
    if (!exact && !groupExact && channelExact.length === 1) return channelExact[0];

    const candidates = contacts.length ? contacts.map(contact)
        : groups.length ? groups.map(group) : channels;
    if (candidates.length === 1) return candidates[0];

    if (!candidates.length) {
        if (type) return { erro: t('grp.dest.noneOfType', { type: t(type === 'grupo' ? 'grp.dest.typeGroup' : 'grp.dest.typeContact'), text: textAlt }) };
        return { erro: t(acceptsChannel ? 'grp.dest.noneWithChannel' : 'grp.dest.none', { text: textAlt, examples: example() }) };
    }

    return { opcoes: candidates.slice(0, LIMIT), busca: textAlt, mais: Math.max(0, candidates.length - LIMIT) };
}

/**
 * Resolves the destination and, if more than one fits, shows the numbered list and waits
 * you reply with the no. (up to 2 minutes). Errors and the timeout already go
 * answered in the chat.
 * @param {object} msg  the command message
 * @param {string} valor
 * @param {object} [o]  the same as resolverDestination
 * @returns {Promise<{ id: string, nome: string, grupo: boolean } | null>}
 */
async function resolverOrChoose(msg, valueAlt, o = {}) {
    const r = await resolverDestination(valueAlt, { mencoes: msg.mentionedIds ?? [], ...o });

    if (r.erro) {
        await msg.reply(r.erro);
        return null;
    }
    if (!r.opcoes) return r;

    const type = t(r.opcoes[0].canal ? 'grp.dest.kindChannels' : r.opcoes[0].grupo ? 'grp.dest.kindGroups' : 'grp.dest.kindContacts');
    const linesAlt = r.opcoes.map((d, i) => `${i + 1}. ${describeDestination(d)}${d.numero ? ` · +${d.numero}` : ''}`);
    const more = r.mais ? '\n' + t('grp.dest.more', { n: r.mais, kind: type }) : '';

    const question = await msg.reply(t('grp.dest.matches', { search: r.busca, n: r.opcoes.length + r.mais, kind: type, list: linesAlt.join('\n'), more: more }));

    const chatId = msg.id?.remote ?? msg.from;
    return waitChoice(chatId, r.opcoes, {
        autor: authorAlt(msg),
        aoExpirar: () => completeNotice(msg, question, t('grp.dest.expired', { search: r.busca }))
    });
}

// So as not to repeat the same destination: the chat or the emails
const destinationKey = (d) => (d.email ? `email:${d.email}` : d.id);

/**
 * Resolves the several -to, one at a time (each may ask for the choice in the
 * list). A repeat counts once.
 * @param {object} msg  the command message
 * @param {Array<string|null>} textos  those from extractDestinations
 * @param {object} [o]  the same as resolverDestination
 * @returns {Promise<Array<object>|null>}  null: one failed (the error was already replied)
 */
async function resolverDestinations(msg, texts, o = {}) {
    const destinations = [];
    for (const textAlt of texts) {
        const d = await resolverOrChoose(msg, textAlt, o);
        if (!d) return null;
        if (!destinations.some(x => destinationKey(x) === destinationKey(d))) destinations.push(d);
    }
    return destinations;
}

/**
 * Sends a bot text to the destination: the chat (without a destination: your private chat) or,
 * by email, without WhatsApp formatting (*bold*, _italic_).
 * Throws the send error for whoever called.
 * @param {object|null} destino  the one from resolverDestination (or null)
 * @param {string} texto
 * @param {object} [o]
 * @param {string} [o.assunto]  of the email
 * @param {object} [o.opcoes]   for client.sendMessage (e.g.: { linkPreview: false })
 */
async function sendOnDestination(destination, textAlt, { assunto: subject = t('grp.dest.subject'), opcoes: optionsAlt = {} } = {}) {
    if (destination?.email) {
        const withoutFormatting = textAlt.replace(/[*_]/g, '');
        await sendEmail({ para: destination.email.split(/\s*,\s*/), assunto: subject,
            texto: contextDebug().maskTelefones
                ? maskPhones(withoutFormatting) : withoutFormatting });
        return;
    }
    await client.sendMessage(destination?.id || client.info.wid._serialized, textAlt, optionsAlt);
}

/**
 * The same, for each destination (none: your private chat). One that fails does not hold up
 * the others: at the end, throws a single error, with those that failed.
 */
async function sendToDestinations(destinations, textAlt, o = {}) {
    const failures = [];
    for (const d of destinations.length ? destinations : [null]) {
        await sendOnDestination(d, textAlt, o)
            .catch(err => failures.push(`${d ? describeDestination(d) : t('grp.dest.yourPrivate')}: ${err.message}`));
    }
    if (failures.length) throw new Error(failures.join('; '));
}

// A stored row (dest_id, dest_name, dest_is_group, dest_email) → the destination; null: your private chat
function lineDestination(r) {
    if (r?.dest_email) return { email: r.dest_email, nome: r.dest_email, grupo: false };
    return r?.dest_id ? { id: r.dest_id, nome: r.dest_name, grupo: Boolean(r.dest_is_group) } : null;
}

// The reverse: the destination → the dest_* columns of a row
const destinationColumns = (d) => ({
    dest_id: d?.email ? null : d?.id ?? null,
    dest_name: d?.email ? null : d?.nome ?? null,
    dest_is_group: d?.grupo ? 1 : 0,
    dest_email: d?.email ?? null
});

/*
 * Several -to on one line: the recipients (or alert_recipients) column stores the
 * JSON with all of them, and the dest_* keep the first. With a single one, it stays null.
 */
const saveable = (d) => (d.email
    ? { email: d.email, nome: d.email, grupo: false }
    : { id: d.id, nome: d.nome, grupo: Boolean(d.grupo) });
const recipientsDe = (destinations) => (destinations.length > 1 ? JSON.stringify(destinations.map(saveable)) : null);

// The same, with any amount (the daily status: with none, null = your private chat)
const destinationsForSave = (destinations) => (destinations.length
    ? JSON.stringify(destinations.map(saveable))
    : null);

// The reverse: the JSON (or the single dest_* destination) → the list; [] = your private chat
const destinationsSaved = (recipients, single) => (recipients ? JSON.parse(recipients) : single ? [single] : []);

/*
 * The person of a mention. The id is usually a LID (the internal id): the
 * its phone, if WhatsApp knows it (it is what /mute and bot.admins compare
 * with whoever sends the message); otherwise, the LID itself (it can be sent to).
 */
async function personMentioned(digits, mentions) {
    const id = mentions.map(m => (typeof m === 'string' ? m : m?._serialized)).find(m => m?.split('@')[0] === digits);
    if (!id) {
        return { erro: t('grp.dest.notMention', { digits: digits, examples: example() }) };
    }

    const phoneAlt = id.endsWith('@lid') ? await resolveLidToPhone(id) : id;
    const final = phoneAlt ?? id;
    return { id: final, nome: await contactName(final, final.split('@')[0]), grupo: false };
}

async function contactName(id, digits) {
    const contactAlt = await client.getContactById(id).catch(() => null);
    return nameScheduleFirst(contactAlt) || `+${digits}`;
}

// "👥 Grupo sobre L200" / "👤 Fulano" / "📧 voce@exemplo.com"
const describeDestination = (d) => `${d.email ? '📧' : d.canal ? '📰' : d.grupo ? '👥' : '👤'} ${d.email ?? d.nome}`;
const describeDestinations = (destinations) => destinations.map(describeDestination).join(', ');

module.exports = {
    destinationColumns,
    describeDestination,
    describeDestinations,
    lineDestination,
    destinationsForSave,
    destinationsSaved,
    emailsDoSmtpTo,
    sendOnDestination,
    sendToDestinations,
    extractDestination,
    extractDestinations,
    recipientsDe,
    resolverDestination,
    resolverDestinations,
    resolverOrChoose
};
