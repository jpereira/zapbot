/*
 * Contacts' profile photos, in CONTACTS_DIR (cache/contacts): <phone>.jpg.
 * Without a photo (or hidden by privacy) it becomes <phone>.none, so as not to ask again
 * until the photo expires ('contacts.cacheDays'). 'contacts.cache' setting off: stores nothing.
 */

const path = require('path');
const axios = require('axios');
const fs = require('fs-extra');

const { CONTACTS_DIR, DAY_MS } = require('./constants');
const { printError } = require('./log');
const { getSetting } = require('./settings');

const TIMEOUT_MS = 15000;
const MAX_BYTES = 10 * 1024 * 1024;

const fileAlt = (phoneAlt, ext) => path.join(CONTACTS_DIR, `${phoneAlt}.${ext}`);

const expired = async (f) => {
    const st = await fs.stat(f).catch(() => null);
    return !st || Date.now() - st.mtimeMs > getSetting('contacts.cacheDays') * DAY_MS;
};

// WhatsApp's image is almost always already JPEG; another format is converted
async function inJpeg(buffer, mime) {
    if (/jpe?g/i.test(mime) || (buffer[0] === 0xff && buffer[1] === 0xd8)) return buffer;
    return require('sharp')(buffer).jpeg().toBuffer();
}

/**
 * @param {object} contato  the whatsapp-web.js Contact
 * @param {string} telefone
 * @param {{refresh?: boolean, cache?: boolean}} [o]  cache: false neither reads nor writes
 * @returns {Promise<{foto: Buffer|null, doCache: boolean}>}
 */
async function contactPhoto(contactAlt, phoneAlt, { refresh = false, cache = getSetting('contacts.cache') } = {}) {
    if (cache && !refresh) {
        if (!(await expired(fileAlt(phoneAlt, 'jpg')))) return { foto: await fs.readFile(fileAlt(phoneAlt, 'jpg')), doCache: true };
        if (!(await expired(fileAlt(phoneAlt, 'none')))) return { foto: null, doCache: true };
    }

    let photo = null;
    try {
        const url = await contactAlt.getProfilePicUrl();
        if (url) {
            const { data, headers } = await axios.get(url, {
                responseType: 'arraybuffer', timeout: TIMEOUT_MS, maxContentLength: MAX_BYTES
            });
            photo = await inJpeg(Buffer.from(data), String(headers?.['content-type'] ?? ''));
        }
    } catch (err) {
        printError(`/contacts: não baixei a foto de ${phoneAlt}:`, err.message);
        return { foto: null, doCache: false }; // a network failure does not become "no photo" in the cache
    }

    if (cache) {
        await fs.ensureDir(CONTACTS_DIR);
        await fs.remove(fileAlt(phoneAlt, photo ? 'none' : 'jpg'));
        if (photo) await fs.writeFile(fileAlt(phoneAlt, 'jpg'), photo);
        else await fs.writeFile(fileAlt(phoneAlt, 'none'), '');
    }
    return { foto: photo, doCache: false };
}

// How many photos (and how many bytes) are in CONTACTS_DIR
async function cacheSummary() {
    if (!fs.existsSync(CONTACTS_DIR)) return { fotos: 0, semFoto: 0, bytes: 0 };
    let photos = 0, withoutPhoto = 0, bytes = 0;
    for (const f of await fs.readdir(CONTACTS_DIR)) {
        if (f.endsWith('.jpg')) { photos++; bytes += (await fs.stat(path.join(CONTACTS_DIR, f))).size; }
        else if (f.endsWith('.none')) withoutPhoto++;
    }
    return { fotos: photos, semFoto: withoutPhoto, bytes };
}

async function cleanCache() {
    const r = await cacheSummary();
    await fs.emptyDir(CONTACTS_DIR);
    return r;
}

module.exports = { contactPhoto, cleanCache, cacheSummary };
