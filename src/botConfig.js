/*
 * Definição dos comandos (src/comandos/comandos.json), sem os marcados com "disabled": true.
 */

const { printInfo, printSuccess } = require('./log');

const botConfig = require('./comandos/comandos.json');

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
