/*
 * Comando /stt.
 */

const { downloadMedia } = require('./get');
const definition = require('./definitions/stt');
const { t } = require('../i18n');
const modelsDownload = require('../models');

// "/stt model large-v3-turbo": a word that is the name of an option, without the dash, would become the URL
function forgottenDash(argv) {
    const word = String(argv[0] ?? '').toLowerCase();
    if (!word || /[/.:]/.test(word)) return null;
    const option = definition.cmd_opts.find(o => o.opts?.some(name => name.toLowerCase() === word));
    return option ? { opt: option.opts[0], ex: option.ex?.[0] ?? `/stt -${option.opts[0]}` } : null;
}

/*
 * /stt is /get -stt: the typed link, the replied message's link or the
 * replied video/audio (with -ss and -es).
 */
async function cmdStt(ctx) {
    const { opts, msg } = ctx;
    const hint = forgottenDash(opts.argv);
    if (hint) {
        await msg.reply(t('stt.forgottenDash', { opt: hint.opt, word: opts.argv[0], ex: hint.ex }));
        return;
    }
    // the model is still being downloaded (STT_MODELS, or a /set stt.model): wait for it instead of a second download
    const model = opts.opt.model || require('../settings').getSetting('stt.model');
    const downloading = modelsDownload.downloadingNow('stt');
    if (!opts.opt.gpt && downloading === model) {
        await msg.reply(t('stt.modelDownloading', { model }));
        return;
    }
    await downloadMedia({ ...ctx, opts: { ...opts, opt: { ...opts.opt, stt: true } } }, { cmd: '/stt' });
}

module.exports = {
    cmdStt
};
