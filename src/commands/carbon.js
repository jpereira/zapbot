/*
 * /carbon command: the code in an editor-window image.
 * /carbon <code>         → image (several lines work; the Markdown ``` fence is removed)
 * /carbon, replying     → the text of the replied message
 * /carbon -theme light ... → theme (dark, the default, or light)
 */

const { MessageMedia } = require('whatsapp-web.js');

const { THEMES, generateImage } = require('../carbon');
const { t } = require('../i18n');
const { commandUsage } = require('./base');
const { unescape } = require('../util/format');
const { printError } = require('../log');

// The -theme|-t option only counts at the start (the rest is code, which may have "-t" in the middle)
const TEMA_IN_START = /^\s*-(?:theme|t)\s+(\S+)\s*/;

async function cmdCarbon({ msg, args, quotedMsg }) {
    let textAlt = unescape(String(args ?? ''));
    let tema = 'dark';

    const m = textAlt.match(TEMA_IN_START);
    if (m) {
        tema = m[1].toLowerCase();
        textAlt = textAlt.slice(m[0].length);
        if (!THEMES[tema]) {
            await msg.reply(t('carbon.badTheme', { theme: m[1], themes: Object.keys(THEMES).join(', ') }));
            return;
        }
    }

    if (!textAlt.trim()) textAlt = String(quotedMsg?.body ?? '');
    if (!textAlt.trim()) {
        await msg.reply(commandUsage('/carbon'));
        return;
    }

    try {
        const png = await generateImage(textAlt, tema);
        await msg.reply(new MessageMedia('image/png', png.toString('base64'), 'carbon.png'));
    } catch (err) {
        printError('/carbon:', err.message);
        await msg.reply(t('carbon.failed', { error: err.message }));
    }
}

module.exports = { cmdCarbon };
