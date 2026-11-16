/*
 * Container HEALTHCHECK: the bot is alive if it wrote the heartbeat recently.
 *
 * Who decides whether the bot is working is the bot itself (src/heartbeat.js):
 * it only writes the file when healthy. Here we only look at its age.
 *
 * exit 0 → healthy     exit 1 → unhealthy (the reason goes to `docker inspect`)
 *
 * Variables (the same as the bot's):
 * ZAPBOT_HEARTBEAT_FILE        default: <tmp>/zapbot-heartbeat.json
 * ZAPBOT_HEARTBEAT_MAX_AGE_S   default: 90 (three 30 s beats)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const fileAlt = process.env.ZAPBOT_HEARTBEAT_FILE || path.join(os.tmpdir(), 'zapbot-heartbeat.json');
const maxAge = Number(process.env.ZAPBOT_HEARTBEAT_MAX_AGE_S || 90);

try {
    const heartbeat = JSON.parse(fs.readFileSync(fileAlt, 'utf8'));
    const age = Math.round((Date.now() - heartbeat.epoch) / 1000);

    if (!(age <= maxAge)) {
        console.log(`unhealthy: last heartbeat ${age}s ago (${heartbeat.estado}); limit ${maxAge}s`);
        process.exit(1);
    }

    console.log(`healthy: ${heartbeat.estado}, heartbeat ${age}s ago`);
} catch (err) {
    console.log(`unhealthy: no heartbeat at ${fileAlt} (${err.code || err.message})`);
    process.exit(1);
}
