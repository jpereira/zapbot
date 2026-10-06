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

const REGRA_REGEX = /^\/(.+)\/([a-z]*)$/s;
const REGRA_MAX_LEN = 200;

// regra -> função de teste (compilada uma vez, não a cada mensagem)
const regrasCompiladas = new Map();

function compilarRegraWatch(regra) {
    if (regrasCompiladas.has(regra)) return regrasCompiladas.get(regra);

    if (!regra || regra.length > REGRA_MAX_LEN) {
        throw new Error(`a regra precisa ter de 1 a ${REGRA_MAX_LEN} caracteres`);
    }

    let testar;
    const m = regra.match(REGRA_REGEX);

    if (m) {
        let re;
        try {
            re = new RegExp(m[1], m[2].replace(/[gy]/g, ''));
        } catch (e) {
            throw new Error(`regex inválida: ${e.message}`, { cause: e });
        }
        testar = (texto) => re.test(texto);
    } else {
        const alvo = semAcentos(regra);
        testar = (texto) => semAcentos(texto).includes(alvo);
    }

    regrasCompiladas.set(regra, testar);
    return testar;
}

module.exports = {
    REGRA_REGEX,
    compilarRegraWatch
};
