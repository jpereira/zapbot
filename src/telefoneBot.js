/*
 * O .env guarda dígitos; o identificador do chat só entra no envio ao WhatsApp.
 */
function normalizarTelefoneBot() {
    const valor = process.env.PHONE_NUMBER;
    if (valor === undefined) return '';

    // O sufixo pode conter números também: ele inteiro fica do lado de fora.
    const numero = valor.split('@')[0].replace(/\D/g, '');
    process.env.PHONE_NUMBER = numero;
    if (valor !== numero) {
        require('./log').printInfo(
            '⚠️ PHONE_NUMBER ajustado: use somente DDI + DDD + número, ' +
            'sem sufixo, +, espaços ou traços. Ex.: PHONE_NUMBER=5521999999999. ' +
            'Continuando com o número limpo.'
        );
    }
    return numero;
}

function telefoneBotJid() {
    const numero = normalizarTelefoneBot();
    return numero ? `${numero}@c.us` : '';
}

module.exports = { normalizarTelefoneBot, telefoneBotJid };
