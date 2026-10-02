/*
 * Utilitários: formatação, contatos/@lid, nomes de grupos e menções, uptime
 * e a mensagem de erro dos comandos.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OUTRO } = bot;
const { paraMs, plural, resumirTexto, fmtNum, formatarData } = bot.src('util/formatar');
const contatos = bot.src('contatos');
const { getBotUptime } = bot.src('log');
const { formatarErroComando } = bot.src('comandos/base');
const { humanSize, nomeSeguro, isCaminhoDeMidia, obterPastaMidia } = bot.src('util/arquivos');

beforeEach(bot.reiniciar);

describe('formatação', () => {
    test('paraMs aceita segundos (WhatsApp) e milissegundos', () => {
        assert.equal(paraMs(1_790_000_000), 1_790_000_000_000);
        assert.equal(paraMs(1_790_000_000_000), 1_790_000_000_000);
    });

    test('formatarData no fuso de São Paulo', () => {
        assert.equal(formatarData(Date.UTC(2026, 8, 30, 2, 30)), '29/09/2026, 23:30:00');
    });

    test('plural, números e resumo de texto', () => {
        assert.equal(plural(1, 'dia', 'dias'), '1 dia');
        assert.equal(plural(0, 'dia', 'dias'), '0 dias');
        assert.equal(fmtNum(12345), '12.345');
        assert.equal(resumirTexto('  a \n  b  '), 'a b');
        assert.equal(resumirTexto('x'.repeat(10), 5), 'xxxx…');
        assert.equal(resumirTexto(null), '');
    });

    test('tempo no ar: dias, horas e minutos; segundos só no começo', () => {
        const agora = Date.now();
        assert.equal(getBotUptime(agora - 5_000), '5 segundos');
        assert.equal(getBotUptime(agora - 61_000), '1 minuto, 1 segundo');
        assert.equal(getBotUptime(agora - (2 * 86400 + 3 * 3600 + 60) * 1000), '2 dias, 3 horas, 1 minuto');
    });

    test('erro dos comandos com o comando e a causa', () => {
        const erro = new Error('Falhou', { cause: { cmd: 'yt-dlp x', inner: new Error('exit 1') } });
        assert.equal(formatarErroComando(erro), '⚠️💥 Falhou.\n🛠️ *Cmd*:    yt-dlp x\n⛓️‍💥 *Inner*:  exit 1\n');
    });
});

describe('arquivos do cache', () => {
    test('tamanhos legíveis', () => {
        assert.equal(humanSize(512), '512 B');
        assert.equal(humanSize(1536), '1.50 KB');
        assert.equal(humanSize(5 * 1024 * 1024), '5.00 MB');
        assert.equal(humanSize(3 * 1024 ** 3), '3.00 GB');
    });

    test('nome de arquivo seguro e caminho dentro de cache/media', () => {
        assert.equal(nomeSeguro('../../etc/passwd', 'x'), 'etcpasswd');
        assert.equal(nomeSeguro('', 'padrao'), 'padrao');
        assert.equal(isCaminhoDeMidia(`${obterPastaMidia()}/a.jpg`), true);
        assert.equal(isCaminhoDeMidia('/etc/passwd'), false);
        assert.equal(isCaminhoDeMidia(null), false);
    });
});

describe('contatos', () => {
    test('números e JIDs', () => {
        assert.equal(contatos.normalizerPhoneNumber('+55 (21) 99999-0000'), '5521999990000');
        assert.equal(contatos.isPhoneNumber('+55 21 99999-0000'), true);
        assert.equal(contatos.isPhoneNumber('123'), false);
        assert.equal(contatos.normalizeWid('5521:3@lid'), '5521@c.us');
        assert.equal(contatos.removeDeviceSuffix('123:93@lid'), '123@lid');
        assert.equal(contatos.removeDeviceSuffix('5521@c.us'), '5521@c.us');
        assert.equal(contatos.removeDeviceSuffix(null), null);
    });

    test('@lid vira telefone (com cache); desconhecido fica null', async () => {
        bot.client.lids.set('555@lid', OUTRO.jid);
        assert.equal(await contatos.resolveLidToPhone('555:7@lid'), OUTRO.jid);
        bot.client.lids.clear();
        assert.equal(await contatos.resolveLidToPhone('555@lid'), OUTRO.jid, 'veio do cache');
        assert.equal(await contatos.resolveLidToPhone('666@lid'), null);
        assert.equal(await contatos.resolveLidToPhone('5521@c.us'), '5521@c.us');
    });

    test('idsDoChatAtual inclui o telefone de um chat @lid', async () => {
        bot.client.lids.set('888@lid', OUTRO.jid);
        assert.deepEqual(await contatos.idsDoChatAtual('888@lid'), ['888@lid', OUTRO.jid]);
        assert.deepEqual(await contatos.idsDoChatAtual(bot.GRUPO), [bot.GRUPO]);
    });

    test('nome do grupo pelo id; não-grupo é null', async () => {
        bot.criarGrupo('120363000000000009@g.us', 'Churrasco');
        assert.equal(await contatos.resolverNomeDoGrupo('120363000000000009@g.us'), 'Churrasco');
        assert.equal(await contatos.resolverNomeDoGrupo(OUTRO.jid), null);
        assert.equal(await contatos.resolverNomeDoGrupo('120363000000000099@g.us'), null);
    });

    test('menções cruas viram o nome do contato', async () => {
        assert.equal(await contatos.resolverMencoes(`oi @${OUTRO.user}`, [OUTRO.jid]), 'oi @Fulano');

        bot.client.lids.set('4444444@lid', '5521933333333@c.us');
        assert.equal(await contatos.resolverMencoes('oi @4444444'), 'oi @+5521933333333', 'sem contato: o telefone');
        assert.equal(await contatos.resolverMencoes('oi @123', []), 'oi @123', 'curto demais: não é menção');
    });
});

describe('versão com o commit (versao.js)', () => {
    const { lerCommit } = bot.src('versao');
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const HASH = '25b0870123456789abcdef0123456789abcdef01';

    // Um projeto falso com os arquivos do .git que a imagem Docker leva
    function projeto(arquivos) {
        const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'zapbot-git-'));
        for (const [arquivo, conteudo] of Object.entries(arquivos)) {
            fs.mkdirSync(path.dirname(path.join(raiz, '.git', arquivo)), { recursive: true });
            fs.writeFileSync(path.join(raiz, '.git', arquivo), conteudo);
        }
        return raiz;
    }

    const TAG = '1111111111111111111111111111111111111111';     // o objeto "tag" de uma tag anotada
    const c = (commit, ref) => ({ commit: commit.slice(0, 7), ref });

    test('branch (em refs/heads ou no packed-refs): o commit e HEAD; sem .git: null', () => {
        assert.deepEqual(lerCommit(projeto({ HEAD: 'ref: refs/heads/main\n', 'refs/heads/main': `${HASH}\n` })), c(HASH, 'HEAD'));
        assert.deepEqual(lerCommit(projeto({ HEAD: 'ref: refs/heads/main\n', 'packed-refs': `# pack-refs\n${'f'.repeat(40)} refs/heads/outro\n${HASH} refs/heads/main\n` })), c(HASH, 'HEAD'));
        assert.equal(lerCommit(projeto({ HEAD: 'ref: refs/heads/sumiu\n' })), null);
        assert.equal(lerCommit(fs.mkdtempSync(path.join(os.tmpdir(), 'zapbot-sem-git-'))), null);
    });

    test('HEAD destacado numa tag: lightweight, anotada no packed-refs, anotada solta (pelo objeto ou pelo reflog)', () => {
        // Lightweight: a ref aponta para o commit
        assert.deepEqual(lerCommit(projeto({ HEAD: `${HASH}\n`, 'refs/tags/release-2.0': `${HASH}\n` })), c(HASH, 'release-2.0'));

        // Anotada num clone: "^<commit>" na linha seguinte do packed-refs
        assert.deepEqual(lerCommit(projeto({ HEAD: `${HASH}\n`, 'packed-refs': `# pack-refs with: peeled\n${TAG} refs/tags/release-2.0\n^${HASH}\n` })),
            c(HASH, 'release-2.0'));

        // Anotada solta, com o objeto (fora do Docker)
        const objeto = require('zlib').deflateSync(Buffer.from(`tag 100\0object ${HASH}\ntype commit\ntag release-2.1\n`));
        assert.deepEqual(lerCommit(projeto({ HEAD: `${HASH}\n`, 'refs/tags/release-2.1': `${TAG}\n`, [`objects/11/${TAG.slice(2)}`]: objeto })),
            c(HASH, 'release-2.1'));

        // Anotada solta, sem o objeto (a imagem Docker): o último checkout do reflog, se foi para este commit
        const reflog = (para) => `${'0'.repeat(40)} ${para} Fulano <f@x> 1790000000 -0300\tcheckout: moving from main to release-2.1\n`;
        assert.deepEqual(lerCommit(projeto({ HEAD: `${HASH}\n`, 'refs/tags/release-2.1': `${TAG}\n`, 'logs/HEAD': reflog(HASH) })), c(HASH, 'release-2.1'));
        assert.deepEqual(lerCommit(projeto({ HEAD: `${HASH}\n`, 'refs/tags/release-2.1': `${TAG}\n`, 'logs/HEAD': reflog('f'.repeat(40)) })), c(HASH, 'HEAD'),
            'o reflog foi para outro commit');

        // Destacado num commit sem tag; duas tags no mesmo commit: a de maior versão
        assert.deepEqual(lerCommit(projeto({ HEAD: `${HASH}\n` })), c(HASH, 'HEAD'));
        assert.deepEqual(lerCommit(projeto({ HEAD: `${HASH}\n`, 'refs/tags/release-1.9': `${HASH}\n`, 'refs/tags/release-1.10': `${HASH}\n` })), c(HASH, 'release-1.10'));
    });

    test('ZAPBOT_COMMIT tem prioridade ("commit" ou "commit/ref")', () => {
        try {
            process.env.ZAPBOT_COMMIT = 'abcdef0123456789';
            assert.deepEqual(lerCommit(projeto({ HEAD: `${HASH}\n` })), { commit: 'abcdef0', ref: 'HEAD' });
            process.env.ZAPBOT_COMMIT = 'abcdef0123456789/release-2.0';
            assert.deepEqual(lerCommit(projeto({ HEAD: `${HASH}\n` })), { commit: 'abcdef0', ref: 'release-2.0' });
        } finally {
            delete process.env.ZAPBOT_COMMIT;
        }
    });
});
