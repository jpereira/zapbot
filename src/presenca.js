/*
 * Uma consulta de presença por vez para o monitoramento.
 */
const { client } = require('./cliente');
const { diagnosticarPresenca } = require('./debugPresenca');

let ocupada = false;

async function consultarPresenca(chatId, options = {}) {
    if (ocupada) return null;
    ocupada = true;
    try {
        return await client.pupPage.evaluate(diagnosticarPresenca, chatId, options);
    } finally {
        ocupada = false;
    }
}

module.exports = { consultarPresenca };
