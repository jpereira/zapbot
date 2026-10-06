/*
 * Dependency patches: applies once and refuses incompatible files.
 * Git is already part of the installation environment, including in the Docker image.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function applyPatches(root = path.resolve(__dirname, '..')) {
    const folder = path.join(root, 'patches');
    const patches = fs.readdirSync(folder).filter(nameAlt => nameAlt.endsWith('.patch')).sort();
    const run = (args) => {
        const resultAlt = spawnSync('git', ['apply', '--whitespace=nowarn', ...args], {
            cwd: root, encoding: 'utf8', timeout: 30000
        });
        if (resultAlt.error) throw resultAlt.error;
        return resultAlt;
    };

    for (const nameAlt of patches) {
        const fileAlt = path.join(folder, nameAlt);
        const check = run(['--check', fileAlt]);
        if (check.status !== 0) {
            if (run(['--reverse', '--check', fileAlt]).status === 0) {
                console.log(`✅ Patch já aplicado: ${nameAlt}`);
                continue;
            }
            throw new Error(`Patch incompatível: ${nameAlt}\n${check.stderr.trim()}`);
        }
        const resultAlt = run([fileAlt]);
        if (resultAlt.status !== 0) {
            throw new Error(`Falha ao aplicar ${nameAlt}: ${resultAlt.stderr.trim()}`);
        }
        console.log(`✅ Patch aplicado: ${nameAlt}`);
    }
}

if (require.main === module) applyPatches();

module.exports = { applyPatches };
