/*
 * Translated plural: contar('show.days', 3) → t() with { n, count }. The `n` picks the form
 * (only 1 is singular: 0 is plural, as in `plural` of format.js, and in pt Intl treats 0 as singular).
 * The catalog uses {count} in the text: { one: '{count} dia', other: '{count} dias' }.
 */
const { t } = require('../i18n');

const countAlt = (keyAlt, count, vars = {}) => t(keyAlt, { ...vars, n: count === 1 ? 1 : 2, count });

module.exports = { countAlt };
