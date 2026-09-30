/*
 * Comando /show e /edit.
 */

const fs = require('fs-extra');

const { client } = require('../cliente');
const { getCommandSyntax } = require('./base');
const { DAY_MS } = require('../constantes');
const { idsDoChatAtual } = require('../contatos');
const { dbAll, dbGet, dbPronto, dbRun } = require('../db');
const { enviarMensagemApagada, isStatus, resolverAutorApagada } = require('../eventos/apagadas');
const { enviarMensagemEditada } = require('../eventos/editadas');
const { printError, printInfo } = require('../log');
const { getSetting } = require('../settings');
const { humanSize, isCaminhoDeMidia } = require('../util/arquivos');
const { esperar, formatarData, paraMs, plural } = require('../util/formatar');

/*
 * /show e /edit: reexibem as mensagens APAGADAS (/show) e EDITADAS (/edit)
 * guardadas no cache, no mesmo formato dos alertas.
 *   /show        → a última apagada deste chat      (/edit: a última editada)
 *   /show -3     → as 3 últimas (máx. setting 'show.max')
 *   /show -3 -pv → envia no SEU privado em vez de expor no chat atual
 *   /show -list  → apagadas e editadas do cache, por chat (o -l dos dois é o mesmo)
 *   /show -flush → remove as apagadas deste chat (no seu privado: de todos os chats)
 *   /show -2 -c 1       → as 2 últimas do chat nº 1 da lista de apagadas do -l
 *   /edit -2 -c zapbot  → as 2 últimas editadas do chat cujo nome contém "zapbot"
 *   /edit -f -c 1       → flush só das editadas do chat nº 1
 * Envia em ordem cronológica: a última enviada é a mais recente.
 */
