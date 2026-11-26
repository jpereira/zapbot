/*
 * The tools of the web interface: the online sessions of /monitor and who was online together, the push notices
 * (VAPID + aes128gcm), the health page, the media gallery, the tries of the shortcut and /watch forms and the
 * installable page (service worker, manifest, what may stay offline).
 */
const bot = require('./helpers/bot');

const { test, before, after, beforeEach, afterEach, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { createServer, resetWeb } = bot.src('web/server');
const { MEDIA_DIR } = bot.src('constants');
const webPush = bot.src('webPush');
const monitor = bot.src('monitor');
const { network, OTHERAlt } = bot;

const USER = 'jorge.admin';
const PASSWORD = 'uma-senha-bem-longa';
const PUSH = 'https://push.example.net/send/abc123';

let server;
let base;
before(async () => {
    server = createServer();
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(r => server.close(r)));

let cookie;
beforeEach(async () => {
    await bot.restart();
    resetWeb();
    await bot.setSetting('zapbot.web.login', USER);
    await bot.setSetting('zapbot.web.password', PASSWORD);
    const r = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: USER, password: PASSWORD }) });
    cookie = (r.headers.get('set-cookie') ?? '').split(';')[0];
});
afterEach(() => {
    monitor.stopMonitor();
    delete bot.client.pupPage;
});

const get = (route, c = cookie) => fetch(base + route, { headers: c ? { cookie: c } : {} });
const json = async (route) => (await get(route)).json();
const manage = async (body) => {
    const r = await fetch(`${base}/api/manage`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
};
const settle = async (until, tries = 50) => {
    for (let i = 0; i < tries && !until(); i++) await new Promise(r => setTimeout(r, 10));
};

/* a browser: its keys, and how it reads a push (the receiver side of RFC 8291) */
function browser() {
    const ecdh = crypto.createECDH('prime256v1');
    ecdh.generateKeys();
    const auth = crypto.randomBytes(16);
    return { ecdh, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') }, auth };
}
function decrypt(body, { ecdh, auth }) {
    const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
    const salt = body.subarray(0, 16);
    const idLength = body[20];
    const asPublic = body.subarray(21, 21 + idLength);
    const cipherText = body.subarray(21 + idLength);
    const shared = ecdh.computeSecret(asPublic);
    const ikm = hmac(hmac(auth, shared), Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), asPublic, Buffer.from([1])]));
    const prk = hmac(salt, ikm);
    const decipher = crypto.createDecipheriv('aes-128-gcm', hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16), hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12));
    decipher.setAuthTag(cipherText.subarray(-16));
    const plain = Buffer.concat([decipher.update(cipherText.subarray(0, -16)), decipher.final()]);
    assert.equal(plain.at(-1), 2, 'the last record');
    return JSON.parse(plain.subarray(0, -1).toString());
}
const pushCalls = () => network.calls.filter(c => c.url.startsWith('https://push.example.net'));

