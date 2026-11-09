/*
 * ZapBot - WhatsApp bot based on whatsapp-web.js
 *
 * Command definition: one file per command in src/commands/definitions/ (the file name is the
 * of the command, without the slash). Each 'cmd' handler lives in src/commands/index.js (HANDLERS).
 * Format of each field: docs/development.md, section 'Adicionando ou alterando comandos'
 * (https://jpereira.github.io/zapbot/desenvolvimento/).
 *
 * The "role" is the minimum level to use the command (src/roles.js): USER (whoever is in bot.users),
 * ADMIN (the extra admins and the owner; with `delegable: true`, the owner lets a user have it with the
 * /bot +cmd) or OWNER (owner only).
 *
 * Jorge Pereira <jpereiran@gmail.com>
 * Copyright (c) 2026 Jorge Pereira · MIT license
 * https://github.com/jpereira/zapbot
 */

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'definitions');

// Files starting with "_" are support (the repeated options), not commands
const commands = fs.readdirSync(DIR)
    .filter(fileAlt => fileAlt.endsWith('.js') && !fileAlt.startsWith('_'))
    .sort()
    .map(fileAlt => require(path.join(DIR, fileAlt)));

module.exports = { commands };
