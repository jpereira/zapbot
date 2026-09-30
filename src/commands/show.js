/*
 * Comando /show e /edit.
 */

const fs = require('fs-extra');

const { client } = require('../client');
const { getCommandSyntax } = require('./base');
const { DAY_MS } = require('../constants');
const { chatCurrentIds } = require('../contacts');
const { dbAll, dbGet, dbReady, dbRun } = require('../db');
const { sendMessageDeleted, isStatus, resolverAuthorDeleted } = require('../events/deleted');
const { sendMessageEdited } = require('../events/edited');
const { printError, printInfo } = require('../log');
const { getSetting } = require('../settings');
const { humanSize, mediaIsPath } = require('../util/files');
const { wait, formatData, paraMs, plural } = require('../util/format');

// What changes between the deleted (/show) and the edited (/edit)
const TYPES_CACHE = {
    apagadas: {
        cmd: '/show',
        tabela: 'messages',
        filtro: 'revoked = 1',
        quando: 'revoked_at',
        ordem: 'revoked_at DESC, timestamp DESC',
        retencao: 'cache.revokedRetentionDays',
        comMidia: true,
        icone: '♻️',
        rotulo: 'Deletadas',
        iconeLista: '🗑️',
        singular: 'apagada',
        plural: 'apagadas'
    },
    editadas: {
        cmd: '/edit',
        tabela: 'message_edits',
        filtro: '1 = 1',
        quando: 'edited_at',
        ordem: 'edited_at DESC, id DESC',
        retencao: 'cache.editedRetentionDays',
        comMidia: false,
        icone: '✏️',
        rotulo: 'Editadas',
        iconeLista: '✏️',
        singular: 'editada',
        plural: 'editadas'
    }
};

/*
 * Numbering of the last -l (index → chat_id), one per type.
 * We keep the snapshot because the list order changes with every new message
 * deleted/edited: without it, "chat 2" could point to another chat between -l and -c.
 */
const chatsLastList = { apagadas: [], editadas: [] };

// Chats with messages of the type, in the same order as -l
function cacheQueryChats(type) {
    const t = TYPES_CACHE[type];

    return dbAll(
        `SELECT chat_id,
                MAX(chat_name) AS chat_name,
                MAX(is_group) AS is_group,
                COUNT(*) AS total,
                MAX(${t.quando}) AS ultima
           FROM ${t.tabela}
          WHERE ${t.filtro}
          GROUP BY chat_id
          ORDER BY total DESC, ultima DESC`
    );
}

const chatNameAlt = (c) => c.chat_name || c.chat_id.split('@')[0];

/**
 * Resolves the -c value to a chat:
 * number → position in the type's list in the last -l
 * text  → search by name (case insensitive)
 * @returns {Promise<{ids: string[], nome: string} | {erro: string}>}
 */
async function resolverChatTarget(type, valueAlt) {
    const t = TYPES_CACHE[type];
    const chats = await cacheQueryChats(type);

    if (!chats.length) {
        return { erro: `${t.icone} Nenhuma mensagem ${t.singular} no cache.` };
    }

    // By number
    if (/^\d+$/.test(valueAlt)) {
        const indexAlt = Number(valueAlt);
        const list = chatsLastList[type].length ? chatsLastList[type] : chats.map(c => c.chat_id);
        const chatId = list[indexAlt - 1];
        const chat = chats.find(c => c.chat_id === chatId);

        if (!chat) {
            return { erro: `❌ Chat nº ${indexAlt} não existe (ou não tem mais ${t.plural}). Rode ${t.cmd} -l para ver a lista atual.` };
        }

        return { ids: [chat.chat_id], nome: chatNameAlt(chat) };
    }

    // By name
    const search = valueAlt.toLowerCase();
    const foundAlt6 = chats.filter(c => chatNameAlt(c).toLowerCase().includes(search));
    const exact = foundAlt6.find(c => chatNameAlt(c).toLowerCase() === search);

    if (exact || foundAlt6.length === 1) {
        const chat = exact || foundAlt6[0];
        return { ids: [chat.chat_id], nome: chatNameAlt(chat) };
    }

    if (!foundAlt6.length) {
        return { erro: `❌ Nenhum chat com ${t.plural} contém "${valueAlt}". Rode ${t.cmd} -l para ver a lista.` };
    }

    return {
        erro: `🔎 "${valueAlt}" corresponde a ${foundAlt6.length} chats. Seja mais específico ou use o número:\n` +
              foundAlt6.map(c => `• ${chatNameAlt(c)}`).join('\n')
    };
}

