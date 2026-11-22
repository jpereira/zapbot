/*
 * .zb files (src/zb.js): the format, the one-time load on boot and /alias -examples.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { parseZb, listExampleFiles, loadNewExamples } = bot.src('zb');

beforeEach(bot.restart);

describe('parseZb', () => {
    test('comentário com #, linha em branco, bloco com linhas recuadas', () => {
        const blocks = parseZb([
            '# a comment', '', '/alias /a /batch -q', '    /tts -q $@', '  # a comment inside the block', '    /ping', '',
            '/alias /b /me hi'
        ].join('\n'));
        assert.deepEqual(blocks, ['/alias /a /batch -q\n    /tts -q $@\n    /ping', '/alias /b /me hi']);
    });

    test('\\ no fim da linha junta com a próxima (um espaço só); \\# no começo é um # de verdade', () => {
        assert.deepEqual(parseZb('/alias /x -d "d" \\\n    /notes \\\n   texto\n/alias /y /batch\n    \\#home\n    /ping'), ['/alias /x -d "d" /notes texto', '/alias /y /batch\n    #home\n    /ping']);
    });

    test('o que vem antes do primeiro comando é ignorado; CRLF vale', () => {
        assert.deepEqual(parseZb('lixo\r\n/alias /a /ping\r\n'), ['/alias /a /ping']);
    });

    test('linha em branco no meio do bloco fica (parágrafos de um /me); no fim do bloco some', () => {
        assert.deepEqual(parseZb('/alias -q /end /me\n\nRua A, 1\n\nMapa: http://x\n\n\n/alias /b /ping'), ['/alias -q /end /me\n\nRua A, 1\n\nMapa: http://x', '/alias /b /ping']);
    });

    test('o texto do # no meio da linha fica (/notes #ideas)', () => {
        assert.deepEqual(parseZb('/alias /idea /notes #ideas $@'), ['/alias /idea /notes #ideas $@']);
    });
});

describe('carga dos exemplos', () => {
    let dir;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zapbot-zb-'));
        process.env.ZAPBOT_EXAMPLES_DIR = dir;
    });
    afterEach(() => {
        delete process.env.ZAPBOT_EXAMPLES_DIR;
        fs.rmSync(dir, { recursive: true, force: true });
    });
    const write = (name, text) => fs.writeFileSync(path.join(dir, `${name}.zb`), text);
    const names = async () => (await bot.dbAll('SELECT name FROM command_aliases ORDER BY name')).map(r => r.name);

    test('no boot carrega uma vez só: o alias que você apagou não volta', async () => {
        write('um', '# x\n/alias /ex1 /ping\n/alias -q /ex2 /batch -q\n    /ping\n');
        assert.deepEqual(await loadNewExamples(), ['um']);
        assert.deepEqual(await names(), ['/ex1', '/ex2']);
        assert.deepEqual(bot.getSetting('alias.examples'), ['um']);

        await bot.replyAlt('/alias -rm /ex1');
        assert.deepEqual(await loadNewExamples(), [], 'o arquivo já foi carregado');
        assert.deepEqual(await names(), ['/ex2']);

        write('dois', '/alias /ex3 /uptime');
        assert.deepEqual(await loadNewExamples(), ['dois'], 'arquivo novo carrega');
        assert.deepEqual(await names(), ['/ex2', '/ex3']);
    });

    test('/alias -examples <arquivo> -yes: troca os que já existem pela definição do arquivo (sem ele, ficam e a dica avisa)', async () => {
        write('um', '/alias /ex1 -desc "novo" /uptime\n/alias /ex2 /ping');
        await bot.replyAlt('/alias /ex1 /ping');
        const [kept] = await bot.replyAlt('/alias -examples um');
        assert.match(kept, /✅ \*um\*: 1 alias carregado\(s\): \/ex2/);
        assert.match(kept, /↪️ 1 já existiam e ficaram como estavam: \/ex1\n💡 _Para trocá-los pelos do arquivo: \/alias -examples um -yes_/);
        const row = () => bot.dbGet("SELECT command, description FROM command_aliases WHERE name = '/ex1'");
        assert.deepEqual(await row(), { command: '/ping', description: '' });

        const [replaced] = await bot.replyAlt('/alias -examples um -yes');
        assert.match(replaced, /🔄 2 trocados pelos do arquivo: \/ex1, \/ex2/);
        assert.deepEqual(await row(), { command: '/uptime', description: 'novo' });
        // the flag may come before the name
        await bot.replyAlt('/alias /ex1 /ping');
        assert.match((await bot.replyAlt('/alias -ex -y um'))[0], /🔄 2 trocados/);
        assert.equal((await row()).command, '/uptime');
        // ... or before the -examples, in any form
        for (const typed of ['/alias -y -ex um', '/alias -yes -examples um', '/alias -y -ex um -yes', '/alias -ex um -y']) {
            await bot.replyAlt('/alias /ex1 /ping');
            assert.match((await bot.replyAlt(typed))[0], /🔄 2 trocados/, typed);
            assert.equal((await row()).command, '/uptime', typed);
        }
        // -yes without a file only lists
        assert.match((await bot.replyAlt('/alias -y -ex'))[0], /📂 \*Arquivos de exemplos\*/);
    });

    test('"# @manual" no começo: não carrega no boot, aparece como "só na mão" e carrega com /alias -examples', async () => {
        write('auto', '/alias /ex1 /ping');
        write('manual', '# a file\n# @manual\n/alias /ex2 /uptime');
        assert.deepEqual(await loadNewExamples(), ['auto']);
        assert.deepEqual(await names(), ['/ex1']);
        assert.match((await bot.replyAlt('/alias -examples'))[0], /⬜ manual \(só na mão\)/);
        assert.match((await bot.replyAlt('/alias -examples manual'))[0], /✅ \*manual\*: 1 alias/);
        assert.deepEqual(await names(), ['/ex1', '/ex2']);
    });

    test('alias que já existe não é sobrescrito; bloco que não é /alias não roda', async () => {
        await bot.replyAlt('/alias /ex1 /uptime');
        write('um', '/alias /ex1 /ping\n/ping\n/alias /ex2 /naoexiste');
        await loadNewExamples();
        assert.equal((await bot.dbGet("SELECT command FROM command_aliases WHERE name = '/ex1'")).command, '/uptime');
        assert.deepEqual(await names(), ['/ex1']);
    });

    test('/alias -examples lista (✅/⬜) e com o nome carrega, sem mexer no que existe', async () => {
        write('um', '/alias /ex1 /ping\n/alias /ex2 /uptime');
        assert.match((await bot.replyAlt('/alias -examples'))[0], /⬜ um/);
        const [loaded] = await bot.replyAlt('/alias -examples um');
        assert.match(loaded, /✅ \*um\*: 2 alias carregado\(s\): \/ex1, \/ex2/);
        assert.match((await bot.replyAlt('/alias -ex'))[0], /✅ um/);
        const [again] = await bot.replyAlt('/alias -examples um.zb');
        assert.match(again, /0 alias carregado/);
        assert.match(again, /2 já existiam/);
        assert.match((await bot.replyAlt('/alias -examples nada'))[0], /❌ Não existe o arquivo de exemplos "nada"\. Disponíveis: um/);
    });
});

