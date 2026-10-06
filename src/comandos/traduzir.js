/*
 * Comando /traduzir.
 */

const axios = require('axios');

const { getCommandSyntax } = require('./base');
const { printError } = require('../log');
const { envOuSetting, getSetting } = require('../settings');

/*
 * /traduzir: Google Cloud Translation (API v2, "Basic"), com a chave do
 * GOOGLE_TRANSLATE_API_KEY (config/.env) ou do setting 'traduzir.api.key'.
 *   /traduzir hello world        → para o idioma padrão (setting 'traduzir.lang', pt)
 *   /traduzir -para en bom dia   → para o inglês
 *   (respondendo uma mensagem) /traduzir [-para es]
 *   /traduzir -l                 → idiomas aceitos
 * O idioma de origem é detectado pelo Google. A chave vai no header
 * X-Goog-Api-Key (nunca na URL, que poderia ir para um log).
 */
const API = 'https://translation.googleapis.com/language/translate/v2';
const MAX_CHARS = 5000;
const TIMEOUT_MS = 15000;
const IDIOMA = /^[a-z]{2,3}(-[a-z]{2,4})?$/i;

const SEM_CHAVE = '⚠️ Chave do Google Translate não encontrada: o /traduzir está desativado.\n' +
    '💡 _Defina GOOGLE_TRANSLATE_API_KEY no config/.env ou use /set traduzir.api.key <chave>. ' +
    'Passo a passo: https://jpereira.github.io/zapbot/comandos/traduzir/_';

// Erro do Google → mensagem para o chat (nunca contém a chave)
function erroGoogle(err, alvo) {
    const erro = err.response?.data?.error;
    const motivo = erro?.details?.find(d => d.reason)?.reason ?? erro?.errors?.[0]?.reason ?? '';

    if (err.code === 'ECONNABORTED') return '⏱️ O Google Translate não respondeu. Tente de novo.';
    if (motivo === 'API_KEY_INVALID') return '🔑 Chave do Google Translate inválida. Confira o GOOGLE_TRANSLATE_API_KEY ou o traduzir.api.key.';
    if (motivo === 'SERVICE_DISABLED' || motivo === 'accessNotConfigured') {
        return '⚠️ A Cloud Translation API não está ativada no projeto da chave. Ative em console.cloud.google.com › APIs e serviços › Biblioteca.';
    }
    if (motivo === 'BILLING_DISABLED') return '💳 O projeto da chave está sem faturamento ativo: o Google exige, mesmo dentro da cota grátis.';
    const limite = ['dailyLimitExceeded', 'userRateLimitExceeded', 'rateLimitExceeded',
        'quotaExceeded', 'QUOTA_EXCEEDED', 'RATE_LIMIT_EXCEEDED'].includes(motivo);
    const mensagemDeLimite = /^(Daily Limit Exceeded|User Rate Limit Exceeded)\b/i
        .test(erro?.message?.trim() ?? '');
    if (err.response?.status === 429 ||
        (err.response?.status === 403 && (limite || mensagemDeLimite))) {
        return '💸 Cota do Google Translate esgotada. Tente mais tarde.';
    }
    if (err.response?.status === 403) return `⛔ O Google recusou a chave: ${erro?.message ?? 'acesso negado'}`;
    if (/invalid value/i.test(erro?.message ?? '')) return `❌ Idioma inválido: ${alvo}. Veja os aceitos com /traduzir -l`;
    return `❌ Erro no /traduzir: ${erro?.message ?? err.message}`;
}

async function listarIdiomas(msg, chave) {
    const { data } = await axios.get(`${API}/languages`, {
        params: { target: 'pt' },
        headers: { 'X-Goog-Api-Key': chave },
        timeout: TIMEOUT_MS
    });

    const idiomas = data.data.languages.map(l => `${l.language} ${l.name}`);
    await msg.reply(`🌐 *Idiomas do /traduzir* (${idiomas.length})\n\n\`\`\`${idiomas.join('\n')}\`\`\`\n\n` +
        `💡 _Use o código: /traduzir -para en bom dia. Padrão: ${getSetting('traduzir.lang')} (setting traduzir.lang)._`);
}

async function cmdTraduzir({ msg, args, opts, quotedMsg }) {
    const chave = envOuSetting('GOOGLE_TRANSLATE_API_KEY', 'traduzir.api.key');

    if (!chave) {
        await msg.reply(SEM_CHAVE, null, { linkPreview: false });
        return;
    }

    const alvo = String(opts.opt.para ?? getSetting('traduzir.lang')).trim();

    try {
        if (opts.opt.list) {
            await listarIdiomas(msg, chave);
            return;
        }

        if (!IDIOMA.test(alvo)) {
            await msg.reply(`❌ Idioma inválido: ${alvo}. Use o código (en, es, pt, zh-CN...). Veja os aceitos com /traduzir -l`);
            return;
        }

        // Texto do comando como foi digitado (com as quebras de linha), sem o -para; sem ele, o da mensagem respondida
        const digitado = String(args ?? '').replace(/(^|\s)-(para|p)(\s+\S+)?(?=\s|$)/i, '$1').trim();
        const texto = digitado || quotedMsg?.body?.trim() || '';

        if (!texto) {
            await msg.reply('```' + getCommandSyntax('/traduzir') + '```');
            return;
        }

        if (texto.length > MAX_CHARS) {
            await msg.reply(`❌ Texto grande demais: ${texto.length} caracteres (máx. ${MAX_CHARS}).`);
            return;
        }

        const { data } = await axios.post(API, { q: texto, target: alvo, format: 'text' }, {
            headers: { 'X-Goog-Api-Key': chave },
            timeout: TIMEOUT_MS
        });

        const { translatedText, detectedSourceLanguage: origem } = data.data.translations[0];
        let resposta = `🌐 *Tradução* _(${origem ?? '?'} → ${alvo})_\n\n${translatedText}`;

        if (origem && origem.toLowerCase() === alvo.toLowerCase().split('-')[0]) {
            resposta += `\n\n💡 _O texto já estava em ${alvo}. Para outro idioma: /traduzir -para en_`;
        }

        await msg.reply(resposta);
    } catch (err) {
        printError('/traduzir:', err.response?.status ?? '', err.response?.data?.error?.message ?? err.message);
        await msg.reply(erroGoogle(err, alvo));
    }
}

module.exports = {
    cmdTraduzir
};
