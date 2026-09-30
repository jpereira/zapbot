/*
 * Arquivos do cache: tamanhos, listagem, pasta de mídias e limpeza de diretórios.
 */

const path = require('path');
const fs = require('fs-extra');

const { CACHE_DIR, MEDIA_DIR } = require('../constantes');
const { printInfo } = require('../log');

function getDirSize(dir) {
    let total = 0;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        total += entry.isDirectory() ? getDirSize(fullPath) : fs.statSync(fullPath).size;
    }

    return total;
}

function humanSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function listCacheLevelOnly(dir = CACHE_DIR) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    if (!entries.length) return 'Diretório vazio.\n';

    let totalBytes = 0;

    const rows = entries.map((entry, index) => {
        const fullPath = path.join(dir, entry.name);
        const branch = index === entries.length - 1 ? '└── ' : '├── ';
        const sizeBytes = entry.isDirectory() ? getDirSize(fullPath) : fs.statSync(fullPath).size;

        totalBytes += sizeBytes;

        return {
            name: entry.isDirectory() ? `${branch}📁 ${entry.name}/` : `${branch}${entry.name}`,
            size: humanSize(sizeBytes)
        };
    });

    const maxName = Math.max(...rows.map(r => r.name.length));

    let output = rows
        .map(r => `${r.name.padEnd(maxName)}  ${r.size.padStart(10)}`)
        .join('\n');

    output += '\n';
    output += `${''.padEnd(maxName, '─')} ${'─'.repeat(12)}\n`;
    output += `${'Total:'.padEnd(maxName)}  ${humanSize(totalBytes).padStart(10)}`;

    return output;
}

// Pasta cache/media/ano/mes/dia
function obterPastaMidia() {
    const agora = new Date();
    const pastaDestino = path.join(
        MEDIA_DIR,
        String(agora.getFullYear()),
        String(agora.getMonth() + 1).padStart(2, '0'),
        String(agora.getDate()).padStart(2, '0')
    );

    fs.mkdirSync(pastaDestino, { recursive: true });
    return pastaDestino;
}

/*
 * O id e o mimetype da mensagem vêm do cliente de quem enviou: um cliente
 * modificado pode mandar "../../app/app" como id. Só letras, números, _ e -.
 */
const nomeSeguro = (valor, padrao) => String(valor ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || padrao;

// true se `arquivo` está dentro de MEDIA_DIR (vale também para caminhos já gravados no banco)
function isCaminhoDeMidia(arquivo) {
    if (!arquivo) return false;
    const relativo = path.relative(MEDIA_DIR, path.resolve(arquivo));
    return relativo !== '' && !relativo.startsWith('..') && !path.isAbsolute(relativo);
}

function limparConteudoDiretorio(dirPath) {
    if (!fs.existsSync(dirPath)) {
        printInfo(`Diretório não existe: ${dirPath}`);
        return;
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        fs.rmSync(path.join(dirPath, entry.name), { recursive: true, force: true });
    }

    printInfo(`Conteúdo de ${dirPath} removido (${entries.length} itens).`);
}

module.exports = {
    getDirSize,
    humanSize,
    isCaminhoDeMidia,
    limparConteudoDiretorio,
    listCacheLevelOnly,
    nomeSeguro,
    obterPastaMidia
};
