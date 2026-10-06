/*
 * Debug pelo comando real: níveis, regex, destinos e cópia sem efeito dominó.
 */
const bot = require('./helpers/bot');
const { beforeEach, afterEach, describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { printDebug, printDebugNivel, printInfo, printError } = bot.src('log');
const { flushCopiasDebug, limparCopiasDebug } = bot.src('debugCopia');
const { instrumentarObjeto } = bot.src('debugInstrumentacao');
const {
    comContextoDebug, contextoDebug, iniciarLogsDeBoot, concluirLogsDeBoot
} = bot.src('debugContexto');

beforeEach(bot.reiniciar);
afterEach(limparCopiasDebug);
afterEach(concluirLogsDeBoot);
const textoLogs = () => bot.logs.join('\n');
const copias = () => bot.client.enviadas.filter(e =>
    typeof e.content === 'string' && e.content.startsWith('🪲 [ZapBot log]\n'));

async function configurar(args) {
    const respostas = await bot.responder(`/debug ${args}`);
    limparCopiasDebug();
    bot.logs.length = 0;
    return respostas;
}

describe('/debug', () => {
    test('filtro salvo preserva o boot e passa a valer depois do ready', async () => {
        await configurar('-on -filter /sapato/i');
        iniciarLogsDeBoot();
        printInfo('Starting ZapBot');
        for (const evento of ['loading_screen', 'authenticated', 'ready']) {
            for (const handler of bot.client.listeners(evento)) await handler(100, 'WhatsApp');
        }
        assert.match(textoLogs(), /Starting ZapBot/);
        assert.match(textoLogs(), /loading_screen/);
        assert.match(textoLogs(), /authentication success/);
        assert.match(textoLogs(), /inicializado!/);
        bot.logs.length = 0;
        printInfo('não casa');
        printInfo('sapato depois do boot');
        assert.equal(bot.logs.length, 1);
        assert.match(textoLogs(), /sapato depois do boot/);
        assert.equal(bot.getSetting('debug.filter'), '/sapato/i');
    });

    test('aviso inicial atrasado permanece visível enquanto outros logs já são filtrados',
        async (t) => {
            await configurar('-on -filter /sapato/');
            iniciarLogsDeBoot();
            const { transporter } = bot.src('email');
            const smtp = {
                QRCODE_EMAIL_SMTP_HOST: 'smtp.teste', QRCODE_EMAIL_SMTP_USER: 'bot@teste',
                QRCODE_EMAIL_SMTP_TO: 'dono@teste'
            };
            const anteriores = Object.fromEntries(Object.keys(smtp).map(k => [k, process.env[k]]));
            Object.assign(process.env, smtp);
            let liberar;
            t.mock.method(transporter, 'sendMail', () => new Promise(r => { liberar = r; }));
            try {
                for (const handler of bot.client.listeners('ready')) await handler();
                assert.equal(typeof liberar, 'function');
                bot.logs.length = 0;
                printInfo('não casa');
                assert.equal(bot.logs.length, 0);
                liberar({});
                await new Promise(r => setImmediate(r));
                assert.match(textoLogs(), /Alerta por e-mail enviado:.*Bot iniciado|Reconectado/);
            } finally {
                for (const [k, valor] of Object.entries(anteriores)) {
                    if (valor === undefined) delete process.env[k];
                    else process.env[k] = valor;
                }
            }
        });

    test('filtro realça todos os matches no console e copia o texto sem ANSI', async (t) => {
        await configurar('-on -filter /sapato/i -copy-to');
        const colors = require('colors');
        const habilitadas = colors.enabled;
        colors.enabled = true;
        try {
            const consoleLog = t.mock.method(console, 'log', () => {});
            printDebug('Sapato azul e sapato vermelho');
            const [linha] = consoleLog.mock.calls.at(-1).arguments;
            assert.equal(linha.split('\u001b[31m').length - 1, 2);
            assert.match(linha, /Sapato/);
            await flushCopiasDebug();
            assert.equal(copias().at(-1).content.includes('\u001b['), false);
            assert.match(copias().at(-1).content, /Sapato azul e sapato vermelho/);
        } finally {
            colors.enabled = habilitadas;
        }
    });

    test('regex com matches vazios não bloqueia o log', async () => {
        await configurar('-on -filter /(?:)/gu');
        printDebug('📰 texto');
        assert.equal(bot.logs.length, 1);
        assert.match(textoLogs(), /📰 texto/);
    });

    test('padrão e nível exigem ativação; aceita aliases quando ligado', async () => {
        assert.equal(bot.getSetting('debug.level'), 0);
        assert.match((await bot.responder('/debug -level 2'))[0], /Ligue.*\/debug -on -level 2/);
        assert.equal(bot.getSetting('debug.level'), 0);
        assert.match((await configurar('-on'))[0], /DEBUG0/);
        assert.match((await configurar('-lvl 2'))[0], /DEBUG2/);
        assert.equal(bot.getSetting('debug.level'), 2);
        assert.match((await bot.responder('/debug'))[0], /DEBUG2/);
    });

    test('opções inválidas não ativam nem alteram configurações', async () => {
        for (const args of ['-on -level', '-on -lvl -1', '-on -level 4',
            '-on -level 1.5', '-on -level 2 -filter /[/i', '-on -f /abc/z',
            '-on -off', '-off -lvl 3', '-on -on', '-foo', '-on argumento',
            '-on -filter /sem fim', '-on -filter abc']) {
            assert.match((await bot.responder(`/debug ${args}`))[0], /^❌/, args);
            assert.equal(bot.getSetting('debug.enabled'), false, args);
            assert.equal(bot.getSetting('debug.level'), 0, args);
        }
    });

    test('regex com espaços, escapes e flags; filtro vale para todos os logs', async () => {
        await configurar('-on -lvl 3 -f /Sapato azul/i');
        printDebug('SAPATO AZUL');
        printInfo('outro');
        printError('sapato azul');
        assert.equal(bot.logs.length, 2);
        assert.ok(bot.logs.every(l => /sapato azul/i.test(l)));
        await configurar('-filter /a\\/b/gi');
        printDebug('a/b');
        printDebug('a/b');
        printInfo('nada');
        assert.equal(bot.logs.length, 2, 'lastIndex do g não vaza entre linhas');
        await configurar('-filter /^[^]*sapato/y');
        printDebug('sapato');
        printDebug('sapato');
        assert.equal(bot.logs.length, 2, 'lastIndex do y também reinicia');
        await configurar('-filter -copy-to');
        printInfo('sem filtro');
        assert.equal(bot.logs.length, 1);
        assert.equal(bot.getSetting('debug.filter'), '');
        assert.equal(bot.getSetting('debug.copyTo'), bot.GRUPO);
    });

    test('níveis cumulativos e rastro do parser, funções e APIs com parâmetros', async () => {
        for (let nivel = 0; nivel <= 3; nivel++) {
            await configurar(`-on -lvl ${nivel}`);
            for (let n = 0; n <= 3; n++) printDebugNivel(n, `marcador${n}`);
            assert.equal(bot.logs.length, nivel + 1);
            await bot.responder('/ping');
            if (nivel >= 1) {
                assert.match(textoLogs(), /DEBUG1.*message_create início/);
                assert.match(textoLogs(), /GetOptFromCommand início/);
                assert.match(textoLogs(), /cmdPing fim/);
                assert.match(textoLogs(), /chatName=Família/);
            } else assert.doesNotMatch(textoLogs(), /DEBUG[123]/);
            bot.rede.responder('get', 'kernel.org/releases.json', {
                latest_stable: { version: '6.1' }, releases: []
            });
            await bot.responder('/kernel');
            if (nivel >= 2) {
                assert.match(textoLogs(), /DEBUG2.*axios.get início/);
                assert.match(textoLogs(), /kernel.org\/releases.json/);
                assert.match(textoLogs(), /timeout: 15000/);
            } else assert.doesNotMatch(textoLogs(), /DEBUG2/);
            if (nivel === 3) {
                assert.match(textoLogs(), /DEBUG3.*dbRun início/);
                assert.match(textoLogs(), /DEBUG3.*resultado/);
            } else assert.doesNotMatch(textoLogs(), /DEBUG3/);
        }
    });

    test('filtro pelo contexto do chat e isolamento entre execuções simultâneas', async () => {
        await configurar('-on -lvl 1 -filter /chatName.*Jorge/');
        bot.criarGrupo('120363000000000099@g.us', 'Jorge', [bot.DONO.jid]);
        await Promise.all([
            bot.responder('/ping'),
            bot.responder('/ping', { chat: '120363000000000099@g.us' })
        ]);
        assert.ok(bot.logs.length > 0);
        assert.ok(bot.logs.every(l => /chatName=Jorge/.test(l)));
        assert.doesNotMatch(textoLogs(), /chatName=Família/);
        assert.equal(contextoDebug().chatId, undefined);
    });

    test('cópia sem destino usa o chat; filtro seleciona também o que é enviado', async () => {
        await configurar('-on -lvl 2 -filter /sapato/ -copy-to');
        bot.src('cliente').limparMarcas();
        assert.equal(bot.getSetting('debug.copyTo'), bot.GRUPO);
        printDebug('sapato 1');
        printInfo('ignorado');
        printDebugNivel(2, 'sapato 2');
        await flushCopiasDebug();
        assert.equal(copias().length, 1);
        assert.equal(copias()[0].chatId, bot.GRUPO);
        assert.match(copias()[0].content, /sapato 1[\s\S]*sapato 2/);
        assert.doesNotMatch(copias()[0].content, /ignorado|sendMessage/);
        const antes = bot.logs.length;
        await bot.entregar(bot.criarMensagem({ texto: copias()[0].content }));
        await flushCopiasDebug();
        assert.equal(bot.logs.length, antes);
        assert.equal(copias().length, 1, 'a própria cópia não gera cópias');
        assert.equal(bot.src('cliente').consumirEnvioDoBot(bot.GRUPO), false,
            'a cópia não deixa marca que afete a contagem da próxima mensagem');
        assert.equal(await bot.dbGet('SELECT 1 FROM messages WHERE body = ?',
            [copias()[0].content]), undefined);
    });

    test('contato, grupo com espaços, número, menção e privado como destino', async () => {
        bot.criarContato('5521999999999@c.us', 'Jorge Pereira');
        for (const [args, opcoes, destino] of [
            ['-copy-to /Jorge Pereira/', {}, '5521999999999@c.us'],
            ['-copy-to "Família"', {}, bot.GRUPO],
            ['-copy-to +5521999999999', {}, '5521999999999@c.us'],
            ['-copy-to @5521999999999', { mencoes: ['5521999999999@c.us'] },
                '5521999999999@c.us'],
            ['-copy-to', { chat: bot.OUTRO.jid }, bot.OUTRO.jid]
        ]) {
            const [r] = await bot.responder(`/debug -on ${args}`, opcoes);
            assert.match(r, /Cópia:/);
            assert.equal(bot.getSetting('debug.copyTo'), destino);
        }
    });

    test('destino ambíguo permite escolher; email não altera o estado', async () => {
        bot.criarContato('5521999999991@c.us', 'Jorge A');
        bot.criarContato('5521999999992@c.us', 'Jorge B');
        await bot.responderEscolhendo('/debug -on -copy-to Jorge', 2);
        assert.equal(bot.getSetting('debug.copyTo'), '5521999999992@c.us');
        const [r] = await bot.responder('/debug -on -lvl 3 -copy-to jorge@exemplo.com');
        assert.match(r, /não e-mail/);
        assert.equal(bot.getSetting('debug.level'), 0);
        assert.equal(bot.getSetting('debug.copyTo'), '5521999999992@c.us');
    });

    test('desligar limpa filtro, destino e fila; reativar mantém nível sem cópia', async () => {
        await configurar('-on -lvl 3 -filter /sapato/ -copy-to');
        printDebug('sapato pendente');
        assert.deepEqual(await bot.responder('/debug -off'), ['🪲 Debug Desativado.']);
        await flushCopiasDebug();
        assert.equal(copias().length, 0);
        assert.equal(bot.getSetting('debug.filter'), '');
        assert.equal(bot.getSetting('debug.copyTo'), '');
        assert.equal(bot.getSetting('debug.level'), 3);
        await configurar('-on -lvl 3 -filter /@newsletter/');
        printDebug('@newsletter');
        await flushCopiasDebug();
        assert.equal(copias().length, 0);
    });

    test('falha de envio pausa cópia; configurar permite retomar', async (t) => {
        await configurar('-on -copy-to -filter /marcador|Cópia dos logs/');
        const original = bot.client.sendMessage;
        const mock = t.mock.method(bot.client, 'sendMessage', async () => {
            throw new Error('sem conexão');
        });
        printDebug('marcador');
        await flushCopiasDebug();
        assert.equal(mock.mock.calls.length, 1);
        printDebug('marcador de novo');
        await flushCopiasDebug();
        assert.equal(mock.mock.calls.length, 1);
        assert.match(textoLogs(), /Cópia dos logs pausada/);
        mock.mock.restore();
        assert.equal(bot.client.sendMessage, original);
        await configurar('-copy-to');
        printDebug('marcador recuperado');
        await flushCopiasDebug();
        assert.match(copias().at(-1).content, /recuperado/);
    });

    test('fila limitada descarta os logs mais antigos e divide mensagens grandes', async () => {
        await configurar('-on -copy-to -filter /marcador/');
        for (let i = 0; i < 510; i++) printDebug(`marcador ${i}`);
        await flushCopiasDebug();
        const texto = copias().map(e => e.content).join('\n');
        assert.match(texto, /10 blocos descartados/);
        assert.doesNotMatch(texto, /marcador 0\n/);
        assert.match(texto, /marcador 509/);
        assert.ok(copias().every(e => e.content.length < 3200));
    });

    test('logs do boot aguardam a conexão pronta sem pausar a cópia', async () => {
        await configurar('-on -copy-to -filter /marcador/');
        bot.estado.pronto = false;
        printDebug('marcador durante o boot');
        await flushCopiasDebug();
        assert.equal(copias().length, 0);
        bot.estado.pronto = true;
        await flushCopiasDebug();
        assert.match(copias().at(-1).content, /durante o boot/);
    });

    test('troca de destino durante um envio mantém os logs novos na nova fila', async (t) => {
        await configurar('-on -copy-to -filter /marcador/');
        let liberar;
        const original = bot.client.sendMessage;
        t.mock.method(bot.client, 'sendMessage', async (...args) => {
            await new Promise(resolve => { liberar = resolve; });
            return original.apply(bot.client, args);
        });
        printDebug('marcador antigo');
        const pendente = flushCopiasDebug();
        limparCopiasDebug();
        await bot.setSetting('debug.copyTo', bot.OUTRO.jid);
        printDebug('marcador novo');
        liberar();
        await pendente;
        t.mock.restoreAll();
        await flushCopiasDebug();
        assert.equal(copias().at(-1).chatId, bot.OUTRO.jid);
        assert.match(copias().at(-1).content, /marcador novo/);
        assert.doesNotMatch(copias().at(-1).content, /marcador antigo/);
    });
});

describe('instrumentação', () => {
    test('preserva this, retorno síncrono, promises e erros; rastreia uma vez', async () => {
        await configurar('-on -lvl 3');
        const erro = new Error('falhou');
        const objeto = {
            numero: 7,
            somar(n) { return this.numero + n; },
            async esperar() { return this.numero; },
            falhar() { throw erro; },
            async rejeitar() { throw erro; },
            falharSemErro() { throw 0; },
            async rejeitarSemErro() { throw undefined; }
        };
        instrumentarObjeto(objeto, 'exemplo', 1);
        instrumentarObjeto(objeto, 'exemplo', 1);
        assert.equal(objeto.somar(2), 9);
        assert.equal(await objeto.esperar(), 7);
        assert.throws(() => objeto.falhar(), e => e === erro);
        await assert.rejects(objeto.rejeitar(), e => e === erro);
        assert.throws(() => objeto.falharSemErro(), e => e === 0);
        await assert.rejects(objeto.rejeitarSemErro(), e => e === undefined);
        assert.equal(bot.logs.filter(l => /exemplo.falhar erro/.test(l)).length, 1);
        assert.equal(bot.logs.filter(l => /exemplo.rejeitar erro/.test(l)).length, 1);
    });

    test('credenciais não vazam; objetos circulares, getters e buffers são resumidos', async () => {
        await configurar('-on -lvl 3 -copy-to -filter /marcador/');
        process.env.DEBUG_TEST_TOKEN = 'segredo-do-ambiente';
        try {
            await bot.setSetting('openai.api.key', 'segredo-da-setting');
            const dados = { password: 'novo-segredo', valor: Buffer.alloc(100),
                get pesado() { throw new Error('getter não pode executar'); } };
            dados.circular = dados;
            printDebugNivel(3, 'marcador', dados, 'segredo-do-ambiente', 'segredo-da-setting',
                'https://api.test/?token=segredo-query&pagina=2',
                { headers: { Authorization: 'Bearer segredo-header' } });
            printDebug('marcador /set giphy.api.key segredo-novo');
            await flushCopiasDebug();
            assert.doesNotMatch(textoLogs(), /novo-segredo|segredo-(do|da|query|header|novo)/);
            assert.match(textoLogs(), /oculto/);
            assert.match(textoLogs(), /Buffer 100 bytes/);
            assert.match(textoLogs(), /circular/);
            assert.match(textoLogs(), /getter/);
            assert.ok(copias().length > 0);
            assert.doesNotMatch(copias().map(e => e.content).join('\n'), /segredo-/);
            assert.equal(dados.password, 'novo-segredo');
        } finally {
            delete process.env.DEBUG_TEST_TOKEN;
        }
    });

    test('escopo sem rastro impede instrumentação e cópia durante o envio', async () => {
        await configurar('-on -lvl 3 -copy-to');
        await comContextoDebug({ semRastro: true }, async () => {
            printDebug('não aparece');
            await bot.client.getContacts();
        });
        await flushCopiasDebug();
        assert.equal(bot.logs.length, 0);
        assert.equal(copias().length, 0);
    });

    test('ocultar uma setting sensível preserva o contexto usado no filtro', async () => {
        await configurar('-on -lvl 1 -filter /chatName.*Jorge/');
        comContextoDebug({ chatId: bot.GRUPO, chatName: 'Jorge' }, () => {
            printDebug('/set openai.api.key segredo-temporario');
        });
        assert.equal(bot.logs.length, 1);
        assert.match(textoLogs(), /chatName=Jorge/);
        assert.doesNotMatch(textoLogs(), /segredo-temporario/);
    });
});
