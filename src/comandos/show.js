/*
 * Comando /show: mensagens apagadas, editadas, status apagados e reações removidas ou trocadas.
 */

const fs = require('fs-extra');

const { client, concluirAviso } = require('../cliente');
const { getCommandSyntax } = require('./base');
const { DAY_MS } = require('../constantes');
const { idsDoChatAtual } = require('../contatos');
const { dbAll, dbGet, dbPronto, dbRun } = require('../db');
const { resolverDestino } = require('../destinos');
const { aguardarEscolha, autorDe } = require('../escolhas');
const { enviarMensagemApagada, isStatus, resolverAutorApagada } = require('../eventos/apagadas');
const { enviarMensagemEditada } = require('../eventos/editadas');
const { enviarReacaoDesfeita } = require('../eventos/reacoes');
const { t: tr } = require('../i18n');
const { printError, printInfo } = require('../log');
const { getSetting } = require('../settings');
const { humanSize, isCaminhoDeMidia } = require('../util/arquivos');
const { contar } = require('../util/contar');
const { esperar, formatarData, paraMs, semAcentos } = require('../util/formatar');
const { ehCanal } = require('../util/origem');
const { regexPerigosa } = require('../util/regexSeguro');
const { compilarBusca } = require('../watch/regras');

/*
 * /show [-N] [-d] [-e] [-s] [-r] [chat]: reexibe o que está no cache, no
 * mesmo formato dos alertas: as APAGADAS (-d), as EDITADAS (-e), os STATUS
 * apagados (-s) e as REAÇÕES removidas ou trocadas (-r), que se somam. Sem
 * nenhum dos quatro: com chat (ou na busca em todos), tudo junto, por data;
 * senão, só as apagadas deste chat.
 *   /show              → no privado, lista o cache; no grupo, a última apagada
 *   /show -3           → as 3 últimas
 *   /show -2 /^Maria/ → as 2 últimas (apagada, editada ou status) do chat que casa
 *   /show -e Trabalho  → a última editada do chat com "Trabalho" no nome
 *   /show 2            → a última do chat nº 2 do último -l
 *   /show -list        → os chats com algo no cache
 *   /show -l trab      → só os chats que casam (nº, nome, @menção ou /regex/)
 *   /show -flush       → remove as apagadas deste chat (no seu privado: de todos os chats)
 *   /show -q pix       → as que têm "pix" (sem diferenciar maiúsculas/acentos;
 *                        ou /regex/flags: -q /pix|boleto/i);
 *                        neste chat, no chat pedido ou, no seu privado, em todos.
 *                        Sem -N: as 5 mais recentes
 * O chat: o nº da lista do -l, parte do nome, @menção ou /regex/. Num privado,
 * os status são os da pessoa. Envia em ordem cronológica: a última é a mais recente.
 * Quem tem um id @lid e um @c.us pode aparecer duas vezes no -l (é a mesma
 * pessoa, só que com crise de identidade).
 */
const BUSCA_PADRAO = 5;
const STATUS = 'status@broadcast';

// O que muda entre as apagadas (-d), as editadas (-e), os status (-s) e as reações (-r)
const TIPOS = {
    apagadas: {
        chave: 'apagadas',
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
        iconeLista: '🗑️'
    },
    editadas: {
        chave: 'editadas',
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
        iconeLista: '✏️'
    },
    status: {
        chave: 'status',
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
        iconeLista: '📸'
    },
    reacoes: {
        chave: 'reacoes',
        opt: 'reaction',
        flag: '-r',
        tabela: 'reaction_changes',
        filtro: '1 = 1',
        doChat: 'chat_id',
        nome: 'chat_name',
        grupo: 'is_group',
        quando: 'changed_at',
        ordem: 'changed_at DESC, id DESC',
        retencao: 'cache.reactionRetentionDays',
        comMidia: false,
        textos: (r) => [r.old_reaction, r.new_reaction, r.body],
        icone: '😶',
        iconeLista: '😶'
    }
};

// Vários tipos juntos: o que muda nos textos
const JUNTOS = { chave: 'juntos', icone: '🗄️' };

