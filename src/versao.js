/*
 * Versão do bot com o commit que está rodando e de onde ele veio:
 * "2.0 (git+60315ed/release-2.0)" numa tag, "2.0 (git+60315ed/HEAD)" fora dela.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const packageJson = require('../package.json');

const { ROOT_DIR } = require('./constantes');

/*
 * O commit e a ref vêm, nesta ordem:
 *   1. de ZAPBOT_COMMIT ("60315ed" ou "60315ed/release-2.0"; sem a ref, HEAD),
 *      para quem monta a imagem de outro jeito (ex.: CI);
 *   2. do .git do projeto, lido sem o git: o HEAD (no checkout de uma tag, já é
 *      o hash) ou o branch dele, em .git/refs/heads/ ou no .git/packed-refs.
 *      A imagem Docker leva só esses arquivos, as tags e o reflog do HEAD (veja
 *      o .dockerignore), então cada "docker compose build" grava o commit e a
 *      tag do código que foi para ela.
 *
 * A tag é a que aponta para o commit do HEAD destacado (git checkout release-2.0).
 * Uma tag anotada (as do bump.sh) aponta para um objeto "tag", não para o
 * commit; o commit dela vem de um destes:
 *   - a linha "^<commit>" logo abaixo dela no packed-refs (num clone);
 *   - o próprio objeto em .git/objects (fora do Docker, onde o .git está inteiro);
 *   - a última linha do reflog (.git/logs/HEAD): "checkout: moving from main to
 *     release-2.0", com o commit para onde foi (depois de um git fetch --tags,
 *     a tag nova fica solta e o objeto não vai para a imagem).
 * Num branch, ou sem tag para o commit: "HEAD".
 *
 * Lido uma vez, ao carregar: é o do código que está rodando, mesmo que o
 * repositório mude depois.
 */
const HASH = /^[0-9a-f]{40}$/;

function leitorDoGit(raiz) {
    const git = path.join(raiz, '.git');
    return (arquivo, binario = false) => {
        try {
            const conteudo = fs.readFileSync(path.join(git, arquivo));
            return binario ? conteudo : conteudo.toString('utf8').trim();
        } catch {
            return null;
        }
    };
}

// As tags: nome → { ref (o que a ref aponta), commit (se já se sabe) }
function lerTags(ler, raiz) {
    const tags = new Map();

    // packed-refs: "<hash> refs/tags/X", e "^<commit>" na linha seguinte se X é anotada
    let ultima = null;
    for (const linha of (ler('packed-refs') ?? '').split('\n')) {
        const peeled = linha.match(/^\^([0-9a-f]{40})$/);
        if (peeled && ultima) {
            ultima.commit = peeled[1];
            continue;
        }

        const m = linha.match(/^([0-9a-f]{40}) refs\/tags\/(.+)$/);
        ultima = m ? { ref: m[1], commit: null } : null;
        if (m) tags.set(m[2], ultima);
    }

    // Tags soltas (vencem as do packed-refs com o mesmo nome)
    const pasta = path.join(raiz, '.git', 'refs', 'tags');
    const soltas = (dir, prefixo = '') => {
        let entradas = [];
        try {
            entradas = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const e of entradas) {
            const nome = `${prefixo}${e.name}`;
            if (e.isDirectory()) soltas(path.join(dir, e.name), `${nome}/`);
            else {
                const ref = ler(`refs/tags/${nome}`);
                if (ref && HASH.test(ref)) tags.set(nome, { ref, commit: null });
            }
        }
    };
    soltas(pasta);

    return tags;
}

// O commit de um objeto "tag" (anotada), se o objeto estiver em .git/objects; senão null
function commitDoObjetoTag(ler, hash) {
    const bruto = ler(`objects/${hash.slice(0, 2)}/${hash.slice(2)}`, true);
    if (!bruto) return null;

    try {
        // "tag <tamanho>\0object <commit>\ntype commit\n..."
        const texto = zlib.inflateSync(bruto).toString('utf8');
        return texto.startsWith('tag ') ? (texto.match(/\0object ([0-9a-f]{40})\n/)?.[1] ?? null) : null;
    } catch {
        return null;
    }
}

// A tag do último checkout no reflog, se ele foi para este commit
function tagDoReflog(ler, commit, tags) {
    const ultimaLinha = (ler('logs/HEAD') ?? '').split('\n').filter(Boolean).at(-1) ?? '';
    const m = ultimaLinha.match(/^[0-9a-f]{40} ([0-9a-f]{40}) .*\tcheckout: moving from .+ to (.+)$/);
    return m && m[1] === commit && tags.has(m[2]) ? m[2] : null;
}

/**
 * O commit e a ref do .git (sem o git).
 * @returns {{ commit: string, ref: string } | null}  ref: o nome da tag, ou "HEAD"
 */
function lerGit(raiz = ROOT_DIR) {
    const ler = leitorDoGit(raiz);
    const head = ler('HEAD');
    if (!head) return null;

    // Num branch: o commit dele, e a ref é HEAD
    if (!HASH.test(head)) {
        const branch = head.match(/^ref:\s*(\S+)$/)?.[1];
        if (!branch) return null;

        const doRef = ler(branch);
        const doPacked = (ler('packed-refs') ?? '').split('\n').find(l => l.endsWith(` ${branch}`))?.split(' ')[0];
        const commit = [doRef, doPacked].find(h => h && HASH.test(h));
        return commit ? { commit, ref: 'HEAD' } : null;
    }

    // HEAD destacado: a tag que aponta para este commit (direto, peeled, pelo objeto ou pelo reflog)
    const commit = head;
    const tags = lerTags(ler, raiz);
    const daTag = [...tags.entries()]
        .filter(([, t]) => t.ref === commit || t.commit === commit || commitDoObjetoTag(ler, t.ref) === commit)
        .map(([nome]) => nome)
        // Mais de uma tag no mesmo commit: a de maior versão (release-1.10 depois de release-1.9)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    return { commit, ref: daTag.at(-1) ?? tagDoReflog(ler, commit, tags) ?? 'HEAD' };
}

/**
 * @returns {{ commit: string, ref: string } | null}  commit com 7 caracteres
 */
function lerCommit(raiz = ROOT_DIR) {
    const doEnv = String(process.env.ZAPBOT_COMMIT ?? '').trim();
    if (doEnv) {
        const [commit, ref] = doEnv.split('/');
        return { commit: commit.slice(0, 7), ref: ref || 'HEAD' };
    }

    const git = lerGit(raiz);
    return git ? { commit: git.commit.slice(0, 7), ref: git.ref } : null;
}

const ORIGEM = lerCommit();

// "2.0 (git+60315ed/release-2.0)", ou só "2.0" sem o commit
const versaoComCommit = () => (ORIGEM ? `${packageJson.version} (git+${ORIGEM.commit}/${ORIGEM.ref})` : packageJson.version);

module.exports = {
    ORIGEM,
    lerCommit,
    versaoComCommit
};
