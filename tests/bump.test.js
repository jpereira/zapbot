/*
 * Runs the version flow in temporary repositories, without touching the project's tags.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

for (const tagExisting of [false, true]) {
    test(`bump publica os exemplos corretos; tag atual existente: ${tagExisting}`, t => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zapbot-bump-'));
        t.after(() => fs.rmSync(root, { recursive: true, force: true }));
        const env = {
            ...process.env, GIT_AUTHOR_NAME: 'Teste', GIT_AUTHOR_EMAIL: 'teste@example.com',
            GIT_COMMITTER_NAME: 'Teste', GIT_COMMITTER_EMAIL: 'teste@example.com'
        };
        const run = (cmd, args) => execFileSync(cmd, args, {
            cwd: root, env, encoding: 'utf8', timeout: 15000
        });
        const git = (...args) => run('git', args);
        fs.mkdirSync(path.join(root, 'scripts'));
        fs.copyFileSync(path.join(__dirname, '..', 'scripts', 'bump.sh'), path.join(root, 'scripts', 'bump.sh'));
        fs.mkdirSync(path.join(root, 'docs'));
        fs.writeFileSync(path.join(root, 'package.json'), '{"version":"2.2.0"}\n');
        fs.writeFileSync(path.join(root, 'package-lock.json'),
            '{"version":"2.2.0","packages":{"":{"version":"2.2.0"}}}\n');
        const example = 'ZapBot 2.2.0 (devel) (git+abc1234/HEAD)\n';
        const history = 'https://github.com/jpereira/zapbot/releases/tag/v2.1.0\n';
        const node = '• Node.js: v24.9.0\n';
        fs.writeFileSync(path.join(root, 'README.md'),
            'hoje a `v2.1.0`\ngit checkout v2.1.0\n' + example + history + node);
        fs.writeFileSync(path.join(root, 'docs', 'installation.md'),
            '`v2.1.0` (de 02/10/2026)\n' + example);
        git('init', '-q');
        git('config', 'commit.gpgsign', 'false');
        git('config', 'tag.gpgsign', 'false');
        git('add', '.');
        const messageAlt = path.join(root, '.git', 'fixture-message');
        fs.writeFileSync(messageAlt, 'Fixture\n');
        assert.equal(run('awk', ['length > 100', messageAlt]), '');
        git('commit', '-q', '-F', messageAlt);
        git('tag', 'v2.1.0');
        if (tagExisting) git('tag', 'v2.2.0');
        const original = git('rev-parse', 'HEAD').trim();
        run('bash', ['scripts/bump.sh', '--dry-run']);
        assert.equal(git('rev-parse', 'HEAD').trim(), original);
        assert.equal(git('status', '--porcelain'), '');
        run('bash', ['scripts/bump.sh']);
        const read = nameAlt => fs.readFileSync(path.join(root, nameAlt), 'utf8');
        assert.equal(JSON.parse(read('package.json')).version, '2.2.1');
        assert.equal(JSON.parse(read('package-lock.json')).packages[''].version, '2.2.1');
        assert.match(read('README.md'), /ZapBot 2\.2\.1 \(devel\) \(git\+abc1234\/HEAD\)/);
        assert.ok(read('README.md').includes(history));
        assert.ok(read('README.md').includes(node));
        if (tagExisting) {
            assert.equal(git('rev-parse', 'v2.2.0').trim(), original);
            run('bash', ['scripts/bump.sh']);
            const published = git('show', 'v2.2.1:README.md');
            assert.match(published, /hoje a `v2\.2\.1`/);
            assert.match(published, /git checkout v2\.2\.1\n/);
            assert.match(published, /ZapBot 2\.2\.1 \(git\+abc1234\/v2\.2\.1\)/);
            assert.ok(published.includes(node));
            assert.doesNotMatch(published, /\(devel\)/);
            assert.match(read('README.md'), /ZapBot 2\.2\.2 \(devel\)/);
            run('bash', ['scripts/bump.sh', '--minor']);
            assert.equal(JSON.parse(read('package.json')).version, '2.3.0');
            assert.match(git('show', 'v2.2.2:docs/installation.md'), /`v2\.2\.2` \(de \d{2}\/\d{2}\/\d{4}\)/);
            run('bash', ['scripts/bump.sh', '--major']);
            assert.equal(JSON.parse(read('package.json')).version, '3.0.0');
            assert.match(read('README.md'), /hoje a `v2\.3\.0`/);
        } else {
            const published = git('show', 'v2.2.0:README.md');
            assert.match(published, /hoje a `v2\.2\.0`/);
            assert.match(published, /ZapBot 2\.2\.0 \(git\+abc1234\/v2\.2\.0\)/);
            assert.doesNotMatch(published, /\(devel\)/);
        }
        assert.equal(git('status', '--porcelain'), '');
        const messages = git('log', '--format=%B').split('\n');
        assert.ok(messages.every(line => Buffer.byteLength(line) <= 100));
    });
}
