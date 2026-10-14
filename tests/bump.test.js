/*
 * Executa o fluxo de versão em repositórios temporários, sem tocar nas tags do projeto.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

for (const tagExistente of [false, true]) {
    test(`bump publica os exemplos corretos; tag atual existente: ${tagExistente}`, t => {
        const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'zapbot-bump-'));
        t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));
        const env = {
            ...process.env, GIT_AUTHOR_NAME: 'Teste', GIT_AUTHOR_EMAIL: 'teste@example.com',
            GIT_COMMITTER_NAME: 'Teste', GIT_COMMITTER_EMAIL: 'teste@example.com'
        };
        const executar = (cmd, args) => execFileSync(cmd, args, {
            cwd: raiz, env, encoding: 'utf8', timeout: 15000
        });
        const git = (...args) => executar('git', args);
        fs.copyFileSync(path.join(__dirname, '..', 'bump.sh'), path.join(raiz, 'bump.sh'));
        fs.mkdirSync(path.join(raiz, 'docs'));
        fs.writeFileSync(path.join(raiz, 'package.json'), '{"version":"2.2.0"}\n');
        fs.writeFileSync(path.join(raiz, 'package-lock.json'),
            '{"version":"2.2.0","packages":{"":{"version":"2.2.0"}}}\n');
        const exemplo = 'ZapBot 2.2.0 (devel) (git+abc1234/HEAD)\n';
        const historico = 'https://github.com/jpereira/zapbot/releases/tag/v2.1.0\n';
        const node = '• Node.js: v24.9.0\n';
        fs.writeFileSync(path.join(raiz, 'README.md'),
            'hoje a `v2.1.0`\ngit checkout v2.1.0\n' + exemplo + historico + node);
        fs.writeFileSync(path.join(raiz, 'docs', 'instalacao.md'),
            '`v2.1.0` (de 02/10/2026)\n' + exemplo);
        git('init', '-q');
        git('config', 'commit.gpgsign', 'false');
        git('config', 'tag.gpgsign', 'false');
        git('add', '.');
        const mensagem = path.join(raiz, '.git', 'fixture-message');
        fs.writeFileSync(mensagem, 'Fixture\n');
        assert.equal(executar('awk', ['length > 100', mensagem]), '');
        git('commit', '-q', '-F', mensagem);
        git('tag', 'v2.1.0');
        if (tagExistente) git('tag', 'v2.2.0');
        const original = git('rev-parse', 'HEAD').trim();
        executar('bash', ['bump.sh', '--dry-run']);
        assert.equal(git('rev-parse', 'HEAD').trim(), original);
        assert.equal(git('status', '--porcelain'), '');
        executar('bash', ['bump.sh']);
        const ler = nome => fs.readFileSync(path.join(raiz, nome), 'utf8');
        assert.equal(JSON.parse(ler('package.json')).version, '2.2.1');
        assert.equal(JSON.parse(ler('package-lock.json')).packages[''].version, '2.2.1');
        assert.match(ler('README.md'), /ZapBot 2\.2\.1 \(devel\) \(git\+abc1234\/HEAD\)/);
        assert.ok(ler('README.md').includes(historico));
        assert.ok(ler('README.md').includes(node));
        if (tagExistente) {
            assert.equal(git('rev-parse', 'v2.2.0').trim(), original);
            executar('bash', ['bump.sh']);
            const publicado = git('show', 'v2.2.1:README.md');
            assert.match(publicado, /hoje a `v2\.2\.1`/);
            assert.match(publicado, /git checkout v2\.2\.1\n/);
            assert.match(publicado, /ZapBot 2\.2\.1 \(git\+abc1234\/v2\.2\.1\)/);
            assert.ok(publicado.includes(node));
            assert.doesNotMatch(publicado, /\(devel\)/);
            assert.match(ler('README.md'), /ZapBot 2\.2\.2 \(devel\)/);
            executar('bash', ['bump.sh', '--minor']);
            assert.equal(JSON.parse(ler('package.json')).version, '2.3.0');
            assert.match(git('show', 'v2.2.2:docs/instalacao.md'), /`v2\.2\.2` \(de \d{2}\/\d{2}\/\d{4}\)/);
            executar('bash', ['bump.sh', '--major']);
            assert.equal(JSON.parse(ler('package.json')).version, '3.0.0');
            assert.match(ler('README.md'), /hoje a `v2\.3\.0`/);
        } else {
            const publicado = git('show', 'v2.2.0:README.md');
            assert.match(publicado, /hoje a `v2\.2\.0`/);
            assert.match(publicado, /ZapBot 2\.2\.0 \(git\+abc1234\/v2\.2\.0\)/);
            assert.doesNotMatch(publicado, /\(devel\)/);
        }
        assert.equal(git('status', '--porcelain'), '');
        const mensagens = git('log', '--format=%B').split('\n');
        assert.ok(mensagens.every(linha => Buffer.byteLength(linha) <= 100));
    });
}