// Os textos de um tipo (ou do JUNTOS): show.<chave>.<campo>
const tx = (tipo, campo, vars) => tr(`show.${tipo.chave}.${campo}`, vars);

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
                ${Object.keys(TIPOS).map(tipo => `SUM(tipo = '${tipo}') AS ${tipo},`).join('\n                ')}
                COUNT(*) AS total,
                MAX(quando) AS ultima
           FROM (${partes.join(' UNION ALL ')})
          WHERE chat_id IS NOT NULL
          GROUP BY chat_id
          ORDER BY total DESC, ultima DESC`
    );
}

const nomeDoChat = (c) => c.chat_name || c.chat_id.split('@')[0];
const descreverChat = (c) => `${ehCanal(c.chat_id) ? '📰' : c.is_group ? '👥' : '👤'} ${nomeDoChat(c)}`;
// Como o semAcentos, mas sem mexer nas maiúsculas: \D e \d são coisas bem diferentes numa regex
const tirarAcentos = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const paraAlvo = async (c) => ({ ids: await idsDoChatAtual(c.chat_id), nome: nomeDoChat(c) });

/**
 * Os chats do cache que casam com o texto: @menção, o nº da lista do último
 * -l, /regex/ ou o nome (todas as palavras), sem diferenciar maiúsculas nem
 * acentos. Responde o erro quando nenhum casa.
 * @returns {Promise<{ casam: object[], exato?: object, mencao?: object } | null>} null: já respondeu
 */
async function chatsQueCasam(msg, texto, chats, { numero = true } = {}) {
    if (/^@\d+$/.test(texto)) {
        const r = await resolverDestino(texto, { mencoes: msg.mentionedIds ?? [] });
        if (r.erro) {
            await msg.reply(r.erro);
            return null;
        }
        const ids = await idsDoChatAtual(r.id);
        return { casam: chats.filter(c => ids.includes(c.chat_id)), mencao: { ids, nome: r.nome } };
    }

    if (numero && /^\d+$/.test(texto)) {
        const lista = ultimaListaDeChats.length ? ultimaListaDeChats : chats.map(c => c.chat_id);
        const chat = chats.find(c => c.chat_id === lista[Number(texto) - 1]);
        if (!chat) {
            await msg.reply(tr('show.chatNotFound', { n: texto }));
            return null;
        }
        return { casam: [chat], exato: chat };
    }

    let casam;
    let exato;
    const regex = texto.match(/^\/(.+)\/$/);

    if (regex) {
        if (regexPerigosa(regex[1])) {
            await msg.reply(tr('show.regexRisky', { text: texto }));
            return null;
        }
        let re;
        try {
            re = new RegExp(tirarAcentos(regex[1]), 'i');
        } catch (err) {
            await msg.reply(tr('show.regexInvalid', { text: texto, error: err.message }));
            return null;
        }
        casam = chats.filter(c => re.test(tirarAcentos(nomeDoChat(c))));
    } else {
        // "@Maria Lucia" digitado, sem escolher na lista do @: vale o nome
        const palavras = semAcentos(texto.replace(/^@/, '')).split(/\s+/).filter(Boolean);
        casam = chats.filter(c => palavras.every(p => semAcentos(nomeDoChat(c)).includes(p)));
        exato = casam.find(c => semAcentos(nomeDoChat(c)) === palavras.join(' '));
    }

    if (!casam.length) {
        await msg.reply(tr('show.noChatMatches', { text: texto }));
        return null;
    }
    return { casam, exato };
}

/**
 * O chat pedido (veja o chatsQueCasam; o nome exato ganha).
 * Vários: lista e espera o nº, como no /stats.
 * `chats` troca a lista de onde buscar (o /tldr usa os chats com mensagens guardadas, sem o nº do -l).
 * @returns {Promise<{ ids: string[], nome: string } | null>} null: já respondeu
 */
async function resolverAlvo(msg, texto, { chats: seusChats } = {}) {
    // A menção vale mesmo sem nada no cache: a resposta diz que não há nada dela
    const chats = seusChats ?? await chatsDoCache();
    if (!chats.length && !/^@\d+$/.test(texto)) {
        await msg.reply(tr('show.cacheEmpty'));
        return null;
    }

    const r = await chatsQueCasam(msg, texto, chats, { numero: !seusChats });
    if (!r) return null;
    if (r.mencao) return r.mencao;

    const { casam, exato } = r;
    if (exato || casam.length === 1) return paraAlvo(exato ?? casam[0]);

    const opcoes = casam.slice(0, 10);
    const pergunta = await msg.reply(tr('show.multiMatch', { text: texto, count: casam.length }) +
        opcoes.map((c, i) => `${i + 1}. ${descreverChat(c)}`).join('\n') +
        tr('show.multiMatchFooter'));

    const escolhido = await aguardarEscolha(msg.id?.remote ?? msg.from, opcoes, {
        autor: autorDe(msg),
        aoExpirar: () => concluirAviso(msg, pergunta, tr('show.choiceExpired', { text: texto }))
    });
    return escolhido ? paraAlvo(escolhido) : null;
}

/*
 * /show -list [chat] (os tipos não mudam a lista)
 * O que tem no cache, por tipo, e os chats numerados (o nº do /show <nº>),
 * com o chat atual marcado. Com chat (nº, nome, @menção ou /regex/): só os
 * que casam, com o nº da lista completa, e as contas só deles.
 */
async function listarCache({ msg, chatId, filtro }) {
    const idsDoChat = await idsDoChatAtual(chatId);
    const todosOsChats = await chatsDoCache();

    let chats = todosOsChats;
    let ids = null;
    let de = null;
    if (filtro) {
        const r = await chatsQueCasam(msg, filtro, todosOsChats);
        if (!r) return;

        // Com os outros ids da mesma pessoa (@lid e @c.us)
        ids = [...new Set([
            ...(r.mencao?.ids ?? []),
            ...(await Promise.all(r.casam.map(c => idsDoChatAtual(c.chat_id)))).flat()
        ])];
        chats = todosOsChats.filter(c => ids.includes(c.chat_id));
        // Um chat só: o nome dele (o "2" do -l 2 não diz nada); vários: o que foi digitado
        de = r.mencao?.nome ?? (r.casam.length === 1 ? nomeDoChat(r.casam[0]) : filtro);
        if (!chats.length) {
            await msg.reply(tr('show.listNothingOf', { name: de }));
            return;
        }
    }

    let texto = de ? tr('show.listTitleOf', { name: de }) : tr('show.listTitle');

    for (const t of Object.values(TIPOS)) {
        const { where, params } = ondeDo(t, ids);
        const resumo = await dbGet(
            `SELECT COUNT(*) AS total,
                    ${t.comMidia ? 'COALESCE(SUM(has_media), 0)' : '0'} AS com_midia,
                    MIN(${t.quando}) AS mais_antiga
               FROM ${t.tabela}
              WHERE ${where}`,
            params
        );

        const detalhes = [];
        if (resumo.com_midia > 0) detalhes.push(tr('show.withMedia', { count: resumo.com_midia }));

        if (resumo.total > 0 && resumo.mais_antiga) {
            const expiraEm = paraMs(resumo.mais_antiga) + getSetting(t.retencao) * DAY_MS;
            const dias = Math.max(0, Math.ceil((expiraEm - Date.now()) / DAY_MS));
            detalhes.push(tr('show.oldestExpires', { days: contar('show.days', dias) }));
        }

        texto += `${t.iconeLista} *${tx(t, 'label')}:* ${resumo.total}`;
        texto += detalhes.length ? ` _(${detalhes.join(' · ')})_\n` : '\n';
    }

    // A numeração é sempre a da lista completa: o /show <nº> vale com ou sem filtro
    ultimaListaDeChats = todosOsChats.map(c => c.chat_id);

    const linha = (c) => {
        const contas = Object.entries(TIPOS)
            .filter(([tipo]) => c[tipo] > 0)
            .map(([tipo, t]) => `${t.iconeLista} ${c[tipo]}`)
            .join(' · ');
        const atual = idsDoChat.includes(c.chat_id) ? tr('show.thisChat') : '';
        const n = ultimaListaDeChats.indexOf(c.chat_id) + 1;
        return tr('show.listLine', { n, chat: descreverChat(c), counts: contas, date: formatarData(c.ultima), current: atual });
    };

    if (chats.length) {
        texto += '\n';
        chats.forEach((c) => { texto += linha(c); });

        texto += tr('show.listHint', { max: getSetting('show.max') });
    }

    await msg.reply(texto);
}

/*
 * /show -flush: remove do cache os tipos pedidos (as mídias saem do disco junto):
 *   - com chat (/show -f Trabalho) → só as dele;
 *   - num chat qualquer            → só as DESTE chat;
 *   - no seu próprio privado       → as de TODOS os chats.
 * Destrutivo: o -flush é do dono e dos admins (role no comandos.js), mesmo que o /show seja liberado.
 */
async function limparDoCache({ msg, tipos, alvo, ids, geral, cmd }) {
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
            ? tr('show.noneAll', { icon: u.icone, none: tx(u, 'none') })
            : alvo
                ? tr('show.noneOf', { icon: u.icone, none: tx(u, 'none'), name: alvo.nome })
                : tr('show.noneHere', { icon: u.icone, none: tx(u, 'none'), registered: tx(u, 'registered') }));
        return;
    }

    const contas = removidas.map(r => `${r.n} ${tx(r.t, 'label').toLowerCase()}`).join(', ');
    printInfo(`/show -flush (${geral ? 'geral' : alvo?.nome ?? ids[0]}): ${contas}; ${arquivos} arquivos removidos`);

    let texto = geral
        ? tr('show.flushAll')
        : alvo
            ? tr('show.flushOf', { name: alvo.nome })
            : tr('show.flushHere');

    for (const { t, n } of removidas) {
        texto += `${t.iconeLista} ${tx(t, 'label')}: *${contar(`show.${t.chave}.count`, n)}*\n`;
    }

    if (removidas.some(r => r.t.comMidia)) {
        texto += tr('show.flushMedia', { count: arquivos, size: arquivos ? ` _(${humanSize(bytes)})_` : '' });
    }

    if (geral) {
        const LIMITE = 10;
        const chats = [...porChat.values()].sort((a, b) => b.total - a.total);

        texto += tr('show.flushPerChat', { count: chats.length });
        chats.slice(0, LIMITE).forEach((c, i) => {
            texto += `${i + 1}. ${descreverChat(c)} — *${c.total}*\n`;
        });
        if (chats.length > LIMITE) texto += tr('show.flushMore', { count: chats.length - LIMITE });
    } else if (!alvo) {
        texto += tr('show.flushHint', { cmd });
    }

    await msg.reply(texto);
}

// Reenvio de um item, conforme o tipo (o status é uma apagada com título próprio)
async function reenviarApagada(destino, row, i, total) {
    const info = await resolverAutorApagada(row);

    await enviarMensagemApagada(destino, row, info, {
        titulo: tr(isStatus(row) ? 'show.deletedStatusTitle' : 'show.deletedTitle', { i: i + 1, total }),
        extras: [tr('show.deletedAt', { date: formatarData(row.revoked_at) })]
    });
}

const REENVIO_CACHE = {
    apagadas: reenviarApagada,
    status: reenviarApagada,
    editadas: async (destino, row, i, total) => {
        await enviarMensagemEditada(destino, row, {
            nomeChat: row.chat_name || tr('show.unknownChat'),
            nomeRemetente: row.sender_name || tr('show.unknownSender'),
            numeroRemetente: row.sender_number || null
        }, { titulo: tr('show.editedTitle', { i: i + 1, total }) });
    },
    reacoes: (destino, row, i, total) => enviarReacaoDesfeita(destino, row, { contagem: `${i + 1}/${total}` })
};

// "♻️ *2 mensagens apagadas*" (um tipo) ou "🗄️ *3 mensagens* (🗑️ 2 · 📸 1)" (vários)
function resumoDosItens(tipos, rows) {
    if (tipos.length === 1) {
        const t = TIPOS[tipos[0]];
        return `${t.icone} *${contar(`show.${t.chave}.summary`, rows.length)}*`;
    }

    const contas = Object.entries(TIPOS)
        .map(([tipo, t]) => [t, rows.filter(r => r._tipo === tipo).length])
        .filter(([, n]) => n)
        .map(([t, n]) => `${t.iconeLista} ${n}`);
    const total = contar('show.juntos.summary', rows.length);
    return `${JUNTOS.icone} *${total}* (${contas.join(' · ')})`;
}

async function cmdShow({ msg, opts, chatId, admin }) {
    await dbPronto;

    const sintaxe = () => msg.reply('```' + getCommandSyntax('/show') + '```');

    // O "-3" é o opts.numero (o parser lê); o resto do argv é o chat
    let n = opts.numero;
    if (n === 0) return sintaxe();
    const palavras = opts.argv.filter(Boolean);

    const pedidos = Object.keys(TIPOS).filter(tipo => opts.opt[TIPOS[tipo].opt]);
    const cmd = ['/show', ...pedidos.map(tipo => TIPOS[tipo].flag)].join(' ');

    // -q <texto|/regex/flags>: busca nos tipos pedidos; não combina com -f e -l
    const busca = opts.given.has('query') ? String(opts.opt.query ?? '').trim() : null;
    if (busca !== null && (!busca || opts.opt.flush || opts.opt.list)) {
        await msg.reply(busca
            ? tr('show.queryNoCombine')
            : tr('show.queryEmpty', { cmd }));
        return;
    }
    let casa = null;
    if (busca !== null) {
        try {
            casa = compilarBusca(busca);
        } catch (err) {
            await msg.reply(tr('show.queryInvalid', { error: err.message }));
            return;
        }
    }

    const privadoSemParametros = /@(c\.us|lid)$/.test(chatId) &&
        !opts.given.size && !opts.argv.length;
    // Quem recebeu o /show vê só o chat atual: sem a lista do privado (o -l e o chat já passaram pelo executar.js)
    if (opts.opt.list || (privadoSemParametros && admin)) {
        await listarCache({ msg, chatId, filtro: palavras.join(' ') || null });
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

    // Sem -d/-e/-s/-r: com chat (ou em todos), tudo junto; senão, só as apagadas
    const tipos = pedidos.length ? pedidos : alvo || todos ? Object.keys(TIPOS) : ['apagadas'];

    if (opts.opt.flush) {
        await limparDoCache({ msg, tipos, alvo, ids, geral: noMeuPrivado, cmd });
        return;
    }
    const u = tipos.length === 1 ? TIPOS[tipos[0]] : JUNTOS;

    n ??= busca ? BUSCA_PADRAO : 1;

    let aviso = '';
    const max = getSetting('show.max');
    if (n > max) {
        aviso = tr('show.limited', { max });
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

        rows.push(...(casa ? doTipo.filter(r => t.textos(r).some(casa)) : doTipo));
    }

    rows.sort((a, b) => paraMs(b._quando) - paraMs(a._quando));
    const encontradas = rows.length;
    rows = rows.slice(0, n);

    if (!rows.length) {
        const onde = todos ? tr('show.whereNone') : alvo ? tr('show.whereChat', { name: alvo.nome }) : tr('show.whereHere');

        // No privado, sem chat, quase sempre a intenção era ver outro chat
        await msg.reply(busca
            ? tr('show.noneWithQuery', { icon: u.icone, none: tx(u, 'none'), query: busca, where: onde })
            : alvo || todos
                ? tr('show.noneWhere', { icon: u.icone, none: tx(u, 'none'), where: onde })
                : noMeuPrivado
                    ? tr('show.noneOtherChat', { icon: u.icone, none: tx(u, 'none'), cmd })
                    : tr('show.noneHere', { icon: u.icone, none: tx(u, 'none'), registered: tx(u, 'registered') }));
        return;
    }

    // Busca as mais recentes, exibe da mais antiga para a mais recente
    rows.reverse();

    const faltaram = !busca && n > rows.length ? tr('show.missing', { n, found: rows.length }) : '';
    let resumo = `${resumoDosItens(tipos, rows)}${faltaram}${aviso}`;

    if (busca) {
        resumo += tr('show.withQuery', { query: busca }) + (encontradas > rows.length ? tr('show.queryMore', { shown: rows.length, found: encontradas }) : '');
    }

    if (todos) resumo += tr('show.allChats');
    if (alvo) resumo += tr(alvo.ids.every(ehCanal) ? 'show.channelLabel' : 'show.chatLabel', { name: alvo.nome });

    await msg.reply(resumo);

    for (const [i, row] of rows.entries()) {
        try {
            await REENVIO_CACHE[row._tipo](chatId, row, i, rows.length);
        } catch (err) {
            printError(`/show: falha ao reenviar ${row.id}:`, err.message);
            await client.sendMessage(chatId, tr('show.resendFailed', { i: i + 1, total: rows.length, error: err.message }));
        }

        if (i < rows.length - 1) await esperar(getSetting('show.delayMs'));
    }
}

module.exports = {
    cmdShow,
    resolverAlvo
};
