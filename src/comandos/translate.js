/*
 * Comando /translate.
 */

const { translate, languages } = require('google-translate-api-x');

const { getCommandSyntax } = require('./base');
const { printError } = require('../log');
const { getSetting } = require('../settings');

/*
 * /translate: o Google Translate do site translate.google.com, sem chave e sem custo, pelo pacote
 * google-translate-api-x (um acesso não oficial: o Google pode limitar por IP ou mudar o formato).
 *   /translate hello world        → para o idioma padrão (setting 'traduzir.lang', pt)
 *   /translate -para en bom dia   → para o inglês
 *   (respondendo uma mensagem) /translate [-para es]
 *   /translate -l                 → idiomas aceitos
 * O idioma de origem é detectado pelo Google.
 */
const MAX_CHARS = 5000;
const TIMEOUT_MS = 15000;

// O código de cada idioma em minúsculas ("zh-cn") → como o pacote o escreve ("zh-CN")
const CODIGOS = new Map(Object.keys(languages).filter(c => c !== 'auto').map(c => [c.toLowerCase(), c]));

// O fetch do pacote não tem tempo limite: sem isso um Google que não responde prenderia o comando
const comTempoLimite = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });

// Erro do pacote → mensagem para o chat
function erroTraducao(err) {
    const status = err.cause?.response?.status;

    if (err.name === 'TimeoutError' || err.name === 'AbortError') return '⏱️ O Google Translate não respondeu. Tente de novo.';
    if (status === 429 || /too many requests/i.test(err.message)) {
        return '💸 O Google Translate limitou os pedidos deste servidor (acesso gratuito, sem chave). Tente mais tarde.';
    }
    if (status === 403) return '⛔ O Google recusou o pedido deste servidor. Tente mais tarde.';
    return `❌ Erro no /translate: ${err.message}`;
}

async function listarIdiomas(msg) {
    const idiomas = [...CODIGOS.values()].map(c => `${c} ${languages[c]}`);
    await msg.reply(`🌐 *Idiomas do /translate* (${idiomas.length})\n\n\`\`\`${idiomas.join('\n')}\`\`\`\n\n` +
        `💡 _Use o código: /translate -para en bom dia. Padrão: ${getSetting('traduzir.lang')} (setting traduzir.lang)._`);
}

async function cmdTranslate({ msg, args, opts, quotedMsg }) {
    const pedido = String(opts.opt.para ?? getSetting('traduzir.lang')).trim();
    const alvo = CODIGOS.get(pedido.toLowerCase());

    try {
        if (opts.opt.list) {
            await listarIdiomas(msg);
            return;
        }

        if (!alvo) {
            await msg.reply(`❌ Idioma inválido: ${pedido}. Use o código (en, es, pt, zh-CN...). Veja os aceitos com /translate -l`);
            return;
        }

        // Texto do comando como foi digitado (com as quebras de linha), sem o -para; sem ele, o da mensagem respondida
        const digitado = String(args ?? '').replace(/(^|\s)-(para|p)(\s+\S+)?(?=\s|$)/i, '$1').trim();
        const texto = digitado || quotedMsg?.body?.trim() || '';

        if (!texto) {
            await msg.reply('```' + getCommandSyntax('/translate') + '```');
            return;
        }

        if (texto.length > MAX_CHARS) {
            await msg.reply(`❌ Texto grande demais: ${texto.length} caracteres (máx. ${MAX_CHARS}).`);
            return;
        }

        const resultado = await translate(texto, { to: alvo, requestFunction: comTempoLimite });
        const origem = resultado.from?.language?.iso;
        let resposta = `🌐 *Tradução* _(${origem ?? '?'} → ${alvo})_\n\n${resultado.text}`;

        if (origem && origem.toLowerCase() === alvo.toLowerCase().split('-')[0]) {
            resposta += `\n\n💡 _O texto já estava em ${alvo}. Para outro idioma: /translate -para en_`;
        }

        await msg.reply(resposta);
    } catch (err) {
        printError('/translate:', err.cause?.response?.status ?? '', err.message);
        await msg.reply(erroTraducao(err));
    }
}

module.exports = {
    cmdTranslate
};
