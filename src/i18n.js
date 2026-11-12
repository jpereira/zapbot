/*
 * i18n: the bot language is the 'zapbot.lang' setting (en_US, the default, or pt_BR; /set zapbot.lang pt_BR).
 *
 * t('help.notFound', { cmd: '/x' })   → the current language catalog text, with {cmd} swapped
 * t('x.items', { n: 3 })               → plural: the catalog has { one: '...', other: '...' }
 *
 * The catalogs are simple modules (src/locales/en_US.js and pt_BR.js, key → text). A missing key in the
 * language: en_US applies and, failing that, the key itself. The command text (-h, /help) lives in
 * src/commands/definitions/ (English) and src/locales/pt_BR/definitions/ (the translations): see
 * src/commands/localize.js. A test checks that both catalogs have the same keys and placeholders.
 */

const LANGUAGES = ['en_US', 'pt_BR'];
const DEFAULT = 'en_US';

const catalogs = {
    en_US: require('./locales/en_US'),
    pt_BR: require('./locales/pt_BR')
};

// The setting (only read at the time of use: settings.js does not depend on i18n)
function language() {
    try {
        return require('./settings').getSetting('zapbot.lang') ?? DEFAULT;
    } catch {
        return DEFAULT;
    }
}

/**
 * @param {string} chave
 * @param {Record<string, string|number>} [vars]  values of the {placeholders}; `n` picks the plural form
 * @param {string} [lang]  forces the language (default: the setting's)
 */
function t(keyAlt, vars = {}, lang = language()) {
    let textAlt = catalogs[lang]?.[keyAlt] ?? catalogs[DEFAULT][keyAlt] ?? keyAlt;
    if (textAlt && typeof textAlt === 'object') {
        const form = new Intl.PluralRules(lang.replace('_', '-')).select(Number(vars.n));
        textAlt = textAlt[form] ?? textAlt.other;
    }
    return String(textAlt).replace(/\{(\w+)\}/g, (integer, nameAlt) => (nameAlt in vars ? String(vars[nameAlt]) : integer));
}

module.exports = {
    LANGUAGES,
    DEFAULT,
    catalogs,
    language,
    t
};
