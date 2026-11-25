/*
 * Destination of a notice or target of a command: a contact, a group, a number
 * or (where it makes sense) emails. It is the -to of all commands: /cron, the
 * price alerts (/stocks and /crypto -alert), /defi -alert, /watch and
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
 * voce@example.com → (acceptsEmail) one or more emails, comma-separated
 * The same name (whole) beats one that only contains the words. If still
 * more than one fits, the command lists and you reply with the no. (resolveOrChoose).
 */
const DESTINATION = /(^|\s)-to(?=\s|$)(?:\s+("([^"]*)"|'([^']*)'|\/([^/]*)\/|(\S+)))?/;
const example = () => t('grp.dest.examples');
const LIMIT = 10;

const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
const isWordEmail = (s) => /^e-?mail$/i.test(s);
// "me", "eu" (or "mim"): your own account (your private chat), to put it beside other destinations: -to me -to /Fulano/
const isWordMe = (s) => /^(?:me|eu|mim)$/i.test(s);

// The QRCODE_EMAIL_SMTP_TO addresses, which may come as "Me <me@example.com>, other@x.com"
const emailsOfSmtpTo = () => String(process.env.QRCODE_EMAIL_SMTP_TO ?? '').split(',')
    .map(e => (e.match(/<([^>]*)>/)?.[1] ?? e).trim());

/**
 * Removes the "-to <destination>" from the command text.
 * @returns {{ destination: string|null, given: boolean, rest: string }}
 * given: -to appeared (even without a value, which is an error for the caller)
 */
function extractDestination(textAlt) {
    const m = String(textAlt ?? '').match(DESTINATION);
    if (!m) return { destination: null, given: false, rest: String(textAlt ?? '') };

    const valueAlt = (m[3] ?? m[4] ?? m[5] ?? m[6] ?? '').trim();
    // Only removes the option snippet: the rest (including line breaks) stays as it came
    const rest = (textAlt.slice(0, m.index) + m[1] + textAlt.slice(m.index + m[0].length)).trim();

    return { destination: valueAlt || null, given: true, rest };
}

/**
 * Removes all the "-to <destination>" from the text (every command with -to accepts several).
 * @returns {{ destinations: Array<string|null>, given: boolean, rest: string }}
 * destinations: one per -to, in order (null: -to without a value)
 */
function extractDestinations(textAlt) {
    const destinations = [];
    let rest = String(textAlt ?? '');

    for (;;) {
        const r = extractDestination(rest);
        if (!r.given) break;
        destinations.push(r.destination);
        rest = r.rest;
    }

    return { destinations, given: destinations.length > 0, rest };
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
            .map(c => ({ c, name: attempt(() => getters.getName(c), c.name), eu: Boolean(attempt(() => getters.getIsMe(c), c.isMe)) }))
            .filter(({ c, name: nameAlt, eu }) => home(nameAlt) && (eu || attempt(() => getIsMyContact(c), c.isMyContact)))
            .map(({ c, name: nameAlt, eu }) => {
                // You: whoever calls swaps in their own id (the model's may be the LID)
                if (eu) return { id: null, name: nameAlt, eu };

                const id = serial(c.id);
                const phoneAlt = id?.endsWith('@lid')
                    ? serial(c.phoneNumber) ?? serial(attempt(() => getAlternateUserWid(c.id)))
                    : null;
                return { id: phoneAlt ?? id, name: nameAlt };
            });

        const groups = Chat.getModelsArray()
            .filter(ch => ch.id?.server === 'g.us' && home(ch.formattedTitle || ch.name))
            .map(ch => ({ id: serial(ch.id), name: ch.formattedTitle || ch.name }));

        return { contacts, groups };
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

    const myName = contacts.find(c => c.eu)?.name ?? (home(client.info.pushname) ? client.info.pushname : null);
    const other = contacts.filter(c => !c.eu && c.id !== myId);
    return myName ? [{ id: myId, name: myName }, ...other] : other;
}

