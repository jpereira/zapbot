/*
 * Comando /search (/buscar): busca no histórico do WhatsApp (não só no cache do bot).
 */

const { client } = require('../cliente');
const { getCommandSyntax } = require('./base');
const { idsDoChatAtual } = require('../contatos');
const { printError } = require('../log');
const { formatarData, paraMs, plural } = require('../util/formatar');

/*
 * /search [-N] <texto>
 * A busca do próprio WhatsApp Web (client.searchMessages): as mensagens que o
 * WhatsApp Web tem, inclusive as que nunca passaram pelo cache do bot. Neste
 * chat; no seu privado, em todos os chats. Sem -N, as 10 mais recentes.
 *
 * /search -read|-r <id>
 * Exibe inteira a mensagem de um id da lista da busca (mesmo escopo da busca).
 */
const PADRAO = 10;
const MAXIMO = 50;
const TRECHO = 200;

// "Fulano" de um id, sem repetir a consulta para o mesmo id
async function nomeDe(id, cache) {
    if (!cache.has(id)) {
        cache.set(id, client.getContactById(id)
            .then(c => c.name || c.pushname || id.split('@')[0])
            .catch(() => id.split('@')[0]));
    }
    return cache.get(id);
}

async function nomeDoChat(id, cache) {
    if (!cache.has(id)) {
        cache.set(id, client.getChatById(id).then(c => c.name || id.split('@')[0]).catch(() => id.split('@')[0]));
    }
    return cache.get(id);
}

// O texto da mensagem (a legenda, numa mídia), numa linha e curto
function trechoDe(m) {
    const texto = String(m.body ?? '').replace(/\s+/g, ' ').trim();
    const curto = texto.length > TRECHO ? `${texto.slice(0, TRECHO)}…` : texto;
    return m.hasMedia ? `📎 _[${m.type}]_${curto ? ` "${curto}"` : ''}` : `"${curto}"`;
}

// -read <id>: a mensagem inteira, sem cortar o texto
async function lerMensagem({ msg, id, chatId, todos }) {
    let achada;
    try {
        achada = await client.getMessageById(id);
    } catch (err) {
        printError(`/search -read "${id}":`, err.message);
        await msg.reply(`⚠️ Não consegui ler a mensagem: ${err.message}`);
        return;
    }

    // Fora do seu privado, só as mensagens deste chat
    if (!achada || (!todos && (achada.id?.remote ?? achada.from) !== chatId)) {
        await msg.reply(`🔎 Mensagem "${id}" não encontrada ${todos ? 'em nenhum chat' : 'neste chat'}.`);
        return;
    }

    const quem = achada.fromMe ? 'Você' : await nomeDe(achada.author || achada.from, new Map());
    const chat = todos ? ` · 💬 ${await nomeDoChat(achada.id?.remote ?? achada.from, new Map())}` : '';
    const texto = String(achada.body ?? '').trim();
    const midia = achada.hasMedia ? `📎 _[${achada.type}]_${texto ? '\n' : ''}` : '';

    await msg.reply(`📅 ${formatarData(achada.timestamp)}${chat} · 👤 ${quem}\n\n${midia}${texto}`,
        null, { linkPreview: false });
}

async function cmdSearch({ msg, opts, chatId }) {
    const idLido = opts.opt.read;
    if (idLido) {
        const todos = (await idsDoChatAtual(chatId)).includes(client.info.wid._serialized);
        await lerMensagem({ msg, id: String(idLido).trim(), chatId, todos });
        return;
    }

    // "-20" não é uma opção declarada: vem no argv, junto com o texto
    let n = null;
    const palavras = [];
    for (const a of opts.argv.filter(Boolean)) {
        const m = a.match(/^-(\d+)$/);
        if (m && n === null && Number(m[1]) >= 1) n = Number(m[1]);
        else palavras.push(a);
    }

    const texto = palavras.join(' ').trim();
    if (!texto) {
        await msg.reply('```' + getCommandSyntax('/search') + '```');
        return;
    }

    let aviso = '';
    n ??= PADRAO;
    if (n > MAXIMO) {
        aviso = `\n_(limitado a ${MAXIMO} por vez)_`;
        n = MAXIMO;
    }

    // No seu privado, todos os chats; nos outros, só este
    const todos = (await idsDoChatAtual(chatId)).includes(client.info.wid._serialized);

    let achadas;
    try {
        achadas = await client.searchMessages(texto, { page: 1, limit: n, ...(todos ? {} : { chatId }) });
    } catch (err) {
        printError(`/search "${texto}":`, err.message);
        await msg.reply(`⚠️ A busca do WhatsApp falhou: ${err.message}`);
        return;
    }

    // A própria mensagem do /search também tem o texto
    achadas = achadas.filter(m => m.id?._serialized !== msg.id?._serialized);
    const onde = todos ? 'em nenhum chat' : 'neste chat';
    if (!achadas.length) {
        await msg.reply(`🔎 Nada com "${texto}" ${onde}.`);
        return;
    }

    achadas.sort((a, b) => paraMs(b.timestamp) - paraMs(a.timestamp));

    const nomes = new Map();
    const chats = new Map();
    const linhas = await Promise.all(achadas.map(async (m, i) => {
        const quem = m.fromMe ? 'Você' : await nomeDe(m.author || m.from, nomes);
        const chat = todos ? ` · 💬 ${await nomeDoChat(m.id?.remote ?? m.from, chats)}` : '';
        return `${i + 1}. 📅 ${formatarData(m.timestamp)}${chat} · 👤 ${quem}\n   ${trechoDe(m)}` +
            `\n   🆔 ${m.id?._serialized}`;
    }));

    await msg.reply(`🔎 *${plural(achadas.length, 'mensagem', 'mensagens')} com* "${texto}"` +
        `${todos ? ' _(todos os chats)_' : ''}${aviso}\n\n${linhas.join('\n\n')}` +
        (achadas.length >= n ? '\n\n💡 _Pode haver mais: use -N para ver mais (ex.: /search -30 <texto>)._' : '') +
        '\n\n📖 _Para ler uma inteira: /search -read <id>._',
    null, { linkPreview: false });
}

module.exports = {
    cmdSearch
};
