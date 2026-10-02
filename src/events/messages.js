/*
 * 'message_create' event: saves the message, counts it for /stats, runs it through /watch and executes commands.
 */

const path = require('path');
const fs = require('fs-extra');

const { client, botConsumeSending, wasSentByBot, messageToSelf } = require('../client');
const { findCommand, getCommandSyntax } = require('../commands/base');
const { HANDLERS } = require('../commands/index');
const { removeDeviceSuffix, resolveLidToPhone, groupResolverName, privateResolverName } = require('../contacts');
const { dbGet, dbReady, dbRun } = require('../db');
const { replyChoice } = require('../choices');
const { printCall, printCommandUnknown, printDebug, printError, printInfo } = require('../log');
const { GetOptFromCommand } = require('../options');
const { getSetting, isDebugMode } = require('../settings');
const { countStats, myIdStats } = require('../stats');
const { mediaIsPath, nameSafe, getFolderMedia } = require('../util/files');
const { paraMs } = require('../util/format');
const { checkWatch } = require('../watch/check');

client.on('message_create', async (msg) => {
    try {
        const timestamp = Date.now();
        const msgIdPure = msg?.id?.id || `fallback_${timestamp}`;
        const msgType = msg?.type || 'unknown';

        // msg.getChat() breaks for some chats/@lid; we use the raw data.
        const chatId = msg?.id?.remote || msg?.from || msg?.to || 'UNKNOWN';
        const isGroup = chatId.endsWith('@g.us') ? 1 : 0;

        // Group: name looked up by chatId (_data.chat may carry the wrong name)
        const chatName =
            (isGroup ? await groupResolverName(chatId) : null) ||
            msg?._data?.chat?.name ||
            msg?._data?.chat?.formattedTitle ||
            // Private: the other participant's contact (the chatId)
            (isGroup ? null : await privateResolverName(chatId)) ||
            // notifyName is the name of who SENT: it only serves as the chat name when it was the other
            (isGroup || msg?.fromMe ? null : msg?._data?.notifyName) ||
            (isGroup ? `Grupo ${chatId.split('@')[0]}` : chatId.split('@')[0]);

        /*
         * Remetente real:
         *   grupo   -> msg.author (participante)
         * private -> msg.from (or msg.to if it was me)
         */
        let rawSenderId = isGroup
            ? (msg?.author || msg?._data?.participant?._serialized || msg?._data?.participant || null)
            : (msg?.fromMe ? (msg?.to || msg?.from) : msg?.from);

        // 100000000000001:93@lid -> 100000000000001@lid (does not convert @lid to @c.us)
        rawSenderId = removeDeviceSuffix(rawSenderId);

        const originalSenderJid = rawSenderId;
        let resolvedSenderJid = rawSenderId;

        if (rawSenderId?.endsWith('@lid')) {
            const phoneJid = await resolveLidToPhone(rawSenderId);
            if (phoneJid) resolvedSenderJid = phoneJid;
        }

        // Contact, preferably by the real phone; otherwise by the LID
        let contact = null;

        if (resolvedSenderJid && !resolvedSenderJid.endsWith('@g.us')) {
            contact = await client.getContactById(resolvedSenderJid).catch(() => null);
        }

        if (!contact && originalSenderJid?.endsWith('@lid')) {
            contact = await client.getContactById(originalSenderJid).catch(() => null);
        }

        // Prioritizes the real phone; if it does not resolve, keeps the LID (does not invent a number)
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
         * Persistence (to recover deleted messages)
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
                    const extension = nameSafe(media.mimetype?.split('/')[1]?.split(';')[0], 'bin');
                    const fileAlt = path.join(getFolderMedia(), `${nameSafe(msgIdPure, `fallback_${timestamp}`)}.${extension}`);

                    if (!mediaIsPath(fileAlt)) throw new Error(`caminho de mídia inválido: ${fileAlt}`);

                    fs.writeFileSync(fileAlt, Buffer.from(media.data, 'base64'));
                    localMediaPath = fileAlt;
                }
            } catch (error) {
                printError('Falha ao baixar mídia:', error.message);
                hasMedia = 0;
            }
        }

        /*
         * UPSERT instead of INSERT OR REPLACE: REPLACE deletes and recreates the row,
         * what would reset revoked/revoked_at if WhatsApp resends the same id
         * (sync, reconnection). A row already marked as deleted is not touched,
         * and an existing media_path is not replaced by null.
         */
        await dbReady;

        /*
         * /stats: only new messages (WhatsApp may resend the same id in a
         * reconnection) and never the bot's own replies.
         */
        const jaRecorded = await dbGet('SELECT 1 AS ok FROM messages WHERE id = ?', [msgIdPure]).catch(() => null);

        if (!jaRecorded && !(msg.fromMe && botConsumeSending(chatId))) {
            // In private, senderJid of your messages is the OTHER participant's (see rawSenderId)
            await countStats({
                chatId, chatName, isGroup,
                senderId: msg.fromMe ? myIdStats() : (senderNumber || senderJid),
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
                 raw_json, from_me)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                raw_json      = excluded.raw_json,
                from_me       = excluded.from_me
             WHERE messages.revoked = 0`,
            [
                msgIdPure, senderName, senderJid, senderNumber,
                chatId, chatName, isGroup,
                msg.body || '', msgType, timestamp,
                hasMedia, localMediaPath,
                lat, lng,
                'desativado', msg.fromMe ? 1 : 0
            ]
        ).catch(err => printError('Erro ao salvar mensagem:', err.message));

        const body = (msg.body || '').trim();

        // Only the no., replying to a command's list (e.g.: several contacts with the name): does not go through /watch
        if (await replyChoice(msg, chatId, body)) return;

        // The bot's own reply is never a command, even starting with "/" (see markSentByBot)
        const sentByBot = msg.fromMe && body.startsWith('/') && wasSentByBot(body);
        const caller = body.startsWith('/') && !sentByBot ? body.split(/\s+/, 1)[0] : null;

        if (sentByBot) printInfo(`Mensagem do próprio bot começando com '/' ignorada como comando: ${body.slice(0, 60)}`);
        const command = caller ? findCommand(caller) : null;

        /*
         * Watch: messages that are not commands go through the /watch rules
         */
        if (!command) {
            await checkWatch({
                msg, msgIdPure, body, chatId, chatName, isGroup, senderName, senderNumber, timestamp
            }).catch(err => printError('/watch: erro ao verificar regras:', err.message));
        }

        /*
         * Comandos
         */
        if (!caller) return;

        const args = body.slice(caller.length).trim();

        if (!command) {
            if (msg.fromMe || isDebugMode()) {
                const who = msg.fromMe ? (client.info?.pushname || 'Você') : senderName;
                printCommandUnknown(who, body.length > 100 ? `${body.slice(0, 100)}…` : body, { doDono: msg.fromMe });
            }
            return;
        }

        // Bot off: everything ignored (including your commands) until /bot -on
        if (getSetting('bot.paused') && command.cmd !== '/bot') {
            printInfo(`Comando '${command.cmd}' ignorado: bot desligado (/bot -on para ativar)`);
            return;
        }

        // You (the bot account) or an extra admin (setting bot.admins, by the sender's phone)
        const admin = Boolean(msg.fromMe || (senderNumber && getSetting('bot.admins').includes(senderNumber)));

        // Admin mode (/bot +admin): other people's commands are silently ignored
        if (getSetting('bot.adminMode') && !admin) {
            printDebug(`Comando '${command.cmd}' de ${senderName} ignorado: modo admin`);
            return;
        }

        /*
         * Command restricted to the bot owner: silently ignored in the chat and only warns
         * in your private chat. Avoids that, with several zapbots in the same group, the command
         * of one person be executed by everyone.
         */
        if (!admin && command.onlyAdmin) {
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

        // In private, the senderName of your messages is the OTHER participant's (see rawSenderId)
        printCall(msg.fromMe ? (client.info?.pushname || 'Você') : senderName, body, chatName);

        const handler = HANDLERS[command.cmd];

        if (!handler) {
            await msg.reply(`⚠️ O comando ${command.cmd} ainda não foi implementado.`);
            return;
        }

        const quotedMsg = msg.hasQuotedMsg ? await msg.getQuotedMessage().catch(() => null) : null;

        await handler({ msg, opts, args, quotedMsg, senderContact, senderName, isGroup, chatId, chatName, admin });
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
