const { AsyncLocalStorage } = require('async_hooks');

const contextos = new AsyncLocalStorage();
let inicializando = false;
const iniciarLogsDeBoot = () => { inicializando = true; };
const concluirLogsDeBoot = () => { inicializando = false; };
const podeFiltrarDebug = () => !inicializando && !contextoDebug().semFiltro;
const contextoDebug = () => contextos.getStore() ?? {};
const comContextoDebug = (dados, executar) => contextos.run(
    { ...contextoDebug(), ...dados }, executar
);

module.exports = {
    comContextoDebug, contextoDebug, iniciarLogsDeBoot, concluirLogsDeBoot, podeFiltrarDebug
};
