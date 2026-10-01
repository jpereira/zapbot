/*
 * Formatting of dates, numbers and texts.
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

// Without accents and lowercase: comparisons that do not tell "promoção" from "PROMOCAO"
const withoutAccents = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

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
    summarizeText,
    withoutAccents
};
