/*
 * /cve, /kernel and /walissu come disabled (commands.disabled); /set turns them on.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OTHERAlt } = bot;
const { SETTINGS_SCHEMA } = bot.src('settings');

beforeEach(bot.restart);

describe('comandos desativados por padrão', () => {
    test('o padrão do setting é /cve, /kernel e /walissu', () => {
        assert.deepEqual(SETTINGS_SCHEMA['commands.disabled'].default, ['/cve', '/kernel', '/walissu']);
    });

    test('desativados: somem do /help e o dono é avisado de como ligar; os outros veem o comando como desconhecido', async () => {
        await bot.setSetting('commands.disabled', SETTINGS_SCHEMA['commands.disabled'].default);
        const help = (await bot.replyAlt('/help'))[0];
        for (const name of ['cve', 'kernel', 'walissu']) assert.doesNotMatch(help, new RegExp(`\\*/${name}\\*`), name);
        assert.match(help, /\*\/joke\*/, 'os outros continuam');

        assert.deepEqual(await bot.replyAlt('/kernel'), ['🚫 O /kernel está desativado. Para ligar: /set -rm commands.disabled kernel']);
        assert.deepEqual(await bot.replyAlt('/cve'), ['🚫 O /cve está desativado. Para ligar: /set -rm commands.disabled cve']);
        assert.deepEqual(await bot.replyAlt('/walissu'), ['🚫 O /walissu está desativado. Para ligar: /set -rm commands.disabled walissu']);
        assert.deepEqual(await bot.replyAlt('/kernel', { de: OTHERAlt.jid }), ["⚠️ Comando '/kernel' desconhecido, tente: /help"]);
    });

    test('/set -rm liga um, vários ou todos; /set -reset volta ao padrão', async () => {
        await bot.setSetting('commands.disabled', SETTINGS_SCHEMA['commands.disabled'].default);
        await bot.replyAlt('/set -rm commands.disabled kernel');
        assert.deepEqual(bot.getSetting('commands.disabled'), ['/cve', '/walissu']);
        assert.match((await bot.replyAlt('/help'))[0], /\*\/kernel\*/);

        await bot.replyAlt('/set -rm commands.disabled cve walissu');
        assert.deepEqual(bot.getSetting('commands.disabled'), []);

        await bot.replyAlt('/set -reset commands.disabled');
        assert.deepEqual(bot.getSetting('commands.disabled'), ['/cve', '/kernel', '/walissu']);
        await bot.replyAlt('/set commands.disabled ""');
        assert.deepEqual(bot.getSetting('commands.disabled'), [], '"" liga todos');
    });
});
