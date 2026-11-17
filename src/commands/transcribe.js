/*
 * Comando /transcribe.
 */

const { downloadMedia } = require('./get');

/*
 * /transcribe is /get -transcribe: the typed link, the replied message's link or the
 * replied video/audio (with -ss and -es).
 */
async function cmdTranscribe(ctx) {
    const { opts } = ctx;
    await downloadMedia({ ...ctx, opts: { ...opts, opt: { ...opts.opt, transcribe: true } } }, { cmd: '/transcribe' });
}

module.exports = {
    cmdTranscribe
};
