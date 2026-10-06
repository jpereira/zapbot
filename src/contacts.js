/*
 * Contacts and chats: numbers, @lid -> phone, group and mention names.
 */

const { client } = require('./client');
const { printDebug, printError } = require('./log');
const { isDebugMode } = require('./settings');
const { isChannelAlt } = require('./util/origin');

function normalizerPhoneNumber(phoneNumber) {
    return String(phoneNumber ?? '').replace(/\D/g, '');
}

function isPhoneNumber(value) {
    const digits = normalizerPhoneNumber(value);
    return digits.length >= 10 && digits.length <= 13;
}

function normalizeWid(wid) {
    if (!wid) return null;
    return `${wid.split('@')[0].split(':')[0]}@c.us`;
}

/**
 * Removes the device identifier (:1, :93 etc.)
 * without changing the original server: @lid stays @lid.
 */
function removeDeviceSuffix(jid) {
    if (!jid || typeof jid !== 'string') return null;

    const atIndex = jid.indexOf('@');
    if (atIndex === -1) return jid;

    const userPart = jid.substring(0, atIndex).split(':')[0];
    const serverPart = jid.substring(atIndex + 1);

    return `${userPart}@${serverPart}`;
}

const lidPhoneCache = new Map();

/**
 * Converts a @lid identifier to the real @c.us phone.
 */
async function resolveLidToPhone(lidJid) {
    const normalizedLid = removeDeviceSuffix(lidJid);

    if (!normalizedLid?.endsWith('@lid')) return normalizedLid;
    if (lidPhoneCache.has(normalizedLid)) return lidPhoneCache.get(normalizedLid);

    try {
        const result = await client.getContactLidAndPhone([normalizedLid]);

        const mapping = Array.isArray(result)
            ? result.find(item => removeDeviceSuffix(item?.lid) === normalizedLid)
            : null;

        let phoneJid = mapping?.pn || null;

        if (phoneJid && !phoneJid.includes('@')) {
            phoneJid = `${phoneJid}@c.us`;
        }

        phoneJid = removeDeviceSuffix(phoneJid);

        if (phoneJid?.endsWith('@c.us')) {
            lidPhoneCache.set(normalizedLid, phoneJid);
            return phoneJid;
        }

        return null;
    } catch (error) {
        printError('[LID] Falha ao converter LID para telefone:', normalizedLid, error?.message || String(error));
        return null;
    }
}

/*
 * Real name of a group (chatId @g.us -> group subject).
 * msg._data.chat is not always filled in (or comes with another chat's data),
 * so we look the chat up by id. Short cache: the group subject may change.
 */
const GROUP_NAME_TTL_MS = 10 * 60 * 1000;
const groupNameCache = new Map();

async function groupResolverName(chatId) {
    if (!chatId?.endsWith('@g.us')) return null;

    const cache = groupNameCache.get(chatId);
    if (cache && Date.now() - cache.at < GROUP_NAME_TTL_MS) return cache.name;

    const chat = await client.getChatById(chatId).catch((err) => {
        if (isDebugMode()) printDebug(`[GRUPO] getChatById falhou para ${chatId}: ${err?.message || err}`);
        return null;
    });

    // getChatById builds the group's full model and breaks for some groups (@lid);
    // in that case we read the subject straight from the WhatsApp Web collections.
    const name =
        chat?.name ||
        chat?.groupMetadata?.subject ||
        (await groupInStoreName(chatId)) ||
        null;

    if (name) groupNameCache.set(chatId, { name, at: Date.now() });
    return name;
}

/*
 * Name of a private conversation: the OTHER participant's contact (the saved name
 * in your address book, otherwise the profile one). The message's notifyName does not work: it is the
 * whoever sent, and in your messages it would be yours. For a @lid, first tries
 * the contact by real phone. Same short cache as the groups.
 */
const privateNameCache = new Map();

