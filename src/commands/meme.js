/*
 * Comando /meme.
 */

const { MessageMedia } = require('whatsapp-web.js');
const axios = require('axios');

const { printError } = require('../log');

// /meme [search]: random imgflip template
async function cmdMeme({ msg, args }) {
    try {
        const { data } = await axios.get('https://api.imgflip.com/get_memes', { timeout: 15000 });
        const search = args.trim().toLowerCase();
        const memes = data.data.memes.filter(m => !search || m.name.toLowerCase().includes(search));

        if (!memes.length) {
            await msg.reply(`❌ Nenhum meme com "${args.trim()}".`);
            return;
        }

        const meme = memes[Math.floor(Math.random() * memes.length)];
        const { data: image, headers } = await axios.get(meme.url, { responseType: 'arraybuffer', timeout: 15000, maxContentLength: 10 * 1024 * 1024 });
        const media = new MessageMedia(headers['content-type'] || 'image/jpeg', Buffer.from(image).toString('base64'), 'meme.jpg');

        await msg.reply(media, null, { caption: `🖼️ ${meme.name}` });
    } catch (err) {
        printError('/meme:', err.message);
        await msg.reply('❌ Não consegui buscar um meme agora.');
    }
}

module.exports = {
    cmdMeme
};
