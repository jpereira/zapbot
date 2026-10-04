/*
 * Comandos /mute e /unmute.
 */

const { client } = require('../cliente');
const { getCommandSyntax } = require('./base');
const { resolveLidToPhone, resolverNomeDoGrupo } = require('../contatos');
const { dbAll, dbGet, dbPronto, dbRun } = require('../db');
const { descreverDestino, resolverOuEscolher } = require('../destinos');
const { TIPOS, chaveDoId, origemDoAviso } = require('../mudo');
const { plural } = require('../util/formatar');

/*
 * /mute (/mudo, /m) <opção> </contato ou grupo/|@menção|+número>
 *   -d (-deleted)  silencia os avisos de mensagens apagadas
 *   -e (-edited)   silencia os avisos de edições
 *   -s (-status)   silencia os avisos de status apagados
 *   -a (-all)      tudo isso
 * As opções se combinam (-d -e); só o alvo, sem opção, é o -a. O alvo é buscado
 * como no -to: primeiro nos contatos, depois nos grupos (vários: você escolhe na
 * lista), ou um número. Respondendo um aviso (apagada, editada, status), o alvo
 * é de onde ele veio: a pessoa (privado e status), o grupo ou a comunidade.
 * Silenciar de novo o mesmo alvo soma ao que já estava. Sem nada, lista;
 * -rm <nº|all> desfaz (o mesmo do /unmute).
 *
 * /unmute <alvo|nº>  → desfaz o silêncio (o alvo como no /mute, ou o nº da lista)
 * /unmute -all (-a)  → desfaz todos
 */
const OPCOES = {
    d: 'deleted', deleted: 'deleted',
    e: 'edited', edited: 'edited',
    s: 'status', status: 'status',
    a: 'all', all: 'all'
};
const COLUNAS = ['deleted', 'edited', 'status'];
const ROTULO = Object.fromEntries(Object.values(TIPOS).map(t => [t.coluna, t.rotulo]));
const EXEMPLOS = '/Jorge Pereira/, /Grupo L200/ ou +5521999999999';

const descrever = (m) => COLUNAS.filter(c => m[c]).map(c => ROTULO[c]).join(', ');

// "🏘️ Comunidade", "👥 Grupo" ou "👤 Pessoa"
function descreverAlvo(alvo) {
    const nome = alvo.nome ?? alvo.target_name;
    if (alvo.comunidade || alvo.is_community) return `🏘️ ${nome}`;
    return descreverDestino({ nome, grupo: alvo.grupo ?? alvo.is_group });
}

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
    r.alvo = semDelimitadores(resto);
    return r;
}

