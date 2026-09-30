/*
 * Comando /ping.
 */

async function cmdPing({ msg }) {
    await msg.reply('pong');
}

module.exports = {
    cmdPing
};
