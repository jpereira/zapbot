/*
 * Comando /profile.
 */

const axios = require('axios');
const { MessageMedia } = require('whatsapp-web.js');

const { readPerson, textPeople, withoutDelimiters } = require('./block');
const { isPhoto } = require('./openaiCommon');
const { client } = require('../client');
const { scheduleName, contactName, resolveLidToPhone, groupResolverName } = require('../contacts');
const { t } = require('../i18n');
const { printError } = require('../log');

/*
 * /profile: a contact's profile photo, with the name from your address book and the phone.
 * /profile                → in private, the person's (yours, in your own private chat);
 * in the group, the group photo
 * /profile <person>...    → /Name/, @mention or +number (several that match: you choose from the list)
 * /profile, replying   → who wrote the replied message
 * Without a photo, or with the photo hidden by the contact's privacy, only the text goes out.
 *
 * /profile -set|-s        → changes the photo to the replied image (or sent with the command in the caption):
 * the group's, in the group; your account's, in the other chats
 *
 * /profile -about|-a [person...]  → the person's message (about), as text; with nobody, same as /profile
 * (in a group, the group description)
 * /profile -set <text>           → changes YOUR message (without an image): up to 139 characters, without
 * line break nor control characters
 */
const ABOUT_MAX = 139;
// Control characters (including the line break), invisibles that hide text and those that reverse direction (the
// 200D, which joins emojis, and FE0F, which paints them, stay)
const ABOUT_PROHIBITED = /[\p{Cc}\p{Cs}\p{Co}\p{Cn}\u2028\u2029\u200B\u200C\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/u;
const TIMEOUT_MS = 15000;
const MAX_BYTES = 10 * 1024 * 1024;

/*
 * The person of an id (phone or @lid): the phone (null: WhatsApp did not report it) and the name, the
 * your address book first and, for whoever is not in it, the profile one.
 */
async function dataAlt(id) {
    const jid = id.endsWith('@lid') ? await resolveLidToPhone(id) : id;
    const phoneAlt = jid?.endsWith('@c.us') ? jid.split('@')[0] : null;

    const contacts = [];
    for (const target of new Set([jid, id].filter(Boolean))) {
        contacts.push(await client.getContactById(target).catch(() => null));
    }
    const nameAlt = contacts.map(scheduleName).find(Boolean) || contacts.map(contactName).find(Boolean) || null;

    return { telefone: phoneAlt, nome: nameAlt, ids: [...new Set([jid, id].filter(Boolean))] };
}

// The photo as media, or null (no photo, private photo or the download failed)
async function photoAlt(ids) {
    for (const id of ids) {
        const url = await client.getProfilePicUrl(id).catch(() => null);
        if (!url) continue;

        try {
            const { data, headers } = await axios.get(url, {
                responseType: 'arraybuffer', timeout: TIMEOUT_MS, maxContentLength: MAX_BYTES
            });
            const mime = String(headers?.['content-type'] ?? 'image/jpeg').split(';')[0];
            return new MessageMedia(mime, Buffer.from(data).toString('base64'), 'perfil.jpg');
        } catch (err) {
            printError('/profile: could not download the photo:', err.message);
        }
    }
    return null;
}

async function showProfile(msg, person) {
    const { telefone: phoneAlt, nome: nameAlt, ids } = await dataAlt(person.id);
    const label = nameAlt ?? person.nome ?? (phoneAlt ? `+${phoneAlt}` : person.id.split('@')[0]);
    const contactAlt = t('profile.contact', { label: label + (phoneAlt ? ` <+${phoneAlt}>` : '') });

    const photo = await photoAlt(ids);
    if (photo) {
        await msg.reply(photo, undefined, { caption: contactAlt });
        return;
    }
    await msg.reply(`${contactAlt}\n${t('profile.noPhoto')}`);
}

// Someone's message (about), or null (no message, or hidden by privacy)
async function messageAlt(ids) {
    for (const id of ids) {
        const contactAlt = await client.getContactById(id).catch(() => null);
        const message = await contactAlt?.getAbout?.().catch(() => null);
        if (message) return message;
    }
    return null;
}

async function showMessage(msg, person) {
    const { telefone: phoneAlt, nome: nameAlt, ids } = await dataAlt(person.id);
    const label = nameAlt ?? person.nome ?? (phoneAlt ? `+${phoneAlt}` : person.id.split('@')[0]);
    const who = label + (phoneAlt ? ` <+${phoneAlt}>` : '');

    const message = await messageAlt(ids);
    await msg.reply(message ? t('profile.about', { label: who, text: message }) : t('profile.noAbout', { label: who }));
}

// -about in a group, with nobody: the group description
async function groupShowDescription(msg, chatId) {
    const nameAlt = await groupResolverName(chatId).catch(() => null) ?? chatId.split('@')[0];
    const group = await msg.getChat().catch(() => null);
    const description = String(group?.description ?? '').trim();
    await msg.reply(description
        ? t('profile.groupAbout', { name: nameAlt, text: description })
        : t('profile.noGroupAbout', { name: nameAlt }));
}

// -set <text>: your message
async function defineMessage(msg, textAlt) {
    const size = [...textAlt].length;
    if (size > ABOUT_MAX) {
        await msg.reply(t('profile.aboutTooLong', { max: ABOUT_MAX, n: size }));
        return;
    }
    if (ABOUT_PROHIBITED.test(textAlt)) {
        await msg.reply(t('profile.aboutBadChars'));
        return;
    }

    try {
        await client.setStatus(textAlt);
        await msg.reply(t('profile.aboutSet', { text: textAlt }));
    } catch (err) {
        printError('/profile -set (about):', err.message);
        await msg.reply(t('profile.setFailed', { error: err.message }));
    }
}

// The group photo, with the caption Grupo: name
async function showGroup(msg, chatId) {
    const nameAlt = await groupResolverName(chatId).catch(() => null);
    const group = t('profile.group', { name: nameAlt ?? chatId.split('@')[0] });

    const photo = await photoAlt([chatId]);
    if (photo) {
        await msg.reply(photo, undefined, { caption: group });
        return;
    }
    await msg.reply(`${group}\n${t('profile.noGroupPhoto')}`);
}

// -set: the group photo (if WhatsApp lets you touch it) or your account's
async function swapPhoto(msg, quotedMsg, isGroup) {
    const origin = [quotedMsg, msg].find(isPhoto);
    if (!origin) {
        await msg.reply(t('profile.setUsage'));
        return;
    }

    const mediaAlt = await origin.downloadMedia().catch(() => null);
    if (!mediaAlt?.data) {
        await msg.reply(t('profile.setDownload'));
        return;
    }

    try {
        if (isGroup) {
            const group = await msg.getChat();
            await msg.reply(await group.setPicture(mediaAlt) ? t('profile.setGroupOk') : t('profile.setGroupDenied'));
        } else {
            await msg.reply(await client.setProfilePicture(mediaAlt) ? t('profile.setOwnOk') : t('profile.setFailed', { error: '-' }));
        }
    } catch (err) {
        printError('/profile -set:', err.message);
        await msg.reply(t('profile.setFailed', { error: err.message }));
    }
}

async function cmdProfile({ msg, opts, quotedMsg, chatId, isGroup }) {
    const textAlt = opts.argv.join(' ').trim();

    if (opts.given.has('set')) {
        // With text and no image: the message; otherwise, the photo
        if (textAlt && ![quotedMsg, msg].some(isPhoto)) await defineMessage(msg, textAlt);
        else await swapPhoto(msg, quotedMsg, isGroup);
        return;
    }

    const message = opts.given.has('about');
    const showAlt = message ? showMessage : showProfile;

    // Nobody: the replied message (whoever wrote it), the group or the private chat person (you, in yours)
    if (!textAlt) {
        if (!quotedMsg && isGroup) {
            await (message ? groupShowDescription(msg, chatId) : showGroup(msg, chatId));
            return;
        }
        const person = quotedMsg
            ? await readPerson(msg, '', quotedMsg, '/profile')
            : { id: chatId };
        if (person) await showAlt(msg, person);
        return;
    }

    const seen = new Set();
    for (const item of textPeople(textAlt)) {
        const person = await readPerson(msg, withoutDelimiters(item), null, '/profile');
        if (!person || seen.has(person.id)) continue;
        seen.add(person.id);
        await showAlt(msg, person);
    }
}

module.exports = { cmdProfile, dataAlt, photoAlt };
