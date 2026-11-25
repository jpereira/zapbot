/*
 * /games: Group games: magic 8 ball, truth, dare and trivia
 */

const { USER } = require('../../roles').ROLES;

module.exports = {
    cmd: '/games',
    usage: '/games -8ball <question>  or  /games -truth|-dare  or  /games -trivia [A|B|C|D]',
    aliases: [],
    summary: 'Group games: magic 8 ball, truth, dare and trivia',
    help: 'Group games: the magic 8 ball answers a question, truth and dare pick a question or a challenge for the group, and trivia asks a general-knowledge question with 4 options (answer with /games -trivia B within 5 minutes). You can also play just by replying to the bot\'s message: the letter to a trivia, another question to the 8 ball, your answer to a truth or dare (the bot reacts with ✅; "next" draws another). The lists follow the bot language (zapbot.lang).',
    ex: ['/games -8ball will I pass the exam?', '/games -truth', '/games -dare', '/games -trivia', '/games -trivia B'],
    cmd_opts: [
        {
            opts: ['8ball', '8'],
            values: [],
            desc: 'The magic 8 ball: ask a yes/no question and it answers (yes, no or maybe).',
            ex: ['/games -8ball will it rain tomorrow?']
        },
        {
            opts: ['truth', 't'],
            values: [],
            desc: 'A truth question for the group.',
            ex: ['/games -truth']
        },
        {
            opts: ['dare', 'd'],
            values: [],
            desc: 'A dare for the group.',
            ex: ['/games -dare']
        },
        {
            opts: ['trivia', 'tr'],
            values: [],
            desc: 'A general-knowledge question with 4 options. Answer with the letter (A, B, C or D) within 5 minutes: `-trivia B`. One open question per chat.',
            ex: ['/games -trivia', '/games -trivia C'],
            cron: false
        }
    ],
    role: USER,
    cron: true
};
