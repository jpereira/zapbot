/*
 * Comando /profile.
 */

const axios = require('axios');
const { MessageMedia } = require('whatsapp-web.js');

const { readPerson, textPeople, withoutDelimiters } = require('./block');
const { client } = require('../client');
const { scheduleName, contactName, resolveLidToPhone, groupResolverName } = require('../contacts');
const { printError } = require('../log');
const { SO_OWNER_OTHER_CHATS } = require('../permissions');

/*
 * /profile (/perfil): a contact's profile photo, with the name from your address book and the phone.
 * /profile                → in private, the person's (yours, in your own private chat);
 * in the group, the group photo
 * /profile <person>...    → /Name/, @mention or +number (several that match: you choose from the list)
 * /profile, replying   → who wrote the replied message
 * Without a photo, or with the photo hidden by the contact's privacy, only the text goes out.
 */
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
            printError('/profile: não baixei a foto:', err.message);
        }
    }
    return null;
}

async function showProfile(msg, person) {
    const { telefone: phoneAlt, nome: nameAlt, ids } = await dataAlt(person.id);
    const label = nameAlt ?? person.nome ?? (phoneAlt ? `+${phoneAlt}` : person.id.split('@')[0]);
    const contactAlt = `Contato: ${label}${phoneAlt ? ` <+${phoneAlt}>` : ''}`;

    const photo = await photoAlt(ids);
    if (photo) {
        await msg.reply(photo, undefined, { caption: contactAlt });
        return;
    }
    await msg.reply(`${contactAlt}\n🚫 Sem foto de perfil (ou ela está escondida pela privacidade do contato).`);
}

// The group photo, with the caption Grupo: name
async function showGroup(msg, chatId) {
    const nameAlt = await groupResolverName(chatId).catch(() => null);
    const group = `Grupo: ${nameAlt ?? chatId.split('@')[0]}`;

    const photo = await photoAlt([chatId]);
    if (photo) {
        await msg.reply(photo, undefined, { caption: group });
        return;
    }
    await msg.reply(`${group}\n🚫 Sem foto do grupo.`);
}

async function cmdProfile({ msg, opts, quotedMsg, chatId, isGroup, admin }) {
    const textAlt = opts.argv.join(' ').trim();

    // Whoever received /profile sees only the current chat's (the private chat person, the group or whoever wrote the replied one)
    if (!admin && textAlt) {
        await msg.reply(SO_OWNER_OTHER_CHATS);
        return;
    }

    // Nobody: the replied message (whoever wrote it), the group or the private chat person (you, in yours)
    if (!textAlt) {
        if (!quotedMsg && isGroup) {
            await showGroup(msg, chatId);
            return;
        }
        const person = quotedMsg
            ? await readPerson(msg, '', quotedMsg, '/profile')
            : { id: chatId };
        if (person) await showProfile(msg, person);
        return;
    }

    const seen = new Set();
    for (const item of textPeople(textAlt)) {
        const person = await readPerson(msg, withoutDelimiters(item), null, '/profile');
        if (!person || seen.has(person.id)) continue;
        seen.add(person.id);
        await showProfile(msg, person);
    }
}

module.exports = { cmdProfile };