/*
 * /show -list e /edit -list (a mesma lista nos dois)
 * Deleted and edited ones stored in the cache, from all chats, each type with the
 * its numbering (the /show -c one and the /edit -c one). The chat where the command was
 * executed comes marked. Use -pv to receive it in private.
 */
async function listCache({ msg, opts, chatId }) {
    await dbReady;

    const myId = client.info.wid._serialized;
    const idsDoChat = await chatCurrentIds(chatId);
    const ownerInPrivate = idsDoChat.includes(myId);
    const LIMIT = 10;

    const line = (c, i) => {
        const iconAlt = c.is_group ? '👥' : '👤';
        const current = idsDoChat.includes(c.chat_id) ? ' ← _este chat_' : '';
        return `${i + 1}. ${iconAlt} ${chatNameAlt(c)} — *${c.total}* _(última ${formatData(c.ultima)})_${current}\n`;
    };

    let textAlt = '🗄️ *Mensagens no cache*\n';
    let algum = false;

    for (const [type, t] of Object.entries(TYPES_CACHE)) {
        const summary = await dbGet(
            `SELECT COUNT(*) AS total,
                    ${t.comMidia ? 'COALESCE(SUM(has_media), 0)' : '0'} AS com_midia,
                    MIN(${t.quando}) AS mais_antiga
               FROM ${t.tabela}
              WHERE ${t.filtro}`
        );

        const details = [];
        if (summary.com_midia > 0) details.push(`${summary.com_midia} com mídia`);

        if (summary.total > 0 && summary.mais_antiga) {
            const expiresIn = paraMs(summary.mais_antiga) + getSetting(t.retencao) * DAY_MS;
            const daysAlt = Math.max(0, Math.ceil((expiresIn - Date.now()) / DAY_MS));
            details.push(`a mais antiga expira em ${daysAlt} dia${daysAlt === 1 ? '' : 's'}`);
        }

        textAlt += `\n${t.iconeLista} *${t.rotulo}:* ${summary.total}`;
        textAlt += details.length ? ` _(${details.join(' · ')})_\n` : '\n';

        if (!summary.total) {
            chatsLastList[type] = [];
            continue;
        }

        algum = true;

        const byChat = await cacheQueryChats(type);
        chatsLastList[type] = byChat.map(c => c.chat_id);

        byChat.slice(0, LIMIT).forEach((c, i) => { textAlt += line(c, i); });

        if (byChat.length > LIMIT) {
            textAlt += `_+${byChat.length - LIMIT} chat(s)_\n`;

            // The current chat outside the top: shows up anyway, with the no. for -c
            const i = byChat.findIndex(c => idsDoChat.includes(c.chat_id));
            if (i >= LIMIT) textAlt += line(byChat[i], i);
        }
    }

    textAlt += `\n💡 _/show -N reexibe as deletadas e /edit -N as editadas deste chat (máx. ${getSetting('show.max')})._`;

    if (algum) {
        textAlt += '\n💡 _Junte -c <nº ou nome> para outro chat: o nº é o da lista do tipo (/show -c 2, /edit -c 1)._' +
                 '\n💡 _-pv envia no seu privado; -f remove do cache as deste chat (no seu privado: de todos)._';
    }

    if (opts.opt.pv && !ownerInPrivate) {
        await msg.reply('🗄️ Resumo enviado no seu privado.');
        await client.sendMessage(myId, textAlt);
    } else {
        await msg.reply(textAlt);
    }
}

/*
 * /show -flush e /edit -flush
 * Removes the messages of the type from the cache (deleted ones take the media files along):
 * - in any chat      → only those of THIS chat;
 * - in your own private chat → those of ALL chats.
 * Destructive: only the bot owner runs it, even if the command is opened up in the config.
 */
