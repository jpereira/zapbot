/*
 * /sticker -pos: the square crop at the top, middle (default) or bottom.
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { MessageMedia } = bot;
const { argsDoFfmpeg, fitSticker, readPosition } = bot.src('media');

beforeEach(async () => { await bot.restart(); });

test('lerPosicao: nomes em português e inglês, padrão meio, inválido null', () => {
    assert.equal(readPosition(undefined), 'meio');
    assert.deepEqual(['topo', 'Cima', 'top', 'meio', 'centro', 'baixo', 'BOTTOM'].map(readPosition),
        ['topo', 'topo', 'topo', 'meio', 'meio', 'baixo', 'baixo']);
    assert.equal(readPosition('esquerda'), null);
});

test('vídeo: o crop do ffmpeg segue o -pos', () => {
    const filter = (pos) => {
        const args = argsDoFfmpeg({ opt: { sticker: true, pos } }, 'in.mp4', 'out.webp');
        return args[args.indexOf('-vf') + 1];
    };
    assert.match(filter(undefined), /crop=512:512:\(in_w-512\)\*0\.5:\(in_h-512\)\*0\.5/);
    assert.match(filter('topo'), /crop=512:512:\(in_w-512\)\*0:\(in_h-512\)\*0,/);
    assert.match(filter('baixo'), /crop=512:512:\(in_w-512\)\*1:\(in_h-512\)\*1,/);
});

test('imagem: o resize do sharp usa a posição do -pos', async () => {
    const sharp = require('sharp'); // the environment's fake
    const media = new MessageMedia('image/png', Buffer.from('imagem').toString('base64'), 'foto.png');
    const position = async (pos) => {
        sharp.resizes.length = 0;
        await fitSticker(media, pos);
        return sharp.resizes.at(-1);
    };
    assert.deepEqual(await position(undefined), { fit: 'cover', position: 'centre' });
    assert.deepEqual(await position('topo'), { fit: 'cover', position: 'left top' });
    assert.deepEqual(await position('baixo'), { fit: 'cover', position: 'right bottom' });
});

test('/sticker -pos: valida o valor e não vale com -txt', async () => {
    const quoted = bot.createMessage({ de: bot.OTHERAlt.jid, media: { mimetype: 'image/png', data: 'AA==' } });
    assert.match((await bot.replyAlt('/sticker -pos lado', { quoted }))[0], /-pos: "lado" não vale\. Use topo, meio ou baixo/);
    assert.match((await bot.replyAlt('/sticker -pos topo -txt oi'))[0], /não vale com -txt/);
});
