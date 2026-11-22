/*
 * vCard 3.0 (what Android and iPhone import): one card per contact, with the embedded photo.
 * The UID is fixed (derived from the phone), so re-importing the same file updates the contact
 * instead of duplicating it, when the device matches by UID.
 */

const CRLF = '\r\n';

// Escapes the value of a text field (RFC 2426)
const esc = (s) => String(s ?? '')
    .replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');

// Lines over 75 characters continue on the next one, which starts with a space
function double(line) {
    if (line.length <= 75) return line;
    const partsAlt = [line.slice(0, 75)];
    for (let i = 75; i < line.length; i += 74) partsAlt.push(' ' + line.slice(i, i + 74));
    return partsAlt.join(CRLF);
}

/**
 * @param {object} c
 * @param {string} c.phone  digits only, with the country code
 * @param {string} c.name
 * @param {string} [c.note]  the WhatsApp "about" (becomes NOTE)
 * @param {string} [c.company]
 * @param {Buffer} [c.photo]    JPEG
 * @param {number} [c.when]  ms (REV)
 */
function assembleVcard({ phone: phoneAlt, name: nameAlt, note: message, company, photo, when = Date.now() }) {
    const linesAlt = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `UID:zapbot-${phoneAlt}`,
        `FN:${esc(nameAlt)}`,
        `N:;${esc(nameAlt)};;;`,
        `TEL;TYPE=CELL:+${phoneAlt}`
    ];
    if (company) linesAlt.push(`ORG:${esc(company)}`);
    if (message) linesAlt.push(`NOTE:${esc(message)}`);
    if (photo?.length) linesAlt.push(`PHOTO;ENCODING=b;TYPE=JPEG:${photo.toString('base64')}`);
    linesAlt.push(`REV:${new Date(when).toISOString().replace(/\.\d+Z$/, 'Z')}`, 'END:VCARD');
    return linesAlt.map(double).join(CRLF) + CRLF;
}

module.exports = { assembleVcard };
