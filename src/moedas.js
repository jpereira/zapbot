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

/*
 * /cotacao [MOEDA...]
 * Cotação contra o real: valor atual, abertura e fechamento anterior, máxima e
 * mínima do dia e variação. Moedas fiduciárias vêm do Yahoo Finance (se falhar,
 * da AwesomeAPI, que não informa a abertura); o USDT vem dos candles diários
 * da Binance (o "dia" da Binance vira às 21h de Brasília).
 */
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
