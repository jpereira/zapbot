/*
 * Command definition (src/commands/commands.js), without those marked "disabled": true.
 */

const { printInfo, printSuccess } = require('./log');

const { roleValid } = require('./roles');

const botConfig = require('./commands/commands');

// Typo in commands.js: better to crash at boot than silently ignore a command
function validate(commands) {
    const seen = new Set();
    for (const c of commands) {
        if (!/^\/[a-z]+$/.test(c.cmd)) throw new Error(`commands.js: cmd inválido: ${c.cmd}`);
        if (!roleValid(c.role)) throw new Error(`commands.js: ${c.cmd} sem role válido (${c.role})`);
        for (const nameAlt of [c.cmd, ...(c.aliases ?? [])]) {
            if (seen.has(nameAlt)) throw new Error(`commands.js: duplicate name: ${nameAlt}`);
            seen.add(nameAlt);
        }
    }
}

validate(botConfig.commands);

// "disabled": true takes the command out of the bot: it does not answer, it does not show in /help
function withoutDisabled(commands) {
    return {
        active: commands.filter(c => !c.disabled),
        disabled: commands.filter(c => c.disabled).map(c => c.cmd)
    };
}

const { active: assets, disabled: disabledCommands } = withoutDisabled(botConfig.commands);
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
