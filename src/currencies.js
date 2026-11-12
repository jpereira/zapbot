/*
 * Currencies supported by /crypto and /rates.
 */

const { t } = require('./i18n');

/*
 * Currencies accepted by /crypto -a (<TOKEN>USDT pair on Binance) and their icons.
 * The active ones stay in the 'crypto.coins' setting.
 */
const CRYPTO_SUPPORTED = {
    BTC: '₿', ETH: 'Ξ', SOL: '◎', HYPE: 'Ⓗ', BNB: '🔶', XRP: '✕', DOGE: 'Ð',
    ADA: '₳', TRX: '🔺', AVAX: '🔻', LINK: '🔗', DOT: '●', LTC: 'Ł', TON: '💎',
    SUI: '💧', PEPE: '🐸', SHIB: '🐕', XLM: '🚀', NEAR: 'Ⓝ', UNI: '🦄'
};

// /rates currencies, against the real. The enabled ones stay in the 'cotacao.coins' setting.
const QUOTE_SUPPORTED = {
    USD: { icone: '🇺🇸', get nome() { return t('rates.name.USD'); }, fonte: 'fiat' },
    EUR: { icone: '🇪🇺', get nome() { return t('rates.name.EUR'); }, fonte: 'fiat' },
    GBP: { icone: '🇬🇧', get nome() { return t('rates.name.GBP'); }, fonte: 'fiat' },
    USDT: { icone: '🪙', get nome() { return t('rates.name.USDT'); }, fonte: 'binance' }
};

module.exports = {
    QUOTE_SUPPORTED,
    CRYPTO_SUPPORTED
};
