const { AsyncLocalStorage } = require('async_hooks');

const contextos = new AsyncLocalStorage();
const contextoDebug = () => contextos.getStore() ?? {};
const comContextoDebug = (dados, executar) => contextos.run(
    { ...contextoDebug(), ...dados }, executar
);

module.exports = { comContextoDebug, contextoDebug };