// Same shape as whatsapp-web.js (Contact and Chat), so the rest of the code does not depend on the origin
async function contactsAndGroups(words) {
    const home = (nameAlt) => Boolean(nameAlt) && words.every(p => normalize(nameAlt).toLowerCase().includes(p));

    if (client.pupPage) {
        const { contacts, groups } = await searchInWhatsApp(words);
        const allAlt2 = withYou(contacts, home).filter(c => c.id);
        const unique = [...new Map(allAlt2.map(c => [c.id, c])).values()];
        return {
            contacts: unique.map(c => ({ id: { _serialized: c.id }, name: c.name, number: c.id.split('@')[0], isMyContact: true })),
            groups: groups.filter(g => g.id).map(g => ({ id: { _serialized: g.id }, name: g.name, isGroup: true }))
        };
    }

    // Without the page (the tests): the client's lists
    const [contacts, chats] = await Promise.all([client.getContacts?.().catch(() => []) ?? [], client.getChats().catch(() => [])]);
    const schedule = contacts
        .filter(c => (c?.isMyContact || c?.isMe) && !c.isGroup && c.name && c.id?._serialized && home(c.name))
        .map(c => ({ id: c.id._serialized, name: c.name, eu: Boolean(c.isMe) }));
    return {
        contacts: withYou(schedule, home).map(c => ({ id: { _serialized: c.id }, name: c.name, number: c.id.split('@')[0], isMyContact: true })),
        groups: chats.filter(c => c.isGroup && c.name && home(c.name))
    };
}

const contact = (c) => ({ id: c.id._serialized, name: c.name, group: false, number: c.number ?? null });
const group = (g) => ({ id: g.id._serialized, name: g.name, group: true });

/**
 * "email" and/or addresses → the email destination; null if the text is not that.
 * @returns {{ email: string, name: string, group: false } | { error: string } | null}
 */
function readEmails(textAlt) {
    const partsAlt = textAlt.split(/[\s,;]+/).filter(Boolean);
    if (!partsAlt.length || !partsAlt.every(p => isWordEmail(p) || EMAIL.test(p))) return null;

    const emails = partsAlt.flatMap(p => (isWordEmail(p) ? emailsOfSmtpTo() : [p])).map(e => e.trim());

    if (emails.some(e => !EMAIL.test(e))) {
        return { error: t('grp.dest.emptySmtpTo') };
    }
    if (!smtpForSend()) {
        return { error: t('grp.dest.noSmtp') };
    }

    const list = [...new Set(emails)].join(', ');
    return { email: list, name: list, group: false };
}

/**
 * Resolves the text to a chat (or to emails).
 * @param {string} value  what came in -to (or in the /mute target)
 * @param {object} [o]
 * @param {boolean} [o.acceptsEmail]  "email" and addresses count (alerts, /backup); otherwise, error
 * @param {string} [o.withoutEmail]      the error when it does not accept (the command's why)
 * @param {'group'|'contact'} [o.type]  restricts the search to the type indicated by the notice
 * @param {Array<string|{_serialized: string}>} [o.mentions]  msg.mentionedIds (the @ mentions)
 * @returns {Promise<{ id: string, name: string, group: boolean }
 *   | { email: string, name: string, group: false }
 *   | { error: string }
 * | { options: Array<{ id, name, group }>, search: string, more: number }>}
 * options: more than one fit; the caller offers the choice (resolveOrChoose)
 */