async function privateResolverName(chatId) {
    if (!chatId || chatId.endsWith('@g.us') || chatId.endsWith('@broadcast') || isChannelAlt(chatId)) {
        return null;
    }

    const cache = privateNameCache.get(chatId);
    if (cache && Date.now() - cache.at < GROUP_NAME_TTL_MS) return cache.name;

    const phoneAlt = chatId.endsWith('@lid') ? await resolveLidToPhone(chatId) : null;
    let name = null;

    for (const id of [phoneAlt, chatId].filter(Boolean)) {
        const contactAlt = await client.getContactById(id).catch(() => null);
        name = contactAlt?.name || contactAlt?.pushname || contactAlt?.verifiedName || null;
        if (name) break;
    }

    if (name) privateNameCache.set(chatId, { name, at: Date.now() });
    return name;
}

async function channelResolverName(chatId) {
    if (!isChannelAlt(chatId)) return null;
    const channel = await client.getChatById(chatId).catch(() => null);
    return channel?.name || null;
}

async function groupInStoreName(chatId) {
    if (!client.pupPage) return null;

    return client.pupPage.evaluate((id) => {
        const { Chat, GroupMetadata } = window.require('WAWebCollections');
        const wid = window.require('WAWebWidFactory').createWid(id);
        const chat = Chat.get(wid);

        return GroupMetadata?.get(wid)?.subject || chat?.name || chat?.formattedTitle || null;
    }, chatId).catch((err) => {
        if (isDebugMode()) printDebug(`[GRUPO] Store sem o grupo ${chatId}: ${err?.message || err}`);
        return null;
    });
}

/*
 * Swaps the text's raw mentions (@100000000000001, which may be a LID or a phone)
 * by the contact name: "@100000000000001" -> "@Fulano".
 * mentionedIds (of the message) helps tell whether the number is @lid or @c.us;
 * without it (e.g.: the /watch occurrences, which do not store the ids) we try both.
 */
const mentionNameCache = new Map();

async function mentionName(user, mentionedIds = []) {
    if (mentionNameCache.has(user)) return mentionNameCache.get(user);

    const candidates = mentionedIds
        .map(m => removeDeviceSuffix(typeof m === 'string' ? m : m?._serialized))
        .filter(jid => jid?.split('@')[0] === user);

    if (!candidates.length) candidates.push(`${user}@lid`, `${user}@c.us`);

    let nameAlt = null;

    for (const jid of candidates) {
        // For a @lid, the contact by real phone usually has the name saved in the address book
        const phoneJid = jid.endsWith('@lid') ? await resolveLidToPhone(jid) : null;

        for (const id of [phoneJid, jid].filter(Boolean)) {
            const contact = await client.getContactById(id).catch(() => null);
            nameAlt = contact?.name || contact?.pushname || contact?.verifiedName || null;
            if (nameAlt) break;
        }

        if (!nameAlt && phoneJid) nameAlt = `+${phoneJid.split('@')[0]}`;
        if (nameAlt) break;
    }

    if (nameAlt) mentionNameCache.set(user, nameAlt);
    return nameAlt;
}

async function resolverMentions(textAlt, mentionedIds = []) {
    textAlt = String(textAlt ?? '');
    const users = [...new Set([...textAlt.matchAll(/@(\d{6,})/g)].map(m => m[1]))];

    for (const user of users) {
        const nameAlt = await mentionName(user, mentionedIds);
        if (nameAlt) textAlt = textAlt.replaceAll(`@${user}`, `@${nameAlt}`);
    }

    return textAlt;
}

// In private conversations the same chat may appear as @lid or @c.us
async function chatCurrentIds(chatId) {
    const ids = [chatId];

    if (chatId.endsWith('@lid')) {
        const phoneAlt = await resolveLidToPhone(chatId);
        if (phoneAlt) ids.push(phoneAlt);
    }

    return ids;
}

module.exports = {
    chatCurrentIds,
    isPhoneNumber,
    normalizeWid,
    normalizerPhoneNumber,
    removeDeviceSuffix,
    resolveLidToPhone,
    resolverMentions,
    channelResolverName,
    groupResolverName,
    privateResolverName
};
