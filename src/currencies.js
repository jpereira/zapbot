/*
 * Currencies supported by /crypto and /rates.
 */

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
    USD: { icone: '🇺🇸', nome: 'Dólar', fonte: 'fiat' },
    EUR: { icone: '🇪🇺', nome: 'Euro', fonte: 'fiat' },
    GBP: { icone: '🇬🇧', nome: 'Libra', fonte: 'fiat' },
    USDT: { icone: '🪙', nome: 'Tether', fonte: 'binance' }
};

module.exports = {
    QUOTE_SUPPORTED,
    CRYPTO_SUPPORTED
};
