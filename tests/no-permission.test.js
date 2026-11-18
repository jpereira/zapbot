'use strict';
/*
 * No-permission command notice: bot.denied.enabled and bot.denied.message ($cmd and $admin).
 */

const bot = require('./helpers/bot');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { notified } = bot.src('noPermission');

const { OTHERAlt } = bot;

// The helper lets everyone into bot.users and turns off the notice; here nobody from outside uses the bot (unless the test
// allows) and the notice applies the bot default: on
beforeEach(async () => {
    await bot.restart();
    await bot.setSetting('bot.users', []);
    await bot.setSetting('bot.denied.enabled', bot.src('settings').SETTINGS_SCHEMA['bot.denied.enabled'].default);
    notified.clear();
});

test('vem ligado por padrão; desligado, quem não pode usar o bot é ignorado em silêncio', async () => {
    assert.equal(bot.src('settings').SETTINGS_SCHEMA['bot.denied.enabled'].default, true);
    assert.match((await bot.replyAlt('/ping', { de: OTHERAlt.jid }))[0], /^🚫 Sem permissão para executar \/ping/);
    notified.clear();
    await bot.setSetting('bot.denied.enabled', false);
    assert.deepEqual(await bot.replyAlt('/ping', { de: OTHERAlt.jid }), []);
});

test('ligado: responde com o texto padrão, o $cmd trocado pelo comando e o $admin pelo dono', async () => {
    await bot.setSetting('bot.denied.enabled', true);
    const [r, ...rest] = await bot.replyAlt('/ping', { de: OTHERAlt.jid });
    assert.deepEqual(rest, []);
    assert.match(r, /^🚫 Sem permissão para executar \/ping, fale com .+$/);
    assert.doesNotMatch(r, /\$cmd|\$admin/);
});

test('comando acima do nível (um usuário liberado tentando um comando admin) também recebe o aviso', async () => {
    await bot.setSetting('bot.users', ['all']);
    await bot.setSetting('bot.denied.enabled', true);
    const [r] = await bot.replyAlt('/backup', { de: OTHERAlt.jid });
    assert.match(r, /^🚫 Sem permissão para executar \/backup, fale com /);
});

test('o texto é editável, e vazio volta ao texto padrão do idioma', async () => {
    await bot.setSetting('bot.denied.enabled', true);
    await bot.setSetting('bot.denied.message', 'Sem acesso a $cmd! Procure $admin ($cmd)');
    const [r] = await bot.replyAlt('/ping', { de: OTHERAlt.jid });
    assert.match(r, /^Sem acesso a \/ping! Procure .+ \(\/ping\)$/);

    await bot.setSetting('bot.denied.message', '');
    notified.clear();
    assert.match((await bot.replyAlt('/ping', { de: OTHERAlt.jid }))[0], /^🚫 Sem permissão para executar \/ping, fale com /);
});

test('o texto padrão acompanha o idioma do bot (en_US em inglês)', async () => {
    await bot.setSetting('bot.denied.enabled', true);
    await bot.setSetting('zapbot.lang', 'en_US');
    const [r] = await bot.replyAlt('/ping', { de: OTHERAlt.jid });
    assert.match(r, /^🚫 No permission to run \/ping, talk to .+$/);
});

test('quem já foi avisado, ou insiste, dentro do intervalo não recebe de novo; a tentativa renova a espera', async () => {
    const MIN = 60 * 1000;
    const { notifyWithoutPermission } = bot.src('noPermission');
    const msg = () => ({ from: 'chat@c.us', replies: [], reply(t) { this.replies.push(t); } });
    await bot.setSetting('bot.denied.interval', 10);

    const m = msg();
    const t0 = 1_000_000_000;
    assert.equal(await notifyWithoutPermission(m, '/ping', 'fulano', t0), true, 'a primeira tentativa avisa');
    assert.equal(await notifyWithoutPermission(m, '/ping', 'fulano', t0 + 5 * MIN), false, 'dentro dos 10 min: quieto');
    assert.equal(await notifyWithoutPermission(m, '/version', 'fulano', t0 + 12 * MIN), false, 'insistiu: a espera renovou (5+10 > 12)');
    assert.equal(await notifyWithoutPermission(m, '/ping', 'fulano', t0 + 23 * MIN), true, 'parou por mais de 10 min: avisa de novo');
    assert.equal(await notifyWithoutPermission(m, '/ping', 'ciclano', t0 + 23 * MIN), true, 'outra pessoa tem a própria espera');
    assert.equal(m.replies.length, 3);

    // 0: warns on every attempt
    await bot.setSetting('bot.denied.interval', 0);
    assert.equal(await notifyWithoutPermission(m, '/ping', 'fulano', t0 + 24 * MIN), true);
    assert.equal(await notifyWithoutPermission(m, '/ping', 'fulano', t0 + 24 * MIN + 1), true);
});

test('pelo bot, o segundo comando seguido da mesma pessoa fica sem resposta', async () => {
    await bot.setSetting('bot.denied.enabled', true);
    assert.equal((await bot.replyAlt('/ping', { de: OTHERAlt.jid })).length, 1);
    assert.deepEqual(await bot.replyAlt('/ping', { de: OTHERAlt.jid }), [], 'o segundo, em silêncio');
    assert.deepEqual(await bot.replyAlt('/version', { de: OTHERAlt.jid }), [], 'outro comando também');
});

test('o dono e quem pode usar o comando não recebem o aviso (o comando roda)', async () => {
    await bot.setSetting('bot.denied.enabled', true);
    const [owner] = await bot.replyAlt('/ping');
    assert.doesNotMatch(owner, /Sem permissão/);
    await bot.setSetting('bot.users', ['all']);
    const [user] = await bot.replyAlt('/ping', { de: OTHERAlt.jid });
    assert.doesNotMatch(user, /Sem permissão/);
});

test('/bot -denied: mostra, liga, desliga, muda o texto e volta ao padrão', async () => {
    await bot.setSetting('bot.denied.enabled', false);
    let [r] = await bot.replyAlt('/bot -denied');
    assert.match(r, /Aviso de comando negado:\* desligado\n📝 🚫 Sem permissão para executar \$cmd, fale com \$admin/);

    [r] = await bot.replyAlt('/bot -denied on');
    assert.match(r, /\* ligado\n/);
    assert.equal(bot.getSetting('bot.denied.enabled'), true);
    assert.match((await bot.replyAlt('/ping', { de: OTHERAlt.jid }))[0], /^🚫 Sem permissão para executar \/ping/);

    [r] = await bot.replyAlt('/bot -denied Sem acesso a $cmd! Procure $admin');
    assert.match(r, /📝 Sem acesso a \$cmd! Procure \$admin\n/);
    assert.equal(bot.getSetting('bot.denied.message'), 'Sem acesso a $cmd! Procure $admin');

    await bot.replyAlt('/bot -denied reset');
    assert.equal(bot.getSetting('bot.denied.message'), '', 'vazio: vale o texto padrão do idioma');

    [r] = await bot.replyAlt('/bot -d off');
    assert.match(r, /\* desligado\n/);
    assert.equal(bot.getSetting('bot.denied.enabled'), false);
});
