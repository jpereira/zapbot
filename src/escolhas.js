/*
 * Escolha numa lista: quando um comando acha mais de uma opção (ex.: vários
 * contatos com "Jorge" no nome), ele mostra a lista numerada e espera você
 * responder, no mesmo chat, só com o nº. E a confirmação (ex.: o /bot -reset):
 * espera um "sim" (ou "não") de quem deu o comando.
 */

const { printInfo } = require('./log');

const ESCOLHA_MS = 2 * 60_000;

// chatId -> { opcoes | confirmacao, resolver, timer, autor }: uma pendente por chat
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
 * Espera um "sim" (true) ou um "não" (false) de quem deu o comando, neste chat.
 * @param {string} chatId
 * @param {object} [o]
 * @param {number} [o.ms]  o prazo
 * @param {() => Promise<void>} [o.aoExpirar]  avisa no chat que o tempo acabou
 * @param {string} [o.autor]  quem pode responder (padrão: você)
 * @returns {Promise<boolean|null>} null se o tempo acabou ou se outra pendência começou no chat
 */
function aguardarConfirmacao(chatId, { ms = 10_000, aoExpirar, autor = 'dono' } = {}) {
    encerrar(chatId, null);

    return new Promise((resolver) => {
        const timer = setTimeout(() => {
            encerrar(chatId, null);
            aoExpirar?.().catch(() => {});
        }, ms);
        timer.unref?.();

        pendentes.set(chatId, { confirmacao: true, resolver, timer, autor });
    });
}

/**
 * A resposta da pendência do chat, de quem deu o comando: só um nº (escolha)
 * ou "sim"/"não" (confirmação). Qualquer outra mensagem segue o caminho normal.
 * @returns {Promise<boolean>} true = era a resposta (não é mensagem para mais nada)
 */
async function responderEscolha(msg, chatId, texto) {
    const p = pendentes.get(chatId);
    if (!p || autorDe(msg) !== p.autor) return false;

    if (p.confirmacao) {
        const resposta = /^sim$/i.test(texto) ? true : /^n[aã]o$/i.test(texto) ? false : null;
        if (resposta === null) return false;
        printInfo(`Confirmação em ${chatId}: ${texto}`);
        encerrar(chatId, resposta);
        return true;
    }

    if (!/^\d{1,2}$/.test(texto)) return false;

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
    aguardarConfirmacao,
    aguardarEscolha,
    autorDe,
    responderEscolha
};
