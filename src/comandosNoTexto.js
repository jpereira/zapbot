/*
 * Comandos no texto (o /cron e o /alias): "O Bitcoin agora: {/crypto BTC}".
 * Na hora de montar, cada {/comando args} roda e a resposta dele entra no lugar.
 * O `onde` (ex.: '/cron') só aparece nas mensagens de erro.
 */

const { ROLES, roleMaisRestrito } = require('./roles');
const { client } = require('./cliente');
const { activeCommands, findCommand } = require('./comandos/base');
const { printError } = require('./log');
const { erroDeOpcoes, lerOpcoes, montarContexto, negacao } = require('./executar');
const { dbGet, dbPronto } = require('./db');
const { t } = require('./i18n');

/*
 * Só os comandos com "cron": true no comandos.js (os de consulta), e sem as
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

/*
 * Acha o comando de uma linha "/nome args": o comando em si ou um alias de
 * comando salvo (com os $1, $2... aplicados). Alias de texto não entra aqui
 * (um {/alias} dentro do próprio texto poderia chamar a si mesmo).
 * @returns {Promise<{command, args, alias?}|{textoAlias: string}|null>}
 */
async function acharComando(linha) {
    const caller = linha.split(/\s+/, 1)[0].toLowerCase();
    const resto = linha.slice(caller.length).trim();
    const direto = findCommand(caller);
    if (direto) return { command: direto, args: resto };

    await dbPronto;
    const alias = await dbGet('SELECT command FROM command_aliases WHERE name = ?', [caller]);
    if (!alias) return null;
    if (!alias.command.startsWith('/')) return { textoAlias: caller };

    const { aplicarParametros } = require('./aliases'); // aqui dentro: o aliases importa este arquivo
    const { comando, sobras } = aplicarParametros(alias.command, resto);
    const destino = comando.split(/\s+/, 1)[0];
    const alvo = findCommand(destino);
    if (!alvo) return null;
    const args = [comando.slice(destino.length).trim(), sobras].filter(Boolean).join(' ');
    return { command: alvo, args, alias: caller };
}

/*
 * O /me é um comando comum, mas roda os {/comando} do que foi digitado: as permissões
 * (e o role) são as dele e as de cada um (alvos), conferidas antes de executar.
 */
async function comAlvos(command, texto) {
    if (command?.cmd !== '/me') return command;
    const achados = await Promise.all(comandosNoTexto(texto).map(c => acharComando(c.linha)));
    const alvos = achados.map(a => a?.command).filter(Boolean);
    return { ...command, role: roleMaisRestrito([command.role, ...alvos.map(c => c.role)]),
        alvos: [command.cmd, ...alvos.map(c => c.cmd)] };
}

const permitidos = () => activeCommands().filter(c => c.cron).map(c => c.cmd);

// "/crypto BTC" → { command, args, opts }, ou { erro }
async function lerComando(linha, onde = '/cron', dono = false) {
    const caller = linha.split(/\s+/, 1)[0].toLowerCase();
    const achado = await acharComando(linha);

    if (!achado) return { erro: t('cnt.naoExiste', { linha, caller }) };
    if (achado.textoAlias) return { erro: t('cnt.aliasTexto', { linha, caller, onde }) };

    const { command, args } = achado;
    if (!command.cron || (command.cron === 'dono' && !dono)) {
        return { erro: t('cnt.naoRoda', { linha, cmd: command.cmd, onde, lista: permitidos().join(', ') }) };
    }

    const opts = lerOpcoes(command, args);
    const proibida = (command.cmd_opts ?? []).find(o => (o.cron === false || (o.cron === 'dono' && !dono)) &&
        o.opts?.some(nome => opts.given.has(nome)));
    if (proibida) return { erro: t('cnt.opcaoNaoRoda', { linha, opt: proibida.opts[0], cmd: command.cmd, onde }) };

    return { command, args, opts };
}

/**
 * Confere os {/comando} do texto ao criar ou editar (o item do /cron).
 * @returns {Promise<string|null>} o erro (do primeiro inválido) ou null
 */
async function erroDosComandos(texto, onde = '/cron', dono = false) {
    for (const { linha } of comandosNoTexto(texto)) {
        const { erro } = await lerComando(linha, onde, dono);
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
    const { erro, command, args, opts } = await lerComando(linha, onde, !quem); // sem `quem`: roda como o dono
    if (erro) return { texto: t('cnt.naoRodaNo', { cmd: linha.split(/\s+/, 1)[0], onde }), midias: [] };

    // O handler fica no comandos/index, que carrega o /cron (e este arquivo): só aqui, na hora
    const { HANDLERS } = require('./comandos/index');
    const respostas = [];
    const msg = mensagemSintetica(chatId, linha, respostas);

    const dono = { nivel: ROLES.OWNER, admin: true, senderName: client.info?.pushname || t('core.voce') };
    const recusa = erroDeOpcoes(command, opts) ?? negacao(command, opts, quem?.nivel ?? dono.nivel);
    if (recusa) return { texto: recusa, midias: [] };

    try {
        await HANDLERS[command.cmd](montarContexto({
            msg, args, opts, chat: { chatId, chatName, isGroup }, quem: { ...dono, ...quem }
        }));
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
 * Coloca a resposta no lugar da marca. Uma de várias linhas (o /crypto, o /weather...)
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
    acharComando,
    comAlvos,
    comandosNoTexto,
    enviarMidias,
    erroDosComandos,
    lerComando,
    montarTexto,
    permitidos,
    quebrarLinhas
};
