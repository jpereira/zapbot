/*
 * Usage limit per user and command: /bot +cmd /ping +limit 5/day, /usage and /whois.
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, OTHERAlt } = bot;
const usage = bot.src('usageLimit');
const OWNER_CHAT = { chat: OWNER.jid };
const own = (line, extras = {}) => bot.replyAlt(line, { de: OTHERAlt.jid, ...extras });

beforeEach(async () => {
    await bot.restart();
    await bot.src('db').dbRun('DELETE FROM usage_log');
    await bot.setSetting('bot.users', []);
    await bot.setSetting('bot.users.cmds', []);
    await bot.setSetting('bot.users.limits', []);
});

test('lerLimite: N, N/período em português e inglês; inválido lança', () => {
    assert.deepEqual(usage.readLimit('5'), { max: 5, period: 'total' });
    assert.deepEqual(usage.readLimit('5/dia'), { max: 5, period: 'day' });
    assert.deepEqual(usage.readLimit('5/day'), { max: 5, period: 'day' });
    assert.deepEqual(usage.readLimit('3/sem'), { max: 3, period: 'week' });
    assert.deepEqual(usage.readLimit('20/mês'), { max: 20, period: 'month' });
    assert.deepEqual(usage.readLimit('20/mes'), { max: 20, period: 'month' });
    for (const bad of ['0', 'x', '5/ano', '5/', '-1']) assert.throws(() => usage.readLimit(bad), undefined, bad);
});

test('janelas: dia, semana (segunda) e mês em Brasília', () => {
    const wednesday = Date.UTC(2026, 10, 18, 15, 0); // wednesday, 18/11/2026 12:00 in Brasília
    assert.equal(usage.windowStart('total', wednesday), 0);
    assert.equal(new Date(usage.windowStart('day', wednesday)).toISOString(), '2026-11-18T03:00:00.000Z');
    assert.equal(new Date(usage.windowStart('week', wednesday)).toISOString(), '2026-11-16T03:00:00.000Z');
    assert.equal(new Date(usage.windowStart('month', wednesday)).toISOString(), '2026-11-01T03:00:00.000Z');
    assert.equal(new Date(usage.windowEnd('day', wednesday)).toISOString(), '2026-11-19T03:00:00.000Z');
    assert.equal(new Date(usage.windowEnd('week', wednesday)).toISOString(), '2026-11-23T03:00:00.000Z');
    assert.equal(new Date(usage.windowEnd('month', wednesday)).toISOString(), '2026-12-01T03:00:00.000Z');
    assert.equal(usage.windowEnd('total', wednesday), null);
});

test('/bot +u +cmd /ping +limit 2: grava o limite; só o 3º uso é barrado, com o rodapé nos outros', async () => {
    const [r] = await bot.replyAlt('/bot +u /Fulano/ +cmd /ping +limit 2', OWNER_CHAT);
    assert.match(r, /Fulano/);
    assert.deepEqual(bot.getSetting('bot.users.limits'), [`${OTHERAlt.user}=/ping:2`]);

    assert.deepEqual(await own('/ping'), ['pong', '📊 /ping: restam 1 de 2 no total']);
    assert.deepEqual(await own('/ping'), ['pong', '📊 /ping: restam 0 de 2 no total']);
    const [blocked] = await own('/ping');
    assert.match(blocked, /^🚫 Limite do \/ping atingido: 2 de 2 no total\. Não renova/);
});

test('+cmd e +limit juntos: uma resposta só, com o ⏱️ de cada usuário na lista', async () => {
    const r = await bot.replyAlt('/bot +u /Fulano/ +cmd /ping,/uptime +limit 5', OWNER_CHAT);
    assert.equal(r.length, 1);
    assert.match(r[0], /→ Apenas: \/ping, \/uptime\n ⏱️ \/ping 5 no total, \/uptime 5 no total/);
    assert.deepEqual(bot.getSetting('bot.users.limits'), [`${OTHERAlt.user}=/ping:5,/uptime:5`]);
    // a command that cannot have a limit: refuses before touching anything
    const [errorAlt] = await bot.replyAlt('/bot +u /Beltrano/ +cmd /show +limit 5', OWNER_CHAT);
    assert.match(errorAlt, /^❌/);
});

test('usage.footer desligado: sem o aviso de quanto resta', async () => {
    await bot.replyAlt('/bot +u /Fulano/ +cmd /ping +limit 3/dia', OWNER_CHAT);
    await bot.setSetting('usage.footer', false);
    assert.deepEqual(await own('/ping'), ['pong']);
});

test('só o que deu certo conta: ajuda, uso e erro devolvem o uso', async () => {
    await bot.replyAlt('/bot +u /Fulano/ +cmd /ping,/noffa +limit 1', OWNER_CHAT);
    await own('/ping -h');
    await own('/noffa'); // without text: shows the syntax
    const { limitsWithUsage } = usage;
    const beforeAlt = await limitsWithUsage({ number: OTHERAlt.user, chatId: OTHERAlt.jid, isGroup: false });
    assert.deepEqual(beforeAlt.map(l => [l.cmd, l.used]), [['/noffa', 0], ['/ping', 0]]);

    assert.match((await own('/noffa oi'))[0], /o/i);
    const afterAlt = await limitsWithUsage({ number: OTHERAlt.user, chatId: OTHERAlt.jid, isGroup: false });
    assert.deepEqual(afterAlt.map(l => [l.cmd, l.used]), [['/noffa', 1], ['/ping', 0]]);
});

test('o "⏳ Processando..." editado para um erro não conta; editado para o resultado conta', async () => {
    const { completeNotice } = bot.src('client');
    await bot.setSetting('bot.users', [OTHERAlt.user]);
    await bot.setSetting('bot.users.limits', [`${OTHERAlt.user}=/ping:2`]);
    await bot.setSetting('usage.footer', false);
    const who = { number: OTHERAlt.user, chatId: OTHERAlt.jid, isGroup: false };
    const used = async () => (await usage.limitsWithUsage(who))[0].used;
    const run = async (final) => {
        const msg = { reply: async () => ({ edit: async () => true }) };
        await usage.withLimit({ msg, who, cmds: ['/ping'], params: 'x' }, async () => {
            const notice = await msg.reply('⏳ Processando o /ping, aguarde.');
            await completeNotice(msg, notice, final);
        });
    };

    await run('❌ Erro no /ping: Your request was rejected by the safety system.');
    assert.equal(await used(), 0);
    await run('⚠️ nada a fazer');
    assert.equal(await used(), 0);
    await run('pong');
    assert.equal(await used(), 1);
});

test('o dono e os admins não têm limite', async () => {
    await bot.setSetting('bot.admins', [OTHERAlt.user]);
    await bot.setSetting('bot.users.limits', [`${OTHERAlt.user}=/ping:1`]);
    for (let i = 0; i < 3; i++) assert.deepEqual(await own('/ping'), ['pong']);
    for (let i = 0; i < 3; i++) assert.deepEqual(await bot.replyAlt('/ping', OWNER_CHAT), ['pong']);
});

test('chamadas ao mesmo tempo não passam do limite', async () => {
    await bot.replyAlt('/bot +u /Fulano/ +cmd /ping +limit 2', OWNER_CHAT);
    await bot.setSetting('usage.footer', false);
    const beforeAlt = bot.client.sent.length;
    await Promise.all([1, 2, 3, 4].map(() => own('/ping')));
    const texts = bot.client.sent.slice(beforeAlt).map(e => String(e.content));
    assert.equal(texts.filter(x => x === 'pong').length, 2);
    assert.equal(texts.filter(x => x.startsWith('🚫')).length, 2);
});

test('/usage mostra o uso e quando renova; -l lista os últimos usos; outros: só admin', async () => {
    await bot.replyAlt('/bot +u /Fulano/ +cmd /ping +limit 3/dia', OWNER_CHAT);
    await own('/ping');
    const [r] = await own('/usage');
    assert.match(r, /^⏱️ \*Limites de uso\*\n• \/ping {2}1\/3 por dia · renova /);
    const [log] = await own('/usage -l');
    assert.match(log, /^🕘 \*Últimas chamadas que contaram\*\n• .* · \/ping/);
    assert.match((await own('/usage /Beltrano/'))[0], /Só o dono e os admins/);
    assert.match((await bot.replyAlt(`/usage +${OTHERAlt.user}`, OWNER_CHAT))[0], /\/ping {2}1\/3 por dia/);
    assert.match((await bot.replyAlt('/usage', OWNER_CHAT))[0], /não tem limites|Você não tem/);
});

test('o /whois do usuário mostra os limites com o uso', async () => {
    await bot.replyAlt('/bot +u /Fulano/ +cmd /ping +limit 3/sem', OWNER_CHAT);
    await own('/ping');
    const [w] = await bot.replyAlt(`/whois +${OTHERAlt.user}`, OWNER_CHAT);
    assert.match(w, /⏱️ \/ping {2}1\/3 por semana · renova /);
});

test('/bot -list-users mostra o limite; -limit /ping tira; o -u apaga os limites', async () => {
    await bot.replyAlt('/bot +u /Fulano/ +cmd /ping,/uptime +limit 4/dia', OWNER_CHAT);
    assert.match((await bot.replyAlt('/bot -lu', OWNER_CHAT))[0], /⏱️ \/ping 4 por dia, \/uptime 4 por dia/);

    assert.match((await bot.replyAlt('/bot -limit /ping /Fulano/', OWNER_CHAT))[0], /sem limite: \/ping/);
    assert.deepEqual(bot.getSetting('bot.users.limits'), [`${OTHERAlt.user}=/uptime:4/day`]);

    await bot.replyAlt('/bot -u /Fulano/', OWNER_CHAT);
    assert.deepEqual(bot.getSetting('bot.users.limits'), []);
});

test('erros do +limit: sem +cmd, formato, comando de dono e quem não é usuário', async () => {
    assert.match((await bot.replyAlt('/bot +u /Fulano/ +limit 5', OWNER_CHAT))[0], /precisa dos comandos/);
    assert.match((await bot.replyAlt('/bot +u /Fulano/ +cmd /ping +limit cinco', OWNER_CHAT))[0], /limite inválido/);
    assert.match((await bot.replyAlt('/bot +u /Fulano/ +cmd /ping +limit 5/ano', OWNER_CHAT))[0], /período inválido/);
    assert.match((await bot.replyAlt('/bot +cmd /set +limit 5 /Fulano/', OWNER_CHAT))[0], /não dá para liberar|admin/i);
    assert.deepEqual(bot.getSetting('bot.users.limits'), []);
});

test('o setting bot.users.limits valida o formato e normaliza', async () => {
    await bot.setSetting('bot.users.limits', [`${OTHERAlt.user}=ping:5/dia`]);
    assert.deepEqual(bot.getSetting('bot.users.limits'), [`${OTHERAlt.user}=/ping:5/day`]);
    await assert.rejects(bot.setSetting('bot.users.limits', [`${OTHERAlt.user}=/ping`]));
    await assert.rejects(bot.setSetting('bot.users.limits', [`${OTHERAlt.user}=/set:5`]));
});

test('limite do grupo é coletivo; o da pessoa naquele grupo vale primeiro', async () => {
    const { GROUP } = bot;
    await bot.setSetting('bot.users', [GROUP]);
    await bot.setSetting('bot.users.limits', [`${GROUP}=/ping:2`]);
    await bot.setSetting('usage.footer', false);
    assert.deepEqual(await own('/ping', { chat: GROUP }), ['pong']);
    assert.deepEqual(await bot.replyAlt('/ping', { de: OWNER.jid.replace('0000', '9999'), chat: GROUP }), ['pong']);
    assert.match((await own('/ping', { chat: GROUP }))[0], /^🚫/);
});

test('/usage -all: o consumo de todos (ranking por pessoa e por comando); só dono e admins', async () => {
    const nowAlt = Date.now();
    const log = (item, cmd, when = nowAlt) => bot.dbRun('INSERT INTO usage_log (item, cmd, used_at) VALUES (?, ?, ?)', [item, cmd, when]);
    assert.match((await bot.replyAlt('/usage -a', OWNER_CHAT))[0], /Nenhuma chamada com limite nos últimos 90 dias/);

    for (let i = 0; i < 3; i++) await log(OTHERAlt.user, '/gpt');
    await log(`${OTHERAlt.user}:120363000000000009@g.us`, '/tldr');        // a person naquele group soma nela
    await log('5521922222222', '/gpt');
    await log('120363000000000009@g.us', '/draw');                       // group limit: shows up as a group
    await log(OTHERAlt.user, '/gpt', nowAlt - 200 * 24 * 3600_000);          // outside the 90-day window

    const [r] = await bot.replyAlt('/usage -a', OWNER_CHAT);
    assert.match(r, /^📊 \*Consumo de todos\* \(últimos 90 dias, 6 chamadas\)\n1\. 👤 Fulano — 4 \(\/gpt 3, \/tldr 1\)\n/);
    assert.match(r, /\n2\. (👤 \+5521922222222 — 1 \(\/gpt 1\)|👥 .* — 1 \(\/draw 1\))\n/);
    assert.match(r, /\*Por comando:\* \/gpt 4 · \/tldr 1 · \/draw 1$|\*Por comando:\* \/gpt 4 · (\/draw 1 · \/tldr 1|\/tldr 1 · \/draw 1)$/);

    await bot.setSetting('bot.users', [OTHERAlt.user]);
    assert.match((await own('/usage -a'))[0], /Só o dono e os admins/);
});
