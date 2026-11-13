/*
 * /search: Searches messages in the WhatsApp Web history
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/search',
    usage: '/search [-N] <text> | -read <id>',
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
            opts: ['read', 'r'],
            values: ['<id>'],
            desc: 'Shows the whole message for an id from the search list (same scope: this chat, or all chats in your private chat).',
            ex: ['/search -read false_5521988887777@c.us_3EB0A1B2']
        },
        {
            opts: ['mask', 'm'],
            values: [],
            desc: 'Obfuscates phone numbers in the output (e.g. +55219****44).',
            ex: ['/search -mask pix']
        }
    ],
    mask: true,
    role: ADMIN // lê o histórico de todos os chats
};
