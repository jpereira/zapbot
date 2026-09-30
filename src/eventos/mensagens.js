/*
 * Evento 'message_create': grava a mensagem, conta para o /stats, passa pelo /watch e executa comandos.
 */

const path = require('path');
const fs = require('fs-extra');

const { client, consumirEnvioDoBot, foiEnviadaPeloBot, messageToSelf } = require('../cliente');
const { findCommand, getCommandSyntax } = require('../comandos/base');
const { HANDLERS } = require('../comandos/index');
const { removeDeviceSuffix, resolveLidToPhone, resolverNomeDoGrupo } = require('../contatos');
const { dbGet, dbPronto, dbRun } = require('../db');
const { printCall, printDebug, printError, printInfo } = require('../log');
const { GetOptFromCommand } = require('../opcoes');
const { getSetting, isDebugMode } = require('../settings');
const { contarStats, meuIdStats } = require('../stats');
const { isCaminhoDeMidia, nomeSeguro, obterPastaMidia } = require('../util/arquivos');
const { paraMs } = require('../util/formatar');
const { verificarWatch } = require('../watch/verificar');

/*
 * Mensagens
 */
client.on('message_create', async (msg) => {
    try {
        const timestamp = Date.now();
        const msgIdPure = msg?.id?.id || `fallback_${timestamp}`;
        const msgType = msg?.type || 'unknown';

        // msg.getChat() quebra para alguns chats/@lid; usamos os dados crus.
        const chatId = msg?.id?.remote || msg?.from || msg?.to || 'UNKNOWN';
        const isGroup = chatId.endsWith('@g.us') ? 1 : 0;

        // Grupo: nome buscado pelo chatId (o _data.chat pode trazer o nome errado)
        const chatName =
            (isGroup ? await resolverNomeDoGrupo(chatId) : null) ||
            msg?._data?.chat?.name ||
            msg?._data?.chat?.formattedTitle ||
            // notifyName é o nome de quem ENVIOU: só serve de nome do chat em conversa privada
            (isGroup ? null : msg?._data?.notifyName) ||
            (isGroup ? `Grupo ${chatId.split('@')[0]}` : chatId.split('@')[0]);

        /*
         * Remetente real:
         *   grupo   -> msg.author (participante)
         *   privado -> msg.from (ou msg.to se fui eu)
         */
        let rawSenderId = isGroup
            ? (msg?.author || msg?._data?.participant?._serialized || msg?._data?.participant || null)
            : (msg?.fromMe ? (msg?.to || msg?.from) : msg?.from);

        // 111780869222483:93@lid -> 111780869222483@lid (não converte @lid para @c.us)
        rawSenderId = removeDeviceSuffix(rawSenderId);

        const originalSenderJid = rawSenderId;
        let resolvedSenderJid = rawSenderId;

        if (rawSenderId?.endsWith('@lid')) {
            const phoneJid = await resolveLidToPhone(rawSenderId);
            if (phoneJid) resolvedSenderJid = phoneJid;
        }

        // Contato, preferencialmente pelo telefone real; senão pelo LID
        let contact = null;

        if (resolvedSenderJid && !resolvedSenderJid.endsWith('@g.us')) {
            contact = await client.getContactById(resolvedSenderJid).catch(() => null);
        }

        if (!contact && originalSenderJid?.endsWith('@lid')) {
            contact = await client.getContactById(originalSenderJid).catch(() => null);
        }

        // Prioriza o telefone real; se não resolver, mantém o LID (não inventa número)
        const senderJid = resolvedSenderJid || originalSenderJid || 'UNKNOWN';
        const senderNumber = senderJid.endsWith('@c.us') ? senderJid.split('@')[0] : null;

        const senderName =
            contact?.name ||
            contact?.pushname ||
            msg?._data?.notifyName ||
            senderNumber ||
            originalSenderJid ||
            'Desconhecido';

        const senderContact = contact || {
            id: { _serialized: senderJid, user: senderJid.split('@')[0] },
            number: senderNumber || senderJid.split('@')[0],
            name: senderName,
            pushname: msg?._data?.notifyName || senderName
        };

        if (isDebugMode()) {
            printDebug(`msgIdPure=${msgIdPure} senderName=${senderName} senderJid=${senderJid} senderNumber=${senderNumber} chatId=${chatId} chatName=${chatName}`);
            printDebug({
                author: msg?.author,
                from: msg?.from,
                to: msg?.to,
                remote: msg?.id?.remote,
                contact_id: contact?.id?._serialized || null,
                number: contact?.number || null,
                pushname: contact?.pushname || null,
                name: contact?.name || null
            });
        }

        /*
         * Persistência (para recuperar mensagens apagadas)
         */
        let hasMedia = msg.hasMedia ? 1 : 0;
        let localMediaPath = null;
        let lat = null;
        let lng = null;

        if (msgType === 'location' && msg.location) {
            lat = msg.location.latitude;
            lng = msg.location.longitude;
        }

        if (msg.hasMedia) {
            try {
                const media = await msg.downloadMedia();

                if (media?.data) {
                    const extension = nomeSeguro(media.mimetype?.split('/')[1]?.split(';')[0], 'bin');
                    const arquivo = path.join(obterPastaMidia(), `${nomeSeguro(msgIdPure, `fallback_${timestamp}`)}.${extension}`);

                    if (!isCaminhoDeMidia(arquivo)) throw new Error(`caminho de mídia inválido: ${arquivo}`);

                    fs.writeFileSync(arquivo, Buffer.from(media.data, 'base64'));
                    localMediaPath = arquivo;
                }
            } catch (error) {
                printError('Falha ao baixar mídia:', error.message);
                hasMedia = 0;
            }
        }

        /*
         * UPSERT em vez de INSERT OR REPLACE: o REPLACE apaga e recria a linha,
         * o que zeraria revoked/revoked_at se o WhatsApp reenviar o mesmo id
         * (sincronização, reconexão). Linha já marcada como apagada não é tocada,
         * e um media_path existente não é trocado por null.
         */
        await dbPronto;

        /*
         * /stats: só mensagens novas (o WhatsApp pode reenviar o mesmo id numa
         * reconexão) e nunca as respostas do próprio bot.
         */
        const jaGravada = await dbGet('SELECT 1 AS ok FROM messages WHERE id = ?', [msgIdPure]).catch(() => null);

        if (!jaGravada && !(msg.fromMe && consumirEnvioDoBot(chatId))) {
            // No privado, senderJid das suas mensagens é o do OUTRO participante (ver rawSenderId)
            await contarStats({
                chatId, chatName, isGroup,
                senderId: msg.fromMe ? meuIdStats() : (senderNumber || senderJid),
                senderName: msg.fromMe ? (client.info?.pushname || 'Você') : senderName,
                quando: paraMs(msg.timestamp) || timestamp,
                campos: { msgs: 1, media: hasMedia }
            });
        }

        await dbRun(
            `INSERT INTO messages
                (id, sender_name, sender_jid, sender_number,
                 chat_id, chat_name, is_group,
                 body, type, timestamp,
                 has_media, media_path,
                 location_lat, location_lng,
                 raw_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
                sender_name   = excluded.sender_name,
                sender_jid    = excluded.sender_jid,
                sender_number = excluded.sender_number,
                chat_id       = excluded.chat_id,
                chat_name     = excluded.chat_name,
                is_group      = excluded.is_group,
                body          = excluded.body,
                type          = excluded.type,
                has_media     = excluded.has_media,
                media_path    = COALESCE(excluded.media_path, messages.media_path),
                location_lat  = excluded.location_lat,
                location_lng  = excluded.location_lng,
                raw_json      = excluded.raw_json
             WHERE messages.revoked = 0`,
            [
                msgIdPure, senderName, senderJid, senderNumber,
                chatId, chatName, isGroup,
                msg.body || '', msgType, timestamp,
                hasMedia, localMediaPath,
                lat, lng,
                'desativado'
            ]
        ).catch(err => printError('Erro ao salvar mensagem:', err.message));

        const body = (msg.body || '').trim();
        // Resposta do próprio bot nunca é comando, mesmo começando com "/" (ver marcarEnviadaPeloBot)
        const enviadaPeloBot = msg.fromMe && body.startsWith('/') && foiEnviadaPeloBot(body);
        const caller = body.startsWith('/') && !enviadaPeloBot ? body.split(/\s+/, 1)[0] : null;

        if (enviadaPeloBot) printInfo(`Mensagem do próprio bot começando com '/' ignorada como comando: ${body.slice(0, 60)}`);
        const command = caller ? findCommand(caller) : null;

        /*
         * Watch: mensagens que não são comandos passam pelas regras do /watch
         */
        if (!command) {
            await verificarWatch({
                msg, msgIdPure, body, chatId, chatName, isGroup, senderName, senderNumber, timestamp
            }).catch(err => printError('/watch: erro ao verificar regras:', err.message));
        }

        /*
         * Comandos
         */
        if (!caller) return;

        const args = body.slice(caller.length).trim();

        if (!command) {
            if (isDebugMode()) printDebug(`Comando '${caller}' não encontrado`);
            return;
        }

        // Bot desligado: tudo ignorado (inclusive os seus comandos) até o /bot -on
        if (getSetting('bot.paused') && command.cmd !== '/bot') {
            printInfo(`Comando '${command.cmd}' ignorado: bot desligado (/bot -on para ativar)`);
            return;
        }

        // Modo admin (/bot +admin): comandos dos outros são ignorados em silêncio
        if (getSetting('bot.adminMode') && !msg.fromMe) {
            printDebug(`Comando '${command.cmd}' de ${senderName} ignorado: modo admin`);
            return;
        }

        /*
         * Comando restrito ao dono do bot: ignora em silêncio no chat e só avisa
         * no seu privado. Evita que, com vários zapbots no mesmo grupo, o comando
         * de uma pessoa seja executado por todos.
         */
        if (!msg.fromMe && command.onlyAdmin) {
            if (isDebugMode()) {
                messageToSelf(`⚠️ ${senderName} tentou executar ${command.cmd} dentro de ${chatName}, mas sem permissão`);
            }
            return;
        }

        printDebug(isGroup
            ? `Executando comando '${body}' de '${senderName}' no grupo '${chatName}'`
            : `Executando comando '${body}' em '${chatName}'`);

        const opts = GetOptFromCommand(args, command);

        if (isDebugMode()) {
            printDebug('GetOptFromCommand():', command.cmd, opts);
        }

        // foo -help
        if (opts.opt.help) {
            await msg.reply('```' + getCommandSyntax(command.cmd) + '```');
            return;
        }

        printCall(senderContact, body);

        const handler = HANDLERS[command.cmd];

        if (!handler) {
            await msg.reply(`⚠️ O comando ${command.cmd} ainda não foi implementado.`);
            return;
        }

        const quotedMsg = msg.hasQuotedMsg ? await msg.getQuotedMessage().catch(() => null) : null;

        await handler({ msg, opts, args, quotedMsg, senderContact, senderName, isGroup, chatId, chatName });
    } catch (error) {
        printError('[message_create] Erro geral controlado:', {
            error: error?.message || String(error),
            stack: error?.stack,
            from: msg?.from,
            to: msg?.to,
            remote: msg?.id?.remote,
            fromMe: msg?.fromMe,
            type: msg?.type
        });
    }
});
