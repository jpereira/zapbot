/*
 * The web interface (src/web): password, sessions, chats, messages with edits, deleted ones, reactions and media.
 */
const bot = require('./helpers/bot');

const { test, before, after, beforeEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createServer, resetWeb } = bot.src('web/server');
const { CONTACTS_DIR, MEDIA_DIR, NOTES_DIR, TMP_DIR } = bot.src('constants');
const crypto = require('node:crypto');
const { createHash } = bot.src('util/password');

const USER = 'jorge.admin';
const PASSWORD = 'uma-senha-bem-longa';
const CHAT = '5521999990001@c.us';
const GROUP = '120363000000000099@g.us';

let server;
let base;

before(async () => {
    server = createServer();
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(r => server.close(r)));

const insert = (id, chat, o = {}) => bot.dbRun(
    `INSERT INTO messages (id, chat_id, chat_name, is_group, sender_name, sender_number, body, type, timestamp, has_media, media_path, revoked, revoked_at, from_me)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, chat, o.chatName ?? null, o.group ? 1 : 0, o.sender ?? null, o.number ?? null, o.body ?? '', o.type ?? 'chat', o.at, o.media ? 1 : 0, o.media ?? null, o.deleted ? 1 : 0, o.deletedAt ?? null, o.fromMe ? 1 : 0]);

beforeEach(async () => {
    await bot.restart();
    resetWeb();
    await bot.setSetting('zapbot.web.login', USER);
    await bot.setSetting('zapbot.web.password', PASSWORD);
});

async function login(password = PASSWORD, user = USER) {
    const r = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: user, password }) });
    return { r, cookie: (r.headers.get('set-cookie') ?? '').split(';')[0] };
}
const get = (route, cookie) => fetch(base + route, { headers: cookie ? { cookie } : {} });

describe('password and session', () => {
    test('the setting stores only the scrypt hash; short passwords are refused', async () => {
        const saved = bot.getSetting('zapbot.web.password');
        assert.match(saved, /^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
        assert.ok(!saved.includes(PASSWORD));
        await assert.rejects(bot.setSetting('zapbot.web.password', 'curta'), /8/);
        await bot.setSetting('zapbot.web.password', createHash('outra-senha-longa'));
        assert.match(bot.getSetting('zapbot.web.password'), /^scrypt\$/);
    });

    test('without the cookie nothing but the page and the login is served', async () => {
        for (const route of ['/api/chats', '/api/messages?chat=x', '/api/media?id=x', '/api/photo?chat=x', '/api/chat?chat=x']) {
            assert.equal((await get(route)).status, 401, route);
        }
        assert.deepEqual(await (await get('/api/session')).json(), { authenticated: false, lang: bot.getSetting('zapbot.lang'), pageSize: 100, refreshSeconds: 15, needsCode: false, version: bot.src('version').versionWithCommit() });
        assert.equal((await get('/')).status, 200);
        assert.equal((await get('/app.js')).status, 200);
        assert.equal((await get('/etc/passwd')).status, 404);
        assert.equal((await get('/../package.json')).status, 404);
    });

    test('app.js and style.css: gzipped, revalidated by ETag (304 when unchanged); the page itself is never cached', async () => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'web', 'public', 'app.js'), 'utf8');
        const first = await fetch(base + '/app.js', { headers: { 'accept-encoding': 'gzip' } });
        assert.equal(first.status, 200);
        assert.equal(first.headers.get('content-encoding'), 'gzip');
        assert.equal(first.headers.get('cache-control'), 'no-cache');
        assert.equal(await first.text(), source, 'fetch inflates it back to the same file');
        const again = await fetch(base + '/app.js', { headers: { 'if-none-match': first.headers.get('etag') } });
        assert.equal(again.status, 304);
        assert.equal((await fetch(base + '/style.css', { headers: { 'if-none-match': '"other"' } })).status, 200);
        assert.equal((await get('/')).headers.get('cache-control'), 'no-store');
    });

    test('the right password sets an HttpOnly SameSite=Strict cookie that opens the API; logout closes it', async () => {
        const { r, cookie } = await login();
        assert.equal(r.status, 200);
        assert.match(r.headers.get('set-cookie'), /HttpOnly; SameSite=Strict; Path=\/; Max-Age=43200/);
        assert.equal((await get('/api/chats', cookie)).status, 200);
        assert.equal((await (await get('/api/session', cookie)).json()).authenticated, true);

        await fetch(`${base}/api/logout`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: '{}' });
        assert.equal((await get('/api/chats', cookie)).status, 401);
    });

    test('5 wrong passwords block the address, even for the right one', async () => {
        for (let i = 0; i < 5; i++) assert.equal((await login('errada-errada')).r.status, 401);
        const blocked = await login();
        assert.equal(blocked.r.status, 429);
        assert.ok((await blocked.r.json()).minutes > 0);
        assert.equal(blocked.cookie, '');
    });

    test('only configured proxy peers can supply the HTTPS scheme', async t => {
        const variable = 'ZAPBOT_WEB_TRUSTED_PROXIES';
        const previous = process.env[variable];
        t.after(() => {
            if (previous === undefined) delete process.env[variable];
            else process.env[variable] = previous;
        });
        await bot.setSetting('zapbot.web.trustProxy', true);
        const throughProxy = () => fetch(`${base}/api/login`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-forwarded-proto': 'https' },
            body: JSON.stringify({ login: USER, password: PASSWORD })
        });
        process.env[variable] = '192.0.2.2';
        const direct = await throughProxy();
        assert.equal(direct.status, 200);
        assert.doesNotMatch(direct.headers.get('set-cookie'), /; Secure/);
        process.env[variable] = '127.0.0.1';
        const trusted = await throughProxy();
        assert.equal(trusted.status, 200);
        assert.match(trusted.headers.get('set-cookie'), /; Secure/);
    });

    test('idle expiration ignores polling, honors user activity and keeps the absolute deadline', async () => {
        const clock = Date.now;
        let now = clock();
        Date.now = () => now;
        try {
            await bot.setSetting('zapbot.web.sessionTimeout', 2);
            await bot.setSetting('zapbot.web.sessionHours', 1);
            const idle = await login();
            const active = await login();
            now += 60_000;
            assert.equal((await get('/api/chats', idle.cookie)).status, 200);
            assert.equal((await get('/api/activity', idle.cookie)).status, 204);
            const touch = () => fetch(base + '/api/activity', {
                method: 'POST', headers: { cookie: active.cookie, 'X-Zapbot-Activity': '1' }
            });
            assert.equal((await touch()).status, 204);
            now += 60_000;
            assert.equal((await get('/api/chats', idle.cookie)).status, 401);
            assert.equal((await get('/api/chats', active.cookie)).status, 200);
            await bot.setSetting('zapbot.web.sessionTimeout', 0);
            now += 57 * 60_000;
            assert.equal((await touch()).status, 204);
            now += 60_000;
            assert.equal((await touch()).status, 401);
        } finally {
            Date.now = clock;
        }
    });

    test('/web -timeout reads, changes and disables the idle timeout', async () => {
        const self = { chat: bot.OWNER.jid };
        const [initial] = await bot.replyAlt('/web -timeout', self);
        assert.match(initial, /30 min/);
        await bot.replyAlt('/web -t 5', self);
        assert.equal(bot.getSetting('zapbot.web.sessionTimeout'), 5);
        await bot.replyAlt('/web -timeout off', self);
        assert.equal(bot.getSetting('zapbot.web.sessionTimeout'), 0);
    });

    test('/web lists and revokes sessions without exposing their cookies', async () => {
        const first = await login();
        const second = await login();
        const opts = { chat: bot.OWNER.jid };
        const [list] = await bot.replyAlt('/web -l', opts);
        const lines = list.split('\n');
        assert.equal(lines.length, 2);
        assert.match(lines[0], /^1\. \d{4}-/);
        assert.match(lines[1], /^2\. \d{4}-/);
        await bot.replyAlt('/web -d 1', opts);
        assert.equal((await get('/api/chats', first.cookie)).status, 401);
        assert.equal((await get('/api/chats', second.cookie)).status, 200);
        await bot.replyAlt('/web -d 1', opts);
        assert.equal((await get('/api/chats', second.cookie)).status, 200);
        await bot.replyAlt('/web -d 2', opts);
        assert.equal((await get('/api/chats', second.cookie)).status, 401);
        const third = await login();
        await bot.replyAlt('/web -destroy', opts);
        assert.equal((await get('/api/chats', third.cookie)).status, 401);
    });

    test('/web -p masks its password and revokes existing sessions', async () => {
        const { cookie } = await login();
        const secret = 'a new private password';
        const command = bot.createMessage({ text: `/web -p "${secret}"`, chat: bot.OWNER.jid });
        const [reply] = await bot.deliver(command);
        assert.equal(command.deletedFor, 'everyone');
        assert.equal(reply.options.quotedMessageId, undefined);
        const [saved] = await bot.dbAll('SELECT body FROM messages');
        assert.equal(saved.body, '/web ***');
        assert.equal((await get('/api/chats', cookie)).status, 401);
        assert.equal((await login(secret)).r.status, 200);
    });

    test('the login only takes JSON; the API is read-only; headers keep the page isolated', async () => {
        const form = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `password=${PASSWORD}` });
        assert.equal(form.status, 415);

        const { cookie } = await login();
        const put = await fetch(`${base}/api/chats`, { method: 'PUT', headers: { cookie } });
        assert.equal(put.status, 405);

        const page = await get('/');
        assert.match(page.headers.get('content-security-policy'), /default-src 'none'; script-src 'self'/);
        assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
        assert.equal(page.headers.get('x-frame-options'), 'DENY');
    });

    test('the login name is chosen by the owner: both the name and the password have to be right, and the answer is the same', async () => {
        const wrongName = await login(PASSWORD, 'outro.nome');
        const wrongPassword = await login('errada-errada', USER);
        assert.deepEqual([wrongName.r.status, wrongPassword.r.status], [401, 401]);
        assert.deepEqual(await wrongName.r.json(), await wrongPassword.r.json());
        assert.equal((await login(PASSWORD, '')).r.status, 401);
        const noName = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: PASSWORD }) });
        assert.equal(noName.status, 401);
        assert.equal((await login(PASSWORD, USER)).r.status, 200);

        await assert.rejects(bot.setSetting('zapbot.web.login', 'ab'), /3 a 40|3 to 40/);
        await assert.rejects(bot.setSetting('zapbot.web.login', 'tem espaço'), /3 a 40|3 to 40/);
        await bot.setSetting('zapbot.web.login', 'Maria_01');
        resetWeb();
        assert.equal((await login(PASSWORD, USER)).r.status, 401);
        assert.equal((await login(PASSWORD, 'Maria_01')).r.status, 200);
    });

    test('without the login or without the password the interface does not start', async () => {
        await bot.setSetting('zapbot.web.enabled', true);
        await bot.setSetting('zapbot.web.login', '');
        assert.equal(await bot.src('web/server').startWeb(), null);
    });

    test('ZAPBOT_WEB_ENABLED decides over the setting: true starts it, false stops it, empty leaves the setting', async () => {
        const server = bot.src('web/server');
        await bot.setSetting('zapbot.web.port', 38201);
        const before = process.env.ZAPBOT_WEB_ENABLED;
        try {
            process.env.ZAPBOT_WEB_ENABLED = 'false';
            await bot.setSetting('zapbot.web.enabled', true);
            assert.equal(await server.startWeb(), null, 'false wins over the setting on');

            process.env.ZAPBOT_WEB_ENABLED = '';
            await bot.setSetting('zapbot.web.enabled', false);
            assert.equal(await server.startWeb(), null, 'empty: the setting (off)');

            process.env.ZAPBOT_WEB_ENABLED = 'true';
            process.env.ZAPBOT_WEB_PORT = '38202';
            const started = await server.startWeb();
            try {
                assert.ok(started, 'true wins over the setting off');
                if (!started.listening) await new Promise(resolve => started.once('listening', resolve));
                assert.equal(started.address().port, 38202, 'ZAPBOT_WEB_PORT wins over the setting');
            } finally {
                await new Promise(resolve => started?.close(resolve) ?? resolve());
            }
            server.resetWeb();
        } finally {
            if (before === undefined) delete process.env.ZAPBOT_WEB_ENABLED; else process.env.ZAPBOT_WEB_ENABLED = before;
            delete process.env.ZAPBOT_WEB_PORT;
        }
    });

    test('/web enables and disables the web server without a bot restart', async () => {
        const web = bot.src('web/server');
        const self = { chat: bot.OWNER.jid };
        await bot.setSetting('zapbot.web.port', 38203);
        try {
            await bot.replyAlt('/web -e', self);
            assert.equal(web.isWebRunning(), true);
            await bot.replyAlt('/web -disable', self);
            assert.equal(web.isWebRunning(), false);
            assert.equal(bot.getSetting('zapbot.web.enabled'), false);
        } finally {
            await web.stopWeb();
        }
    });

    test('the settings page tells which web setting a variable decides', async () => {
        const { cookie } = await login();
        process.env.ZAPBOT_WEB_ENABLED = 'true';
        try {
            const data = await (await get('/api/lists/settings', cookie)).json();
            assert.deepEqual(data.web.overridden['zapbot.web.enabled'], { env: 'ZAPBOT_WEB_ENABLED', value: 'true' });
        } finally {
            delete process.env.ZAPBOT_WEB_ENABLED;
        }
        assert.deepEqual((await (await get('/api/lists/settings', cookie)).json()).web.overridden, process.env.ZAPBOT_WEB_HOST ? { 'zapbot.web.host': { env: 'ZAPBOT_WEB_HOST', value: process.env.ZAPBOT_WEB_HOST.trim() } } : {});
    });

    test('without the password setting the interface does not start', async () => {
        await bot.setSetting('zapbot.web.enabled', true);
        await bot.setSetting('zapbot.web.password', '');
        assert.equal(await bot.src('web/server').startWeb(), null);
    });
});

describe('chats and messages', () => {
    let cookie;
    beforeEach(async () => {
        ({ cookie } = await login());
        await insert('A1', CHAT, { chatName: '5521999990001', body: 'oi', at: 1000, number: '5521999990001', sender: 'Fulano (perfil)' });
        await insert('A2', CHAT, { chatName: 'Fulano (perfil)', body: 'tudo bem?', at: 1100, fromMe: true });
        await insert('A3', CHAT, { chatName: 'Fulano (perfil)', body: 'esta mensagem foi apagada', at: 1200, deleted: true, deletedAt: 1250, sender: 'Fulano (perfil)' });
        await insert('A4', CHAT, { chatName: 'Fulano (perfil)', body: 'texto novo', at: 1300, sender: 'Fulano (perfil)' });
        await insert('G1', GROUP, { chatName: 'Grupo da Família', group: true, body: 'bom dia', at: 2000, sender: 'Ciclano', number: '5521988880002' });
        await bot.dbRun("INSERT INTO message_edits (message_id, chat_id, old_body, new_body, edited_at) VALUES ('A4', ?, 'texto velho', 'texto novo', 1350)", [CHAT]);
        await bot.dbRun("INSERT INTO reactions VALUES ('A2', ?, ?, '👍', 1400)", ['5521999990001@c.us', CHAT]);
    });

    test('the chats come from the most recent, with the name (profile name, group name or the number), the last message and the counts', async () => {
        const { chats } = await (await get('/api/chats', cookie)).json();
        assert.deepEqual(chats.map(c => c.id), [GROUP, CHAT]);
        assert.equal(chats[0].name, 'Grupo da Família');
        assert.equal(chats[0].isGroup, true);
        assert.equal(chats[1].name, 'Fulano (perfil)');
        assert.deepEqual([chats[1].total, chats[1].deleted, chats[1].firstAt, chats[1].lastAt], [4, 1, 1000, 1300]);
        assert.equal(chats[1].last.body, 'texto novo');

        const filtered = (await (await get('/api/chats?q=fam', cookie)).json()).chats;
        assert.deepEqual(filtered.map(c => c.id), [GROUP]);
        assert.deepEqual((await (await get('/api/chats?q=9999', cookie)).json()).chats.map(c => c.id), [CHAT]);
    });

    test('renamed groups use the newest saved name and prefer the live subject', async () => {
        const group = '120363000000000098@g.us';
        await insert('G2', group, { chatName: 'Zzz nome antigo', group: true, body: 'texto da escalada', at: 2001 });
        await insert('G3', group, { chatName: 'Escaladas Clássicas', group: true, body: 'novo', at: 2002 });
        await insert('G4', group, { chatName: ' ', group: true, body: 'sem nome', at: 2003 });

        const chats = async () => (await (await get('/api/chats?q=escaladas', cookie)).json()).chats;
        assert.equal((await chats())[0].name, 'Escaladas Clássicas');
        const chat = async () => (await get('/api/chat?chat=' + encodeURIComponent(group), cookie)).json();
        assert.equal((await chat()).name, 'Escaladas Clássicas');
        const search = await (await get('/api/search?q=escalada', cookie)).json();
        assert.equal(search.results[0].chatName, 'Escaladas Clássicas');

        const original = bot.client.getChatById;
        const page = bot.client.pupPage;
        bot.client.pupPage = {};
        bot.client.getChatById = async id => id === group
            ? { name: 'Nome antigo no modelo', groupMetadata: { subject: 'Escaladas ao vivo' } }
            : original.call(bot.client, id);
        try {
            assert.equal((await chat()).name, 'Escaladas ao vivo');
        } finally {
            bot.client.pupPage = page;
            bot.client.getChatById = original;
        }
    });

    test('contact details use the chat history and expose verification only when available', async () => {
        const profile = async () => (await get('/api/contact?chat=' + encodeURIComponent(CHAT), cookie)).json();
        assert.equal((await get('/api/contact?chat=' + encodeURIComponent(CHAT))).status, 401);
        const group = await get('/api/contact?chat=' + encodeURIComponent(GROUP), cookie);
        assert.equal(group.status, 200, 'a group has details too');
        assert.equal((await group.json()).kind, 'group');
        assert.equal((await get('/api/contact?chat=5521999999998%40c.us', cookie)).status, 404);

        const offline = await profile();
        assert.equal(offline.name, 'Fulano (perfil)');
        assert.equal(offline.phone, '+5521999990001');
        assert.equal(offline.verified, null);

        const saved = bot.client.contacts.get(CHAT);
        const page = bot.client.pupPage;
        bot.client.contacts.set(CHAT, {
            id: { _serialized: CHAT }, name: 'Fulano salvo', pushname: 'Fulano no perfil',
            isBusiness: true, isMyContact: true, isBlocked: false, getAbout: async () => 'Recado',
            verifiedName: 'Empresa', businessProfile: { description: 'Atendimento' }
        });
        bot.client.pupPage = { evaluate: async () => true };
        try {
            const live = await profile();
            assert.deepEqual([live.name, live.about, live.verified, live.business, live.description],
                ['Fulano salvo', 'Recado', true, true, 'Atendimento']);
            bot.client.pupPage.evaluate = async () => false;
            assert.equal((await profile()).verified, false);
        } finally {
            if (saved) bot.client.contacts.set(CHAT, saved);
            else bot.client.contacts.delete(CHAT);
            bot.client.pupPage = page;
        }
    });

    test('a chat with only the number as the stored name shows +number', async () => {
        await insert('N1', '5521977770003@c.us', { chatName: '5521977770003', body: 'x', at: 3000 });
        const { chats } = await (await get('/api/chats', cookie)).json();
        assert.equal(chats.find(c => c.id === '5521977770003@c.us').name, '+5521977770003');
    });

    test('the history of a chat: span, size, deleted and edited', async () => {
        const info = await (await get(`/api/chat?chat=${CHAT}`, cookie)).json();
        assert.deepEqual([info.name, info.total, info.deleted, info.edited, info.firstAt, info.lastAt], ['Fulano (perfil)', 4, 1, 1, 1000, 1300]);
        assert.equal((await get('/api/chat?chat=nope@c.us', cookie)).status, 404);
    });

    test('the messages carry the deleted mark, the edits (before and after) and the reactions', async () => {
        const { messages, next } = await (await get(`/api/messages?chat=${CHAT}`, cookie)).json();
        assert.equal(next, null);
        assert.deepEqual(messages.map(m => m.id), ['A1', 'A2', 'A3', 'A4']);
        const byId = Object.fromEntries(messages.map(m => [m.id, m]));
        assert.equal(byId.A3.deleted, true);
        assert.equal(byId.A3.deletedAt, 1250);
        assert.equal(byId.A3.body, 'esta mensagem foi apagada');
        assert.deepEqual(byId.A4.edits, [{ old: 'texto velho', new: 'texto novo', at: 1350 }]);
        assert.deepEqual(byId.A2.reactions, ['👍']);
        assert.equal(byId.A2.fromMe, true);
        assert.equal(byId.A1.sender, 'Fulano (perfil)');
    });

    test('legacy JPEG previews are hidden while regular captions remain visible', async () => {
        const thumbnail = '/9j/4AAQSkZJRgABAQAAAQABAAD/2Q==';
        const chat = '5521999990933@c.us';
        await insert('legacy-preview', chat, { body: thumbnail, at: 3001, type: 'image' });
        await insert('real-caption', chat, { body: 'Foto da viagem', at: 3000, type: 'image' });
        await bot.dbRun('UPDATE messages SET quoted_id = ? WHERE id = ?', ['legacy-preview', 'real-caption']);
        const params = new URLSearchParams({ chat });
        const { messages } = await (await get('/api/messages?' + params, cookie)).json();
        assert.equal(messages[0].body, 'Foto da viagem');
        assert.equal(messages[0].quoted.body, '');
        assert.equal(messages[1].body, '');
        assert.deepEqual(messages[1].media, { missing: true });
        const { chats } = await (await get('/api/chats', cookie)).json();
        assert.equal(chats.find(item => item.id === chat).last.body, '');
        const search = new URLSearchParams({ q: thumbnail.slice(0, 18) });
        assert.deepEqual((await (await get('/api/search?' + search, cookie)).json()).results, []);
    });

    test('a search treats apostrophes, percent and underscores as literal data', async () => {
        const text = "O'Connor: 20%_off";
        await insert('literal', CHAT, { body: text, at: 3000 });
        await insert('similar', CHAT, { body: "O'Connor: 20xoff", at: 3001 });
        await insert('other-chat', GROUP, { body: text, at: 3002 });
        const params = new URLSearchParams({ chat: CHAT, q: text });
        const reply = await get('/api/messages?' + params, cookie);
        assert.equal(reply.status, 200);
        const { messages } = await reply.json();
        assert.deepEqual(messages.map(m => [m.id, m.body]), [['literal', text]]);
    });

    test('order, pages (cursor), period and text search', async () => {
        const ids = async (query) => (await (await get(`/api/messages?chat=${CHAT}&${query}`, cookie)).json()).messages.map(m => m.id);
        assert.deepEqual(await ids('order=desc'), ['A4', 'A3', 'A2', 'A1']);
        assert.deepEqual(await ids('from=1100&to=1200'), ['A2', 'A3']);
        assert.deepEqual(await ids('q=apagada'), ['A3']);
        assert.deepEqual(await ids('q=%25'), [], 'the % is not a wildcard');

        const first = await (await get(`/api/messages?chat=${CHAT}&limit=2`, cookie)).json();
        assert.deepEqual(first.messages.map(m => m.id), ['A1', 'A2']);
        const second = await (await get(`/api/messages?chat=${CHAT}&limit=2&cursor=${encodeURIComponent(first.next)}`, cookie)).json();
        assert.deepEqual(second.messages.map(m => m.id), ['A3', 'A4']);
        assert.equal(second.next, null);

        const recent = await (await get(`/api/messages?chat=${CHAT}&limit=2&order=desc`, cookie)).json();
        assert.deepEqual(recent.messages.map(m => m.id), ['A4', 'A3']);
        const older = await (await get(`/api/messages?chat=${CHAT}&limit=2&order=desc&cursor=${encodeURIComponent(recent.next)}`, cookie)).json();
        assert.deepEqual(older.messages.map(m => m.id), ['A2', 'A1']);
    });
});

describe('media', () => {
    let cookie;
    const folder = path.join(MEDIA_DIR, '2026', '11', '21');
    const file = (name, content) => {
        fs.mkdirSync(folder, { recursive: true });
        const full = path.join(folder, name);
        fs.writeFileSync(full, content);
        return full;
    };

    beforeEach(async () => {
        ({ cookie } = await login());
    });

    test('image and sticker are shown on the page; a document is always a download; the kept file of a deleted message too', async () => {
        await insert('M1', CHAT, { type: 'image', body: 'foto', at: 10, media: file('foto.jpg', 'JPEGDATA') });
        await insert('M2', CHAT, { type: 'sticker', at: 11, media: file('figurinha.webp', 'WEBPDATA') });
        await insert('M3', CHAT, { type: 'document', at: 12, media: file('contrato.html', '<script>alert(1)</script>') });
        await insert('M4', CHAT, { type: 'image', at: 13, media: file('apagada.png', 'PNGDATA'), deleted: true, deletedAt: 14 });

        const { messages } = await (await get(`/api/messages?chat=${CHAT}`, cookie)).json();
        const media = Object.fromEntries(messages.map(m => [m.id, m.media]));
        assert.equal(media.M1.mime, 'image/jpeg');
        assert.equal(media.M2.mime, 'image/webp');
        assert.equal(media.M3.mime, 'application/octet-stream');

        const photo = await get(media.M1.url, cookie);
        assert.equal(await photo.text(), 'JPEGDATA');
        assert.equal(photo.headers.get('content-type'), 'image/jpeg');
        assert.match(photo.headers.get('content-disposition'), /^inline/);
        assert.equal(photo.headers.get('content-security-policy'), 'sandbox');

        const download = await get(`${media.M1.url}&download=1`, cookie);
        assert.match(download.headers.get('content-disposition'), /^attachment; filename\*=UTF-8''foto\.jpg$/);

        const doc = await get(media.M3.url, cookie);
        assert.match(doc.headers.get('content-disposition'), /^attachment/);
        assert.equal(doc.headers.get('content-type'), 'application/octet-stream');

        assert.equal(await (await get(media.M4.url, cookie)).text(), 'PNGDATA');
    });

    test('Range works (video and audio seek) and a wrong range is refused', async () => {
        await insert('V1', CHAT, { type: 'video', at: 20, media: file('video.mp4', '0123456789') });
        const url = '/api/media?id=V1';
        const part = await fetch(base + url, { headers: { cookie, range: 'bytes=2-5' } });
        assert.equal(part.status, 206);
        assert.equal(part.headers.get('content-range'), 'bytes 2-5/10');
        assert.equal(await part.text(), '2345');
        const tail = await fetch(base + url, { headers: { cookie, range: 'bytes=-3' } });
        assert.equal(await tail.text(), '789');
        assert.equal((await fetch(base + url, { headers: { cookie, range: 'bytes=50-60' } })).status, 416);
    });

    test('a media that left the cache is flagged; a path outside the media folder is never served', async () => {
        await insert('L1', CHAT, { type: 'image', at: 30, media: path.join(folder, 'sumiu.jpg') });
        const outside = path.join(bot.CACHE_DIR, 'zapbot.db');
        fs.writeFileSync(path.join(bot.CACHE_DIR, 'segredo.txt'), 'SEGREDO');
        await insert('L2', CHAT, { type: 'document', at: 31, media: path.join(bot.CACHE_DIR, 'segredo.txt') });
        await insert('L3', CHAT, { type: 'document', at: 32, media: `../${path.basename(outside)}` });

        const { messages } = await (await get(`/api/messages?chat=${CHAT}`, cookie)).json();
        assert.deepEqual(messages.map(m => m.media), [{ missing: true }, { missing: true }, { missing: true }]);
        for (const id of ['L1', 'L2', 'L3']) assert.equal((await get(`/api/media?id=${id}`, cookie)).status, 404, id);
    });
});

describe('home, notes and the locked tags', () => {
    const crypto = require('node:crypto');
    const { NOTES_DIR } = bot.src('constants');
    const SECRET = 'senha-da-tag-secreta';
    let cookie;

    // What /notes -lock stores: scrypt key, aes-256-gcm, "enc:v1:" + base64(iv + tag + body)
    const seal = (text, key) => {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        const body = Buffer.concat([cipher.update(text), cipher.final()]);
        return Buffer.concat([iv, cipher.getAuthTag(), body]);
    };
    const note = (id, tag, text, extra = {}) => bot.dbRun(
        'INSERT INTO notes (id, text, created_at, tag, media_path, media_mime, alert_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [id, text, 1_700_000_000_000 + id, tag, extra.media ?? null, extra.mime ?? null, extra.alert ?? null]);

    beforeEach(async () => {
        ({ cookie } = await login());
        const salt = crypto.randomBytes(8);
        const key = crypto.scryptSync(SECRET, salt, 32);
        await bot.dbRun('INSERT INTO note_locks (tag, salt, verifier, created_at) VALUES (?, ?, ?, ?)',
            ['cofre', salt.toString('hex'), `enc:v1:${seal(Buffer.from('ok'), key).toString('base64')}`, 1]);
        await bot.dbRun("INSERT INTO note_tags VALUES ('ideias', 'coisas para fazer')");

        fs.mkdirSync(NOTES_DIR, { recursive: true });
        fs.writeFileSync(path.join(NOTES_DIR, '1_ab_foto.png'), 'PNGDATA');
        fs.writeFileSync(path.join(NOTES_DIR, '2_cd_segredo.png.enc'), seal(Buffer.from('SEGREDOPNG'), key));
        await note(1, 'ideias', 'Comprar pão\nna padaria https://example.com/pao', { media: path.join(NOTES_DIR, '1_ab_foto.png'), mime: 'image/png', alert: 1_700_000_999_000 });
        await note(2, 'cofre', `enc:v1:${seal(Buffer.from('a senha do banco é 1234'), key).toString('base64')}`, { media: path.join(NOTES_DIR, '2_cd_segredo.png.enc'), mime: 'image/png' });
        await note(3, null, 'nota solta');
    });

    test('/api/overview: counts, storage by kind and retention', async () => {
        await insert('O1', CHAT, { body: 'oi', at: 5, deleted: true });
        fs.rmSync(MEDIA_DIR, { recursive: true, force: true });
        fs.mkdirSync(MEDIA_DIR, { recursive: true });
        fs.writeFileSync(path.join(MEDIA_DIR, 'a.bin'), '12345');
        const data = await (await get('/api/overview', cookie)).json();
        assert.equal(data.counts.messages, 1);
        assert.equal(data.counts.deleted, 1);
        assert.deepEqual([data.counts.notes, data.counts.tags, data.counts.protectedTags], [3, 2, 1]);
        assert.equal(data.storage.media.files, 1);
        assert.equal(data.storage.media.bytes, 5);
        assert.ok(data.storage.database >= 0 && data.storage.total >= 5);
        assert.deepEqual(Object.keys(data.retention).sort(), ['deletedDays', 'editedDays', 'mediaDays', 'messageDays', 'reactionDays']);
        assert.equal(data.topChats, undefined, 'the home shows the statistics now, not a list of chats');
        assert.equal((await get('/api/overview')).status, 401);
    });

    test('the tags: counts, description, and the protected one comes locked', async () => {
        const { tags } = await (await get('/api/notes/tags', cookie)).json();
        assert.deepEqual(tags.map(t => [t.id, t.total, t.protected, t.unlocked]), [['cofre', 1, true, false], ['ideias', 1, false, false], ['@none', 1, false, false]]);
        const ideias = tags.find(t => t.tag === 'ideias');
        assert.equal(ideias.description, 'coisas para fazer');
        assert.equal(ideias.withMedia, 1);
        assert.equal(ideias.withAlert, 1);
    });

    test('the notes of a tag with image and alert; the locked tag shows no text and no file', async () => {
        const open = (await (await get('/api/notes?tag=ideias', cookie)).json()).notes;
        assert.equal(open[0].text, 'Comprar pão\nna padaria https://example.com/pao');
        assert.equal(open[0].alertAt, 1_700_000_999_000);
        assert.equal(await (await get(open[0].media.url, cookie)).text(), 'PNGDATA');

        const locked = (await (await get('/api/notes?tag=cofre', cookie)).json()).notes;
        assert.deepEqual([locked[0].locked, locked[0].text, locked[0].media], [true, '', null]);
        assert.equal((await get('/api/notes/media?id=2', cookie)).status, 403);
        assert.ok(!(await (await get('/api/notes', cookie)).text()).includes('1234'));

        assert.deepEqual((await (await get('/api/notes?tag=@none', cookie)).json()).notes.map(n => n.id), [3]);
        assert.deepEqual((await (await get('/api/notes?q=PADARIA', cookie)).json()).notes.map(n => n.id), [1]);
    });

    test('the password opens the tag for this login only (text and image decrypted in memory); lock closes it', async () => {
        const post = (route, body, c = cookie) => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json', cookie: c }, body: JSON.stringify(body) });
        assert.equal((await post('/api/notes/unlock', { tag: 'cofre', password: 'errada-errada' })).status, 401);
        assert.equal((await post('/api/notes/unlock', { tag: 'nao-existe', password: SECRET })).status, 404);
        assert.equal((await post('/api/notes/unlock', { tag: 'cofre', password: SECRET })).status, 200);

        const { notes } = await (await get('/api/notes?tag=cofre', cookie)).json();
        assert.equal(notes[0].text, 'a senha do banco é 1234');
        assert.equal(await (await get('/api/notes/media?id=2', cookie)).text(), 'SEGREDOPNG');
        assert.equal((await (await get('/api/notes/tags', cookie)).json()).tags.find(t => t.tag === 'cofre').unlocked, true);

        // another login does not get it, and the bot's chat session is not touched
        const other = (await login()).cookie;
        assert.equal((await (await get('/api/notes?tag=cofre', other)).json()).notes[0].locked, true);
        assert.equal(bot.src('notesLock').isUnlocked('cofre'), false);

        await post('/api/notes/lock', { tag: 'cofre' });
        assert.equal((await (await get('/api/notes?tag=cofre', cookie)).json()).notes[0].locked, true);
        assert.equal((await get('/api/notes/media?id=2', cookie)).status, 403);
    });

    test('5 wrong passwords of a tag block it; logout forgets the key', async () => {
        const post = (body, c = cookie) => fetch(`${base}/api/notes/unlock`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: c }, body: JSON.stringify(body) });
        for (let i = 0; i < 5; i++) await post({ tag: 'cofre', password: 'errada-errada' });
        assert.equal((await post({ tag: 'cofre', password: SECRET })).status, 429);

        resetWeb();
        ({ cookie } = await login());
        assert.equal((await post({ tag: 'cofre', password: SECRET })).status, 200);
        await fetch(`${base}/api/logout`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: '{}' });
        const again = (await login()).cookie;
        assert.equal((await (await get('/api/notes?tag=cofre', again)).json()).notes[0].locked, true);
    });

    test('the PDF: of a tag, of all; the locked ones stay out until unlocked', async () => {
        const one = await get('/api/notes/pdf?tag=ideias', cookie);
        assert.equal(one.headers.get('content-type'), 'application/pdf');
        assert.match(one.headers.get('content-disposition'), /attachment; filename\*=UTF-8''ZapBot_notes_tag-ideias_/);
        assert.equal(Buffer.from(await one.arrayBuffer()).subarray(0, 4).toString(), '%PDF');

        const all = await get('/api/notes/pdf', cookie);
        assert.equal(all.headers.get('x-skipped-locked'), 'cofre');
        assert.equal((await get('/api/notes/pdf?tag=cofre', cookie)).status, 404);

        await fetch(`${base}/api/notes/unlock`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ tag: 'cofre', password: SECRET }) });
        const unlocked = await get('/api/notes/pdf?tag=cofre', cookie);
        assert.equal(unlocked.status, 200);
        assert.equal(unlocked.headers.get('x-skipped-locked'), '');
        assert.deepEqual(fs.readdirSync(require('node:os').tmpdir()).filter(f => f.startsWith('zapbot-webpdf-')), [], 'no decrypted copy left behind');
    });
});

describe('alerts, shortcuts, schedule, stats and settings', () => {
    let cookie;
    beforeEach(async () => {
        ({ cookie } = await login());
    });
    const list = async (name) => (await (await get(`/api/lists/${name}`, cookie)).json()).sections;

    test('everything needs the login', async () => {
        for (const name of ['alerts', 'aliases', 'schedule', 'settings']) assert.equal((await get(`/api/lists/${name}`)).status, 401, name);
    });

    test('alerts: the price alerts, the /watch rules with their hits and the monitored contacts', async () => {
        await bot.dbRun("INSERT INTO price_alerts (kind, symbol, op, target, created_at, dest_name, message) VALUES ('crypto', 'BTC', '>', 96000, 1700000000000, 'Fulano', 'vender!')");
        await bot.setSetting('watch.rules', ['boleto', '/pix/i']);
        await bot.dbRun("INSERT INTO watch_hits (rule, message_id, timestamp) VALUES ('boleto', 'm1', 1700000000), ('boleto', 'm2', 1700000500)");
        await bot.dbRun("INSERT INTO monitor_contacts (contact_id, contact_name, created_at, last_status, alert_enabled) VALUES ('5521@c.us', 'Ciclano', 1, 'online', 1)");
        const [price, watch, monitor] = await list('alerts');
        assert.deepEqual(price.rows[0].slice(1, 4), ['crypto', 'BTC', '> 96000']);
        assert.equal(price.rows[0][6], '🔔 vender!');
        assert.equal(price.values[0].message, 'vender!', 'editing keeps the stored message without the display prefix');
        await bot.dbRun("INSERT INTO price_alerts (kind, symbol, op, target, created_at) VALUES ('acao', 'USD', '>', 6.2, 1), ('acao', 'EUR', '<', 5.555, 1), ('crypto', 'ADA', '<', 0.00012, 1)");
        const targets = (await list('alerts'))[0];
        assert.deepEqual(targets.rows.slice(1).map(r => r[3]), ['> 6.20', '< 5.555', '< 0.00012'], 'a price keeps its cents');
        assert.equal(targets.values[1].rule, 'USD > 6.20');
        assert.deepEqual(price.rows[0][5], { text: 'Fulano', title: 'Fulano' }, 'the text, and the hover with the resolved name');
        assert.deepEqual(watch.rows.map(r => [r[0], r[3]]), [['boleto', 2], ['/pix/i', 0]]);
        assert.deepEqual([monitor.rows[0][0], monitor.rows[0][1], monitor.rows[0][4]], ['Ciclano', 'online', { bell: true, text: 'on', icon: '🔔', play: false }]);
    });

    test('shortcuts and schedule', async () => {
        await bot.dbRun("INSERT INTO command_aliases (name, description, command, quiet, owner_only) VALUES ('/dolar', 'cotação', '/stocks USD', 1, 1)");
        const [aliases] = await list('aliases');
        assert.deepEqual(aliases.rows[0], ['/dolar', '/stocks USD', 'cotação', '🔇🔒']);

        await bot.dbRun("INSERT INTO schedules (kind, chat_id, chat_name, text, due_at, repeat, created_at, paused) VALUES ('agendar', 'x@c.us', 'Fulano', 'bom dia', 1900000000000, 'daily', 1, 1)");
        const [schedule] = await list('schedule');
        assert.deepEqual([schedule.rows[0][1], schedule.rows[0][3], schedule.rows[0][5], schedule.rows[0][6]], ['agendar', 'daily', '⏰ bom dia', { bell: false, text: 'off', icon: '⏸️', play: true }]);
        assert.deepEqual(schedule.rows[0][4], { text: 'Fulano', title: 'Fulano (x@c.us)' });

        await bot.setSetting('cron.msgPrepend', ' ⏰ ~> ');
        const [scheduleWithPrefix] = await list('schedule');
        assert.equal(scheduleWithPrefix.rows[0][5], ' ⏰ ~> bom dia');
        await bot.dbRun("INSERT INTO schedules (kind, chat_id, chat_name, text, due_at, repeat, created_at, paused) VALUES ('lembrete', 'x@c.us', 'Fulano', 'revisar agenda', 1900000000000, 'daily', 1, 0)");
        const [scheduleWithReminder] = await list('schedule');
        assert.equal(scheduleWithReminder.rows[1][5], ' ⏰ ~> revisar agenda');
        assert.equal(scheduleWithReminder.values[1].text, 'revisar agenda', 'editing keeps the saved text unchanged');
    });

    test('stats: totals against the previous period, a filled day by day series, hours, the weekday x hour heatmap, chats and people', async () => {
        const day = (ago) => new Date(Date.now() - ago * 86_400_000).toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo', hour12: false }).slice(0, 10);
        const insertStat = (chat, d, hour, sender, msgs, media = 1, deleted = 0) => bot.dbRun('INSERT INTO stats (chat_id, chat_name, day, hour, sender_id, sender_name, msgs, media, deleted, edited) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)', [chat, 'Grupo X', d, hour, sender, sender, msgs, media, deleted]);
        await insertStat(GROUP, day(0), 10, 'Ana', 30, 5, 2);
        await insertStat(GROUP, day(0), 11, 'Bia', 10, 0);
        await insertStat(GROUP, day(2), 10, 'Ana', 20, 4);
        await insertStat(GROUP, day(9), 9, 'Ana', 10, 1);   // the previous period of 7 days
        await insertStat(GROUP, '2001-01-01', 11, 'Bia', 999); // far away: in no period

        const data = await (await get('/api/stats?days=7', cookie)).json();
        assert.equal(data.days, 7);
        assert.equal(data.perDay.length, 7, 'every day of the period, with zeros where nothing happened');
        assert.deepEqual(data.perDay.map(d => d.day), Array.from({ length: 7 }, (_, i) => day(6 - i)));
        assert.deepEqual([data.perDay.at(-1).msgs, data.perDay.at(-3).msgs, data.perDay.at(-2).msgs], [40, 20, 0]);
        assert.deepEqual([data.totals.msgs, data.totals.media, data.totals.deleted, data.totals.activeDays, data.totals.perDay], [60, 9, 2, 2, 8.6]);
        assert.deepEqual(data.totals.busiestDay, { day: day(0), msgs: 40 });
        assert.equal(data.totals.peakHour, 10);
        assert.equal(data.previous.msgs, 10, 'the 7 days before');

        assert.equal(data.perHour.length, 24);
        assert.deepEqual([data.perHour[10], data.perHour[11], data.perHour[9]], [50, 10, 0]);
        assert.equal(data.heatmap.length, 7);
        assert.equal(data.heatmap.flat().reduce((n, v) => n + v, 0), 60);
        const weekday = new Date(`${day(0)}T12:00:00Z`).getUTCDay();
        assert.equal(data.heatmap[weekday][10], 30 + (new Date(`${day(2)}T12:00:00Z`).getUTCDay() === weekday ? 20 : 0));

        assert.deepEqual([data.chats[0].name, data.chats[0].msgs, data.chats[0].media], ['Grupo X', 60, 9]);
        assert.deepEqual(data.people.map(p => [p.name, p.msgs]), [['Ana', 50], ['Bia', 10]]);

        assert.equal((await (await get('/api/stats?days=99999', cookie)).json()).days, 365);
        assert.equal((await (await get('/api/stats', cookie)).json()).days, 30);
        assert.equal((await get('/api/stats?days=7')).status, 401);
        const empty = await (await get('/api/stats?days=1', cookie)).json();
        assert.equal(empty.totals.peakHour !== null, true);
    });

    test('settings: all of them, read-only, with the secret ones masked (and the password hash never shown)', async () => {
        await bot.setSetting('zapbot.api.key', 'chave-secreta-muito-longa-1234');
        const [section] = await list('settings');
        const row = (key) => section.rows.find(r => r[0] === key);
        assert.ok(section.rows.length > 100);
        assert.deepEqual(row('zapbot.web.pageSize').slice(0, 3), ['zapbot.web.pageSize', '100', '100']);
        assert.equal(row('zapbot.api.key')[1], '••••••••');
        assert.equal(row('zapbot.web.password')[1], '••••••••');
        assert.equal(row('zapbot.web.password')[2], '');
        const text = JSON.stringify(section);
        assert.ok(!text.includes('chave-secreta-muito-longa') && !text.includes('scrypt$'));

        const put = await fetch(`${base}/api/lists/settings`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: '{}' });
        assert.equal(put.status, 405);
    });
});

describe('replies, mentions, reaction changes, search, export and the code (TOTP)', () => {
    const totp = bot.src('util/totp');
    let cookie;
    beforeEach(async () => {
        ({ cookie } = await login());
        await insert('Q1', CHAT, { body: 'a mensagem original', at: 100, sender: 'Fulano', number: '5521999990001' });
        await bot.dbRun("INSERT INTO messages (id, chat_id, body, type, timestamp, quoted_id, from_me) VALUES ('Q2', ?, 'respondendo', 'chat', 200, 'Q1', 1)", [CHAT]);
        await bot.dbRun("INSERT INTO messages (id, chat_id, body, type, timestamp, quoted_id) VALUES ('Q3', ?, 'sem o original', 'chat', 300, 'SUMIU')", [CHAT]);
        await bot.dbRun("INSERT INTO messages (id, chat_id, body, type, timestamp, mentions) VALUES ('Q4', ?, 'oi @5521999990001 tudo bem', 'chat', 400, NULL)", [CHAT]);
    });

    test('a reply carries the quoted message (or says it is gone); a mention shows the name', async () => {
        const { messages } = await (await get(`/api/messages?chat=${CHAT}`, cookie)).json();
        const byId = Object.fromEntries(messages.map(m => [m.id, m]));
        assert.deepEqual(byId.Q2.quoted, { sender: 'Fulano', fromMe: false, body: 'a mensagem original', type: 'chat', deleted: false });
        assert.deepEqual(byId.Q3.quoted, { missing: true });
        assert.equal(byId.Q1.quoted, null);
        assert.equal(byId.Q4.body, 'oi @Fulano tudo bem');
    });

    test('the reaction changes of a message (changed and removed)', async () => {
        await bot.dbRun("INSERT INTO reaction_changes (message_id, chat_id, sender_name, old_reaction, new_reaction, changed_at) VALUES ('Q1', ?, 'Ciclano', '👍', '🔥', 150), ('Q1', ?, 'Ciclano', '🔥', '', 160)", [CHAT, CHAT]);
        const { messages } = await (await get(`/api/messages?chat=${CHAT}&to=150`, cookie)).json();
        assert.deepEqual(messages[0].reactionChanges, [{ by: 'Ciclano', old: '👍', new: '🔥', at: 150 }, { by: 'Ciclano', old: '🔥', new: '', at: 160 }]);
    });

    test('reaction refresh returns changes for existing messages in the selected chat', async () => {
        await bot.dbRun('INSERT INTO reactions VALUES (?, ?, ?, ?, ?)', ['Q1', bot.OTHERAlt.jid, CHAT, '👍', 150]);
        const refresh = (chat, session = cookie) => fetch(base + '/api/reactions', {
            method: 'POST', headers: { cookie: session, 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat, ids: ['Q1', 'Q2'] })
        });
        const before = await (await refresh(CHAT)).json();
        const item = (data, id) => data.messages.find(message => message.id === id);
        assert.deepEqual(item(before, 'Q1').reactions, ['👍']);

        await bot.dbRun('DELETE FROM reactions WHERE message_id = ?', ['Q1']);
        await bot.dbRun(`INSERT INTO reaction_changes
            (message_id, chat_id, sender_number, old_reaction, new_reaction, changed_at)
            VALUES (?, ?, ?, ?, ?, ?)`, ['Q1', CHAT, '5521999990002', '👍', '', 160]);
        const after = await (await refresh(CHAT)).json();
        assert.deepEqual(item(after, 'Q1'), {
            id: 'Q1', reactions: [], reactionChanges: [{ by: '+5521999990002', old: '👍', new: '', at: 160 }]
        });
        assert.deepEqual(item(after, 'Q2').reactionChanges, []);
        assert.deepEqual(await (await refresh(GROUP)).json(), { messages: [] });
        assert.equal((await refresh(CHAT, '')).status, 401);
    });

    test('the search across every chat (text, 2+ letters), most recent first, % is not a wildcard', async () => {
        await insert('S1', GROUP, { chatName: 'Grupo da Família', group: true, body: 'o boleto venceu', at: 500, sender: 'Ciclano' });
        await insert('S2', CHAT, { body: 'outro BOLETO aqui', at: 600, sender: 'Fulano' });
        const { results } = await (await get('/api/search?q=boleto', cookie)).json();
        assert.deepEqual(results.map(r => [r.id, r.chatName]), [['S2', '+5521999990001'], ['S1', 'Grupo da Família']]);
        assert.deepEqual((await (await get('/api/search?q=%25', cookie)).json()).results, []);
        assert.deepEqual((await (await get('/api/search?q=b', cookie)).json()).results, []);
        assert.equal((await get('/api/search?q=boleto')).status, 401);
    });

    test('the PDF of a chat (with the period), with the deleted and the edited marked', async () => {
        await insert('E1', CHAT, { body: 'apaguei', at: 700, deleted: true, deletedAt: 710 });
        await bot.dbRun("INSERT INTO message_edits (message_id, chat_id, old_body, new_body, edited_at) VALUES ('Q1', ?, 'antes', 'depois', 120)", [CHAT]);
        const r = await get(`/api/export?chat=${CHAT}&from=1&to=800`, cookie);
        assert.equal(r.status, 200);
        assert.equal(r.headers.get('content-type'), 'application/pdf');
        assert.match(r.headers.get('content-disposition'), /ZapBot_chat_/);
        assert.equal(Number(r.headers.get('x-messages')), 5);
        const pdf = Buffer.from(await r.arrayBuffer());
        assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
        assert.equal((await get('/api/export?chat=nope@c.us', cookie)).status, 404);
        assert.equal((await get(`/api/export?chat=${CHAT}`)).status, 401);
    });

    test('TOTP: the RFC 6238 vector, and with zapbot.web.totp the login asks for the code too', async () => {
        const rfc = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // "12345678901234567890"
        assert.equal(totp.code(rfc, 59_000), '287082');
        assert.equal(totp.code(rfc, 1_111_111_109_000), '081804');
        assert.equal(totp.verify(rfc, '287082', 59_000), true);
        assert.equal(totp.verify(rfc, '287082', 59_000 + 30_000), true, 'the previous 30 s still counts');
        assert.equal(totp.verify(rfc, '287082', 59_000 + 120_000), false);
        assert.equal(totp.verify(rfc, 'abc', 59_000), false);
        assert.match(totp.newSecret(), /^[A-Z2-7]{32}$/);

        await bot.setSetting('zapbot.web.totp', rfc);
        resetWeb();
        assert.equal((await (await get('/api/session')).json()).needsCode, true);
        const post = (body) => fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: USER, ...body }) });
        const noCode = await post({ password: PASSWORD });
        assert.equal(noCode.status, 401);
        assert.equal((await noCode.json()).needsCode, true);
        assert.equal((await post({ password: PASSWORD, code: '000000' })).status, 401);
        assert.equal((await post({ password: 'errada-errada', code: totp.code(rfc) })).status, 401);
        assert.equal((await post({ password: PASSWORD, code: totp.code(rfc) })).status, 200);

        await assert.rejects(bot.setSetting('zapbot.web.totp', 'curto'), /base32/);
        await bot.setSetting('zapbot.web.totp', 'gezd gnbv gy3t qojq gezd gnbv gy3t qojq');
        assert.equal(bot.getSetting('zapbot.web.totp'), rfc);
    });
});

describe('changing things from the page (shortcuts, alerts, /watch, monitor, schedule, settings)', () => {
    let cookie;
    beforeEach(async () => {
        ({ cookie } = await login());
    });
    const manage = async (body, c = cookie) => {
        const r = await fetch(`${base}/api/manage`, { method: 'POST', headers: { 'content-type': 'application/json', ...(c ? { cookie: c } : {}) }, body: JSON.stringify(body) });
        return { status: r.status, body: await r.json() };
    };

    test('it needs the login and JSON; an unknown kind or operation is refused', async () => {
        assert.equal((await manage({ section: 'alias', op: 'delete', id: '/x' }, null)).status, 401);
        const form = await fetch(`${base}/api/manage`, { method: 'POST', headers: { 'content-type': 'text/plain', cookie }, body: '{}' });
        assert.equal(form.status, 415);
        assert.equal((await manage({ section: 'database', op: 'drop' })).status, 400);
        assert.equal((await manage({ section: 'alias', op: 'drop' })).status, 400);
    });

    test('shortcuts: add, edit (and rename) and delete, with the same checks as /alias; a refused edit keeps the old one', async () => {
        const row = (name) => bot.dbGet('SELECT * FROM command_aliases WHERE name = ?', [name]);
        const added = await manage({ section: 'alias', op: 'add', name: '/dolar', command: '/stocks USD', description: 'cotação', quiet: true, ownerOnly: false });
        assert.equal(added.status, 200);
        assert.deepEqual([(await row('/dolar')).command, (await row('/dolar')).description, (await row('/dolar')).quiet, (await row('/dolar')).owner_only], ['/stocks USD', 'cotação', 1, 0]);

        const edited = await manage({ section: 'alias', op: 'edit', oldName: '/dolar', name: '/dolar2', command: '/stocks EUR', description: 'euro', quiet: false, ownerOnly: true });
        assert.equal(edited.status, 200);
        assert.equal(await row('/dolar'), undefined);
        assert.deepEqual([(await row('/dolar2')).command, (await row('/dolar2')).owner_only], ['/stocks EUR', 1]);

        // a name that is a command: refused, and the shortcut that was there stays
        const refused = await manage({ section: 'alias', op: 'edit', oldName: '/dolar2', name: '/ping', command: '/stocks EUR' });
        assert.equal(refused.status, 400);
        assert.ok(refused.body.error.length > 0);
        assert.equal((await row('/dolar2')).command, '/stocks EUR');
        assert.equal((await manage({ section: 'alias', op: 'add', name: 'sem-barra', command: '/ping' })).status, 400);
        assert.equal((await manage({ section: 'alias', op: 'add', name: '/aspas', command: '/ping', description: 'com "aspas"' })).status, 400);

        assert.equal((await manage({ section: 'alias', op: 'delete', id: '/dolar2' })).status, 200);
        assert.equal(await row('/dolar2'), undefined);
        assert.equal((await manage({ section: 'alias', op: 'delete', id: '/dolar2' })).status, 400);

        const section = (await (await get('/api/lists/aliases', cookie)).json()).sections[0];
        assert.deepEqual(section.manage.fields.map(f => f.name), ['name', 'command', 'description', 'quiet', 'ownerOnly']);
    });

    test('price alerts: delete, and a wrong rule is refused with the same text as the command', async () => {
        await bot.dbRun("INSERT INTO price_alerts (kind, symbol, op, target, created_at) VALUES ('crypto', 'BTC', '>', 96000, 1)");
        const { id } = await bot.dbGet('SELECT id FROM price_alerts');
        const bad = await manage({ section: 'price', op: 'add', rule: 'BTC' });
        assert.equal(bad.status, 400);
        assert.equal((await manage({ section: 'price', op: 'add', kind: 'crypto', rule: 'isto não é uma regra' })).status, 400);
        assert.equal((await manage({ section: 'price', op: 'delete', id })).status, 200);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM price_alerts')).n, 0);
        assert.equal((await manage({ section: 'price', op: 'delete', id })).status, 400);
    });

    test('/watch rules: add, edit, delete; an invalid regex is refused', async () => {
        assert.equal((await manage({ section: 'watch', op: 'add', rule: 'boleto' })).status, 200);
        assert.equal((await manage({ section: 'watch', op: 'add', rule: '/(a+)+$/' })).status, 400);
        assert.equal((await manage({ section: 'watch', op: 'add', rule: '/[/' })).status, 400);
        assert.deepEqual(bot.getSetting('watch.rules'), ['boleto']);
        assert.equal((await manage({ section: 'watch', op: 'edit', oldRule: 'boleto', rule: '/pix/i' })).status, 200);
        assert.deepEqual(bot.getSetting('watch.rules'), ['/pix/i']);
        assert.equal((await manage({ section: 'watch', op: 'edit', oldRule: 'nao-existe', rule: 'x' })).status, 400);
        assert.equal((await manage({ section: 'watch', op: 'delete', id: '/pix/i' })).status, 200);
        assert.deepEqual(bot.getSetting('watch.rules'), []);
    });

    test('monitor: toggle the alert and delete', async () => {
        await bot.dbRun("INSERT INTO monitor_contacts (contact_id, contact_name, created_at) VALUES ('1@c.us', 'Ciclano', 1)");
        const { id } = await bot.dbGet('SELECT id FROM monitor_contacts');
        await manage({ section: 'monitor', op: 'toggle', id });
        assert.equal((await bot.dbGet('SELECT alert_enabled AS a FROM monitor_contacts')).a, 1);
        await manage({ section: 'monitor', op: 'toggle', id });
        assert.equal((await bot.dbGet('SELECT alert_enabled AS a FROM monitor_contacts')).a, 0);
        assert.equal((await manage({ section: 'monitor', op: 'add' })).status, 400);
        assert.equal((await manage({ section: 'monitor', op: 'delete', id })).status, 200);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM monitor_contacts')).n, 0);
    });

    test('schedule: add (in your own chat), edit, pause and delete', async () => {
        const dueAt = Date.now() + 3_600_000;
        bot.client.info = { wid: { _serialized: bot.OWNER.jid } };
        delete bot.client.info.wid; // not connected yet: no chat of yours
        assert.equal((await manage({ section: 'schedule', op: 'add', text: 'bom dia', dueAt, repeat: 'daily' })).status, 400);
        bot.client.info = { wid: { _serialized: bot.OWNER.jid } };
        try {
            assert.equal((await manage({ section: 'schedule', op: 'add', kind: 'agendar', text: 'bom dia', dueAt, repeat: 'daily' })).status, 200);
            const row = await bot.dbGet('SELECT * FROM schedules');
            assert.deepEqual([row.chat_id, row.text, row.due_at, row.repeat, row.kind, row.paused], [bot.OWNER.jid, 'bom dia', dueAt, 'daily', 'agendar', 0]);

            assert.equal((await manage({ section: 'schedule', op: 'edit', id: row.id, kind: 'agendar', text: 'boa tarde', dueAt: dueAt + 1000, repeat: 'weekly' })).status, 200);
            assert.deepEqual(Object.values(await bot.dbGet('SELECT text, due_at, repeat FROM schedules')), ['boa tarde', dueAt + 1000, 'weekly']);
            assert.equal((await manage({ section: 'schedule', op: 'edit', id: row.id, text: 'x', dueAt: 5, repeat: '' })).status, 400, 'not a date');
            assert.equal((await manage({ section: 'schedule', op: 'edit', id: row.id, text: 'x', dueAt, repeat: 'hourly' })).status, 400);
            assert.equal((await manage({ section: 'schedule', op: 'add', text: '', dueAt })).status, 400);

            await manage({ section: 'schedule', op: 'toggle', id: row.id });
            assert.equal((await bot.dbGet('SELECT paused AS p FROM schedules')).p, 1);
            assert.equal((await manage({ section: 'schedule', op: 'delete', id: row.id })).status, 200);
        } finally {
            delete bot.client.info;
        }
    });

    test('settings: edit with the same validation as /set, reset to the default, and the web login ones are not editable here', async () => {
        assert.equal((await manage({ section: 'setting', op: 'edit', id: 'gpt.image.size', value: 'landscape' })).status, 200);
        assert.equal(bot.getSetting('gpt.image.size'), '1536x1024');
        const bad = await manage({ section: 'setting', op: 'edit', id: 'gpt.image.size', value: 'enorme' });
        assert.equal(bad.status, 400);
        assert.match(bad.body.error, /enorme/);
        assert.equal((await manage({ section: 'setting', op: 'edit', id: 'show.max', value: '50' })).status, 200);
        assert.equal(bot.getSetting('show.max'), 50);
        assert.equal((await manage({ section: 'setting', op: 'edit', id: 'show.max', value: '5000' })).status, 400);
        assert.equal((await manage({ section: 'setting', op: 'edit', id: 'nao.existe', value: '1' })).status, 400);

        for (const key of ['zapbot.web.login', 'zapbot.web.password', 'zapbot.web.totp', 'bot.login']) {
            assert.equal((await manage({ section: 'setting', op: 'edit', id: key, value: 'outra-senha-longa' })).status, 400, key);
            assert.equal((await manage({ section: 'setting', op: 'delete', id: key })).status, 400, key);
        }
        assert.match(bot.getSetting('zapbot.web.password'), /^scrypt\$/);

        assert.equal((await manage({ section: 'setting', op: 'delete', id: 'show.max' })).status, 200);
        assert.equal(bot.getSetting('show.max'), 20);

        const section = (await (await get('/api/lists/settings', cookie)).json()).sections[0];
        const at = section.ids.indexOf('zapbot.web.password');
        assert.equal(section.values[at].protected, true);
        assert.equal(section.values[at].value, '');
    });

    test('the PDF of the selected messages only', async () => {
        await insert('X1', CHAT, { body: 'primeira', at: 1000 });
        await insert('X2', CHAT, { body: 'segunda', at: 2000 });
        await insert('X3', CHAT, { body: 'terceira', at: 3000 });
        const post = (body, c = cookie) => fetch(`${base}/api/export`, { method: 'POST', headers: { 'content-type': 'application/json', ...(c ? { cookie: c } : {}) }, body: JSON.stringify(body) });
        const r = await post({ chat: CHAT, ids: ['X1', 'X3'] });
        assert.equal(r.status, 200);
        assert.equal(r.headers.get('x-messages'), '2');
        assert.equal(Buffer.from(await r.arrayBuffer()).subarray(0, 4).toString(), '%PDF');
        assert.equal((await post({ chat: CHAT, ids: [] })).status, 404);
        assert.equal((await post({ chat: CHAT, ids: ['X1'] }, null)).status, 401);
    });
});

test('every time of the API is in milliseconds, as the database keeps them (the page formats them as ms)', async () => {
    const { cookie } = await login();
    const at = 1_795_316_819_953; // 2026-11-22
    await insert('T1', CHAT, { body: 'oi', at });
    await bot.dbRun("INSERT INTO message_edits (message_id, chat_id, old_body, new_body, edited_at) VALUES ('T1', ?, 'a', 'b', ?)", [CHAT, at + 5000]);
    const { messages } = await (await get(`/api/messages?chat=${CHAT}&from=${at - 1}&to=${at + 1}`, cookie)).json();
    assert.equal(messages[0].at, at);
    assert.equal(messages[0].edits[0].at, at + 5000);
    const info = await (await get(`/api/chat?chat=${CHAT}`, cookie)).json();
    assert.deepEqual([info.firstAt, info.lastAt], [at, at]);
    assert.equal(new Date(info.firstAt).getFullYear(), 2026);
    assert.equal((await (await get(`/api/messages?chat=${CHAT}&from=${at + 1}`, cookie)).json()).messages.length, 0);
});

describe('the owner is warned in WhatsApp about wrong passwords', () => {
    const warnings = () => bot.client.sent.filter(m => /ZapBot-Web/.test(String(m.content))).map(m => String(m.content));
    const tick = () => new Promise(resolve => setTimeout(resolve, 30));

    test('a wrong password of the login: a notice with the address and the attempt; a burst is joined; the block tells too', async () => {
        resetWeb();
        bot.client.sent.length = 0;
        await login('errada-errada-1');
        await tick();
        assert.equal(warnings().length, 1);
        assert.match(warnings()[0], /^⚠️ ZapBot-Web: senha errada vinda de .+ \(tentativa 1 de 5\)\.$/);
        assert.ok(!warnings()[0].includes('errada-errada-1'), 'the password never goes in the notice');
        assert.equal(bot.client.sent.find(m => /ZapBot-Web/.test(String(m.content))).chatId, bot.OWNER.jid, 'it goes to the owner chat');

        await login('errada-errada-2');
        await login('errada-errada-3');
        await login('errada-errada-4');
        await tick();
        assert.equal(warnings().length, 1, 'inside the window the wrong ones are only counted');

        await login('errada-errada-5');
        await tick();
        assert.equal(warnings().length, 2);
        assert.match(warnings()[1], /^🚫 ZapBot-Web: .+ errou a senha 5 vezes e está bloqueado por 15 minutos\./);
    });

    test('the right password does not warn; the wrong password of a protected tag does', async () => {
        resetWeb();
        bot.client.sent.length = 0;
        const { cookie } = await login();
        await tick();
        assert.equal(warnings().length, 0);

        const crypto = require('node:crypto');
        const salt = crypto.randomBytes(8);
        const key = crypto.scryptSync('a-senha-certa', salt, 32);
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        const body = Buffer.concat([cipher.update(Buffer.from('ok')), cipher.final()]);
        await bot.dbRun('INSERT INTO note_locks (tag, salt, verifier, created_at) VALUES (?, ?, ?, 1)',
            ['cofre', salt.toString('hex'), `enc:v1:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')}`]);
        const unlock = (password) => fetch(`${base}/api/notes/unlock`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ tag: 'cofre', password }) });

        assert.equal((await unlock('a-senha-errada')).status, 401);
        await tick();
        assert.equal(warnings().length, 1);
        assert.match(warnings()[0], /^⚠️ ZapBot-Web: senha errada da tag #cofre vinda de .+ \(tentativa 1 de 5\)\.$/);
        assert.equal((await unlock('a-senha-certa')).status, 200);
        await tick();
        assert.equal(warnings().length, 1);
    });
});

