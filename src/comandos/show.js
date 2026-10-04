/*
 * Comando /show: mensagens apagadas, editadas e status apagados.
 */

const fs = require('fs-extra');

const { client } = require('../cliente');
const { getCommandSyntax } = require('./base');
const { DAY_MS } = require('../constantes');
const { idsDoChatAtual } = require('../contatos');
const { dbAll, dbGet, dbPronto, dbRun } = require('../db');
const { resolverDestino } = require('../destinos');
const { aguardarEscolha, autorDe } = require('../escolhas');
const { enviarMensagemApagada, isStatus, resolverAutorApagada } = require('../eventos/apagadas');
const { enviarMensagemEditada } = require('../eventos/editadas');
const { printError, printInfo } = require('../log');
const { getSetting } = require('../settings');
const { humanSize, isCaminhoDeMidia } = require('../util/arquivos');
const { esperar, formatarData, paraMs, plural, semAcentos } = require('../util/formatar');

/*
 * /show [-N] [-d] [-e] [-s] [chat]: reexibe o que está no cache, no mesmo
 * formato dos alertas: as APAGADAS (-d), as EDITADAS (-e) e os STATUS
 * apagados (-s), que se somam. Sem nenhum dos três: com chat (ou na busca em
 * todos), tudo junto, por data; senão, só as apagadas deste chat.
 *   /show              → a última apagada deste chat
 *   /show -3           → as 3 últimas
 *   /show -2 /^Camila/ → as 2 últimas (apagada, editada ou status) do chat que casa
 *   /show -e Trabalho  → a última editada do chat com "Trabalho" no nome
 *   /show 2            → a última do chat nº 2 do último -l
 *   /show -list        → os chats com algo no cache
 *   /show -flush       → remove as apagadas deste chat (no seu privado: de todos os chats)
 *   /show -q pix       → as que têm "pix" (sem diferenciar maiúsculas/acentos);
 *                        neste chat, no chat pedido ou, no seu privado, em todos.
 *                        Sem -N: as 5 mais recentes
 * O chat: o nº da lista do -l, parte do nome, @menção ou /regex/. Num privado,
 * os status são os da pessoa. Envia em ordem cronológica: a última é a mais recente.
 * Quem tem um id @lid e um @c.us pode aparecer duas vezes no -l (é a mesma
 * pessoa, só que com crise de identidade).
 */
const BUSCA_PADRAO = 5;
const STATUS = 'status@broadcast';

// O que muda entre as apagadas (-d), as editadas (-e) e os status (-s)
const TIPOS = {
    apagadas: {
        opt: 'deleted',
        flag: '-d',
        tabela: 'messages',
        filtro: `revoked = 1 AND chat_id <> '${STATUS}'`,
        doChat: 'chat_id',          // de qual chat é (nos status: de qual pessoa)
        nome: 'chat_name',
        grupo: 'is_group',
        quando: 'revoked_at',
        ordem: 'revoked_at DESC, timestamp DESC',
        retencao: 'cache.revokedRetentionDays',
        comMidia: true,
        textos: (r) => [r.body],
        icone: '♻️',
        iconeLista: '🗑️',
        rotulo: 'Apagadas',
        um: 'mensagem apagada',
        varios: 'mensagens apagadas',
        unidade: ['mensagem', 'mensagens'],
        nenhuma: 'Nenhuma mensagem apagada',
        registrada: 'registrada'
    },
    editadas: {
        opt: 'edited',
        flag: '-e',
        tabela: 'message_edits',
        filtro: '1 = 1',
        doChat: 'chat_id',
        nome: 'chat_name',
        grupo: 'is_group',
        quando: 'edited_at',
        ordem: 'edited_at DESC, id DESC',
        retencao: 'cache.editedRetentionDays',
        comMidia: false,
        textos: (r) => [r.old_body, r.new_body],
        icone: '✏️',
        iconeLista: '✏️',
        rotulo: 'Editadas',
        um: 'mensagem editada',
        varios: 'mensagens editadas',
        unidade: ['mensagem', 'mensagens'],
        nenhuma: 'Nenhuma mensagem editada',
        registrada: 'registrada'
    },
    status: {
        opt: 'status',
        flag: '-s',
        tabela: 'messages',
        filtro: `revoked = 1 AND chat_id = '${STATUS}'`,
        doChat: 'sender_jid',
        nome: 'sender_name',
        grupo: '0',
        quando: 'revoked_at',
        ordem: 'revoked_at DESC, timestamp DESC',
        retencao: 'cache.revokedRetentionDays',
        comMidia: true,
        textos: (r) => [r.body],
        icone: '📸',
        iconeLista: '📸',
        rotulo: 'Status',
        um: 'status apagado',
        varios: 'status apagados',
        unidade: ['status', 'status'],
        nenhuma: 'Nenhum status apagado',
        registrada: 'registrado'
    }
};

