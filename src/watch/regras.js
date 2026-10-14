/*
 * Regras do /watch: texto (sem diferenciar maiúsculas/acentos) ou /regex/flags.
 */

/*
 * Watch: toda mensagem recebida (menos as suas e os comandos) é testada contra
 * as regras do setting 'watch.rules'. Cada regra é:
 *   texto        → "contém", sem diferenciar maiúsculas nem acentos
 *   /regex/flags → RegExp do JavaScript (as flags g e y são ignoradas)
 * Quando casa, a ocorrência vai para watch_hits e você é avisado no privado.
 */
const { semAcentos } = require('../util/formatar');
const { MAX_TEXTO_TESTADO, regexPerigosa } = require('../util/regexSeguro');

const REGRA_REGEX = /^\/(.+)\/([a-z]*)$/s;
const REGRA_MAX_LEN = 200;

// regra -> função de teste (compilada uma vez, não a cada mensagem)
const regrasCompiladas = new Map();

/**
 * Texto ("contém", sem diferenciar maiúsculas nem acentos) ou /regex/flags →
 * função de teste. Também é o -q do /show e do /watch.
 * @throws {Error} regex inválida
 */
function compilarBusca(busca) {
    const m = busca.match(REGRA_REGEX);

    if (m) {
        if (regexPerigosa(m[1])) {
            // Backtracking exponencial travaria o bot inteiro (ver util/regexSeguro)
            throw new Error('regex com risco de travar o bot (quantificador sobre grupo que já se repete, como (x+)+): simplifique');
        }
        let re;
        try {
            re = new RegExp(m[1], m[2].replace(/[gy]/g, ''));
        } catch (e) {
            throw new Error(`regex inválida: ${e.message}`, { cause: e });
        }
        // O texto testado (corpo de qualquer mensagem recebida) é truncado: defesa
        // em profundidade contra os casos que a verificação estática não pega
        return (texto) => re.test(String(texto ?? '').slice(0, MAX_TEXTO_TESTADO));
    }

    const alvo = semAcentos(busca);
    return (texto) => semAcentos(texto).includes(alvo);
}

function compilarRegraWatch(regra) {
    if (regrasCompiladas.has(regra)) return regrasCompiladas.get(regra);

    if (!regra || regra.length > REGRA_MAX_LEN) {
        throw new Error(`a regra precisa ter de 1 a ${REGRA_MAX_LEN} caracteres`);
    }

    const testar = compilarBusca(regra);
    regrasCompiladas.set(regra, testar);
    return testar;
}

module.exports = {
    REGRA_REGEX,
    compilarBusca,
    compilarRegraWatch
};
