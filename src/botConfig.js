/*
 * Command definition (src/commands/commands.json), without those marked "disabled": true.
 */

const { printInfo, printSuccess } = require('./log');

const botConfig = require('./commands/commands.json');

// "disabled": true takes the command out of the bot: it does not answer, it does not show in /help
function withoutDisabled(commands) {
    return {
        ativos: commands.filter(c => !c.disabled),
        desativados: commands.filter(c => c.disabled).map(c => c.cmd)
    };
}

const { ativos: assets, desativados: disabledCommands } = withoutDisabled(botConfig.commands);
botConfig.commands = assets;

const commands = botConfig.commands.map(c => c.cmd);
printSuccess(`Loaded ${commands.length} callers (${commands.join(',')})`);

if (disabledCommands.length) {
    printInfo(`Disabled ${disabledCommands.length} callers (${disabledCommands.join(',')})`);
}

module.exports = {
    botConfig,
    withoutDisabled
};
