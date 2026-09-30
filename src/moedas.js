/*
 * Moedas suportadas pelo /crypto e pelo /cotacao.
 */

/*
 * Moedas aceitas pelo /crypto -a (par <TOKEN>USDT na Binance) e seus ícones.
 * As ativas ficam no setting 'crypto.coins'.
 */
const CRYPTO_SUPPORTED = {
    BTC: '₿', ETH: 'Ξ', SOL: '◎', HYPE: 'Ⓗ', BNB: '🔶', XRP: '✕', DOGE: 'Ð',
    ADA: '₳', TRX: '🔺', AVAX: '🔻', LINK: '🔗', DOT: '●', LTC: 'Ł', TON: '💎',
    SUI: '💧', PEPE: '🐸', SHIB: '🐕', XLM: '🚀', NEAR: 'Ⓝ', UNI: '🦄'
};

// Moedas do /cotacao, contra o real. As habilitadas ficam no setting 'cotacao.coins'.
const COTACAO_SUPORTADAS = {
    USD: { icone: '🇺🇸', nome: 'Dólar', fonte: 'fiat' },
    EUR: { icone: '🇪🇺', nome: 'Euro', fonte: 'fiat' },
    GBP: { icone: '🇬🇧', nome: 'Libra', fonte: 'fiat' },
    USDT: { icone: '🪙', nome: 'Tether', fonte: 'binance' }
};

module.exports = {
    COTACAO_SUPORTADAS,
    CRYPTO_SUPPORTED
};
