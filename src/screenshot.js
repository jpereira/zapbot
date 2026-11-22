/*
 * Screenshot of a web page, taken by the Chromium the bot already runs for WhatsApp Web.
 *
 * Every shot gets its own isolated browser context (no cookies, cache or storage shared with the
 * WhatsApp Web session) and every request the page makes is checked: only public http(s) addresses
 * go out (anti-SSRF), the same rule /get uses. The User-Agent is the screenshot.userAgent setting;
 * empty, it is the Chromium's own, without the "Headless" that many sites refuse.
 */

const { client } = require('./client');
const { getSetting } = require('./settings');
const { isUrlPublic } = require('./util/url');

const DESKTOP = { width: 1366, height: 768, deviceScaleFactor: 1 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const MAX_FULL_HEIGHT = 16000; // px: a very long page is cut here
const EXTRA_MS = 15000; // what the whole job may take beyond the page load timeout

let busy = false;

const isBusy = () => busy;

// The User-Agent of the shot: the setting, or the Chromium's own without the "Headless"
async function userAgent(browser) {
    const custom = String(getSetting('screenshot.userAgent') ?? '').trim();
    if (custom) return custom;
    return String(await browser.userAgent()).replace('HeadlessChrome', 'Chrome');
}

// Lets a request through only if it is a public http(s) address (or an inline data:/blob: resource)
function guard(page) {
    const verdicts = new Map(); // host → allowed, so a page with 200 requests resolves each host once
    const allowed = async (url) => {
        if (/^(data|blob|about):/i.test(url)) return true;
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
        if (!verdicts.has(parsed.hostname)) verdicts.set(parsed.hostname, await isUrlPublic(url).catch(() => false));
        return verdicts.get(parsed.hostname);
    };
    page.on('request', async (request) => {
        if (request.isInterceptResolutionHandled?.()) return;
        const ok = await allowed(request.url()).catch(() => false);
        await (ok ? request.continue() : request.abort('blockedbyclient')).catch(() => {});
    });
}

/**
 * @param {string} url  public http(s) address
 * @param {object} [o]
 * @param {boolean} [o.full]    the whole page (up to MAX_FULL_HEIGHT) instead of the first screen
 * @param {boolean} [o.mobile]  phone-sized screen
 * @param {number} [o.wait]     seconds to wait after the page loads (animations, late content)
 * @param {boolean} [o.pdf]     a PDF of the page instead of an image
 * @returns {Promise<{ data: Buffer, mimetype: string, filename: string, finalUrl: string, title: string }>}
 */
async function takeScreenshot(url, { full = false, mobile = false, wait = 0, pdf = false } = {}) {
    const browser = client.pupBrowser;
    if (!browser) throw new Error('browser-unavailable');

    const timeout = Number(getSetting('screenshot.timeout')) * 1000;
    busy = true;
    let context = null;
    let timer = null;
    try {
        context = await (browser.createBrowserContext?.() ?? browser.createIncognitoBrowserContext());
        const job = (async () => {
            const page = await context.newPage();
            await page.setUserAgent(await userAgent(browser));
            await page.setViewport(mobile ? MOBILE : DESKTOP);
            await page.setRequestInterception(true);
            guard(page);

            try {
                await page.goto(url, { waitUntil: 'networkidle2', timeout });
            } catch (err) {
                // A page that never goes quiet (ads, polling) still has something to show; one that did not even start does not
                if (!/timeout/i.test(err.name + err.message) || page.url() === 'about:blank') throw err;
            }
            if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait * 1000));

            const finalUrl = page.url();
            const title = String(await page.title().catch(() => '')).trim();
            if (pdf) {
                const data = Buffer.from(await page.pdf({ format: 'A4', printBackground: true }));
                return { data, mimetype: 'application/pdf', filename: 'screenshot.pdf', finalUrl, title };
            }

            const options = { type: 'png' };
            if (full) {
                const height = await page.evaluate(() => document.documentElement.scrollHeight);
                const viewport = page.viewport();
                Object.assign(options, {
                    captureBeyondViewport: true,
                    clip: { x: 0, y: 0, width: viewport.width, height: Math.min(Math.max(height, viewport.height), MAX_FULL_HEIGHT) }
                });
            }
            const data = Buffer.from(await page.screenshot(options));
            return { data, mimetype: 'image/png', filename: 'screenshot.png', finalUrl, title };
        })();
        job.catch(() => {}); // if the timer wins, the late failure of the job is not "unhandled"

        const limit = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('timeout')), timeout + EXTRA_MS);
        });
        return await Promise.race([job, limit]);
    } finally {
        clearTimeout(timer);
        busy = false;
        await context?.close().catch(() => {});
    }
}

module.exports = { takeScreenshot, isBusy };