describe('alerts and notes: editing, deleting and playing', () => {
    const { network } = bot;
    const crypto = require('node:crypto');
    const { NOTES_DIR } = bot.src('constants');
    let cookie;

    const manage = async (body) => {
        const r = await fetch(`${base}/api/manage`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) });
        return { status: r.status, body: await r.json() };
    };
    const yahoo = (price) => network.responder('get', 'query1.finance.yahoo.com', (url) => {
        const currency = url.match(/chart\/([A-Z]+)BRL=X/)[1];
        return { chart: { result: [{
            meta: { symbol: currency, fullExchangeName: 'CCY', currency: 'BRL', regularMarketPrice: price, regularMarketDayHigh: price + 0.1, regularMarketDayLow: price - 0.1 },
            indicators: { quote: [{ open: [price - 0.2, price - 0.05], close: [price - 0.1, price], high: [price, price], low: [price, price] }] }
        }] } };
    });

    beforeEach(async () => {
        ({ cookie } = await login());
        yahoo(5.2);
    });

    test('a price alert: add, edit the rule and the message (it keeps where it notifies and when it was created), and a refused edit keeps the old one', async () => {
        const added = await manage({ section: 'price', op: 'add', kind: 'stocks', rule: 'USD > 5.30', message: 'olha o dólar' });
        assert.equal(added.status, 200, JSON.stringify(added.body));
        const old = await bot.dbGet('SELECT * FROM price_alerts');
        assert.deepEqual([old.kind, old.symbol, old.op, old.target, old.message], ['acao', 'USD', '>', 5.3, 'olha o dólar']);

        await bot.dbRun("UPDATE price_alerts SET created_at = 1700000000000, dest_name = 'Fulano', dest_id = 'x@c.us' WHERE id = ?", [old.id]);
        const edited = await manage({ section: 'price', op: 'edit', id: old.id, rule: 'USD < 5.00', message: 'caiu' });
        assert.equal(edited.status, 200, JSON.stringify(edited.body));
        const row = await bot.dbGet('SELECT * FROM price_alerts');
        assert.deepEqual([row.symbol, row.op, row.target, row.message, row.created_at, row.dest_name, row.dest_id], ['USD', '<', 5, 'caiu', 1700000000000, 'Fulano', 'x@c.us']);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM price_alerts')).n, 1);

        // already met (5.20 is below 5.50 for a "<"): refused, and the old alert stays as it was
        const refused = await manage({ section: 'price', op: 'edit', id: row.id, rule: 'USD < 5.50', message: 'x' });
        assert.equal(refused.status, 400);
        assert.ok(refused.body.error.length > 0);
        const kept = await bot.dbGet('SELECT * FROM price_alerts');
        assert.deepEqual([kept.id, kept.op, kept.target, kept.message, kept.dest_name], [row.id, '<', 5, 'caiu', 'Fulano']);
        assert.equal((await manage({ section: 'price', op: 'edit', id: 99999, rule: 'USD > 9' })).status, 400);

        const section = (await (await get('/api/lists/alerts', cookie)).json()).sections[0];
        assert.equal(section.manage.canEdit, true);
        assert.deepEqual(section.values[0], { rule: 'USD < 5', message: 'caiu', recipients: [{ id: 'x@c.us', name: 'Fulano', group: false }] });
        assert.deepEqual(section.manage.editFields, ['rule', 'message', 'recipients']);
    });

    const seal = (text, key) => {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        const body = Buffer.concat([cipher.update(Buffer.from(text)), cipher.final()]);
        return Buffer.concat([iv, cipher.getAuthTag(), body]);
    };
    const note = (id, tag, text, media = null, mime = null) => bot.dbRun('INSERT INTO notes (id, text, created_at, tag, media_path, media_mime) VALUES (?, ?, ?, ?, ?, ?)', [id, text, 1700000000000, tag, media, mime]);

    test('notes: edit the text, the tag and the alert; delete (and its file); a protected tag needs to be unlocked and keeps the text encrypted', async () => {
        fs.mkdirSync(NOTES_DIR, { recursive: true });
        const file = path.join(NOTES_DIR, '7_zz_clip.mp4');
        fs.writeFileSync(file, 'VIDEO');
        await note(1, 'ideias', 'comprar pão', file, 'video/mp4');
        await note(2, null, 'solta');

        const dueAt = Date.now() + 86_400_000;
        assert.equal((await manage({ section: 'note', op: 'edit', id: 1, text: 'comprar pão e leite', tag: '#Mercado', alertAt: dueAt })).status, 200);
        const row = await bot.dbGet('SELECT text, tag, alert_at, media_path FROM notes WHERE id = 1');
        assert.deepEqual([row.text, row.tag, row.alert_at, row.media_path], ['comprar pão e leite', 'mercado', dueAt, file]);
        assert.equal((await manage({ section: 'note', op: 'edit', id: 1, text: 'comprar pão e leite', tag: '', alertAt: null })).status, 200);
        assert.deepEqual(Object.values(await bot.dbGet('SELECT tag, alert_at FROM notes WHERE id = 1')), [null, null]);
        assert.equal((await manage({ section: 'note', op: 'edit', id: 1, text: '', tag: '' })).status, 400);
        assert.equal((await manage({ section: 'note', op: 'edit', id: 1, text: 'x', tag: 'tem espaço' })).status, 400);
        assert.equal((await manage({ section: 'note', op: 'edit', id: 1, text: 'x', alertAt: 5 })).status, 400);
        assert.equal((await manage({ section: 'note', op: 'edit', id: 99, text: 'x' })).status, 400);

        // a protected tag
        const salt = crypto.randomBytes(8);
        const key = crypto.scryptSync('a-senha-certa', salt, 32);
        await bot.dbRun('INSERT INTO note_locks (tag, salt, verifier, created_at) VALUES (?, ?, ?, 1)', ['cofre', salt.toString('hex'), `enc:v1:${seal('ok', key).toString('base64')}`]);
        await note(3, 'cofre', `enc:v1:${seal('segredo antigo', key).toString('base64')}`);
        assert.equal((await manage({ section: 'note', op: 'edit', id: 3, text: 'novo segredo' })).status, 400, 'locked');
        assert.equal((await manage({ section: 'note', op: 'delete', id: 3 })).status, 400, 'locked');
        const unlock = await fetch(`${base}/api/notes/unlock`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ tag: 'cofre', password: 'a-senha-certa' }) });
        assert.equal(unlock.status, 200);

        assert.equal((await manage({ section: 'note', op: 'edit', id: 3, text: 'novo segredo', tag: 'cofre' })).status, 200);
        const stored = (await bot.dbGet('SELECT text FROM notes WHERE id = 3')).text;
        assert.match(stored, /^enc:v1:/);
        assert.ok(!stored.includes('novo segredo'));
        assert.equal((await (await get('/api/notes?tag=cofre', cookie)).json()).notes[0].text, 'novo segredo');
        assert.equal((await manage({ section: 'note', op: 'edit', id: 3, text: 'x', tag: 'ideias' })).status, 400, 'moving out of a protected tag is /notes -move');
        assert.equal((await manage({ section: 'note', op: 'edit', id: 2, text: 'x', tag: 'cofre' })).status, 400, 'and into it');

        assert.equal((await manage({ section: 'note', op: 'delete', id: 1 })).status, 200);
        assert.equal(await bot.dbGet('SELECT 1 FROM notes WHERE id = 1'), undefined);
        assert.equal(fs.existsSync(file), false, 'the file goes with the note');
        assert.equal((await manage({ section: 'note', op: 'delete', id: 3 })).status, 200);
        assert.equal((await manage({ section: 'note', op: 'delete', id: 3 })).status, 400);
    });

    test('notes: duplicate a tag, move one into another, and copy, duplicate and move one note', async () => {
        fs.mkdirSync(NOTES_DIR, { recursive: true });
        const file = path.join(NOTES_DIR, '7_zz_foto.jpg');
        fs.writeFileSync(file, 'JPEG');
        await note(1, 'viagem', 'praia', file, 'image/jpeg');
        await note(2, 'viagem', 'serra');
        await note(3, 'casa', 'pintar');
        await bot.dbRun('UPDATE notes SET alert_at = ? WHERE id = 2', [Date.now() + 86_400_000]);
        await bot.dbRun("INSERT INTO note_tags (tag, description) VALUES ('viagem', 'lugares')");

        const copied = await manage({ section: 'tag', op: 'copy', id: 'viagem', tag: '#Viagem-2027' });
        assert.equal(copied.status, 200, JSON.stringify(copied.body));
        const rows = await bot.dbAll("SELECT text, alert_at, media_path FROM notes WHERE tag = 'viagem-2027' ORDER BY id");
        assert.deepEqual(rows.map(r => [r.text, r.alert_at]), [['praia', null], ['serra', null]]);
        assert.notEqual(rows[0].media_path, file);
        assert.equal(fs.readFileSync(rows[0].media_path, 'utf8'), 'JPEG');
        assert.equal((await bot.dbGet("SELECT description FROM note_tags WHERE tag = 'viagem-2027'")).description, 'lugares');
        assert.equal((await bot.dbGet("SELECT COUNT(*) AS n FROM notes WHERE tag = 'viagem'")).n, 2, 'the original stays');
        assert.ok((await bot.dbGet('SELECT alert_at FROM notes WHERE id = 2')).alert_at, 'the original keeps its alert');

        assert.equal((await manage({ section: 'tag', op: 'copy', id: 'viagem', tag: 'casa' })).status, 400, 'a name that exists');
        assert.equal((await manage({ section: 'tag', op: 'copy', id: 'nada', tag: 'outra' })).status, 400, 'an unknown tag');

        // one note goes to another tag, with its file and alert; empty: no tag
        assert.equal((await manage({ section: 'note', op: 'move', id: 2, tag: '#casa' })).status, 200);
        const moved = await bot.dbGet('SELECT tag, text, alert_at FROM notes WHERE id = 2');
        assert.deepEqual([moved.tag, moved.text, Boolean(moved.alert_at)], ['casa', 'serra', true]);
        assert.equal((await manage({ section: 'note', op: 'move', id: 2, tag: 'casa' })).status, 400, 'already there');
        assert.equal((await manage({ section: 'note', op: 'move', id: 2, tag: '' })).status, 200);
        assert.equal((await bot.dbGet('SELECT tag FROM notes WHERE id = 2')).tag, null);

        // one note copied: to the same tag (a duplicate) or to another, with a copy of its file and no alert
        await bot.dbRun('UPDATE notes SET alert_at = ? WHERE id = 1', [Date.now() + 86_400_000]);
        const dup = await manage({ section: 'note', op: 'copy', id: 1 });
        assert.equal(dup.status, 200, JSON.stringify(dup.body));
        const copy1 = await bot.dbGet('SELECT tag, text, alert_at, media_path FROM notes WHERE id = ?', [dup.body.id]);
        assert.deepEqual([copy1.tag, copy1.text, copy1.alert_at], ['viagem', 'praia', null]);
        assert.notEqual(copy1.media_path, file);
        assert.equal(fs.readFileSync(copy1.media_path, 'utf8'), 'JPEG');
        const other = await manage({ section: 'note', op: 'copy', id: 3, tag: 'viagem' });
        assert.equal((await bot.dbGet('SELECT tag, text FROM notes WHERE id = ?', [other.body.id])).text, 'pintar');
        assert.equal((await bot.dbGet('SELECT tag FROM notes WHERE id = 3')).tag, 'casa', 'the original stays');

        // a whole tag into another one from the list: they merge, and the description goes when the other has none
        const merged = await manage({ section: 'tag', op: 'move', id: 'viagem-2027', tag: 'casa' });
        assert.equal(merged.status, 200, JSON.stringify(merged.body));
        assert.equal(merged.body.tag, 'casa');
        assert.equal((await bot.dbGet("SELECT COUNT(*) AS n FROM notes WHERE tag = 'viagem-2027'")).n, 0);
        assert.equal((await bot.dbGet("SELECT COUNT(*) AS n FROM notes WHERE tag = 'casa'")).n, 3);
        assert.equal((await bot.dbGet("SELECT description FROM note_tags WHERE tag = 'casa'")).description, 'lugares');
        assert.equal(await bot.dbGet("SELECT 1 FROM note_tags WHERE tag = 'viagem-2027'"), undefined);
        assert.equal((await manage({ section: 'tag', op: 'move', id: 'casa', tag: 'casa' })).status, 400);

        // a protected tag: neither copied nor a note moved in or out
        await bot.dbRun("INSERT INTO note_locks (tag, salt, verifier, created_at) VALUES ('casa', 'x', 'y', 1)");
        assert.equal((await manage({ section: 'tag', op: 'copy', id: 'casa', tag: 'casa-2' })).status, 400);
        assert.equal((await manage({ section: 'note', op: 'move', id: 1, tag: 'casa' })).status, 400);
        assert.equal((await manage({ section: 'note', op: 'copy', id: 1, tag: 'casa' })).status, 400);
        assert.equal((await manage({ section: 'tag', op: 'move', id: 'viagem', tag: 'casa' })).status, 400);
    });

    test('a video (and audio) of a note plays on the page, with Range; ?download still downloads; unknown types are a download', async () => {
        fs.mkdirSync(NOTES_DIR, { recursive: true });
        const video = path.join(NOTES_DIR, '8_aa_clip.mp4');
        const doc = path.join(NOTES_DIR, '9_bb_pagina.html');
        fs.writeFileSync(video, '0123456789');
        fs.writeFileSync(doc, '<script>alert(1)</script>');
        await note(8, 'midia', 'um vídeo', video, 'video/mp4');
        await note(9, 'midia', 'um html', doc, 'text/html');

        const { notes } = await (await get('/api/notes?tag=midia', cookie)).json();
        const mime = Object.fromEntries(notes.map(n => [n.id, n.media.mime]));
        assert.deepEqual(mime, { 8: 'video/mp4', 9: 'text/html' });

        const whole = await get('/api/notes/media?id=8', cookie);
        assert.equal(whole.headers.get('content-type'), 'video/mp4');
        assert.match(whole.headers.get('content-disposition'), /^inline/);
        assert.equal(whole.headers.get('accept-ranges'), 'bytes');
        assert.equal(await whole.text(), '0123456789');

        const part = await fetch(`${base}/api/notes/media?id=8`, { headers: { cookie, range: 'bytes=2-5' } });
        assert.equal(part.status, 206);
        assert.equal(part.headers.get('content-range'), 'bytes 2-5/10');
        assert.equal(await part.text(), '2345');
        assert.equal((await fetch(`${base}/api/notes/media?id=8`, { headers: { cookie, range: 'bytes=50-60' } })).status, 416);

        const download = await get('/api/notes/media?id=8&download=1', cookie);
        assert.match(download.headers.get('content-disposition'), /^attachment/);
        assert.equal(download.headers.get('content-type'), 'application/octet-stream');
        const html = await get('/api/notes/media?id=9', cookie);
        assert.match(html.headers.get('content-disposition'), /^attachment/);
        assert.equal(html.headers.get('content-security-policy'), 'sandbox');
    });
});

