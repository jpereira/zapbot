/*
 * A command's text in the bot language (setting zapbot.lang). The definitions in src/commands/definitions/
 * have the text in English (en_US); the translations live in src/locales/<language>/definitions/<command>.json, with
 * the text fields (summary, usage, help, ex and, in the options, desc, ex, values, argv) in the same place.
 * The rest of the definition (opts, role...) applies anyway.
 */

const fs = require('fs');
const path = require('path');

const constants = require('../constants');
const { DEFAULT, language } = require('../i18n');

const LOCALES = path.join(__dirname, '..', 'locales');
const cache = new Map();

function translation(lang, cmd) {
    const keyAlt = `${lang}${cmd}`;
    if (!cache.has(keyAlt)) {
        const fileAlt = path.join(LOCALES, lang, 'definitions', `${cmd.slice(1)}.json`);
        // The real paths (${CACHE_DIR}, ${MEDIA_DIR}, ${BACKUP_DIR}) go in at the time, as in the definitions
        const textAlt = fs.existsSync(fileAlt) ? fs.readFileSync(fileAlt, 'utf8').replace(/\$\{(\w+)\}/g, (integer, nameAlt) => constants[nameAlt] ?? integer) : null;
        cache.set(keyAlt, textAlt && JSON.parse(textAlt));
    }
    return cache.get(keyAlt);
}

const so = (origin, fields) => Object.fromEntries(fields.filter(c => origin?.[c] !== undefined).map(c => [c, origin[c]]));

/**
 * @param {object} command  the definition (in English)
 * @param {string} [lang]
 * @returns {object} the definition with the language text (the same one, if it is the default or the translation is missing)
 */
function locate(command, lang = language()) {
    if (lang === DEFAULT) return command;
    const pt = translation(lang, command.cmd);
    if (!pt) return command;

    return {
        ...command,
        ...so(pt, ['summary', 'usage', 'help', 'ex']),
        cmd_opts: command.cmd_opts?.map((o, i) => ({ ...o, ...so(pt.cmd_opts?.[i], ['desc', 'ex', 'values', 'argv']) })),
        protocolos: command.protocolos && Object.fromEntries(Object.entries(command.protocolos)
            .map(([nameAlt, p]) => [nameAlt, { ...p, ...so(pt.protocolos?.[nameAlt], ['usage', 'help', 'ex']) }]))
    };
}

module.exports = {
    locate
};
