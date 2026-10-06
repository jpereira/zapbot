/*
 * Comando /traduzir.
 */

const axios = require('axios');

const { getCommandSyntax } = require('./base');
const { printError } = require('../log');
const { envOuSetting, getSetting } = require('../settings');

/*
 * /traduzir: Google Cloud Translation (API v2, "Basic"), with the key from
 * GOOGLE_TRANSLATE_API_KEY (config/.env) or the 'traduzir.api.key' setting.
 * /traduzir hello world        → to the default language (setting 'traduzir.lang', pt)
 * /traduzir -para en bom dia   → to English
 * (replying to a message) /traduzir [-para es]
 *   /traduzir -l                 → idiomas aceitos
 * The source language is detected by Google. The key goes in the header
 * X-Goog-Api-Key (never in the URL, which could go to a log).
 */
const API = 'https://translation.googleapis.com/language/translate/v2';
const MAX_CHARS = 5000;
const TIMEOUT_MS = 15000;
const LANGUAGE = /^[a-z]{2,3}(-[a-z]{2,4})?$/i;

const WITHOUT_KEY = '⚠️ Chave do Google Translate não encontrada: o /traduzir está desativado.\n' +
    '💡 _Defina GOOGLE_TRANSLATE_API_KEY no config/.env ou use /set traduzir.api.key <chave>. ' +
    'Passo a passo: https://jpereira.github.io/zapbot/commands/traduzir/_';

// Google error → message for the chat (never contains the key)
function errorGoogle(err, target) {
    const errorAlt = err.response?.data?.error;
    const reasonAlt = errorAlt?.details?.find(d => d.reason)?.reason ?? errorAlt?.errors?.[0]?.reason ?? '';

    if (err.code === 'ECONNABORTED') return '⏱️ O Google Translate não respondeu. Tente de novo.';
    if (reasonAlt === 'API_KEY_INVALID') return '🔑 Chave do Google Translate inválida. Confira o GOOGLE_TRANSLATE_API_KEY ou o traduzir.api.key.';
    if (reasonAlt === 'SERVICE_DISABLED' || reasonAlt === 'accessNotConfigured') {
        return '⚠️ A Cloud Translation API não está ativada no projeto da chave. Ative em console.cloud.google.com › APIs e serviços › Biblioteca.';
    }
    if (reasonAlt === 'BILLING_DISABLED') return '💳 O projeto da chave está sem faturamento ativo: o Google exige, mesmo dentro da cota grátis.';
    const limitAlt = ['dailyLimitExceeded', 'userRateLimitExceeded', 'rateLimitExceeded',
        'quotaExceeded', 'QUOTA_EXCEEDED', 'RATE_LIMIT_EXCEEDED'].includes(reasonAlt);
    const limitMessage = /^(Daily Limit Exceeded|User Rate Limit Exceeded)\b/i
        .test(errorAlt?.message?.trim() ?? '');
    if (err.response?.status === 429 ||
        (err.response?.status === 403 && (limitAlt || limitMessage))) {
        return '💸 Cota do Google Translate esgotada. Tente mais tarde.';
    }
    if (err.response?.status === 403) return `⛔ O Google recusou a chave: ${errorAlt?.message ?? 'acesso negado'}`;
    if (/invalid value/i.test(errorAlt?.message ?? '')) return `❌ Idioma inválido: ${target}. Veja os aceitos com /traduzir -l`;
    return `❌ Erro no /traduzir: ${errorAlt?.message ?? err.message}`;
}

async function listLanguages(msg, keyAlt) {
    const { data } = await axios.get(`${API}/languages`, {
        params: { target: 'pt' },
        headers: { 'X-Goog-Api-Key': keyAlt },
        timeout: TIMEOUT_MS
    });

    const languagesAlt = data.data.languages.map(l => `${l.language} ${l.name}`);
    await msg.reply(`🌐 *Idiomas do /traduzir* (${languagesAlt.length})\n\n\`\`\`${languagesAlt.join('\n')}\`\`\`\n\n` +
        `💡 _Use o código: /traduzir -para en bom dia. Padrão: ${getSetting('traduzir.lang')} (setting traduzir.lang)._`);
}

async function cmdTranslate({ msg, args, opts, quotedMsg }) {
    const keyAlt = envOuSetting('GOOGLE_TRANSLATE_API_KEY', 'traduzir.api.key');

    if (!keyAlt) {
        await msg.reply(WITHOUT_KEY, null, { linkPreview: false });
        return;
    }

    const target = String(opts.opt.para ?? getSetting('traduzir.lang')).trim();

    try {
        if (opts.opt.list) {
            await listLanguages(msg, keyAlt);
            return;
        }

        if (!LANGUAGE.test(target)) {
            await msg.reply(`❌ Idioma inválido: ${target}. Use o código (en, es, pt, zh-CN...). Veja os aceitos com /traduzir -l`);
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

        const { data } = await axios.post(API, { q: textAlt, target: target, format: 'text' }, {
            headers: { 'X-Goog-Api-Key': keyAlt },
            timeout: TIMEOUT_MS
        });

        const { translatedText, detectedSourceLanguage: origin } = data.data.translations[0];
        let reply = `🌐 *Tradução* _(${origin ?? '?'} → ${target})_\n\n${translatedText}`;

        if (origin && origin.toLowerCase() === target.toLowerCase().split('-')[0]) {
            reply += `\n\n💡 _O texto já estava em ${target}. Para outro idioma: /traduzir -para en_`;
        }

        await msg.reply(reply);
    } catch (err) {
        printError('/traduzir:', err.response?.status ?? '', err.response?.data?.error?.message ?? err.message);
        await msg.reply(errorGoogle(err, target));
    }
}

module.exports = {
    cmdTranslate
};