describe('the address the bot tells you at start', () => {
    const { webUrl, isWebRunning } = bot.src('web/server');
    const { t } = bot.src('i18n');

    test('zapbot.web.url first, then ZAPBOT_WEB_URL, then the machine address with the port', async () => {
        const saved = process.env.ZAPBOT_WEB_URL;
        const savedHost = process.env.ZAPBOT_WEB_HOST;
        try {
            delete process.env.ZAPBOT_WEB_URL;
            delete process.env.ZAPBOT_WEB_HOST;
            await bot.setSetting('zapbot.web.host', '127.0.0.1');
            await bot.setSetting('zapbot.web.port', 3201);
            assert.equal(webUrl(), 'http://127.0.0.1:3201');

            process.env.ZAPBOT_WEB_HOST = '0.0.0.0'; // the Docker image
            assert.match(webUrl(), /^http:\/\/(\d{1,3}\.){3}\d{1,3}:3201$|^http:\/\/localhost:3201$/);

            process.env.ZAPBOT_WEB_URL = 'http://192.168.1.253:3200/';
            assert.equal(webUrl(), 'http://192.168.1.253:3200', 'the env (docker/.env), without the final slash');
            await bot.setSetting('zapbot.web.url', 'https://zap.example.com/');
            assert.equal(webUrl(), 'https://zap.example.com', 'the setting wins');
            await assert.rejects(bot.setSetting('zapbot.web.url', 'zap.example.com'), /invalid|inválida|URL/i);
        } finally {
            if (saved === undefined) delete process.env.ZAPBOT_WEB_URL; else process.env.ZAPBOT_WEB_URL = saved;
            if (savedHost === undefined) delete process.env.ZAPBOT_WEB_HOST; else process.env.ZAPBOT_WEB_HOST = savedHost;
        }
    });

    test('the line of the startup message, in both languages; the web is not running in the tests', () => {
        assert.equal(isWebRunning(), false);
        assert.equal(t('conexao.web', { url: 'http://192.168.1.253:3200' }), '🌐 Interface web ativa em http://192.168.1.253:3200');
    });
});

