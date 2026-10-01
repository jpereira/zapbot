/*
 * /monitor and the presence notice. The command is disabled in the config
 * ("in development"): here it is put back into the loaded botConfig, only
 * in this test process.
 */
const bot = require('./helpers/bot');

const fs = require('fs');
const path = require('path');
const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OTHERAlt } = bot;
const { botConfig } = bot.src('botConfig');

const CONFIG = JSON.parse(fs.readFileSync(path.join(bot.ROOT, 'src/commands/commands.json'), 'utf8'));
const MONITOR = CONFIG.commands.find(c => c.cmd === '/monitor');

before(() => {
    botConfig.commands.push({ ...MONITOR, disabled: false });
});
after(() => {
    botConfig.commands = botConfig.commands.filter(c => c.cmd !== '/monitor');
});

beforeEach(bot.restart);

const NUMBER = '5521944444444';
const online = (id, extras = {}) => bot.client.listeners('presence_update')[0]({ id: { _serialized: id }, status: 'available', ...extras });

describe('/monitor', () => {
    test('-add, -list e número repetido', async () => {
        assert.deepEqual(await bot.replyAlt('/monitor -add +55 21 94444-4444'), [`🔔 O número ${NUMBER} agora está sendo monitorado.`]);
        assert.deepEqual(await bot.replyAlt(`/monitor add ${NUMBER}`), [`🔔 O número ${NUMBER} já está sendo monitorado.`]);
        assert.match((await bot.replyAlt('/monitor -list'))[0], new RegExp(`📲🔔 \\*Números Monitorados:\\*\\n\\n\\* ${NUMBER} adicionado em:`));
    });

    test('número inválido e limite do monitor.max', async () => {
        assert.deepEqual(await bot.replyAlt('/monitor -add 123'), ['Número inválido informado.']);
        await bot.setSetting('monitor.max', 1);
        await bot.replyAlt(`/monitor -add ${NUMBER}`);
        assert.deepEqual(await bot.replyAlt('/monitor -add 5521955555555'), ['Limite de 1 números monitorados atingido.']);
    });

    test('-rem e -clean', async () => {
        await bot.replyAlt(`/monitor -add ${NUMBER}`);
        assert.deepEqual(await bot.replyAlt(`/monitor -rem ${NUMBER}`), [`Número ${NUMBER} removido com sucesso.`]);
        assert.deepEqual(await bot.replyAlt(`/monitor -rem ${NUMBER}`), [`O número ${NUMBER} não está sendo monitorado.`]);
        assert.deepEqual(await bot.replyAlt('/monitor -rem abc'), ['Número inválido informado.']);

        assert.match((await bot.replyAlt('/monitor -clean'))[0], /já estava vazia/);
        await bot.replyAlt(`/monitor -add ${NUMBER}`);
        assert.match((await bot.replyAlt('/monitor -clean'))[0], /Total de números limpos: \*1\*/);
    });

    test('-list e -logs vazios; sem opção mostra a sintaxe', async () => {
        assert.deepEqual(await bot.replyAlt('/monitor -list'), ['Nenhum número está sendo monitorado.']);
        assert.match((await bot.replyAlt('/monitor -logs'))[0], /Nenhum histórico encontrado/);
        assert.match((await bot.replyAlt('/monitor'))[0], /Usage: \/monitor/);
    });

    test('só o dono usa', async () => {
        assert.deepEqual(await bot.replyAlt(`/monitor -add ${NUMBER}`, { de: OTHERAlt.jid }), []);
    });
});

describe('presença', () => {
    test('número monitorado online: avisa no seu privado e grava no histórico (-logs)', async () => {
        bot.createContact(`${NUMBER}@c.us`, 'Beltrano');
        await bot.replyAlt(`/monitor -add ${NUMBER}`);
        bot.client.enviadas.length = 0;

        await online(`${NUMBER}:3@c.us`);
        assert.equal(bot.client.enviadas.length, 1);
        assert.equal(bot.client.enviadas[0].chatId, process.env.PHONE_NUMBER);
        assert.equal(bot.client.enviadas[0].content, `🔔 *Beltrano* (${NUMBER}) acabou de ficar online.`);

        assert.match((await bot.replyAlt('/monitor -logs'))[0], /⏱️ \*Beltrano\* ficou online em:/);
    });

    test('ignora: offline, número não monitorado e evento sem id', async () => {
        await bot.replyAlt(`/monitor -add ${NUMBER}`);
        bot.client.enviadas.length = 0;

        await online(`${NUMBER}@c.us`, { status: 'unavailable' });
        await online('5521900000001@c.us');
        await bot.client.listeners('presence_update')[0]({});
        assert.deepEqual(bot.client.enviadas, []);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM presence_logs')).n, 0);
    });

    test('type "available" também vale; sem contato usa o número', async () => {
        await bot.replyAlt(`/monitor -add ${NUMBER}`);
        bot.client.enviadas.length = 0;
        await online(`${NUMBER}@c.us`, { status: undefined, type: 'available' });
        assert.equal(bot.client.enviadas[0].content, `🔔 *${NUMBER}* (${NUMBER}) acabou de ficar online.`);
    });
});

