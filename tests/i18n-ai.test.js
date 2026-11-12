/*
 * As respostas dos comandos de IA e de mídia em inglês (en_US). Os outros testes rodam em pt_BR.
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { setSetting } = bot.src('settings');
const { t } = bot.src('i18n');

beforeEach(bot.reiniciar);

test('/ascii, /giphy e /sticker respondem em inglês', async () => {
    await setSetting('zapbot.lang', 'en_US');
    assert.match((await bot.responder('/ascii -w 3 x'))[0], /^❌ -width needs a number from \d+ to \d+$/);
    assert.match((await bot.responder('/giphy'))[0], /⚠️ GIPHY key not set/);
    assert.equal((await bot.responder('/sticker -txt'))[0], '❌ Provide the text: /sticker -txt "Good morning!"');
    assert.match((await bot.responder('/sticker -bg #FFF'))[0], /^❌ -bg and -fg belong to -txt/);
});

test('/gpt, /tldr e /draw sem chave respondem em inglês', async () => {
    await setSetting('zapbot.lang', 'en_US');
    for (const cmd of ['/gpt oi', '/tldr', '/draw gato']) {
        const [r] = await bot.responder(cmd);
        assert.match(r, /OpenAI API key not found: .* is disabled\./, cmd);
    }
});

test('o plural e o formato de números seguem o idioma', () => {
    assert.equal(t('tldr.messages', { n: 1 }, 'en_US'), '1 message');
    assert.equal(t('tldr.messages', { n: 5 }, 'en_US'), '5 messages');
    assert.equal(t('tldr.messages', { n: 5 }, 'pt_BR'), '5 mensagens');
    assert.equal(t('gpt.priceChangedMany', { n: 0 }, 'pt_BR'), '0 alterados');
});
