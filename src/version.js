/*
 * The bot version with the commit that is running: "2.0.0 (git+25b0870)".
 */

const fs = require('fs');
const path = require('path');
const packageJson = require('../package.json');

const { ROOT_DIR } = require('./constants');

/*
 * O commit vem, nesta ordem:
 * 1. from ZAPBOT_COMMIT (for whoever builds the image another way, e.g.: CI);
 * 2. from the project's .git: the HEAD (on a tag checkout, it is already the hash) or the
 * its branch, in .git/refs/heads/ or in .git/packed-refs. The image
 * Docker carries only these files (see .dockerignore), so each
 * "docker compose build" records the commit of the code that went into it.
 * Read once, on load: it is the commit of the code that is running, even
 * for the repository to change afterward.
 */
const HASH = /^[0-9a-f]{40}$/;

function gitReadCommit(root = ROOT_DIR) {
    const git = path.join(root, '.git');
    const read = (fileAlt) => {
        try {
            return fs.readFileSync(path.join(git, fileAlt), 'utf8').trim();
        } catch {
            return null;
        }
    };

    const head = read('HEAD');
    if (!head) return null;
    if (HASH.test(head)) return head;

    const ref = head.match(/^ref:\s*(\S+)$/)?.[1];
    if (!ref) return null;

    const doRef = read(ref);
    if (doRef && HASH.test(doRef)) return doRef;

    // Packed branch: "<hash> refs/heads/main" in packed-refs
    const line = (read('packed-refs') ?? '').split('\n').find(l => l.endsWith(` ${ref}`));
    const doPacked = line?.split(' ')[0];
    return doPacked && HASH.test(doPacked) ? doPacked : null;
}

function readCommit(root = ROOT_DIR) {
    const doEnv = String(process.env.ZAPBOT_COMMIT ?? '').trim();
    const commit = doEnv || gitReadCommit(root);
    return commit ? commit.slice(0, 7) : null;
}

const COMMIT = readCommit();

// "2.0.0 (git+25b0870)", or just "2.0" without the commit
const versionWithCommit = () => (COMMIT ? `${packageJson.version} (git+${COMMIT})` : packageJson.version);

module.exports = {
    COMMIT,
    readCommit,
    versionWithCommit
};
