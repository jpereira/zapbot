/*
 * Cache files: sizes, listing, media folder and directory cleanup.
 */

const path = require('path');
const fs = require('fs-extra');

const { CACHE_DIR, MEDIA_DIR } = require('../constants');
const { printInfo } = require('../log');
const { t } = require('../i18n');

// The space a folder takes, like du: a symlink is not followed (the /stt models link model.bin to blobs/, which
// counted the 1.5 GB three times) and a hard link counts once (the media joined by "the same files")
function getDirSize(dir, seen = new Set()) {
    let total = 0;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) total += getDirSize(fullPath, seen);
        else if (entry.isFile()) {
            const stat = fs.lstatSync(fullPath);
            const inode = `${stat.dev}:${stat.ino}`;
            if (seen.has(inode)) continue;
            seen.add(inode);
            total += stat.size;
        }
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
    const entries = fs.readdirSync(dir, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name));

    if (!entries.length) return t('arquivos.vazio');

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
    output += `${'─'.repeat(maxName + 12)}\n`;
    output += `${'Total:'.padEnd(maxName)}  ${humanSize(totalBytes).padStart(10)}`;

    return output;
}

// Pasta cache/media/year/mes/day
function getFolderMedia() {
    const nowAlt = new Date();
    const folderDestination = path.join(
        MEDIA_DIR,
        String(nowAlt.getFullYear()),
        String(nowAlt.getMonth() + 1).padStart(2, '0'),
        String(nowAlt.getDate()).padStart(2, '0')
    );

    fs.mkdirSync(folderDestination, { recursive: true });
    return folderDestination;
}

/*
 * The message id and mimetype come from the sender's client: a client
 * modified could send "../../app/app" as the id. Only letters, numbers, _ and -.
 */
const nameSafe = (valueAlt, defaults) => String(valueAlt ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || defaults;

// true if `file` is inside MEDIA_DIR (also applies to paths already stored in the database)
function mediaIsPath(fileAlt) {
    if (!fileAlt) return false;
    const relative = path.relative(MEDIA_DIR, path.resolve(fileAlt));
    return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function cleanContentDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
        printInfo(`Directory does not exist: ${dirPath}`);
        return;
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        fs.rmSync(path.join(dirPath, entry.name), { recursive: true, force: true });
    }

    printInfo(`Contents of ${dirPath} removed (${entries.length} items).`);
}

module.exports = {
    getDirSize,
    humanSize,
    mediaIsPath,
    cleanContentDirectory,
    listCacheLevelOnly,
    nameSafe,
    getFolderMedia
};
