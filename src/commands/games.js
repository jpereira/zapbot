/*
 * Comando /games.
 */

const GAMES = require('./games.json');
const { language, t } = require('../i18n');
const { permissionHere, levelAlt } = require('../permissions');
const { ROLES, answer } = require('../roles');
const { getSetting } = require('../settings');

/*
 * /games: group games, with the lists from games.json (en_US and pt_BR, in the bot language).
 * -8ball <question>   → the magic 8 ball answers
 * -truth              → a "truth" question
 * -dare               → a dare
 * -trivia [A-D]       → a general knowledge question; A-D answers the one open in the chat
 *
 * The trivia question stays in memory, per chat, and lasts 5 minutes (when the bot restarts, it is gone).
 *
 * You can also play just by replying (reply) to the bot's message, without typing the command:
 * trivia  → answer the question with the letter ("B")
 * 8ball   → reply with another question
 * truth/dare → reply with your answer (the bot reacts with ✅); "outra"/"next" draws another
 * Game messages stay in `jogos` (bot message id → game) for 30 minutes.
 */
const GAME_MS = 30 * 60 * 1000;
const games = new Map();   // bot message id → { game, expires }
const TRIVIA_MS = 5 * 60 * 1000;
const LETTERS = ['A', 'B', 'C', 'D'];
const openAlt = new Map();   // chatId → { correct, text, expires }

const list = (nameAlt) => (GAMES[language()] ?? GAMES.en_US)[nameAlt];
const draw = (items) => items[Math.floor(Math.random() * items.length)];

// Replies and remembers the bot's message, so its reply continues the game
async function send(msg, textAlt, game) {
    const sent = await msg.reply(textAlt);
    const id = sent?.id?._serialized;
    if (id) games.set(id, { game, expires: Date.now() + GAME_MS });
}

function ask(chatId) {
    const q = draw(list('trivia'));
    openAlt.set(chatId, { correct: q.a, answer: q.o[q.a], expires: Date.now() + TRIVIA_MS });
    return t('games.trivia', {
        question: q.q,
        options: q.o.map((o, i) => `${LETTERS[i]}) ${o}`).join('\n'),
        min: TRIVIA_MS / 60000
    });
}

function replyAlt(chatId, letter) {
    const i = LETTERS.indexOf(String(letter).trim().toUpperCase());
    if (i < 0) return t('games.triviaBadAnswer');

    const open = openAlt.get(chatId);
    if (!open || open.expires < Date.now()) {
        openAlt.delete(chatId);
        return t('games.triviaNone');
    }

    openAlt.delete(chatId);
    const right = `${LETTERS[open.correct]}) ${open.answer}`;
    return t(i === open.correct ? 'games.triviaRight' : 'games.triviaWrong', { answer: right });
}

const ball = (question) => t('games.ball', { question: question, answer: draw(list('ball')) });
const truth = () => t('games.truth', { text: draw(list('truth')) });
const challenge = () => t('games.dare', { text: draw(list('dare')) });

async function cmdGames({ msg, opts, chatId, quotedMsg }) {
    const { opt, argv } = opts;
    // The 8 ball accepts the replied message as the question
    const question = argv.join(' ').trim() || (opt['8ball'] ? String(quotedMsg?.body ?? '').trim() : '');

    if (opt['8ball']) {
        if (question) await send(msg, ball(question), 'ball');
        else await msg.reply(t('games.ballNeedsQuestion'));
    } else if (opt.truth) {
        await send(msg, truth(), 'truth');
    } else if (opt.dare) {
        await send(msg, challenge(), 'dare');
    } else if (opt.trivia) {
        if (argv.length) await msg.reply(replyAlt(chatId, argv[0]));
        else await send(msg, ask(chatId), 'trivia');
    } else {
        await msg.reply(t('games.usage'));
    }
}

/**
 * A reply (reply) to a bot game message, without the command: plays through it.
 * Applies to whoever can use /games in this chat.
 * @returns {Promise<boolean>} true: it was from the game (the message was handled)
 */
async function replyGame(msg, chatId, body, { senderNumber, isGroup }) {
    if (!games.size || !msg.hasQuotedMsg || !body || body.startsWith('/')) return false;

    const nowAlt = Date.now();
    for (const [id, j] of games) if (j.expires < nowAlt) games.delete(id);

    const quoted = await msg.getQuotedMessage().catch(() => null);
    const game = games.get(quoted?.id?._serialized)?.game;
    if (!game || getSetting('bot.paused')) return false;

    const permission = permissionHere({ number: senderNumber, chatId, isGroup });
    const level = levelAlt({ fromMe: msg.fromMe, number: senderNumber, permission });
    if (!answer(level, ROLES.ADMIN) && !permission.can('/games')) return false;

    if (game === 'trivia') {
        const letter = body.match(/^\s*([abcd])\s*[).]?\s*$/i)?.[1];
        if (!letter) return false;
        await msg.reply(replyAlt(chatId, letter));
    } else if (game === 'ball') {
        await send(msg, ball(body), 'ball');
    } else if (/^\s*(next|another|other|outra|outro|pular|passo|pass)\b/i.test(body)) {
        await send(msg, game === 'truth' ? truth() : challenge(), game);
    } else {
        try {
            await msg.react('✅');
        } catch { /* without a reaction: the game carries on */ }
    }
    return true;
}

module.exports = { GAMES, openAlt, cmdGames, games, replyGame };
