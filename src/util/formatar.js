/*
 * Formatação de datas, números e textos.
 */

/*
 * Recuperação de mensagens apagadas
 *
 * O mesmo renderizador é usado em dois lugares:
 *  - evento 'message_revoke_everyone' → envia para você mesmo, na hora;
 *  - comando /show                    → reenvia no chat atual, sob demanda.
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

/*
 * /watch (alias /w)
 *   /watch                     → o mesmo que /watch -s (ocorrências de todas as regras)
 *   /watch -l                  → lista as regras (nº, regra, ocorrências)
 *   /watch -s [-N]             → resumo das mensagens que casaram com a regra N (sem N: todas)
 *   /watch -a <texto|/regex/>  → adiciona regra
 *   /watch -d -N               → remove a regra N e as ocorrências dela
 *   /watch -f [-N]             → apaga as ocorrências da regra N (sem N: de todas); mantém as regras
 * As regras ficam no setting 'watch.rules'; as ocorrências na tabela watch_hits.
 * -l e -s mostram conversas de terceiros: fora do seu privado, a resposta vai para lá.
 */
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
    resumirTexto
};
