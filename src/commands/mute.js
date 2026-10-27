/*
 * Comandos /mute e /unmute.
 */

const { client } = require('../client');
const { getCommandSyntax } = require('./base');
const { resolveLidToPhone, groupResolverName } = require('../contacts');
const { dbAll, dbGet, dbReady, dbRun } = require('../db');
const { describeDestination, resolverOrChoose } = require('../destinations');
const { TYPES, idKey, noticeOrigin } = require('../mudo');
const { plural } = require('../util/format');

/*
 * /mute (/mudo, /m) <option> </contact or group/|@mention|+number>
 * -d (-deleted)  mutes the deleted message notices
 * -e (-edited)   mutes the edit notices
 * -s (-status)   mutes the deleted status notices
 * -r (-reaction) mutes the notices of removed or changed reactions
 * -a (-all)      all of that
 * The options combine (-d -e); only the target, without an option, is -a. The target is looked up
 * as in -to, with priority for exact names (several: you choose from the
 * list), or a number. Replying to a notice (deleted, edited, status, reaction), the target
 * is where it came from: the person (private and status), the group or the community.
 * Muting the same target again adds to what was there. Without anything, lists;
 * -rm <no.|all> undoes it (the same as /unmute).
 *
 * /unmute <target|no.>  → undoes the mute (the target as in /mute, or the list no.)
 * /unmute -all (-a)  → desfaz todos
 */
const OPTIONS = {
    d: 'deleted', deleted: 'deleted',
    e: 'edited', edited: 'edited',
    s: 'status', status: 'status',
    r: 'reaction', reaction: 'reaction',
    a: 'all', all: 'all'
};
const COLUMNS = ['deleted', 'edited', 'status', 'reaction'];
const LABEL = Object.fromEntries(Object.values(TYPES).map(t => [t.coluna, t.rotulo]));
const EXAMPLES = '/Jorge Pereira/, /Grupo L200/ ou +5521999999999';

const describe = (m) => COLUMNS.filter(c => m[c]).map(c => LABEL[c]).join(', ');

// "🏘️ Comunidade", "👥 Grupo" or "👤 Pessoa"
function describeTarget(target) {
    const nameAlt = target.nome ?? target.target_name;
    if (target.comunidade || target.is_community) return `🏘️ ${nameAlt}`;
    return describeDestination({ nome: nameAlt, grupo: target.grupo ?? target.is_group });
}

/**
 * "-d -e /Grupo L200/" → { columns, target }. The options come before the target.
 * @returns {{ colunas: Set<string>, alvo: string, rm?: string, list?: boolean } | { erro: string }}
 */
function readMuted(args) {
    const r = { colunas: new Set(), alvo: '' };
    let rest = String(args ?? '').trim();

    for (;;) {
        const m = rest.match(/^-(\w+)(?:\s+|$)/);
        if (!m) break;

        const nameAlt = m[1].toLowerCase();
        rest = rest.slice(m[0].length);

        if (nameAlt === 'rm') {
            const v = rest.match(/^(\S+)/);
            r.rm = v ? v[1] : '';
            rest = rest.slice(v ? v[0].length : 0).trim();
        } else if (nameAlt === 'l' || nameAlt === 'list') {
            r.list = true;
        } else if (OPTIONS[nameAlt] === 'all') {
            COLUMNS.forEach(c => r.colunas.add(c));
        } else if (OPTIONS[nameAlt]) {
            r.colunas.add(OPTIONS[nameAlt]);
        } else {
            return { erro: `❌ Opção desconhecida: -${nameAlt}` };
        }
    }

    // The target: /name with space/, "in quotes" or the rest as it came
    r.alvo = withoutDelimiters(rest);
    return r;
}