describe('a password sent with /set', () => {
    test('/set zapbot.web.password: the message leaves the chat, and neither the history nor the log keeps the password', async () => {
        const PASSWORD = 'Sup3rS3gredo!9';
        const logsBefore = bot.logs.length;
        const msg = bot.createMessage({ text: `/set zapbot.web.password ${PASSWORD}`, fromMe: true });
        await bot.deliver(msg);

        assert.equal(msg.deletedFor, 'everyone', 'the message with the password was deleted');
        assert.equal((await bot.dbGet('SELECT body FROM messages WHERE id = ?', [msg.id.id])).body, '/set zapbot.web.password ***');
        assert.doesNotMatch(JSON.stringify(await bot.dbAll('SELECT body, raw_json FROM messages')), new RegExp(PASSWORD));
        assert.doesNotMatch(bot.logs.slice(logsBefore).join('\n'), new RegExp(PASSWORD));
        assert.ok(bot.getSetting('zapbot.web.password').startsWith('scrypt'), 'only the hash is saved');
        const answer = bot.client.sent.at(-1);
        assert.match(String(answer.content), /✅ \*zapbot\.web\.password\* = ••••/);
        assert.equal(answer.options?.quotedMessageId, undefined, 'a new message, not a reply to the deleted one');
    });

    test('the log of the login tells the user: the right one and the one that missed', async () => {
        const before = bot.logs.length;
        await login();
        await login('errada-errada', 'intruso');
        const logs = bot.logs.slice(before).join('\n');
        assert.match(logs, new RegExp(`Web: login of '${USER}' from `));
        assert.match(logs, /Web: wrong password for 'intruso' from /);    });
});

