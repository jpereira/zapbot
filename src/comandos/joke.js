/*
 * Comando /joke.
 */

const axios = require('axios');

const { printError } = require('../log');

// /joke: JokeAPI em português (safe-mode)
async function cmdJoke({ msg }) {
    try {
        const { data } = await axios.get('https://v2.jokeapi.dev/joke/Any', { timeout: 15000, params: { lang: 'pt', 'safe-mode': '' } });

        if (data.error) throw new Error(data.message || 'erro da JokeAPI');

        await msg.reply(data.type === 'twopart' ? `${data.setup}\n\n... ${data.delivery} 🥁` : data.joke);
    } catch (err) {
        printError('/joke:', err.message);
        await msg.reply('❌ Não consegui buscar uma piada agora.');
    }
}

module.exports = {
    cmdJoke
};
