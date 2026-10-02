/*
 * Versão do bot com o commit que está rodando: "2.0 (git+25b0870)".
 */

const fs = require('fs');
const path = require('path');
const packageJson = require('../package.json');

const { ROOT_DIR } = require('./constantes');

/*
 * O commit vem, nesta ordem:
 *   1. de ZAPBOT_COMMIT (para quem monta a imagem de outro jeito, ex.: CI);
 *   2. do .git do projeto: o HEAD (no checkout de uma tag, já é o hash) ou o
 *      branch dele, em .git/refs/heads/ ou no .git/packed-refs. A imagem
 *      Docker leva só esses arquivos (veja o .dockerignore), então cada
 *      "docker compose build" grava o commit do código que foi para ela.
 * Lido uma vez, ao carregar: é o commit do código que está rodando, mesmo
 * que o repositório mude depois.
 */
const HASH = /^[0-9a-f]{40}$/;

function lerCommitDoGit(raiz = ROOT_DIR) {
    const git = path.join(raiz, '.git');
    const ler = (arquivo) => {
        try {
            return fs.readFileSync(path.join(git, arquivo), 'utf8').trim();
        } catch {
            return null;
        }
    };

    const head = ler('HEAD');
    if (!head) return null;
    if (HASH.test(head)) return head;

    const ref = head.match(/^ref:\s*(\S+)$/)?.[1];
    if (!ref) return null;

    const doRef = ler(ref);
    if (doRef && HASH.test(doRef)) return doRef;

    // Branch compactado: "<hash> refs/heads/main" no packed-refs
    const linha = (ler('packed-refs') ?? '').split('\n').find(l => l.endsWith(` ${ref}`));
    const doPacked = linha?.split(' ')[0];
    return doPacked && HASH.test(doPacked) ? doPacked : null;
}

function lerCommit(raiz = ROOT_DIR) {
    const doEnv = String(process.env.ZAPBOT_COMMIT ?? '').trim();
    const commit = doEnv || lerCommitDoGit(raiz);
    return commit ? commit.slice(0, 7) : null;
}

const COMMIT = lerCommit();

// "2.0 (git+25b0870)", ou só "2.0" sem o commit
const versaoComCommit = () => (COMMIT ? `${packageJson.version} (git+${COMMIT})` : packageJson.version);

module.exports = {
    COMMIT,
    lerCommit,
    versaoComCommit
};
