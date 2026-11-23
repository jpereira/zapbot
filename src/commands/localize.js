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
    if (command.groupAction) {
        const { source, option } = command.groupAction;
        const localized = locate(source, lang);
        if (!option) {
            const rename = text => text?.replaceAll(source.cmd, command.cmd);
            return {
                ...command, summary: localized.summary, help: rename(localized.help),
                usage: rename(localized.usage), ex: localized.ex?.map(rename),
                cmd_opts: localized.cmd_opts?.map(o => ({ ...o, ex: o.ex?.map(rename) }))
            };
        }
        const summary = localized.cmd_opts.find(o => o.opts?.[0] === option).desc;
        const options = command.cmd_opts.map(o => localized.cmd_opts.find(source => source.opts?.[0] === o.opts[0]));
        return { ...command, summary, cmd_opts: options };
    }
    if (lang === DEFAULT) return command;
    const pt = translation(lang, command.cmd);
    if (!pt) return command;

    return {
        ...command,
        ...so(pt, ['summary', 'usage', 'help', 'ex']),
        cmd_opts: command.cmd_opts?.map((o, i) => ({ ...o, ...so(pt.cmd_opts?.[i], ['desc', 'ex', 'values', 'argv']) })),
        protocols: command.protocols && Object.fromEntries(Object.entries(command.protocols)
            .map(([nameAlt, p]) => [nameAlt, { ...p, ...so(pt.protocols?.[nameAlt], ['usage', 'help', 'ex']) }]))
    };
}

module.exports = {
    locate
};
