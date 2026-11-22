/*
 * Comando /stt.
 */

const { downloadMedia } = require('./get');

/*
 * /stt is /get -stt: the typed link, the replied message's link or the
 * replied video/audio (with -ss and -es).
 */
async function cmdStt(ctx) {
    const { opts } = ctx;
    await downloadMedia({ ...ctx, opts: { ...opts, opt: { ...opts.opt, stt: true } } }, { cmd: '/stt' });
}

module.exports = {
    cmdStt
};
