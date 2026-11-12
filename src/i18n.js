/*
 * i18n: o idioma do bot é o setting 'zapbot.lang' (en_US, o padrão, ou pt_BR; /set zapbot.lang pt_BR).
 *
 *   t('help.notFound', { cmd: '/x' })   → o texto do catálogo do idioma atual, com {cmd} trocado
 *   t('x.items', { n: 3 })               → plural: o catálogo tem { one: '...', other: '...' }
 *
 * Os catálogos são módulos simples (src/locales/en_US.js e pt_BR.js, chave → texto). Faltou a chave no
 * idioma: vale o en_US e, na falta dele, a própria chave. O texto dos comandos (-h, /help) fica em
 * src/comandos/definicoes/ (inglês) e src/locales/pt_BR/definicoes/ (as traduções): veja
 * src/comandos/localizar.js. Um teste confere que os dois catálogos têm as mesmas chaves e placeholders.
 */

const IDIOMAS = ['en_US', 'pt_BR'];
const PADRAO = 'en_US';

const catalogos = {
    en_US: require('./locales/en_US'),
    pt_BR: require('./locales/pt_BR')
};

// O setting (só lido na hora de usar: o settings.js não depende do i18n)
function idioma() {
    try {
        return require('./settings').getSetting('zapbot.lang') ?? PADRAO;
    } catch {
        return PADRAO;
    }
}

/**
 * @param {string} chave
 * @param {Record<string, string|number>} [vars]  valores dos {placeholders}; `n` escolhe a forma do plural
 * @param {string} [lang]  força o idioma (padrão: o do setting)
 */
function t(chave, vars = {}, lang = idioma()) {
    let texto = catalogos[lang]?.[chave] ?? catalogos[PADRAO][chave] ?? chave;
    if (texto && typeof texto === 'object') {
        const forma = new Intl.PluralRules(lang.replace('_', '-')).select(Number(vars.n));
        texto = texto[forma] ?? texto.other;
    }
    return String(texto).replace(/\{(\w+)\}/g, (inteiro, nome) => (nome in vars ? String(vars[nome]) : inteiro));
}

module.exports = {
    IDIOMAS,
    PADRAO,
    catalogos,
    idioma,
    t
};
