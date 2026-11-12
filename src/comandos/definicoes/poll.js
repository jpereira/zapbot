/*
 * /poll: Cria uma enquete no chat ou mostra o resultado
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/poll',
    usage: '/poll [-m] <question> | <option 1> | <option 2> [| ...]  or  /poll -r',
    aliases: ['/enquete', '/quiz'],
    summary: 'Creates a poll in the chat or shows the result',
    help: 'Creates a poll in the chat (separate the question and options, 2 to 12, with | or one per line) or shows the result with -r.',
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
    delegavel: true,
    role: ADMIN // delegável: cria no chat atual
};
