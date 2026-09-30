/*
 * Heartbeat: a prova de vida lida pelo HEALTHCHECK do Docker.
 *
 * A cada 30 s o bot confere se está funcionando e, se estiver, grava o arquivo
 * HEARTBEAT_FILE (padrão: /tmp/zapbot-heartbeat.json) com a hora e o estado.
 * O docker/app/healthcheck.js só olha a idade desse arquivo: parado há mais de
 * 90 s, o container fica "unhealthy".
 *
 * "Funcionando" depende do estado da conexão:
 *   - conectado (estado.pronto): o WhatsApp Web responde CONNECTED ao
 *     getState() em até 10 s;
 *   - ainda não conectado (boot, esperando o QR Code, reconectando): o
 *     processo estar vivo basta. Reiniciar não ajudaria a ler o QR;
 *   - reiniciando: vale por até 5 min; um reinício travado para de bater.
 *
 * Sem batimento o arquivo envelhece: Node travado, Chromium sem resposta ou a
 * sessão presa num estado ruim. Conectado mas sem CONNECTED 3 vezes seguidas
 * (~90 s), o bot também avisa por e-mail e reinicia o cliente sozinho.
 */
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const packageJson = require('../package.json');

const { client } = require('./cliente');
const { restartClient } = require('./conexao');
const { alertarPorEmail } = require('./email');
const { estado } = require('./estado');
const { printError, printInfo } = require('./log');

const HEARTBEAT_FILE = process.env.ZAPBOT_HEARTBEAT_FILE || path.join(os.tmpdir(), 'zapbot-heartbeat.json');
const HEARTBEAT_INTERVALO_MS = 30 * 1000;
const GETSTATE_TIMEOUT_MS = 10 * 1000;
const FALHAS_PARA_REINICIAR = 3;
const REINICIO_MAX_MS = 5 * 60 * 1000;

let falhasSeguidas = 0;
let reiniciandoDesde = null;

// getState() de um Chromium travado nunca resolve: desiste depois de `ms`
async function getStateComTimeout(ms) {
    let limite;

    try {
        return await Promise.race([
            client.getState(),
            new Promise((_, rejeitar) => { limite = setTimeout(() => rejeitar(new Error(`sem resposta em ${ms / 1000}s`)), ms); })
        ]);
    } finally {
        clearTimeout(limite);
    }
}

/**
 * Situação atual do bot.
 * @returns {Promise<{saudavel: boolean, estado: string}>}
 */
async function avaliarSaude() {
    if (estado.reiniciando) {
        reiniciandoDesde ??= Date.now();
        const travado = Date.now() - reiniciandoDesde > REINICIO_MAX_MS;
        return { saudavel: !travado, estado: travado ? 'reinício travado' : 'reiniciando' };
    }

    reiniciandoDesde = null;

    if (!estado.pronto) return { saudavel: true, estado: 'aguardando conexão' };

    try {
        const state = await getStateComTimeout(GETSTATE_TIMEOUT_MS);
        return { saudavel: state === 'CONNECTED', estado: String(state ?? 'desconhecido') };
    } catch (err) {
        return { saudavel: false, estado: err.message };
    }
}

// Gravação atômica: o healthcheck nunca lê um arquivo pela metade
function gravarHeartbeat(situacao) {
    const temporario = `${HEARTBEAT_FILE}.tmp`;

    fs.writeFileSync(temporario, JSON.stringify({
        epoch: Date.now(),
        em: new Date().toISOString(),
        estado: situacao,
        pid: process.pid,
        versao: packageJson.version
    }));
    fs.renameSync(temporario, HEARTBEAT_FILE);
}

async function baterCoracao() {
    const situacao = await avaliarSaude();

    if (situacao.saudavel) {
        falhasSeguidas = 0;

        try {
            gravarHeartbeat(situacao.estado);
        } catch (err) {
            printError(`Heartbeat: não consegui gravar ${HEARTBEAT_FILE}:`, err.message);
        }
        return situacao;
    }

    printError(`Heartbeat: sem batimento (${situacao.estado}).`);

    // Só a conexão que não responde é reiniciada aqui; um reinício travado fica para o Docker
    if (estado.pronto && !estado.reiniciando && ++falhasSeguidas >= FALHAS_PARA_REINICIAR) {
        falhasSeguidas = 0;
        printInfo('Heartbeat: WhatsApp sem resposta em 3 verificações seguidas, reiniciando o cliente.');
        alertarPorEmail('🩺 WhatsApp sem resposta',
            `O WhatsApp Web não respondeu CONNECTED em ${FALHAS_PARA_REINICIAR} verificações seguidas (último estado: ${situacao.estado}).\n` +
            'O cliente será reiniciado automaticamente.');
        await restartClient(`heartbeat: ${situacao.estado}`);
    }

    return situacao;
}

// Chamada no app.js: um batimento já no boot e depois a cada 30 s
function iniciarHeartbeat() {
    printInfo(`Heartbeat em ${HEARTBEAT_FILE} (a cada ${HEARTBEAT_INTERVALO_MS / 1000}s)`);
    baterCoracao();
    setInterval(baterCoracao, HEARTBEAT_INTERVALO_MS);
}

module.exports = {
    HEARTBEAT_FILE,
    baterCoracao,
    iniciarHeartbeat
};
