/*
 * API HTTP local e servidor MCP (experimental): src/api.js
 */
const bot = require('./helpers/bot');

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { createServidor, TOOLS, restartSendings } = bot.src('api');
const { OTHERAlt } = bot;
const KEY = 'chave-de-teste-bem-longa-0123456789';

let servidor;
let base;

before(async () => {
    servidor = createServidor();
    await new Promise(r => servidor.listen(0, '127.0.0.1', r));
    base = 'http://127.0.0.1:' + servidor.address().port;
});

after(() => new Promise(r => servidor.close(r)));

beforeEach(async () => {
    await bot.restart();
    restartSendings();
    await bot.setSetting('api.key', KEY);
    await bot.setSetting('mcp.enabled', true);
    bot.client.getNumberId = async (n) => ({ _serialized: n + '@c.us' });
});

const auth = { authorization: 'Bearer ' + KEY };
const post = (pathAlt, body, headers = auth) => fetch(base + pathAlt, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body)
});
const get = (pathAlt, headers = auth) => fetch(base + pathAlt, { headers });
const rpc = async (method, params, id = 1) => (await post('/mcp', { jsonrpc: '2.0', id, method, params })).json();

test('/health: sem chave; o resto exige a chave (Bearer ou X-API-Key), e sem api.key ninguém entra', async () => {
    assert.deepEqual(await (await get('/health', {})).json(), { ok: true, connected: true });

    assert.equal((await get('/status', {})).status, 401);
    assert.equal((await get('/status', { authorization: 'Bearer errada' })).status, 401);
    assert.equal((await get('/status')).status, 200);
    assert.equal((await get('/status', { 'x-api-key': KEY })).status, 200);

    await bot.setSetting('api.key', '');
    assert.equal((await get('/status', { authorization: 'Bearer ' })).status, 401);
    assert.equal((await get('/status', {})).status, 401);
});

test('/status e rota desconhecida', async () => {
    const s = await (await get('/status')).json();
    assert.equal(s.name, 'zapbot');
    assert.equal(s.connected, true);
    assert.equal(s.mcp, true);
    assert.equal((await get('/nada')).status, 404);
});

test('/notes: as mais novas primeiro, com limite', async () => {
    await bot.dbRun("INSERT INTO notes (text, created_at) VALUES ('primeira', 1), ('segunda', 2), ('terceira', 3)");
    const allAlt = await (await get('/notes')).json();
    assert.deepEqual(allAlt.map(n => n.text), ['terceira', 'segunda', 'primeira']);
    assert.equal((await (await get('/notes?limit=1')).json()).length, 1);
});

test('/send: só para o seu chat e para o api.sendTo; erros de entrada', async () => {
    const my = bot.OWNER.user;
    const ok = await post('/send', { to: my, text: 'oi' });
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), { ok: true, to: my + '@c.us' });
    assert.equal(bot.client.enviadas.at(-1).content, 'oi');

    const denied = await post('/send', { to: OTHERAlt.user, text: 'oi' });
    assert.equal(denied.status, 403);
    assert.match((await denied.json()).error, /api\.sendTo/);

    await bot.setSetting('api.sendTo', [OTHERAlt.user]);
    assert.equal((await post('/send', { to: '+' + OTHERAlt.user, text: 'agora vai' })).status, 200);

    await bot.setSetting('api.sendTo', ['120363000000000009@g.us']);
    assert.equal((await post('/send', { to: '120363000000000009@g.us', text: 'grupo' })).status, 200);

    assert.equal((await post('/send', { to: my })).status, 400, 'sem texto');
    assert.equal((await post('/send', { to: 'quem', text: 'x' })).status, 400, 'destino inválido');
    assert.equal((await post('/send', { to: my, text: 'x'.repeat(4001) })).status, 400, 'texto grande');
    assert.equal((await fetch(base + '/send', { method: 'POST', headers: auth, body: '{' })).status, 400, 'JSON inválido');
});

