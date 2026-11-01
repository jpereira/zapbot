/*
 * Comando /traduzir.
 */

const { translate, languages } = require('google-translate-api-x');

const { getCommandSyntax } = require('./base');
const { printError } = require('../log');
const { getSetting } = require('../settings');

/*
 * /traduzir: Google Translate from the translate.google.com site, with no key and no cost, through the package
 * google-translate-api-x (unofficial access: Google may limit by IP or change the format).
 * /traduzir hello world        → to the default language (setting 'traduzir.lang', pt)
 * /traduzir -para en bom dia   → to English
 * (replying to a message) /traduzir [-para es]
 *   /traduzir -l                 → idiomas aceitos
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

    if (err.name === 'TimeoutError' || err.name === 'AbortError') return '⏱️ O Google Translate não respondeu. Tente de novo.';
    if (status === 429 || /too many requests/i.test(err.message)) {
        return '💸 O Google Translate limitou os pedidos deste servidor (acesso gratuito, sem chave). Tente mais tarde.';
    }
    if (status === 403) return '⛔ O Google recusou o pedido deste servidor. Tente mais tarde.';
    return `❌ Erro no /traduzir: ${err.message}`;
}

async function listLanguages(msg) {
    const languagesAlt = [...CODES.values()].map(c => `${c} ${languages[c]}`);
    await msg.reply(`🌐 *Idiomas do /traduzir* (${languagesAlt.length})\n\n\`\`\`${languagesAlt.join('\n')}\`\`\`\n\n` +
        `💡 _Use o código: /traduzir -para en bom dia. Padrão: ${getSetting('traduzir.lang')} (setting traduzir.lang)._`);
}

async function cmdTranslate({ msg, args, opts, quotedMsg }) {
    const request = String(opts.opt.para ?? getSetting('traduzir.lang')).trim();
    const target = CODES.get(request.toLowerCase());

    try {
        if (opts.opt.list) {
            await listLanguages(msg);
            return;
        }

        if (!target) {
            await msg.reply(`❌ Idioma inválido: ${request}. Use o código (en, es, pt, zh-CN...). Veja os aceitos com /traduzir -l`);
            return;
        }

        // Command text as typed (with the line breaks), without -para; without it, the replied message's
        const typed = String(args ?? '').replace(/(^|\s)-(para|p)(\s+\S+)?(?=\s|$)/i, '$1').trim();
        const textAlt = typed || quotedMsg?.body?.trim() || '';

        if (!textAlt) {
            await msg.reply('```' + getCommandSyntax('/traduzir') + '```');
            return;
        }

        if (textAlt.length > MAX_CHARS) {
            await msg.reply(`❌ Texto grande demais: ${textAlt.length} caracteres (máx. ${MAX_CHARS}).`);
            return;
        }

        const resultAlt = await translate(textAlt, { to: target, requestFunction: withTimeLimit });
        const origin = resultAlt.from?.language?.iso;
        let reply = `🌐 *Tradução* _(${origin ?? '?'} → ${target})_\n\n${resultAlt.text}`;

        if (origin && origin.toLowerCase() === target.toLowerCase().split('-')[0]) {
            reply += `\n\n💡 _O texto já estava em ${target}. Para outro idioma: /traduzir -para en_`;
        }

        await msg.reply(reply);
    } catch (err) {
        printError('/traduzir:', err.cause?.response?.status ?? '', err.message);
        await msg.reply(errorTranslation(err));
    }
}

module.exports = {
    cmdTranslate
};