describe('the security code notices of WhatsApp', () => {
    const CHAT = '120363000000000099@g.us';

    async function seed() {
        const row = (id, at, body) => bot.dbRun(`INSERT INTO messages (id, sender_name, sender_jid, sender_number, chat_id, chat_name, is_group, body, type, timestamp, has_media, from_me, revoked)
            VALUES (?, 'Grupo Teste', '5521977067964@c.us', '5521977067964', ?, 'Grupo Teste', 1, ?, ?, ?, 0, 0, 0)`, [id, CHAT, body, body === 'oi' ? 'chat' : 'e2e_notification', at]);
        await bot.dbRun(`INSERT INTO messages (id, sender_name, sender_jid, sender_number, chat_id, chat_name, is_group, body, type, timestamp, has_media, from_me, revoked)
            VALUES ('M0', 'Maria', '89515842633751@lid', '5521988887777', ?, 'Grupo Teste', 1, 'oi', 'chat', ?, 0, 0, 0)`, [CHAT, Date.parse('2026-11-20T10:00:00Z')]);
        await row('N1', Date.parse('2026-11-21T10:00:00Z'), '89515842633751@lid');
        await row('N2', Date.parse('2026-11-22T10:00:00Z'), '99999999999999@lid');
    }

    test('the notice carries the name of whoever changed (when the bot knows) and no raw jid as the text', async () => {
        await seed();
        const { cookie } = await login();
        const { messages } = await (await get(`/api/messages?chat=${encodeURIComponent(CHAT)}`, cookie)).json();
        const notices = messages.filter(m => m.notice);
        assert.deepEqual(notices.map(m => [m.body, m.notice.kind, m.notice.who]), [['', 'security', 'Maria'], ['', 'security', null]]);
        const { chats } = await (await get('/api/chats', cookie)).json();
        assert.equal(chats.find(c => c.id === CHAT).total, 1, 'the notices do not count in the totals');

        // A chat with only notices is not listed, and a notice does not move a chat up in the list
        await bot.dbRun(`INSERT INTO messages (id, sender_name, sender_jid, sender_number, chat_id, chat_name, is_group, body, type, timestamp, has_media, from_me, revoked)
            VALUES ('N9', 'Fulano', '5521911111111@c.us', '5521911111111', '5521911111111@c.us', 'Fulano', 0, '', 'e2e_notification', ?, 0, 0, 0),
                   ('N10', 'Grupo Teste', '5521977067964@c.us', '5521977067964', ?, 'Grupo Teste', 1, '99@lid', 'e2e_notification', ?, 0, 0, 0)`, [Date.parse('2026-11-23T10:00:00Z'), CHAT, Date.parse('2026-11-24T10:00:00Z')]);
        const after = (await (await get('/api/chats', cookie)).json()).chats;
        assert.ok(!after.some(c => c.id === '5521911111111@c.us'), 'only notices: not listed');
        assert.equal(after.find(c => c.id === CHAT).lastAt, Date.parse('2026-11-20T10:00:00Z'), 'the last message is the real one');
        assert.equal(after.find(c => c.id === CHAT).last.body, 'oi');
        const info = await (await get(`/api/chat?chat=${encodeURIComponent('5521911111111@c.us')}`, cookie)).json();
        assert.deepEqual([info.total, info.name], [0, 'Fulano'], 'it still opens, empty, from a link');
    });

    test('zapbot.web.warnChangedPhone=false hides them from the history and the counts', async () => {
        await seed();
        await bot.setSetting('zapbot.web.warnChangedPhone', false);
        const { cookie } = await login();
        const { messages } = await (await get(`/api/messages?chat=${encodeURIComponent(CHAT)}`, cookie)).json();
        assert.deepEqual(messages.map(m => m.id), ['M0']);
        const { chats } = await (await get('/api/chats', cookie)).json();
        assert.equal(chats.find(c => c.id === CHAT).total, 1);
        assert.equal(bot.getSetting('zapbot.web.warnChangedPhone'), false);
    });

    test('the other notices of the system are a line too, never a bubble of an empty message', async () => {
        await seed();
        await bot.dbRun(`INSERT INTO messages (id, sender_name, sender_jid, sender_number, chat_id, chat_name, is_group, body, type, timestamp, has_media, from_me, revoked)
            VALUES ('T1', 'Desconhecido', 'UNKNOWN', '', ?, 'Grupo Teste', 1, '', 'notification_template', ?, 0, 0, 0)`, [CHAT, Date.parse('2026-11-22T11:00:00Z')]);
        const { cookie } = await login();
        const { messages } = await (await get(`/api/messages?chat=${encodeURIComponent(CHAT)}`, cookie)).json();
        const system = messages.find(m => m.id === 'T1');
        assert.deepEqual([system.body, system.notice], ['', { kind: 'system', text: null }]);
    });

    test('it is on by default', () => {
        assert.equal(bot.src('settings').SETTINGS_SCHEMA['zapbot.web.warnChangedPhone'].default, true);
    });
});

