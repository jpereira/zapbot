/*
 * Formatting of dates, numbers and texts.
 */

/*
 * Deleted message recovery
 *
 * The same renderer is used in two places:
 * - event 'message_revoke_everyone' → sends to yourself, right away;
 * - command /show                    → resends in the current chat, on demand.
 */

// Timestamp stored in seconds (WhatsApp) or milliseconds (Date.now())
function paraMs(valueAlt) {
    const n = Number(valueAlt);
    return n < 10_000_000_000 ? n * 1000 : n;
}

function formatData(valueAlt) {
    return new Date(paraMs(valueAlt)).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

const wait = (ms) => new Promise(r => setTimeout(r, ms));

const plural = (n, um, several) => `${n} ${n === 1 ? um : several}`;

const fmtInA = (n) => Number(n).toLocaleString('pt-BR');

/*
 * /watch (alias /w)
 * /watch                     → the same as /watch -s (occurrences of all the rules)
 * /watch -l                  → lists the rules (no., rule, occurrences)
 * /watch -s [-N]             → summary of the messages that matched rule N (without N: all)
 *   /watch -a <texto|/regex/>  → adiciona regra
 * /watch -d -N               → removes rule N and its occurrences
 * /watch -f [-N]             → deletes rule N's occurrences (without N: of all); keeps the rules
 * The rules stay in the 'watch.rules' setting; the occurrences in the watch_hits table.
 * -l and -s show other people's conversations: outside your private chat, the reply goes there.
 */
const summarizeText = (textAlt, max = 100) => {
    const t = String(textAlt ?? '').replace(/\s+/g, ' ').trim();
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

module.exports = {
    wait,
    fmtInA,
    formatData,
    paraMs,
    plural,
    summarizeText
};