async function resolveDestination(valueAlt, {
    acceptsEmail = false, acceptsChannel = false, type,
    noEmail: withoutEmail = t('grp.dest.noEmail'), mentions = []
} = {}) {
    const textAlt = String(valueAlt ?? '').trim();
    if (acceptsChannel && isChannelAlt(textAlt)) {
        const channel = await client.getChatById(textAlt).catch(() => null);
        return channel ? { id: textAlt, name: channel.name || textAlt, group: false, channel: true }
            : { error: t('grp.dest.channelNotFound', { text: textAlt }) };
    }

    if (!textAlt) {
        return { error: t(acceptsEmail ? 'grp.dest.needDestEmail' : 'grp.dest.needDest', { examples: example() }) };
    }

    // Yourself: "me" / "eu" (a contact with exactly this name is reached by its number)
    if (type !== 'grupo' && isWordMe(textAlt)) return selfDestination();

    // Mention: "@<id>" in the text, with the same id in msg.mentionedIds
    const mention = type === 'grupo' ? null : textAlt.match(/^@(\d+)$/);
    if (mention) return personMentioned(mention[1], mentions);

    // Email: "email" (the QRCODE_EMAIL_SMTP_TO) and/or addresses
    const byEmail = type === 'grupo' ? null : readEmails(textAlt);
    if (byEmail) return acceptsEmail ? byEmail : { error: withoutEmail };

    // Number: digits only, with + and separators
    const digits = type === 'grupo' ? null : readNumber(textAlt);
    if (digits !== null) {
        if (digits.length < 10 || digits.length > 15) {
            return { error: t('grp.dest.badNumber', { text: textAlt }) };
        }

        const wid = await client.getNumberId(digits).catch(() => null);
        if (!wid) return { error: t('grp.dest.notOnWhatsApp', { number: digits }) };

        return { id: wid._serialized, name: await contactName(wid._serialized, digits), group: false };
    }

    // Name: all the words, first in the contacts, then in the groups
    const search = normalize(textAlt);
    const words = search.split(/\s+/);

    let foundAlt6;
    try {
        foundAlt6 = await contactsAndGroups(words);
    } catch (err) {
        printError(`[DESTINATION] lookup for "${textAlt}" failed:`, err.message);
        return { error: t('grp.dest.searchFailed', { text: textAlt, error: err.message }) };
    }
    const contacts = type === 'grupo' ? [] : await withoutAsCopiesByLid(foundAlt6.contacts);
    const groups = type === 'contato' ? [] : foundAlt6.groups;
    const channels = acceptsChannel
        ? (await (client.getChannels ? client.getChannels() : client.getChats()))
            .filter(c => isChannelAlt(c.id?._serialized) &&
                words.every(p => normalize(c.name ?? '').includes(p)))
            .map(c => ({ id: c.id._serialized, name: c.name, group: false, channel: true })) : [];

    if (isDebugMode()) {
        printDebug(`[DESTINATION] "${textAlt}": contacts ${contacts.map(c => `${c.name}=${c.id._serialized}`).join(', ') || '-'}; ` +
            `groups ${groups.map(g => `${g.name}=${g.id._serialized}`).join(', ') || '-'}`);
    }

    const exact = contacts.find(c => normalize(c.name) === search) ?? null;
    const groupExact = groups.find(g => normalize(g.name) === search) ?? null;

    if (exact && contacts.filter(c => normalize(c.name) === search).length === 1) return contact(exact);
    if (!exact && groupExact && groups.filter(g => normalize(g.name) === search).length === 1) return group(groupExact);
    const channelExact = channels.filter(c => normalize(c.name) === search);
    if (!exact && !groupExact && channelExact.length === 1) return channelExact[0];

    const candidates = contacts.length ? contacts.map(contact)
        : groups.length ? groups.map(group) : channels;
    if (candidates.length === 1) return candidates[0];

    if (!candidates.length) {
        if (type) return { error: t('grp.dest.noneOfType', { type: t(type === 'grupo' ? 'grp.dest.typeGroup' : 'grp.dest.typeContact'), text: textAlt }) };
        return { error: t(acceptsChannel ? 'grp.dest.noneWithChannel' : 'grp.dest.none', { text: textAlt, examples: example() }) };
    }

    return { options: candidates.slice(0, LIMIT), search: textAlt, mais: Math.max(0, candidates.length - LIMIT) };
}