describe('the title of the page', () => {
    test('it tells the version that is running (with the commit), escaped', async () => {
        const html = await (await fetch(`${base}/`)).text();
        const { versionWithCommit } = bot.src('version');
        assert.ok(html.includes(`<title>ZapBot ${versionWithCommit().replace(/&/g, '&amp;')}</title>`), html.match(/<title>.*<\/title>/)?.[0]);
        assert.match(html.match(/<title>(.*)<\/title>/)[1], /^ZapBot \d+\.\d+\.\d+/);
        // the login screen shows it too (under ZapBot), so the session answer has it before the login
        const session = await (await fetch(`${base}/api/session`)).json();
        assert.deepEqual([session.authenticated, session.version], [false, versionWithCommit()]);
    });
});

describe('alerts: contacts to notify, the history of /watch and of /monitor', () => {
    let cookie;
    const manage = async (body) => {
        const r = await fetch(`${base}/api/manage`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) });
        return { status: r.status, body: await r.json().catch(() => ({})) };
    };
    const json = async (route) => (await get(route, cookie)).json();
    beforeEach(async () => { ({ cookie } = await login()); });

    test('the contact search: by part of the name (with the address book), by number; without the login it is refused', async () => {
        assert.equal((await get('/api/contacts?q=ful')).status, 401);
        const { people } = await json('/api/contacts?q=ful');
        assert.deepEqual(people.map(p => [p.id, p.name, p.group]), [[bot.OTHERAlt.jid, 'Fulano', false]]);
        assert.deepEqual((await json('/api/contacts?q=5521988887777')).people.map(p => p.id), ['5521988887777@c.us']);
        assert.deepEqual((await json('/api/contacts?q=x')).people, [], 'too short');
        const info = bot.client.info;
        bot.client.info = { wid: { _serialized: bot.OWNER.jid }, pushname: 'Jorge' };
        const me = (await json('/api/contacts?q=eu')).people;
        assert.deepEqual(me.map(p => [p.id, p.group, p.self]), [[bot.OWNER.jid, false, true]], '"eu" is your own account');
        assert.equal((await json('/api/contacts?q=me')).people[0].id, bot.OWNER.jid);
        bot.client.info = info;
    });

    test('a price alert notifies the people picked (add and edit), and an empty list goes back to your private chat', async () => {
        const people = [{ id: bot.OTHERAlt.jid, name: 'Fulano', group: false }, { id: '120363000000000001@g.us', name: 'Grupo X' }];
        bot.network.responder('get', 'query1.finance.yahoo.com', (url) => ({ chart: { result: [{
            meta: { symbol: 'USD', fullExchangeName: 'CCY', currency: 'BRL', regularMarketPrice: 5.2, regularMarketDayHigh: 5.3, regularMarketDayLow: 5.1 },
            indicators: { quote: [{ open: [5.1, 5.15], close: [5.1, 5.2], high: [5.2, 5.2], low: [5.1, 5.1] }] }
        }] } }));
        await bot.dbRun("INSERT INTO price_alerts (kind, symbol, op, target, created_at, message) VALUES ('acao', 'USD', '>', 5.5, 1, 'sobe')");
        const { id } = await bot.dbGet('SELECT id FROM price_alerts');
        const edit = await manage({ section: 'price', op: 'edit', id, rule: 'USD > 5.50', message: 'sobe', recipients: people });
        assert.equal(edit.status, 200, JSON.stringify(edit.body));
        const row = await bot.dbGet('SELECT * FROM price_alerts ORDER BY id DESC LIMIT 1');
        assert.deepEqual([row.dest_id, row.dest_name, JSON.parse(row.recipients).map(r => r.name)], [bot.OTHERAlt.jid, 'Fulano', ['Fulano', 'Grupo X']]);
        const section = (await json('/api/lists/alerts')).sections[0];
        assert.deepEqual(section.values[0].recipients.map(r => r.id), [bot.OTHERAlt.jid, '120363000000000001@g.us']);
        assert.equal((await manage({ section: 'price', op: 'edit', id: row.id, rule: 'USD > 5.50', recipients: [] })).status, 200);
        assert.equal((await bot.dbGet('SELECT dest_id, recipients FROM price_alerts ORDER BY id DESC LIMIT 1')).dest_id, null);
        // the old groups have a hyphen in the id: they are accepted as they are
        const old = [{ id: '558191855055-1523371679@g.us', name: 'The Devil\'s Rejects', group: true }, { id: '5521982715848@c.us', name: 'Jorge Pereira' }];
        assert.equal((await manage({ section: 'price', op: 'edit', id: (await bot.dbGet('SELECT MAX(id) AS id FROM price_alerts')).id, rule: 'USD > 5.50', recipients: old })).status, 200);
        const saved = await bot.dbGet('SELECT dest_id, dest_is_group, recipients FROM price_alerts ORDER BY id DESC LIMIT 1');
        assert.deepEqual([saved.dest_id, saved.dest_is_group, JSON.parse(saved.recipients).map(r => r.name)], ['558191855055-1523371679@g.us', 1, ["The Devil's Rejects", 'Jorge Pereira']]);
        assert.equal((await manage({ section: 'price', op: 'edit', id, rule: 'USD > 5.50', recipients: [{ id: 'nao-e-jid' }] })).status, 400);
        assert.equal((await manage({ section: 'price', op: 'edit', id, rule: 'USD > 5.50', recipients: [{ email: 'sem-arroba' }] })).status, 400);
    });

    test('a /watch rule notifies the people picked; renaming it carries the destinations and the hits', async () => {
        const people = [{ id: bot.OTHERAlt.jid, name: 'Fulano' }, { email: 'eu@exemplo.com' }];
        assert.equal((await manage({ section: 'watch', op: 'add', rule: 'boleto', recipients: people })).status, 200);
        let section = (await json('/api/lists/alerts')).sections[1];
        assert.deepEqual(section.columns, ['rule', 'notifies', 'alert', 'hits', 'last hit']);
        assert.deepEqual(section.values[0].recipients, [{ id: bot.OTHERAlt.jid, name: 'Fulano', group: false }, { email: 'eu@exemplo.com' }]);
        assert.equal(section.rows[0][1], 'Fulano, eu@exemplo.com');

        await bot.dbRun("INSERT INTO watch_hits (rule, message_id, chat_id, chat_name, sender_name, sender_number, body, timestamp) VALUES ('boleto', 'm1', 'c@g.us', 'Condomínio', 'Maria', '5521988887777', 'o boleto venceu', 1700000000000)");
        assert.equal((await manage({ section: 'watch', op: 'edit', oldRule: 'boleto', rule: 'fatura', recipients: people })).status, 200);
        const hits = await json(`/api/history/watch?rule=${encodeURIComponent('fatura')}`);
        assert.equal(hits.total, 1);
        const link = { chat: 'c@g.us', id: 'm1', at: 1700000000000 };
        assert.deepEqual(hits.rows[0].slice(1), [{ text: 'Condomínio', link }, 'Maria', { text: 'o boleto venceu', link }], 'the chat and the text open the history at the message');
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM watch_destinations WHERE rule = ?', ['boleto'])).n, 0);

        assert.equal((await manage({ section: 'watch', op: 'edit', oldRule: 'fatura', rule: 'fatura', recipients: [] })).status, 200);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM watch_destinations')).n, 0);
        assert.equal((await manage({ section: 'watch', op: 'delete', id: 'fatura' })).status, 200);
    });

    test('monitor: add a contact picked, edit the name and the alert, history of what was seen and remove a reading', async () => {
        assert.equal((await manage({ section: 'monitor', op: 'add', contact: { id: bot.OTHERAlt.jid, name: 'Fulano' }, alert: true })).status, 200);
        const row = await bot.dbGet('SELECT * FROM monitor_contacts');
        assert.deepEqual([row.contact_id, row.contact_name, row.alert_enabled], [bot.OTHERAlt.jid, 'Fulano', 1]);
        assert.equal((await manage({ section: 'monitor', op: 'add', contact: { id: bot.OTHERAlt.jid, name: 'Fulano' } })).status, 400, 'already monitored');
        assert.equal((await manage({ section: 'monitor', op: 'add', contact: { id: '120363000000000001@g.us', name: 'Grupo' } })).status, 400, 'a group is not a contact');

        assert.equal((await manage({ section: 'monitor', op: 'edit', id: row.id, name: 'Fulano de Tal', alert: false })).status, 200);
        assert.deepEqual(Object.values(await bot.dbGet('SELECT contact_name, alert_enabled FROM monitor_contacts')), ['Fulano de Tal', 0]);
        assert.equal((await manage({ section: 'monitor', op: 'edit', id: row.id, name: '' })).status, 400);

        await bot.dbRun("INSERT INTO monitor_history (contact_id, last_seen, observed_at, source, kind) VALUES (?, 1700000000, 1700000100000, 'presence', 'seen'), (?, 1700001000, 1700001100000, NULL, NULL)", [row.id, row.id]);
        await bot.dbRun('UPDATE monitor_contacts SET last_seen = 1700001000 WHERE id = ?', [row.id]);
        const history = await json(`/api/history/monitor?id=${row.id}`);
        assert.equal(history.title, 'Fulano de Tal');
        assert.deepEqual(history.rows.map(r => r[0].date), [1700001000_000, 1700000000_000], 'in ms, the latest first');
        const alerts = (await json('/api/lists/alerts')).sections[2];
        assert.equal(alerts.rows[0][2].date, 1700001000_000, 'the last seen of the table is in ms too');
        assert.equal((await manage({ section: 'monitorReading', op: 'delete', id: history.ids[0] })).status, 200);
        assert.equal((await json(`/api/history/monitor?id=${row.id}`)).total, 1);
        assert.equal((await get('/api/history/monitor?id=99999', cookie)).status, 404);
    });
});

describe('notes: new tags and new notes from the page', () => {
    let cookie;
    const manage = async (body) => {
        const r = await fetch(`${base}/api/manage`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) });
        return { status: r.status, body: await r.json().catch(() => ({})) };
    };
    const tags = async () => (await (await get('/api/notes/tags', cookie)).json()).tags;
    beforeEach(async () => { ({ cookie } = await login()); });

    test('a new tag (name and description, as /notes -desc makes it) is listed even without notes; a repeated one is refused', async () => {
        assert.equal((await manage({ section: 'tag', op: 'add', tag: '#Viagens', description: 'ideias de lugares' })).status, 200);
        assert.deepEqual((await tags()).map(t => [t.tag, t.description, t.total]), [['viagens', 'ideias de lugares', 0]]);
        assert.equal((await bot.dbGet("SELECT description FROM note_tags WHERE tag = 'viagens'")).description, 'ideias de lugares');
        assert.equal((await manage({ section: 'tag', op: 'add', tag: 'viagens', description: 'outra' })).status, 400);
        assert.equal((await manage({ section: 'tag', op: 'add', tag: 'com espaço', description: 'x' })).status, 400);
        assert.equal((await manage({ section: 'tag', op: 'add', tag: 'sem-descricao', description: '' })).status, 400);
    });

    test('a new note goes into a tag (or none); with the tag it is listed; an empty text or a bad alert is refused', async () => {
        await manage({ section: 'tag', op: 'add', tag: 'viagens', description: 'lugares' });
        const alertAt = Date.now() + 86_400_000;
        const added = await manage({ section: 'note', op: 'add', text: 'Lisboa em maio', tag: 'viagens', alertAt });
        assert.equal(added.status, 200, JSON.stringify(added.body));
        const row = await bot.dbGet('SELECT * FROM notes');
        assert.deepEqual([row.text, row.tag, row.alert_at, row.dest_id], ['Lisboa em maio', 'viagens', alertAt, null]);
        assert.equal((await tags())[0].total, 1);
        const { notes } = await (await get('/api/notes?tag=viagens', cookie)).json();
        assert.deepEqual(notes.map(n => n.text), ['Lisboa em maio']);
        assert.equal((await manage({ section: 'note', op: 'add', text: '   ' })).status, 400);
        assert.equal((await manage({ section: 'note', op: 'add', text: 'x', alertAt: 5 })).status, 400);
        assert.equal((await manage({ section: 'note', op: 'add', text: 'solta' })).status, 200);
        assert.equal((await bot.dbGet("SELECT COUNT(*) AS n FROM notes WHERE tag IS NULL")).n, 1);
    });

    test('editing a tag: the description (empty removes it) and the name (the notes follow); removing only a tag with no notes', async () => {
        await manage({ section: 'tag', op: 'add', tag: 'viagens', description: 'lugares' });
        await manage({ section: 'note', op: 'add', text: 'Lisboa', tag: 'viagens' });
        assert.equal((await manage({ section: 'tag', op: 'edit', id: 'viagens', tag: 'ferias', description: 'onde ir' })).status, 200);
        assert.deepEqual((await tags()).map(t => [t.tag, t.description, t.total]), [['ferias', 'onde ir', 1]]);
        assert.equal((await manage({ section: 'tag', op: 'edit', id: 'ferias', tag: 'ferias', description: '' })).status, 200);
        assert.equal((await tags())[0].description, '');
        assert.equal((await manage({ section: 'tag', op: 'delete', id: 'ferias' })).status, 400, 'it has a note');
        await manage({ section: 'tag', op: 'add', tag: 'vazia', description: 'x' });
        assert.equal((await manage({ section: 'tag', op: 'edit', id: 'vazia', tag: 'ferias', description: 'x' })).status, 400, 'the name is taken');
        assert.equal((await manage({ section: 'tag', op: 'delete', id: 'vazia' })).status, 200);
        assert.equal((await manage({ section: 'tag', op: 'delete', id: 'vazia' })).status, 400);
    });

    test('deleting a tag with notes (like /notes -rm #tag -yes): needs the name typed, deletes every note, their media, the description and the lock', async () => {
        const file = path.join(NOTES_DIR, 'viagens-foto.jpg');
        fs.mkdirSync(NOTES_DIR, { recursive: true });
        fs.writeFileSync(file, 'x');
        await manage({ section: 'tag', op: 'add', tag: 'viagens', description: 'lugares' });
        const first = await manage({ section: 'note', op: 'add', text: 'Lisboa' });
        await bot.dbRun('UPDATE notes SET tag = ? WHERE id = ?', ['viagens', first.body.id]);
        const second = await manage({ section: 'note', op: 'add', text: 'Porto' });
        await bot.dbRun('UPDATE notes SET tag = ?, media_path = ? WHERE id = ?', ['viagens', 'viagens-foto.jpg', second.body.id]);
        const salt = crypto.randomBytes(8).toString('hex');
        await bot.dbRun('INSERT INTO note_locks (tag, salt, verifier, created_at) VALUES (?, ?, ?, 1)', ['viagens', salt, 'enc:v1:x']);

        const noConfirm = await manage({ section: 'tag', op: 'delete', id: 'viagens' });
        assert.equal(noConfirm.status, 400, 'without typing the name, nothing is deleted');
        assert.match(noConfirm.body.error, /2/, 'it says how many notes would go');
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM notes')).n, 2, 'still there');

        const wrong = await manage({ section: 'tag', op: 'delete', id: 'viagens', confirm: 'ferias' });
        assert.equal(wrong.status, 400);

        const done = await manage({ section: 'tag', op: 'delete', id: 'viagens', confirm: ' Viagens ' });
        assert.equal(done.status, 200, JSON.stringify(done.body));
        assert.equal(done.body.removed, 2);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM notes')).n, 0);
        assert.equal((await bot.dbGet("SELECT COUNT(*) AS n FROM note_tags WHERE tag = 'viagens'")).n, 0, 'the description is gone too');
        assert.equal((await bot.dbGet("SELECT COUNT(*) AS n FROM note_locks WHERE tag = 'viagens'")).n, 0, 'and the lock');
        assert.equal(fs.existsSync(file), false, 'and the media file');
    });

    test('a protected tag with notes is deleted without needing to unlock it first (deleting does not need to read the content)', async () => {
        await manage({ section: 'tag', op: 'add', tag: 'cofre', description: 'segredos' });
        const note = await manage({ section: 'note', op: 'add', text: 'x' });
        await bot.dbRun('UPDATE notes SET tag = ? WHERE id = ?', ['cofre', note.body.id]);
        await bot.dbRun('INSERT INTO note_locks (tag, salt, verifier, created_at) VALUES (?, ?, ?, 1)', ['cofre', crypto.randomBytes(8).toString('hex'), 'enc:v1:x']);

        const result = await manage({ section: 'tag', op: 'delete', id: 'cofre', confirm: 'cofre' });
        assert.equal(result.status, 200, JSON.stringify(result.body));
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM notes')).n, 0);
        assert.equal((await bot.dbGet("SELECT COUNT(*) AS n FROM note_locks WHERE tag = 'cofre'")).n, 0);
    });
});

