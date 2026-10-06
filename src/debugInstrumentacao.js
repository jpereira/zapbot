/*
 * Rastreia funções exportadas quando os módulos são carregados. Não transforma
 * funções síncronas em async e preserva o this das integrações.
 */
const Module = require('module');
const path = require('path');
const { comContextoDebug, contextoDebug } = require('./debugContexto');
const { configurarDebug } = require('./debugDados');
const { printDebugNivel } = require('./log');

const RAIZ = __dirname + path.sep;
const IGNORAR = new Set(['log.js', 'settings.js', 'botConfig.js']);
const wrappers = new WeakMap();
const rastreadas = new WeakSet();
let instalado = false;
let sequencia = 0;

function envolver(fn, nome, nivel) {
    if (wrappers.has(fn)) return wrappers.get(fn);
    function rastreada(...args) {
        const cfg = configurarDebug();
        if (!cfg.enabled || cfg.level < nivel || contextoDebug().semRastro) {
            return fn.apply(this, args);
        }
        const pai = contextoDebug();
        const id = ++sequencia;
        const inicio = Date.now();
        return comContextoDebug({ profundidade: (pai.profundidade ?? 0) + 1 }, () => {
            const prefixo = `${'  '.repeat(Math.min(pai.profundidade ?? 0, 12))}#${id} ${nome}`;
            printDebugNivel(nivel, `${prefixo} início`, args);
            const fim = (erro, valor, falhou = false) => {
                const duracao = Date.now() - inicio;
                printDebugNivel(nivel, `${prefixo} ${falhou ? 'erro' : 'fim'} +${duracao}ms`,
                    falhou ? { message: erro?.message ?? erro } : '');
                if (cfg.level >= 3) {
                    printDebugNivel(3, `${prefixo} resultado`, falhou ? erro : valor);
                }
                if (falhou) throw erro;
                return valor;
            };
            let resultado;
            try {
                resultado = fn.apply(this, args);
            } catch (err) {
                return fim(err, undefined, true);
            }
            return typeof resultado?.then === 'function'
                ? resultado.then(v => fim(null, v), e => fim(e, undefined, true))
                : fim(null, resultado);
        });
    }
    wrappers.set(fn, rastreada);
    wrappers.set(rastreada, rastreada);
    return rastreada;
}

function instrumentarObjeto(objeto, nome, nivel, metodos = Object.keys(objeto ?? {})) {
    if (!objeto || rastreadas.has(objeto)) return;
    rastreadas.add(objeto);
    for (const chave of metodos) {
        const fn = objeto[chave];
        if (typeof fn !== 'function' || /^class\s/.test(Function.prototype.toString.call(fn))) {
            continue;
        }
        objeto[chave] = envolver(fn, `${nome}.${chave}`, nivel);
    }
}

function instrumentarCliente(client) {
    if (rastreadas.has(client)) return;
    instrumentarObjeto(client, 'WhatsApp', 2, [
        'sendMessage', 'getChats', 'getContacts', 'getContactById', 'getChatById',
        'getNumberId', 'getContactLidAndPhone', 'getState', 'initialize', 'destroy'
    ]);
    client.on('ready', () => {
        if (client.pupPage) instrumentarObjeto(client.pupPage, 'Chromium', 3, ['evaluate']);
    });
}

function instalarDebug() {
    if (instalado) return;
    instalado = true;
    const carregar = Module._load;
    Module._load = function (pedido, ...resto) {
        const resultado = carregar.call(this, pedido, ...resto);
        if (pedido === 'axios') {
            instrumentarObjeto(resultado, 'axios', 2,
                ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'request']);
        } else if (pedido === 'nodemailer' && !rastreadas.has(resultado)) {
            rastreadas.add(resultado);
            const criar = resultado.createTransport;
            resultado.createTransport = function (...args) {
                const transporte = criar.apply(this, args);
                instrumentarObjeto(transporte, 'SMTP', 2, ['sendMail']);
                return transporte;
            };
        } else if (pedido === 'child_process') {
            instrumentarObjeto(resultado, 'processo', 2, ['spawn', 'execFile']);
        } else {
            let arquivo;
            try { arquivo = Module._resolveFilename(pedido, ...resto); } catch { return resultado; }
            if (typeof arquivo !== 'string' || !arquivo.startsWith(RAIZ)) return resultado;
            const nome = arquivo.slice(RAIZ.length);
            if (nome.startsWith('debug') || IGNORAR.has(nome)) return resultado;
            if (require.cache[arquivo] && !require.cache[arquivo].loaded) return resultado;
            instrumentarObjeto(resultado, nome, nome === 'db.js' ? 3 : 1);
            if (nome === 'comandos/index.js') instrumentarObjeto(resultado.HANDLERS, 'handler', 1);
            if (nome === 'cliente.js') instrumentarCliente(resultado.client);
        }
        return resultado;
    };
}

module.exports = { instalarDebug, instrumentarObjeto };
