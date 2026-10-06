/*
 * O bot carregado sobre o ambiente simulado, com atalhos para os testes:
 * mandar mensagens (que passam pelo 'message_create' de verdade), apagar,
 * editar, criar grupos/contatos e ler o que o bot enviou.
 */
const ambiente = require('./ambiente');

const path = require('path');

const src = (modulo) => require(path.join(ambiente.RAIZ, 'src', modulo));

src('debugInstrumentacao').instalarDebug();

const { client, limparMarcas } = src('cliente');
src('eventos/presenca');
src('eventos/apagadas');
src('eventos/editadas');
src('eventos/mensagens');
src('enquetes');

const { dbAll, dbGet, dbRun, marcarBancoPronto } = src('db');
const { inicializarBanco } = src('inicializacao');
const { carregarSettings, getSetting, setSetting } = src('settings');
const { estado } = src('estado');

const { DONO, emails, logs, processos, rede } = ambiente;

const GRUPO = '120363000000000001@g.us';
const OUTRO = { jid: '5521911111111@c.us', user: '5521911111111', nome: 'Fulano' };

let banco = null;
const preparar = () => (banco ??= inicializarBanco().then(marcarBancoPronto));

const TABELAS = ['messages', 'message_edits', 'stats', 'watch_hits', 'watch_destinations', 'price_alerts',
    'presence_logs', 'monitored_numbers', 'settings', 'polls', 'poll_votes', 'schedules', 'defi_positions', 'mutes', 'mute_hits',
    'alerts'];

/*
 * Estado limpo para cada teste: tabelas vazias, settings no padrão, nada
 * enviado, sem rotas de rede. O bot.users vem true (o padrão é false: só o
 * dono) para os testes poderem usar comandos de outras pessoas, e a proteção
 * contra flood vem desligada (os testes repetem comandos em sequência); quem
 * testa a restrição ou o flood muda de novo.
 */
async function reiniciar() {
    await preparar();
    await src('debugContexto').comContextoDebug({ semRastro: true }, () =>
        setSetting('debug.enabled', false));
    src('debugCopia').limparCopiasDebug();

    for (const t of TABELAS) await dbRun(`DELETE FROM ${t}`);
    await carregarSettings();
    await setSetting('bot.users', ['all']);
    await setSetting('flood.maxCommandRepeated', 0);

    client.enviadas.length = 0;
    limparMarcas();
    client.contatos.clear();
    client.chats.clear();
    client.lids.clear();
    rede.limpar();
    emails.length = 0;
    logs.length = 0;
    Object.assign(processos, { chamadas: [], falhar: null, naoBaixar: false, tamanhoSaida: 1024 });
    estado.pronto = true;
    // A reconexão de um teste não vaza para o próximo
    Object.assign(estado, { tentativas: 0, foraDesde: null, aguardandoQr: false });
    estado.reiniciando = false;
    src('conexao').pararReconexao();
    src('email').limparAlertasEnviados();
    src('flood').limparFlood();

    criarContato(OUTRO.jid, OUTRO.nome);
    criarGrupo(GRUPO, 'Família', [DONO.jid, OUTRO.jid]);
}

// Um contato salvo na sua agenda (isMyContact), com o nome dela
function criarContato(jid, nome) {
    const [user] = jid.split('@');
    const contato = { id: { _serialized: jid, user }, number: user, name: nome, pushname: nome, isMyContact: true, isGroup: false };
    client.contatos.set(jid, contato);
    return contato;
}

/**
 * @param {string} id
 * @param {string} nome
 * @param {Array<string|{jid:string, isAdmin?:boolean, isSuperAdmin?:boolean}>} membros
 */
function criarGrupo(id, nome, membros = []) {
    const chat = {
        id: { _serialized: id, user: id.split('@')[0] },
        isGroup: true,
        name: nome,
        groupMetadata: { subject: nome },
        participants: membros.map((m) => {
            const { jid, isAdmin = false, isSuperAdmin = false } = typeof m === 'string' ? { jid: m } : m;
            return { id: { _serialized: jid, user: jid.split('@')[0] }, isAdmin, isSuperAdmin };
        }),
        digitando: 0,
        async sendStateTyping() { this.digitando++; }
    };
    client.chats.set(id, chat);
    return chat;
}