describe('/watch matches in the history: the message is marked with the rule and the part that matched', () => {
    const CHAT = '120363000000000077@g.us';
    let cookie;
    beforeEach(async () => { ({ cookie } = await login()); });
    const insert = (id, at, body) => bot.dbRun(`INSERT INTO messages (id, sender_name, sender_jid, sender_number, chat_id, chat_name, is_group, body, type, timestamp, has_media, from_me, revoked)
        VALUES (?, 'Maria', '5521988887777@c.us', '5521988887777', ?, 'Condomínio', 1, ?, 'chat', ?, 0, 0, 0)`, [id, CHAT, body, at]);

    test('a text rule (case and accents ignored) and a regex give the range of the match; a message with no hit has none', async () => {
        await insert('a1', 1000, 'Olha o PROMOÇÃO de hoje, vence às 18h');
        await insert('a2', 2000, 'sem nada');
        await insert('a3', 3000, 'pix de 50 e ted de 70');
        await bot.dbRun("INSERT INTO watch_hits (rule, message_id, chat_id, chat_name, body, timestamp) VALUES ('promoção', 'a1', ?, 'Condomínio', 'x', 1000), ('/ted|pix/i', 'a3', ?, 'Condomínio', 'y', 3000)", [CHAT, CHAT]);
        const { messages } = await (await get(`/api/messages?chat=${encodeURIComponent(CHAT)}&order=asc`, cookie)).json();
        const byId = Object.fromEntries(messages.map(m => [m.id, m]));
        assert.deepEqual(byId.a1.watch, [{ rule: 'promoção', start: 7, end: 15 }]);
        assert.equal(byId.a1.body.slice(7, 15), 'PROMOÇÃO');
        assert.deepEqual(byId.a2.watch, []);
        assert.deepEqual(byId.a3.watch, [{ rule: '/ted|pix/i', start: 0, end: 3 }]);
    });

    test('findMatch: the position in the original text, a bad regex gives nothing', async () => {
        const { findMatch } = bot.src('watch/rules');
        assert.deepEqual(await findMatch('acao', 'Tem AÇÃO hoje'), { start: 4, end: 8 });
        assert.deepEqual(await findMatch('/\\d+/', 'valor 1234 reais'), { start: 6, end: 10 });
        assert.equal(await findMatch('/(/', 'x'), null);
        assert.equal(await findMatch('nao-existe', 'texto'), null);
    });

    test('the history of the monitor shows a short source (the technical text stays as the hover)', async () => {
        await bot.dbRun("INSERT INTO monitor_contacts (contact_id, contact_name, created_at) VALUES ('1@c.us', 'Ciclano', 1)");
        const { id } = await bot.dbGet('SELECT id FROM monitor_contacts');
        await bot.dbRun("INSERT INTO monitor_history (contact_id, last_seen, observed_at, source, kind) VALUES (?, 1700000000, 1700000100000, 'WAWebCollections.Presence(1@lid).chatstate.attributes.t', 'chatstate offline (confirmar no aplicativo)')", [id]);
        const history = await (await get(`/api/history/monitor?id=${id}`, cookie)).json();
        assert.deepEqual(history.rows[0][2], { text: 'presence', title: 'WAWebCollections.Presence(1@lid).chatstate.attributes.t · chatstate offline (confirmar no aplicativo)' });
    });
});

describe('opening the login page warns the owner (with flood limits)', () => {
    const warnings = () => bot.client.sent.filter(m => /ZapBot-Web/.test(String(m.content))).map(m => String(m.content));
    const tick = () => new Promise(resolve => setTimeout(resolve, 30));
    const open = (path = '/', options = {}) => fetch(`${base}${path}`, options);

    beforeEach(() => {
        resetWeb();
        bot.client.sent.length = 0;
    });

    test('the page opened without a login: a ⚠️ in the private chat, with the address and the browser; the same address is told once', async () => {
        assert.equal((await open('/', { headers: { 'user-agent': `Mozilla/5.0 (iPhone) ${'x'.repeat(200)}` } })).status, 200);
        await tick();
        assert.equal(warnings().length, 1);
        assert.match(warnings()[0], /^⚠️ ZapBot-Web: alguém abriu a página de login a partir de .+\.\n🖥️ Mozilla\/5\.0 \(iPhone\) x{79}$/, 'the browser goes cut at 100 characters');
        assert.equal(bot.client.sent.find(m => /ZapBot-Web/.test(String(m.content))).chatId, bot.OWNER.jid, 'it goes to the owner chat');

        await open();
        await open();
        await tick();
        assert.equal(warnings().length, 1, 'the same address inside the window is only counted');
    });

    test('only the page counts: not the files, not HEAD, not the API; a logged in browser does not warn; the setting turns it off', async () => {
        await open('/app.js');
        await open('/style.css');
        await open('/', { method: 'HEAD' });
        await open('/api/session');
        const { cookie } = await login();
        await open('/', { headers: { cookie } });
        await tick();
        assert.equal(warnings().length, 0);

        await bot.setSetting('zapbot.web.warnAccess', false);
        await open();
        await tick();
        assert.equal(warnings().length, 0, 'off');
        await bot.setSetting('zapbot.web.warnAccess', true);
        await open();
        await tick();
        assert.equal(warnings().length, 1);
    });

    test('flood: at most 5 notices in the window from any address; the rest is counted and told in the next one', async () => {
        const { notifyWeb } = bot.src('web/alert');
        const realNow = Date.now;
        let now = realNow();
        Date.now = () => now;
        try {
            for (let i = 1; i <= 8; i++) await notifyWeb('access', { address: `10.0.0.${i}`, agent: '' });
            assert.equal(warnings().length, 5, 'from the 6th address on, only counted');

            // the same address, 11 minutes later: its own count and the ones hidden
            now += 11 * 60_000;
            await notifyWeb('access', { address: '10.0.0.1', agent: '' });
            assert.equal(warnings().length, 6);
            assert.match(warnings()[5], /\(\+3 acessos de outros endereços sem aviso, por excesso\)$/);

            // a burst from one address: told once, counted, and told in its next notice
            await notifyWeb('access', { address: '10.9.9.9', agent: '' });
            await notifyWeb('access', { address: '10.9.9.9', agent: '' });
            await notifyWeb('access', { address: '10.9.9.9', agent: '' });
            assert.equal(warnings().length, 7);
            now += 11 * 60_000;
            await notifyWeb('access', { address: '10.9.9.9', agent: '' });
            assert.match(warnings()[7], /\(\+2 acessos desse endereço desde o último aviso\)$/);
        } finally {
            Date.now = realNow;
        }
    });
});