// Vários tipos juntos: o que muda nos textos
const JUNTOS = { icone: '🗄️', nenhuma: 'Nada no cache', registrada: 'registrado' };

// O filtro do tipo, só nos ids (null: de todos os chats)
function ondeDo(t, ids) {
    if (!ids) return { where: t.filtro, params: [] };
    const marcas = ids.map(() => '?').join(', ');
    return { where: `${t.filtro} AND ${t.doChat} IN (${marcas})`, params: ids };
}

/*
 * Numeração do último -l (índice → chat_id). Guardamos o snapshot porque a
 * ordem da lista muda a cada mensagem nova no cache: sem ele, o "chat 2"
 * poderia apontar para outro chat entre o -l e o /show 2.
 */
let ultimaListaDeChats = [];

// Os chats com algo no cache (nos status, a pessoa), na ordem do -l
function chatsDoCache() {
    const partes = Object.entries(TIPOS).map(([tipo, t]) =>
        `SELECT ${t.doChat} AS chat_id, ${t.nome} AS chat_name, ${t.grupo} AS is_group,
                '${tipo}' AS tipo, ${t.quando} AS quando
           FROM ${t.tabela}
          WHERE ${t.filtro}`);

    return dbAll(
        `SELECT chat_id,
                MAX(chat_name) AS chat_name,
                MAX(is_group) AS is_group,
                SUM(tipo = 'apagadas') AS apagadas,
                SUM(tipo = 'editadas') AS editadas,
                SUM(tipo = 'status') AS status,
                COUNT(*) AS total,
                MAX(quando) AS ultima
           FROM (${partes.join(' UNION ALL ')})
          WHERE chat_id IS NOT NULL
          GROUP BY chat_id
          ORDER BY total DESC, ultima DESC`
    );
}

const nomeDoChat = (c) => c.chat_name || c.chat_id.split('@')[0];
const descreverChat = (c) => `${c.is_group ? '👥' : '👤'} ${nomeDoChat(c)}`;
// Como o semAcentos, mas sem mexer nas maiúsculas: \D e \d são coisas bem diferentes numa regex
const tirarAcentos = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const paraAlvo = async (c) => ({ ids: await idsDoChatAtual(c.chat_id), nome: nomeDoChat(c) });

/**
 * O chat pedido: @menção, o nº da lista do último -l, /regex/ ou o nome (todas
 * as palavras; o nome exato ganha), sem diferenciar maiúsculas nem acentos.
 * Vários: lista e espera o nº, como no /stats.
 * @returns {Promise<{ ids: string[], nome: string } | null>} null: já respondeu
 */