/**
 * Resolves the destination and, if more than one fits, shows the numbered list and waits
 * you reply with the no. (up to 2 minutes). Errors and the timeout already go
 * answered in the chat.
 * @param {object} msg  the command message
 * @param {string} value
 * @param {object} [o]  the same as resolveDestination
 * @returns {Promise<{ id: string, name: string, group: boolean } | null>}
 */
async function resolveOrChoose(msg, valueAlt, o = {}) {
    const r = await resolveDestination(valueAlt, { mentions: msg.mentionedIds ?? [], ...o });

    if (r.error) {
        await msg.reply(r.error);
        return null;
    }
    if (!r.options) return r;

    const type = t(r.options[0].channel ? 'grp.dest.kindChannels' : r.options[0].group ? 'grp.dest.kindGroups' : 'grp.dest.kindContacts');
    const linesAlt = r.options.map((d, i) => `${i + 1}. ${describeDestination(d)}${d.number ? ` · +${d.number}` : ''}`);
    const more = r.mais ? '\n' + t('grp.dest.more', { n: r.mais, kind: type }) : '';

    const question = await msg.reply(t('grp.dest.matches', { search: r.search, n: r.options.length + r.mais, kind: type, list: linesAlt.join('\n'), more: more }));

    const chatId = msg.id?.remote ?? msg.from;
    return waitChoice(chatId, r.options, {
        author: authorAlt(msg),
        onExpire: () => completeNotice(msg, question, t('grp.dest.expired', { search: r.search }))
    });
}

// So as not to repeat the same destination: the chat or the emails
const destinationKey = (d) => (d.email ? `email:${d.email}` : d.id);

/**
 * Resolves the several -to, one at a time (each may ask for the choice in the
 * list). A repeat counts once.
 * @param {object} msg  the command message
 * @param {Array<string|null>} texts  those from extractDestinations
 * @param {object} [o]  the same as resolveDestination
 * @returns {Promise<Array<object>|null>}  null: one failed (the error was already replied)
 */
async function resolveDestinations(msg, texts, o = {}) {
    const destinations = [];
    for (const textAlt of texts) {
        const d = await resolveOrChoose(msg, textAlt, o);
        if (!d) return null;
        if (!destinations.some(x => destinationKey(x) === destinationKey(d))) destinations.push(d);
    }
    return destinations;
}

/**
 * Sends a bot text to the destination: the chat (without a destination: your private chat) or,
 * by email, without WhatsApp formatting (*bold*, _italic_).
 * Throws the send error for whoever called.
 * @param {object|null} destination  the one from resolveDestination (or null)
 * @param {string} text
 * @param {object} [o]
 * @param {string} [o.subject]  of the email
 * @param {object} [o.options]   for client.sendMessage (e.g.: { linkPreview: false })
 */
