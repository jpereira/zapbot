/*
 * /search: Searches messages in the WhatsApp Web history
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/search',
    usage: '/search [-N] [-all] <text> | -read <no.|id>',
    aliases: [],
    summary: 'Searches messages in the WhatsApp Web history',
    help: 'Searches messages in the WhatsApp Web history, including ones that never went through the bot cache (/show -q searches the cache only). In this chat; in your private chat, in all chats. Shows the date, the sender (and the chat, when searching all), the text and the id; with -read, shows the whole message.',
    cmd_opts: [
        {
            argv: ['-N'],
            desc: 'Number of messages (default 10, max 50).',
            ex: ['/search -30 boleto']
        },
        {
            argv: ['<text>'],
            desc: 'What to search for, like the WhatsApp search (case-insensitive).',
            ex: ['/search pix', '/search good morning']
        },
        {
            opts: ['all', 'a'],
            values: [],
            desc: 'Searches all chats from anywhere and sends the list to your private chat (so the other chats\' messages do not show up where you typed). Owner only.',
            ex: ['/search -all correct']
        },
        {
            opts: ['read', 'r'],
            values: ['<no.|id>'],
            desc: 'Shows the whole message of a result of the last search, by its number in the list (or by its whole id). Same scope: this chat, or all chats in your private chat.',
            ex: ['/search -r 1', '/search -r false_5521988887777@c.us_3EB0A1B2']
        },
        {
            opts: ['mask', 'm'],
            values: [],
            desc: 'Obfuscates phone numbers in the output (e.g. +55219****44).',
            ex: ['/search -m pix']
        }
    ],
    mask: true,
    role: ADMIN // reads the history of all chats
};