describe('the web interface: mute a /watch rule, the chat of a schedule, clear a chat, the settings panel', () => {
    let cookie;
    const manage = async (body) => {
        const r = await fetch(`${base}/api/manage`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) });
        return { status: r.status, body: await r.json().catch(() => ({})) };
    };
    const json = async (route) => (await get(route, cookie)).json();
    beforeEach(async () => { ({ cookie } = await login()); });

    test('/watch: the toggle turns the notice off and on; the table says it; a rename and a delete take the flag along', async () => {
        await manage({ section: 'watch', op: 'add', rule: 'boleto', recipients: [{ id: bot.OTHERAlt.jid, name: 'Fulano' }] });
        assert.equal((await manage({ section: 'watch', op: 'toggle', id: 'boleto' })).body.muted, true);
        let watch = (await json('/api/lists/alerts')).sections[1];
        assert.equal(watch.values[0].muted, true);
        assert.equal(watch.rows[0][1], 'Fulano');
        assert.deepEqual(watch.rows[0][2], { bell: false, text: 'off', icon: '🔕', play: false }, 'the same cell of every row that turns on and off');
        assert.equal(watch.manage.toggle, undefined, 'no separate button: the bell is the toggle');

        assert.equal((await manage({ section: 'watch', op: 'edit', oldRule: 'boleto', rule: 'fatura', recipients: [{ id: bot.OTHERAlt.jid, name: 'Fulano' }] })).status, 200);
        assert.deepEqual((await bot.dbAll('SELECT rule FROM watch_muted')).map(r => r.rule), ['fatura']);
        assert.equal((await manage({ section: 'watch', op: 'toggle', id: 'fatura' })).body.muted, false);
        watch = (await json('/api/lists/alerts')).sections[1];
        assert.equal(watch.rows[0][1], 'Fulano');
        assert.equal(watch.rows[0][2].bell, true);

        await manage({ section: 'watch', op: 'toggle', id: 'fatura' });
        assert.equal((await manage({ section: 'watch', op: 'delete', id: 'fatura' })).status, 200);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM watch_muted')).n, 0);
        assert.equal((await manage({ section: 'watch', op: 'toggle', id: 'nao-existe' })).status, 400);
    });

    test('schedule: choose where it goes (one chat, several, or your own); an edit without the field keeps it; no emails', async () => {
        const dueAt = Date.now() + 3_600_000;
        const info = bot.client.info;
        bot.client.info = { wid: { _serialized: bot.OWNER.jid } };
        try {
            const group = { id: '120363000000000001@g.us', name: 'Grupo X', group: true };
            const friend = { id: bot.OTHERAlt.jid, name: 'Fulano' };
            assert.equal((await manage({ section: 'schedule', op: 'add', kind: 'agendar', text: 'oi', dueAt, recipients: [group] })).status, 200);
            let row = await bot.dbGet('SELECT * FROM schedules');
            assert.deepEqual([row.chat_id, row.chat_name, row.is_group, row.recipients], [group.id, 'Grupo X', 1, null]);

            assert.equal((await manage({ section: 'schedule', op: 'edit', id: row.id, kind: 'agendar', text: 'oi 2', dueAt, recipients: [friend, group] })).status, 200);
            row = await bot.dbGet('SELECT * FROM schedules');
            assert.deepEqual([row.chat_id, row.is_group, JSON.parse(row.recipients).map(r => r.name)], [bot.OTHERAlt.jid, 0, ['Fulano', 'Grupo X']]);
            const values = (await json('/api/lists/schedule')).sections[0].values[0];
            assert.deepEqual(values.recipients.map(r => r.id), [bot.OTHERAlt.jid, group.id]);

            assert.equal((await manage({ section: 'schedule', op: 'edit', id: row.id, kind: 'agendar', text: 'oi 3', dueAt })).status, 200, 'without the field');
            assert.equal((await bot.dbGet('SELECT chat_id FROM schedules')).chat_id, bot.OTHERAlt.jid, 'it keeps where it went');

            assert.equal((await manage({ section: 'schedule', op: 'edit', id: row.id, kind: 'agendar', text: 'oi 4', dueAt, recipients: [] })).status, 200);
            assert.deepEqual(Object.values(await bot.dbGet('SELECT chat_id, recipients FROM schedules')), [bot.OWNER.jid, null], 'empty: your own chat');
            assert.equal((await manage({ section: 'schedule', op: 'edit', id: row.id, kind: 'agendar', text: 'x', dueAt, recipients: [{ email: 'eu@exemplo.com' }] })).status, 400);
        } finally {
            bot.client.info = info;
        }
    });

    test('clear the history of a chat: the deleted, the edited and the reacted stay; the others go, with their media; with all, everything goes; the name confirms', async () => {
        const CHAT = '120363000000000055@g.us';
        const insert = (id, at, extra = '') => bot.dbRun(`INSERT INTO messages (id, sender_name, sender_jid, sender_number, chat_id, chat_name, is_group, body, type, timestamp, has_media, media_path, from_me, revoked)
            VALUES (?, 'Maria', '5521988887777@c.us', '5521988887777', ?, 'Turma', 1, ?, 'chat', ?, ?, ?, 0, ?)`, [id, CHAT, `texto ${id}`, at, extra ? 1 : 0, extra || null, id === 'del' ? 1 : 0]);
        const file = path.join(MEDIA_DIR, 'turma-foto.jpg');
        fs.mkdirSync(MEDIA_DIR, { recursive: true });
        fs.writeFileSync(file, 'x');
        await insert('a', 1); await insert('b', 2, 'turma-foto.jpg'); await insert('c', 3); await insert('del', 4); await insert('ed', 5); await insert('re', 6); await insert('rc', 7);
        await bot.dbRun("INSERT INTO message_edits (message_id, chat_id, old_body, new_body, edited_at) VALUES ('ed', ?, 'antes', 'depois', 9)", [CHAT]);
        await bot.dbRun("INSERT INTO reactions (message_id, sender_jid, reaction, reacted_at) VALUES ('re', '1@c.us', '👍', 1)");
        await bot.dbRun("INSERT INTO reaction_changes (message_id, sender_name, old_reaction, new_reaction, changed_at) VALUES ('rc', 'Maria', '👍', '', 9)");

        const preview = await manage({ section: 'chat', op: 'preview', chat: CHAT });
        assert.deepEqual([preview.body.name, preview.body.total, preview.body.removed, preview.body.kept], ['Turma', 7, 3, 4]);
        assert.equal((await manage({ section: 'chat', op: 'clear', chat: CHAT, confirm: 'outro nome' })).status, 400, 'the name has to match');
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM messages WHERE chat_id = ?', [CHAT])).n, 7);

        const done = await manage({ section: 'chat', op: 'clear', chat: CHAT, confirm: ' turma ' });
        assert.deepEqual([done.status, done.body.removed, done.body.kept], [200, 3, 4]);
        assert.deepEqual((await bot.dbAll('SELECT id FROM messages WHERE chat_id = ? ORDER BY id', [CHAT])).map(r => r.id), ['del', 'ed', 'rc', 're']);
        assert.equal(fs.existsSync(file), false, 'the media of the deleted ones is gone');
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM message_edits')).n, 1, 'the edits stay');
        assert.equal((await manage({ section: 'chat', op: 'preview', chat: 'nao@g.us' })).status, 400);

        // all: the deleted, the edited and the reacted ones go too, with their media, edits and reactions
        const kept = path.join(MEDIA_DIR, 'turma-apagada.jpg');
        fs.writeFileSync(kept, 'x');
        await bot.dbRun("UPDATE messages SET has_media = 1, media_path = 'turma-apagada.jpg' WHERE id = 'del'");
        const everything = await manage({ section: 'chat', op: 'clear', chat: CHAT, confirm: 'Turma', all: true });
        assert.deepEqual([everything.status, everything.body.removed, everything.body.kept], [200, 4, 0]);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM messages WHERE chat_id = ?', [CHAT])).n, 0);
        assert.equal(fs.existsSync(kept), false, 'the media of a deleted message goes too');
        for (const table of ['message_edits', 'reactions', 'reaction_changes']) {
            assert.equal((await bot.dbGet(`SELECT COUNT(*) AS n FROM ${table}`)).n, 0, table);
        }
    });

    test('Show: the counts, who deletes the most, each kind with search, person and pages; mute and take out', async () => {
        const msg = (id, chat, number, extra = {}) => bot.dbRun(`INSERT INTO messages (id, chat_id, chat_name, is_group, sender_name, sender_jid, sender_number, body, timestamp, type, revoked, revoked_at, has_media)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, chat, extra.chatName ?? 'Turma', chat.endsWith('@g.us') ? 1 : 0, extra.name ?? 'Maria', `${number}@c.us`, number,
            extra.body ?? `texto ${id}`, extra.at ?? 1000, extra.type ?? 'chat', extra.revoked ?? 1, extra.at ?? 1000, extra.media ? 1 : 0]);
        const G = '120363000000000888@g.us';
        await msg('d1', G, '5521977770001', { body: 'apagou isso', at: 3000 });
        await msg('d2', G, '5521977770001', { body: 'e isso', at: 2000, media: true, type: 'image' });
        await msg('d3', G, '5521977770002', { name: 'João', body: 'do João', at: 1000 });
        await msg('s1', 'status@broadcast', '5521977770002', { name: 'João', body: 'um status', at: 4000 });
        await msg('c1', '120363000000000999@newsletter', '5521977770003', { name: 'Canal', body: 'post', at: 5000 });
        await msg('ok', G, '5521977770001', { revoked: 0 });
        await bot.dbRun(`INSERT INTO message_edits (message_id, chat_id, chat_name, is_group, sender_name, sender_number, old_body, new_body, timestamp, edited_at)
            VALUES ('ok', ?, 'Turma', 1, 'Maria', '5521977770001', 'antes', 'depois', 1000, 6000)`, [G]);
        await bot.dbRun(`INSERT INTO reaction_changes (message_id, chat_id, chat_name, is_group, sender_name, sender_jid, sender_number, old_reaction, new_reaction, body, reacted_at, changed_at)
            VALUES ('ok', ?, 'Turma', 1, 'João', '5521977770002@c.us', '5521977770002', '👍', '', 'texto ok', 1000, 7000)`, [G]);

        const summary = await json('/api/show');
        assert.deepEqual(summary.counts, { deleted: 3, status: 1, channels: 1, edited: 1, reactions: 1 });
        assert.deepEqual(Object.keys(summary.alerts).sort(), ['show.alert.deleted', 'show.alert.edited', 'show.alert.reaction', 'show.alert.status']);
        assert.deepEqual(summary.people.map(p => [p.name, p.deleted, p.edited, p.reactions]), [['Maria', 2, 1, 0], ['João', 1, 0, 1]]);

        const deleted = await json('/api/show/items?kind=deleted');
        assert.deepEqual(deleted.items.map(i => i.messageId), ['d1', 'd2', 'd3'], 'newest first');
        assert.equal(deleted.items[1].media, true);
        assert.deepEqual(deleted.items[0].person, { number: '5521977770001', id: '5521977770001@c.us', name: 'Maria', muted: false });
        assert.deepEqual((await json('/api/show/items?kind=deleted&q=jo%C3%A3o')).items.map(i => i.messageId), ['d3'], 'the search looks at the person too');
        assert.deepEqual((await json('/api/show/items?kind=deleted&person=5521977770001')).items.map(i => i.messageId), ['d1', 'd2']);
        assert.deepEqual((await json('/api/show/items?kind=deleted&before=3000')).items.map(i => i.messageId), ['d2', 'd3'], 'the next page');
        assert.deepEqual((await json('/api/show/items?kind=status')).items.map(i => i.text), ['um status']);
        assert.deepEqual((await json('/api/show/items?kind=channels')).items.map(i => i.text), ['post']);
        const [edit] = (await json('/api/show/items?kind=edited')).items;
        assert.deepEqual([edit.before, edit.after], ['antes', 'depois']);
        const [reaction] = (await json('/api/show/items?kind=reactions')).items;
        assert.deepEqual(reaction.reaction, { from: '👍', to: '' });
        assert.equal((await get('/api/show/items?kind=nope', cookie)).status, 400);

        assert.equal((await manage({ section: 'show', op: 'mute', number: '5521977770001', name: 'Maria' })).body.muted, true);
        assert.equal((await json('/api/show')).people[0].muted, true);
        assert.ok(await bot.src('mute').muted('apagada', { chatId: G, senders: ['5521977770001@c.us'] }), 'the same /mute the bot uses');
        assert.equal((await manage({ section: 'show', op: 'mute', number: '5521977770001' })).body.muted, false);
        assert.equal((await manage({ section: 'show', op: 'mute', number: '12' })).status, 400);

        assert.equal((await manage({ section: 'show', op: 'delete', kind: 'deleted', id: 'd3' })).status, 200);
        assert.equal(await bot.dbGet("SELECT id FROM messages WHERE id = 'd3'"), undefined);
        // Several at once (the selection of the page): the ones that are not Show items are skipped
        const many = await manage({ section: 'show', op: 'delete', kind: 'deleted', ids: ['d1', 'd2', 'ok', 'nada'] });
        assert.equal(many.status, 200);
        assert.equal(many.body.removed, 2);
        assert.equal((await json('/api/show')).counts.deleted, 0);
        assert.equal((await manage({ section: 'show', op: 'delete', kind: 'deleted', ids: [] })).status, 400);
        assert.equal((await manage({ section: 'show', op: 'delete', kind: 'deleted', id: 'ok' })).status, 400, 'a message that was not deleted is not a Show item');
        assert.equal((await manage({ section: 'show', op: 'delete', kind: 'edited', id: edit.id })).status, 200);
        assert.equal((await json('/api/show')).counts.edited, 0);
    });

    test('the cache of the home: the parts picked (media, temporary, contact photos), or everything with the confirmation; the notes stay', async () => {
        const put = (dir, name) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, name), 'x'); return path.join(dir, name); };
        const media = put(MEDIA_DIR, 'cache-test.jpg');
        const tmp = put(TMP_DIR, 'cache-test.tmp');
        const photo = put(CONTACTS_DIR, '5521977770009.jpg');
        const note = put(NOTES_DIR, 'cache-test-note.jpg');
        await bot.dbRun("INSERT INTO messages (id, chat_id, chat_name, body, timestamp, type, revoked) VALUES ('cx', '5521977770009@c.us', 'x', 'y', ?, 'chat', 0)", [Date.now()]);

        assert.equal((await manage({ section: 'cache', op: 'clean' })).status, 400, 'nothing picked');
        const picked = await manage({ section: 'cache', op: 'clean', media: true, temporary: true });
        assert.equal(picked.status, 200);
        assert.deepEqual([fs.existsSync(media), fs.existsSync(tmp), fs.existsSync(photo)], [false, false, true], 'only the picked ones');
        assert.equal((await manage({ section: 'cache', op: 'clean', contacts: true })).status, 200);
        assert.equal(fs.existsSync(photo), false);
        assert.ok(await bot.dbGet("SELECT 1 FROM messages WHERE id = 'cx'"), 'the messages stay without everything');

        assert.equal((await manage({ section: 'cache', op: 'clean', all: true })).status, 400, 'everything needs the confirmation');
        assert.equal((await manage({ section: 'cache', op: 'clean', all: true, confirm: 'everything' })).status, 200);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM messages')).n, 0);
        assert.equal(fs.existsSync(note), true, 'the notes are never part of the cache');
        fs.rmSync(note, { force: true });
    });

    test('the big flush: every chat at once, with a fixed confirmation; all takes the deleted, edited and reacted ones too', async () => {
        const insert = (id, chat, revoked = 0) => bot.dbRun(`INSERT INTO messages (id, chat_id, chat_name, body, timestamp, type, revoked)
            VALUES (?, ?, 'x', 'texto', 1, 'chat', ?)`, [id, chat, revoked]);
        await insert('g1', '120363000000000777@g.us'); await insert('g2', '120363000000000777@g.us', 1);
        await insert('p1', '5521977770001@c.us'); await insert('p2', '5521977770002@c.us');
        await bot.dbRun("INSERT INTO reactions (message_id, sender_jid, reaction, reacted_at) VALUES ('p2', '1@c.us', '👍', 1)");
        const count = async () => (await bot.dbGet('SELECT COUNT(*) AS n FROM messages')).n;
        const before = await count();

        const preview = (await manage({ section: 'chat', op: 'previewAll' })).body;
        assert.equal(preview.total, before);
        assert.ok(preview.chats >= 3);
        assert.equal((await manage({ section: 'chat', op: 'clearAll', confirm: 'yes' })).status, 400, 'only the fixed confirmation');
        assert.equal(await count(), before);

        const kept = await manage({ section: 'chat', op: 'clearAll', confirm: preview.confirm });
        assert.equal(kept.status, 200);
        assert.deepEqual((await bot.dbAll("SELECT id FROM messages WHERE id IN ('g1', 'g2', 'p1', 'p2') ORDER BY id")).map(r => r.id), ['g2', 'p2'],
            'the deleted one and the reacted one stay, in every chat');

        const everything = await manage({ section: 'chat', op: 'clearAll', confirm: preview.confirm, all: true });
        assert.deepEqual([everything.status, everything.body.kept], [200, 0]);
        assert.equal(await count(), 0);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM reactions')).n, 0);
    });

    test('settings: the answer carries where the page is and which settings need a restart; every web setting is there', async () => {
        const data = await json('/api/lists/settings');
        assert.deepEqual(data.web.restartKeys, ['zapbot.web.enabled', 'zapbot.web.host', 'zapbot.web.port']);
        assert.ok('url' in data.web);
        const keys = data.sections[0].ids.filter(k => k.startsWith('zapbot.web.'));
        assert.deepEqual(keys, ['zapbot.web.enabled', 'zapbot.web.host', 'zapbot.web.login', 'zapbot.web.pageSize', 'zapbot.web.password', 'zapbot.web.port', 'zapbot.web.refreshSeconds', 'zapbot.web.sessionHours', 'zapbot.web.sessionTimeout', 'zapbot.web.totp', 'zapbot.web.trustProxy', 'zapbot.web.url', 'zapbot.web.warnAccess', 'zapbot.web.warnChangedPhone']);
        // (the panel groups them, in app.js: all of them are in one of the groups)
        const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'web', 'public', 'app.js'), 'utf8');
        for (const key of keys) assert.ok(source.includes(`'${key}'`), `${key} is in the panel`);
    });
});

describe('2FA by the chat: /set zapbot.web.totp new, the code, qr', () => {
    const PRIVATE = { chat: bot.OWNER.jid };
    const totp = bot.src('util/totp');
    const webTotp = bot.src('webTotp');
    const media = () => bot.client.sent.filter(m => m.content?.mimetype === 'image/png');
    const messagesTable = async () => JSON.stringify(await bot.dbAll('SELECT body, media_path, raw_json FROM messages'));
    const secretOf = () => webTotp.waiting()?.secret;
    const typed = (code) => bot.replyAlt(`/set zapbot.web.totp ${code}`, PRIVATE);
    const sentTexts = () => bot.client.sent.map(m => String(m.content?.mimetype ? '' : m.content)).join('\n');

    beforeEach(async () => {
        webTotp.reset();
        bot.client.sent.length = 0;
        await bot.setSetting('zapbot.web.totp', '');
        bot.client.info = { wid: { _serialized: bot.OWNER.jid }, pushname: 'Jorge' };
    });

    test('"new": sends the QR code and the code, but the 2FA is NOT on until the code of the app is typed', async () => {
        await bot.replyAlt('/set zapbot.web.totp new', PRIVATE);
        const secret = secretOf();
        assert.match(secret, /^[A-Z2-7]{32}$/);
        assert.equal(bot.getSetting('zapbot.web.totp'), '', 'not saved yet');
        assert.equal((await (await get('/api/session')).json()).needsCode, false, 'the login does not ask for the code yet');

        const [qr] = media();
        assert.ok(qr, 'a QR code image went out');
        assert.equal(qr.content.filename, 'zapbot-2fa.png');
        assert.equal(Buffer.from(qr.content.data, 'base64').subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'a PNG');
        assert.equal(qr.chatId, bot.OWNER.jid);
        assert.ok(qr.options.caption.includes(secret.match(/.{1,4}/g).join(' ')), 'with the code, in groups of 4');
        assert.match(qr.options.caption, /\/set zapbot\.web\.totp 123456/, 'and the last step: type the code of the app');
    });

    test('/web completes and disables two-factor setup', async () => {
        const { cookie } = await login();
        await bot.replyAlt('/web -2fa new', PRIVATE);
        assert.match(media()[0].options.caption, /\/web -2fa 123456/);
        const secret = secretOf();
        await bot.replyAlt(`/web -totp ${totp.code(secret)}`, PRIVATE);
        assert.equal(bot.getSetting('zapbot.web.totp'), secret);
        assert.equal((await get('/api/chats', cookie)).status, 401);
        await bot.replyAlt('/web -2fa off', PRIVATE);
        assert.equal(bot.getSetting('zapbot.web.totp'), '');
    });

    test('the right code turns it on (and is the only thing that does); the login asks for it from then on', async () => {
        await bot.replyAlt('/set zapbot.web.totp new', PRIVATE);
        const secret = secretOf();

        assert.match((await typed('000000')).join('\n') + sentTexts(), /Código errado|Wrong code/);
        assert.equal(bot.getSetting('zapbot.web.totp'), '', 'a wrong code does not turn it on');

        bot.client.sent.length = 0;
        await typed(totp.code(secret));
        assert.equal(bot.getSetting('zapbot.web.totp'), secret, 'the secret is saved now');
        assert.match(sentTexts(), /2FA ativado|2FA is on/);
        assert.equal(webTotp.waiting(), null, 'nothing is waiting anymore');
        assert.equal((await (await get('/api/session')).json()).needsCode, true);

        // and the login really wants the code
        const login = (code) => fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: USER, password: PASSWORD, code }) });
        assert.equal((await login(totp.code(secret))).status, 200);
        resetWeb();
        assert.equal((await login('000000')).status, 401);
    });

    test('5 wrong codes discard what was waiting (the 2FA stays as it was); the message with the code is deleted and masked', async () => {
        await bot.replyAlt('/set zapbot.web.totp new', PRIVATE);
        for (let i = 0; i < 4; i++) await typed('111111');
        assert.ok(webTotp.waiting(), 'still waiting');
        bot.client.sent.length = 0;
        const msg = bot.createMessage({ text: '/set zapbot.web.totp 111111', chat: bot.OWNER.jid, de: bot.OWNER.jid });
        await bot.deliver(msg);
        assert.equal(webTotp.waiting(), null, 'discarded');
        assert.match(sentTexts(), /5 códigos errados|5 wrong codes/);
        assert.equal(bot.getSetting('zapbot.web.totp'), '');

        assert.equal(msg.deletedFor, 'everyone', 'the message with the code leaves the chat');
        assert.equal((await bot.dbGet('SELECT body FROM messages WHERE id = ?', [msg.id.id])).body, '/set zapbot.web.totp ***');
    });

    test('with the 2FA on, a code only says if it is right; without any, it says there is none; a waiting secret expires', async () => {
        assert.match(sentTexts() + (await typed('123456')).join(''), /Ainda não há 2FA|no 2FA yet/);

        await bot.replyAlt('/set zapbot.web.totp new', PRIVATE);
        const secret = secretOf();
        await typed(totp.code(secret));
        bot.client.sent.length = 0;
        await typed(totp.code(secret));
        assert.match(sentTexts(), /está certo|is right/);
        bot.client.sent.length = 0;
        await typed('000000');
        assert.match(sentTexts(), /não confere|does not match/);
        assert.equal(bot.getSetting('zapbot.web.totp'), secret, 'nothing changed');

        // a new secret is waiting while the old one is in use: only its code replaces the old one
        await bot.replyAlt('/set zapbot.web.totp new', PRIVATE);
        const next = secretOf();
        assert.notEqual(next, secret);
        assert.equal(bot.getSetting('zapbot.web.totp'), secret, 'the old one still works');
        const realNow = Date.now;
        Date.now = () => realNow() + 11 * 60_000;
        try {
            assert.equal(webTotp.waiting(), null, 'it expires after 10 minutes');
        } finally {
            Date.now = realNow;
        }
    });

    test('the QR message is deleted once: the confirmation and the timer do not delete it twice', async () => {
        const calls = [];
        const sendMessage = bot.client.sendMessage;
        bot.client.sendMessage = async (chatId, content, options) => {
            const sent = await sendMessage(chatId, content, options);
            if (content?.mimetype === 'image/png') sent.delete = async (everyone) => { calls.push(everyone); if (calls.length > 1) throw new TypeError("Cannot read properties of undefined (reading 'id')"); };
            return sent;
        };
        try {
            await bot.replyAlt('/set zapbot.web.totp new', PRIVATE);
            const secret = secretOf();
            const logsBefore = bot.logs.length;
            await typed(bot.src('util/totp').code(secret));
            assert.deepEqual(calls, [true], 'deleted for everybody, once');
            assert.ok(!bot.logs.slice(logsBefore).some(l => /could not delete/.test(l)), 'no error in the log');
        } finally {
            bot.client.sendMessage = sendMessage;
        }
    });

    test('what the bot sent is never saved: not the caption, not the image', async () => {
        await bot.replyAlt('/set zapbot.web.totp new', PRIVATE);
        const [qr] = media();
        const secret = secretOf();
        await bot.deliver(bot.createMessage({ text: qr.options.caption, chat: bot.OWNER.jid, de: bot.OWNER.jid }));
        const saved = await messagesTable();
        assert.ok(!saved.includes(secret) && !saved.includes(secret.slice(0, 4) + ' ' + secret.slice(4, 8)), 'the secret is not in the messages table');
        assert.ok(!saved.includes('2FA'), 'nor the message');
    });

    test('"qr": the same secret again (the waiting one, or the one in use); without any it says so', async () => {
        assert.match((await bot.replyAlt('/set zapbot.web.totp qr', PRIVATE)).join('\n') + sentTexts(), /zapbot\.web\.totp new/);
        await bot.replyAlt('/set zapbot.web.totp new', PRIVATE);
        const first = secretOf();
        bot.client.sent.length = 0;
        await bot.replyAlt('/set zapbot.web.totp qr', PRIVATE);
        assert.equal(secretOf(), first, 'qr does not change it');
        assert.ok(media()[0].options.caption.includes(first.match(/.{1,4}/g).join(' ')));
        await bot.replyAlt('/set zapbot.web.totp new', PRIVATE);
        assert.notEqual(secretOf(), first, 'new again makes another one');
    });

    test('only in your private chat, and only by you; the others get an explanation (and no secret)', async () => {
        const inGroup = await bot.replyAlt('/set zapbot.web.totp new', { chat: bot.GROUP });
        assert.match(inGroup.join('\n'), /privado|private chat/);
        assert.equal(secretOf(), undefined, 'nothing was made');
        assert.equal(media().length, 0);

        const other = await bot.replyAlt('/set zapbot.web.totp new', { chat: bot.GROUP, de: bot.OTHERAlt.jid });
        assert.equal(secretOf(), undefined);
        assert.equal(media().length, 0, `no QR for others: ${JSON.stringify(other)}`);
        await bot.replyAlt('/set zapbot.web.totp 123456', { chat: bot.GROUP, de: bot.OTHERAlt.jid });
        assert.equal(bot.getSetting('zapbot.web.totp'), '');
    });
});
