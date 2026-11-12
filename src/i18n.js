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

// src/locales/<idioma>.js (ajuda) + src/locales/<idioma>/*.js (um arquivo por assunto: respostas dos comandos...)
const fs = require('fs');
const path = require('path');

function carregar(lang) {
    const catalogo = { ...require(`./locales/${lang}`) };
    const dir = path.join(__dirname, 'locales', lang);
    const arquivos = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort() : [];
    for (const f of arquivos) {
        for (const [chave, texto] of Object.entries(require(path.join(dir, f)))) {
            if (chave in catalogo) throw new Error(`i18n: chave repetida em ${lang}/${f}: ${chave}`);
            catalogo[chave] = texto;
        }
    }
    return catalogo;
}

const catalogos = { en_US: carregar('en_US'), pt_BR: carregar('pt_BR') };

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
        const n = Number(vars.n);
        // pt: o Intl trata o 0 como singular ("0 voto"); aqui 0 é plural ("0 votos"), como no inglês
        const forma = n === 1 ? 'one' : n === 0 ? 'other' : new Intl.PluralRules(lang.replace('_', '-')).select(n);
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
