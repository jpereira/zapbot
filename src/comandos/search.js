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

async function cmdSearch({ msg, opts, chatId }) {
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
        (achadas.length >= n ? '\n\n💡 _Pode haver mais: use -N para ver mais (ex.: /search -30 <texto>)._' : ''),
    null, { linkPreview: false });
}

module.exports = {
    cmdSearch
};
