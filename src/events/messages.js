/*
 * 'message_create' event: saves the message, counts it for /stats, runs it through /watch and executes commands.
 */

const path = require('path');
const fs = require('fs-extra');

const { client, botConsumeSending, wasSentByBot, messageToSelf } = require('../client');
const { getCommandSyntax, helpProtocol } = require('../commands/base');
const { textRunAlias, resolverAlias } = require('../aliases');
const { ttsRewrite } = require('../ttsOption');
const { HANDLERS } = require('../commands/index');
const {
    scheduleName, contactName, removeDeviceSuffix, resolveLidToPhone, groupResolverName, privateResolverName
} = require('../contacts');
const { dbGet, dbReady, dbRun } = require('../db');
const { checkAntilink } = require('../antilink');
const { checkRules } = require('../groupRules');
const { replyGame } = require('../commands/games');
const { replyChoice } = require('../choices');
const { checkFlood } = require('../flood');
const { hideInDb, loginPassword, tryLogin } = require('../login');
const { ALWAYS_RELEASED, limitNotice, levelAlt, permissionHere } = require('../permissions');
const { ROLES, answer } = require('../roles');
const { printCall, printCommandUnknown, printDebug, printError, printInfo } = require('../log');
const { t } = require('../i18n');
const { getSetting, isDebugMode } = require('../settings');
const { countStats, myIdStats } = require('../stats');
const { mediaIsPath, nameSafe, getFolderMedia } = require('../util/files');
const { paraMs } = require('../util/format');
const { checkWatch } = require('../watch/check');
const { logIsCopy } = require('../debugCopy');
const { withContextDebug, contextDebug } = require('../debugContext');
const { printDebugLevel } = require('../log');
const { instrumentObject } = require('../debugInstrumentation');
const { channelResolverName } = require('../contacts');
const { mentionsForRecord } = require('../mentions');
const { isChannelAlt, channelId } = require('../util/origin');
const { withLimit } = require('../usageLimit');
const { notifyWithoutPermission } = require('../noPermission');
const { withTyping, optionsError, readOptions, assembleContext, denial, askedMask } = require('../execute');
const { dataParserCommand } = require('../debugParser');

// WhatsApp's own notices (joined the group, changed the name, encryption, call...): they have no author
const SYSTEM_TYPES = new Set([
    'broadcast_notification', 'call_log', 'e2e_notification', 'gp2',
    'notification', 'notification_template', 'protocol'
]);

