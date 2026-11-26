/*
 * /poll: Creates a poll in the chat or shows the result
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/poll',
    usage: '/poll [-m] <question> | <option 1> | <option 2> [| ...]  or  /poll -r',
    aliases: [],
    summary: 'Creates a poll in the chat or shows the result',
    help: 'Creates a poll in the chat (separate the question and options, 2 to 12, with | or one per line) or shows the result with -r.',
    ex: ['/poll Pizza or burger? | Pizza | Burger', '/poll -r'],
    cmd_opts: [
        {
            opts: ['multi', 'm'],
            values: [],
            desc: 'Allows selecting more than one option (only at the start of the text).'
        },
        {
            opts: ['result', 'r'],
            values: [],
            desc: 'Result of the most recent poll in the chat (or of the replied poll): votes per option and who voted.'
        }
    ],
    isDelegable: true,
    role: ADMIN // delegable: creates in the current chat
};