async function resolverAlvo(msg, texto) {
    if (/^@\d+$/.test(texto)) {
        const r = await resolverDestino(texto, { mencoes: msg.mentionedIds ?? [] });
        if (r.erro) {
            await msg.reply(r.erro);
            return null;
        }
        return { ids: await idsDoChatAtual(r.id), nome: r.nome };
    }

    const chats = await chatsDoCache();
    if (!chats.length) {
        await msg.reply('🗄️ Nada no cache: nenhuma mensagem apagada, editada ou status apagado.');
        return null;
    }

    if (/^\d+$/.test(texto)) {
        const lista = ultimaListaDeChats.length ? ultimaListaDeChats : chats.map(c => c.chat_id);
        const chat = chats.find(c => c.chat_id === lista[Number(texto) - 1]);
        if (!chat) {
            await msg.reply(`❌ Chat nº ${texto} não existe (ou não tem mais nada no cache). Rode /show -l para ver a lista atual.`);
            return null;
        }
        return paraAlvo(chat);
    }

    let casam;
    let exato;
    const regex = texto.match(/^\/(.+)\/$/);

    if (regex) {
        let re;
        try {
            re = new RegExp(tirarAcentos(regex[1]), 'i');
        } catch (err) {
            await msg.reply(`❌ Regex inválida: ${texto} (${err.message}).`);
            return null;
        }
        casam = chats.filter(c => re.test(tirarAcentos(nomeDoChat(c))));
    } else {
        // "@Camila Gama" digitado, sem escolher na lista do @: vale o nome
        const palavras = semAcentos(texto.replace(/^@/, '')).split(/\s+/).filter(Boolean);
        casam = chats.filter(c => palavras.every(p => semAcentos(nomeDoChat(c)).includes(p)));
        exato = casam.find(c => semAcentos(nomeDoChat(c)) === palavras.join(' '));
    }

    if (exato || casam.length === 1) return paraAlvo(exato ?? casam[0]);

    if (!casam.length) {
        await msg.reply(`❌ Nenhum chat no cache casa com "${texto}".\n💡 _Veja os que têm algo com /show -l_`);
        return null;
    }

    const opcoes = casam.slice(0, 10);
    await msg.reply(`🔎 "${texto}" corresponde a ${casam.length} chats:\n\n` +
        opcoes.map((c, i) => `${i + 1}. ${descreverChat(c)}`).join('\n') +
        '\n\n💡 _Responda só com o nº (em até 2 minutos), ou repita o comando com mais do nome._');

    const escolhido = await aguardarEscolha(msg.id?.remote ?? msg.from, opcoes, {
        autor: autorDe(msg),
        aoExpirar: () => msg.reply(`⌛ Nenhum nº escolhido para "${texto}" em 2 minutos: nada foi feito.`)
    });
    return escolhido ? paraAlvo(escolhido) : null;
}

/*
 * /show -list (os tipos não mudam a lista)
 * O que tem no cache, por tipo, e os chats numerados (o nº do /show <nº>),
 * com o chat atual marcado.
 */
async function listarCache({ msg, chatId }) {
    const idsDoChat = await idsDoChatAtual(chatId);
    const LIMITE = 10;

    let texto = '🗄️ *Mensagens no cache*\n\n';

    for (const t of Object.values(TIPOS)) {
        const resumo = await dbGet(
            `SELECT COUNT(*) AS total,
                    ${t.comMidia ? 'COALESCE(SUM(has_media), 0)' : '0'} AS com_midia,
                    MIN(${t.quando}) AS mais_antiga
               FROM ${t.tabela}
              WHERE ${t.filtro}`
        );

        const detalhes = [];
        if (resumo.com_midia > 0) detalhes.push(`${resumo.com_midia} com mídia`);

        if (resumo.total > 0 && resumo.mais_antiga) {
            const expiraEm = paraMs(resumo.mais_antiga) + getSetting(t.retencao) * DAY_MS;
            const dias = Math.max(0, Math.ceil((expiraEm - Date.now()) / DAY_MS));
            detalhes.push(`a mais antiga expira em ${plural(dias, 'dia', 'dias')}`);
        }

        texto += `${t.iconeLista} *${t.rotulo}:* ${resumo.total}`;
        texto += detalhes.length ? ` _(${detalhes.join(' · ')})_\n` : '\n';
    }

    const chats = await chatsDoCache();
    ultimaListaDeChats = chats.map(c => c.chat_id);

    const linha = (c, i) => {
        const contas = Object.entries(TIPOS)
            .filter(([tipo]) => c[tipo] > 0)
            .map(([tipo, t]) => `${t.iconeLista} ${c[tipo]}`)
            .join(' · ');
        const atual = idsDoChat.includes(c.chat_id) ? ' ← _este chat_' : '';
        return `${i + 1}. ${descreverChat(c)} — ${contas} _(última ${formatarData(c.ultima)})_${atual}\n`;
    };

    if (chats.length) {
        texto += '\n';
        chats.slice(0, LIMITE).forEach((c, i) => { texto += linha(c, i); });

        if (chats.length > LIMITE) {
            texto += `_+${chats.length - LIMITE} chat(s)_\n`;

            // O chat atual fora do top: aparece mesmo assim, com o nº
            const i = chats.findIndex(c => idsDoChat.includes(c.chat_id));
            if (i >= LIMITE) texto += linha(chats[i], i);
        }

        texto += `\n💡 _/show <nº, nome, @menção ou /regex/> reexibe as de um chat: apagadas, editadas e status juntos; -d, -e e -s filtram; -N para mais (máx. ${getSetting('show.max')})._` +
                 '\n💡 _-f remove do cache as deste chat (no seu privado: de todos)._';
    }

    await msg.reply(texto);
}

