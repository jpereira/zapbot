/*
 * Pipes (/a | /b): the output of a command is the replied message of the next one (src/pipeline.js).
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { MessageMedia, OTHERAlt, network, processes } = bot;
const { outputAsQuoted, plainOutput, splitPipeline } = bot.src('pipeline');

const translation = (text, iso = 'pt') => ({ text, from: { language: { iso, didYouMean: false } } });
function yahoo(ticker, price) {
    return {
        chart: {
            result: [{
                meta: {
                    symbol: ticker, longName: `${ticker} Inc`, fullExchangeName: 'NasdaqGS', currency: 'USD', regularMarketPrice: price,
                    regularMarketDayHigh: price, regularMarketDayLow: price, regularMarketVolume: 1, fiftyTwoWeekHigh: price, fiftyTwoWeekLow: price
                },
                indicators: { quote: [{ open: [price], close: [price], high: [price], low: [price] }] }
            }]
        }
    };
}

beforeEach(async () => {
    await bot.restart();
    await bot.setSetting('stocks.symbols', 'MSTR');
    network.responder('get', 'query1.finance.yahoo.com', () => yahoo('MSTR', 100));
});

describe('splitting', () => {
    test('only " | /command" outside {...} splits; regexes, braces, "\\|" and a bar in the text do not', () => {
        assert.deepEqual(splitPipeline('/stocks -q USD | /tts -l'), ['/stocks -q USD', '/tts -l']);
        assert.deepEqual(splitPipeline('/a x |  /b | /c y'), ['/a x', '/b', '/c y']);
        assert.deepEqual(splitPipeline('/watch /foo|bar/'), []);
        assert.deepEqual(splitPipeline('/notes #a pão | leite'), []);
        assert.deepEqual(splitPipeline('/me {/stocks USD | /tts}'), []);
        assert.deepEqual(splitPipeline('/notes #a x \\| /b'), []);
        assert.deepEqual(splitPipeline('/gpt a \\| /b | /translate'), ['/gpt a | /b', '/translate']);
        assert.deepEqual(splitPipeline('/stocks|/tts'), []);
    });

    test('the output that goes on: no WhatsApp marks and no tips block', () => {
        assert.equal(plainOutput('📈 *MSTR* _(Strategy)_ ~velho~ `x`\n💰 *US$ 100*\n\n💡 *Dicas*\n-alert avisa'),
            '📈 MSTR (Strategy) velho x\n💰 US$ 100');
        assert.equal(plainOutput('snake_case e 2*3*4'), 'snake_case e 2*3*4');
    });

    test('a media output becomes a replied photo, audio or sticker; a failure or nothing stops', () => {
        const base = bot.createMessage({ text: '/x' });
        const png = new MessageMedia('image/png', 'QUJD', 'a.png');
        const { quoted } = outputAsQuoted([{ content: '⏳ Gerando...' }, { content: png, options: { caption: 'oi' } }], base, '/qr');
        assert.deepEqual([quoted.type, quoted.hasMedia, quoted.body], ['image', true, 'oi']);
        const voice = outputAsQuoted([{ content: new MessageMedia('audio/ogg; codecs=opus', 'QUJD'), options: { sendAudioAsVoice: true } }], base, '/tts');
        assert.equal(voice.quoted.type, 'ptt');
        assert.equal(outputAsQuoted([{ content: png, options: { sendMediaAsSticker: true } }], base, '/sticker').quoted.type, 'sticker');
        assert.deepEqual(outputAsQuoted([{ content: '❌ Não deu' }], base, '/x'), { error: '❌ Não deu' });
        assert.match(outputAsQuoted([{ content: '⏳ ...' }], base, '/x').error, /não respondeu nada/);
        // an edited "⏳" notice is the result
        assert.equal(outputAsQuoted([{ content: 'resultado *final*' }], base, '/x').quoted.body, 'resultado final');
    });
});

describe('running', () => {
    test('/stocks | /translate: the clean text of the quote is what gets translated, and only the last one answers', async () => {
        network.responder('post', 'google-translate-api-x', translation('MSTR quote'));
        const sent = await bot.replyAlt('/stocks -q MSTR | /translate -to en');
        assert.deepEqual(sent, ['🌐 *Tradução* _(pt → en)_\n\nMSTR quote']);
        const { text, to } = network.calls.at(-1).cfg.body;
        assert.equal(to, 'en');
        assert.match(text, /MSTR/);
        assert.doesNotMatch(text, /[*_]|💡/u);
    });

    test('three stages, and a media output feeds the next one: /qr makes the picture that /ocr reads', async () => {
        processes.ocr = 'LIDO DA IMAGEM';
        const sent = await bot.replyAlt('/qr https://exemplo.com | /ocr');
        assert.equal(sent.at(-1), '📝 LIDO DA IMAGEM\n\n💡 _Lido por Tesseract_');
        assert.ok(processes.calls.some(c => c.bin.endsWith('tesseract')), 'the QR picture went to the OCR');
        assert.equal(sent.length, 1, 'the QR picture itself is not sent');
    });

    test('the first command reads the message the pipe replies to', async () => {
        network.responder('post', 'google-translate-api-x', translation('HELLO'));
        const quoted = bot.createMessage({ text: 'olá', de: OTHERAlt.jid });
        const sent = await bot.replyAlt('/translate -to en | /ascii', { quoted });
        assert.equal(network.calls.at(-1).cfg.body.text, 'olá');
        assert.equal(sent.length, 1);
        assert.doesNotMatch(sent[0], /Tradução/);
    });

    test('errors: a command that does not read a pipe, one that does not exist, too many, a failing source', async () => {
        assert.match((await bot.replyAlt('/stocks -q MSTR | /uptime'))[0], /^❌ \/uptime não lê a saída de outro comando\.\n💡 \*Dicas\*\nLeem o pipe: .*\/tts/);
        assert.match((await bot.replyAlt('/stocks -q MSTR | /naoexiste'))[0], /^❌ \/naoexiste não existe/);
        assert.match((await bot.replyAlt('/stocks | /tts | /tts | /tts | /tts'))[0], /^❌ No máximo 4 comandos/);
        // the kind: a picture to a command that reads text, a text to one that reads a picture
        assert.deepEqual(await bot.replyAlt('/qr oi | /tts'), ['❌ /tts lê texto, e o /qr mandou uma mídia (foto, áudio, vídeo, figurinha).']);
        assert.deepEqual(await bot.replyAlt('/stocks -q MSTR | /ocr'), ['❌ /ocr lê uma mídia (foto, áudio, vídeo, figurinha), e o /stocks mandou texto.']);
        network.responder('get', 'query1.finance.yahoo.com', () => { throw Object.assign(new Error('404'), { response: { status: 404 } }); });
        const failed = await bot.replyAlt('/stocks -q ZZZZ | /translate -to en', { expectedError: true });
        assert.equal(failed.length, 1);
        assert.match(failed[0], /^❌/);
        assert.ok(!network.calls.some(c => String(c.url).includes('translate')), 'the error was not translated');
    });

    test('a source keeps its own checks: help, unknown or contradictory options, and the role', async () => {
        assert.match((await bot.replyAlt('/stocks -alert -pause 1 -rm 2 | /translate'))[0], /não combinam/);
        assert.match((await bot.replyAlt('/stocks -h | /translate'))[0], /^\*\/stocks\* · /);
    });

    test('/alias, /cron, /me, /watch and /batch keep the bar as their text', async () => {
        await bot.replyAlt('/alias /dolartts /stocks -q MSTR | /translate -to en');
        const row = await bot.dbGet("SELECT command FROM command_aliases WHERE name = '/dolartts'");
        assert.equal(row.command, '/stocks -q MSTR | /translate -to en');
        // ... and the shortcut runs as a pipe
        network.responder('post', 'google-translate-api-x', translation('via alias'));
        const sent = await bot.replyAlt('/dolartts');
        assert.equal(sent.at(-1), '🌐 *Tradução* _(pt → en)_\n\nvia alias');
    });

    test('a user without one of the commands of the pipe is refused like for that command', async () => {
        await bot.setSetting('bot.users', []);
        await bot.replyAlt('/bot +cmd /stocks /Fulano/');
        // only /stocks: the pipe to /translate is refused, and so is a pipe whose first command is not theirs
        const stocks = await bot.replyAlt('/stocks -q MSTR', { de: OTHERAlt.jid });
        assert.match(stocks[0], /MSTR/);
        network.responder('post', 'google-translate-api-x', translation('x'));
        const sent = await bot.replyAlt('/stocks -q MSTR | /translate -to en', { de: OTHERAlt.jid });
        assert.ok(!network.calls.some(c => String(c.url).includes('translate')), '/translate did not run');
        assert.ok(sent.every(s => !/Tradução/.test(s)));
    });
});

describe('examples/pipes.zb', () => {
    test('loads the four shortcuts, each one keeping its pipe', async () => {
        const sent = await bot.replyAlt('/alias -examples pipes -yes');
        assert.doesNotMatch(sent.join('\n'), /❌/);
        const rows = await bot.dbAll('SELECT name, command FROM command_aliases ORDER BY name');
        assert.deepEqual(rows.map(r => r.name), ['/dollarvoice', '/drawsticker', '/forecasten', '/vidsum']);
        assert.ok(rows.every(r => / \| \//.test(r.command)), 'every shortcut is a pipe');
    });
});
