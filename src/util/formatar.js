/*
 * Formatação de datas, números e textos.
 */

// Timestamp salvo em segundos (WhatsApp) ou milissegundos (Date.now())
function paraMs(valor) {
    const n = Number(valor);
    return n < 10_000_000_000 ? n * 1000 : n;
}

function formatarData(valor) {
    return new Date(paraMs(valor)).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

const esperar = (ms) => new Promise(r => setTimeout(r, ms));

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

const fmtNum = (n) => Number(n).toLocaleString('pt-BR');

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
    paraMs,
    plural,
    resumirTexto,
    semAcentos
};
