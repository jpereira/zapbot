/*
 * /block: Blocks people on your WhatsApp account
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/block',
    usage: '/block [/contact/|@mention|+number]...  or  /block -l',
    aliases: [],
    summary: 'Blocks people on your WhatsApp account',
    help: 'Blocks one or more people on your WhatsApp account, like Block on the phone. Replying to a message blocks whoever wrote it. With nothing, lists the blocked people (including the ones you blocked on the phone), numbered for /unblock <num>. Groups cannot be blocked.',
    cmd_opts: [
        {
            opts: ['list', 'l'],
            values: [],
            desc: 'Lists the blocked people (same as /block with nothing).'
        },
        {
            argv: ['[/contact/|@mention|+number]...'],
            desc: 'The people, separated by spaces: an address book contact by name or part of it (a name with spaces goes between /.../ or quotes; if several match, you pick from the list), someone mentioned with @, or a number. Loose words, without a number, mention, slashes or quotes, are a single name.',
            ex: [
                '/block /Fulano/',
                '/block +5521999999999',
                '/block +5521999999999 +5521988888888 @Fulano'
            ]
        },
        {
            opts: ['mask', 'm'],
            values: [],
            desc: 'Obfuscates phone numbers with 10 to 15 consecutive digits in this run\'s output, keeping the first five and the last two (like +55219****44).',
            ex: ['/block -mask']
        }
    ],
    mask: true,
    role: ADMIN // mexe na conta do WhatsApp
};
