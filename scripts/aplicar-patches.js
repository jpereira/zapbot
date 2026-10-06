/*
 * Patches das dependências: aplica uma vez e recusa arquivos incompatíveis.
 * O Git já faz parte do ambiente de instalação, inclusive na imagem Docker.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function aplicarPatches(raiz = path.resolve(__dirname, '..')) {
    const pasta = path.join(raiz, 'patches');
    const patches = fs.readdirSync(pasta).filter(nome => nome.endsWith('.patch')).sort();
    const executar = (args) => {
        const resultado = spawnSync('git', ['apply', '--whitespace=nowarn', ...args], {
            cwd: raiz, encoding: 'utf8', timeout: 30000
        });
        if (resultado.error) throw resultado.error;
        return resultado;
    };

    for (const nome of patches) {
        const arquivo = path.join(pasta, nome);
        const verificar = executar(['--check', arquivo]);
        if (verificar.status !== 0) {
            if (executar(['--reverse', '--check', arquivo]).status === 0) {
                console.log(`✅ Patch já aplicado: ${nome}`);
                continue;
            }
            throw new Error(`Patch incompatível: ${nome}\n${verificar.stderr.trim()}`);
        }
        const resultado = executar([arquivo]);
        if (resultado.status !== 0) {
            throw new Error(`Falha ao aplicar ${nome}: ${resultado.stderr.trim()}`);
        }
        console.log(`✅ Patch aplicado: ${nome}`);
    }
}

if (require.main === module) aplicarPatches();

module.exports = { aplicarPatches };
