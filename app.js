/*
 * ZapBot - WhatsApp bot based on whatsapp-web.js
 *
 * Recovers deleted messages, downloads videos (/get), creates stickers,
 * watches messages by text/regex (/watch), monitors contacts and more. The commands are defined in
 * src/commands/commands.json and implemented in src/commands/ (see src/commands/index.js).
 *
 * This file only does the bootstrap, in the order below; the code lives in src/:
 * constantes, log, db, settings  → base (database, settings, log)
 * client, conexao               → WhatsApp client, QR Code, reconnection
 * events/                       → messages, deleted, edited, presence
 * commands/                      → one file per command
 * limpeza, alertasPreco, email   → periodic tasks and alerts
 *
 * Version:  see package.json
 * Author:   Jorge Pereira <jpereiran@gmail.com>
 * Site:    https://github.com/jpereira/zapbot
 *
 * Copyright (c) 2026 Jorge Pereira
 *
 * Licensed under the MIT license. It is permitted to use, copy, modify,
 * merge, publish, distribute, sublicense and/or sell copies of this
 * software, provided that this copyright notice is kept.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
 *
 * Unofficial project, with no link to WhatsApp or Meta. Using bots on
 * personal accounts violates WhatsApp's Terms of Service and may lead to
 * number ban. Use at your own risk.
 */

// Loads the .env before any other module: several read process.env on load
require('dotenv').config();

const colors = require('colors');

const { APP_ENV } = require('./src/constants');
const { printInfo } = require('./src/log');

// Debug mode comes from the 'debug.enabled' setting (default: on if APP_ENV=dev, case-insensitive)
printInfo(`Running in APP_ENV=${APP_ENV} QRCODE_EMAIL_ENABLE=${process.env.QRCODE_EMAIL_ENABLE}`);

const { installClosing } = require('./src/process');

// Crash and docker stop warn by email before exiting
installClosing();

/*
 * Database: tables + settings. Until it finishes, whoever uses the database waits on `dbReady`.
 */
const { markDbReady } = require('./src/db');
const { initializeDb } = require('./src/initialization');

initializeDb().then(markDbReady).catch((e) => {
    console.error('Bootstrap Erro:', e);
    process.exit(1);
});

/*
 * main()
 */
const banner = `
*          ____ ____ _____
|_        /_  // __ \`/ __ \\
(O) [@@]   / // /_/ / /_/ /
|#|/|__|\\ /___\\__,_/ .___/
'-' d  b          /_/
`;
console.log(colors.rainbow(banner));
printInfo('🤖 Starting ZapBot...');

// Creates the WhatsApp client; the event modules register their handlers on it when loaded
const { marksStartCleanup } = require('./src/client');
const { startBot, startWatchdog } = require('./src/connection');

require('./src/events/presence');
require('./src/events/deleted');
require('./src/events/edited');
require('./src/events/messages');

const { priceStartAlerts } = require('./src/priceAlerts');
const { startHeartbeat } = require('./src/heartbeat');
const { startCleanupPeriodic } = require('./src/cleanup');

// Periodic tasks
marksStartCleanup();
startWatchdog();
startHeartbeat();
startCleanupPeriodic();
priceStartAlerts();

startBot();
