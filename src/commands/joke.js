/*
 * Comando /joke.
 */

const JOKES = require('./jokes.json');

/*
 * /joke: joke in Portuguese from the jokes.json list. The JokeAPI, used before,
 * it only has 2 jokes in Portuguese (1 in safe-mode): the same one always came out.
 *
 * Shuffled bag: each round goes through all the jokes in an order
 * random, so none repeats before all have come out, and the new round
 * does not start with the last of the previous one.
 */
let saco = [];
let last = null;

function shuffle(list) {
    const l = [...list];
    for (let i = l.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [l[i], l[j]] = [l[j], l[i]];
    }
    return l;
}

function nextJoke() {
    if (!saco.length) {
        saco = shuffle(JOKES);
        // The last one of the previous round does not open the new one
        if (saco.length > 1 && saco[saco.length - 1] === last) [saco[0], saco[saco.length - 1]] = [saco[saco.length - 1], saco[0]];
    }

    last = saco.pop();
    return last;
}

// Starts a new round (the tests start from the beginning of one)
function restartJokes() {
    saco = [];
    last = null;
}

async function cmdJoke({ msg }) {
    const { pergunta: question, resposta: reply } = nextJoke();
    await msg.reply(`${question}\n\n... ${reply} 🥁`);
}

module.exports = {
    JOKES,
    cmdJoke,
    restartJokes
};
