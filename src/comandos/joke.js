/*
 * Comando /joke.
 */

const PIADAS = require('./piadas.json');

/*
 * /joke: piada em português da lista do piadas.json. A JokeAPI, usada antes,
 * só tem 2 piadas em português (1 no safe-mode): saía sempre a mesma.
 *
 * Saco embaralhado: cada rodada passa por todas as piadas numa ordem
 * aleatória, então nenhuma se repete antes de todas saírem, e a rodada nova
 * não começa pela última da anterior.
 */
let saco = [];
let ultima = null;

function embaralhar(lista) {
    const l = [...lista];
    for (let i = l.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [l[i], l[j]] = [l[j], l[i]];
    }
    return l;
}

function proximaPiada() {
    if (!saco.length) {
        saco = embaralhar(PIADAS);
        // A última da rodada anterior não abre a nova
        if (saco.length > 1 && saco[saco.length - 1] === ultima) [saco[0], saco[saco.length - 1]] = [saco[saco.length - 1], saco[0]];
    }

    ultima = saco.pop();
    return ultima;
}

// Começa uma rodada nova (os testes partem do começo de uma)
function reiniciarPiadas() {
    saco = [];
    ultima = null;
}

async function cmdJoke({ msg }) {
    const { pergunta, resposta } = proximaPiada();
    await msg.reply(`${pergunta}\n\n... ${resposta} 🥁`);
}

module.exports = {
    PIADAS,
    cmdJoke,
    reiniciarPiadas
};