describe('push notices', () => {
    test('the encryption is the one of RFC 8291 (its example, byte by byte)', () => {
        const ecdh = crypto.createECDH('prime256v1');
        ecdh.setPrivateKey(Buffer.from('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', 'base64url'));
        const body = webPush.encrypt(Buffer.from('When I grow up, I want to be a watermelon'), {
            p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg'
        }, { ecdh, salt: Buffer.from('DGv6ra1nlYgDCS1FRnbzlw', 'base64url') });
        assert.equal(body.toString('base64url'), 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
    });

    test('VAPID: a JWT for the origin of the endpoint, signed with the key the page subscribes with', async () => {
        const header = await webPush.vapidHeader(PUSH);
        const [, jwt, key] = header.match(/^vapid t=([^,]+), k=(.+)$/);
        const { publicKey } = await json('/api/push');
        assert.equal(key, publicKey, 'the same key as /api/push gives');
        const [h, c, signature] = jwt.split('.');
        const claims = JSON.parse(Buffer.from(c, 'base64url'));
        assert.equal(claims.aud, 'https://push.example.net');
        assert.ok(claims.exp > Date.now() / 1000 && claims.exp <= Date.now() / 1000 + 24 * 3600);
        const raw = Buffer.from(publicKey, 'base64url');
        const verifier = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') }, format: 'jwk' });
        assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key: verifier, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')));
        // the keys are kept: the same after the cache of the process is gone
        assert.equal((await bot.dbGet('SELECT public_key FROM web_push_keys')).public_key, publicKey);
    });

    test('subscribe (https only, real keys), the kinds, a test, and a browser that left (410) is removed', async () => {
        const b = browser();
        assert.equal((await manage({ section: 'push', op: 'subscribe', endpoint: 'http://push.example.net/x', keys: b.keys })).status, 400);
        assert.equal((await manage({ section: 'push', op: 'subscribe', endpoint: PUSH, keys: { p256dh: 'abc', auth: 'def' } })).status, 400);
        const ok = await manage({ section: 'push', op: 'subscribe', endpoint: PUSH, keys: b.keys, kinds: ['watch', 'nonsense'] });
        assert.deepEqual(ok.body.kinds, ['watch']);
        const info = await json(`/api/push?endpoint=${encodeURIComponent(PUSH)}`);
        assert.deepEqual([info.devices, info.subscription.kinds, info.kinds], [1, ['watch'], ['monitor', 'watch', 'price', 'web']]);

        network.responder('post', 'push.example.net', network.http({ status: 201, data: '' }));
        const sent = await manage({ section: 'push', op: 'test', endpoint: PUSH, title: '🔔', text: 'oi' });
        assert.deepEqual(sent.body, { ok: true, status: 201 });
        const [call] = pushCalls();
        assert.equal(call.cfg.headers['Content-Encoding'], 'aes128gcm');
        assert.match(call.cfg.headers.Authorization, /^vapid t=.+, k=/);
        assert.deepEqual([decrypt(call.cfg.body, b).title, decrypt(call.cfg.body, b).body], ['🔔', 'oi']);

        // a kind it did not ask for: nothing
        assert.deepEqual(await webPush.pushNotice('price', { title: 'x' }), []);
        network.responder('post', 'push.example.net', () => { throw Object.assign(new Error('gone'), { response: { status: 410 } }); });
        assert.deepEqual(await webPush.pushNotice('watch', { title: 'x' }), [410]);
        assert.equal((await json('/api/push')).devices, 0);
        assert.equal((await manage({ section: 'push', op: 'test', endpoint: PUSH })).status, 400);
    });

    test('a /watch match goes to the browser too, with a link to the message', async () => {
        const b = browser();
        await manage({ section: 'push', op: 'subscribe', endpoint: PUSH, keys: b.keys, kinds: ['watch'] });
        network.responder('post', 'push.example.net', network.http({ status: 201, data: '' }));
        await bot.setSetting('watch.rules', ['boleto']);
        const msg = bot.createMessage({ text: 'o boleto venceu', de: OTHERAlt.jid });
        await bot.deliver(msg);
        await settle(() => pushCalls().length);
        const notice = decrypt(pushCalls()[0].cfg.body, b);
        assert.equal(notice.title, '👀 boleto');
        assert.match(notice.body, /o boleto venceu/);
        assert.match(notice.url, new RegExp(`^/\\?chat=.+&msg=${msg.id.id}&at=\\d+$`));
    });
});

describe('the monitor: online sessions and who was online together', () => {
    const presence = (isOnline, lastSeen = null) => ({ presenceData: { isOnline, hasData: true, lastSeen, chatstate: { type: isOnline ? 'available' : 'unavailable', t: lastSeen } } });
    const next = () => bot.dbRun('UPDATE monitor_contacts SET last_attempt_at = 0');

    test('online opens a session, the next check stretches it, offline closes it at the last seen', async (t) => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        bot.state.ready = true;
        const { contact } = await monitor.registerMonitored({ id: OTHERAlt.jid, name: 'Fulano' });
        const replies = [presence(true), presence(true), presence(false, Math.floor(Date.now() / 1000) + 5)];
        bot.client.pupPage = { evaluate: async () => replies.shift() };
        for (let i = 0; i < 3; i++) {
            await monitor.checkMonitor();
            await next();
        }
        const [session] = await bot.dbAll('SELECT * FROM monitor_sessions');
        assert.equal(session.contact_id, contact.id);
        assert.ok(session.ended_at >= session.started_at, 'closed');
        // after a pause (no check for more than two rounds) an online one opens a new session, the old one ends at its last check
        await monitor.recordSession(contact.id, 1, Date.now(), null);
        await monitor.recordSession(contact.id, 1, Date.now() + monitor.staleAfter() + 1000, null);
        const [old, fresh] = await bot.dbAll('SELECT * FROM monitor_sessions WHERE id > ? ORDER BY id', [session.id]);
        assert.equal(old.ended_at, old.last_at);
        assert.equal(fresh.ended_at, null);
        await bot.dbRun('DELETE FROM monitor_sessions WHERE id > ?', [session.id]);
        // a hidden presence (null) changes nothing; removing the contact takes its sessions
        await monitor.recordSession(contact.id, null, Date.now(), null);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM monitor_sessions')).n, 1);
        await monitor.removeMonitored(contact.id);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM monitor_sessions')).n, 0);
    });

    test('the tab: the time online (today, 7 days, per visit) and the overlap of two contacts', async () => {
        const now = Date.now();
        const min = 60_000;
        await bot.dbRun("INSERT INTO monitor_contacts (id, contact_id, contact_name, created_at) VALUES (1, '1@c.us', 'Ana', 1), (2, '2@c.us', 'Bia', 1), (3, '3@c.us', 'Caio', 1)");
        await bot.dbRun(`INSERT INTO monitor_sessions (contact_id, started_at, last_at, ended_at) VALUES
            (1, ${now - 60 * min}, ${now - 30 * min}, ${now - 30 * min}), (2, ${now - 45 * min}, ${now - 10 * min}, ${now - 10 * min}),
            (1, ${now - 5 * min}, ${now - min}, NULL), (2, ${now - 3 * min}, ${now - min}, NULL), (3, ${now - 30 * 86_400_000}, 1, 1)`);
        const data = await json('/api/monitor');
        const ana = data.contacts.find(c => c.name === 'Ana');
        assert.equal(ana.activity.sessions.length, 2);
        assert.equal(ana.activity.sessions[1].open, true);
        assert.equal(ana.activity.week, 34 * min, '30 min + the open one up to its last check');
        assert.equal(ana.activity.average, 17 * min);
        assert.equal(data.contacts.find(c => c.name === 'Caio').activity.sessions.length, 0, 'older than 7 days');
        const [pair] = data.together;
        assert.deepEqual([pair.a, pair.b, pair.total, pair.times], [1, 2, 17 * min, 2], '15 min + 2 min together');
        assert.equal(pair.ongoing, true);
        assert.equal(data.together.length, 1, 'Caio was never online with anyone');
    });
});