async function cacheClean({ msg, chatId, tipo: type, alvo: target = null }) {
    const t = TYPES_CACHE[type];

    if (!msg.fromMe) {
        await msg.reply(`⛔ Só o dono do bot pode usar ${t.cmd} -flush.`);
        return;
    }

    await dbReady;

    const myId = client.info.wid._serialized;
    // With -c, the target is the chosen chat; without it, the current chat
    const idsDoChat = target ? target.ids : await chatCurrentIds(chatId);
    const general = !target && idsDoChat.includes(myId);

    // Filter: all of the type (owner's private chat) or only those of the target chat
    const filter = general
        ? t.filtro
        : `${t.filtro} AND chat_id IN (${idsDoChat.map(() => '?').join(', ')})`;
    const params = general ? [] : idsDoChat;

    // Collects what will go out BEFORE deleting, for the summary message
    const byChat = await dbAll(
        `SELECT chat_id,
                MAX(chat_name) AS chat_name,
                MAX(is_group) AS is_group,
                COUNT(*) AS total
           FROM ${t.tabela}
          WHERE ${filter}
          GROUP BY chat_id
          ORDER BY total DESC`,
        params
    );

    const total = byChat.reduce((sum, c) => sum + c.total, 0);

    if (!total) {
        await msg.reply(general
            ? `${t.icone} Nenhuma mensagem ${t.singular} no cache.`
            : `${t.icone} Nenhuma mensagem ${t.singular} registrada neste chat.`);
        return;
    }

    // Deletes the media from disk
    let files = 0;
    let bytes = 0;

    if (t.comMidia) {
        const mediaAltAlt = await dbAll(`SELECT media_path FROM ${t.tabela} WHERE ${filter} AND media_path IS NOT NULL`, params);

        for (const { media_path } of mediaAltAlt) {
            if (!mediaIsPath(media_path)) continue;

            try {
                bytes += fs.statSync(media_path).size;
                fs.unlinkSync(media_path);
                files++;
            } catch {
                // file no longer exists
            }
        }
    }

    // Deletes the database rows
    const res = await dbRun(`DELETE FROM ${t.tabela} WHERE ${filter}`, params);

    printInfo(`${t.cmd} -flush (${general ? 'geral' : chatId}): ${res.changes} mensagens ${t.plural}${t.comMidia ? ` e ${files} arquivos` : ''} removidos`);

    let textAlt = general
        ? `🧹 *Flush geral das mensagens ${t.plural}*\n\n`
        : target
            ? `🧹 *Flush das mensagens ${t.plural} de:* ${target.nome}\n\n`
            : `🧹 *Flush das mensagens ${t.plural} deste chat*\n\n`;

    textAlt += `🗄️ Removidas: *${plural(res.changes, 'mensagem', 'mensagens')}*`;
    textAlt += general ? ` de *${plural(byChat.length, 'chat', 'chats')}*\n` : '\n';

    if (t.comMidia) {
        textAlt += `📎 Mídias apagadas do disco: *${files}*${files ? ` _(${humanSize(bytes)})_` : ''}\n`;
    }

    if (general) {
        const LIMIT = 10;

        textAlt += '\n*Por chat:*\n';
        byChat.slice(0, LIMIT).forEach((c, i) => {
            const iconAlt = c.is_group ? '👥' : '👤';
            textAlt += `${i + 1}. ${iconAlt} ${chatNameAlt(c)} — *${c.total}*\n`;
        });

        if (byChat.length > LIMIT) {
            textAlt += `_+${byChat.length - LIMIT} chat(s)_\n`;
        }
    } else if (!target) {
        textAlt += `\n💡 _Para limpar as ${t.plural} de todos os chats, use ${t.cmd} -f no seu privado._`;
    }

    await msg.reply(textAlt);
}

// Resend of a /show or /edit item
const RESEND_CACHE = {
    apagadas: async (destination, row, i, total) => {
        const info = await resolverAuthorDeleted(row);

        await sendMessageDeleted(destination, row, info, {
            titulo: `${isStatus(row) ? '📸 *STATUS APAGADO*' : '❌ *MENSAGEM APAGADA*'} (${i + 1}/${total})`,
            extras: [`🗑️ *Apagada em:* ${formatData(row.revoked_at)}`]
        });
    },
    editadas: async (destination, row, i, total) => {
        await sendMessageEdited(destination, row, {
            nomeChat: row.chat_name || 'Conversa desconhecida',
            nomeRemetente: row.sender_name || 'Desconhecido',
            numeroRemetente: row.sender_number || null
        }, { titulo: `✏️ *MENSAGEM EDITADA* (${i + 1}/${total})` });
    }
};

