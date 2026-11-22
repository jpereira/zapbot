/*
 * The -profile|-p of the commands that send images to GPT (/draw, /gpt): the profile photo of one or more
 * people goes along with the request images (the replied photo). Who: right after -p, /Name/,
 * @mention, +number, @me/$me (your own photo), @this/$this (the chat: the other person, or the group photo), @reply/$reply (who wrote the replied message) or, with none of that, the address book name typed loose (-p fulano beltrano): the words
 * that are a contact's first name (or whole name) count as people, and the first that is not
 * starts the request. Without anyone, the private chat person (you, in yours) or, in the group, whoever wrote the message
 * respondida.
 */

const { readPerson, withoutDelimiters } = require('./block');
const { client } = require('../client');
const { scheduleName, groupResolverName } = require('../contacts');
const { withoutAccents } = require('../util/format');
const { dataAlt, photoAlt } = require('./profile');
const { t } = require('../i18n');

const MAX_PROFILES = 4;
const FLAG = /(^|\s)-(?:profile|p)(?=\s|$)/;
// A person at the start of the text: /Compound Name/, @mention or +number
const PERSON_IN_START = /^\s*(\/[^/\n]+\/|[@$](?:me|this|reply)(?![\p{L}\d])|@\S+|\+\d[\d()-]*)/iu;
const EU = /^[@$]me$/i;
const THIS = /^[@$]this$/i;
const REPLY = /^[@$]reply$/i;

// The address book names (without accent and lowercase), for 30 s: the first name and the whole name of each contact
let namesCache = { when: 0, integers: new Set(), first: new Set() };
async function scheduleNames(nowAlt = Date.now()) {
    if (nowAlt - namesCache.when < 30_000) return namesCache;
    const integers = new Set();
    const first = new Set();
    for (const c of await client.getContacts().catch(() => [])) {
        const nameAlt = withoutAccents(scheduleName(c) ?? '').trim().replace(/\s+/g, ' ');
        if (!nameAlt) continue;
        integers.add(nameAlt);
        first.add(nameAlt.split(' ')[0]);
    }
    namesCache = { when: nowAlt, integers, first };
    return namesCache;
}

// Resets the schedule cache (the tests)
const restartNames = () => { namesCache = { when: 0, integers: new Set(), first: new Set() }; };