// "/Grupo L200/" or "'Grupo L200'" → "Grupo L200"
const withoutDelimiters = (textAlt) => textAlt.trim()
    .replace(/^\/(.*)\/$/s, '$1')
    .replace(/^(["'])(.*)\1$/s, '$2')
    .trim();

// A person by phone (or the id, without it): the saved name, the profile one or the number
async function person(sender) {
    const id = /^\d+$/.test(sender) ? `${sender}@c.us` : sender;
    const contactAlt = await client.getContactById(id).catch(() => null);
    const nameAlt = contactAlt?.name || contactAlt?.pushname || `+${id.split('@')[0]}`;
    return { id, nome: nameAlt, grupo: false };
}

// A group; a community's announcements group becomes the community
async function group(chatId) {
    const chat = await client.getChatById(chatId).catch(() => null);
    const meta = chat?.groupMetadata ?? {};
    const nameAlt = await groupResolverName(chatId).catch(() => null) || chat?.name || chatId;
    const community = Boolean(meta.isParentGroup || meta.defaultSubgroup);
    return { id: chatId, nome: nameAlt, grupo: true, comunidade: community };
}

/**
 * Replying to a message: where it came from. A bot notice (deleted,
 * edited, status, /show): the person (private and status), the group or the
 * community. Without the stored origin, reads the group before the person's number or name.
 * Someone's message: that person.
 * @returns {Promise<object|{ erro: string }|null>} null: replied nothing
 */
async function replyTarget(msg, quotedMsg) {
    if (!quotedMsg) return null;

    const origin = await noticeOrigin(quotedMsg.id?.id);
    if (origin) {
        return origin.chat_id.endsWith('@g.us') ? group(origin.chat_id) : person(origin.sender || origin.chat_id);
    }

    if (quotedMsg.fromMe) {
        // Only the header: the quoted text may have its own "Grupo:" down below.
        const header = String(quotedMsg.body ?? '').split(
            /\n(?:📅|✏️|📝|💬|❌|🗑️|😶)/
        )[0];
        const nameGroup = header.match(/^👥\s+\*?Grupo:\*?\s*(.+)$/m)?.[1]?.trim();
        if (nameGroup) {
            const target = await resolverOrChoose(msg, nameGroup, { tipo: 'grupo' });
            return target ? group(target.id) : null;
        }
        const numberAlt = header.match(/^📱\s+\*?Número:\*?\s*\+(\d{10,15})\s*$/m)?.[1];
        if (numberAlt) return person(numberAlt);
        const nameAlt = header.match(/^👤\s+\*?Nome:\*?\s*(.+)$/m)?.[1]?.trim();
        if (nameAlt) return resolverOrChoose(msg, nameAlt, { tipo: 'contato' });
    }

    if (!quotedMsg.fromMe) {
        const author = quotedMsg.author || quotedMsg.from;
        const phoneAlt = author?.endsWith('@lid') ? await resolveLidToPhone(author) : author;
        if (phoneAlt) return person(phoneAlt.split('@')[0]);
    }
    return { erro: `❌ Não sei de quem é essa mensagem: responda um aviso (apagada, editada, status, reação) ou informe quem: ${EXAMPLES}.` };
}

/**
 * The target: the one from the text (looked up as in -to) or, without it, the replied message's.
 * @returns {Promise<object|null|undefined>} null: already replied the error; undefined: no target
 */
async function readTarget(msg, textAlt, quotedMsg, commandAlt) {
    if (textAlt) {
        return resolverOrChoose(msg, textAlt, {
            semEmail: `❌ O ${commandAlt} ${commandAlt === '/mute' ? 'silencia' : 'desfaz o silêncio de'} uma pessoa ou um grupo: ` +
                'informe um contato, um grupo ou um número, não um e-mail.'
        });
    }

    const target = await replyTarget(msg, quotedMsg);
    if (quotedMsg && !target) return null;
    if (target?.erro) {
        await msg.reply(target.erro);
        return null;
    }
    return target ?? undefined;
}

async function listAlt(msg) {
    const mutes = await dbAll(
        `SELECT m.*, (SELECT COUNT(*) FROM mute_hits h WHERE h.target_id = m.target_id) AS ignoradas
           FROM mutes m ORDER BY m.id`
    );

    if (!mutes.length) {
        await msg.reply(`🔇 Ninguém silenciado.\n💡 _Ex.: /mute ${EXAMPLES}, ou responda um aviso com /mute._`);
        return;
    }

    const linesAlt = mutes.map((m, i) => `${i + 1}. ${describeTarget(m)} — ${describe(m)}` +
        (m.ignoradas ? ` _(${plural(m.ignoradas, 'aviso ignorado', 'avisos ignorados')})_` : ''));

    await msg.reply(`🔇 *Silenciados* (${mutes.length})\n\n${linesAlt.join('\n')}\n\n` +
        '💡 _Desfaça com /unmute <nº|nome> (ou /unmute -all, todos)._');
}

// Desfaz todos (o /unmute -all e o /mute -rm all)
async function undoAll(msg) {
    const { n } = await dbGet('SELECT COUNT(*) AS n FROM mutes');
    await dbRun('DELETE FROM mutes');
    await msg.reply(`🔊 ${plural(n, 'silenciado removido', 'silenciados removidos')}: os avisos voltam.`);
}

// Undoes no. N of the list
async function undoNumber(msg, valueAlt) {
    const mutes = await dbAll('SELECT * FROM mutes ORDER BY id');
    const m = /^\d+$/.test(valueAlt) ? mutes[Number(valueAlt) - 1] : null;
    if (!m) {
        await msg.reply(`❌ Nº ${valueAlt || '?'} não existe. Veja a lista com /mute`);
        return;
    }

    await dbRun('DELETE FROM mutes WHERE id = ?', [m.id]);
    await msg.reply(`🔊 Os avisos de ${describeTarget(m)} voltam.`);
}

async function cmdMute({ msg, args, quotedMsg }) {
    await dbReady;
    const r = readMuted(args);

    if (r.erro) {
        await msg.reply(`${r.erro}\n\n\`\`\`${getCommandSyntax('/mute')}\`\`\``);
        return;
    }

    // -rm <nº|all>
    if (r.rm !== undefined) {
        if (r.rm.toLowerCase() === 'all') await undoAll(msg);
        else await undoNumber(msg, r.rm);
        return;
    }

    // Without a target and without replying to anything: the list
    if (r.list || (!r.alvo && !quotedMsg && !r.colunas.size)) {
        await listAlt(msg);
        return;
    }

    const destination = await readTarget(msg, r.alvo, quotedMsg, '/mute');
    if (destination === null) return;
    if (!destination) {
        await msg.reply(`❌ Informe quem (${EXAMPLES}), ou responda um aviso com /mute.`);
        return;
    }

    // Only the target (/mute /Grupo L200/, or replying): mutes everything, like -a
    if (!r.colunas.size) COLUMNS.forEach(c => r.colunas.add(c));

    // Muting again adds to what was there
    const beforeAlt = await dbGet('SELECT * FROM mutes WHERE target_id = ?', [destination.id]);
    const flags = Object.fromEntries(COLUMNS.map(c => [c, r.colunas.has(c) || beforeAlt?.[c] ? 1 : 0]));

    await dbRun(
        `INSERT INTO mutes
            (target_id, target_name, is_group, is_community, deleted, edited, status, reaction, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(target_id) DO UPDATE SET
            target_name = excluded.target_name, is_community = excluded.is_community,
            deleted = excluded.deleted, edited = excluded.edited, status = excluded.status,
            reaction = excluded.reaction`,
        [destination.id, destination.nome, destination.grupo ? 1 : 0, destination.comunidade ? 1 : 0,
            flags.deleted, flags.edited, flags.status, flags.reaction, Date.now()]
    );

    await msg.reply(`🔇 *${beforeAlt ? 'Atualizado' : 'Silenciado'}:* ${describeTarget(destination)} — ${describe(flags)}\n` +
        '💡 _Só o aviso some: as mensagens continuam guardadas para o /show. Veja a lista com /mute; desfaça com /unmute._');
}

async function cmdUnmute({ msg, args, opts, quotedMsg }) {
    await dbReady;

    // -all (-a): todos
    if (opts.opt.all) {
        await undoAll(msg);
        return;
    }

    // The list no. (short: a phone has 10 digits or more)
    const textAlt = withoutDelimiters(String(args ?? ''));
    if (/^\d{1,3}$/.test(textAlt)) {
        await undoNumber(msg, textAlt);
        return;
    }

    // Without a target and without replying to anything: the list
    if (!textAlt && !quotedMsg) {
        await listAlt(msg);
        return;
    }

    const destination = await readTarget(msg, textAlt, quotedMsg, '/unmute');
    if (!destination) return;

    const mutes = await dbAll('SELECT * FROM mutes');
    const m = mutes.find(x => idKey(x.target_id) === idKey(destination.id));
    if (!m) {
        await msg.reply(`ℹ️ ${describeTarget(destination)} não está silenciado.\n💡 _Veja a lista com /mute_`);
        return;
    }

    await dbRun('DELETE FROM mutes WHERE id = ?', [m.id]);
    await msg.reply(`🔊 Os avisos de ${describeTarget(m)} voltam.`);
}

module.exports = {
    cmdMute,
    cmdUnmute,
    readMuted
};