// O que muda entre as apagadas (/show) e as editadas (/edit)
const TIPOS_CACHE = {
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
 * Numeração do último -l (índice → chat_id), uma por tipo.
 * Guardamos o snapshot porque a ordem da lista muda a cada nova mensagem
 * apagada/editada: sem ele, "chat 2" poderia apontar para outro chat entre o -l e o -c.
 */
const ultimaListaDeChats = { apagadas: [], editadas: [] };

// Chats com mensagens do tipo, na mesma ordem do -l
function consultarChatsDoCache(tipo) {
    const t = TIPOS_CACHE[tipo];

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

const nomeDoChat = (c) => c.chat_name || c.chat_id.split('@')[0];

/**
 * Resolve o valor do -c para um chat:
 *   número → posição na lista do tipo no último -l
 *   texto  → busca pelo nome (sem diferenciar maiúsculas)
 * @returns {Promise<{ids: string[], nome: string} | {erro: string}>}
 */
async function resolverChatAlvo(tipo, valor) {
    const t = TIPOS_CACHE[tipo];
    const chats = await consultarChatsDoCache(tipo);

    if (!chats.length) {
        return { erro: `${t.icone} Nenhuma mensagem ${t.singular} no cache.` };
    }

    // Por número
    if (/^\d+$/.test(valor)) {
        const indice = Number(valor);
        const lista = ultimaListaDeChats[tipo].length ? ultimaListaDeChats[tipo] : chats.map(c => c.chat_id);
        const chatId = lista[indice - 1];
        const chat = chats.find(c => c.chat_id === chatId);

        if (!chat) {
            return { erro: `❌ Chat nº ${indice} não existe (ou não tem mais ${t.plural}). Rode ${t.cmd} -l para ver a lista atual.` };
        }

        return { ids: [chat.chat_id], nome: nomeDoChat(chat) };
    }

    // Por nome
    const busca = valor.toLowerCase();
    const encontrados = chats.filter(c => nomeDoChat(c).toLowerCase().includes(busca));
    const exato = encontrados.find(c => nomeDoChat(c).toLowerCase() === busca);

    if (exato || encontrados.length === 1) {
        const chat = exato || encontrados[0];
        return { ids: [chat.chat_id], nome: nomeDoChat(chat) };
    }

    if (!encontrados.length) {
        return { erro: `❌ Nenhum chat com ${t.plural} contém "${valor}". Rode ${t.cmd} -l para ver a lista.` };
    }

    return {
        erro: `🔎 "${valor}" corresponde a ${encontrados.length} chats. Seja mais específico ou use o número:\n` +
              encontrados.map(c => `• ${nomeDoChat(c)}`).join('\n')
    };
}

/*
 * /show -list e /edit -list (a mesma lista nos dois)
 * Apagadas e editadas guardadas no cache, de todos os chats, cada tipo com a
 * sua numeração (a do /show -c e a do /edit -c). O chat onde o comando foi
 * executado vem marcado. Use -pv para receber no privado.
 */
async function listarCache({ msg, opts, chatId }) {
    await dbPronto;

    const meuId = client.info.wid._serialized;
    const idsDoChat = await idsDoChatAtual(chatId);
    const noPrivadoDoDono = idsDoChat.includes(meuId);
    const LIMITE = 10;

    const linha = (c, i) => {
        const icone = c.is_group ? '👥' : '👤';
        const atual = idsDoChat.includes(c.chat_id) ? ' ← _este chat_' : '';
        return `${i + 1}. ${icone} ${nomeDoChat(c)} — *${c.total}* _(última ${formatarData(c.ultima)})_${atual}\n`;
    };

    let texto = '🗄️ *Mensagens no cache*\n';
    let algum = false;

    for (const [tipo, t] of Object.entries(TIPOS_CACHE)) {
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
            detalhes.push(`a mais antiga expira em ${dias} dia${dias === 1 ? '' : 's'}`);
        }

        texto += `\n${t.iconeLista} *${t.rotulo}:* ${resumo.total}`;
        texto += detalhes.length ? ` _(${detalhes.join(' · ')})_\n` : '\n';

        if (!resumo.total) {
            ultimaListaDeChats[tipo] = [];
            continue;
        }

        algum = true;

        const porChat = await consultarChatsDoCache(tipo);
        ultimaListaDeChats[tipo] = porChat.map(c => c.chat_id);

        porChat.slice(0, LIMITE).forEach((c, i) => { texto += linha(c, i); });

        if (porChat.length > LIMITE) {
            texto += `_+${porChat.length - LIMITE} chat(s)_\n`;

            // O chat atual fora do top: aparece mesmo assim, com o nº para o -c
            const i = porChat.findIndex(c => idsDoChat.includes(c.chat_id));
            if (i >= LIMITE) texto += linha(porChat[i], i);
        }
    }

    texto += `\n💡 _/show -N reexibe as deletadas e /edit -N as editadas deste chat (máx. ${getSetting('show.max')})._`;

    if (algum) {
        texto += '\n💡 _Junte -c <nº ou nome> para outro chat: o nº é o da lista do tipo (/show -c 2, /edit -c 1)._' +
                 '\n💡 _-pv envia no seu privado; -f remove do cache as deste chat (no seu privado: de todos)._';
    }

    if (opts.opt.pv && !noPrivadoDoDono) {
        await msg.reply('🗄️ Resumo enviado no seu privado.');
        await client.sendMessage(meuId, texto);
    } else {
        await msg.reply(texto);
    }
}

/*
 * /show -flush e /edit -flush
 * Remove do cache as mensagens do tipo (as apagadas levam junto os arquivos de mídia):
 *   - num chat qualquer      → só as DESTE chat;
 *   - no seu próprio privado → as de TODOS os chats.
 * Destrutivo: só o dono do bot executa, mesmo que o comando seja liberado no config.
 */
async function limparDoCache({ msg, chatId, tipo, alvo = null }) {
    const t = TIPOS_CACHE[tipo];

    if (!msg.fromMe) {
        await msg.reply(`⛔ Só o dono do bot pode usar ${t.cmd} -flush.`);
        return;
    }

    await dbPronto;

    const meuId = client.info.wid._serialized;
    // Com -c, o alvo é o chat escolhido; sem ele, o chat atual
    const idsDoChat = alvo ? alvo.ids : await idsDoChatAtual(chatId);
    const geral = !alvo && idsDoChat.includes(meuId);

    // Filtro: todas do tipo (privado do dono) ou só as do chat alvo
    const filtro = geral
        ? t.filtro
        : `${t.filtro} AND chat_id IN (${idsDoChat.map(() => '?').join(', ')})`;
    const params = geral ? [] : idsDoChat;

    // Levanta o que vai sair ANTES de apagar, para a mensagem de resumo
    const porChat = await dbAll(
        `SELECT chat_id,
                MAX(chat_name) AS chat_name,
                MAX(is_group) AS is_group,
                COUNT(*) AS total
           FROM ${t.tabela}
          WHERE ${filtro}
          GROUP BY chat_id
          ORDER BY total DESC`,
        params
    );

    const total = porChat.reduce((soma, c) => soma + c.total, 0);

    if (!total) {
        await msg.reply(geral
            ? `${t.icone} Nenhuma mensagem ${t.singular} no cache.`
            : `${t.icone} Nenhuma mensagem ${t.singular} registrada neste chat.`);
        return;
    }

    // Apaga as mídias do disco
    let arquivos = 0;
    let bytes = 0;

    if (t.comMidia) {
        const midias = await dbAll(`SELECT media_path FROM ${t.tabela} WHERE ${filtro} AND media_path IS NOT NULL`, params);

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

    // Apaga as linhas do banco
    const res = await dbRun(`DELETE FROM ${t.tabela} WHERE ${filtro}`, params);

    printInfo(`${t.cmd} -flush (${geral ? 'geral' : chatId}): ${res.changes} mensagens ${t.plural}${t.comMidia ? ` e ${arquivos} arquivos` : ''} removidos`);

    let texto = geral
        ? `🧹 *Flush geral das mensagens ${t.plural}*\n\n`
        : alvo
            ? `🧹 *Flush das mensagens ${t.plural} de:* ${alvo.nome}\n\n`
            : `🧹 *Flush das mensagens ${t.plural} deste chat*\n\n`;

    texto += `🗄️ Removidas: *${plural(res.changes, 'mensagem', 'mensagens')}*`;
    texto += geral ? ` de *${plural(porChat.length, 'chat', 'chats')}*\n` : '\n';

    if (t.comMidia) {
        texto += `📎 Mídias apagadas do disco: *${arquivos}*${arquivos ? ` _(${humanSize(bytes)})_` : ''}\n`;
    }

    if (geral) {
        const LIMITE = 10;

        texto += '\n*Por chat:*\n';
        porChat.slice(0, LIMITE).forEach((c, i) => {
            const icone = c.is_group ? '👥' : '👤';
            texto += `${i + 1}. ${icone} ${nomeDoChat(c)} — *${c.total}*\n`;
        });

        if (porChat.length > LIMITE) {
            texto += `_+${porChat.length - LIMITE} chat(s)_\n`;
        }
    } else if (!alvo) {
        texto += `\n💡 _Para limpar as ${t.plural} de todos os chats, use ${t.cmd} -f no seu privado._`;
    }

    await msg.reply(texto);
}

// Reenvio de um item do /show ou do /edit
const REENVIO_CACHE = {
    apagadas: async (destino, row, i, total) => {
        const info = await resolverAutorApagada(row);

        await enviarMensagemApagada(destino, row, info, {
            titulo: `${isStatus(row) ? '📸 *STATUS APAGADO*' : '❌ *MENSAGEM APAGADA*'} (${i + 1}/${total})`,
            extras: [`🗑️ *Apagada em:* ${formatarData(row.revoked_at)}`]
        });
    },
    editadas: async (destino, row, i, total) => {
        await enviarMensagemEditada(destino, row, {
            nomeChat: row.chat_name || 'Conversa desconhecida',
            nomeRemetente: row.sender_name || 'Desconhecido',
            numeroRemetente: row.sender_number || null
        }, { titulo: `✏️ *MENSAGEM EDITADA* (${i + 1}/${total})` });
    }
};

// Parte comum do /show e do /edit
async function reexibirDoCache(tipo, { msg, opts, chatId }) {
    const t = TIPOS_CACHE[tipo];

    // -c <nº|nome>: escolhe outro chat (vale em qualquer chat; use -pv para não expor aqui)
    let alvo = null;

    if (opts.opt.chat) {
        await dbPronto;
        alvo = await resolverChatAlvo(tipo, String(opts.opt.chat));

        if (alvo.erro) {
            await msg.reply(alvo.erro);
            return;
        }
    }

    if (opts.opt.flush) {
        await limparDoCache({ msg, chatId, tipo, alvo });
        return;
    }

    if (opts.opt.list) {
        await listarCache({ msg, opts, chatId });
        return;
    }

    // "-3" não é uma opção declarada, então o parser o coloca em argv (assim como "3")
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

    let aviso = '';
    const max = getSetting('show.max');
    if (n > max) {
        aviso = `\n_(limitado a ${max} por vez)_`;
        n = max;
    }

    const idsDoChat = alvo ? alvo.ids : await idsDoChatAtual(chatId);

    await dbPronto;

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
        // No privado, sem -c, quase sempre a intenção era ver outro chat
        const noMeuPrivado = !alvo && idsDoChat.includes(client.info.wid._serialized);

        await msg.reply(noMeuPrivado
            ? `${t.icone} Nenhuma mensagem ${t.singular} neste chat.\n💡 _Para ver as de outro chat: ${t.cmd} -l e depois ${t.cmd} -N -c <nº ou nome>._`
            : `${t.icone} Nenhuma mensagem ${t.singular} registrada neste chat.`);
        return;
    }

    // Busca as mais recentes, exibe da mais antiga para a mais recente
    rows.reverse();

    const destino = opts.opt.pv ? client.info.wid._serialized : chatId;
    const faltaram = n > rows.length ? ` (pedidas ${n}, encontradas ${rows.length})` : '';
    let resumo = `${t.icone} *${rows.length} mensage${rows.length === 1 ? `m ${t.singular}` : `ns ${t.plural}`}*${faltaram}${aviso}`;

    if (alvo) {
        resumo += `\n💬 *Chat:* ${alvo.nome}`;
    }

    if (opts.opt.pv) {
        // O resumo (com o nome do chat) vai só para o privado
        await msg.reply(`${t.icone} Enviado no seu privado.`);
        await client.sendMessage(destino, alvo ? resumo : `${resumo}\n💬 *Chat:* ${rows[0].chat_name || chatId}`);
    } else {
        await msg.reply(resumo);
    }

    for (const [i, row] of rows.entries()) {
        try {
            await REENVIO_CACHE[tipo](destino, row, i, rows.length);
        } catch (err) {
            printError(`${t.cmd}: falha ao reenviar ${row.id}:`, err.message);
            await client.sendMessage(destino, `⚠️ Não consegui reenviar a mensagem ${i + 1}/${rows.length}: ${err.message}`);
        }

        if (i < rows.length - 1) await esperar(getSetting('show.delayMs'));
    }
}

async function cmdUndo(ctx) {
    await reexibirDoCache('apagadas', ctx);
}

async function cmdEdit(ctx) {
    await reexibirDoCache('editadas', ctx);
}

module.exports = {
    cmdEdit,
    cmdUndo
};
