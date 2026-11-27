/*
 * The first setup of the web in a few clicks: the single-use link of the log, the login and the password chosen on
 * the page, the first steps, the password and the 2FA changed from the page, and the email settings saved in the
 * database (the .env wins over them).
 */
const bot = require('./helpers/bot');

const { test, before, after, beforeEach, describe } = require('node:test');
const assert = require('node:assert/strict');

const { createServer, resetWeb } = bot.src('web/server');
const webSetup = bot.src('web/setup');
const totp = bot.src('util/totp');

let server;
let base;
before(async () => {
    server = createServer();
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(r => server.close(r)));

beforeEach(async () => {
    await bot.restart();
    resetWeb();
});

const post = (route, body, cookie) => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const cookieOf = (r) => (r.headers.get('set-cookie') ?? '').split(';')[0];
const json = async (route, cookie) => (await fetch(base + route, { headers: cookie ? { cookie } : {} })).json();

describe('the first setup', () => {
    test('no login yet: the page says setup, the login is refused, and the link of the log creates the access once', async () => {
        assert.equal((await json('/api/session')).setup, true);
        assert.equal((await post('/api/login', { login: 'admin', password: 'x' })).status, 409);
        const page = await fetch(`${base}/setup`);
        assert.equal(page.status, 200, 'the link opens the page itself');

        const { token } = webSetup.issueSetupLink(base);
        assert.equal((await post('/api/setup', { token: 'wrong', login: 'admin', password: 'uma-senha-bem-longa-1' })).status, 401);
        assert.equal((await post('/api/setup', { token, login: 'admin', password: 'curta' })).status, 400, '12 characters at least');
        assert.equal((await post('/api/setup', { token, login: 'admin', password: 'admin-e-a-senha-1' })).status, 400, 'not with the login in it');

        const done = await post('/api/setup', { token, login: 'jorge', password: 'uma-senha-bem-longa-1' });
        assert.equal(done.status, 200);
        const cookie = cookieOf(done);
        assert.deepEqual([(await json('/api/session', cookie)).authenticated, (await json('/api/session')).setup], [true, false], 'logged in, and no setup anymore');
        assert.equal(bot.getSetting('zapbot.web.login'), 'jorge');
        assert.match(bot.getSetting('zapbot.web.password'), /^scrypt\$/, 'only the hash');
        assert.equal((await post('/api/setup', { token, login: 'outro', password: 'uma-senha-bem-longa-2' })).status, 401, 'the link works once');
        assert.ok(bot.logs.some(l => /access configured \('jorge'\)/.test(l)));
    });

    test('every answer carries the version: a page opened before a deploy notices it and reloads', async () => {
        const r = await fetch(`${base}/api/session`);
        assert.equal(decodeURIComponent(r.headers.get('x-zapbot-version')), (await r.json()).version);
    });

    test('the link expires in 24 h', async (t) => {
        t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
        const { token } = webSetup.issueSetupLink(base);
        t.mock.timers.tick(24 * 60 * 60 * 1000 + 1);
        assert.equal(webSetup.consumeSetupToken(token), false);
    });

    test('/web -setup in your private chat: a new link (recovery), which replaces the login and the password', async () => {
        await bot.setSetting('zapbot.web.port', 38231);
        const web = bot.src('web/server');
        try {
            const [reply] = await bot.replyAlt('/web -setup', { chat: bot.OWNER.jid });
            assert.match(reply, /Novo link para configurar o acesso[\s\S]*\/setup#[\w-]{24}/);
            assert.deepEqual(await bot.replyAlt('/web -setup', { de: bot.OTHERAlt.jid }), [], 'only the owner, in the private chat');
        } finally {
            await web.stopWeb();
        }
    });
});

describe('after the setup', () => {
    let cookie;
    beforeEach(async () => {
        const { token } = webSetup.issueSetupLink(base);
        cookie = cookieOf(await post('/api/setup', { token, login: 'jorge', password: 'uma-senha-bem-longa-1' }));
    });

    test('first steps: what is done and what is left', async () => {
        const { steps } = await json('/api/onboarding', cookie);
        assert.deepEqual(Object.keys(steps), ['login', 'whatsapp', 'address', 'email', 'twoFactor', 'users']);
        assert.equal(steps.login, true);
        assert.equal(steps.twoFactor, false);
        assert.equal((await fetch(`${base}/api/onboarding`)).status, 401);
    });

    test('the password from the page: the current one is asked, the other sessions drop, your chat is told', async () => {
        const other = cookieOf(await post('/api/login', { login: 'jorge', password: 'uma-senha-bem-longa-1' }));
        assert.equal((await post('/api/password', { current: 'errada', password: 'outra-senha-bem-longa-2' }, cookie)).status, 401);
        assert.equal((await post('/api/password', { current: 'uma-senha-bem-longa-1', password: 'uma-senha-bem-longa-1' }, cookie)).status, 400, 'not the same');
        const changed = await post('/api/password', { current: 'uma-senha-bem-longa-1', password: 'outra-senha-bem-longa-2' }, cookie);
        assert.equal(changed.status, 200);
        const mine = cookieOf(changed);
        assert.equal((await json('/api/session', mine)).authenticated, true, 'a new session for who changed it');
        assert.equal((await json('/api/session', other)).authenticated, false, 'the others dropped');
        assert.equal((await post('/api/login', { login: 'jorge', password: 'outra-senha-bem-longa-2' })).status, 200);
        await new Promise(r => setTimeout(r, 20));
        assert.ok(bot.client.sent.some(m => /a senha da web foi trocada/.test(m.content)));
    });

    test('2FA from the page: a QR Code, and it turns on only with the code of the app', async () => {
        const started = await (await post('/api/totp/new', {}, cookie)).json();
        assert.match(started.qr, /^data:image\/png;base64,/);
        const secret = started.secret.replace(/\s/g, '');
        assert.equal((await post('/api/totp/confirm', { code: '000000' }, cookie)).status, 400);
        assert.equal(bot.getSetting('zapbot.web.totp'), '');
        assert.equal((await post('/api/totp/confirm', { code: totp.code(secret) }, cookie)).status, 200);
        assert.equal(bot.getSetting('zapbot.web.totp'), secret);
        assert.equal((await json('/api/onboarding', cookie)).steps.twoFactor, true);
    });
});

describe('the email settings in the database', () => {
    const mail = bot.src('mailConfig');

    test('/set zapbot.email.* becomes the QRCODE_EMAIL_* the bot reads, and changing it rebuilds the SMTP', async () => {
        await bot.setSetting('zapbot.email.smtp.host', 'smtp.exemplo.com');
        await bot.setSetting('zapbot.email.smtp.user', 'bot@exemplo.com');
        await bot.setSetting('zapbot.email.to', 'eu@exemplo.com');
        assert.deepEqual([process.env.QRCODE_EMAIL_SMTP_HOST, process.env.QRCODE_EMAIL_SMTP_USER, process.env.QRCODE_EMAIL_SMTP_TO], ['smtp.exemplo.com', 'bot@exemplo.com', 'eu@exemplo.com']);
        assert.equal(process.env.QRCODE_EMAIL_SMTP_PORT, '465');
        assert.equal(bot.src('email').smtpConfigured(), true);
        await bot.setSetting('zapbot.email.smtp.host', '');
        assert.equal(process.env.QRCODE_EMAIL_SMTP_HOST, undefined, 'emptied: gone again');
    });

    test('a variable of config/.env wins, and the boot says which ones it overrides', async () => {
        const name = 'QRCODE_EMAIL_SMTP_HOST';
        // a fresh copy of the module, as at a boot with the variable in config/.env
        const path = require.resolve('../src/mailConfig');
        const saved = require.cache[path];
        process.env[name] = 'smtp.do-env.com';
        delete require.cache[path];
        try {
            const fresh = require(path);
            await bot.setSetting('zapbot.email.smtp.host', 'smtp.do-banco.com');
            const result = fresh.applyMailSettings({ boot: true });
            assert.deepEqual(result.overridden, [name]);
            assert.equal(process.env[name], 'smtp.do-env.com', 'the .env value stays');
            assert.ok(bot.logs.some(l => /Overriding db mail settings by local env: QRCODE_EMAIL_SMTP_HOST/.test(l)));
            assert.deepEqual(fresh.envOverride('zapbot.email.smtp.host'), { env: name, value: 'smtp.do-env.com' });
        } finally {
            require.cache[path] = saved;
            delete process.env[name];
        }
    });

    test('zapbot.email.overrideEnv: the database wins over config/.env, and off gives the .env back', async () => {
        const name = 'QRCODE_EMAIL_SMTP_HOST';
        const path = require.resolve('../src/mailConfig');
        const saved = require.cache[path];
        process.env[name] = 'smtp.do-env.com';
        delete require.cache[path];
        try {
            const fresh = require(path);
            assert.ok(fresh.envNames().includes(name));
            await bot.setSetting('zapbot.email.smtp.host', 'smtp.do-banco.com');
            await bot.setSetting('zapbot.email.overrideEnv', true);
            const result = fresh.applyMailSettings({ boot: true });
            assert.equal(process.env[name], 'smtp.do-banco.com', 'the database wins');
            assert.ok(result.ignored.includes(name));
            assert.equal(fresh.envOverride('zapbot.email.smtp.host'), null, 'editable on the web');
            assert.ok(bot.logs.some(l => /Overriding local env mail settings by db: .*QRCODE_EMAIL_SMTP_HOST.* ignored/.test(l)));
            await bot.setSetting('zapbot.email.smtp.host', '');
            fresh.applyMailSettings({ boot: true });
            assert.equal(process.env[name], undefined, 'empty in the database: not the .env either');
            await bot.setSetting('zapbot.email.overrideEnv', false);
            fresh.applyMailSettings({ boot: true });
            assert.equal(process.env[name], 'smtp.do-env.com', 'off: the .env back');
        } finally {
            require.cache[path] = saved;
            delete process.env[name];
        }
    });

    test('no sender set (optional in the setup): the email goes from the SMTP login, never with an empty From', async () => {
        await bot.setSetting('zapbot.email.smtp.host', 'smtp.exemplo.com');
        await bot.setSetting('zapbot.email.smtp.user', 'bot@exemplo.com');
        await bot.setSetting('zapbot.email.to', 'eu@exemplo.com');
        await bot.setSetting('zapbot.email.from', '');
        bot.emails.length = 0;
        await bot.src('email').transporter.sendMail({ to: 'eu@exemplo.com', subject: 'x', text: 'x' });
        assert.equal(bot.emails.at(-1).from, 'bot@exemplo.com');
        await bot.setSetting('zapbot.email.from', 'ZapBot <bot@exemplo.com>');
        await bot.src('email').transporter.sendMail({ to: 'eu@exemplo.com', subject: 'x', text: 'x' });
        assert.equal(bot.emails.at(-1).from, 'ZapBot <bot@exemplo.com>');
    });

    test('the boot rebuilds the SMTP with the database values (email.js may have built it before them)', async () => {
        await bot.setSetting('zapbot.email.smtp.host', 'smtp.do-banco.com');
        const email = bot.src('email');
        let built = 0;
        const original = email.rebuildTransport;
        const mail = bot.src('mailConfig');
        const spy = require.cache[require.resolve('../src/email')].exports;
        spy.rebuildTransport = () => { built++; return original(); };
        try {
            mail.applyMailSettings({ boot: true });
            assert.equal(built, 1);
        } finally {
            spy.rebuildTransport = original;
        }
    });

    test('the port: 587 is STARTTLS (TLS required), 465 and the others implicit SSL', () => {
        const { startTls } = bot.src('email');
        assert.deepEqual([startTls(587), startTls('587'), startTls(25), startTls(465), startTls(2465), startTls(undefined)], [true, true, true, false, false, false]);
    });

    test('the Settings show the email ones the .env decides as read-only, and the password masked', async () => {
        const { token } = webSetup.issueSetupLink(base);
        const cookie = cookieOf(await post('/api/setup', { token, login: 'jorge', password: 'uma-senha-bem-longa-1' }));
        await bot.setSetting('zapbot.email.smtp.pass', 'senha-de-app');
        const data = await json('/api/lists/settings', cookie);
        const i = data.sections[0].ids.indexOf('zapbot.email.smtp.pass');
        assert.equal(data.sections[0].rows[i][1], '••••••••');
        assert.ok(!JSON.stringify(data).includes('senha-de-app'), 'never the password itself');
        assert.equal(mail.isMailSetting('zapbot.email.alerts'), false, 'the alerts switch is not a variable');
    });
});

describe('the IMAP host', () => {
    beforeEach(() => bot.restart());

    test('the SMTP server in the IMAP one is refused, with the IMAP of the same provider suggested', async () => {
        await assert.rejects(bot.setSetting('zapbot.email.imap.host', 'smtp.mail.yahoo.com'), /imap\.mail\.yahoo\.com/);
        await bot.setSetting('zapbot.email.imap.host', 'imap.mail.yahoo.com');
        assert.equal(bot.getSetting('zapbot.email.imap.host'), 'imap.mail.yahoo.com');
    });
});
