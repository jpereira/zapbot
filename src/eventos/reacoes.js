/*
 * Reações removidas ou trocadas: evento 'message_reaction' e o renderizador usado também pelo /show -r.
 */

const { client } = require('../cliente');
const { resolveLidToPhone } = require('../contatos');
const { dbGet, dbPronto, dbRun } = require('../db');
const { printError, printInfo } = require('../log');
const { ignorarAviso, registrarAviso } = require('../mudo');
const { getSetting } = require('../settings');
const { formatarData, paraMs } = require('../util/formatar');
const { cabecalhoOrigem, ehCanal } = require('../util/origem');

/*
 * Mesma ideia das editadas: o 'message_reaction' traz só a reação NOVA de
 * quem reagiu (vazia = removida). A tabela reactions guarda a atual de cada
 * pessoa em cada mensagem; quando ela some ou muda, a de antes vai para a
 * reaction_changes e o aviso vai para o seu privado (setting
 * 'show.alert.reaction'); o /show -r reexibe sob demanda.
 * Reação de que o bot não sabia a anterior (feita antes de ele rodar) não
 * gera nada ao ser removida: não há o que mostrar.
 */
const TRECHO = 300;

/*
 * A mensagem reagida: { id, chatId, fromMe }. A chave vem do WhatsApp Web
 * como objeto (remote pode vir como string ou como wid); sem os campos, sai
 * do _serialized ("false_<chat>_<id>[_<participante>]").
 */
function chaveDaMensagem(key) {
    if (!key) return null;
    const remote = key.remote?._serialized ?? key.remote;
    if (key.id && remote) return { id: key.id, chatId: remote, fromMe: Boolean(key.fromMe) };

    const partes = String(key._serialized ?? '').split('_');
    if (partes.length < 3) return null;
    return { id: partes[2], chatId: partes[1], fromMe: partes[0] === 'true' };
}

async function enviarReacaoDesfeita(destino, row, { contagem = null } = {}) {
    const removida = !row.new_reaction;
    const tipo = removida ? '😶 *REAÇÃO REMOVIDA' : '🔄 *REAÇÃO TROCADA';
    const titulo = contagem ? `${tipo}* (${contagem})` : `${tipo} DETECTADA*`;

    const body = String(row.body ?? '');
    const mensagem = row.body == null ? '_(fora do cache)_'
        : `"${body.length > TRECHO ? `${body.slice(0, TRECHO)}…` : body || '(sem texto)'}"`;

    const texto = `${titulo}\n\n` +
        cabecalhoOrigem({
            chatId: row.chat_id, chatName: row.chat_name, isGroup: row.is_group,
            senderName: row.sender_name, senderNumber: row.sender_number
        }) +
        `📅 *Reagiu em:* ${formatarData(row.reacted_at)}\n` +
        `${removida ? '🗑️ *Removida em:*' : '🔄 *Trocada em:*'} ${formatarData(row.changed_at)}\n` +
        `😶 *Reação:* ${removida ? row.old_reaction : `${row.old_reaction} → ${row.new_reaction}`}\n` +
        `💬 *Na ${row.msg_from_me ? 'sua mensagem' : 'mensagem'}:* ${mensagem}`;

    // Guarda de onde veio (o /mute respondendo o aviso)
    const enviada = await client.sendMessage(destino, texto, { linkPreview: false });
    await registrarAviso(enviada, { chatId: row.chat_id, remetente: row.sender_number || row.sender_jid });
}

// Grava a reação desfeita (com o nome de quem reagiu e o texto da mensagem) e avisa
async function registrarReacaoDesfeita({ chave, sender, antes, nova, quando }) {
    const telefone = sender.endsWith('@lid') ? await resolveLidToPhone(sender) : sender;
    const numero = telefone?.endsWith('@c.us') ? telefone.split('@')[0] : null;
    const contato = await client.getContactById(telefone || sender).catch(() => null);
    const nomeRemetente = contato?.name || contato?.pushname || (numero ? `+${numero}` : 'Desconhecido');

    const isGroup = chave.chatId.endsWith('@g.us');
    const original = await dbGet('SELECT body, chat_name FROM messages WHERE id = ?', [chave.id]);
    const chat = isGroup && !original?.chat_name ? await client.getChatById(chave.chatId).catch(() => null) : null;

    const row = {
        message_id: chave.id,
        chat_id: chave.chatId,
        chat_name: original?.chat_name || chat?.name || (isGroup ? 'Grupo desconhecido' : nomeRemetente),
        is_group: isGroup ? 1 : 0,
        sender_name: nomeRemetente,
        sender_number: numero,
        sender_jid: sender,
        old_reaction: antes.reaction,
        new_reaction: nova,
        body: original?.body ?? null,
        msg_from_me: chave.fromMe ? 1 : 0,
        reacted_at: antes.reacted_at,
        changed_at: quando
    };

    const res = await dbRun(
        `INSERT OR IGNORE INTO reaction_changes
            (message_id, chat_id, chat_name, is_group, sender_name, sender_number, sender_jid,
             old_reaction, new_reaction, body, msg_from_me, reacted_at, changed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [row.message_id, row.chat_id, row.chat_name, row.is_group, row.sender_name, row.sender_number, row.sender_jid,
            row.old_reaction, row.new_reaction, row.body, row.msg_from_me, row.reacted_at, row.changed_at]
    );
    // A mesma mudança avisada de novo: já gravada e avisada
    if (!res.changes) return;

    printInfo(`[Reaction] ${nomeRemetente} ${nova ? `trocou ${antes.reaction} por ${nova}` : `removeu ${antes.reaction}`} em ${row.chat_name}`);

    // /mute: o aviso deste chat ou desta pessoa está em silêncio (a reação fica guardada para o /show -r)
    const remetentes = [sender, telefone, numero];
    if (getSetting('show.alert.reaction') && !(await ignorarAviso('reacao', { chatId: chave.chatId, remetentes }))) {
        await enviarReacaoDesfeita(client.info.wid._serialized, row);
    }
}

client.on('message_reaction', async (reacao) => {
    try {
        const chave = chaveDaMensagem(reacao.msgId);
        const sender = reacao.senderId;
        if (!chave || !sender) return;

        // As suas reações (e as do próprio bot) não interessam; nos canais, elas são anônimas
        if (reacao.id?.fromMe || sender === client.info.wid._serialized || ehCanal(chave.chatId)) return;

        await dbPronto;

        const nova = String(reacao.reaction ?? '');
        const quando = Math.round(paraMs(reacao.timestamp)) || Date.now();
        const antes = await dbGet('SELECT * FROM reactions WHERE message_id = ? AND sender_jid = ?', [chave.id, sender]);

        if (nova) {
            await dbRun(
                `INSERT OR REPLACE INTO reactions (message_id, sender_jid, chat_id, reaction, reacted_at)
                 VALUES (?, ?, ?, ?, ?)`,
                [chave.id, sender, chave.chatId, nova, antes?.reaction === nova ? antes.reacted_at : quando]
            );
        } else if (antes) {
            await dbRun('DELETE FROM reactions WHERE message_id = ? AND sender_jid = ?', [chave.id, sender]);
        }

        // Reação nova (ou a mesma avisada de novo): só guarda
        if (!antes || antes.reaction === nova) return;

        await registrarReacaoDesfeita({ chave, sender, antes, nova, quando });
    } catch (err) {
        printError('[Reaction] Erro ao processar reação:', err.message);
    }
});

module.exports = {
    chaveDaMensagem,
    enviarReacaoDesfeita
};