let sequencia = 0;

/**
 * Mensagem no formato do whatsapp-web.js (só o que o bot usa).
 * @param {object} o
 * @param {string} [o.texto]
 * @param {string} [o.chat]      chat onde a mensagem está (padrão: o grupo Família)
 * @param {string} [o.de]        quem enviou (padrão: o dono)
 * @param {object} [o.citada]    mensagem respondida (outra criarMensagem)
 * @param {object} [o.midia]     { mimetype, data } devolvido por downloadMedia()
 */
function criarMensagem({ texto = '', chat = GRUPO, de = DONO.jid, id, tipo = 'chat', citada = null,
    midia = null, links, mencoes = [], timestamp, extras = {} } = {}) {
    const fromMe = de === DONO.jid;
    const grupo = chat.endsWith('@g.us');
    const broadcast = chat.endsWith('@broadcast');
    const canal = chat.endsWith('@newsletter');
    const idMsg = id ?? `MSG${++sequencia}`;

    const msg = {
        id: { id: idMsg, remote: chat, fromMe, _serialized: `${fromMe}_${chat}_${idMsg}` },
        from: grupo || broadcast || canal ? chat : (fromMe ? DONO.jid : de),
        to: grupo ? chat : (fromMe ? chat : DONO.jid),
        author: grupo || broadcast ? de : undefined,
        isStatus: chat === 'status@broadcast',
        fromMe,
        body: texto,
        type: tipo,
        timestamp: timestamp ?? Math.floor(Date.now() / 1000),
        hasMedia: Boolean(midia),
        hasQuotedMsg: Boolean(citada),
        links: links ?? [...String(texto).matchAll(/https?:\/\/\S+/g)].map(([link]) => ({ link })),
        mentionedIds: mencoes,
        _data: { notifyName: client.contatos.get(de)?.pushname },

        async reply(content, chatId, options = {}) {
            return client.sendMessage(chatId || chat, content, { ...options, quotedMessageId: this.id._serialized });
        },
        async getChat() {
            return client.chats.get(chat) ?? { id: { _serialized: chat }, isGroup: false, name: chat, async sendStateTyping() {} };
        },
        async getContact() {
            return client.contatos.get(de) ?? { id: { _serialized: de }, number: de.split('@')[0] };
        },
        async getQuotedMessage() { return citada; },
        async downloadMedia() { return midia; },
        ...extras
    };

    return msg;
}

// Erros registrados pelo bot (printError) desde o índice `desde` do log
const errosNoLog = (desde = 0) => logs.slice(desde).filter(l => / \[\*\] /.test(l));

/**
 * Entrega uma mensagem ao bot (evento 'message_create') e espera ele terminar.
 * Falha se o bot registrar um erro, a menos que `erroEsperado` seja true.
 * @returns {Promise<Array<{chatId, content, options, texto}>>} o que o bot enviou
 */
async function entregar(msg, { erroEsperado = false } = {}) {
    const enviadasAntes = client.enviadas.length;
    const logAntes = logs.length;

    for (const handler of client.listeners('message_create')) await handler(msg);

    const erros = errosNoLog(logAntes);
    if (erros.length && !erroEsperado) {
        throw new Error(`o bot registrou erro(s) inesperado(s):\n${erros.join('\n')}`);
    }

    return client.enviadas.slice(enviadasAntes).map(comTexto);
}

// Envio com o texto à mão (o id, fora dos deepEqual, vem junto)
function comTexto(e) {
    return Object.defineProperty({ ...e, texto: textoDe(e.content, e.options) }, 'id', { value: e.id });
}

// Texto de um envio (string, legenda de mídia, nome de enquete...)
function textoDe(content, options = {}) {
    if (typeof content === 'string') return content;
    return options.caption ?? content?.pollName ?? '';
}

/**
 * Atalho: o dono (ou `de`) digita `linha` no `chat`.
 * @returns o que o bot enviou
 */
function executar(linha, opcoes = {}) {
    const { erroEsperado, ...resto } = opcoes;
    return entregar(criarMensagem({ texto: linha, ...resto }), { erroEsperado });
}