client.on('message_create', (msg) => withContextDebug({
    chatId: channelId(msg?.from, msg?.id?.remote, msg?.to) || msg?.id?.remote || msg?.from || msg?.to,
    comando: (msg.body || '').trim().startsWith('/') ? msg.body : null,
    profundidade: 0,
    maskTelefones: false
}, async () => {
    if (msg.fromMe && logIsCopy(msg.body)) return;
    instrumentObject(msg, 'WhatsApp.Message', 2,
        ['reply', 'downloadMedia', 'getChat', 'getContact', 'getQuotedMessage', 'getMentions']);
    printDebugLevel(1, 'message_create start', { body: msg.body, type: msg.type });
    printDebugLevel(3, 'message_create WhatsApp data', msg._data);
    try {
        const timestamp = Date.now();
        const msgIdPure = msg?.id?.id || `fallback_${timestamp}`;
        const msgType = msg?.type || 'unknown';

        // msg.getChat() breaks for some chats/@lid; we use the raw data.
        const chatId = channelId(msg?.from, msg?.id?.remote, msg?.to) ||
            msg?.id?.remote || msg?.from || msg?.to || 'UNKNOWN';
        const isGroup = chatId.endsWith('@g.us') ? 1 : 0;
        const isChannel = isChannelAlt(chatId);
        const isBroadcast = !isChannel && (chatId.endsWith('@broadcast') || Boolean(msg.isStatus));

        // Group: name looked up by chatId (_data.chat may carry the wrong name)
        let chatName = isChannel
            ? (await channelResolverName(chatId)) || `Canal ${chatId.split('@')[0]}`
            : isBroadcast ? null :
            (isGroup ? await groupResolverName(chatId) : null) ||
            // Private: the other participant's contact (the chatId), by the name in your address book
            (isGroup ? null : await privateResolverName(chatId)) ||
            msg?._data?.chat?.name ||
            msg?._data?.chat?.formattedTitle ||
            // notifyName is the name of who SENT: it only serves as the chat name when it was the other
            (isGroup || msg?.fromMe ? null : msg?._data?.notifyName) ||
            (isGroup ? `Grupo ${chatId.split('@')[0]}` : chatId.split('@')[0]);

        /*
         * Remetente real:
         *   grupo   -> msg.author (participante)
         * status/broadcast -> msg.author; the @broadcast chat is not a person
         * channel -> the @newsletter itself, without attributing the post to a contact
         * private -> msg.from (or msg.to if it was me)
         */
        const participant = msg?.author || msg?._data?.author || msg?._data?.participant;
        const authorJid = typeof participant === 'string' ? participant
            : participant?._serialized || participant?.$1 || null;
        let rawSenderId = isGroup || isBroadcast
            ? (authorJid || (isBroadcast && msg.fromMe ? client.info?.wid?._serialized : null))
            : (msg?.fromMe ? (msg?.to || msg?.from) : msg?.from);
        if (isChannel) rawSenderId = chatId;

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

        if (!isChannel && resolvedSenderJid && !resolvedSenderJid.endsWith('@g.us')) {
            contact = await client.getContactById(resolvedSenderJid).catch(() => null);
        }

        if (!contact && originalSenderJid?.endsWith('@lid')) {
            contact = await client.getContactById(originalSenderJid).catch(() => null);
        }

        // Prioritizes the real phone; if it does not resolve, keeps the LID (does not invent a number)
        const senderJid = resolvedSenderJid || originalSenderJid || 'UNKNOWN';
        const senderNumber = senderJid.endsWith('@c.us') ? senderJid.split('@')[0] : null;

        // Contact found by only one of the ids (phone or @lid) with no name in the address book: the other may have
        let scheduleContact = contact;
        if (!isChannel && !scheduleName(contact) && originalSenderJid?.endsWith('@lid') && originalSenderJid !== resolvedSenderJid) {
            const doLid = await client.getContactById(originalSenderJid).catch(() => null);
            if (scheduleName(doLid)) scheduleContact = doLid;
        }

        const senderName = (isChannel ? chatName : null) ||
            contactName(scheduleContact) ||
            // In broadcasts, notifyName/chat may carry another contact's name.
            (isBroadcast ? null : msg?._data?.notifyName) ||
            senderNumber ||
            originalSenderJid ||
            t('core.desconhecido');
        if (isBroadcast) {
            const status = chatId === 'status@broadcast' || msg.isStatus;
            chatName = senderJid === 'UNKNOWN'
                ? t(status ? 'mensagens.status' : 'mensagens.transmissao')
                : t(status ? 'mensagens.statusDe' : 'mensagens.transmissaoDe', { nome: senderName });
        }
        Object.assign(contextDebug(), { chatName, senderName });
        printDebugLevel(1, 'message_create sender and chat', { chatName, senderName, senderJid });

        const senderContact = contact || {
            id: { _serialized: senderJid, user: senderJid.split('@')[0] },
            number: isChannel ? null : senderNumber || senderJid.split('@')[0],
            name: senderName,
            pushname: (isBroadcast || isChannel ? null : msg?._data?.notifyName) || senderName
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
                printError('Failed to download media:', error.message);
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
         * reconnection), never the bot's own replies, and only from someone: the notices
         * of the system and those without an author became an "Unknown" participant.
         */
        const jaRecorded = await dbGet('SELECT 1 AS ok FROM messages WHERE id = ?', [msgIdPure]).catch(() => null);
        const withoutAuthor = SYSTEM_TYPES.has(msgType) || (!msg.fromMe && senderJid === 'UNKNOWN');

        if (!jaRecorded && !withoutAuthor && !(msg.fromMe && botConsumeSending(chatId))) {
            // In private, senderJid of your messages is the OTHER participant's (see rawSenderId)
            await countStats({
                chatId, chatName, isGroup,
                senderId: msg.fromMe ? myIdStats() : (senderNumber || senderJid),
                senderName: msg.fromMe ? (client.info?.pushname || t('core.voce')) : senderName,
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
                 raw_json, from_me, mentions)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                from_me       = excluded.from_me,
                mentions      = COALESCE(excluded.mentions, messages.mentions)
             WHERE messages.revoked = 0`,
            [
                msgIdPure, senderName, senderJid, senderNumber,
                chatId, chatName, isGroup,
                msg.body || '', msgType, timestamp,
                hasMedia, localMediaPath,
                lat, lng,
                'desativado', msg.fromMe ? 1 : 0, mentionsForRecord(msg.mentionedIds)
            ]
        ).catch(err => printError('Error saving message:', err.message));

        // The location body contains the base64 thumbnail, not text or a command.
        const body = msgType === 'location' ? '' : (msg.body || '').trim();

        // Only the no., replying to a command's list (e.g.: several contacts with the name): does not go through /watch
        if (await replyChoice(msg, chatId, body)) return;

        // Replying (reply) to a bot game message (/games), without the command
        if (await replyGame(msg, chatId, body, { senderNumber, isGroup })) return;

        // /antilink: a link from someone who is not a group admin is deleted (according to the group mode)
        if (isGroup && !msg.fromMe) {
            const dismissed = answer(levelAlt({ fromMe: msg.fromMe, numero: senderNumber, permissao: permissionHere({ numero: senderNumber, chatId, isGroup }) }), ROLES.ADMIN);
            if (await checkAntilink({ msg, chatId, body, dispensado: dismissed, senderName }).catch((err) => {
                printError('/antilink: error checking:', err.message);
                return false;
            })) return;
            // /antitag and /antibadword: tagging everyone and prohibited words
            if (await checkRules({ msg, chatId, body, dispensado: dismissed, senderName }).catch((err) => {
                printError('/antitag, /antibadword: error checking:', err.message);
                return false;
            })) return;
        }

        // The bot's own reply is never a command, even starting with "/" (see markSentByBot)
        const sentByBot = msg.fromMe && body.startsWith('/') && wasSentByBot(body);
        const caller = body.startsWith('/') && !sentByBot ? body.split(/\s+/, 1)[0] : null;

        if (sentByBot) printInfo(`Bot's own message starting with '/' ignored as a command: ${body.slice(0, 60)}`);
        let resolved = caller ? await resolverAlias(body) : null;
        // -tts (/crypto -tts BTC): it is /tts {/crypto -q BTC}; the log of the call keeps what was typed
        const spoken = ttsRewrite(resolved?.command, resolved?.args ?? '');
        if (spoken) resolved = await resolverAlias(spoken);
        const command = resolved?.command ?? null;

        /*
         * Watch: messages that are not commands go through the /watch rules
         */
        if (!command) {
            await checkWatch({
                msg, msgIdPure, body, chatId, chatName, isGroup, senderName, senderJid,
                senderNumber, timestamp
            }).catch(err => printError('/watch: error checking rules:', err.message));
        }

        /*
         * Comandos
         */
        if (!caller) return;

        const args = resolved?.args ?? body.slice(caller.length).trim();

        if (!command) {
            if (msg.fromMe || isDebugMode()) {
                const who = msg.fromMe ? (client.info?.pushname || t('core.voce')) : senderName;
                printCommandUnknown(who, body.length > 100 ? `${body.slice(0, 100)}…` : body, { doDono: msg.fromMe });
            }
            const permission = permissionHere({ numero: senderNumber, chatId, isGroup });
            const level = levelAlt({ fromMe: msg.fromMe, numero: senderNumber, permissao: permission });
            if (!level) return;

            // The start of more than one command (e.g.: /un): lists the ones the person can use
            const possible = (resolved?.possiveis ?? [])
                .filter(c => answer(level, c.role) || (c.alvos ?? [c.cmd])
                    .every(cmd => ALWAYS_RELEASED.includes(cmd) || permission.pode(cmd)))
                .map(c => c.cmd);
            await msg.reply(possible.length
                ? t('mensagens.ambiguo', { caller, lista: possible.join(', ') })
                : t('mensagens.desconhecido', { body }));
            return;
        }

        // Bot off: everything ignored (including your commands) until /bot -on
        if (getSetting('bot.paused') && command.cmd !== '/bot') {
            printInfo(`Command '${command.cmd}' ignored: bot is off (/bot -on to enable)`);
            return;
        }

        // /bot -login <password>: applies to outsiders (before bot.users) and the password does not go to the database
        const passwordLogin = command.cmd === '/bot' ? loginPassword(args) : null;
        if (passwordLogin !== null) {
            await hideInDb(msgIdPure);
            if (msg.fromMe) await msg.reply(t('mensagens.voceEDono'));
            else await msg.reply(await tryLogin({ numero: senderNumber, nome: senderName, senha: passwordLogin, isGroup }));
            return;
        }

        /*
         * The others use the common commands if bot.users allows: true (everyone),
         * the person (by phone), the group where the command was typed or the
         * person only in that group ("phone:group"), and only those in each one's rule
         * (src/permissions.js). Besides that, ignored silently (the bot is not
         * rude doorman, just deaf). The exception: whoever only has permission in
         * groups and tries in private learns where they can.
         */
        const permission = permissionHere({ numero: senderNumber, chatId, isGroup });

        // The typist's level: owner (you, the bot account), admin (bot.admins, by phone), user or none
        const level = levelAlt({ fromMe: msg.fromMe, numero: senderNumber, permissao: permission });
        const admin = answer(level, ROLES.ADMIN); // the owner or an admin
        if (!level) {
            printDebug(`Command '${command.cmd}' from ${senderName} ignored: outside bot.users`);
            if (!isGroup && permission.soNosGrupos.length) {
                const groups = await Promise.all(permission.soNosGrupos.map(async (id) =>
                    `👥 ${await groupResolverName(id).catch(() => null) || id}`));
                await msg.reply(t('mensagens.semPermissaoPrivado', { grupos: groups.join(', ') }));
            } else {
                await notifyWithoutPermission(msg, command.cmd, senderNumber || senderJid);
            }
            return;
        }

        /*
         * Command above the typist's level (and that the owner did not delegate): silently ignored in the
         * chat and only warns in your private chat. Avoids that, with several zapbots in the same group, one person's command
         * of one person be executed by everyone.
         */
        if (!answer(level, command.role) && !(command.alvos ?? [command.cmd]).every(cmd => permission.pode(cmd))) {
            if (isDebugMode()) {
                messageToSelf(t('mensagens.tentouExecutar', { nome: senderName, cmd: command.cmd, chat: chatName }));
            }
            await notifyWithoutPermission(msg, command.cmd, senderNumber || senderJid);
            return;
        }

        // Flood protection (only for non-admins): over the limit, one warning and then silence
        if (!admin) {
            const flood = checkFlood(senderNumber || senderJid, command.cmd);
            if (!flood.liberado) {
                if (flood.avisar) {
                    printInfo(`Flood: ${senderName} repeated ${command.cmd}; ignored for ${flood.segundos}s`);
                    const max = getSetting('bot.flood.maxCommandRepeated');
                    await msg.reply(t('mensagens.flood', {
                        max: t(max === 1 ? 'mensagens.vez' : 'mensagens.vezes', { n: max }),
                        espera: t(flood.segundos === 1 ? 'mensagens.segundo' : 'mensagens.segundos', { n: flood.segundos })
                    }));
                }
                return;
            }
        }

        // The rule's commands (/bot +cmd|-cmd); /help and /whois always pass. In a text alias, each {/command}
        const denied = !admin && (command.alvos ?? [command.cmd])
            .find(cmd => !ALWAYS_RELEASED.includes(cmd) && !permission.pode(cmd));
        if (denied) {
            printDebug(`Command '${denied}' from ${senderName} ignored: outside their commands`);
            await msg.reply(limitNotice(permission.regras, denied));
            return;
        }

        if (resolved.prefixo) printDebug(`Command '${resolved.prefixo}' completed to '${command.cmd}'`);
        printDebug(isGroup
            ? `Running command '${body}' from '${senderName}' in group '${chatName}'`
            : `Running command '${body}' in '${chatName}'`);

        // Text alias: the {/command}s run here, with the permissions of whoever called (the arguments stay out)
        if (resolved.texto) {
            printCall(msg.fromMe ? (client.info?.pushname || t('core.voce')) : senderName, body, chatName);
            const runAlias = () => withTyping(msg, command, () => textRunAlias(msg, resolved, {
                chatId, chatName, isGroup,
                quem: { nivel: level, admin, podeUsar: admin ? () => true : permission.pode, senderContact, senderName, senderNumber }
            }));
            // The usage limit (/bot +limit) applies to each {/command} of the alias; the owner and the admins have none
            if (admin) await runAlias();
            else await withLimit({ msg, quem: { numero: senderNumber, chatId, isGroup }, cmds: command.alvos ?? [command.cmd], params: body }, runAlias);
            return;
        }

        if (resolved.alias) {
            const call = [resolved.destino, args].filter(Boolean).join(' ');
            if (!resolved.quiet) await msg.reply(t('mensagens.alias', { alias: resolved.alias, chamada: call }), undefined, { linkPreview: false });
        }

        // The saved command's options belong to the target, including -h and -rm.
        const opts = readOptions(command, args);
        contextDebug().maskTelefones = askedMask(command, opts);

        if (isDebugMode()) {
            printDebug('Command parser:', command.cmd, dataParserCommand(args, command, opts));
        }

        // foo -help
        if (opts.opt.help) {
            await msg.reply('```' + getCommandSyntax(command.cmd, helpProtocol(command, opts.argv)) + '```');
            return;
        }

        // Unknown option (in strict commands) and an option the person cannot use (role, otherChats)
        const reject = optionsError(command, opts) ?? denial(command, opts, level);
        if (reject) {
            await msg.reply(reject);
            return;
        }

        // In private, the senderName of your messages is the OTHER participant's (see rawSenderId)
        printCall(msg.fromMe ? (client.info?.pushname || t('core.voce')) : senderName, body, chatName);

        const handler = HANDLERS[command.cmd];

        if (!handler) {
            await msg.reply(t('mensagens.naoImplementado', { cmd: command.cmd }));
            return;
        }

        const quotedMsg = msg.hasQuotedMsg ? await msg.getQuotedMessage().catch(() => null) : null;

        const run = () => withTyping(msg, command, () => handler(assembleContext({
            msg, args, opts, quotedMsg,
            chat: { chatId, chatName, isGroup },
            quem: { nivel: level, admin, podeUsar: admin ? () => true : permission.pode, senderContact, senderName, senderNumber }
        })));

        /*
         * The usage limit (/bot +limit): only counts what succeeded (src/usageLimit.js). The usageFree options of the
         * command (queries, like /gpt's -prices) never count. The owner and the admins have no limit.
         */
        if (admin) {
            await run();
        } else {
            const gratis = (command.usageFree ?? []).some(o => opts.given.has(o));
            await withLimit({ msg, quem: { numero: senderNumber, chatId, isGroup }, cmds: [command.cmd], gratis, params: args }, run);
        }
    } catch (error) {
        printError('[message_create] Handled general error:', {
            error: error?.message || String(error),
            stack: error?.stack,
            from: msg?.from,
            to: msg?.to,
            remote: msg?.id?.remote,
            fromMe: msg?.fromMe,
            type: msg?.type
        });
    } finally {
        printDebugLevel(1, 'message_create end');
    }
}));
