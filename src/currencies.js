/*
 * Currencies supported by /crypto and /stocks (the currencies against the real).
 */

const { t } = require('./i18n');

/*
 * Currencies accepted by /crypto -a (<TOKEN>USDT pair on Binance) and their icons.
 * The active ones stay in the 'crypto.coins' setting.
 */
const CRYPTO_SUPPORTED = {
    BTC: '₿', ETH: 'Ξ', SOL: '◎', HYPE: 'Ⓗ', BNB: '🔶', XRP: '✕', DOGE: 'Ð',
    ADA: '₳', TRX: '🔺', AVAX: '🔻', LINK: '🔗', DOT: '●', LTC: 'Ł', TON: '💎',
    SUI: '💧', PEPE: '🐸', SHIB: '🐕', XLM: '🚀', NEAR: 'Ⓝ', UNI: '🦄', XAUT: '🥇'
};

// The /crypto coins with a <TOKEN>BRL pair on Binance (checked in exchangeInfo; the TRADING status is checked on the spot, see
// quotes.js). The others (HYPE, TRX, TON, XLM, UNI, XAUT) come out through the dollar: price in USDT × USDTBRL.
const CRYPTO_BRL_DIRECT = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'DOT', 'LTC', 'SUI', 'PEPE', 'SHIB', 'NEAR'];

// /stocks currencies, against the real. The enabled ones stay in the 'stocks.symbols' setting.
const QUOTE_SUPPORTED = {
    USD: { icone: '🇺🇸', get nome() { return t('stocks.name.USD'); }, fonte: 'fiat' },
    EUR: { icone: '🇪🇺', get nome() { return t('stocks.name.EUR'); }, fonte: 'fiat' },
    GBP: { icone: '🇬🇧', get nome() { return t('stocks.name.GBP'); }, fonte: 'fiat' },
    USDT: { icone: '🪙', get nome() { return t('stocks.name.USDT'); }, fonte: 'binance' }
};

module.exports = {
    QUOTE_SUPPORTED,
    CRYPTO_BRL_DIRECT,
    CRYPTO_SUPPORTED
};