/*
 * /show -flush: remove do cache os tipos pedidos (as mídias saem do disco junto):
 *   - com chat (/show -f Trabalho) → só as dele;
 *   - num chat qualquer            → só as DESTE chat;
 *   - no seu próprio privado       → as de TODOS os chats.
 * Destrutivo: só o dono do bot (ou um admin do bot.admins), mesmo que o /show seja liberado.
 */
async function limparDoCache({ msg, tipos, alvo, ids, geral, admin, cmd }) {
    if (!admin) {
        await msg.reply('⛔ Só o dono do bot (ou um admin) pode usar o /show -flush.');
        return;
    }

    const removidas = [];
    const porChat = new Map();
    let arquivos = 0;
    let bytes = 0;

    for (const tipo of tipos) {
        const t = TIPOS[tipo];
        const { where, params } = ondeDo(t, geral ? null : ids);

        // O que vai sair, por chat, ANTES de apagar: para o resumo do geral
        if (geral) {
            const chats = await dbAll(
                `SELECT ${t.doChat} AS chat_id,
                        MAX(${t.nome}) AS chat_name,
                        MAX(${t.grupo}) AS is_group,
                        COUNT(*) AS total
                   FROM ${t.tabela}
                  WHERE ${where}
                  GROUP BY ${t.doChat}`,
                params
            );
            for (const c of chats) {
                const antes = porChat.get(c.chat_id)?.total ?? 0;
                porChat.set(c.chat_id, { ...c, total: c.total + antes });
            }
        }

        if (t.comMidia) {
            const midias = await dbAll(
                `SELECT media_path FROM ${t.tabela} WHERE ${where} AND media_path IS NOT NULL`, params);

            for (const { media_path } of midias) {
                if (!isCaminhoDeMidia(media_path)) continue;

                try {
                    bytes += fs.statSync(media_path).size;
                    fs.unlinkSync(media_path);
                    arquivos++;
                } catch {
                    // arquivo já não existe
                }
            }
        }

        const res = await dbRun(`DELETE FROM ${t.tabela} WHERE ${where}`, params);
        removidas.push({ t, n: res.changes });
    }

    const total = removidas.reduce((soma, r) => soma + r.n, 0);
    const u = tipos.length === 1 ? TIPOS[tipos[0]] : JUNTOS;

    if (!total) {
        await msg.reply(geral
            ? `${u.icone} ${u.nenhuma} no cache.`
            : alvo
                ? `${u.icone} ${u.nenhuma} de ${alvo.nome}.`
                : `${u.icone} ${u.nenhuma} ${u.registrada} neste chat.`);
        return;
    }

    const contas = removidas.map(r => `${r.n} ${r.t.rotulo.toLowerCase()}`).join(', ');
    printInfo(`/show -flush (${geral ? 'geral' : alvo?.nome ?? ids[0]}): ${contas}; ${arquivos} arquivos removidos`);

    let texto = geral
        ? '🧹 *Flush geral do cache*\n\n'
        : alvo
            ? `🧹 *Flush do cache de:* ${alvo.nome}\n\n`
            : '🧹 *Flush do cache deste chat*\n\n';

    for (const { t, n } of removidas) {
        texto += `${t.iconeLista} ${t.rotulo}: *${plural(n, ...t.unidade)}*\n`;
    }

    if (removidas.some(r => r.t.comMidia)) {
        texto += `📎 Mídias apagadas do disco: *${arquivos}*${arquivos ? ` _(${humanSize(bytes)})_` : ''}\n`;
    }

    if (geral) {
        const LIMITE = 10;
        const chats = [...porChat.values()].sort((a, b) => b.total - a.total);

        texto += `\n*Por chat* (${chats.length}):\n`;
        chats.slice(0, LIMITE).forEach((c, i) => {
            texto += `${i + 1}. ${descreverChat(c)} — *${c.total}*\n`;
        });
        if (chats.length > LIMITE) texto += `_+${chats.length - LIMITE} chat(s)_\n`;
    } else if (!alvo) {
        texto += `\n💡 _Para limpar as de todos os chats, use ${cmd} -f no seu privado._`;
    }

    await msg.reply(texto);
}

