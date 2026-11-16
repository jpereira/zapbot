/*
 * Debug through the real command: levels, regex, destinations and copy without a domino effect.
 */
const bot = require('./helpers/bot');
const { beforeEach, afterEach, describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { printDebug, printDebugLevel, printInfo, printError } = bot.src('log');
const { flushCopiesDebug, cleanCopiesDebug } = bot.src('debugCopy');
const { instrumentObject } = bot.src('debugInstrumentation');
const {
    withContextDebug, contextDebug, bootStartLogs, bootCompleteLogs
} = bot.src('debugContext');

beforeEach(bot.restart);
afterEach(cleanCopiesDebug);
afterEach(bootCompleteLogs);
const textLogs = () => bot.logs.join('\n');
const copies = () => bot.client.enviadas.filter(e =>
    typeof e.content === 'string' && e.content.startsWith('🪲 [ZapBot log]\n'));

async function configure(args) {
    const replies = await bot.replyAlt(`/debug ${args}`);
    cleanCopiesDebug();
    bot.logs.length = 0;
    return replies;
}

describe('/debug', () => {
    test('DEBUG0 mostra a regra, todos os destinos e a mensagem do alerta', async () => {
        await configure('-on -lvl 0');
        bot.createContact('5521922222222@c.us', 'Jorge Pereira');
        bot.createContact(bot.OTHERAlt.jid, 'Lourival Neto');
        bot.network.responder('get', 'api.binance.com/api/v3/ticker/price', [
            { symbol: 'BTCUSDT', price: '80000' }
        ]);
        const messageAlt = '⏰ Bitcoin to the moon! 🚀';
        const commandAlt = '/crypto -alert BTC > 90000 ' +
            `-to /Jorge Pereira/ -to /Lourival Neto/ -msg "${messageAlt}"`;
        const [reply] = await bot.replyAlt(commandAlt);
        assert.match(reply, /Alerta criado/);
        const parser = bot.logs.find(l => l.includes('Command parser: /crypto'));
        assert.match(parser, /DEBUG0/);
        assert.match(parser, /argv: \[ 'BTC', '>', '90000' \]/);
        assert.equal((parser.match(/\bargv:/g) ?? []).length, 1);
        assert.match(parser, /to: \[ 'Jorge Pereira', 'Lourival Neto' \]/);
        assert.ok(parser.includes(messageAlt));
        assert.match(parser, /given: Set\(3\) \{ 'alert', 'to', 'msg' \}/);
        assert.doesNotMatch(parser, /circular|Pereira\/|Neto\/|DEBUG[123]/);
        const alert = await bot.dbGet('SELECT * FROM price_alerts');
        assert.equal(alert.symbol, 'BTC');
        assert.equal(alert.target, 90000);
    });

    test('DEBUG0 usa o parser do watch para regex, flags, origem, destinos e máscara', async () => {
        await configure('-on -lvl 0');
        await bot.replyAlt('/watch /sapato -h azul/gi -in /Família/ -to /Fulano/ -m');
        const parser = bot.logs.find(l => l.includes('Command parser: /watch'));
        assert.match(parser, /regra: '\/sapato -h azul\/gi'/);
        assert.match(parser, /origem: 'Família'/);
        assert.match(parser, /destinos: \[ 'Fulano' \]/);
        assert.match(parser, /mask: true/);
    });

    test('DEBUG0 usa o parser do debug para aliases, regex com espaços e opção sem valor',
        async () => {
            await configure('-on -lvl 0');
            await bot.replyAlt('/debug -lvl 0 -filter /azul claro/i -copy-to');
            const parser = bot.logs.find(l => l.includes('Command parser: /debug'));
            assert.match(parser, /level: '0'/);
            assert.match(parser, /filter: '\/azul claro\/i'/);
            assert.match(parser, /copyTo: null/);
            assert.match(parser, /given: Set\(3\) \{ 'level', 'filter', 'copyTo' \}/);
        });

    test('DEBUG0 mostra aliases, booleanos, valores agrupados e argumentos numéricos', async () => {
        await configure('-on -lvl 0');
        await bot.replyAlt('/show -q "Jorge Pereira" -3 -m');
        const parser = bot.logs.find(l => l.includes('Command parser: /show'));
        assert.match(parser, /query: 'Jorge Pereira'/);
        assert.match(parser, /mask: true/);
        assert.match(parser, /numero: 3/);
        assert.match(parser, /given: Set\(2\) \{ 'query', 'mask' \}/);
    });

    test('DEBUG0 mostra a agenda com texto livre e destinos repetidos', async () => {
        await configure('-on -lvl 0');
        await bot.replyAlt('/cron 10m -r daily -to /Fulano/ -to /Família/ Bom dia, pessoal!');
        const parser = bot.logs.find(l => l.includes('Command parser: /cron'));
        assert.match(parser, /repeat: 'daily'/);
        assert.match(parser, /texto: 'Bom dia, pessoal!'/);
        assert.match(parser, /destinos: \[ 'Fulano', 'Família' \]/);
    });

    test('DEBUG0 preserva toda a mensagem livre do alerta e o destino depois dela', async () => {
        await configure('-on -lvl 0');
        bot.network.responder('get', 'api.binance.com/api/v3/ticker/price', [
            { symbol: 'BTCUSDT', price: '80000' }
        ]);
        await bot.replyAlt('/crypto BTC -alert > 90000 -msg Bitcoin subiu! 🚀 -to "Fulano"');
        const parser = bot.logs.find(l => l.includes('Command parser: /crypto'));
        assert.match(parser, /argv: \[ 'BTC', '>', '90000' \]/);
        assert.match(parser, /msg: 'Bitcoin subiu! 🚀'/);
        assert.match(parser, /to: \[ 'Fulano' \]/);
    });

    test('referências compartilhadas, Set e Map aparecem sem esconder seus valores', async () => {
        await configure('-on -lvl 0');
        const argv = ['BTC', '>', '90000'];
        const dataAlt = { opt: { argv }, argv, given: new Set(['alert', 'to', 'msg']),
            valores: new Map([['destino', 'Jorge Pereira'], ['token', 'segredo-mapa']]) };
        dataAlt.circular = dataAlt;
        printDebug('dados do parser', dataAlt);
        const log = textLogs();
        assert.equal((log.match(/argv: \[ 'BTC', '>', '90000' \]/g) ?? []).length, 2);
        assert.match(log, /given: Set\(3\) \{ 'alert', 'to', 'msg' \}/);
        assert.match(log, /'destino' => 'Jorge Pereira'/);
        assert.match(log, /'token' => '\[oculto\]'/);
        assert.match(log, /circular: '\[circular\]'/);
        assert.doesNotMatch(log, /segredo-mapa/);
    });

    test('filtro salvo preserva o boot e passa a valer depois do ready', async () => {
        await configure('-on -filter /sapato/i');
        bootStartLogs();
        printInfo('Starting ZapBot');
        for (const event of ['loading_screen', 'authenticated', 'ready']) {
            for (const handler of bot.client.listeners(event)) await handler(100, 'WhatsApp');
        }
        assert.match(textLogs(), /Starting ZapBot/);
        assert.match(textLogs(), /loading_screen/);
        assert.match(textLogs(), /authentication success/);
        assert.match(textLogs(), /ready!/);
        bot.logs.length = 0;
        printInfo('não casa');
        printInfo('sapato depois do boot');
        assert.equal(bot.logs.length, 1);
        assert.match(textLogs(), /sapato depois do boot/);
        assert.equal(bot.getSetting('debug.filter'), '/sapato/i');
    });

    test('aviso inicial atrasado permanece visível enquanto outros logs já são filtrados',
        async (t) => {
            await configure('-on -filter /sapato/');
            bootStartLogs();
            const { transporter } = bot.src('email');
            const smtp = {
                QRCODE_EMAIL_SMTP_HOST: 'smtp.teste', QRCODE_EMAIL_SMTP_USER: 'bot@teste',
                QRCODE_EMAIL_SMTP_TO: 'dono@teste'
            };
            const previous = Object.fromEntries(Object.keys(smtp).map(k => [k, process.env[k]]));
            Object.assign(process.env, smtp);
            let release;
            t.mock.method(transporter, 'sendMail', () => new Promise(r => { release = r; }));
            try {
                for (const handler of bot.client.listeners('ready')) await handler();
                assert.equal(typeof release, 'function');
                bot.logs.length = 0;
                printInfo('não casa');
                assert.equal(bot.logs.length, 0);
                release({});
                await new Promise(r => setImmediate(r));
                assert.match(textLogs(), /Alerta por e-mail enviado:.*Bot iniciado|Reconectado/);
            } finally {
                for (const [k, valueAlt] of Object.entries(previous)) {
                    if (valueAlt === undefined) delete process.env[k];
                    else process.env[k] = valueAlt;
                }
            }
        });

    test('filtro realça todos os matches no console e copia o texto sem ANSI', async (t) => {
        await configure('-on -filter /sapato/i -copy-to');
        const colors = require('colors');
        const enabled = colors.enabled;
        colors.enabled = true;
        try {
            const consoleLog = t.mock.method(console, 'log', () => {});
            printDebug('Sapato azul e sapato vermelho');
            const [line] = consoleLog.mock.calls.at(-1).arguments;
            assert.equal(line.split('\u001b[31m').length - 1, 2);
            assert.match(line, /Sapato/);
            await flushCopiesDebug();
            assert.equal(copies().at(-1).content.includes('\u001b['), false);
            assert.match(copies().at(-1).content, /Sapato azul e sapato vermelho/);
        } finally {
            colors.enabled = enabled;
        }
    });

    test('regex com matches vazios não bloqueia o log', async () => {
        await configure('-on -filter /(?:)/gu');
        printDebug('📰 texto');
        assert.equal(bot.logs.length, 1);
        assert.match(textLogs(), /📰 texto/);
    });

    test('padrão e nível exigem ativação; aceita aliases quando ligado', async () => {
        assert.equal(bot.getSetting('debug.level'), 0);
        assert.match((await bot.replyAlt('/debug -lvl 2'))[0], /Ligue.*\/debug -on -lvl 2/);
        assert.equal(bot.getSetting('debug.level'), 0);
        assert.match((await configure('-on'))[0], /DEBUG0/);
        assert.match((await configure('-lvl 2'))[0], /DEBUG2/);
        assert.equal(bot.getSetting('debug.level'), 2);
        assert.match((await bot.replyAlt('/debug'))[0], /DEBUG2/);
    });

    test('opções inválidas não ativam nem alteram configurações', async () => {
        for (const args of ['-on -level', '-on -lvl -1', '-on -level 4',
            '-on -level 1.5', '-on -level 2 -filter /[/i', '-on -f /abc/z',
            '-on -off', '-off -lvl 3', '-on -on', '-foo', '-on argumento',
            '-on -filter /sem fim', '-on -filter abc']) {
            assert.match((await bot.replyAlt(`/debug ${args}`))[0], /^❌/, args);
            assert.equal(bot.getSetting('debug.enabled'), false, args);
            assert.equal(bot.getSetting('debug.level'), 0, args);
        }
    });

    test('regex com espaços, escapes e flags; filtro vale para todos os logs', async () => {
        await configure('-on -lvl 3 -f /Sapato azul/i');
        printDebug('SAPATO AZUL');
        printInfo('outro');
        printError('sapato azul');
        assert.equal(bot.logs.length, 2);
        assert.ok(bot.logs.every(l => /sapato azul/i.test(l)));
        await configure('-filter /a\\/b/gi');
        printDebug('a/b');
        printDebug('a/b');
        printInfo('nada');
        assert.equal(bot.logs.length, 2, 'lastIndex do g não vaza entre linhas');
        await configure('-filter /^[^]*sapato/y');
        printDebug('sapato');
        printDebug('sapato');
        assert.equal(bot.logs.length, 2, 'lastIndex do y também reinicia');
        await configure('-filter -copy-to');
        printInfo('sem filtro');
        assert.equal(bot.logs.length, 1);
        assert.equal(bot.getSetting('debug.filter'), '');
        assert.equal(bot.getSetting('debug.copyTo'), bot.GROUP);
    });

    test('níveis cumulativos e rastro do parser, funções e APIs com parâmetros', async () => {
        for (let level = 0; level <= 3; level++) {
            await configure(`-on -lvl ${level}`);
            for (let n = 0; n <= 3; n++) printDebugLevel(n, `marcador${n}`);
            assert.equal(bot.logs.length, level + 1);
            await bot.replyAlt('/ping');
            if (level >= 1) {
                assert.match(textLogs(), /DEBUG1.*message_create start/);
                assert.match(textLogs(), /GetOptFromCommand start/);
                assert.match(textLogs(), /cmdPing end/);
                assert.match(textLogs(), /chatName=Família/);
            } else assert.doesNotMatch(textLogs(), /DEBUG[123]/);
            bot.network.responder('get', 'kernel.org/releases.json', {
                latest_stable: { version: '6.1' }, releases: []
            });
            await bot.replyAlt('/kernel');
            if (level >= 2) {
                assert.match(textLogs(), /DEBUG2.*axios.get start/);
                assert.match(textLogs(), /kernel.org\/releases.json/);
                assert.match(textLogs(), /timeout: 15000/);
            } else assert.doesNotMatch(textLogs(), /DEBUG2/);
            if (level === 3) {
                assert.match(textLogs(), /DEBUG3.*dbRun start/);
                assert.match(textLogs(), /DEBUG3.*result/);
            } else assert.doesNotMatch(textLogs(), /DEBUG3/);
        }
    });

    test('filtro pelo contexto do chat e isolamento entre execuções simultâneas', async () => {
        await configure('-on -lvl 1 -filter /chatName.*Jorge/');
        bot.createGroup('120363000000000099@g.us', 'Jorge', [bot.OWNER.jid]);
        await Promise.all([
            bot.replyAlt('/ping'),
            bot.replyAlt('/ping', { chat: '120363000000000099@g.us' })
        ]);
        assert.ok(bot.logs.length > 0);
        assert.ok(bot.logs.every(l => /chatName=Jorge/.test(l)));
        assert.doesNotMatch(textLogs(), /chatName=Família/);
        assert.equal(contextDebug().chatId, undefined);
    });

    test('cópia sem destino usa o chat; filtro seleciona também o que é enviado', async () => {
        await configure('-on -lvl 2 -filter /sapato/ -copy-to');
        bot.src('client').cleanMarks();
        assert.equal(bot.getSetting('debug.copyTo'), bot.GROUP);
        printDebug('sapato 1');
        printInfo('ignorado');
        printDebugLevel(2, 'sapato 2');
        await flushCopiesDebug();
        assert.equal(copies().length, 1);
        assert.equal(copies()[0].chatId, bot.GROUP);
        assert.match(copies()[0].content, /sapato 1[\s\S]*sapato 2/);
        assert.doesNotMatch(copies()[0].content, /ignorado|sendMessage/);
        const beforeAlt = bot.logs.length;
        await bot.deliver(bot.createMessage({ texto: copies()[0].content }));
        await flushCopiesDebug();
        assert.equal(bot.logs.length, beforeAlt);
        assert.equal(copies().length, 1, 'a própria cópia não gera cópias');
        assert.equal(bot.src('client').botConsumeSending(bot.GROUP), false,
            'a cópia não deixa marca que afete a contagem da próxima mensagem');
        assert.equal(await bot.dbGet('SELECT 1 FROM messages WHERE body = ?',
            [copies()[0].content]), undefined);
    });

    test('contato, grupo com espaços, número, menção e privado como destino', async () => {
        bot.createContact('5521999999999@c.us', 'Jorge Pereira');
        for (const [args, optionsAlt, destination] of [
            ['-copy-to /Jorge Pereira/', {}, '5521999999999@c.us'],
            ['-copy-to "Família"', {}, bot.GROUP],
            ['-copy-to +5521999999999', {}, '5521999999999@c.us'],
            ['-copy-to @5521999999999', { mencoes: ['5521999999999@c.us'] },
                '5521999999999@c.us'],
            ['-copy-to', { chat: bot.OTHERAlt.jid }, bot.OTHERAlt.jid]
        ]) {
            const [r] = await bot.replyAlt(`/debug -on ${args}`, optionsAlt);
            assert.match(r, /Cópia:/);
            assert.equal(bot.getSetting('debug.copyTo'), destination);
        }
    });

    test('destino ambíguo permite escolher; email não altera o estado', async () => {
        bot.createContact('5521999999991@c.us', 'Jorge A');
        bot.createContact('5521999999992@c.us', 'Jorge B');
        await bot.replyChoosing('/debug -on -copy-to Jorge', 2);
        assert.equal(bot.getSetting('debug.copyTo'), '5521999999992@c.us');
        const [r] = await bot.replyAlt('/debug -on -lvl 3 -copy-to jorge@exemplo.com');
        assert.match(r, /não e-mail/);
        assert.equal(bot.getSetting('debug.level'), 0);
        assert.equal(bot.getSetting('debug.copyTo'), '5521999999992@c.us');
    });

    test('desligar limpa filtro, destino e fila; reativar mantém nível sem cópia', async () => {
        await configure('-on -lvl 3 -filter /sapato/ -copy-to');
        printDebug('sapato pendente');
        assert.deepEqual(await bot.replyAlt('/debug -off'), ['🪲 Debug Desativado.']);
        await flushCopiesDebug();
        assert.equal(copies().length, 0);
        assert.equal(bot.getSetting('debug.filter'), '');
        assert.equal(bot.getSetting('debug.copyTo'), '');
        assert.equal(bot.getSetting('debug.level'), 3);
        await configure('-on -lvl 3 -filter /@newsletter/');
        printDebug('@newsletter');
        await flushCopiesDebug();
        assert.equal(copies().length, 0);
    });

    test('falha de envio pausa cópia; configurar permite retomar', async (t) => {
        await configure('-on -copy-to -filter /marcador|Cópia dos logs/');
        const original = bot.client.sendMessage;
        const mock = t.mock.method(bot.client, 'sendMessage', async () => {
            throw new Error('sem conexão');
        });
        printDebug('marcador');
        await flushCopiesDebug();
        assert.equal(mock.mock.calls.length, 1);
        printDebug('marcador de novo');
        await flushCopiesDebug();
        assert.equal(mock.mock.calls.length, 1);
        assert.match(textLogs(), /Cópia dos logs pausada/);
        mock.mock.restore();
        assert.equal(bot.client.sendMessage, original);
        await configure('-copy-to');
        printDebug('marcador recuperado');
        await flushCopiesDebug();
        assert.match(copies().at(-1).content, /recuperado/);
    });

    test('fila limitada descarta os logs mais antigos e divide mensagens grandes', async () => {
        await configure('-on -copy-to -filter /marcador/');
        for (let i = 0; i < 510; i++) printDebug(`marcador ${i}`);
        await flushCopiesDebug();
        const textAlt = copies().map(e => e.content).join('\n');
        assert.match(textAlt, /10 blocos descartados/);
        assert.doesNotMatch(textAlt, /marcador 0\n/);
        assert.match(textAlt, /marcador 509/);
        assert.ok(copies().every(e => e.content.length < 3200));
    });

    test('logs do boot aguardam a conexão pronta sem pausar a cópia', async () => {
        await configure('-on -copy-to -filter /marcador/');
        bot.estado.pronto = false;
        printDebug('marcador durante o boot');
        await flushCopiesDebug();
        assert.equal(copies().length, 0);
        bot.estado.pronto = true;
        await flushCopiesDebug();
        assert.match(copies().at(-1).content, /durante o boot/);
    });

    test('troca de destino durante um envio mantém os logs novos na nova fila', async (t) => {
        await configure('-on -copy-to -filter /marcador/');
        let release;
        const original = bot.client.sendMessage;
        t.mock.method(bot.client, 'sendMessage', async (...args) => {
            await new Promise(resolve => { release = resolve; });
            return original.apply(bot.client, args);
        });
        printDebug('marcador antigo');
        const pending = flushCopiesDebug();
        cleanCopiesDebug();
        await bot.setSetting('debug.copyTo', bot.OTHERAlt.jid);
        printDebug('marcador novo');
        release();
        await pending;
        t.mock.restoreAll();
        await flushCopiesDebug();
        assert.equal(copies().at(-1).chatId, bot.OTHERAlt.jid);
        assert.match(copies().at(-1).content, /marcador novo/);
        assert.doesNotMatch(copies().at(-1).content, /marcador antigo/);
    });
});

describe('instrumentação', () => {
    test('preserva this, retorno síncrono, promises e erros; rastreia uma vez', async () => {
        await configure('-on -lvl 3');
        const errorAlt = new Error('falhou');
        const object = {
            numero: 7,
            somar(n) { return this.numero + n; },
            async esperar() { return this.numero; },
            falhar() { throw errorAlt; },
            async rejeitar() { throw errorAlt; },
            falharSemErro() { throw 0; },
            async rejeitarSemErro() { throw undefined; }
        };
        instrumentObject(object, 'exemplo', 1);
        instrumentObject(object, 'exemplo', 1);
        assert.equal(object.somar(2), 9);
        assert.equal(await object.esperar(), 7);
        assert.throws(() => object.falhar(), e => e === errorAlt);
        await assert.rejects(object.rejeitar(), e => e === errorAlt);
        assert.throws(() => object.falharSemErro(), e => e === 0);
        await assert.rejects(object.rejeitarSemErro(), e => e === undefined);
        assert.equal(bot.logs.filter(l => /exemplo.falhar error/.test(l)).length, 1);
        assert.equal(bot.logs.filter(l => /exemplo.rejeitar error/.test(l)).length, 1);
    });

    test('credenciais não vazam; objetos circulares, getters e buffers são resumidos', async () => {
        await configure('-on -lvl 3 -copy-to -filter /marcador/');
        process.env.DEBUG_TEST_TOKEN = 'segredo-do-ambiente';
        try {
            await bot.setSetting('gpt.api.key', 'segredo-da-setting');
            const dataAlt = { password: 'novo-segredo', valor: Buffer.alloc(100),
                get pesado() { throw new Error('getter não pode executar'); } };
            dataAlt.circular = dataAlt;
            printDebugLevel(3, 'marcador', dataAlt, 'segredo-do-ambiente', 'segredo-da-setting',
                'https://api.test/?token=segredo-query&pagina=2',
                { headers: { Authorization: 'Bearer segredo-header' } });
            printDebug('marcador /set giphy.api.key segredo-novo');
            await flushCopiesDebug();
            assert.doesNotMatch(textLogs(), /novo-segredo|segredo-(do|da|query|header|novo)/);
            assert.match(textLogs(), /oculto/);
            assert.match(textLogs(), /Buffer 100 bytes/);
            assert.match(textLogs(), /circular/);
            assert.match(textLogs(), /getter/);
            assert.ok(copies().length > 0);
            assert.doesNotMatch(copies().map(e => e.content).join('\n'), /segredo-/);
            assert.equal(dataAlt.password, 'novo-segredo');
        } finally {
            delete process.env.DEBUG_TEST_TOKEN;
        }
    });

    test('escopo sem rastro impede instrumentação e cópia durante o envio', async () => {
        await configure('-on -lvl 3 -copy-to');
        await withContextDebug({ semRastro: true }, async () => {
            printDebug('não aparece');
            await bot.client.getContacts();
        });
        await flushCopiesDebug();
        assert.equal(bot.logs.length, 0);
        assert.equal(copies().length, 0);
    });

    test('ocultar uma setting sensível preserva o contexto usado no filtro', async () => {
        await configure('-on -lvl 1 -filter /chatName.*Jorge/');
        withContextDebug({ chatId: bot.GROUP, chatName: 'Jorge' }, () => {
            printDebug('/set gpt.api.key segredo-temporario');
        });
        assert.equal(bot.logs.length, 1);
        assert.match(textLogs(), /chatName=Jorge/);
        assert.doesNotMatch(textLogs(), /segredo-temporario/);
    });
});
