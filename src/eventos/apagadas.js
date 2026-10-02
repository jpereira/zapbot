/*
 * Mensagens apagadas: evento 'message_revoke_everyone' e o renderizador usado também pelo /show.
 */

const { MessageMedia, Location } = require('whatsapp-web.js');
const fs = require('fs-extra');

const { client } = require('../cliente');
const { resolveLidToPhone } = require('../contatos');
const { dbGet, dbPronto, dbRun } = require('../db');
const { printDebug, printError } = require('../log');
const { ignorarAviso } = require('../mudo');
const { getSetting } = require('../settings');
const { contarStats, meuIdStats } = require('../stats');
const { isCaminhoDeMidia } = require('../util/arquivos');
const { formatarData } = require('../util/formatar');

/*
 * Recuperação de mensagens apagadas
 *
 * O mesmo renderizador é usado em dois lugares:
 *  - evento 'message_revoke_everyone' → envia para você mesmo, na hora;
 *  - comando /show                    → reenvia no chat atual, sob demanda.
 */

// Status (stories) chegam pelo chat 'status@broadcast'
const isStatus = (row) => row.chat_id === 'status@broadcast';

/**
 * Descobre nome do chat e do remetente de uma mensagem apagada.
 * Com os objetos do evento (after/before) consegue nomes mais precisos;
 * sem eles (/show) usa o que foi gravado no banco.
 */
async function resolverAutorApagada(row, { after, before, protocolKey } = {}) {
    let nomeChat = row.chat_name || 'Conversa desconhecida';
    let nomeRemetente = row.sender_name || 'Desconhecido';
    let numeroRemetente = row.sender_number || null;

    // Nome real do chat onde a exclusão aconteceu
    if (after) {
        try {
            const chat = await after.getChat();
            if (chat?.name) nomeChat = chat.name;
        } catch (chatError) {
            printError('[Revoke] Não foi possível recuperar o chat:', chatError.message);
        }
    }

    // Remetente pela mensagem original, quando disponível
    if (before) {
        try {
            const contato = await before.getContact();

            nomeRemetente = contato.pushname || contato.name || contato.shortName || nomeRemetente;

            const contatoId = contato.id?._serialized || '';

            if (contatoId.endsWith('@c.us')) {
                numeroRemetente = contatoId.split('@')[0];
            } else if (contato.number) {
                numeroRemetente = contato.number;
            }
        } catch (contactError) {
            printError('[Revoke] Não foi possível recuperar o contato original:', contactError.message);
        }
    }

    // Converte @lid para telefone real, se possível
    const senderId = before?.author || protocolKey?.participant;

    if (senderId?.endsWith('@lid')) {
        const phoneId = await resolveLidToPhone(senderId);

        if (phoneId) {
            numeroRemetente = phoneId.replace('@c.us', '').replace(/\D/g, '');

            const contato = await client.getContactById(phoneId).catch(() => null);
            nomeRemetente = contato?.pushname || contato?.name || contato?.shortName || nomeRemetente;
        }
    }

    return { nomeChat, nomeRemetente, numeroRemetente };
}

/**
 * Envia uma mensagem apagada (texto, mídia, localização ou contato) para `destino`.
 *
 * @param {string} destino              chat que vai receber
 * @param {object} row                  linha da tabela messages
 * @param {object} info                 { nomeChat, nomeRemetente, numeroRemetente }
 * @param {object} [opcoes]
 * @param {string} [opcoes.titulo]      primeira linha do alerta
 * @param {string[]} [opcoes.extras]    linhas extras após "Enviada em"
 */