// Reenvio de um item, conforme o tipo (o status é uma apagada com título próprio)
async function reenviarApagada(destino, row, i, total) {
    const info = await resolverAutorApagada(row);

    await enviarMensagemApagada(destino, row, info, {
        titulo: `${isStatus(row) ? '📸 *STATUS APAGADO*' : '❌ *MENSAGEM APAGADA*'} (${i + 1}/${total})`,
        extras: [`🗑️ *Apagada em:* ${formatarData(row.revoked_at)}`]
    });
}

const REENVIO_CACHE = {
    apagadas: reenviarApagada,
    status: reenviarApagada,
    editadas: async (destino, row, i, total) => {
        await enviarMensagemEditada(destino, row, {
            nomeChat: row.chat_name || 'Conversa desconhecida',
            nomeRemetente: row.sender_name || 'Desconhecido',
            numeroRemetente: row.sender_number || null
        }, { titulo: `✏️ *MENSAGEM EDITADA* (${i + 1}/${total})` });
    }
};

// "♻️ *2 mensagens apagadas*" (um tipo) ou "🗄️ *3 mensagens* (🗑️ 2 · 📸 1)" (vários)
function resumoDosItens(tipos, rows) {
    if (tipos.length === 1) {
        const t = TIPOS[tipos[0]];
        return `${t.icone} *${plural(rows.length, t.um, t.varios)}*`;
    }

    const contas = Object.entries(TIPOS)
        .map(([tipo, t]) => [t, rows.filter(r => r._tipo === tipo).length])
        .filter(([, n]) => n)
        .map(([t, n]) => `${t.iconeLista} ${n}`);
    const total = plural(rows.length, 'mensagem', 'mensagens');
    return `${JUNTOS.icone} *${total}* (${contas.join(' · ')})`;
}