// Só os textos (o mais comum nos asserts)
async function responder(linha, opcoes) {
    return (await executar(linha, opcoes)).map(e => e.texto);
}

/**
 * Comando que lista opções para escolher (vários contatos ou grupos com o
 * nome): espera a lista sair, responde `escolha` no mesmo chat e espera o
 * comando terminar.
 * @returns os textos de tudo o que o bot enviou, da lista em diante
 */
async function responderEscolhendo(linha, escolha, opcoes = {}) {
    const antes = client.enviadas.length;
    const comando = executar(linha, opcoes);
    const listou = () => client.enviadas.slice(antes).some(e => textoDe(e.content).startsWith('🔎 '));

    for (let i = 0; i < 200 && !listou(); i++) await new Promise(setImmediate);
    if (!listou()) throw new Error(`${linha}: o bot não listou opções para escolher`);

    for (const n of [].concat(escolha)) await executar(String(n), { chat: opcoes.chat });
    return (await comando).map(e => e.texto);
}

/*
 * Eventos de apagar e editar, no formato do whatsapp-web.js
 */
async function apagar(original, { porMim = original.fromMe } = {}) {
    const after = {
        fromMe: porMim,
        id: { id: `REVOKE_${original.id.id}` },
        _data: { protocolMessageKey: { id: original.id.id } },
        getChat: original.getChat
    };

    const antes = client.enviadas.length;
    for (const h of client.listeners('message_revoke_everyone')) await h(after, original);
    return client.enviadas.slice(antes).map(comTexto);
}

async function editar(original, novoTexto, { antigo = original.body, editadaEm = Date.now(), realmente = true } = {}) {
    const msg = {
        ...original,
        latestEditSenderTimestampMs: realmente ? editadaEm : undefined,
        latestEditMsgKey: realmente ? { id: `EDIT_${original.id.id}` } : undefined,
        body: novoTexto
    };

    const antes = client.enviadas.length;
    for (const h of client.listeners('message_edit')) await h(msg, novoTexto, antigo);
    return client.enviadas.slice(antes).map(comTexto);
}

/**
 * Evento 'vote_update' do whatsapp-web.js: `voter` escolheu `opcoes` (lista
 * vazia = tirou o voto) na enquete `enquete` (o envio do /enquete ou uma
 * mensagem com pollName/pollOptions/id).
 */
async function votar(enquete, voter, opcoes, { quando = Date.now() } = {}) {
    const poll = enquete.content ?? enquete;
    const vote = {
        voter,
        selectedOptions: opcoes.map(name => ({ name, localId: poll.pollOptions.findIndex(o => o.name === name) })),
        interractedAtTs: quando,
        parentMessage: {
            id: enquete.id,
            pollName: poll.pollName,
            pollOptions: poll.pollOptions,
            allowMultipleAnswers: poll.options?.allowMultipleAnswers ?? poll.allowMultipleAnswers ?? false,
            timestamp: Math.floor(quando / 1000)
        }
    };

    for (const h of client.listeners('vote_update')) await h(vote);
}

/*
 * Com o relógio simulado, avança o tempo aos poucos até a promessa terminar:
 * não depende de quantos passos assíncronos existem antes de cada setTimeout.
 */
async function esperarComRelogio(t, promessa, passoMs = 1000, maxPassos = 60) {
    let terminou = false;
    promessa.then(() => { terminou = true; }, () => { terminou = true; });

    for (let i = 0; i < maxPassos && !terminou; i++) {
        for (let j = 0; j < 10; j++) await new Promise(setImmediate);
        if (!terminou) t.mock.timers.tick(passoMs);
    }
    return promessa;
}

module.exports = {
    ...ambiente,
    GRUPO,
    OUTRO,
    apagar,
    client,
    criarContato,
    criarGrupo,
    criarMensagem,
    dbAll,
    dbGet,
    dbRun,
    editar,
    entregar,
    esperarComRelogio,
    errosNoLog,
    estado,
    executar,
    getSetting,
    preparar,
    reiniciar,
    responder,
    responderEscolhendo,
    setSetting,
    src,
    textoDe,
    votar
};
