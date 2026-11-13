/*
 * Comando /carbon: o código numa imagem de janela de editor.
 *   /carbon <código>         → imagem (várias linhas valem; a cerca ``` do Markdown sai)
 *   /carbon, respondendo     → o texto da mensagem respondida
 *   /carbon -theme light ... → tema (dark, o padrão, ou light)
 */

const { MessageMedia } = require('whatsapp-web.js');

const { TEMAS, gerarImagem } = require('../carbon');
const { t } = require('../i18n');
const { printError } = require('../log');

// A opção -theme|-t só vale no começo (o resto é código, que pode ter "-t" no meio)
const TEMA_NO_INICIO = /^\s*-(?:theme|t)\s+(\S+)\s*/;

async function cmdCarbon({ msg, args, quotedMsg }) {
    let texto = String(args ?? '');
    let tema = 'dark';

    const m = texto.match(TEMA_NO_INICIO);
    if (m) {
        tema = m[1].toLowerCase();
        texto = texto.slice(m[0].length);
        if (!TEMAS[tema]) {
            await msg.reply(t('carbon.badTheme', { theme: m[1], themes: Object.keys(TEMAS).join(', ') }));
            return;
        }
    }

    if (!texto.trim()) texto = String(quotedMsg?.body ?? '');
    if (!texto.trim()) {
        await msg.reply(t('carbon.usage'));
        return;
    }

    try {
        const png = await gerarImagem(texto, tema);
        await msg.reply(new MessageMedia('image/png', png.toString('base64'), 'carbon.png'));
    } catch (err) {
        printError('/carbon:', err.message);
        await msg.reply(t('carbon.failed', { error: err.message }));
    }
}

module.exports = { cmdCarbon };
