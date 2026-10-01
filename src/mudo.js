/*
 * /mudo: pessoas e grupos cujos avisos de apagadas, editadas e status apagados ficam em silêncio.
 */

const { dbAll, dbPronto, dbRun } = require('./db');
const { printInfo } = require('./log');

/*
 * Cada silenciado (tabela `mutes`) é uma pessoa ou um grupo, com o que fica
 * em silêncio: apagadas, editadas e/ou status apagados. Só o AVISO no seu
 * privado é cortado: a mensagem continua guardada, e o /show a mostra.
 * Num grupo, vale para todos dali; numa pessoa, para o que ela mandar em
 * qualquer chat (e para os status dela).
 *
 * Cada aviso cortado vai para `mute_hits` (o /status conta as ignoradas).
 */
const TIPOS = {
    apagada: { coluna: 'deleted', rotulo: 'apagadas' },
    editada: { coluna: 'edited', rotulo: 'editadas' },
    status: { coluna: 'status', rotulo: 'status' }
};

// O número de um jid de pessoa (5521...@c.us → 5521...); @lid e grupos ficam inteiros
const chaveDoId = (id) => (String(id ?? '').endsWith('@c.us') ? String(id).split('@')[0] : String(id ?? ''));

/**
 * O aviso deste tipo, vindo deste chat/remetente, está silenciado?
 * @param {'apagada'|'editada'|'status'} tipo
 * @param {object} o
 * @param {string} o.chatId
 * @param {Array<string|null>} o.remetentes  jids e/ou números de quem mandou
 * @returns {Promise<object|null>} o silenciado que casou (ou null)
 */
async function silenciado(tipo, { chatId, remetentes = [] }) {
    await dbPronto;
    const coluna = TIPOS[tipo].coluna;
    const mutes = await dbAll(`SELECT * FROM mutes WHERE ${coluna} = 1`);
    if (!mutes.length) return null;

    const chaves = new Set([chatId, ...remetentes].filter(Boolean).map(r => chaveDoId(r.includes('@') ? r : `${r}@c.us`)));
    return mutes.find(m => chaves.has(chaveDoId(m.target_id))) ?? null;
}

// Registra um aviso cortado (para o /status e para a lista do /mudo)
async function registrarIgnorada(mute, tipo) {
    await dbRun('INSERT INTO mute_hits (target_id, kind, at) VALUES (?, ?, ?)', [mute.target_id, tipo, Date.now()]);
    printInfo(`/mudo: aviso de ${tipo} de ${mute.target_name} ignorado`);
}

/**
 * Confere e, se silenciado, registra. Atalho para os eventos.
 * @returns {Promise<boolean>} true = não avisar
 */
async function ignorarAviso(tipo, origem) {
    const mute = await silenciado(tipo, origem);
    if (!mute) return false;
    await registrarIgnorada(mute, tipo);
    return true;
}

module.exports = {
    TIPOS,
    chaveDoId,
    ignorarAviso,
    silenciado
};
