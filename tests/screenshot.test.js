/*
 * /screenshot: the picture of a page, taken by the bot's own browser (here, a fake one).
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { OTHERAlt, MessageMedia } = bot;
const { client } = bot;

// A Chromium that only records what was asked of it
function fakeBrowser({ gotoError = null, height = 3000 } = {}) {
    const calls = [];
    const page = {
        handlers: {},
        on(event, handler) { this.handlers[event] = handler; },
        setUserAgent: async (ua) => calls.push(['userAgent', ua]),
        setViewport: async (v) => { page.viewportValue = v; calls.push(['viewport', v]); },
        viewport: () => page.viewportValue,
        setRequestInterception: async (on) => calls.push(['interception', on]),
        goto: async (url, options) => { calls.push(['goto', url, options]); if (gotoError) throw gotoError; page.current = url; },
        url: () => page.current ?? 'about:blank',
        title: async () => 'Example page',
        evaluate: async () => height,
        screenshot: async (options) => { calls.push(['screenshot', options]); return new Uint8Array([1, 2, 3]); },
        pdf: async (options) => { calls.push(['pdf', options]); return new Uint8Array([4, 5]); }
    };
    const context = { newPage: async () => page, close: async () => calls.push(['closed']) };
    return { calls, page, userAgent: async () => 'Mozilla/5.0 HeadlessChrome/130.0.0.0', createBrowserContext: async () => context };
}

let browser;
beforeEach(async () => {
    await bot.restart();
    browser = fakeBrowser();
    client.pupBrowser = browser;
});
afterEach(() => { delete client.pupBrowser; });

const media = (r) => r.find(x => x.content instanceof MessageMedia);

describe('/screenshot', () => {
    test('opens the page in an isolated context and sends the picture with the title and the final address', async () => {
        const r = await bot.execute('/screenshot http://8.8.8.8/');
        const shot = media(r);
        assert.equal(shot.content.mimetype, 'image/png');
        assert.equal(shot.content.filename, 'screenshot.png');
        assert.equal(Buffer.from(shot.content.data, 'base64').toString('hex'), '010203');
        assert.equal(shot.options.caption, '🌐 Example page\nhttp://8.8.8.8/');
        assert.deepEqual(browser.calls.find(c => c[0] === 'goto').slice(1, 2), ['http://8.8.8.8/']);
        assert.equal(browser.calls.at(-1)[0], 'closed');
    });

    test('a notice goes out first and becomes "below"; /ss is the same command', async () => {
        const r = await bot.execute('/ss http://8.8.8.8/');
        assert.equal(r.length, 2); // the notice (edited) and the picture
        assert.equal(r[0].text, '🖼️ Captura abaixo.');
        assert.ok(r[1].content instanceof MessageMedia);
    });

    test('an address without the scheme gets https://', async () => {
        await bot.execute('/screenshot 8.8.8.8/page');
        assert.equal(browser.calls.find(c => c[0] === 'goto')[1], 'https://8.8.8.8/page');
    });

    test('the User-Agent is the Chromium\'s without "Headless", or the screenshot.userAgent setting', async () => {
        await bot.execute('/screenshot http://8.8.8.8/');
        assert.equal(browser.calls.find(c => c[0] === 'userAgent')[1], 'Mozilla/5.0 Chrome/130.0.0.0');

        await bot.setSetting('screenshot.userAgent', 'MyAgent/1.0');
        browser.calls.length = 0;
        await bot.execute('/screenshot http://8.8.8.8/');
        assert.equal(browser.calls.find(c => c[0] === 'userAgent')[1], 'MyAgent/1.0');
    });

    test('-mobile uses a phone-sized screen; -full clips the whole page (up to 16000 px)', async () => {
        await bot.execute('/screenshot -m http://8.8.8.8/');
        assert.equal(browser.page.viewportValue.isMobile, true);

        browser.calls.length = 0;
        await bot.execute('/screenshot -full http://8.8.8.8/');
        assert.deepEqual(browser.calls.find(c => c[0] === 'screenshot')[1].clip, { x: 0, y: 0, width: 1366, height: 3000 });

        browser.calls.length = 0;
        const tall = fakeBrowser({ height: 99999 });
        client.pupBrowser = tall;
        await bot.execute('/screenshot -f http://8.8.8.8/');
        assert.equal(tall.calls.find(c => c[0] === 'screenshot')[1].clip.height, 16000);
    });

    test('-pdf sends a document; -wait is limited to 0..30 seconds', async () => {
        const r = await bot.execute('/screenshot -p http://8.8.8.8/');
        const doc = media(r);
        assert.equal(doc.content.mimetype, 'application/pdf');
        assert.equal(doc.options.sendMediaAsDocument, true);

        assert.match((await bot.replyAlt('/screenshot -wait 99 http://8.8.8.8/'))[0], /0 (a|to) 30/);
    });

    test('private addresses are refused before the browser opens anything', async () => {
        for (const url of ['http://127.0.0.1/', 'http://192.168.0.10/admin', 'http://169.254.169.254/latest', 'http://localhost/']) {
            const texts = await bot.replyAlt(`/screenshot ${url}`);
            assert.match(texts[0], /rede privada|private network/, url);
        }
        assert.equal(browser.calls.length, 0);
    });

    test('every request of the page is checked: private ones are aborted, public ones continue', async () => {
        let handler;
        browser.page.on = (event, h) => { if (event === 'request') handler = h; };
        await bot.execute('/screenshot http://8.8.8.8/');
        const run = async (url) => {
            const result = {};
            await handler({ url: () => url, continue: async () => { result.ok = true; }, abort: async (why) => { result.abort = why; } });
            return result;
        };
        assert.deepEqual(await run('http://8.8.4.4/app.js'), { ok: true });
        assert.deepEqual(await run('data:image/png;base64,AAAA'), { ok: true });
        assert.deepEqual(await run('http://10.0.0.5/secret'), { abort: 'blockedbyclient' });
        assert.deepEqual(await run('http://127.0.0.1:8080/'), { abort: 'blockedbyclient' });
        assert.deepEqual(await run('file:///etc/passwd'), { abort: 'blockedbyclient' });
    });

    test('a page that never settles is shot anyway; one that never started is an error', async () => {
        const slow = Object.assign(new Error('Navigation timeout of 30000 ms exceeded'), { name: 'TimeoutError' });
        const withTimeout = fakeBrowser({ gotoError: slow });
        withTimeout.page.current = 'http://8.8.8.8/slow'; // something had already loaded
        client.pupBrowser = withTimeout;
        assert.ok(media(await bot.execute('/screenshot http://8.8.8.8/slow')));

        client.pupBrowser = fakeBrowser({ gotoError: slow }); // stays on about:blank
        const texts = await bot.replyAlt('/screenshot http://8.8.8.8/dead', { expectedError: true });
        assert.match(texts.at(-1), /^❌ (Não consegui tirar a captura|I could not take the screenshot)/);
    });

    test('replying to a message with a link; no link, or no address at all', async () => {
        const quoted = bot.createMessage({ text: 'look http://8.8.8.8/news now', de: OTHERAlt.jid });
        assert.ok(media(await bot.execute('/screenshot', { quoted })));
        assert.equal(browser.calls.find(c => c[0] === 'goto')[1], 'http://8.8.8.8/news');

        const plain = bot.createMessage({ text: 'no link here', de: OTHERAlt.jid });
        assert.match((await bot.replyAlt('/screenshot', { quoted: plain }))[0], /link/);
        assert.match((await bot.replyAlt('/screenshot'))[0], /^```Usage: \/screenshot /);
    });

    test('without the browser, it says so; it is delegable but not for users by default', async () => {
        delete client.pupBrowser;
        assert.match((await bot.replyAlt('/screenshot http://8.8.8.8/'))[0], /navegador|browser/);

        const { isDelegable } = bot.src('permissions');
        assert.equal(isDelegable('/screenshot'), true);
        assert.equal(bot.src('commands/definitions/screenshot').role, 'admin');
    });
});
