/*
 * ZapBot - WhatsApp bot based on whatsapp-web.js
 *
 * Recovers deleted messages, downloads videos (/get), creates stickers,
 * watches messages by text/regex (/watch) and more. The commands are defined in
 * src/commands/commands.js and implemented in src/commands/ (see src/commands/index.js).
 *
 * This file only does the bootstrap, in the order below; the code lives in src/:
 * constantes, log, db, settings  → base (database, settings, log)
 * client, conexao               → WhatsApp client, QR Code, reconnection
 * events/                       → messages, deleted, edited, reactions
 * commands/                      → one file per command
 * limpeza, alertasPreco, defi/alertas, agenda, backup, email → periodic tasks and alerts
 *
 * Version:  see package.json
 * Author:   Jorge Pereira <jpereiran@gmail.com>
 * Site:    https://github.com/jpereira/zapbot
 *
 * Copyright (c) 2026 Jorge Pereira
 *
 * Licensed under the MIT license. It is permitted to use, copy, modify,
 * merge, publish, distribute, sublicense and/or sell copies of this
 * software, provided that this copyright notice is kept (full text
 * in the LICENSE file).
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
 */

/*
 * Environment variables, before any other module (several read process.env
 * on load). In Docker they already arrive through Compose's env_file and the file does not even
 * is in the image; outside it (node app.js), they come from the same file as Compose
 * uses: config/.env. dotenv never overrides a variable that already exists.
 */
require('dotenv').config({
    path: require('path').join(__dirname, 'config', '.env'),
    quiet: true
});

require('./src/debugContext').bootStartLogs();
require('./src/botPhone').normalizePhoneBot();
require('./src/debugInstrumentation').installDebug();

const colors = require('colors');

const { printInfo } = require('./src/log');
const { versionWithCommit } = require('./src/version');

// Debug mode comes from the 'debug.enabled' setting (default: off)
printInfo(`QRCODE_EMAIL_ENABLE=${process.env.QRCODE_EMAIL_ENABLE}`);

const { installClosing } = require('./src/process');

// Crash and docker stop warn by email before exiting
installClosing();

/*
 * Database: tables + settings. Until it finishes, whoever uses the database waits on `dbReady`.
 */
const { markDbReady } = require('./src/db');
const { initializeDb } = require('./src/initialization');

initializeDb().then(markDbReady).then(() => require('./src/zb').loadNewExamples()).catch((e) => {
    console.error('Bootstrap error:', e);
    process.exit(1);
});

/*
 * main()
 */
const banner = String.raw`
          .--.                /\_/\
       .-(____)-.            ( >.< )
          [o_o]              / >:D \
       .--|___|--.           \_____/
      /___|   |___\
          |___|
          /   \
         _|   |_

  ______          ____        __
 /__  /  ____ _ / __ )____  / /_
   / /  / __ \`// __  / __ \/ __/
  / /__/ /_/ // /_/ / /_/ / /_
 /____/\__,_//_____/\____/\__/

  Um bot do bem. Quase sempre.
`;
console.log(colors.rainbow(banner));
printInfo(`🤖 Starting ZapBot ${versionWithCommit()}...`);

// Creates the WhatsApp client; the event modules register their handlers on it when loaded
const { marksStartCleanup } = require('./src/client');
const { startBot, startWatchdog } = require('./src/connection');

require('./src/events/deleted');
require('./src/events/edited');
require('./src/events/reactions');
require('./src/events/messages');
require('./src/polls');
require('./src/greetings');
require('./src/calls');

const { startSchedule } = require('./src/schedule');
const { priceStartAlerts } = require('./src/priceAlerts');
const { startNotes } = require('./src/notes');
const { startBackup } = require('./src/backup');
const { startPricesAutomatic } = require('./src/openaiChat');
const { startAlertsDefi } = require('./src/defi/alerts');
const { startHeartbeat } = require('./src/heartbeat');
const { startCleanupPeriodic } = require('./src/cleanup');
const { startApi } = require('./src/api');
const { startWeb } = require('./src/web/server');
const { startModels } = require('./src/models');
const { startMonitor } = require('./src/monitor');
const { startReopenings } = require('./src/groupReopen');

// Periodic tasks
marksStartCleanup();
startWatchdog();
startHeartbeat();
startCleanupPeriodic();
priceStartAlerts();
startNotes();
startAlertsDefi();
startSchedule();
startBackup();
startPricesAutomatic();
startMonitor();
startReopenings();
startApi();
startWeb();
startModels();

startBot();