const WORD = /^[\p{L}][\p{L}'’-]*$/u;

/*
 * A loose name at the start of the text: the largest group of up to 3 words that is a contact's whole name
 * or, in a single word, the first name of some.
 * @returns {Promise<string|null>} the words as they were typed
 */
async function nameLoose(textAlt) {
    const words = textAlt.trim().split(/\s+/).slice(0, 3);
    if (!words.length || !WORD.test(words[0]) || withoutAccents(words[0]).length < 2) return null;

    const { integers, first } = await scheduleNames();
    for (let k = words.length; k >= 1; k--) {
        const group = words.slice(0, k);
        if (!group.every(p => WORD.test(p))) continue;
        const candidateAlt = withoutAccents(group.join(' '));
        if (integers.has(candidateAlt) || (k === 1 && first.has(candidateAlt))) return group.join(' ');
    }
    return null;
}

/**
 * Separates -p and the people right after it from the rest of the request.
 * @param {string} text  what was typed after the command
 * @returns {Promise<{ items: string[], text: string } | null>}  null: without -p
 */
async function textReadProfile(textAlt) {
    const m = String(textAlt ?? '').match(FLAG);
    if (!m) return null;

    const items = [];
    let rest = textAlt.slice(m.index + m[0].length);
    for (;;) {
        const i = rest.match(PERSON_IN_START);
        const loose = i ? null : await nameLoose(rest);
        if (!i && !loose) break;
        const piece = i ? i[1] : loose;
        items.push(piece);
        rest = rest.slice(rest.indexOf(piece) + piece.length);
    }

    const beforeAlt = textAlt.slice(0, m.index);
    return { items, text: [beforeAlt.trim(), rest.trim()].filter(Boolean).join(' ') };
}

/**
 * People's profile photos. Replies the error (no photo, person not found, no person) and returns null.
 * @returns {Promise<Array<{ name: string, image: { mimetype: string, data: string } }> | null>}
 */
async function resolverProfiles({ msg, quotedMsg, chatId, isGroup, items, cmd }) {
    const people = [];

    // Nobody: in private, the other person; in a group, whoever wrote the replied message
    const doChat = async () => {
        if (!isGroup) return { id: chatId };
        if (!quotedMsg) {
            await msg.reply(t('ai.profileNeedsPerson', { cmd }));
            return null;
        }
        return readPerson(msg, '', quotedMsg, cmd);
    };
    // @reply: who wrote the replied message (in private and in the group)
    const replyAuthor = async () => {
        if (!quotedMsg) {
            await msg.reply(t('ai.profileNeedsReply', { cmd }));
            return null;
        }
        return readPerson(msg, '', quotedMsg, cmd);
    };
    // @this: the chat you are in: in private, the other person; in a group, the group's own photo
    const thisChat = async () => isGroup
        ? { id: chatId, name: await groupResolverName(chatId).catch(() => null) ?? undefined }
        : { id: chatId };

    if (!items.length) {
        const person = await doChat();
        if (!person) return null;
        people.push(person);
    } else {
        for (const item of items) {
            // @me / $me: whoever typed the command (the owner, through the bot account)
            const person = EU.test(item)
                ? { id: msg.fromMe ? client.info.wid._serialized : (msg.author || msg.from) }
                : THIS.test(item) ? await thisChat()
                : REPLY.test(item) ? await replyAuthor()
                : await readPerson(msg, withoutDelimiters(item), null, cmd);
            if (!person) return null;
            if (!people.some(p => p.id === person.id)) people.push(person);
        }
    }

    if (people.length > MAX_PROFILES) {
        await msg.reply(t('ai.profileTooMany', { max: MAX_PROFILES }));
        return null;
    }

    const profiles = [];
    for (const person of people) {
        const { phone: phoneAlt, name: nameAlt, ids } = await dataAlt(person.id);
        const label = nameAlt ?? person.name ?? (phoneAlt ? `+${phoneAlt}` : person.id.split('@')[0]);
        const photo = await photoAlt(ids);
        if (!photo) {
            await msg.reply(t('ai.profileNoPhoto', { name: label }));
            return null;
        }
        profiles.push({ name: label, image: { mimetype: photo.mimetype, data: photo.data } });
    }
    return profiles;
}

/**
 * The text that tells the AI which image is which (the images go in order: the message photo and then the profile ones).
 */
function imagesContext({ withMessagePhoto: messageWithPhoto, profiles }) {
    if (!profiles.length) return '';
    const list = [
        ...(messageWithPhoto ? [t('ai.imgMessage')] : []),
        ...profiles.map(p => t('ai.imgProfile', { name: p.name }))
    ].map((x, i) => `${i + 1}) ${x}`).join('; ');
    return t('ai.imgContext', { list });
}

/**
 * Without -p: @me/$me and @this/$this right at the start of the request (after valueless options like -img or -g) count
 * as an implicit -p. Only these variables: a loose @mention at the start remains request text.
 * @returns {{ items: string[], text: string } | null}  null: no variable at the start
 */
function readProfileImplicit(textAlt) {
    const t0 = String(textAlt ?? '');
    const optionsAlt = t0.match(/^(?:\s*-[a-z]+(?=\s))*/i)[0];
    let rest = t0.slice(optionsAlt.length);
    const items = [];
    for (let m; (m = rest.match(/^\s*([@$](?:me|this|reply))(?![\p{L}\d])/iu));) {
        items.push(m[1]);
        rest = rest.slice(m[0].length);
    }
    if (!items.length) return null;
    return { items, text: [optionsAlt.trim(), rest.trim()].filter(Boolean).join(' ') };
}

module.exports = { imagesContext, textReadProfile, readProfileImplicit, restartNames, resolverProfiles };