// "/Grupo L200/" ou "'Grupo L200'" → "Grupo L200"
const semDelimitadores = (texto) => texto.trim()
    .replace(/^\/(.*)\/$/s, '$1')
    .replace(/^(["'])(.*)\1$/s, '$2')
    .trim();

// Uma pessoa pelo telefone (ou o id, sem ele): o nome salvo, o do perfil ou o número
async function pessoa(remetente) {
    const id = /^\d+$/.test(remetente) ? `${remetente}@c.us` : remetente;
    const contato = await client.getContactById(id).catch(() => null);
    const nome = contato?.name || contato?.pushname || `+${id.split('@')[0]}`;
    return { id, nome, grupo: false };
}

// Um grupo; o grupo de avisos de uma comunidade vira a comunidade
async function grupo(chatId) {
    const chat = await client.getChatById(chatId).catch(() => null);
    const meta = chat?.groupMetadata ?? {};
    const nome = await resolverNomeDoGrupo(chatId).catch(() => null) || chat?.name || chatId;
    const comunidade = Boolean(meta.isParentGroup || meta.defaultSubgroup);
    return { id: chatId, nome, grupo: true, comunidade };
}

/**
 * Respondendo uma mensagem: de onde ela veio. Um aviso do bot (apagada,
 * editada, status, o /show): a pessoa (privado e status), o grupo ou a
 * comunidade. Um aviso antigo, sem a origem guardada: a pessoa do "📱 Número".
 * A mensagem de alguém: essa pessoa.
 * @returns {Promise<object|{ erro: string }|null>} null: não respondeu nada
 */
async function alvoDaResposta(quotedMsg) {
    if (!quotedMsg) return null;

    const origem = await origemDoAviso(quotedMsg.id?.id);
    if (origem) {
        return origem.chat_id.endsWith('@g.us') ? grupo(origem.chat_id) : pessoa(origem.sender || origem.chat_id);
    }

    const numero = String(quotedMsg.body ?? '').match(/📱 \*?Número:\*? \+(\d{10,15})/)?.[1];
    if (numero) return pessoa(numero);

    if (!quotedMsg.fromMe) {
        const autor = quotedMsg.author || quotedMsg.from;
        const telefone = autor?.endsWith('@lid') ? await resolveLidToPhone(autor) : autor;
        if (telefone) return pessoa(telefone.split('@')[0]);
    }
    return { erro: `❌ Não sei de quem é essa mensagem: responda um aviso (apagada, editada, status) ou informe quem: ${EXEMPLOS}.` };
}

/**
 * O alvo: o do texto (buscado como no -to) ou, sem ele, o da mensagem respondida.
 * @returns {Promise<object|null|undefined>} null: já respondeu o erro; undefined: nenhum alvo
 */
async function lerAlvo(msg, texto, quotedMsg, comando) {
    if (texto) {
        return resolverOuEscolher(msg, texto, {
            semEmail: `❌ O ${comando} ${comando === '/mute' ? 'silencia' : 'desfaz o silêncio de'} uma pessoa ou um grupo: ` +
                'informe um contato, um grupo ou um número, não um e-mail.'
        });
    }

    const alvo = await alvoDaResposta(quotedMsg);
    if (alvo?.erro) {
        await msg.reply(alvo.erro);
        return null;
    }
    return alvo ?? undefined;
}

async function listar(msg) {
    const mutes = await dbAll(
        `SELECT m.*, (SELECT COUNT(*) FROM mute_hits h WHERE h.target_id = m.target_id) AS ignoradas
           FROM mutes m ORDER BY m.id`
    );

    if (!mutes.length) {
        await msg.reply(`🔇 Ninguém silenciado.\n💡 _Ex.: /mute ${EXEMPLOS}, ou responda um aviso com /mute._`);
        return;
    }

    const linhas = mutes.map((m, i) => `${i + 1}. ${descreverAlvo(m)} — ${descrever(m)}` +
        (m.ignoradas ? ` _(${plural(m.ignoradas, 'aviso ignorado', 'avisos ignorados')})_` : ''));

    await msg.reply(`🔇 *Silenciados* (${mutes.length})\n\n${linhas.join('\n')}\n\n` +
        '💡 _Desfaça com /unmute <nº|nome> (ou /unmute -all, todos)._');
}

// Desfaz todos (o /unmute -all e o /mute -rm all)
async function desfazerTodos(msg) {
    const { n } = await dbGet('SELECT COUNT(*) AS n FROM mutes');
    await dbRun('DELETE FROM mutes');
    await msg.reply(`🔊 ${plural(n, 'silenciado removido', 'silenciados removidos')}: os avisos voltam.`);
}

// Desfaz o nº N da lista
async function desfazerNumero(msg, valor) {
    const mutes = await dbAll('SELECT * FROM mutes ORDER BY id');
    const m = /^\d+$/.test(valor) ? mutes[Number(valor) - 1] : null;
    if (!m) {
        await msg.reply(`❌ Nº ${valor || '?'} não existe. Veja a lista com /mute`);
        return;
    }

    await dbRun('DELETE FROM mutes WHERE id = ?', [m.id]);
    await msg.reply(`🔊 Os avisos de ${descreverAlvo(m)} voltam.`);
}

async function cmdMute({ msg, args, quotedMsg }) {
    await dbPronto;
    const r = lerMudo(args);

    if (r.erro) {
        await msg.reply(`${r.erro}\n\n\`\`\`${getCommandSyntax('/mute')}\`\`\``);
        return;
    }

    // -rm <nº|all>
    if (r.rm !== undefined) {
        if (r.rm.toLowerCase() === 'all') await desfazerTodos(msg);
        else await desfazerNumero(msg, r.rm);
        return;
    }

    // Sem alvo e sem responder nada: a lista
    if (r.list || (!r.alvo && !quotedMsg && !r.colunas.size)) {
        await listar(msg);
        return;
    }

    const destino = await lerAlvo(msg, r.alvo, quotedMsg, '/mute');
    if (destino === null) return;
    if (!destino) {
        await msg.reply(`❌ Informe quem (${EXEMPLOS}), ou responda um aviso com /mute.`);
        return;
    }

    if (destino.id === client.info.wid._serialized) {
        await msg.reply('❌ As suas mensagens já não geram avisos.');
        return;
    }

    // Só o alvo (/mute /Grupo L200/, ou respondendo): silencia tudo, como o -a
    if (!r.colunas.size) COLUNAS.forEach(c => r.colunas.add(c));

    // Silenciar de novo soma ao que já estava
    const antes = await dbGet('SELECT * FROM mutes WHERE target_id = ?', [destino.id]);
    const flags = Object.fromEntries(COLUNAS.map(c => [c, r.colunas.has(c) || antes?.[c] ? 1 : 0]));

    await dbRun(
        `INSERT INTO mutes
            (target_id, target_name, is_group, is_community, deleted, edited, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(target_id) DO UPDATE SET
            target_name = excluded.target_name, is_community = excluded.is_community,
            deleted = excluded.deleted, edited = excluded.edited, status = excluded.status`,
        [destino.id, destino.nome, destino.grupo ? 1 : 0, destino.comunidade ? 1 : 0,
            flags.deleted, flags.edited, flags.status, Date.now()]
    );

    await msg.reply(`🔇 *${antes ? 'Atualizado' : 'Silenciado'}:* ${descreverAlvo(destino)} — ${descrever(flags)}\n` +
        '💡 _Só o aviso some: as mensagens continuam guardadas para o /show. Veja a lista com /mute; desfaça com /unmute._');
}

async function cmdUnmute({ msg, args, opts, quotedMsg }) {
    await dbPronto;

    // -all (-a): todos
    if (opts.opt.all) {
        await desfazerTodos(msg);
        return;
    }

    // O nº da lista (curto: um telefone tem 10 dígitos ou mais)
    const texto = semDelimitadores(String(args ?? ''));
    if (/^\d{1,3}$/.test(texto)) {
        await desfazerNumero(msg, texto);
        return;
    }

    // Sem alvo e sem responder nada: a lista
    if (!texto && !quotedMsg) {
        await listar(msg);
        return;
    }

    const destino = await lerAlvo(msg, texto, quotedMsg, '/unmute');
    if (!destino) return;

    const mutes = await dbAll('SELECT * FROM mutes');
    const m = mutes.find(x => chaveDoId(x.target_id) === chaveDoId(destino.id));
    if (!m) {
        await msg.reply(`ℹ️ ${descreverAlvo(destino)} não está silenciado.\n💡 _Veja a lista com /mute_`);
        return;
    }

    await dbRun('DELETE FROM mutes WHERE id = ?', [m.id]);
    await msg.reply(`🔊 Os avisos de ${descreverAlvo(m)} voltam.`);
}

module.exports = {
    cmdMute,
    cmdUnmute,
    lerMudo
};
