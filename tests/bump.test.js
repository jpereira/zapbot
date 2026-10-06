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
        fs.writeFileSync(path.join(raiz, 'package.json'), '{"version":"2.2"}\n');
        fs.writeFileSync(path.join(raiz, 'package-lock.json'),
            '{"version":"2.2","packages":{"":{"version":"2.2"}}}\n');
        const exemplo = 'ZapBot 2.2 (devel) (git+abc1234/HEAD)\n';
        const historico = 'https://github.com/jpereira/zapbot/releases/tag/release-2.1\n';
        fs.writeFileSync(path.join(raiz, 'README.md'),
            'hoje a `release-2.1`\ngit checkout release-2.1\n' + exemplo + historico);
        fs.writeFileSync(path.join(raiz, 'docs', 'instalacao.md'),
            '`release-2.1` (de 02/10/2026)\n' + exemplo);
        git('init', '-q');
        git('config', 'commit.gpgsign', 'false');
        git('config', 'tag.gpgsign', 'false');
        git('add', '.');
        const mensagem = path.join(raiz, '.git', 'fixture-message');
        fs.writeFileSync(mensagem, 'Fixture\n');
        assert.equal(executar('awk', ['length > 100', mensagem]), '');
        git('commit', '-q', '-F', mensagem);
        git('tag', 'release-2.1');
        if (tagExistente) git('tag', 'release-2.2');
        const original = git('rev-parse', 'HEAD').trim();
        executar('bash', ['bump.sh', '--dry-run']);
        assert.equal(git('rev-parse', 'HEAD').trim(), original);
        assert.equal(git('status', '--porcelain'), '');
        executar('bash', ['bump.sh']);
        const ler = nome => fs.readFileSync(path.join(raiz, nome), 'utf8');
        assert.equal(JSON.parse(ler('package.json')).version, '2.3');
        assert.equal(JSON.parse(ler('package-lock.json')).packages[''].version, '2.3');
        assert.match(ler('README.md'), /ZapBot 2\.3 \(devel\) \(git\+abc1234\/HEAD\)/);
        assert.ok(ler('README.md').includes(historico));
        if (tagExistente) {
            assert.equal(git('rev-parse', 'release-2.2').trim(), original);
            executar('bash', ['bump.sh']);
            const publicado = git('show', 'release-2.3:README.md');
            assert.match(publicado, /hoje a `release-2\.3`/);
            assert.match(publicado, /ZapBot 2\.3 \(git\+abc1234\/release-2\.3\)/);
            assert.doesNotMatch(publicado, /\(devel\)/);
            assert.match(ler('README.md'), /ZapBot 2\.4 \(devel\)/);
        } else {
            const publicado = git('show', 'release-2.2:README.md');
            assert.match(publicado, /ZapBot 2\.2 \(git\+abc1234\/release-2\.2\)/);
            assert.doesNotMatch(publicado, /\(devel\)/);
        }
        assert.equal(git('status', '--porcelain'), '');
        const mensagens = git('log', '--format=%B').split('\n');
        assert.ok(mensagens.every(linha => Buffer.byteLength(linha) <= 100));
    });
}