describe('health', () => {
    test('WhatsApp, the process, the loops, the regex queue and the last errors; only logged in', async () => {
        assert.equal((await get('/api/health', null)).status, 401);
        bot.src('log').printError('Teste: something broke', { code: 42 });
        const h = await json('/api/health');
        assert.ok(['ok', 'warn', 'bad'].includes(h.verdict));
        assert.ok(h.process.rss > 0 && h.process.heapUsed > 0);
        assert.ok(h.loops.some(l => l.name === '/monitor') && h.loops.some(l => l.name === '/cron'));
        assert.equal(typeof h.regex.queued, 'number');
        assert.match(h.errors[0].text, /Teste: something broke/);
        assert.ok(h.problems.includes('errors'));
    });

    test('a loop counts its rounds and says when it is stuck', () => {
        let clock = 0;
        const { loopGuard, loopStates } = bot.src('util/loopGuard');
        const guard = loopGuard('teste-loop', { stuckMs: 100, now: () => clock });
        guard.start();
        clock = 50;
        guard.end();
        guard.start();
        clock = 500;
        const state = loopStates().find(l => l.name === 'teste-loop');
        assert.deepEqual([state.runs, state.lastMs, state.since, state.stuck], [1, 50, 50, true]);
    });
});

describe('media gallery', () => {
    const file = (name, size) => {
        fs.mkdirSync(MEDIA_DIR, { recursive: true });
        fs.writeFileSync(path.join(MEDIA_DIR, name), Buffer.alloc(size, 1));
        return name;
    };
    const insert = (id, chat, type, media, at, o = {}) => bot.dbRun(
        'INSERT INTO messages (id, chat_id, chat_name, type, timestamp, has_media, media_path, sender_name, from_me) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)',
        [id, chat, o.name ?? chat, type, at, media, o.sender ?? null, o.fromMe ? 1 : 0]);

    test('by kind, chat and period, with the sizes, pages and the chats that take the most', async () => {
        const now = Date.now();
        await insert('g1', 'a@c.us', 'image', file('g1.jpg', 3000), now - 1000, { name: 'Ana' });
        await insert('g2', 'a@c.us', 'video', file('g2.mp4', 9000), now - 2000, { name: 'Ana' });
        await insert('g3', 'b@c.us', 'ptt', file('g3.ogg', 500), now - 3000, { name: 'Bia' });
        await insert('g4', 'b@c.us', 'image', file('g4.jpg', 100), now - 40 * 86_400_000, { name: 'Bia' });
        bot.src('web/gallery').forgetSizes();

        const all = await json('/api/gallery');
        assert.deepEqual(all.items.map(i => i.id), ['g1', 'g2', 'g3', 'g4']);
        assert.deepEqual([all.totals.count, all.totals.size, all.totals.byKind.audio.count], [4, 12600, 1]);
        assert.deepEqual(all.chats.map(c => [c.name, c.size]), [['Ana', 12000], ['Bia', 600]]);
        assert.equal(all.items[2].kind, 'audio', 'a voice note is an audio');

        assert.deepEqual((await json('/api/gallery?kind=image')).items.map(i => i.id), ['g1', 'g4']);
        assert.deepEqual((await json('/api/gallery?chat=b%40c.us')).items.map(i => i.id), ['g3', 'g4']);
        const month = await json(`/api/gallery?from=${now - 30 * 86_400_000}`);
        assert.equal(month.totals.count, 3);
        assert.equal(month.totals.byKind.image.count, 1, 'the totals follow the period too');
    });

    test('sorted by size or name, searched, with the MIME type and when the cleanup takes each one', async () => {
        const now = Date.now();
        await bot.setSetting('cache.messageMediaRetentionDays', 5);
        await insert('s1', 'a@c.us', 'document', file('contrato.pdf', 900), now - 1000, { name: 'Ana' });
        await insert('s2', 'a@c.us', 'document', file('planilha.xlsx', 5000), now - 2000, { name: 'Ana' });
        await insert('s3', 'b@c.us', 'image', file('foto.jpg', 300), now - 3000, { name: 'Bia' });
        await bot.dbRun("UPDATE messages SET revoked = 1, revoked_at = ? WHERE id = 's3'", [now]);
        bot.src('web/gallery').forgetSizes();
        assert.deepEqual((await json('/api/gallery?sort=size')).items.map(i => i.id), ['s2', 's1', 's3']);
        assert.deepEqual((await json('/api/gallery?sort=name&desc=0')).items.map(i => i.name), ['contrato.pdf', 'foto.jpg', 'planilha.xlsx']);
        const found = await json('/api/gallery?q=PLANILHA');
        assert.deepEqual([found.items.map(i => i.id), found.matched], [['s2'], 1]);
        assert.equal((await json('/api/gallery?q=bia')).items[0].id, 's3', 'the chat name too');
        const [pdf] = (await json('/api/gallery?q=contrato')).items;
        assert.equal(pdf.mime, 'application/pdf');
        assert.equal(pdf.expiresAt, now - 1000 + 5 * 86_400_000, 'the media window');
        const deleted = (await json('/api/gallery?q=foto')).items[0];
        assert.equal(deleted.expiresAt, now + bot.getSetting('cache.revokedRetentionDays') * 86_400_000, 'a deleted one: its own window');
    });

    test('the same files: grouped by content, joined as hard links (space freed, every message keeps its media)', async () => {
        const now = Date.now();
        const same = Buffer.alloc(4096, 9);
        await insert('c1', 'a@c.us', 'image', (fs.mkdirSync(MEDIA_DIR, { recursive: true }), fs.writeFileSync(path.join(MEDIA_DIR, 'meme1.jpg'), same), 'meme1.jpg'), now - 3000, { name: 'Ana' });
        await insert('c2', 'b@c.us', 'image', (fs.writeFileSync(path.join(MEDIA_DIR, 'meme2.jpg'), same), 'meme2.jpg'), now - 2000, { name: 'Bia' });
        await insert('c3', 'c@c.us', 'image', (fs.writeFileSync(path.join(MEDIA_DIR, 'meme3.jpg'), same), 'meme3.jpg'), now - 1000, { name: 'Caio' });
        // the same size, another content: not a copy
        await insert('c4', 'a@c.us', 'image', (fs.writeFileSync(path.join(MEDIA_DIR, 'other.jpg'), Buffer.alloc(4096, 1)), 'other.jpg'), now, { name: 'Ana' });
        bot.src('web/gallery').forgetSizes();
        const dupes = await json('/api/gallery/duplicates');
        assert.equal(dupes.groups.length, 1);
        const [group] = dupes.groups;
        assert.deepEqual([group.count, group.files, group.wasted, group.items.map(i => i.id)], [3, 3, 8192, ['c1', 'c2', 'c3']]);
        assert.equal((await manage({ section: 'gallery', op: 'join', hashes: ['nope'] })).status, 400);

        const joined = (await manage({ section: 'gallery', op: 'join', hashes: [group.hash] })).body;
        assert.deepEqual([joined.joined, joined.freed], [2, 8192]);
        const ino = (name) => fs.statSync(path.join(MEDIA_DIR, name)).ino;
        assert.equal(ino('meme2.jpg'), ino('meme1.jpg'));
        assert.equal(ino('meme3.jpg'), ino('meme1.jpg'));
        assert.deepEqual(fs.readFileSync(path.join(MEDIA_DIR, 'meme3.jpg')), same, 'the content is the same');
        const after = await json('/api/gallery/duplicates');
        assert.deepEqual([after.groups[0].files, after.groups[0].wasted, after.wasted], [1, 0, 0], 'already one file');
        const list = await json('/api/gallery');
        assert.equal(list.totals.disk, 4096 * 2, 'on disk the joined copies count once');
        assert.ok(list.items.find(i => i.id === 'c2').linked);
        // freeing one copy frees nothing (the others keep the data) and does not take theirs
        assert.equal((await manage({ section: 'gallery', op: 'delete', ids: ['c2'] })).body.freed, 0);
        assert.deepEqual(fs.readFileSync(path.join(MEDIA_DIR, 'meme1.jpg')), same);
    });

    test('the statuses: each person who posted is one "chat" (picking one does not bring the others)', async () => {
        const now = Date.now();
        const status = (id, who, name, at) => bot.dbRun(
            "INSERT INTO messages (id, chat_id, chat_name, type, timestamp, has_media, media_path, sender_jid, sender_name) VALUES (?, 'status@broadcast', ?, 'image', ?, 1, ?, ?, ?)",
            [id, `Status de ${name}`, at, file(`${id}.jpg`, 100), who, name]);
        await status('st1', '1@c.us', 'Vanildo', now - 3000);
        await status('st2', '2@c.us', 'Leandro', now - 2000);
        await status('st3', '1@c.us', 'Vanildo', now - 1000);
        await insert('gr1', 'g@g.us', 'image', file('gr1.jpg', 100), now - 5000, { name: 'Nome antigo' });
        await insert('gr2', 'g@g.us', 'image', file('gr2.jpg', 100), now - 500, { name: 'Nome novo' });
        bot.src('web/gallery').forgetSizes();
        const all = await json('/api/gallery');
        const vanildo = all.chats.find(c => c.name === 'Status de Vanildo');
        assert.deepEqual([vanildo.id, vanildo.count], ['status@broadcast|1@c.us', 2]);
        assert.equal(all.chats.find(c => c.id === 'g@g.us').name, 'Nome novo', 'the most recent name');
        const picked = await json(`/api/gallery?chat=${encodeURIComponent(vanildo.id)}`);
        assert.deepEqual(picked.items.map(i => i.id), ['st3', 'st1']);
        assert.equal(picked.items[0].chat, 'status@broadcast', 'it still opens in the statuses');
    });

    test('thumbnails: a frame of each video (with its duration), a small copy of a big picture, made once', async () => {
        const { processes } = bot;
        const now = Date.now();
        processes.duration = 75;
        await insert('v1', 'a@c.us', 'video', file('clip.mp4', 500_000), now - 1000);
        await insert('p1', 'a@c.us', 'image', file('big.jpg', 200_000), now - 2000);
        await insert('p2', 'a@c.us', 'image', file('small.jpg', 1000), now - 3000);
        await insert('d1', 'a@c.us', 'document', file('doc.pdf', 1000), now - 4000);
        bot.src('web/gallery').forgetSizes();
        const before = (await json('/api/gallery')).items.find(i => i.id === 'v1');
        assert.deepEqual([before.thumb, before.duration], ['/api/media/thumb?id=v1', null], 'the duration comes with the first thumbnail');

        const video = await get('/api/media/thumb?id=v1');
        assert.deepEqual([video.status, video.headers.get('content-type'), video.headers.get('cache-control')], [200, 'image/jpeg', 'private, max-age=86400']);
        const ffmpeg = processes.calls.filter(c => c.bin.endsWith('ffmpeg'));
        assert.equal(ffmpeg.length, 1);
        assert.deepEqual(ffmpeg[0].args.slice(ffmpeg[0].args.indexOf('-ss'), ffmpeg[0].args.indexOf('-ss') + 2), ['-ss', '1']);
        assert.ok(ffmpeg[0].args.includes('-protocol_whitelist'));
        await get('/api/media/thumb?id=v1');
        assert.equal(processes.calls.filter(c => c.bin.endsWith('ffmpeg')).length, 1, 'made once, then from the cache');
        assert.equal((await json('/api/gallery')).items.find(i => i.id === 'v1').duration, 75);

        const big = await get('/api/media/thumb?id=p1');
        assert.deepEqual([big.status, big.headers.get('content-type')], [200, 'image/jpeg']);
        assert.ok((await big.arrayBuffer()).byteLength < 1000, 'the small copy, not the 200 KB file');
        assert.equal((await (await get('/api/media/thumb?id=p2')).arrayBuffer()).byteLength, 1000, 'a small picture is its own thumbnail');
        assert.equal((await get('/api/media/thumb?id=d1')).status, 404, 'a document has none: the page shows its icon');
        assert.equal((await get('/api/media/thumb?id=v1', null)).status, 401);
    });

    test('freeing files: the files go, the messages stay (media missing)', async () => {
        await insert('d1', 'a@c.us', 'image', file('d1.jpg', 2048), Date.now());
        const result = await manage({ section: 'gallery', op: 'delete', ids: ['d1', 'nope'] });
        assert.deepEqual([result.body.removed, result.body.freed], [1, 2048]);
        assert.ok(!fs.existsSync(path.join(MEDIA_DIR, 'd1.jpg')));
        assert.equal((await bot.dbGet("SELECT media_path FROM messages WHERE id = 'd1'")).media_path, null);
        assert.equal((await manage({ section: 'gallery', op: 'delete', ids: [] })).status, 400);
    });
});

