/*
 * O que todo comando faz antes do handler, igual para quem digita (eventos/mensagens.js), para o
 * {/comando} do texto do /cron e do /alias (comandosNoTexto.js) e para o /batch: ler as opções,
 * conferir o que cada um pode e montar o contexto do handler.
 */

const { getCommandSyntax } = require('./comandos/base');
const { GetOptFromCommand } = require('./opcoes');
const { t } = require('./i18n');
const { ROLES, atende } = require('./roles');
const { pediuAjudaWatch, pediuMascaraWatch } = require('./watch/opcoes');

const PEDIU_AJUDA = /^-h(?:elp)?$/;

// Os comandos com um leitor de opções próprio: o /watch tem regras e regex com espaços
const LEITORES_PROPRIOS = {
    '/watch': (opts, args) => {
        opts.opt.help = pediuAjudaWatch(args);
        opts.opt.mask = pediuMascaraWatch(args);
    }
};

/**
 * As opções do comando. Com `argumentosLivres` (o /alias e o /batch), o resto é um texto livre, com
 * as opções do comando salvo: só o -h/-help é lido aqui.
 */
function lerOpcoes(command, args) {
    const livre = command.argumentosLivres && !PEDIU_AJUDA.test(args);
    const opts = GetOptFromCommand(livre ? '' : args, command);
    LEITORES_PROPRIOS[command.cmd]?.(opts, args);
    return opts;
}

/*
 * Roda o comando com o "digitando..." aceso: muitos demoram (baixar, consultar, limpar o e-mail,
 * perguntar ao ChatGPT) e sem isso o chat parece parado. Vale para todo comando digitado, menos os
 * que declaram `digitando: false` (os instantâneos, como o /ping).
 *
 * O WhatsApp apaga o aviso quando o bot manda uma mensagem (o "⏳ Limpando..." do meio) e também
 * depois de alguns segundos. Por isso ele é reenviado a cada `cada` ms até o comando terminar.
 * @param {number} [o.cada]  o intervalo do reenvio (só os testes mudam)
 */
async function comDigitando(msg, command, executar, { cada = 3000 } = {}) {
    if (command.digitando === false) return executar();

    let chat = null;
    const digitar = () => (chat ? Promise.resolve(chat) : msg.getChat().then(c => (chat = c)))
        .then(c => c.sendStateTyping())
        .catch(() => {});

    digitar();
    const timer = setInterval(digitar, cada);
    timer.unref?.();
    try {
        return await executar();
    } finally {
        clearInterval(timer);
        // Sem resposta no fim (o comando só agiu), o aviso não fica aceso até o WhatsApp apagar
        if (chat) Promise.resolve().then(() => chat.clearState?.()).catch(() => {});
    }
}

// O -mask de quem declara "mask: true" no comandos.js (o do /defi é outro: esconde as carteiras)
const pediuMascara = (command, opts) => Boolean(command.mask && opts.opt.mask);

// "❌ Opção desconhecida: -x" com a sintaxe, ou null (só nos comandos "estrito: true")
function erroDeOpcoes(command, opts) {
    if (!opts.desconhecidas.length) return null;
    const lista = opts.desconhecidas.join(' ');
    // O /gpt e o /tldr (estrito: 'primeira') só sugerem a ajuda; os outros mostram a sintaxe
    if (command.estrito === 'primeira') return t('executar.opcaoDesconhecidaAjuda', { lista, cmd: command.cmd });
    return t('executar.opcaoDesconhecidaSintaxe', { lista, sintaxe: getCommandSyntax(command.cmd) });
}

/**
 * A resposta para quem usou o que não pode, ou null. Duas marcas no cmd_opts da definição:
 *   role: ADMIN|OWNER   a opção exige este nível, mesmo que o comando tenha sido delegado a um usuário
 *                       (trocar o modelo do /gpt, apagar dados...);
 *   outrosChats: true   a opção (ou o argumento, em { argv }) olha outros chats: um usuário que
 *                       recebeu o comando vê só o chat atual.
 * @param {string|null} nivel  o de quem digitou: owner, admin ou user (src/roles.js)
 */
function negacao(command, opts, nivel) {
    for (const o of command.cmd_opts ?? []) {
        const usada = o.opts ? o.opts.some(nome => opts.given.has(nome)) : opts.argv.length > 0;
        if (!usada) continue;
        if (o.role && !atende(nivel, o.role)) {
            return t(o.role === ROLES.OWNER ? 'executar.soDonoOpcao' : 'executar.soAdminOpcao', { opt: o.opts[0], cmd: command.cmd });
        }
        if (o.outrosChats && !atende(nivel, ROLES.ADMIN)) return t('executar.soAdminOutrosChats');
    }
    return null;
}

/**
 * O que o handler recebe, igual em todo lugar que executa um comando.
 * @param {object} o
 * @param {object} o.msg
 * @param {string} o.args
 * @param {object} o.opts
 * @param {object} [o.quotedMsg]
 * @param {{ chatId: string, chatName: string, isGroup: boolean }} o.chat
 * @param {{ nivel: string, admin: boolean, podeUsar: Function, senderContact?: object,
 *           senderName?: string, senderNumber?: string }} o.quem  quem executa (nivel: owner, admin
 *           ou user; admin é o dono ou um admin)
 */
function montarContexto({ msg, args, opts, quotedMsg = null, chat, quem }) {
    return {
        msg, args, opts, quotedMsg,
        chatId: chat.chatId, chatName: chat.chatName, isGroup: Boolean(chat.isGroup),
        nivel: quem.nivel, admin: quem.admin, podeUsar: quem.podeUsar ?? (() => true),
        senderContact: quem.senderContact ?? null, senderName: quem.senderName, senderNumber: quem.senderNumber
    };
}

module.exports = {
    comDigitando,
    erroDeOpcoes,
    lerOpcoes,
    montarContexto,
    negacao,
    pediuMascara
};
