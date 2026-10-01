/*
 * Comando /mudo.
 */

const { client } = require('../client');
const { getCommandSyntax } = require('./base');
const { dbAll, dbGet, dbReady, dbRun } = require('../db');
const { describeDestination, resolverOrChoose } = require('../destinations');
const { TYPES } = require('../mudo');
const { plural } = require('../util/format');

/*
 * /mudo <option> </contact or group/|+number>
 * -d (-deleted)  mutes the deleted message notices
 * -e (-edited)   mutes the edit notices
 * -s (-status)   mutes the deleted status notices
 * -a (-all)      all of that
 * The options combine (-d -e). The target is looked up as in -to: first in the
 * contacts, then in the groups (several: you choose from the list), or a number.
 * Muting the same target again adds to what was there. Without anything, lists;
 * -rm <nº|all> desfaz.
 */
const OPTIONS = {
    d: 'deleted', deleted: 'deleted',
    e: 'edited', edited: 'edited',
    s: 'status', status: 'status',
    a: 'all', all: 'all'
};
const COLUMNS = ['deleted', 'edited', 'status'];
const LABEL = Object.fromEntries(Object.values(TYPES).map(t => [t.coluna, t.rotulo]));

const describe = (m) => COLUMNS.filter(c => m[c]).map(c => LABEL[c]).join(', ');

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
    r.alvo = rest.trim().replace(/^\/(.*)\/$/s, '$1').replace(/^(["'])(.*)\1$/s, '$2').trim();
    return r;
}

async function listAlt(msg) {
    const mutes = await dbAll(
        `SELECT m.*, (SELECT COUNT(*) FROM mute_hits h WHERE h.target_id = m.target_id) AS ignoradas
           FROM mutes m ORDER BY m.id`
    );

    if (!mutes.length) {
        await msg.reply('🔇 Ninguém silenciado.\n💡 _Ex.: /mudo -a /Jorge Pereira/, /mudo -a /Grupo L200/ ou /mudo -s +5521999999999_');
        return;
    }

    const linesAlt = mutes.map((m, i) => `${i + 1}. ${describeDestination({ nome: m.target_name, grupo: m.is_group })} — ${describe(m)}` +
        (m.ignoradas ? ` _(${plural(m.ignoradas, 'aviso ignorado', 'avisos ignorados')})_` : ''));

    await msg.reply(`🔇 *Silenciados* (${mutes.length})\n\n${linesAlt.join('\n')}\n\n💡 _Desfaça com /mudo -rm <nº|all>._`);
}

async function cmdMuted({ msg, args }) {
    await dbReady;
    const r = readMuted(args);

    if (r.erro) {
        await msg.reply(`${r.erro}\n\n\`\`\`${getCommandSyntax('/mudo')}\`\`\``);
        return;
    }

    // -rm <nº|all>
    if (r.rm !== undefined) {
        const mutes = await dbAll('SELECT * FROM mutes ORDER BY id');

        if (r.rm.toLowerCase() === 'all') {
            await dbRun('DELETE FROM mutes');
            await msg.reply(`🔊 ${plural(mutes.length, 'silenciado removido', 'silenciados removidos')}: os avisos voltam.`);
            return;
        }

        const m = /^\d+$/.test(r.rm) ? mutes[Number(r.rm) - 1] : null;
        if (!m) {
            await msg.reply(`❌ Nº ${r.rm || '?'} não existe. Veja a lista com /mudo`);
            return;
        }

        await dbRun('DELETE FROM mutes WHERE id = ?', [m.id]);
        await msg.reply(`🔊 Os avisos de ${describeDestination({ nome: m.target_name, grupo: m.is_group })} voltam.`);
        return;
    }

    if (r.list || (!r.alvo && !r.colunas.size)) {
        await listAlt(msg);
        return;
    }

    if (!r.colunas.size) {
        await msg.reply('❌ Escolha o que silenciar: -d (apagadas), -e (editadas), -s (status) ou -a (tudo).\n💡 _Ex.: /mudo -a /Grupo L200/_');
        return;
    }
    if (!r.alvo) {
        await msg.reply('❌ Informe quem: um contato, um grupo ou um número (/Jorge Pereira/, /Grupo L200/ ou +5521999999999).');
        return;
    }

    // Several contacts or groups with the name: waits for you to choose from the list
    const destination = await resolverOrChoose(msg, r.alvo, {
        semEmail: '❌ O /mudo silencia uma pessoa ou um grupo: informe um contato, um grupo ou um número, não um e-mail.'
    });
    if (!destination) return;

    if (destination.id === client.info.wid._serialized) {
        await msg.reply('❌ As suas mensagens já não geram avisos.');
        return;
    }

    // Muting again adds to what was there
    const beforeAlt = await dbGet('SELECT * FROM mutes WHERE target_id = ?', [destination.id]);
    const flags = Object.fromEntries(COLUMNS.map(c => [c, r.colunas.has(c) || Boolean(beforeAlt?.[c]) ? 1 : 0]));

    await dbRun(
        `INSERT INTO mutes (target_id, target_name, is_group, deleted, edited, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(target_id) DO UPDATE SET
            target_name = excluded.target_name, deleted = excluded.deleted,
            edited = excluded.edited, status = excluded.status`,
        [destination.id, destination.nome, destination.grupo ? 1 : 0, flags.deleted, flags.edited, flags.status, Date.now()]
    );

    await msg.reply(`🔇 *${beforeAlt ? 'Atualizado' : 'Silenciado'}:* ${describeDestination(destination)} — ${describe(flags)}\n` +
        '💡 _Só o aviso some: as mensagens continuam guardadas para o /show. Veja a lista com /mudo._');
}

module.exports = {
    cmdMuted,
    readMuted
};
