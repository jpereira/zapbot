/*
 * /monitor (/m) e o aviso de presença. O comando está desativado no config
 * ("em desenvolvimento"): aqui ele é recolocado no botConfig carregado, só
 * neste processo de teste.
 */
const bot = require('./helpers/bot');

const fs = require('fs');
const path = require('path');
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OUTRO } = bot;
const { botConfig } = bot.src('botConfig');

const CONFIG = JSON.parse(fs.readFileSync(path.join(bot.RAIZ, 'config/bot-config.json'), 'utf8'));
const MONITOR = CONFIG.commands.find(c => c.cmd === '/monitor');

before(() => {
    botConfig.commands.push({ ...MONITOR, disabled: false });
});
after(() => {
    botConfig.commands = botConfig.commands.filter(c => c.cmd !== '/monitor');
});

beforeEach(bot.reiniciar);

const NUMERO = '5521944444444';
const online = (id, extras = {}) => bot.client.listeners('presence_update')[0]({ id: { _serialized: id }, status: 'available', ...extras });

describe('/monitor (/m)', () => {
    test('-add, -list e número repetido', async () => {
        assert.deepEqual(await bot.responder('/monitor -add +55 21 94444-4444'), [`🔔 O número ${NUMERO} agora está sendo monitorado.`]);
        assert.deepEqual(await bot.responder(`/m add ${NUMERO}`), [`🔔 O número ${NUMERO} já está sendo monitorado.`]);
        assert.match((await bot.responder('/monitor -list'))[0], new RegExp(`📲🔔 \\*Números Monitorados:\\*\\n\\n\\* ${NUMERO} adicionado em:`));
    });

    test('número inválido e limite do monitor.max', async () => {
        assert.deepEqual(await bot.responder('/monitor -add 123'), ['Número inválido informado.']);
        await bot.setSetting('monitor.max', 1);
        await bot.responder(`/monitor -add ${NUMERO}`);
        assert.deepEqual(await bot.responder('/monitor -add 5521955555555'), ['Limite de 1 números monitorados atingido.']);
    });

    test('-del e -clean', async () => {
        await bot.responder(`/monitor -add ${NUMERO}`);
        assert.deepEqual(await bot.responder(`/monitor -del ${NUMERO}`), [`Número ${NUMERO} removido com sucesso.`]);
        assert.deepEqual(await bot.responder(`/monitor -del ${NUMERO}`), [`O número ${NUMERO} não está sendo monitorado.`]);
        assert.deepEqual(await bot.responder('/monitor -del abc'), ['Número inválido informado.']);

        assert.match((await bot.responder('/monitor -clean'))[0], /já estava vazia/);
        await bot.responder(`/monitor -add ${NUMERO}`);
        assert.match((await bot.responder('/monitor -clean'))[0], /Total de números limpos: \*1\*/);
    });

    test('-list e -logs vazios; sem opção mostra a sintaxe', async () => {
        assert.deepEqual(await bot.responder('/monitor -list'), ['Nenhum número está sendo monitorado.']);
        assert.match((await bot.responder('/monitor -logs'))[0], /Nenhum histórico encontrado/);
        assert.match((await bot.responder('/monitor'))[0], /Usage: \/monitor/);
    });

    test('só o dono usa', async () => {
        assert.deepEqual(await bot.responder(`/monitor -add ${NUMERO}`, { de: OUTRO.jid }), []);
    });
});

describe('presença', () => {
    test('número monitorado online: avisa no seu privado e grava no histórico (-logs)', async () => {
        bot.criarContato(`${NUMERO}@c.us`, 'Beltrano');
        await bot.responder(`/monitor -add ${NUMERO}`);
        bot.client.enviadas.length = 0;

        await online(`${NUMERO}:3@c.us`);
        assert.equal(bot.client.enviadas.length, 1);
        assert.equal(bot.client.enviadas[0].chatId, process.env.PHONE_NUMBER);
        assert.equal(bot.client.enviadas[0].content, `🔔 *Beltrano* (${NUMERO}) acabou de ficar online.`);

        assert.match((await bot.responder('/monitor -logs'))[0], /⏱️ \*Beltrano\* ficou online em:/);
    });

    test('ignora: offline, número não monitorado e evento sem id', async () => {
        await bot.responder(`/monitor -add ${NUMERO}`);
        bot.client.enviadas.length = 0;

        await online(`${NUMERO}@c.us`, { status: 'unavailable' });
        await online('5521900000001@c.us');
        await bot.client.listeners('presence_update')[0]({});
        assert.deepEqual(bot.client.enviadas, []);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM presence_logs')).n, 0);
    });

    test('type "available" também vale; sem contato usa o número', async () => {
        await bot.responder(`/monitor -add ${NUMERO}`);
        bot.client.enviadas.length = 0;
        await online(`${NUMERO}@c.us`, { status: undefined, type: 'available' });
        assert.equal(bot.client.enviadas[0].content, `🔔 *${NUMERO}* (${NUMERO}) acabou de ficar online.`);
    });
});

