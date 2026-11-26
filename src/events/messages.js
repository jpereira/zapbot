/*
 * 'message_create' event: saves the message, counts it for /stats, runs it through /watch and executes commands.
 */

const path = require('path');
const fs = require('fs-extra');

const { client, botConsumeSending, isNoStore, wasSentByBot, messageToSelf } = require('../client');
const { getCommandSyntax, helpProtocol } = require('../commands/base');
const { textRunAlias, resolveAlias } = require('../aliases');
const { readPipeline, runSources } = require('../pipeline');
const { ttsRewrite } = require('../ttsOption');
const { handlePassword: handlePasswordNotes } = require('../notesLock');
const { extractPassword, maskSecret } = require('../util/lockPassword');
const { handlerFor } = require('../commands/index');
const {
    scheduleName, contactName, removeDeviceSuffix, resolveLidToPhone, resolveGroupName, resolvePrivateName
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
const { botConfig } = require('../botConfig');
const { printCall, printCommandUnknown, printDebug, printError, printInfo } = require('../log');
const { t } = require('../i18n');
const { getSetting, isDebugMode, SETTINGS_SCHEMA } = require('../settings');
const { countStats, myIdStats } = require('../stats');
const { mediaIsPath, nameSafe, getFolderMedia } = require('../util/files');
const { visibleBody, withoutInvisible } = require('../util/messageBody');
const { joinContinuedLines, toMillis } = require('../util/format');
const { checkWatch } = require('../watch/check');
const { logIsCopy } = require('../debugCopy');
const { withContextDebug, contextDebug } = require('../debugContext');
const { printDebugLevel } = require('../log');
const { instrumentObject } = require('../debugInstrumentation');
const { resolveChannelName } = require('../contacts');
const { mentionsForRecord } = require('../mentions');
const { isChannelAlt, channelId } = require('../util/origin');
const { withLimit } = require('../usageLimit');
const { notifyWithoutPermission } = require('../noPermission');
const { withTyping, optionsError, readOptions, assembleContext, denial, askedMask } = require('../execute');
const { dataParserCommand } = require('../debugParser');

// WhatsApp's own notices (joined the group, changed the name, encryption, call...): they have no author
/** The value of "/set <secret setting> <value>": it must not stay in the messages table or in the logs */
function secretOfSet(command, args) {
    if (command?.cmd !== '/set') return null;
    const m = /^\s*[+-]?([\w.]+)\s+(\S[\s\S]*?)\s*$/.exec(String(args ?? ''));
    if (!m || !SETTINGS_SCHEMA[m[1]]?.secret) return null;
    return /^(reset|default|off|on|true|false)$/i.test(m[2]) ? null : m[2];
}

const hasWebCredential = (args) =>
    /(?:^|\s)-(?:p|pa|pas|pass|2|2f|2fa|t|to|tot|totp)(?=\s|$)/i.test(args);
const isWebCredential = (body) =>
    /^\s*\/web(?=\s|$)/i.test(body ?? '') && hasWebCredential(body);

const SYSTEM_TYPES = new Set([
    'broadcast_notification', 'call_log', 'e2e_notification', 'gp2',
    'notification', 'notification_template', 'protocol'
]);

// The bot's own debug log copy is skipped before anything traced runs (it would log itself)
client.on('message_create', (msg) => (msg.fromMe && logIsCopy(msg.body)) ? undefined : withContextDebug({
    chatId: channelId(msg?.from, msg?.id?.remote, msg?.to) || msg?.id?.remote || msg?.from || msg?.to,
    command: isWebCredential(msg.body) ? '/web ***' : (visibleBody(msg.body).trim().startsWith('/') ? msg.body : null),
    depth: 0,
    maskPhones: false
}, async () => {
    instrumentObject(msg, 'WhatsApp.Message', 2,
        ['reply', 'downloadMedia', 'getChat', 'getContact', 'getQuotedMessage', 'getMentions']);
    const sensitiveWeb = isWebCredential(msg.body);
    const messageBody = visibleBody(msg.body);
    const recordedBody = sensitiveWeb ? '/web ***' : messageBody;
    printDebugLevel(1, 'message_create start', { body: recordedBody, type: msg.type });
    if (!sensitiveWeb) printDebugLevel(3, 'message_create WhatsApp data', msg._data);
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
        const isStatus = chatId === 'status@broadcast' || Boolean(msg.isStatus);
        const messageAt = isStatus ? (toMillis(msg.timestamp) || timestamp) : timestamp;

        // Group: name looked up by chatId (_data.chat may carry the wrong name)
        let chatName = isChannel
            ? (await resolveChannelName(chatId)) || `Canal ${chatId.split('@')[0]}`
            : isBroadcast ? null :
            (isGroup ? await resolveGroupName(chatId) : null) ||
            // Private: the other participant's contact (the chatId), by the name in your address book
            (isGroup ? null : await resolvePrivateName(chatId)) ||
            msg?._data?.chat?.name ||
            msg?._data?.chat?.formattedTitle ||
            // notifyName is the name of who SENT: it only serves as the chat name when it was the other
            (isGroup || msg?.fromMe ? null : msg?._data?.notifyName) ||
            (isGroup ? `Grupo ${chatId.split('@')[0]}` : chatId.split('@')[0]);

        /*
         * Remetente real:
         *   group   -> msg.author (participant)
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
            chatName = senderJid === 'UNKNOWN'
                ? t(isStatus ? 'mensagens.status' : 'mensagens.transmissao')
                : t(isStatus ? 'mensagens.statusDe' : 'mensagens.transmissaoDe', { name: senderName });
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

        // What the bot sent with a decrypted note (/notes of a protected tag) is not kept: no row, no media, no stats
        if (msg.fromMe && isNoStore(msg)) return;

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
                when: toMillis(msg.timestamp) || timestamp,
                fields: { msgs: 1, media: hasMedia }
            });
        }

        await dbRun(
            `INSERT INTO messages
                (id, sender_name, sender_jid, sender_number,
                 chat_id, chat_name, is_group,
                 body, type, timestamp,
                 has_media, media_path,
                 location_lat, location_lng,
                 raw_json, from_me, mentions, quoted_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                mentions      = COALESCE(excluded.mentions, messages.mentions),
                quoted_id     = COALESCE(excluded.quoted_id, messages.quoted_id)
             WHERE messages.revoked = 0`,
            [
                msgIdPure, senderName, senderJid, senderNumber,
                chatId, chatName, isGroup,
                recordedBody || '', msgType, messageAt,
                hasMedia, localMediaPath,
                lat, lng,
                'desativado', msg.fromMe ? 1 : 0, mentionsForRecord(msg.mentionedIds),
                (msg.hasQuotedMsg && msg._data?.quotedStanzaID) || null
            ]
        ).catch(err => printError('Error saving message:', err.message));

        // The location body contains the base64 thumbnail, not text or a command.
        const body = msgType === 'location' ? '' : joinContinuedLines(withoutInvisible(messageBody).trim());

        // Only the no., replying to a command's list (e.g.: several contacts with the name): does not go through /watch
        if (await replyChoice(msg, chatId, body)) return;

        // The password that /notes -lock #tag asked for (the next message in your private chat): not a command
        if (msg.fromMe && await handlePasswordNotes(msg, chatId, body)) return;

        // Replying (reply) to a bot game message (/games), without the command
        if (await replyGame(msg, chatId, body, { senderNumber, isGroup })) return;

        // /antilink: a link from someone who is not a group admin is deleted (according to the group mode)
        if (isGroup && !msg.fromMe) {
            const dismissed = answer(levelAlt({ fromMe: msg.fromMe, number: senderNumber, permission: permissionHere({ number: senderNumber, chatId, isGroup }) }), ROLES.ADMIN);
            if (await checkAntilink({ msg, chatId, body, dismissed, senderName }).catch((err) => {
                printError('/antilink: error checking:', err.message);
                return false;
            })) return;
            // /antitag and /antibadword: tagging everyone and prohibited words
            if (await checkRules({ msg, chatId, body, dismissed, senderName }).catch((err) => {
                printError('/antitag, /antibadword: error checking:', err.message);
                return false;
            })) return;
        }

        // The bot's own reply is never a command, even starting with "/" (see markSentByBot)
        const sentByBot = msg.fromMe && body.startsWith('/') && wasSentByBot(body);
        const caller = body.startsWith('/') && !sentByBot ? body.split(/\s+/, 1)[0] : null;

        if (sentByBot) printInfo(`Bot's own message starting with '/' ignored as a command: ${body.slice(0, 60)}`);
        let resolved = caller ? await resolveAlias(body) : null;
        // A private alias (/alias -private) is the owner's: for anyone else it is a command that does not exist
        if (resolved?.ownerOnly && !msg.fromMe) resolved = null;
        if (resolved?.candidates && !msg.fromMe) resolved = { ...resolved, candidates: resolved.candidates.filter(c => !c.ownerOnly) };
        // -tts (/crypto -tts BTC): it is /tts {/crypto -q BTC}; the log of the call keeps what was typed
        // /a | /b: the last command answers here, the ones before it feed it (src/pipeline.js). A wrong pipe is only
        // answered after the permission checks, like any command
        const pipe = resolved ? await readPipeline(resolved, body, { resolve: resolveAlias, owner: Boolean(msg.fromMe) }) : null;
        if (pipe?.resolved) resolved = pipe.resolved;
        const spoken = ttsRewrite(resolved?.command, resolved?.args ?? '');
        if (spoken) resolved = await resolveAlias(spoken);
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

        // A /notes -lock <password> carries the password: it does not go to the logs, to the echo of an alias or to the
        // messages table (what the log and the history show is the command with ***)
        // The same for the value of a secret setting (/set zapbot.web.password <password>, API keys, the TOTP secret)
        const webCredential = command?.cmd === '/web' && hasWebCredential(args);
        const secret = webCredential ? args
            : command?.cmd === '/notes' ? extractPassword(args)?.password ?? null : secretOfSet(command, args);
        const logBody = webCredential ? '/web ***' : maskSecret(body, secret);
        if (secret) await dbRun('UPDATE messages SET body = ? WHERE id = ?', [logBody, msgIdPure]).catch(() => {});
        if (secret && (webCredential || command?.cmd === '/set')) {
            await Promise.resolve(msg.delete?.(true)).catch(() => {});
        }
        if (webCredential) {
            msg.reply = (content, _, options) => client.sendMessage(chatId, content, options);
        }

        if (!command) {
            if (msg.fromMe || isDebugMode()) {
                const who = msg.fromMe ? (client.info?.pushname || t('core.voce')) : senderName;
                printCommandUnknown(who, body.length > 100 ? `${body.slice(0, 100)}…` : body, { ofOwner: msg.fromMe });
            }
            const permission = permissionHere({ number: senderNumber, chatId, isGroup });
            const level = levelAlt({ fromMe: msg.fromMe, number: senderNumber, permission });
            if (!level) return;

            // The start of more than one command (e.g.: /un): lists the ones the person can use
            const possible = (resolved?.candidates ?? [])
                .filter(c => answer(level, c.role) || (c.targets ?? [c.cmd])
                    .every(cmd => ALWAYS_RELEASED.includes(cmd) || permission.can(cmd)))
                .map(c => c.cmd);
            // A command the owner turned off (or that comes off, like /kernel): the owner and the admins are told how to turn it on
            const off = botConfig.commands.find(c => c.cmd === caller.toLowerCase() || c.aliases?.includes(caller.toLowerCase()));
            if (!possible.length && off && getSetting('commands.disabled').includes(off.cmd) && answer(level, ROLES.ADMIN)) {
                await msg.reply(t('mensagens.desativado', { cmd: off.cmd, name: off.cmd.slice(1) }));
                return;
            }
            await msg.reply(possible.length
                ? t('mensagens.ambiguo', { caller, list: possible.join(', ') })
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
            else await msg.reply(await tryLogin({ number: senderNumber, name: senderName, password: passwordLogin, isGroup }));
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
        const permission = permissionHere({ number: senderNumber, chatId, isGroup });

        // The typist's level: owner (you, the bot account), admin (bot.admins, by phone), user or none
        const level = levelAlt({ fromMe: msg.fromMe, number: senderNumber, permission });
        const admin = answer(level, ROLES.ADMIN); // the owner or an admin
        if (!level) {
            printDebug(`Command '${command.cmd}' from ${senderName} ignored: outside bot.users`);
            if (!isGroup && permission.onlyInGroups.length) {
                const groups = await Promise.all(permission.onlyInGroups.map(async (id) =>
                    `👥 ${await resolveGroupName(id).catch(() => null) || id}`));
                await msg.reply(t('mensagens.semPermissaoPrivado', { groups: groups.join(', ') }));
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
        if (!answer(level, command.role) && !(command.targets ?? [command.cmd]).every(cmd => permission.can(cmd))) {
            if (isDebugMode()) {
                messageToSelf(t('mensagens.tentouExecutar', { name: senderName, cmd: command.cmd, chat: chatName }));
            }
            await notifyWithoutPermission(msg, command.cmd, senderNumber || senderJid);
            return;
        }

        if (pipe?.error) {
            await msg.reply(pipe.error);
            return;
        }

        // Flood protection (only for non-admins): over the limit, one warning and then silence
        if (!admin) {
            const flood = checkFlood(senderNumber || senderJid, command.cmd);
            if (!flood.allowed) {
                if (flood.notify) {
                    printInfo(`Flood: ${senderName} repeated ${command.cmd}; ignored for ${flood.seconds}s`);
                    const max = getSetting('bot.flood.maxCommandRepeated');
                    await msg.reply(t('mensagens.flood', {
                        max: t(max === 1 ? 'mensagens.vez' : 'mensagens.vezes', { n: max }),
                        wait: t(flood.seconds === 1 ? 'mensagens.segundo' : 'mensagens.segundos', { n: flood.seconds })
                    }));
                }
                return;
            }
        }

        // The rule's commands (/bot +cmd|-cmd); /help and /whois always pass. In a text alias, each {/command}
        const denied = !admin && (command.targets ?? [command.cmd])
            .find(cmd => !ALWAYS_RELEASED.includes(cmd) && !permission.can(cmd));
        if (denied) {
            printDebug(`Command '${denied}' from ${senderName} ignored: outside their commands`);
            await msg.reply(limitNotice(permission.rules, denied));
            return;
        }

        if (resolved.prefix) printDebug(`Command '${resolved.prefix}' completed to '${command.cmd}'`);
        printDebug(isGroup
            ? `Running command '${logBody}' from '${senderName}' in group '${chatName}'`
            : `Running command '${logBody}' in '${chatName}'`);

        // Text alias: the {/command}s run here, with the permissions of whoever called (the arguments stay out)
        if (resolved.text) {
            printCall(msg.fromMe ? (client.info?.pushname || t('core.voce')) : senderName, logBody, chatName);
            const runAlias = () => withTyping(msg, command, () => textRunAlias(msg, resolved, {
                chatId, chatName, isGroup,
                who: { level, admin, canUse: admin ? () => true : permission.can, senderContact, senderName, senderNumber }
            }));
            // The usage limit (/bot +limit) applies to each {/command} of the alias; the owner and the admins have none
            if (admin) await runAlias();
            else await withLimit({ msg, who: { number: senderNumber, chatId, isGroup }, cmds: command.targets ?? [command.cmd], params: body }, runAlias);
            return;
        }

        if (resolved.alias) {
            const call = maskSecret([resolved.destination, args].filter(Boolean).join(' '), secret);
            if (!resolved.quiet) await msg.reply(t('mensagens.alias', { alias: resolved.alias, call }), undefined, { linkPreview: false });
        }

        // The saved command's options belong to the target, including -h and -rm.
        const opts = readOptions(command, args);
        contextDebug().maskPhones = askedMask(command, opts);

        if (isDebugMode() && !secret) {
            printDebug('Command parser:', command.cmd, dataParserCommand(args, command, opts));
        }

        // foo -help
        if (opts.opt.help) {
            await msg.reply(getCommandSyntax(command.cmd, helpProtocol(command, opts.argv)));
            return;
        }

        // Unknown option (in strict commands) and an option the person cannot use (role, otherChats)
        const reject = optionsError(command, opts) ?? denial(command, opts, level);
        if (reject) {
            await msg.reply(webCredential ? '/web -h' : reject);
            return;
        }

        // In private, the senderName of your messages is the OTHER participant's (see rawSenderId)
        printCall(msg.fromMe ? (client.info?.pushname || t('core.voce')) : senderName, logBody, chatName);

        const handler = handlerFor(command);

        if (!handler) {
            await msg.reply(t('mensagens.naoImplementado', { cmd: command.cmd }));
            return;
        }

        let quotedMsg = msg.hasQuotedMsg ? await msg.getQuotedMessage().catch(() => null) : null;
        const who = { level, admin, canUse: admin ? () => true : permission.can, senderContact, senderName, senderNumber };
        const chat = { chatId, chatName, isGroup };

        // Each command before the last one of a pipe: the same checks as typed (help, options, role), its replies kept
        const runStage = async (stage, capture, quoted) => {
            const stageOpts = readOptions(stage.command, stage.args);
            if (stageOpts.opt.help) return { error: getCommandSyntax(stage.command.cmd) };
            const refused = optionsError(stage.command, stageOpts) ?? denial(stage.command, stageOpts, level);
            if (refused) return { error: refused };
            const stageHandler = handlerFor(stage.command);
            if (!stageHandler) return { error: t('mensagens.naoImplementado', { cmd: stage.command.cmd }) };
            await stageHandler(assembleContext({ msg: capture, args: stage.args, opts: stageOpts, quotedMsg: quoted, chat, who }));
            return null;
        };

        const run = () => withTyping(msg, command, async () => {
            if (pipe?.sources) {
                const fed = await runSources(pipe.sources, { msg, quotedMsg, run: runStage, last: command });
                if (fed.error) {
                    await msg.reply(fed.error);
                    return;
                }
                quotedMsg = fed.quoted;
            }
            return handler(assembleContext({ msg, args, opts, quotedMsg, chat, who }));
        });

        /*
         * The usage limit (/bot +limit): only counts what succeeded (src/usageLimit.js). The usageFree options of the
         * command (queries, like /gpt's -prices) never count. The owner and the admins have no limit.
         */
        if (admin) {
            await run();
        } else {
            // The usageCounts of the definition tells whether this call spends (/tts: only the ChatGPT one)
            const free = (command.usageFree ?? []).some(o => opts.given.has(o)) || command.usageCounts?.(opts) === false;
            await withLimit({ msg, who: { number: senderNumber, chatId, isGroup }, cmds: command.targets ?? [command.cmd], free, params: args }, run);
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
