/*
 * Comando /meme.
 */

const { MessageMedia } = require('whatsapp-web.js');
const axios = require('axios');

const { printError } = require('../log');

// /meme [busca]: template aleatório do imgflip
async function cmdMeme({ msg, args }) {
    try {
        const { data } = await axios.get('https://api.imgflip.com/get_memes', { timeout: 15000 });
        const busca = args.trim().toLowerCase();
        const memes = data.data.memes.filter(m => !busca || m.name.toLowerCase().includes(busca));

        if (!memes.length) {
            await msg.reply(`❌ Nenhum meme com "${args.trim()}".`);
            return;
        }

        const meme = memes[Math.floor(Math.random() * memes.length)];
        const { data: imagem, headers } = await axios.get(meme.url, { responseType: 'arraybuffer', timeout: 15000, maxContentLength: 10 * 1024 * 1024 });
        const media = new MessageMedia(headers['content-type'] || 'image/jpeg', Buffer.from(imagem).toString('base64'), 'meme.jpg');

        await msg.reply(media, null, { caption: `🖼️ ${meme.name}` });
    } catch (err) {
        printError('/meme:', err.message);
        await msg.reply('❌ Não consegui buscar um meme agora.');
    }
}

module.exports = {
    cmdMeme
};