async function sendOnDestination(destination, textAlt, { subject = t('grp.dest.subject'), options: optionsAlt = {} } = {}) {
    if (destination?.email) {
        const withoutFormatting = textAlt.replace(/[*_]/g, '');
        await sendEmail({ to: destination.email.split(/\s*,\s*/), subject,
            text: contextDebug().maskPhones
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
    if (r?.dest_email) return { email: r.dest_email, name: r.dest_email, group: false };
    return r?.dest_id ? { id: r.dest_id, name: r.dest_name, group: Boolean(r.dest_is_group) } : null;
}

// The reverse: the destination → the dest_* columns of a row
const destinationColumns = (d) => ({
    dest_id: d?.email ? null : d?.id ?? null,
    dest_name: d?.email ? null : d?.name ?? null,
    dest_is_group: d?.group ? 1 : 0,
    dest_email: d?.email ?? null
});

/*
 * Several -to on one line: the recipients (or alert_recipients) column stores the
 * JSON with all of them, and the dest_* keep the first. With a single one, it stays null.
 */
const saveable = (d) => (d.email
    ? { email: d.email, name: d.email, group: false }
    : { id: d.id, name: d.name, group: Boolean(d.group) });
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
        return { error: t('grp.dest.notMention', { digits: digits, examples: example() }) };
    }

    const phoneAlt = id.endsWith('@lid') ? await resolveLidToPhone(id) : id;
    const final = phoneAlt ?? id;
    return { id: final, name: await contactName(final, final.split('@')[0]), group: false };
}

async function contactName(id, digits) {
    const contactAlt = await client.getContactById(id).catch(() => null);
    return nameScheduleFirst(contactAlt) || `+${digits}`;
}

// "👥 Grupo sobre L200" / "👤 Fulano" / "📧 voce@example.com"
const describeDestination = (d) => `${d.email ? '📧' : d.channel ? '📰' : d.group ? '👥' : '👤'} ${d.email ?? d.name}`;
const describeDestinations = (destinations) => destinations.map(describeDestination).join(', ');

/**
 * Where it notifies, one destination per line, to go under an item of a list: "📨 Jorge Pereira" and, below it, the
 * others aligned ("   Lourival", "   Grupo L200 👥"). A contact has no icon (the 📨 says it is a destination); a group, an
 * email and a channel have theirs after the name. No destinations (your private chat): nothing, so the common case stays short.
 * @returns {string} lines that start with a line break, or ''
 */
function describeDestinationsBlock(destinations, { indent = '   ', whenEmpty = '' } = {}) {
    if (!destinations.length) return whenEmpty ? `\n${indent}📨 ${whenEmpty}` : '';
    const label = (d) => (d.email ? `${d.email} 📧` : d.channel ? `${d.name} 📰` : d.group ? `${d.name} 👥` : String(d.name ?? d.id));
    return destinations.map((d, i) => `\n${indent}${i === 0 ? '📨 ' : '   '}${label(d)}`).join('');
}

/** Your own account as a destination (your private chat): { id, name, group: false }, or { error } before the bot is connected */
async function selfDestination() {
    const id = client.info?.wid?._serialized;
    if (!id) return { error: t('grp.dest.notConnected') };
    return { id, name: await contactName(id, client.info.pushname || t('core.voce')), group: false };
}

/**
 * Contacts (of the address book) and groups with all the words of the text in the name, or a phone number: for the
 * pickers of the web interface.
 * @returns {Promise<{ id: string, name: string, group: boolean, number: string|null }[]>} up to 20, contacts first
 */
async function searchPeople(text, limit = 20) {
    const typed = String(text ?? '').trim();
    if (isWordMe(typed)) {
        const me = await selfDestination();
        if (me.id) return [{ ...me, number: me.id.split('@')[0], self: true }];
    }
    const words = normalize(typed).toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const found = [];
    const digits = typed.replace(/\D/g, '');
    if (digits.length >= 8 && digits.length === typed.replace(/[\s()+-]/g, '').length) found.push({ id: `${digits}@c.us`, name: `+${digits}`, group: false, number: digits });
    const { contacts, groups } = await contactsAndGroups(words.map(w => normalize(w).toLowerCase()));
    found.push(...contacts.map(c => ({ id: c.id._serialized, name: c.name, group: false, number: c.number ?? null })));
    found.push(...groups.map(g => ({ id: g.id._serialized, name: g.name, group: true, number: null })));
    return [...new Map(found.map(p => [p.id, p])).values()].slice(0, limit);
}

module.exports = {
    destinationColumns,
    describeDestination,
    describeDestinations,
    describeDestinationsBlock,
    lineDestination,
    destinationsForSave,
    destinationsSaved,
    emailsOfSmtpTo,
    sendOnDestination,
    sendToDestinations,
    extractDestination,
    extractDestinations,
    recipientsDe,
    resolveDestination,
    resolveDestinations,
    resolveOrChoose,
    searchPeople
};
