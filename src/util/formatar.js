/*
 * Formatação de datas, números e textos.
 */

const { idioma } = require('../i18n');

// 'pt_BR' → 'pt-BR'; qualquer outro idioma → 'en-US'
const localeAtual = () => (idioma() === 'pt_BR' ? 'pt-BR' : 'en-US');

// Timestamp salvo em segundos (WhatsApp) ou milissegundos (Date.now())
function paraMs(valor) {
    const n = Number(valor);
    return n < 10_000_000_000 ? n * 1000 : n;
}

function formatarData(valor) {
    return new Date(paraMs(valor)).toLocaleString(localeAtual(), { timeZone: 'America/Sao_Paulo', hourCycle: 'h23' });
}

const esperar = (ms) => new Promise(r => setTimeout(r, ms));

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

const fmtNum = (n) => Number(n).toLocaleString(localeAtual());

// Sem acentos e em minúsculas: comparações que não diferenciam "promoção" de "PROMOCAO"
const semAcentos = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const resumirTexto = (texto, max = 100) => {
    const t = String(texto ?? '').replace(/\s+/g, ' ').trim();
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

module.exports = {
    esperar,
    fmtNum,
    formatarData,
    localeAtual,
    paraMs,
    plural,
    resumirTexto,
    semAcentos
};
