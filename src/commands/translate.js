/*
 * Comando /translate.
 */

const { translate, languages } = require('google-translate-api-x');

const { commandUsage } = require('./base');
const { t } = require('../i18n');
const { unescape } = require('../util/format');
const { printError } = require('../log');
const { getSetting } = require('../settings');

/*
 * /translate: Google Translate from the translate.google.com site, with no key and no cost, through the package
 * google-translate-api-x (unofficial access: Google may limit by IP or change the format).
 * /translate hello world        → to the default language (setting 'translate.lang', pt)
 * /translate -to en bom dia   → to English
 * (replying to a message) /translate [-to es]
 *   /translate -l                 → idiomas aceitos
 * The source language is detected by Google.
 */
const MAX_CHARS = 5000;
const TIMEOUT_MS = 15000;

// Each language code in lowercase ("zh-cn") → as the package writes it ("zh-CN")
const CODES = new Map(Object.keys(languages).filter(c => c !== 'auto').map(c => [c.toLowerCase(), c]));

// The package's fetch has no time limit: without this a Google that does not respond would hold the command
const withTimeLimit = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });

// Package error → message for the chat
function errorTranslation(err) {
    const status = err.cause?.response?.status;

    if (err.name === 'TimeoutError' || err.name === 'AbortError') return t('translate.timeout');
    if (status === 429 || /too many requests/i.test(err.message)) {
        return t('translate.limited');
    }
    if (status === 403) return t('translate.refused');
    return t('translate.error', { erro: err.message });
}

async function listLanguages(msg) {
    const languagesAlt = [...CODES.values()].map(c => `${c} ${languages[c]}`);
    await msg.reply(t('translate.languages', { n: languagesAlt.length, lista: languagesAlt.join('\n'), padrao: getSetting('translate.lang') }));
}

async function cmdTranslate({ msg, args, opts, quotedMsg }) {
    const request = String(opts.opt.to ?? getSetting('translate.lang')).trim();
    const target = CODES.get(request.toLowerCase());

    try {
        if (opts.opt.list) {
            await listLanguages(msg);
            return;
        }

        if (!target) {
            await msg.reply(t('translate.invalid', { pedido: request }));
            return;
        }

        // Command text as typed (with the line breaks), without -to; without it, the replied message's
        const typed = String(args ?? '').replace(/(^|\s)-(to|p)(\s+\S+)?(?=\s|$)/i, '$1').trim();
        const textAlt = unescape(typed) || quotedMsg?.body?.trim() || '';

        if (!textAlt) {
            await msg.reply(commandUsage('/translate'));
            return;
        }

        if (textAlt.length > MAX_CHARS) {
            await msg.reply(t('translate.tooLong', { n: textAlt.length, max: MAX_CHARS }));
            return;
        }

        const resultAlt = await translate(textAlt, { to: target, requestFunction: withTimeLimit });
        const origin = resultAlt.from?.language?.iso;
        let reply = t('translate.result', { origem: origin ?? '?', alvo: target, texto: resultAlt.text });

        if (origin && origin.toLowerCase() === target.toLowerCase().split('-')[0]) {
            reply += t('translate.sameLang', { alvo: target });
        }

        await msg.reply(reply);
    } catch (err) {
        printError('/translate:', err.cause?.response?.status ?? '', err.message);
        await msg.reply(errorTranslation(err));
    }
}

module.exports = {
    cmdTranslate
};
