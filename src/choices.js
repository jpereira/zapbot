/*
 * Choice from a list: when a command finds more than one option (e.g.: several
 * contacts with "Jorge" in the name), it shows the numbered list and waits for you
 * reply, in the same chat, with just the no. And the confirmation (e.g.: /bot -reset):
 * waits for a "sim" (or "não") from whoever gave the command.
 */

const { printInfo } = require('./log');
const { t } = require('./i18n');

const CHOICE_MS = 2 * 60_000;

// chatId -> { options | confirmation, resolve, timer, author }: one pending per chat
const pending = new Map();

// Who sent the message: you ("owner") or the person's jid (a bot.admins admin)
const authorAlt = (msg) => (msg.fromMe ? 'dono' : (msg.author || msg.from || null));

function close(chatId, chosen) {
    const p = pending.get(chatId);
    if (!p) return;

    pending.delete(chatId);
    clearTimeout(p.timer);
    p.resolver(chosen);
}

/**
 * Waits for the no. of one of the options in this chat.
 * @param {string} chatId
 * @param {Array} opcoes
 * @param {object} [o]
 * @param {() => Promise<void>} [o.onExpire]  notifies the chat that the time is up
 * @param {string} [o.autor]  who can reply (the command message's authorAlt; default: you)
 * @returns {Promise<any|null>} the chosen option; null if the time ran out or if another choice started in the chat
 */
function waitChoice(chatId, optionsAlt, { aoExpirar: onExpire, autor: author = 'dono' } = {}) {
    // A new choice in the same chat cancels the previous one
    close(chatId, null);

    return new Promise((resolver) => {
        const timer = setTimeout(() => {
            close(chatId, null);
            onExpire?.().catch(() => {});
        }, CHOICE_MS);
        timer.unref?.();

        pending.set(chatId, { opcoes: optionsAlt, resolver, timer, autor: author });
    });
}

/**
 * Waits for a "sim" (true) or a "não" (false) from whoever gave the command, in this chat.
 * @param {string} chatId
 * @param {object} [o]
 * @param {number} [o.ms]  o prazo
 * @param {() => Promise<void>} [o.onExpire]  notifies the chat that the time is up
 * @param {string} [o.autor]  who can reply (default: you)
 * @returns {Promise<boolean|null>} null if the time ran out or if another pending started in the chat
 */
function waitConfirmation(chatId, { ms = 10_000, aoExpirar: onExpire, autor: author = 'dono' } = {}) {
    close(chatId, null);

    return new Promise((resolver) => {
        const timer = setTimeout(() => {
            close(chatId, null);
            onExpire?.().catch(() => {});
        }, ms);
        timer.unref?.();

        pending.set(chatId, { confirmacao: true, resolver, timer, autor: author });
    });
}

/**
 * The reply to the chat's pending, from whoever gave the command: only a no. (choice)
 * or "sim"/"não" (confirmation). Any other message follows the normal path.
 * @returns {Promise<boolean>} true = it was the reply (it is not a message for anything else)
 */
async function replyChoice(msg, chatId, textAlt) {
    const p = pending.get(chatId);
    if (!p || authorAlt(msg) !== p.autor) return false;

    if (p.confirmacao) {
        const reply = /^(sim|yes)$/i.test(textAlt) ? true : /^(n[aã]o|no)$/i.test(textAlt) ? false : null;
        if (reply === null) return false;
        printInfo(`Confirmação em ${chatId}: ${textAlt}`);
        close(chatId, reply);
        return true;
    }

    if (!/^\d{1,2}$/.test(textAlt)) return false;

    const n = Number(textAlt);
    if (n < 1 || n > p.opcoes.length) {
        await msg.reply(t('escolhas.invalida', { max: p.opcoes.length }));
        return true;
    }

    printInfo(`Escolha nº ${n} de ${p.opcoes.length} em ${chatId}`);
    close(chatId, p.opcoes[n - 1]);
    return true;
}

module.exports = {
    CHOICE_MS,
    waitConfirmation,
    waitChoice,
    authorAlt,
    replyChoice
};
