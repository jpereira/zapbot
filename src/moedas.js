/*
 * Moedas suportadas pelo /crypto e pelo /rates.
 */

const { t } = require('./i18n');

/*
 * Moedas aceitas pelo /crypto -a (par <TOKEN>USDT na Binance) e seus ícones.
 * As ativas ficam no setting 'crypto.coins'.
 */
const CRYPTO_SUPPORTED = {
    BTC: '₿', ETH: 'Ξ', SOL: '◎', HYPE: 'Ⓗ', BNB: '🔶', XRP: '✕', DOGE: 'Ð',
    ADA: '₳', TRX: '🔺', AVAX: '🔻', LINK: '🔗', DOT: '●', LTC: 'Ł', TON: '💎',
    SUI: '💧', PEPE: '🐸', SHIB: '🐕', XLM: '🚀', NEAR: 'Ⓝ', UNI: '🦄'
};

// Moedas do /rates, contra o real. As habilitadas ficam no setting 'cotacao.coins'.
const COTACAO_SUPORTADAS = {
    USD: { icone: '🇺🇸', get nome() { return t('rates.name.USD'); }, fonte: 'fiat' },
    EUR: { icone: '🇪🇺', get nome() { return t('rates.name.EUR'); }, fonte: 'fiat' },
    GBP: { icone: '🇬🇧', get nome() { return t('rates.name.GBP'); }, fonte: 'fiat' },
    USDT: { icone: '🪙', get nome() { return t('rates.name.USDT'); }, fonte: 'binance' }
};

module.exports = {
    COTACAO_SUPORTADAS,
    CRYPTO_SUPPORTED
};
