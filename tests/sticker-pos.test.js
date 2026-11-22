/*
 * /sticker -pos: the square crop at the top, middle (default) or bottom.
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { MessageMedia } = bot;
const { argsDoFfmpeg, fitSticker, readPosition } = bot.src('media');

beforeEach(async () => { await bot.restart(); });

test('lerPosicao: nomes em inglês, padrão center, inválido null', () => {
    assert.equal(readPosition(undefined), 'center');
    assert.deepEqual(['top', 'Top', 'center', 'CENTER', 'bottom'].map(readPosition),
        ['top', 'top', 'center', 'center', 'bottom']);
    assert.equal(readPosition('esquerda'), null);
});

test('vídeo: o crop do ffmpeg segue o -pos', () => {
    const filter = (pos) => {
        const args = argsDoFfmpeg({ opt: { sticker: true, pos } }, 'in.mp4', 'out.webp');
        return args[args.indexOf('-vf') + 1];
    };
    assert.match(filter(undefined), /crop=512:512:\(in_w-512\)\*0\.5:\(in_h-512\)\*0\.5/);
    assert.match(filter('top'), /crop=512:512:\(in_w-512\)\*0:\(in_h-512\)\*0,/);
    assert.match(filter('bottom'), /crop=512:512:\(in_w-512\)\*1:\(in_h-512\)\*1,/);
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
    assert.deepEqual(await position('top'), { fit: 'cover', position: 'left top' });
    assert.deepEqual(await position('bottom'), { fit: 'cover', position: 'right bottom' });
});

test('/sticker -pos: valida o valor e não vale com -txt', async () => {
    const quoted = bot.createMessage({ de: bot.OTHERAlt.jid, media: { mimetype: 'image/png', data: 'AA==' } });
    assert.match((await bot.replyAlt('/sticker -pos lado', { quoted }))[0], /-pos: "lado" não vale\. Use top, center ou bottom/);
    assert.match((await bot.replyAlt('/sticker -pos topo -txt oi'))[0], /não vale com -txt/);
});

test('/sticker -pt, -pc, -pb: atalhos do -pos; juntos ou com -pos dão erro', () => {
    const { applyPosShortcuts } = bot.src('media');
    const mk = (...given) => ({ opt: {}, given: new Set(given) });
    for (const [k, pos] of [['pt', 'top'], ['pc', 'center'], ['pb', 'bottom']]) {
        const o = mk(k);
        assert.equal(applyPosShortcuts(o), true);
        assert.equal(o.opt.pos, pos);
        assert.ok(o.given.has('pos'));
        assert.equal(applyPosShortcuts(o), true);   // idempotent
        assert.equal(o.opt.pos, pos);
    }
    assert.equal(applyPosShortcuts(mk('pt', 'pb')), false);
    assert.equal(applyPosShortcuts(mk('pt', 'pos')), false);
    assert.equal(applyPosShortcuts(mk()), true);
});

test('opção digitada pela metade: prefixo único vale; ambíguo ou desconhecido fica de fora', () => {
    const { GetOptFromCommand } = bot.src('options');
    const cfg = { cmd_opts: [{ opts: ['photo', 'ph'], values: ['<n>'] }, { opts: ['pos'], values: ['<v>'] }, { opts: ['pb'], values: [] }] };
    assert.equal(GetOptFromCommand('-phot 2', cfg).opt.photo, '2');
    assert.equal(GetOptFromCommand('-po top', cfg).opt.pos, 'top');
    assert.deepEqual(GetOptFromCommand('-p x', cfg).argv, ['-p', 'x']);
    assert.equal(readPosition('bot'), 'bottom');
    assert.equal(readPosition('t'), 'top');
    assert.equal(readPosition('x'), null);
});
