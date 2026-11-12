/*
 * /translate: Translates text with Google Translate
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/translate',
    usage: '/translate [-para <language>] [text]',
    aliases: ['/traduzir'],
    summary: 'Translates text with Google Translate',
    help: 'Translates the text (or the replied message) with Google Translate, no key and no cost. The source language is detected.',
    ex: ['/translate Where is the pharmacy?', '/translate -para en bom dia', '/translate -p es'],
    cmd_opts: [
        {
            opts: ['list', 'l'],
            values: [],
            desc: 'Lists the supported languages, with their code.',
            ex: ['/translate -l']
        },
        {
            opts: ['para', 'p'],
            values: ['<language>'],
            desc: 'Target language, by code: en, es, fr, zh-CN... Default: setting traduzir.lang (pt).',
            ex: ['/translate -para en bom dia']
        },
        {
            argv: ['[text]'],
            desc: 'Text to translate (up to 5000 characters). Without it, the replied message.'
        }
    ],
    role: USER
};
