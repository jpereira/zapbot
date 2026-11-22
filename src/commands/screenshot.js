/*
 * /screenshot command: a picture of a web page.
 * /screenshot <url>            → the first screen of the page (the URL may come without http://)
 * /screenshot, replying        → the first link of the replied message
 * -full  the whole page   -mobile  phone-sized screen   -wait <s>  wait after loading   -pdf  a PDF
 */

const { MessageMedia } = require('whatsapp-web.js');

const { commandUsage } = require('./base');
const { client, completeNotice } = require('../client');
const { t } = require('../i18n');
const { printError, printInfo } = require('../log');
const { takeScreenshot, isBusy } = require('../screenshot');
const { extractFirstUrl, isUrlPublic, isValidHttpUrl } = require('../util/url');

const WAIT_MAX = 30; // seconds
const CAPTION_MAX = 300;

// The typed address (with or without the scheme), or the first link of the replied message
function readUrl(opts, quotedMsg) {
    const typed = String(opts?.argv?.[0] ?? '').trim();
    if (typed) return /^[a-z][a-z0-9+.-]*:\/\//i.test(typed) ? typed : `https://${typed}`;
    return quotedMsg ? (quotedMsg.links?.[0]?.link ?? extractFirstUrl(quotedMsg.body)) : null;
}

// -wait <seconds>: 0..WAIT_MAX; null if absent; throws if invalid
function readWait(opts) {
    if (!opts.given.has('wait')) return 0;
    const n = Number(opts.opt.wait);
    if (!Number.isFinite(n) || n < 0 || n > WAIT_MAX) throw new Error(t('screenshot.waitRange', { max: WAIT_MAX }));
    return n;
}

async function cmdScreenshot({ msg, opts, quotedMsg, senderName }) {
    const url = readUrl(opts, quotedMsg);
    if (!url) {
        await msg.reply(quotedMsg ? t('screenshot.noLink') : commandUsage('/screenshot'));
        return;
    }
    if (!isValidHttpUrl(url)) {
        await msg.reply(t('screenshot.invalidUrl', { url }));
        return;
    }
    if (!(await isUrlPublic(url))) {
        printInfo(`/screenshot: URL refused (private or unresolved host) from '${senderName}': ${url}`);
        await msg.reply(t('screenshot.forbiddenUrl', { url }));
        return;
    }

    let wait;
    try {
        wait = readWait(opts);
    } catch (err) {
        await msg.reply(err.message);
        return;
    }
    if (isBusy()) {
        await msg.reply(t('screenshot.busy'));
        return;
    }
    if (!client.pupBrowser) {
        await msg.reply(t('screenshot.noBrowser'));
        return;
    }

    // As in /contacts and /draw: the "⏳ ..." goes out first and becomes the result (or the error)
    const notice = await msg.reply(t('screenshot.processing', { url }), null, { linkPreview: false });
    try {
        const shot = await takeScreenshot(url, {
            full: Boolean(opts.opt.full), mobile: Boolean(opts.opt.mobile), pdf: Boolean(opts.opt.pdf), wait
        });
        // Media does not become an edit of the notice: it says the result comes below (and stays), and the media goes out afterward
        await completeNotice(msg, notice, t(opts.opt.pdf ? 'screenshot.pdfBelow' : 'screenshot.imageBelow'), { linkPreview: false });
        const caption = [shot.title && `🌐 ${shot.title}`, shot.finalUrl].filter(Boolean).join('\n').slice(0, CAPTION_MAX);
        const media = new MessageMedia(shot.mimetype, shot.data.toString('base64'), shot.filename);
        await msg.reply(media, null, { caption, sendMediaAsDocument: Boolean(opts.opt.pdf) });
    } catch (err) {
        printError('/screenshot:', err.message);
        const reason = err.message === 'timeout' ? t('screenshot.timeout') : err.message;
        await completeNotice(msg, notice, t('screenshot.failed', { error: reason }), { linkPreview: false });
    }
}

module.exports = { cmdScreenshot };
