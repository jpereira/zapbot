/*
 * /show: Shows messages from the bot cache
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/show',
    usage: '/show [-N] [OPTION] [chat]  or  /show -l [chat]  or  /show -q <text|/regex/flags> [-N] [chat]',
    summary: 'Shows messages from the bot cache',
    help: 'With no parameters in the private chat, lists the cache of all chats, like /show -l. In groups, shows again the last deleted message of the group. Shows again the deleted and edited messages, the deleted statuses and the removed or changed reactions that are in the cache: from this chat or another (by the -l number, name, @mention or /regex/). Channel (@newsletter) posts are identified with 📰 Canal and the name, without a contact name or phone number.',
    cmd_opts: [
        { opts: ['deleted', 'd'], values: [], desc: 'Deleted messages (without chat, the default).' },
        {
            opts: ['edited', 'e'],
            values: [],
            desc: 'Edited messages, with the text before and after.'
        },
        {
            opts: ['status', 's'],
            values: [],
            desc: 'Deleted statuses: in a private chat, the person\'s; in your private chat, without chat, everyone\'s.'
        },
        {
            opts: ['reaction', 'r'],
            values: [],
            desc: 'Removed or changed reactions, with the previous reaction (and the new one, if changed) and the text of the reacted message.'
        },
        {
            opts: ['list', 'l'],
            values: [],
            desc: 'Lists the chats with content in the cache. Numbered for /show <no.>, marking the current chat. With chat (no., name, @mention or /regex/), only the ones that match, and the counts only for them.',
            ex: ['/show -l', '/show -l /^Maria/'],
            outrosChats: true
        },
        {
            opts: ['flush', 'f'],
            values: [],
            desc: 'Removes the deleted ones of this chat from the cache. With -e/-s/-r/chat, whatever was requested (in your private chat, without chat: all of them). With -yes, everything.',
            role: ADMIN
        },
        {
            opts: ['yes', 'y'],
            values: [],
            desc: 'With -flush: removes EVERYTHING in the scope, not just the deleted ones: deleted, edited, status and reactions, and the media files of the deleted ones and of the status ones. In your private chat without a chat: of all chats; in another chat or with a chat: only that one. Only valid with -flush.',
            ex: ['/show -f -yes', '/show -f -y /^Maria/'],
            role: ADMIN
        },
        {
            opts: ['query', 'q'],
            values: ['<text|/regex/flags>'],
            desc: 'Searches for the ones that contain the text (case- and accent-insensitive) or that match the /regex/flags. In this chat, in the requested chat or, in your private chat, in all of them. Without -N: the 5 most recent. With spaces, use quotes.',
            ex: ['/show -q refund', '/show -e -q "good morning"', '/show -5 -q /refund|invoice/i']
        },
        {
            argv: ['-N'],
            desc: 'Number of messages (default 1, max. show.max).',
            ex: ['/show -3'],
            numero: true
        },
        {
            argv: ['chat'],
            desc: 'Another chat: the number from the -l list, part of the name, @mention or /regex/ (case- and accent-insensitive). Without -d, -e, -s and -r, deleted, edited, statuses and reactions come together, by date.',
            ex: ['/show -3 /^Maria/'],
            outrosChats: true
        },
        {
            opts: ['mask', 'm'],
            values: [],
            desc: 'Obfuscates phone numbers in the output (e.g. +55219****44). Saved data and destinations use the full numbers.',
            ex: ['/show -m']
        }
    ],
    estrito: true,
    mask: true,
    delegavel: true,
    role: ADMIN // delegable: current chat only (-flush is owner only)
};