describe('segurança: um .zb só registra atalhos', () => {
    const { aliasNameOf, MAX_BLOCKS, MAX_FILE_BYTES, loadExample } = bot.src('zb');
    let dir;
    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zapbot-zb-'));
        process.env.ZAPBOT_EXAMPLES_DIR = dir;
    });
    afterEach(() => {
        delete process.env.ZAPBOT_EXAMPLES_DIR;
        fs.rmSync(dir, { recursive: true, force: true });
    });
    const names = async () => (await bot.dbAll('SELECT name FROM command_aliases ORDER BY name')).map(r => r.name);

    test('as opções do /alias que mexem em outros atalhos (-rm, -move, -list, -examples) não rodam', async () => {
        for (const block of ['/alias -rm all', '/alias -rm /dolar', '/alias -m /dolar /pwned', '/alias -move /dolar /pwned', '/alias -list',
            '/alias -examples tts-voices', '/alias /x -rm /ping', '/alias /x', '/alias /x -d "só a descrição"', '/ping', '/set bot.admins 5511999999999']) {
            assert.equal(aliasNameOf(block), null, block);
        }
        assert.equal(aliasNameOf('/alias -q /x /ping'), '/x');
        assert.equal(aliasNameOf('/alias /x -desc "d" -q /ping'), '/x');
    });

    test('um arquivo malicioso não apaga nem renomeia os atalhos que você já tem', async () => {
        await bot.replyAlt('/alias /dolar /stocks USD');
        await bot.replyAlt('/alias /btc /crypto BTC');
        fs.writeFileSync(path.join(dir, 'evil.zb'), '/alias -m /dolar /pwned\n/alias -rm all\n/alias /dolar -d "pwned"\n/alias /ok /ping\n');
        const r = await loadExample(listExampleFiles()[0]);
        assert.deepEqual(await names(), ['/btc', '/dolar', '/ok']);
        assert.equal((await bot.dbGet("SELECT command FROM command_aliases WHERE name = '/dolar'")).command, '/stocks USD');
        assert.equal((await bot.dbGet("SELECT description FROM command_aliases WHERE name = '/dolar'")).description, '');
        assert.deepEqual(r.failed.map(f => f.name), ['block 1', 'block 2', 'block 3'], 'o que recusou não repete a linha do arquivo');
        assert.deepEqual(r.loaded, ['/ok']);
    });

    test('link simbólico (para um segredo) e arquivo grande não são lidos', async () => {
        fs.writeFileSync(path.join(dir, 'secret.txt'), '/api-key=SUPERSECRET\n');
        fs.symlinkSync(path.join(dir, 'secret.txt'), path.join(dir, 'leak.zb'));
        fs.writeFileSync(path.join(dir, 'big.zb'), `/alias /a /ping\n${'# x\n'.repeat(MAX_FILE_BYTES / 4)}`);
        assert.deepEqual(listExampleFiles(), []);
        assert.match((await bot.replyAlt('/alias -examples leak'))[0], /Não existe o arquivo de exemplos/);
        assert.deepEqual(await loadNewExamples(), []);
        // and if the file becomes a link after it was listed
        fs.writeFileSync(path.join(dir, 'ok.zb'), '/alias /ok /ping');
        const [example] = listExampleFiles();
        fs.rmSync(example.file);
        fs.symlinkSync(path.join(dir, 'secret.txt'), example.file);
        const r = await loadExample(example);
        assert.match(r.failed[0].error, /not read/);
        assert.doesNotMatch(JSON.stringify(r), /SUPERSECRET|api-key/);
    });

    test('limite de blocos por arquivo e de tamanho de um bloco', async () => {
        fs.writeFileSync(path.join(dir, 'many.zb'), Array.from({ length: MAX_BLOCKS + 1 }, (_, i) => `/alias /a${i} /ping`).join('\n'));
        const r = await loadExample(listExampleFiles()[0]);
        assert.deepEqual(await names(), []);
        assert.match(r.failed[0].error, /the limit is 200/);
        fs.writeFileSync(path.join(dir, 'many.zb'), `/alias /long /me ${'x'.repeat(9000)}`);
        assert.match((await loadExample(listExampleFiles()[0])).failed[0].error, /longer than/);
    });

    test('nome de arquivo estranho (espaço, ponto, escape) não entra na lista', async () => {
        for (const f of ['.hidden.zb', 'a b.zb', '-rf.zb', 'x\u001b[31m.zb']) fs.writeFileSync(path.join(dir, f), '/alias /x /ping');
        assert.deepEqual(listExampleFiles(), []);
    });
});
