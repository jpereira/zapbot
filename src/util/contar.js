/*
 * Plural traduzido: contar('show.days', 3) → o t() com { n, count }. O `n` escolhe a forma
 * (só o 1 é singular: o 0 é plural, como no `plural` do formatar.js, e no pt o Intl trata o 0 como singular).
 * O catálogo usa {count} no texto: { one: '{count} dia', other: '{count} dias' }.
 */
const { t } = require('../i18n');

const contar = (chave, count, vars = {}) => t(chave, { ...vars, n: count === 1 ? 1 : 2, count });

module.exports = { contar };
