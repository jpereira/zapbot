/*
 * Proteção contra flood: quem não é admin repete o mesmo comando (os aliases
 * contam como ele) no máximo flood.maxCommandRepeated vezes em
 * flood.intervalCommand segundos. Passou: o bot avisa uma vez e ignora tudo
 * dessa pessoa até o intervalo acabar. Fica em memória: um reinício zera.
 */

const { getSetting } = require('./settings');

const usos = new Map();         // quem → Map(comando → instantes recentes)
const bloqueados = new Map();   // quem → até quando o bot a ignora

/**
 * @param {string} quem     o telefone (ou o id) de quem mandou
 * @param {string} comando  o nome principal (/crypto, não /creptomoeda)
 * @returns {{ liberado: boolean, avisar?: boolean, segundos?: number }}
 *   avisar: acabou de passar do limite (o aviso sai uma vez só)
 */
function verificarFlood(quem, comando, agora = Date.now()) {
    const maximo = getSetting('flood.maxCommandRepeated');
    if (!maximo || !quem) return { liberado: true };

    const segundos = getSetting('flood.intervalCommand');
    const janela = segundos * 1000;

    const ate = bloqueados.get(quem);
    if (ate && agora < ate) return { liberado: false };
    bloqueados.delete(quem);

    const doQuem = usos.get(quem) ?? new Map();
    usos.set(quem, doQuem);
    const recentes = (doQuem.get(comando) ?? []).filter(t => agora - t < janela);

    if (recentes.length >= maximo) {
        bloqueados.set(quem, agora + janela);
        usos.delete(quem);
        return { liberado: false, avisar: true, segundos };
    }

    recentes.push(agora);
    doQuem.set(comando, recentes);
    return { liberado: true };
}

// Esquece tudo (os testes começam do zero)
function limparFlood() {
    usos.clear();
    bloqueados.clear();
}

module.exports = {
    limparFlood,
    verificarFlood
};
