/*
 * Comando /giphy (alias /gif).
 */

const { MessageMedia } = require('whatsapp-web.js');
const axios = require('axios');

const { printError } = require('../log');
const { envOuSetting, getSetting } = require('../settings');

// /giphy [tag|URL|ID]: GIF do GIPHY, enviado como MP4 em loop.
// Chave: GIPHY_API_KEY no config/.env ou, na falta dela, o setting 'giphy.api.key'
async function cmdGiphy({ msg, args }) {
    const apiKey = envOuSetting('GIPHY_API_KEY', 'giphy.api.key');

    if (!apiKey) {
        await msg.reply(
            '⚠️ Chave do GIPHY não configurada: defina GIPHY_API_KEY no config/.env ou use /set giphy.api.key <chave>.'
        );
        return;
    }

    try {
        const input = args.trim();

        let gifData;

        // Exemplo:
        // https://giphy.com/gifs/locked-in-funny-reaction-get-on-the-game-h5WUvmDSB0njFcFeCE
        const urlMatch = input.match(
            /giphy\.com\/gifs\/(?:.*-)?([a-zA-Z0-9]+)(?:[/?#]|$)/
        );

        // ID puro do Giphy
        const isId = /^[a-zA-Z0-9]{10,}$/.test(input);

        if (urlMatch || isId) {
            const gifId = urlMatch ? urlMatch[1] : input;

            const { data } = await axios.get(
                `https://api.giphy.com/v1/gifs/${gifId}`,
                {
                    timeout: 15000,
                    params: {
                        api_key: apiKey
                    }
                }
            );

            gifData = data.data;

        } else {
            // GIF aleatório baseado numa tag.
            const { data } = await axios.get(
                'https://api.giphy.com/v1/gifs/random',
                {
                    timeout: 15000,
                    params: {
                        api_key: apiKey,
                        tag: input || getSetting('gif.tag'),
                        rating: 'pg-13'
                    }
                }
            );

            gifData = data.data;
        }

        const mp4 =
            gifData?.images?.original?.mp4 ||
            gifData?.images?.downsized_medium?.mp4;

        if (!mp4) {
            await msg.reply('❌ Nenhum GIF encontrado.');
            return;
        }

        const { data: video } = await axios.get(mp4, {
            responseType: 'arraybuffer',
            timeout: 15000,
            maxContentLength: 10 * 1024 * 1024
        });

        const media = new MessageMedia(
            'video/mp4',
            Buffer.from(video).toString('base64'),
            'gif.mp4'
        );

        await msg.reply(media, null, {
            sendVideoAsGif: true
        });

    } catch (err) {
        printError('/giphy:', err.message);
        await msg.reply('❌ Não consegui buscar esse GIF.');
    }
}

module.exports = {
    cmdGiphy
};