async function cmdShow({ msg, opts, chatId, admin }) {
    await dbPronto;

    const sintaxe = () => msg.reply('```' + getCommandSyntax('/show') + '```');

    // "-3" não é uma opção declarada: vem no argv, junto com o chat
    let n = null;
    const palavras = [];

    for (const a of opts.argv.filter(Boolean)) {
        const m = a.match(/^-(\d+)$/);
        if (m && n === null && Number(m[1]) >= 1) n = Number(m[1]);
        else if (a.startsWith('-')) return sintaxe();
        else palavras.push(a);
    }

    const pedidos = Object.keys(TIPOS).filter(tipo => opts.opt[TIPOS[tipo].opt]);
    const cmd = ['/show', ...pedidos.map(tipo => TIPOS[tipo].flag)].join(' ');

    // -q <texto>: busca nos tipos pedidos; não combina com -f e -l
    const busca = opts.given.has('query') ? String(opts.opt.query ?? '').trim() : null;
    if (busca !== null && (!busca || opts.opt.flush || opts.opt.list)) {
        await msg.reply(busca
            ? '❌ O -q não combina com o -f nem com o -l.'
            : `❌ Informe o que buscar: ${cmd} -q <texto> (com espaços, entre aspas: -q "bom dia").`);
        return;
    }

    if (opts.opt.list) {
        await listarCache({ msg, chatId });
        return;
    }

    // O chat pedido (vale em qualquer chat)
    let alvo = null;
    if (palavras.length) {
        alvo = await resolverAlvo(msg, palavras.join(' '));
        if (!alvo) return;
    }

    const meuId = client.info.wid._serialized;
    const ids = alvo ? alvo.ids : await idsDoChatAtual(chatId);
    const noMeuPrivado = !alvo && ids.includes(meuId);

    // No seu privado, sem chat: a busca e os status valem para todos os chats
    const todos = noMeuPrivado && !opts.opt.flush && (busca !== null || pedidos.includes('status'));

    // Sem -d/-e/-s: com chat (ou em todos), tudo junto; senão, só as apagadas
    const tipos = pedidos.length ? pedidos : alvo || todos ? Object.keys(TIPOS) : ['apagadas'];

    if (opts.opt.flush) {
        await limparDoCache({ msg, tipos, alvo, ids, geral: noMeuPrivado, admin, cmd });
        return;
    }
    const u = tipos.length === 1 ? TIPOS[tipos[0]] : JUNTOS;

    n ??= busca ? BUSCA_PADRAO : 1;

    let aviso = '';
    const max = getSetting('show.max');
    if (n > max) {
        aviso = `\n_(limitado a ${max} por vez)_`;
        n = max;
    }

    // As mais recentes de cada tipo, depois as mais recentes de todos
    let rows = [];
    for (const tipo of tipos) {
        const t = TIPOS[tipo];
        const { where, params } = ondeDo(t, todos ? null : ids);
        const doTipo = await dbAll(
            `SELECT *, '${tipo}' AS _tipo, ${t.quando} AS _quando
               FROM ${t.tabela}
              WHERE ${where}
              ORDER BY ${t.ordem}
              ${busca ? '' : 'LIMIT ?'}`,
            busca ? params : [...params, n]
        );

        const alvoDaBusca = semAcentos(busca);
        rows.push(...(busca
            ? doTipo.filter(r => t.textos(r).some(texto => semAcentos(texto).includes(alvoDaBusca)))
            : doTipo));
    }

    rows.sort((a, b) => paraMs(b._quando) - paraMs(a._quando));
    const encontradas = rows.length;
    rows = rows.slice(0, n);

    if (!rows.length) {
        const onde = todos ? 'em nenhum chat' : alvo ? `em ${alvo.nome}` : 'neste chat';

        // No privado, sem chat, quase sempre a intenção era ver outro chat
        await msg.reply(busca
            ? `${u.icone} ${u.nenhuma} com "${busca}" ${onde}.`
            : alvo || todos
                ? `${u.icone} ${u.nenhuma} ${onde}.`
                : noMeuPrivado
                    ? `${u.icone} ${u.nenhuma} neste chat.\n💡 _Para ver as de outro chat: /show -l e depois ${cmd} -N <chat>. Para buscar em todos: ${cmd} -q <texto>._`
                    : `${u.icone} ${u.nenhuma} ${u.registrada} neste chat.`);
        return;
    }

    // Busca as mais recentes, exibe da mais antiga para a mais recente
    rows.reverse();

    const faltaram = !busca && n > rows.length ? ` (pedidas ${n}, encontradas ${rows.length})` : '';
    let resumo = `${resumoDosItens(tipos, rows)}${faltaram}${aviso}`;

    if (busca) {
        resumo += ` com "${busca}"` + (encontradas > rows.length ? ` _(as ${rows.length} mais recentes de ${encontradas}; use -N para mais)_` : '');
    }

    if (todos) resumo += '\n💬 *Chats:* todos';
    if (alvo) resumo += `\n💬 *Chat:* ${alvo.nome}`;

    await msg.reply(resumo);

    for (const [i, row] of rows.entries()) {
        try {
            await REENVIO_CACHE[row._tipo](chatId, row, i, rows.length);
        } catch (err) {
            printError(`/show: falha ao reenviar ${row.id}:`, err.message);
            await client.sendMessage(chatId, `⚠️ Não consegui reenviar a mensagem ${i + 1}/${rows.length}: ${err.message}`);
        }

        if (i < rows.length - 1) await esperar(getSetting('show.delayMs'));
    }
}

module.exports = {
    cmdShow
};
