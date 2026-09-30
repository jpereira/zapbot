/*
 * Comando /kernel.
 */

const axios = require('axios');

const { printError } = require('../log');

// /kernel: versões atuais publicadas em kernel.org
async function cmdKernel({ msg }) {
    try {
        const { data } = await axios.get('https://www.kernel.org/releases.json', { timeout: 15000 });

        const linhas = data.releases
            .filter(r => ['mainline', 'stable', 'longterm'].includes(r.moniker))
            .slice(0, 6)
            .map(r => `${r.moniker.padEnd(9)} ${r.version.padEnd(12)} ${r.released?.isodate ?? ''}`);

        await msg.reply(
            `🐧 *Linux ${data.latest_stable.version}* _(latest stable)_\n\n` +
            '```\n' + linhas.join('\n') + '\n```'
        );
    } catch (err) {
        printError('/kernel:', err.message);
        await msg.reply('❌ Não consegui consultar o kernel.org agora.');
    }
}

module.exports = {
    cmdKernel
};
