/*
 * Comandos no texto do /cron: "O Bitcoin agora: {/crypto BTC}". Na hora do
 * envio, cada {/comando args} roda e a resposta dele entra no lugar.
 */

const { client } = require('./cliente');
const { activeCommands, findCommand } = require('./comandos/base');
const { printError } = require('./log');
const { GetOptFromCommand } = require('./opcoes');

/*
 * Só os comandos com "cron": true no comandos.json (os de consulta), e sem as
 * opções com "cron": false (as que mudam algo, como o -add do /crypto). O
 * comando roda como se você digitasse no chat de destino, mas as respostas são
 * guardadas em vez de enviadas: o texto vai no lugar do {...} e as mídias
 * (/meme, /giphy...) saem depois da mensagem.
 */
const MARCA = /\{(\/[^{}\n]+)\}/g;

const comandosNoTexto = (texto) => [...String(texto ?? '').matchAll(MARCA)].map(m => ({ marca: m[0], linha: m[1].trim() }));

const permitidos = () => activeCommands().filter(c => c.cron).map(c => c.cmd);

// "/crypto BTC" → { command, args, opts }, ou { erro }
function lerComando(linha) {
    const caller = linha.split(/\s+/, 1)[0].toLowerCase();
    const command = findCommand(caller);

    if (!command) return { erro: `❌ {${linha}}: o ${caller} não existe.` };
    if (!command.cron) {
        return { erro: `❌ {${linha}}: o ${command.cmd} não roda dentro do /cron.\n💡 _Rodam: ${permitidos().join(', ')}._` };
    }

    const args = linha.slice(caller.length).trim();
    const opts = GetOptFromCommand(args, command);
    const proibida = (command.cmd_opts ?? []).find(o => o.cron === false && o.opts?.some(nome => opts.given.has(nome)));
    if (proibida) return { erro: `❌ {${linha}}: o -${proibida.opts[0]} do ${command.cmd} não roda dentro do /cron.` };

    return { command, args, opts };
}

/**
 * Confere os {/comando} do texto ao criar ou editar o item.
 * @returns {string|null} o erro (do primeiro inválido) ou null
 */
function erroDosComandos(texto) {
    for (const { linha } of comandosNoTexto(texto)) {
        const { erro } = lerComando(linha);
        if (erro) return erro;
    }
    return null;
}

// Mensagem "digitada" por você no chat, com o reply guardando as respostas
function mensagemSintetica(chatId, linha, respostas) {
    const meuId = client.info.wid._serialized;
    const id = `CRON_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return {
        id: { id, remote: chatId, fromMe: true, _serialized: `true_${chatId}_${id}` },
        from: meuId,
        to: chatId,
        fromMe: true,
        body: linha,
        type: 'chat',
        timestamp: Math.floor(Date.now() / 1000),
        hasMedia: false,
        hasQuotedMsg: false,
        links: [],
        mentionedIds: [],
        _data: {},
        async reply(content, _chatId, options = {}) {
            respostas.push({ content, options });
        },
        getChat: () => client.getChatById(chatId),
        getContact: () => client.getContactById(meuId),
        async getQuotedMessage() { return null; },
        async downloadMedia() { return null; }
    };
}

// Roda um {/comando}: o texto das respostas e as mídias
async function rodarComando(chatId, linha, { chatName, isGroup }) {
    const { erro, command, args, opts } = lerComando(linha);
    if (erro) return { texto: `⚠️ ${linha.split(/\s+/, 1)[0]} não roda no /cron`, midias: [] };

    // O handler fica no comandos/index, que carrega o /cron (e este arquivo): só aqui, na hora
    const { HANDLERS } = require('./comandos/index');
    const respostas = [];
    const msg = mensagemSintetica(chatId, linha, respostas);

    try {
        await HANDLERS[command.cmd]({
            msg, opts, args, quotedMsg: null, senderContact: null, senderName: client.info?.pushname || 'Você',
            isGroup, chatId, chatName, admin: true
        });
    } catch (err) {
        printError(`/cron: ${linha} falhou:`, err.message);
        return { texto: `⚠️ ${command.cmd} falhou`, midias: [] };
    }

    const textos = respostas.filter(r => typeof r.content === 'string').map(r => r.content.trim());
    const midias = respostas.filter(r => typeof r.content !== 'string');
    return { texto: textos.join('\n'), midias };
}

/*
 * Põe a resposta no lugar da marca. Uma de várias linhas (o /crypto, o /tempo...)
 * vira um parágrafo: uma linha em branco antes e depois dela, para não colar no
 * texto em volta. Uma de uma linha só fica no meio da frase, como veio.
 */
function encaixar(texto, marca, resposta) {
    const i = texto.indexOf(marca);
    let antes = texto.slice(0, i);
    let depois = texto.slice(i + marca.length);

    if (resposta.includes('\n')) {
        antes = antes.replace(/[ \t]+$/, '');
        if (antes && !antes.endsWith('\n\n')) antes += antes.endsWith('\n') ? '\n' : '\n\n';
        depois = depois.replace(/^[ \t]+/, '');
        if (depois && !depois.startsWith('\n\n')) depois = (depois.startsWith('\n') ? '\n' : '\n\n') + depois;
    }
    return antes + resposta + depois;
}

/**
 * O texto com cada {/comando} trocado pela resposta dele, as mídias das respostas
 * e os comandos executados (para o log). Sem {/comando}, o texto como está.
 */
async function montarTexto(texto, s) {
    const comandos = comandosNoTexto(texto);
    if (!comandos.length) return { texto, midias: [], comandos: [] };

    const ctx = { chatName: s.chat_name, isGroup: Boolean(s.is_group) };
    const midias = [];
    let final = texto;

    for (const { marca, linha } of comandos) {
        const r = await rodarComando(s.chat_id, linha, ctx);
        final = encaixar(final, marca, r.texto);
        midias.push(...r.midias);
    }

    return { texto: final.trim(), midias, comandos: comandos.map(c => c.linha) };
}

// Envia as mídias guardadas, na ordem, no chat
async function enviarMidias(chatId, midias) {
    for (const { content, options } of midias) {
        // Sem citar: a mensagem sintética do comando não existe no WhatsApp
        const opcoes = { ...options };
        delete opcoes.quotedMessageId;
        await client.sendMessage(chatId, content, opcoes);
    }
}

module.exports = {
    comandosNoTexto,
    enviarMidias,
    erroDosComandos,
    montarTexto,
    permitidos
};
