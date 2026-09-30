/*
 * HEALTHCHECK do container: o bot está vivo se gravou o heartbeat há pouco.
 *
 * Quem decide se o bot está funcionando é o próprio bot (src/heartbeat.js):
 * ele só grava o arquivo quando está saudável. Aqui só olhamos a idade dele.
 *
 *   exit 0 → healthy     exit 1 → unhealthy (o motivo vai para `docker inspect`)
 *
 * Variáveis (as mesmas do bot):
 *   ZAPBOT_HEARTBEAT_FILE        padrão: <tmp>/zapbot-heartbeat.json
 *   ZAPBOT_HEARTBEAT_MAX_AGE_S   padrão: 90 (três batimentos de 30 s)
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const arquivo = process.env.ZAPBOT_HEARTBEAT_FILE || path.join(os.tmpdir(), 'zapbot-heartbeat.json');
const maxIdade = Number(process.env.ZAPBOT_HEARTBEAT_MAX_AGE_S || 90);

try {
    const heartbeat = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    const idade = Math.round((Date.now() - heartbeat.epoch) / 1000);

    if (!(idade <= maxIdade)) {
        console.log(`unhealthy: último heartbeat há ${idade}s (${heartbeat.estado}); limite ${maxIdade}s`);
        process.exit(1);
    }

    console.log(`healthy: ${heartbeat.estado}, heartbeat há ${idade}s`);
} catch (err) {
    console.log(`unhealthy: sem heartbeat em ${arquivo} (${err.code || err.message})`);
    process.exit(1);
}
