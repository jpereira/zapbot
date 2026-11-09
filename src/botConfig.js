/*
 * Definição dos comandos (src/comandos/comandos.js), sem os marcados com "disabled": true.
 */

const { printInfo, printSuccess } = require('./log');

const { roleValido } = require('./roles');

const botConfig = require('./comandos/comandos');

// Erro de digitação no comandos.js: melhor cair no boot do que ignorar um comando em silêncio
function validar(commands) {
    const vistos = new Set();
    for (const c of commands) {
        if (!/^\/[a-z]+$/.test(c.cmd)) throw new Error(`comandos.js: cmd inválido: ${c.cmd}`);
        if (!roleValido(c.role)) throw new Error(`comandos.js: ${c.cmd} sem role válido (${c.role})`);
        for (const nome of [c.cmd, ...(c.aliases ?? [])]) {
            if (vistos.has(nome)) throw new Error(`comandos.js: nome repetido: ${nome}`);
            vistos.add(nome);
        }
    }
}

validar(botConfig.commands);

// "disabled": true tira o comando do bot: não responde, não aparece no /help
function semDesativados(commands) {
    return {
        ativos: commands.filter(c => !c.disabled),
        desativados: commands.filter(c => c.disabled).map(c => c.cmd)
    };
}

const { ativos, desativados: disabledCommands } = semDesativados(botConfig.commands);
botConfig.commands = ativos;

const commands = botConfig.commands.map(c => c.cmd);
printSuccess(`Loaded ${commands.length} callers (${commands.join(',')})`);

if (disabledCommands.length) {
    printInfo(`Disabled ${disabledCommands.length} callers (${disabledCommands.join(',')})`);
}

module.exports = {
    botConfig,
    semDesativados
};
