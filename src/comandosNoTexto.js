/*
 * Comandos no texto (o /cron e o /alias): "O Bitcoin agora: {/crypto BTC}".
 * Na hora de montar, cada {/comando args} roda e a resposta dele entra no lugar.
 * O `onde` (ex.: '/cron') só aparece nas mensagens de erro.
 */

const { client } = require('./cliente');
const { activeCommands, findCommand } = require('./comandos/base');
const { printError } = require('./log');
const { GetOptFromCommand } = require('./opcoes');

/*
 * Só os comandos com "cron": true no comandos.json (os de consulta), e sem as
 * opções com "cron": false (as que mudam algo, como o -add do /crypto). O
 * comando roda como se fosse digitado no chat de destino (por você, se não vier
 * quem executa), mas as respostas são guardadas em vez de enviadas: o texto vai
 * no lugar do {...} e as mídias (/meme, /giphy...) saem depois da mensagem.
 */
const MARCA = /\{(\/[^{}\n]+)\}/g;

const comandosNoTexto = (texto) => [...String(texto ?? '').matchAll(MARCA)].map(m => ({ marca: m[0], linha: m[1].trim() }));

/*
 * O "\n" digitado vira uma quebra de linha, sem os espaços em volta: no
 * WhatsApp é mais fácil digitar "Orca {/defi orca}\n Prjx {/defi prjx}" do que
 * quebrar a linha no meio do comando.
 */
const quebrarLinhas = (texto) => String(texto ?? '').replace(/[ \t]*\\n[ \t]*/g, '\n');

const permitidos = () => activeCommands().filter(c => c.cron).map(c => c.cmd);

// "/crypto BTC" → { command, args, opts }, ou { erro }
function lerComando(linha, onde = '/cron') {
    const caller = linha.split(/\s+/, 1)[0].toLowerCase();
    const command = findCommand(caller);

    if (!command) return { erro: `❌ {${linha}}: o ${caller} não existe.` };
    if (!command.cron) {
        return { erro: `❌ {${linha}}: o ${command.cmd} não roda dentro do ${onde}.\n💡 _Rodam: ${permitidos().join(', ')}._` };
    }

    const args = linha.slice(caller.length).trim();
    const opts = GetOptFromCommand(args, command);
    const proibida = (command.cmd_opts ?? []).find(o => o.cron === false && o.opts?.some(nome => opts.given.has(nome)));
    if (proibida) return { erro: `❌ {${linha}}: o -${proibida.opts[0]} do ${command.cmd} não roda dentro do ${onde}.` };

    return { command, args, opts };
}

/**
 * Confere os {/comando} do texto ao criar ou editar (o item do /cron).
 * @returns {string|null} o erro (do primeiro inválido) ou null
 */
function erroDosComandos(texto, onde = '/cron') {
    for (const { linha } of comandosNoTexto(texto)) {
        const { erro } = lerComando(linha, onde);
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

/*
 * Roda um {/comando}: o texto das respostas e as mídias. Sem `quem`, roda como
 * você (admin); com ele, com o admin e as permissões de quem executa.
 */
async function rodarComando(chatId, linha, { chatName, isGroup, onde = '/cron', quem = null }) {
    const { erro, command, args, opts } = lerComando(linha, onde);
    if (erro) return { texto: `⚠️ ${linha.split(/\s+/, 1)[0]} não roda no ${onde}`, midias: [] };

    // O handler fica no comandos/index, que carrega o /cron (e este arquivo): só aqui, na hora
    const { HANDLERS } = require('./comandos/index');
    const respostas = [];
    const msg = mensagemSintetica(chatId, linha, respostas);

    try {
        await HANDLERS[command.cmd]({
            msg, opts, args, quotedMsg: null, senderContact: null, senderName: client.info?.pushname || 'Você',
            isGroup, chatId, chatName, admin: true,
            ...quem
        });
    } catch (err) {
        printError(`${onde}: ${linha} falhou:`, err.message);
        return { texto: `⚠️ ${command.cmd} falhou`, midias: [] };
    }

    const textos = respostas.filter(r => typeof r.content === 'string').map(r => r.content.trim());
    const midias = respostas.filter(r => typeof r.content !== 'string');
    // Várias respostas (o /defi manda uma por posição): separadas por uma linha em branco
    return { texto: textos.join('\n\n'), midias };
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
 * @param {object} s  o chat: chat_id, chat_name e is_group (as colunas do /cron)
 * @param {object} [o]
 * @param {string} [o.onde]  quem pediu, para as mensagens de erro ('/cron')
 * @param {object} [o.quem]  admin, podeUsar, senderName... de quem executa (sem ele: você)
 */
async function montarTexto(texto, s, { onde, quem } = {}) {
    const comandos = comandosNoTexto(texto);
    if (!comandos.length) return { texto, midias: [], comandos: [] };

    const ctx = { chatName: s.chat_name, isGroup: Boolean(s.is_group), onde, quem };
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
    lerComando,
    montarTexto,
    permitidos,
    quebrarLinhas
};