describe('the tries of the forms', () => {
    const yahoo = { chart: { result: [{ meta: { symbol: 'MSTR', longName: 'MSTR Inc', fullExchangeName: 'NasdaqGS', currency: 'USD', regularMarketPrice: 100, regularMarketDayHigh: 100, regularMarketDayLow: 100, regularMarketVolume: 1, fiftyTwoWeekHigh: 100, fiftyTwoWeekLow: 100 }, indicators: { quote: [{ open: [100], close: [100], high: [100], low: [100] }] } }] } };

    test('a shortcut command: each stage checked; what changes something is not run', async () => {
        const check = async (command) => (await manage({ section: 'try', op: 'check', command })).body;
        const pipe = await check('/stocks -q MSTR | /translate -to en');
        assert.deepEqual(pipe.stages.map(s => [s.cmd, s.ok, s.problem ?? null]), [['/stocks', true, null], ['/translate', true, null]]);
        assert.equal(pipe.runnable, true);
        assert.deepEqual((await check('/naoexiste')).stages[0].problem, 'unknown');
        const alert = await check('/stocks -alert USD > 9');
        assert.deepEqual([alert.stages[0].problem, alert.stages[0].message, alert.runnable], ['option', '-alert', false]);
        assert.equal((await check('/backup')).stages[0].problem, 'command');
        assert.equal((await check('/stocks -alert -pause 1 -rm 2')).stages[0].problem, 'options');
        assert.match((await check('/stocks | /uptime')).error, /não lê/);
    });

    test('▶️ run: the replies come back (formatted, with the media), nothing is sent to WhatsApp', async () => {
        await bot.setSetting('stocks.symbols', 'MSTR');
        network.responder('get', 'query1.finance.yahoo.com', () => yahoo);
        network.responder('post', 'google-translate-api-x', { text: 'MSTR quote', from: { language: { iso: 'pt', didYouMean: false } } });
        const before = bot.client.sent.length;
        const r = (await manage({ section: 'try', op: 'command', command: '/stocks -q MSTR | /translate -to en' })).body;
        assert.deepEqual(r.replies, [{ text: '🌐 *Tradução* _(pt → en)_\n\nMSTR quote' }]);
        assert.equal(typeof r.ms, 'number');
        const qr = (await manage({ section: 'try', op: 'command', command: '/qr https://exemplo.com' })).body;
        assert.equal(qr.replies[0].media.mimetype, 'image/png');
        assert.ok(qr.replies[0].size > 0);
        assert.equal(bot.client.sent.length, before, 'nothing went out');
        assert.equal((await manage({ section: 'try', op: 'command', command: '/stocks -alert USD > 9' })).body.error, 'not runnable');
    });

    test('🧪 a scheduled message: built as it will go out ({/commands} run), and a command one with the bot answer', async () => {
        await bot.setSetting('stocks.symbols', 'MSTR');
        network.responder('get', 'query1.finance.yahoo.com', () => yahoo);
        const own = bot.client.info.wid._serialized;
        const due = Date.now() + 3_600_000;
        await bot.dbRun("INSERT INTO schedules (kind, chat_id, chat_name, is_group, text, due_at, created_at) VALUES ('agendar', 'g@g.us', 'Família', 1, 'Bom dia! {/stocks -q MSTR}', ?, 1)", [due]);
        const { id } = await bot.dbGet('SELECT id FROM schedules');
        const before = bot.client.sent.length;
        const r = (await manage({ section: 'try', op: 'schedule', id })).body;
        assert.match(r.text, /^Bom dia! .*MSTR/s, 'the {/stocks} ran and its reply went in');
        assert.deepEqual([r.commands, r.failures, r.dueAt, r.slashText], [['/stocks -q MSTR'], [], due, null]);
        assert.deepEqual(r.destinations.map(d => [d.id, d.group]), [['g@g.us', true]]);
        assert.equal(bot.client.sent.length, before, 'nothing went out');
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM schedules')).n, 1, 'the schedule is untouched');

        // the form, not saved: a text that starts with / goes out as text, never runs (the braces are what runs)
        const typed = (await manage({ section: 'try', op: 'schedule', kind: 'agendar', text: '/stocks -q MSTR', recipients: [] })).body;
        assert.equal(typed.destinations[0].id, own, 'empty: your private chat');
        assert.deepEqual([typed.text, typed.commands, typed.slashText], ['/stocks -q MSTR', [], '{/stocks -q MSTR}']);
        const reminder = (await manage({ section: 'try', op: 'schedule', kind: 'lembrete', text: 'pagar a conta', recipients: [] })).body;
        assert.match(reminder.text, /pagar a conta/);
        assert.notEqual(reminder.text, 'pagar a conta', 'with the reminder title, as it goes out');
        const blocked = (await manage({ section: 'try', op: 'schedule', kind: 'agendar', text: 'antes {/backup} depois', recipients: [] })).body;
        assert.equal(blocked.failures.length, 1, 'a command /cron does not run is a failure, as at the scheduled time');
        assert.equal((await manage({ section: 'try', op: 'schedule', id: 999 })).status, 400);
        assert.equal(bot.client.sent.length, before);
    });

    test('a /watch rule on the last received messages: the count, where and the part that matched', async () => {
        const at = Date.now();
        const insert = (id, body, o = {}) => bot.dbRun('INSERT INTO messages (id, chat_id, chat_name, body, type, timestamp, from_me) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [id, o.chat ?? 'g@g.us', o.chat ? 'Outro' : 'Condomínio', body, 'chat', at - Number(id.slice(1)), o.fromMe ? 1 : 0]);
        await insert('w1', 'O BOLETO de novembro');
        await insert('w2', 'pix ou boleto?', { chat: 'x@c.us' });
        await insert('w3', 'meu boleto', { fromMe: true });
        await insert('w4', '/watch boleto');
        await insert('w5', 'nada a ver');
        const text = (await manage({ section: 'try', op: 'watch', rule: 'boléto' })).body;
        assert.deepEqual([text.matches, text.tested, text.regex], [2, 3, false], 'not yours, not commands; no case nor accents');
        assert.deepEqual(text.samples.map(s => [s.id, s.body.slice(s.match.start, s.match.end)]), [['w1', 'BOLETO'], ['w2', 'boleto']]);
        assert.deepEqual(text.chats.map(c => c.count), [1, 1]);
        const regex = (await manage({ section: 'try', op: 'watch', rule: '/^pix/i' })).body;
        assert.deepEqual([regex.matches, regex.regex], [1, true]);
        assert.match((await manage({ section: 'try', op: 'watch', rule: '/(a+)+$/' })).body.error, /./);
        assert.match((await manage({ section: 'try', op: 'watch', rule: '/[a/' })).body.error, /./);
    });
});

describe('the installable page', () => {
    test('service worker, manifest and icons; the CSP allows them', async () => {
        for (const [route, type] of [['/sw.js', /javascript/], ['/manifest.webmanifest', /manifest\+json/], ['/icon-192.png', /png/], ['/icon-512.png', /png/], ['/icon.svg', /svg/]]) {
            const r = await get(route, null);
            assert.equal(r.status, 200, route);
            assert.match(r.headers.get('content-type'), type);
        }
        const manifest = await (await get('/manifest.webmanifest', null)).json();
        assert.equal(manifest.display, 'standalone');
        assert.match((await get('/', null)).headers.get('content-security-policy'), /manifest-src 'self'.*|worker-src 'self'/);
        const png = Buffer.from(await (await get('/icon-512.png', null)).arrayBuffer());
        assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [512, 512]);
    });

    test('notes may stay offline; a protected tag unlocked never does', async () => {
        await bot.replyAlt('/notes #mercado leite');
        assert.equal((await get('/api/notes')).headers.get('x-offline'), '1');
        assert.equal((await get('/api/notes/tags')).headers.get('x-offline'), '1');
        await bot.replyAlt('/notes #cofre segredo');
        const inPrivate = { chat: bot.client.info.wid._serialized };
        for (const step of ['/notes -lock #cofre', 'senhaforte1', 'senhaforte1']) await bot.replyAlt(step, inPrivate);
        assert.equal((await get('/api/notes')).headers.get('x-offline'), '1', 'locked: no text in it');
        await fetch(`${base}/api/notes/unlock`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ tag: 'cofre', password: 'senhaforte1' }) });
        assert.equal((await get('/api/notes')).headers.get('x-offline'), null, 'unlocked: it has the text');
    });
});
