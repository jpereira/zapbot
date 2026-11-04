/*
 * /sticker -pos: o recorte quadrado no topo, no meio (padrão) ou embaixo.
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { MessageMedia } = bot;
const { argsDoFfmpeg, enquadrarSticker, lerPosicao } = bot.src('midia');

beforeEach(async () => { await bot.reiniciar(); });

test('lerPosicao: nomes em português e inglês, padrão meio, inválido null', () => {
    assert.equal(lerPosicao(undefined), 'meio');
    assert.deepEqual(['topo', 'Cima', 'top', 'meio', 'centro', 'baixo', 'BOTTOM'].map(lerPosicao),
        ['topo', 'topo', 'topo', 'meio', 'meio', 'baixo', 'baixo']);
    assert.equal(lerPosicao('esquerda'), null);
});

test('vídeo: o crop do ffmpeg segue o -pos', () => {
    const filtro = (pos) => {
        const args = argsDoFfmpeg({ opt: { sticker: true, pos } }, 'in.mp4', 'out.webp');
        return args[args.indexOf('-vf') + 1];
    };
    assert.match(filtro(undefined), /crop=512:512:\(in_w-512\)\*0\.5:\(in_h-512\)\*0\.5/);
    assert.match(filtro('topo'), /crop=512:512:\(in_w-512\)\*0:\(in_h-512\)\*0,/);
    assert.match(filtro('baixo'), /crop=512:512:\(in_w-512\)\*1:\(in_h-512\)\*1,/);
});

test('imagem: o resize do sharp usa a posição do -pos', async () => {
    const sharp = require('sharp'); // o falso do ambiente
    const media = new MessageMedia('image/png', Buffer.from('imagem').toString('base64'), 'foto.png');
    const posicao = async (pos) => {
        sharp.resizes.length = 0;
        await enquadrarSticker(media, pos);
        return sharp.resizes.at(-1);
    };
    assert.deepEqual(await posicao(undefined), { fit: 'cover', position: 'centre' });
    assert.deepEqual(await posicao('topo'), { fit: 'cover', position: 'left top' });
    assert.deepEqual(await posicao('baixo'), { fit: 'cover', position: 'right bottom' });
});

test('/sticker -pos: valida o valor e não vale com -txt', async () => {
    const citada = bot.criarMensagem({ de: bot.OUTRO.jid, midia: { mimetype: 'image/png', data: 'AA==' } });
    assert.match((await bot.responder('/sticker -pos lado', { citada }))[0], /-pos: "lado" não vale\. Use topo, meio ou baixo/);
    assert.match((await bot.responder('/sticker -pos topo -txt oi'))[0], /não vale com -txt/);
});
