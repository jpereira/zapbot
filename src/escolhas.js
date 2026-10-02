/*
 * Escolha numa lista: quando um comando acha mais de uma opção (ex.: vários
 * contatos com "Jorge" no nome), ele mostra a lista numerada e espera você
 * responder, no mesmo chat, só com o nº.
 */

const { printInfo } = require('./log');

const ESCOLHA_MS = 2 * 60_000;

// chatId -> { opcoes, resolver, timer, autor }: uma escolha pendente por chat
const pendentes = new Map();

// Quem mandou a mensagem: você ("dono") ou o jid da pessoa (um admin do bot.admins)
const autorDe = (msg) => (msg.fromMe ? 'dono' : (msg.author || msg.from || null));

function encerrar(chatId, escolhida) {
    const p = pendentes.get(chatId);
    if (!p) return;

    pendentes.delete(chatId);
    clearTimeout(p.timer);
    p.resolver(escolhida);
}

/**
 * Espera o nº de uma das opções neste chat.
 * @param {string} chatId
 * @param {Array} opcoes
 * @param {object} [o]
 * @param {() => Promise<void>} [o.aoExpirar]  avisa no chat que o tempo acabou
 * @param {string} [o.autor]  quem pode responder (autorDe da mensagem do comando; padrão: você)
 * @returns {Promise<any|null>} a opção escolhida; null se o tempo acabou ou se outra escolha começou no chat
 */
function aguardarEscolha(chatId, opcoes, { aoExpirar, autor = 'dono' } = {}) {
    // Uma escolha nova no mesmo chat cancela a anterior
    encerrar(chatId, null);

    return new Promise((resolver) => {
        const timer = setTimeout(() => {
            encerrar(chatId, null);
            aoExpirar?.().catch(() => {});
        }, ESCOLHA_MS);
        timer.unref?.();

        pendentes.set(chatId, { opcoes, resolver, timer, autor });
    });
}

/**
 * Uma mensagem só com um nº, de quem deu o comando, responde a escolha pendente do chat.
 * @returns {Promise<boolean>} true = era a resposta (não é mensagem para mais nada)
 */
async function responderEscolha(msg, chatId, texto) {
    const p = pendentes.get(chatId);
    if (!p || autorDe(msg) !== p.autor || !/^\d{1,2}$/.test(texto)) return false;

    const n = Number(texto);
    if (n < 1 || n > p.opcoes.length) {
        await msg.reply(`❌ Escolha um nº de 1 a ${p.opcoes.length}.`);
        return true;
    }

    printInfo(`Escolha nº ${n} de ${p.opcoes.length} em ${chatId}`);
    encerrar(chatId, p.opcoes[n - 1]);
    return true;
}

module.exports = {
    ESCOLHA_MS,
    aguardarEscolha,
    autorDe,
    responderEscolha
};
