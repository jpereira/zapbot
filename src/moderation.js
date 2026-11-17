/*
 * The common part of /antilink, /antitag and /antibadword: after the rule found the violation, delete the
 * message of whoever is not a group admin and, depending on the mode, warn (/warn) or remove the person.
 *
 * Modes: off (does nothing), delete (deletes), warn (deletes and adds a /warn warning; at the limit of
 * warn.max the person leaves) and remove (deletes and removes right away). A group admin, the owner and the admins
 * of the bot are never caught. Deleting other people's message and removing require the bot account to be an admin.
 */

const { notify, noticeText } = require('./commands/warn');
const { client } = require('./client');
const { dbGet, dbReady, dbRun } = require('./db');
const { printError, printInfo } = require('./log');

const MODES = ['off', 'delete', 'warn', 'remove'];

const groupIsAdmin = (p) => Boolean(p?.isAdmin || p?.isSuperAdmin);

/**
 * Deletes the message and applies the mode. Called only after the rule found the violation.
 * @param {object} o
 * @param {object} o.msg
 * @param {string} o.chatId
 * @param {string} o.modo        delete | warn | remove
 * @param {string} o.senderName
 * @param {string} o.tag         for the log: 'Antilink', 'Antitag', 'Antibadword'
 * @param {string} o.detalhe     what was found (for the log)
 * @param {string} o.noticeDeleted  "Link de Fulano apagado."
 * @param {string} o.noticeRemoved "Fulano mandou link e foi removido do grupo."
 * @param {string} o.motivo      the /warn reason
 * @returns {Promise<boolean>} true = a mensagem foi apagada (tratada)
 */
async function applyMode({ msg, chatId, modo: mode, senderName, tag, detalhe: detail, avisoApagada: noticeDeleted, avisoRemovida: noticeRemoved, motivo: reasonAlt }) {
    const group = await msg.getChat().catch(() => null);
    if (!group?.isGroup) return false;

    const authorId = msg.author || msg.from;
    const author = group.participants.find((p) => p.id._serialized === authorId || p.id.user === authorId.split('@')[0]);
    if (groupIsAdmin(author)) return false;

    const eu = group.participants.find((p) => p.id._serialized === client.info.wid._serialized || p.id.user === client.info.wid.user);
    if (!groupIsAdmin(eu)) {
        printInfo(`[${tag}] message from ${senderName} in ${chatId} kept: the bot is not a group admin`);
        return false;
    }

    try {
        await msg.delete(true);
    } catch (err) {
        printError(`[${tag}] not deleted:`, err.message);
        return false;
    }
    printInfo(`[${tag}] message from ${senderName} deleted in ${chatId} (${mode}): ${detail}`);

    const nameAlt = senderName || authorId.split('@')[0];
    const send = (textAlt) => client.sendMessage(chatId, textAlt, { linkPreview: false }).catch(() => {});
    if (mode === 'delete') {
        await send(noticeDeleted.replace('{name}', nameAlt));
    } else if (mode === 'warn' && author) {
        const r = await notify({ grupo: group, participante: author, nome: nameAlt, motivo: reasonAlt, por: tag.toLowerCase() });
        await send(`${noticeDeleted.replace('{name}', nameAlt)}\n${noticeText(nameAlt, reasonAlt, r)}`);
    } else if (mode === 'remove' && author) {
        try {
            await group.removeParticipants([author.id._serialized]);
            await send(noticeRemoved.replace('{name}', nameAlt));
        } catch (err) {
            printError(`[${tag}] not removed:`, err.message);
        }
    }
    return true;
}

/*
 * Each group's rule (group_rules table): kind 'antitag' | 'antibadword', the mode and the rule data
 * (JSON: { min } in antitag, { words } in antibadword).
 */
async function groupRule(chatId, kind) {
    await dbReady;
    const row = await dbGet('SELECT mode, data FROM group_rules WHERE chat_id = ? AND kind = ?', [chatId, kind]);
    let dataAlt;
    try {
        dataAlt = JSON.parse(row?.data ?? '{}');
    } catch {
        dataAlt = {};
    }
    return { modo: row?.mode ?? 'off', dados: dataAlt };
}

async function recordRule(chatId, kind, { modo: mode, dados: dataAlt }) {
    await dbReady;
    await dbRun(
        `INSERT INTO group_rules (chat_id, kind, mode, data) VALUES (?, ?, ?, ?)
         ON CONFLICT(chat_id, kind) DO UPDATE SET mode = excluded.mode, data = excluded.data`,
        [chatId, kind, mode, JSON.stringify(dataAlt)]
    );
}

module.exports = { MODES, applyMode, groupIsAdmin, recordRule, groupRule };