test('/send: "all" libera qualquer destino; número fora do WhatsApp dá 404; desconectado dá 503', async () => {
    await bot.setSetting('api.sendTo', ['all']);
    assert.equal((await post('/send', { to: OTHERAlt.user, text: 'x' })).status, 200);

    bot.client.getNumberId = async () => null;
    assert.equal((await post('/send', { to: '5511900000000', text: 'x' })).status, 404);

    bot.estado = bot.src('state').estado;
    bot.estado.pronto = false;
    assert.equal((await post('/send', { to: bot.OWNER.user, text: 'x' })).status, 503);
    bot.estado.pronto = true;
});

test('/send: no máximo 10 por minuto', async () => {
    for (let i = 0; i < 10; i++) assert.equal((await post('/send', { to: bot.OWNER.user, text: 'm' + i })).status, 200);
    assert.equal((await post('/send', { to: bot.OWNER.user, text: 'm10' })).status, 429);
});

test('/mcp: initialize, tools/list (com a marca EXPERIMENTAL) e ping; sem mcp.enabled, 404', async () => {
    const init = await rpc('initialize', { protocolVersion: '2025-03-26' });
    assert.equal(init.result.protocolVersion, '2025-03-26');
    assert.equal(init.result.serverInfo.name, 'zapbot');
    assert.deepEqual(init.result.capabilities, { tools: {} });
    assert.equal((await rpc('initialize', { protocolVersion: '1999-01-01' })).result.protocolVersion, '2025-06-18');

    const list = await rpc('tools/list');
    assert.deepEqual(list.result.tools.map(t => t.name), ['send_message', 'list_notes', 'get_note', 'get_status']);
    assert.ok(TOOLS.every(t => t.description.startsWith('[EXPERIMENTAL]')));
    assert.deepEqual((await rpc('ping')).result, {});
    assert.equal((await rpc('nao/existe')).error.code, -32601);

    const notification = await post('/mcp', { jsonrpc: '2.0', method: 'notifications/initialized' });
    assert.equal(notification.status, 202);

    await bot.setSetting('mcp.enabled', false);
    assert.equal((await post('/mcp', { jsonrpc: '2.0', id: 1, method: 'ping' })).status, 404);
});

test('/mcp tools/call: send_message (com as mesmas regras), list_notes, get_note, get_status', async () => {
    const call = async (name, args) => (await rpc('tools/call', { name, arguments: args })).result;
    const textAlt = (r) => JSON.parse(r.content[0].text);

    const sentAlt = await call('send_message', { to: bot.OWNER.user, text: 'pelo MCP' });
    assert.equal(sentAlt.isError, undefined);
    assert.deepEqual(textAlt(sentAlt), { ok: true, to: bot.OWNER.user + '@c.us' });

    const denied = await call('send_message', { to: OTHERAlt.user, text: 'x' });
    assert.equal(denied.isError, true);
    assert.match(denied.content[0].text, /api\.sendTo/);

    await bot.dbRun("INSERT INTO notes (id, text, created_at) VALUES (7, 'uma nota', 5)");
    assert.equal(textAlt(await call('list_notes', { limit: 5 }))[0].text, 'uma nota');
    assert.equal(textAlt(await call('get_note', { id: 7 })).text, 'uma nota');
    assert.equal((await call('get_note', { id: 99 })).isError, true);
    assert.equal(textAlt(await call('get_status', {})).connected, true);
    assert.equal((await call('ferramenta_que_nao_existe', {})).isError, true);
});

test('settings: api.sendTo aceita telefone, grupo e all; api.port só portas altas', async () => {
    assert.deepEqual(await bot.setSetting('api.sendTo', ['+55 (21) 99999-9999', '120363000000000009@g.us', 'all']), ['5521999999999', '120363000000000009@g.us', 'all']);
    await assert.rejects(bot.setSetting('api.sendTo', 'abc'));
    await assert.rejects(bot.setSetting('api.port', 80));
    assert.equal(bot.getSetting('api.enabled'), false, 'desligada por padrão');
    assert.equal(bot.getSetting('mcp.enabled'), true);
    await bot.setSetting('mcp.enabled', false);
    assert.equal(bot.getSetting('api.host'), '127.0.0.1');
});
