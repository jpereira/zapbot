/*
 * Choice from a list: when a command finds more than one option (e.g.: several
 * contacts with "Jorge" in the name), it shows the numbered list and waits for you
 * reply, in the same chat, with just the no.
 */

const { printInfo } = require('./log');

const CHOICE_MS = 2 * 60_000;

// chatId -> { options, resolve, timer }: one pending choice per chat
const pending = new Map();

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
 * @returns {Promise<any|null>} the chosen option; null if the time ran out or if another choice started in the chat
 */
function waitChoice(chatId, optionsAlt, { aoExpirar: onExpire } = {}) {
    // A new choice in the same chat cancels the previous one
    close(chatId, null);

    return new Promise((resolver) => {
        const timer = setTimeout(() => {
            close(chatId, null);
            onExpire?.().catch(() => {});
        }, CHOICE_MS);
        timer.unref?.();

        pending.set(chatId, { opcoes: optionsAlt, resolver, timer });
    });
}

/**
 * A message of yours with just a no. answers the chat's pending choice.
 * @returns {Promise<boolean>} true = it was the reply (it is not a message for anything else)
 */
async function replyChoice(msg, chatId, textAlt) {
    const p = pending.get(chatId);
    if (!p || !msg.fromMe || !/^\d{1,2}$/.test(textAlt)) return false;

    const n = Number(textAlt);
    if (n < 1 || n > p.opcoes.length) {
        await msg.reply(`❌ Escolha um nº de 1 a ${p.opcoes.length}.`);
        return true;
    }

    printInfo(`Escolha nº ${n} de ${p.opcoes.length} em ${chatId}`);
    close(chatId, p.opcoes[n - 1]);
    return true;
}

module.exports = {
    CHOICE_MS,
    waitChoice,
    replyChoice
};
