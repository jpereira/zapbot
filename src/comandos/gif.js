/*
 * Comando /gif.
 */

const { MessageMedia } = require('whatsapp-web.js');
const axios = require('axios');

const { printError } = require('../log');
const { envOuSetting, getSetting } = require('../settings');

// /gif [tag]: GIF aleatório do GIPHY, enviado como MP4 em loop.
// Chave: GIPHY_API_KEY no config/.env ou, na falta dela, o setting 'gif.giphy.api.key'
async function cmdGif({ msg, args }) {
    const apiKey = envOuSetting('GIPHY_API_KEY', 'gif.giphy.api.key');

    if (!apiKey) {
        await msg.reply('⚠️ Chave do GIPHY não configurada: defina GIPHY_API_KEY no config/.env ou use /set gif.giphy.api.key <chave>.');
        return;
    }

    try {
        const { data } = await axios.get('https://api.giphy.com/v1/gifs/random', {
            timeout: 15000,
            params: { api_key: apiKey, tag: args.trim() || getSetting('gif.tag'), rating: 'pg-13' }
        });

        const mp4 = data.data?.images?.original?.mp4;

        if (!mp4) {
            await msg.reply('❌ Nenhum GIF encontrado.');
            return;
        }

        const { data: video } = await axios.get(mp4, { responseType: 'arraybuffer', timeout: 15000, maxContentLength: 10 * 1024 * 1024 });
        const media = new MessageMedia('video/mp4', Buffer.from(video).toString('base64'), 'gif.mp4');

        await msg.reply(media, null, { sendVideoAsGif: true });
    } catch (err) {
        printError('/gif:', err.message);
        await msg.reply('❌ Não consegui buscar um GIF agora.');
    }
}

module.exports = {
    cmdGif
};
