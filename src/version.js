/*
 * The bot version with the commit that is running and where it came from:
 * "2.0.0 (git+0c6164f/v2.0.0)" numa tag, "2.0.1 (devel) (git+7a89b92/HEAD)" fora dela.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const packageJson = require('../package.json');

const { ROOT_DIR } = require('./constants');

/*
 * The commit and the ref come, in this order:
 * 1. from ZAPBOT_COMMIT ("0c6164f" or "0c6164f/v2.0.0"; without the ref, HEAD),
 * for whoever builds the image another way (e.g.: CI);
 * 2. from the project's .git, read without git: the HEAD (on a tag checkout, it is already
 * the hash) or its branch, in .git/refs/heads/ or in .git/packed-refs.
 * The Docker image carries only these files, the tags and the HEAD reflog (see
 * .dockerignore), so each "docker compose build" records the commit and the
 * tag of the code that went into it.
 *
 * The tag is the one that points to the commit in use: with a detached HEAD (git checkout
 * v2.0.0) or on a branch that is on the tag commit. An annotated tag (those of
 * bump.sh) points to a "tag" object, not
 * to the commit; its commit comes from one of these:
 * - the "^<commit>" line right below it in packed-refs (in a clone, or after
 * of a git pack-refs --all, which bump.sh runs when creating the tag);
 * - the object itself in .git/objects (outside Docker, where .git is whole);
 * - the last line of the reflog (.git/logs/HEAD): "checkout: moving from main to
 * v2.0.0", with the commit it went to (after a git fetch --tags,
 * the new tag stays loose and the object does not go into the image).
 * Without a tag for the commit: "HEAD".
 *
 * Read once, on load: it is that of the code that is running, even if the
 * repository to change afterward.
 */
const HASH = /^[0-9a-f]{40}$/;

function gitReader(root) {
    const git = path.join(root, '.git');
    return (fileAlt, binary = false) => {
        try {
            const content = fs.readFileSync(path.join(git, fileAlt));
            return binary ? content : content.toString('utf8').trim();
        } catch {
            return null;
        }
    };
}

// The tags: name → { ref (what the ref points to), commit (if already known) }
function readTags(read, root) {
    const tags = new Map();

    // packed-refs: "<hash> refs/tags/X", and "^<commit>" on the next line if X is annotated
    let last = null;
    for (const line of (read('packed-refs') ?? '').split('\n')) {
        const peeled = line.match(/^\^([0-9a-f]{40})$/);
        if (peeled && last) {
            last.commit = peeled[1];
            continue;
        }

        const m = line.match(/^([0-9a-f]{40}) refs\/tags\/(.+)$/);
        last = m ? { ref: m[1], commit: null } : null;
        if (m) tags.set(m[2], last);
    }

    // Loose tags (they beat those from packed-refs with the same name)
    const folder = path.join(root, '.git', 'refs', 'tags');
    const loose = (dir, prefix = '') => {
        let inputs;
        try {
            inputs = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const e of inputs) {
            const nameAlt = `${prefix}${e.name}`;
            if (e.isDirectory()) loose(path.join(dir, e.name), `${nameAlt}/`);
            else {
                const ref = read(`refs/tags/${nameAlt}`);
                if (ref && HASH.test(ref)) tags.set(nameAlt, { ref, commit: null });
            }
        }
    };
    loose(folder);

    return tags;
}

// The commit of a "tag" object (annotated), if the object is in .git/objects; otherwise null
function objectTagCommit(read, hash) {
    const raw = read(`objects/${hash.slice(0, 2)}/${hash.slice(2)}`, true);
    if (!raw) return null;

    try {
        // "tag <tamanho>\0object <commit>\ntype commit\n..."
        const textAlt = zlib.inflateSync(raw).toString('utf8');
        return textAlt.startsWith('tag ') ? (textAlt.match(/\0object ([0-9a-f]{40})\n/)?.[1] ?? null) : null;
    } catch {
        return null;
    }
}

// The tag of the last checkout in the reflog, if it went to this commit
function tagDoReflog(read, commit, tags) {
    const lastLine = (read('logs/HEAD') ?? '').split('\n').filter(Boolean).at(-1) ?? '';
    const m = lastLine.match(/^[0-9a-f]{40} ([0-9a-f]{40}) .*\tcheckout: moving from .+ to (.+)$/);
    return m && m[1] === commit && tags.has(m[2]) ? m[2] : null;
}

/**
 * The commit and ref from .git (without git).
 * @returns {{ commit: string, ref: string } | null}  ref: the tag name, or "HEAD"
 */
function readGit(root = ROOT_DIR) {
    const read = gitReader(root);
    const head = read('HEAD');
    if (!head) return null;

    // The commit in use: the detached HEAD's, or the branch's (in refs/heads/ or in packed-refs)
    let commit = HASH.test(head) ? head : null;
    if (!commit) {
        const branch = head.match(/^ref:\s*(\S+)$/)?.[1];
        if (!branch) return null;

        const doRef = read(branch);
        const doPacked = (read('packed-refs') ?? '').split('\n').find(l => l.endsWith(` ${branch}`))?.split(' ')[0];
        commit = [doRef, doPacked].find(h => h && HASH.test(h));
        if (!commit) return null;
    }

    // The tag that points to this commit (direct, peeled, by object or by reflog)
    const tags = readTags(read, root);
    const daTag = [...tags.entries()]
        .filter(([, t]) => t.ref === commit || t.commit === commit || objectTagCommit(read, t.ref) === commit)
        .map(([nameAlt]) => nameAlt)
        // More than one tag on the same commit: the higher version (v1.10.0 after v1.9.0)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    return { commit, ref: daTag.at(-1) ?? tagDoReflog(read, commit, tags) ?? 'HEAD' };
}

/**
 * @returns {{ commit: string, ref: string } | null}  commit with 7 characters
 */
function readCommit(root = ROOT_DIR) {
    const doEnv = String(process.env.ZAPBOT_COMMIT ?? '').trim();
    if (doEnv) {
        const [commit, ref] = doEnv.split('/');
        return { commit: commit.slice(0, 7), ref: ref || 'HEAD' };
    }

    const git = readGit(root);
    return git ? { commit: git.commit.slice(0, 7), ref: git.ref } : null;
}

const ORIGIN = readCommit();

/*
 * Outside a v* tag the code has not been released yet: it is main (or a
 * branch) between a bump and the next release. Then the version gets the "(devel)",
 * so nobody thinks they are running the stable one. Without knowing the commit (neither .git,
 * nor ZAPBOT_COMMIT), it cannot be told: stays without a label, in good faith.
 */
const inDevelopment = (origin = ORIGIN) => Boolean(origin) && !/^v\d+\.\d+\.\d+$/.test(origin.ref);

// "2.0.1", or "2.0.1 (devel)" outside a release
const botVersion = (origin = ORIGIN) => `${packageJson.version}${inDevelopment(origin) ? ' (devel)' : ''}`;

// "2.0.0 (git+0c6164f/v2.0.0)", "2.0.1 (devel) (git+7a89b92/HEAD)", or just "2.0.0" without the commit
const versionWithCommit = (origin = ORIGIN) =>
    (origin ? `${botVersion(origin)} (git+${origin.commit}/${origin.ref})` : packageJson.version);

module.exports = {
    ORIGIN,
    inDevelopment,
    readCommit,
    versionWithCommit,
    botVersion
};
