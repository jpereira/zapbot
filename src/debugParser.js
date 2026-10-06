/*
 * Mostra os argumentos com as mesmas regras usadas por cada comando.
 * Não resolve contatos nem executa ações durante a leitura do diagnóstico.
 */
const { GetOptFromCommand } = require('./opcoes');
const { extrairDestinos } = require('./destinos');
const { extrairMensagem } = require('./alertasPreco');
const { lerOpcoesDebug } = require('./debugOpcoes');
const { lerOpcoesWatch } = require('./watch/opcoes');
const { lerAgendamento } = require('./agenda');

function dadosParserComando(args, command, opts) {
    if (opts.opt.help) return opts;
    try {
        if (command.cmd === '/debug') {
            const opt = lerOpcoesDebug(args);
            return { opt, argv: [], given: new Set(Object.keys(opt)) };
        }
        if (command.cmd === '/watch') {
            const o = lerOpcoesWatch(args);
            return o;
        }
        if (command.cmd === '/cron') return lerAgendamento(args);
        const temDestino = command.cmd_opts?.some(o => o.opts?.includes('to'));
        const alerta = ['/crypto', '/cotacao'].includes(command.cmd) && opts.given.has('alerta');
        if (!temDestino && !alerta) return opts;
        const destinos = temDestino ? extrairDestinos(args) : null;
        let resto = destinos?.resto ?? args;
        const mensagem = alerta ? extrairMensagem(resto) : null;
        resto = mensagem?.resto ?? resto;
        const resultado = GetOptFromCommand(resto, command);
        if (destinos?.informado) {
            resultado.opt.to = destinos.destinos;
            resultado.given.add('to');
        }
        if (mensagem?.informado) {
            resultado.opt.msg = mensagem.mensagem;
            resultado.given.add('msg');
        }
        return resultado;
    } catch (err) {
        return { entrada: args, erro: err.message };
    }
}

module.exports = { dadosParserComando };
