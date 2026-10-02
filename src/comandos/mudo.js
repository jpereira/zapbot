/*
 * Comando /mudo.
 */

const { client } = require('../cliente');
const { getCommandSyntax } = require('./base');
const { dbAll, dbGet, dbPronto, dbRun } = require('../db');
const { descreverDestino, resolverOuEscolher } = require('../destinos');
const { TIPOS } = require('../mudo');
const { plural } = require('../util/formatar');

/*
 * /mudo <opção> </contato ou grupo/|+número>
 *   -d (-deleted)  silencia os avisos de mensagens apagadas
 *   -e (-edited)   silencia os avisos de edições
 *   -s (-status)   silencia os avisos de status apagados
 *   -a (-all)      tudo isso
 * As opções se combinam (-d -e); só o alvo, sem opção, é o -a. O alvo é buscado
 * como no -to: primeiro nos contatos, depois nos grupos (vários: você escolhe na
 * lista), ou um número.
 * Silenciar de novo o mesmo alvo soma ao que já estava. Sem nada, lista;
 * -rm <nº|all> desfaz.
 */
const OPCOES = {
    d: 'deleted', deleted: 'deleted',
    e: 'edited', edited: 'edited',
    s: 'status', status: 'status',
    a: 'all', all: 'all'
};
const COLUNAS = ['deleted', 'edited', 'status'];
const ROTULO = Object.fromEntries(Object.values(TIPOS).map(t => [t.coluna, t.rotulo]));

const descrever = (m) => COLUNAS.filter(c => m[c]).map(c => ROTULO[c]).join(', ');

/**
 * "-d -e /Grupo L200/" → { colunas, alvo }. As opções vêm antes do alvo.
 * @returns {{ colunas: Set<string>, alvo: string, rm?: string, list?: boolean } | { erro: string }}
 */
function lerMudo(args) {
    const r = { colunas: new Set(), alvo: '' };
    let resto = String(args ?? '').trim();

    for (;;) {
        const m = resto.match(/^-(\w+)(?:\s+|$)/);
        if (!m) break;

        const nome = m[1].toLowerCase();
        resto = resto.slice(m[0].length);

        if (nome === 'rm') {
            const v = resto.match(/^(\S+)/);
            r.rm = v ? v[1] : '';
            resto = resto.slice(v ? v[0].length : 0).trim();
        } else if (nome === 'l' || nome === 'list') {
            r.list = true;
        } else if (OPCOES[nome] === 'all') {
            COLUNAS.forEach(c => r.colunas.add(c));
        } else if (OPCOES[nome]) {
            r.colunas.add(OPCOES[nome]);
        } else {
            return { erro: `❌ Opção desconhecida: -${nome}` };
        }
    }

    // O alvo: /nome com espaço/, "entre aspas" ou o resto como veio
    r.alvo = resto.trim().replace(/^\/(.*)\/$/s, '$1').replace(/^(["'])(.*)\1$/s, '$2').trim();
    return r;
}

async function listar(msg) {
    const mutes = await dbAll(
        `SELECT m.*, (SELECT COUNT(*) FROM mute_hits h WHERE h.target_id = m.target_id) AS ignoradas
           FROM mutes m ORDER BY m.id`
    );

    if (!mutes.length) {
        await msg.reply('🔇 Ninguém silenciado.\n💡 _Ex.: /mudo /Jorge Pereira/, /mudo /Grupo L200/ ou /mudo -s +5521999999999_');
        return;
    }

    const linhas = mutes.map((m, i) => `${i + 1}. ${descreverDestino({ nome: m.target_name, grupo: m.is_group })} — ${descrever(m)}` +
        (m.ignoradas ? ` _(${plural(m.ignoradas, 'aviso ignorado', 'avisos ignorados')})_` : ''));

    await msg.reply(`🔇 *Silenciados* (${mutes.length})\n\n${linhas.join('\n')}\n\n💡 _Desfaça com /mudo -rm <nº|all>._`);
}

async function cmdMudo({ msg, args }) {
    await dbPronto;
    const r = lerMudo(args);

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
        await msg.reply(`🔊 Os avisos de ${descreverDestino({ nome: m.target_name, grupo: m.is_group })} voltam.`);
        return;
    }

    if (r.list || (!r.alvo && !r.colunas.size)) {
        await listar(msg);
        return;
    }

    if (!r.alvo) {
        await msg.reply('❌ Informe quem: um contato, um grupo ou um número (/Jorge Pereira/, /Grupo L200/ ou +5521999999999).');
        return;
    }

    // Só o alvo (/mudo /Grupo L200/): silencia tudo, como o -a
    if (!r.colunas.size) COLUNAS.forEach(c => r.colunas.add(c));

    // Vários contatos ou grupos com o nome: espera você escolher na lista
    const destino = await resolverOuEscolher(msg, r.alvo, {
        semEmail: '❌ O /mudo silencia uma pessoa ou um grupo: informe um contato, um grupo ou um número, não um e-mail.'
    });
    if (!destino) return;

    if (destino.id === client.info.wid._serialized) {
        await msg.reply('❌ As suas mensagens já não geram avisos.');
        return;
    }

    // Silenciar de novo soma ao que já estava
    const antes = await dbGet('SELECT * FROM mutes WHERE target_id = ?', [destino.id]);
    const flags = Object.fromEntries(COLUNAS.map(c => [c, r.colunas.has(c) || Boolean(antes?.[c]) ? 1 : 0]));

    await dbRun(
        `INSERT INTO mutes (target_id, target_name, is_group, deleted, edited, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(target_id) DO UPDATE SET
            target_name = excluded.target_name, deleted = excluded.deleted,
            edited = excluded.edited, status = excluded.status`,
        [destino.id, destino.nome, destino.grupo ? 1 : 0, flags.deleted, flags.edited, flags.status, Date.now()]
    );

    await msg.reply(`🔇 *${antes ? 'Atualizado' : 'Silenciado'}:* ${descreverDestino(destino)} — ${descrever(flags)}\n` +
        '💡 _Só o aviso some: as mensagens continuam guardadas para o /show. Veja a lista com /mudo._');
}

module.exports = {
    cmdMudo,
    lerMudo
};
