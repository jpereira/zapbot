/*
 * Definição dos comandos (src/comandos/comandos.json), sem os marcados com "disabled": true.
 */

const { printInfo, printSuccess } = require('./log');

const botConfig = require('./comandos/comandos.json');

// "disabled": true tira o comando do bot: não responde, não aparece no /help
const disabledCommands = botConfig.commands.filter(c => c.disabled).map(c => c.cmd);
botConfig.commands = botConfig.commands.filter(c => !c.disabled);

const commands = botConfig.commands.map(c => c.cmd);
printSuccess(`Loaded ${commands.length} callers (${commands.join(',')})`);

if (disabledCommands.length) {
    printInfo(`Disabled ${disabledCommands.length} callers (${disabledCommands.join(',')})`);
}

module.exports = {
    botConfig
};