async function enviarMensagemApagada(destino, row, info, { titulo = '❌ *MENSAGEM APAGADA DETECTADA*', extras = [] } = {}) {
    let alertaTexto = `${titulo}\n\n`;

    if (row.is_group === 1) {
        alertaTexto += `👥 *Grupo:* ${info.nomeChat}\n`;
    }

    alertaTexto +=
        `👤 *Nome:* ${info.nomeRemetente}\n` +
        `📱 *Número:* ${info.numeroRemetente ? `+${info.numeroRemetente}` : 'Número indisponível'}\n` +
        `📅 *Enviada em:* ${formatarData(row.timestamp)}\n`;

    for (const linha of extras) {
        alertaTexto += `${linha}\n`;
    }

    // Localização
    if (row.type === 'location' && row.location_lat !== null && row.location_lng !== null) {
        const latitude = Number(row.location_lat);
        const longitude = Number(row.location_lng);

        alertaTexto +=
            '🗺️ *Tipo:* LOCALIZAÇÃO\n' +
            `🔗 *Link do mapa:* https://www.google.com/maps?q=${latitude},${longitude}`;

        await client.sendMessage(destino, alertaTexto);
        await client.sendMessage(destino, new Location(latitude, longitude, row.body || 'Localização compartilhada'));
        return;
    }

    // Contato / vCard
    if (['vcard', 'contact', 'multi_vcard'].includes(row.type)) {
        alertaTexto +=
            '📇 *Tipo:* CARTÃO DE CONTATO\n' +
            '💡 *Nota:* O contato está anexado abaixo.';

        // O body vem de quem enviou: só vai cru se for mesmo um vCard (nunca um texto como "/cache -a")
        if (!row.body || /^BEGIN:VCARD/i.test(row.body.trim())) {
            await client.sendMessage(destino, alertaTexto);
            if (row.body) await client.sendMessage(destino, row.body, { parseVCards: true });
        } else {
            await client.sendMessage(destino, `${alertaTexto}\n💬 *Conteúdo:* "${row.body}"`);
        }
        return;
    }

    // Arquivo físico
    if (row.has_media && isCaminhoDeMidia(row.media_path) && fs.existsSync(row.media_path)) {
        const mediaAnexo = MessageMedia.fromFilePath(row.media_path);
        const mimetype = mediaAnexo.mimetype || '';
        const legenda = row.body || 'Sem texto';

        if (row.type === 'audio' || row.type === 'ptt' || mimetype.startsWith('audio/')) {
            alertaTexto += '🎵 *Tipo:* ÁUDIO / NOTA DE VOZ';

            await client.sendMessage(destino, alertaTexto);
            await client.sendMessage(destino, mediaAnexo, { sendAudioAsVoice: true });
            return;
        }

        if (row.type === 'video' || row.type === 'image' || mimetype.startsWith('image/') || mimetype.startsWith('video/')) {
            alertaTexto +=
                `🎬 *Tipo:* ${String(row.type).toUpperCase()}\n` +
                `💬 *Legenda:* "${legenda}"`;

            await client.sendMessage(destino, mediaAnexo, { caption: alertaTexto });
            return;
        }

        alertaTexto +=
            '📄 *Tipo:* DOCUMENTO\n' +
            `💬 *Legenda:* "${legenda}"`;

        await client.sendMessage(destino, mediaAnexo, { caption: alertaTexto, sendMediaAsDocument: true });
        return;
    }

    // Mídia que existia mas o arquivo já não está no disco
    if (row.has_media) {
        alertaTexto += `📎 *Tipo:* ${String(row.type).toUpperCase()} _(arquivo não disponível no cache)_\n`;
    }

    // Texto
    alertaTexto += `💬 *Texto:* "${row.body || 'Mensagem sem conteúdo'}"`;

    await client.sendMessage(destino, alertaTexto, { linkPreview: true });
}

client.on('message_revoke_everyone', async (after, before) => {
    const protocolKey = after._data?.protocolMessageKey;
    const targetId = protocolKey?.id || before?.id?.id || after?.id?.id;

    if (!targetId) {
        printError('[Revoke] Não foi possível identificar a mensagem apagada.');
        return;
    }

    let row;
    try {
        await dbPronto;
        row = await dbGet('SELECT * FROM messages WHERE id = ?', [targetId]);
    } catch (err) {
        printError('[Revoke] Erro ao consultar banco:', err.message);
        return;
    }

    if (!row) {
        printError(`[Revoke] Mensagem apagada ID ${targetId} não encontrada no banco.`);
        return;
    }

    if (isStatus(row) && !getSetting('show.alert.status')) {
        printDebug(`[Revoke] Status apagado ID ${targetId} ignorado (show.alert.status off).`);
        return;
    }

    try {
        const info = await resolverAutorApagada(row, { after, before, protocolKey });

        // Marca como apagada ANTES de enviar: mesmo que o envio falhe, o /show encontra.
        // Também grava os nomes resolvidos agora, que são mais precisos que os do recebimento.
        await dbRun(
            `UPDATE messages
                SET revoked = 1,
                    revoked_at = ?,
                    chat_name = ?,
                    sender_name = ?,
                    sender_number = COALESCE(?, sender_number)
              WHERE id = ?`,
            [Date.now(), info.nomeChat, info.nomeRemetente, info.numeroRemetente, row.id]
        );

        // Apagada por você: conta para o seu número (no privado, o remetente gravado é o outro participante)
        const deMim = Boolean(after?.fromMe || before?.fromMe);

        await contarStats({
            chatId: row.chat_id, chatName: info.nomeChat, isGroup: row.is_group,
            senderId: deMim ? meuIdStats() : (row.sender_number || row.sender_jid),
            senderName: deMim ? (client.info?.pushname || 'Você') : info.nomeRemetente,
            campos: { deleted: 1 }
        });

        // show.alert.deleted off ou /mudo: sem aviso (a mensagem fica guardada para o /show)
        const remetentes = [row.sender_jid, row.sender_number, info.numeroRemetente];
        if (!isStatus(row) && !getSetting('show.alert.deleted')) return;
        if (await ignorarAviso(isStatus(row) ? 'status' : 'apagada', { chatId: row.chat_id, remetentes })) return;

        await enviarMensagemApagada(client.info.wid._serialized, row, info, {
            titulo: isStatus(row) ? '📸 *STATUS APAGADO DETECTADO*' : '❌ *MENSAGEM APAGADA DETECTADA*'
        });
    } catch (sendError) {
        printError('[Revoke] Erro ao processar item apagado:', sendError.message);
    }
});

module.exports = {
    enviarMensagemApagada,
    isStatus,
    resolverAutorApagada
};
