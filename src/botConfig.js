/*
 * Command definition (src/commands/commands.json), without those marked "disabled": true.
 */

const { printInfo, printSuccess } = require('./log');

const botConfig = require('./commands/commands.json');

// "disabled": true takes the command out of the bot: it does not answer, it does not show in /help
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
