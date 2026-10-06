/*
 * The .env stores digits; the chat identifier only goes in on the send to WhatsApp.
 */
function normalizePhoneBot() {
    const valueAlt = process.env.PHONE_NUMBER;
    if (valueAlt === undefined) return '';

    // The suffix may contain numbers too: all of it stays outside.
    const numberAlt = valueAlt.split('@')[0].replace(/\D/g, '');
    process.env.PHONE_NUMBER = numberAlt;
    if (valueAlt !== numberAlt) {
        require('./log').printInfo(
            '⚠️ PHONE_NUMBER ajustado: use somente DDI + DDD + número, ' +
            'sem sufixo, +, espaços ou traços. Ex.: PHONE_NUMBER=5521999999999. ' +
            'Continuando com o número limpo.'
        );
    }
    return numberAlt;
}

function phoneBotJid() {
    const numberAlt = normalizePhoneBot();
    return numberAlt ? `${numberAlt}@c.us` : '';
}

module.exports = { normalizePhoneBot, phoneBotJid };
