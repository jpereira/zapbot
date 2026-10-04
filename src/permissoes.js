/*
 * Quem usa os comandos comuns, e quais: o bot.users (as pessoas, os grupos e
 * as pessoas só num grupo) e o bot.users.cmds (a regra de cada um, do /bot
 * +cmd|-cmd). Sem regra, todos os comuns; com regra, só os da lista ("Apenas")
 * ou todos menos os da lista ("Todos, menos"). O /help e o /whois sempre passam.
 */

const { getSetting, setSetting } = require('./settings');

const CHAVE = 'bot.users.cmds';
const SEMPRE_LIBERADOS = ['/help', '/whois'];

// "5521...=/a,/b" → { apenas: true, comandos: ['/a', '/b'] }; "...=!/a" → { apenas: false }
function lerLinha(linha) {
    const i = linha.lastIndexOf('=');
    const valor = linha.slice(i + 1);
    const apenas = !valor.startsWith('!');
    return [linha.slice(0, i), { apenas, comandos: (apenas ? valor : valor.slice(1)).split(',') }];
}

// item → a regra; sem regra: null (todos os comuns)
const regras = () => new Map(getSetting(CHAVE).map(lerLinha));
const regraDe = (item) => regras().get(item) ?? null;

/**
 * Grava (ou apaga, com null) a regra do item.
 * @param {string} item
 * @param {{ apenas: boolean, comandos: string[] } | null} regra
 */
async function gravarRegra(item, regra) {
    const outras = getSetting(CHAVE).filter(l => lerLinha(l)[0] !== item);
    const linha = regra ? [`${item}=${regra.apenas ? '' : '!'}${regra.comandos.join(',')}`] : [];
    await setSetting(CHAVE, [...outras, ...linha]);
}

// A regra deixa usar o comando?
const permite = (regra, cmd) => !regra || SEMPRE_LIBERADOS.includes(cmd) ||
    (regra.apenas ? regra.comandos.includes(cmd) : !regra.comandos.includes(cmd));

// "Apenas: /a, /b" ou "Todos, menos: /a"
const descreverRegra = (regra) =>
    `${regra.apenas ? 'Apenas' : 'Todos, menos'}: ${regra.comandos.join(', ')}`;

/**
 * O que quem mandou pode neste chat: as entradas do bot.users que o liberam
 * aqui (o telefone, "telefone:grupo" e o grupo) e as regras delas. Vale a mais
 * ampla: uma entrada sem regra libera todos os comuns.
 * @returns {{ liberado: boolean, soNosGrupos: string[], regras: object[], pode: Function }}
 *   soNosGrupos: os grupos em que a pessoa só tem permissão lá (o aviso do privado)
 *   regras: as que limitam aqui ([] = todos os comuns)
 */
function permissaoAqui({ numero, chatId, isGroup }) {
    const users = getSetting('bot.users');
    const soNosGrupos = numero
        ? users.filter(u => u.startsWith(`${numero}:`)).map(u => u.slice(u.indexOf(':') + 1))
        : [];

    if (users.includes('all')) return { liberado: true, soNosGrupos, regras: [], pode: () => true };

    const entradas = [numero, isGroup && `${numero}:${chatId}`, isGroup && chatId]
        .filter(e => e && users.includes(e));
    if (!entradas.length) return { liberado: false, soNosGrupos, regras: [], pode: () => false };

    const todas = entradas.map(regraDe);
    const limitam = todas.some(r => !r) ? [] : todas;
    return {
        liberado: true,
        soNosGrupos,
        regras: limitam,
        pode: (cmd) => !limitam.length || limitam.some(r => permite(r, cmd))
    };
}

// O aviso de quem usou um comando fora da regra
function avisoDeLimite(regrasQueLimitam, cmd) {
    if (regrasQueLimitam.every(r => r.apenas)) {
        const comandos = [...new Set(regrasQueLimitam.flatMap(r => r.comandos))];
        return `🚫 Limitado aos comandos: ${comandos.join(', ')}.`;
    }
    return `🚫 O ${cmd} não está liberado para você.`;
}

module.exports = {
    SEMPRE_LIBERADOS,
    avisoDeLimite,
    descreverRegra,
    gravarRegra,
    permissaoAqui,
    permite,
    regraDe
};