// Common part of /show and /edit
async function cacheReshow(type, { msg, opts, chatId }) {
    const t = TYPES_CACHE[type];

    // -c <no.|name>: picks another chat (works in any chat; use -pv to avoid exposing it here)
    let target = null;

    if (opts.opt.chat) {
        await dbReady;
        target = await resolverChatTarget(type, String(opts.opt.chat));

        if (target.erro) {
            await msg.reply(target.erro);
            return;
        }
    }

    if (opts.opt.flush) {
        await cacheClean({ msg, chatId, tipo: type, alvo: target });
        return;
    }

    if (opts.opt.list) {
        await listCache({ msg, opts, chatId });
        return;
    }

    // "-3" is not a declared option, so the parser puts it in argv (just like "3")
    const extras = opts.argv.filter(Boolean);
    let n = 1;

    if (extras.length > 1) {
        await msg.reply('```' + getCommandSyntax(t.cmd) + '```');
        return;
    }

    if (extras.length === 1) {
        const m = extras[0].match(/^-?(\d+)$/);

        if (!m || Number(m[1]) < 1) {
            await msg.reply('```' + getCommandSyntax(t.cmd) + '```');
            return;
        }

        n = Number(m[1]);
    }

    let notice = '';
    const max = getSetting('show.max');
    if (n > max) {
        notice = `\n_(limitado a ${max} por vez)_`;
        n = max;
    }

    const idsDoChat = target ? target.ids : await chatCurrentIds(chatId);

    await dbReady;

    const rows = await dbAll(
        `SELECT *
           FROM ${t.tabela}
          WHERE ${t.filtro}
            AND chat_id IN (${idsDoChat.map(() => '?').join(', ')})
          ORDER BY ${t.ordem}
          LIMIT ?`,
        [...idsDoChat, n]
    );

    if (!rows.length) {
        // In private, without -c, the intent was almost always to see another chat
        const inMyPrivate = !target && idsDoChat.includes(client.info.wid._serialized);

        await msg.reply(inMyPrivate
            ? `${t.icone} Nenhuma mensagem ${t.singular} neste chat.\n💡 _Para ver as de outro chat: ${t.cmd} -l e depois ${t.cmd} -N -c <nº ou nome>._`
            : `${t.icone} Nenhuma mensagem ${t.singular} registrada neste chat.`);
        return;
    }

    // Fetches the most recent, shows from oldest to newest
    rows.reverse();

    const destination = opts.opt.pv ? client.info.wid._serialized : chatId;
    const missing = n > rows.length ? ` (pedidas ${n}, encontradas ${rows.length})` : '';
    let summary = `${t.icone} *${rows.length} mensage${rows.length === 1 ? `m ${t.singular}` : `ns ${t.plural}`}*${missing}${notice}`;

    if (target) {
        summary += `\n💬 *Chat:* ${target.nome}`;
    }

    if (opts.opt.pv) {
        // The summary (with the chat name) goes only to the private chat
        await msg.reply(`${t.icone} Enviado no seu privado.`);
        await client.sendMessage(destination, target ? summary : `${summary}\n💬 *Chat:* ${rows[0].chat_name || chatId}`);
    } else {
        await msg.reply(summary);
    }

    for (const [i, row] of rows.entries()) {
        try {
            await RESEND_CACHE[type](destination, row, i, rows.length);
        } catch (err) {
            printError(`${t.cmd}: falha ao reenviar ${row.id}:`, err.message);
            await client.sendMessage(destination, `⚠️ Não consegui reenviar a mensagem ${i + 1}/${rows.length}: ${err.message}`);
        }

        if (i < rows.length - 1) await wait(getSetting('show.delayMs'));
    }
}

async function cmdUndo(ctx) {
    await cacheReshow('apagadas', ctx);
}

async function cmdEdit(ctx) {
    await cacheReshow('editadas', ctx);
}

module.exports = {
    cmdEdit,
    cmdUndo
};
