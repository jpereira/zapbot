/*
 * O texto de um comando no idioma do bot (setting zapbot.lang). As definições em src/comandos/definicoes/
 * têm o texto em inglês (en_US); as traduções ficam em src/locales/<idioma>/definicoes/<comando>.json, com
 * os campos de texto (summary, usage, help, ex e, nas opções, desc, ex, values, argv) no mesmo lugar.
 * O resto da definição (opts, role...) vale de qualquer jeito.
 */

const fs = require('fs');
const path = require('path');

const constantes = require('../constantes');
const { PADRAO, idioma } = require('../i18n');

const LOCALES = path.join(__dirname, '..', 'locales');
const cache = new Map();

function traducao(lang, cmd) {
    const chave = `${lang}${cmd}`;
    if (!cache.has(chave)) {
        const arquivo = path.join(LOCALES, lang, 'definicoes', `${cmd.slice(1)}.json`);
        // Os caminhos reais (${CACHE_DIR}, ${MEDIA_DIR}, ${BACKUP_DIR}) entram na hora, como nas definições
        const texto = fs.existsSync(arquivo) ? fs.readFileSync(arquivo, 'utf8').replace(/\$\{(\w+)\}/g, (inteiro, nome) => constantes[nome] ?? inteiro) : null;
        cache.set(chave, texto && JSON.parse(texto));
    }
    return cache.get(chave);
}

const so = (origem, campos) => Object.fromEntries(campos.filter(c => origem?.[c] !== undefined).map(c => [c, origem[c]]));

/**
 * @param {object} command  a definição (em inglês)
 * @param {string} [lang]
 * @returns {object} a definição com o texto do idioma (a mesma, se for o padrão ou faltar a tradução)
 */
function localizar(command, lang = idioma()) {
    if (lang === PADRAO) return command;
    const pt = traducao(lang, command.cmd);
    if (!pt) return command;

    return {
        ...command,
        ...so(pt, ['summary', 'usage', 'help', 'ex']),
        cmd_opts: command.cmd_opts?.map((o, i) => ({ ...o, ...so(pt.cmd_opts?.[i], ['desc', 'ex', 'values', 'argv']) })),
        protocolos: command.protocolos && Object.fromEntries(Object.entries(command.protocolos)
            .map(([nome, p]) => [nome, { ...p, ...so(pt.protocolos?.[nome], ['usage', 'help', 'ex']) }]))
    };
}

module.exports = {
    localizar
};
