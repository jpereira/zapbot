/*
 * ZapBot - Bot para WhatsApp baseado no whatsapp-web.js
 *
 * Recupera mensagens apagadas, baixa vídeos (/get), cria figurinhas,
 * vigia mensagens por texto/regex (/watch), monitora contatos e mais. Os comandos são definidos em
 * src/comandos/comandos.json e implementados em src/comandos/ (ver src/comandos/index.js).
 *
 * Este arquivo só faz o bootstrap, na ordem abaixo; o código fica em src/:
 *   constantes, log, db, settings  → base (banco, configurações, log)
 *   cliente, conexao               → cliente do WhatsApp, QR Code, reconexão
 *   eventos/                       → mensagens, apagadas, editadas, presença
 *   comandos/                      → um arquivo por comando
 *   limpeza, alertasPreco, defi/alertas, agenda, backup, email → tarefas periódicas e alertas
 *
 * Versão:  veja package.json
 * Autor:   Jorge Pereira <jpereiran@gmail.com>
 * Site:    https://github.com/jpereira/zapbot
 *
 * Copyright (c) 2026 Jorge Pereira
 *
 * Licenciado sob a licença MIT. É permitido usar, copiar, modificar,
 * mesclar, publicar, distribuir, sublicenciar e/ou vender cópias deste
 * software, desde que este aviso de copyright seja mantido.
 *
 * O SOFTWARE É FORNECIDO "COMO ESTÁ", SEM GARANTIA DE QUALQUER TIPO.
 */

/*
 * Variáveis de ambiente, antes de qualquer outro módulo (vários leem process.env
 * ao carregar). No Docker elas já chegam pelo env_file do Compose e o arquivo nem
 * está na imagem; fora dele (node app.js), vêm do mesmo arquivo que o Compose
 * usaria: config/.env com APP_ENV=prod, senão config/.env.dev. O dotenv nunca
 * sobrescreve uma variável que já existe.
 */
require('dotenv').config({
    path: require('path').join(__dirname, 'config', process.env.APP_ENV === 'prod' ? '.env' : '.env.dev'),
    quiet: true
});

const colors = require('colors');

const { APP_ENV } = require('./src/constantes');
const { printInfo } = require('./src/log');

// O debug mode vem do setting 'debug.enabled' (padrão: ligado se APP_ENV=dev, sem diferenciar maiúsculas)
printInfo(`Running in APP_ENV=${APP_ENV} QRCODE_EMAIL_ENABLE=${process.env.QRCODE_EMAIL_ENABLE}`);

const { instalarEncerramento } = require('./src/processo');

// Crash e docker stop avisam por e-mail antes de sair
instalarEncerramento();

/*
 * Banco: tabelas + settings. Até terminar, quem usa o banco espera em `dbPronto`.
 */
const { marcarBancoPronto } = require('./src/db');
const { inicializarBanco } = require('./src/inicializacao');

inicializarBanco().then(marcarBancoPronto).catch((e) => {
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

// Cria o cliente do WhatsApp; os módulos de eventos registram seus handlers nele ao carregar
const { iniciarLimpezaDasMarcas } = require('./src/cliente');
const { iniciarBot, iniciarWatchdog } = require('./src/conexao');

require('./src/eventos/presenca');
require('./src/eventos/apagadas');
require('./src/eventos/editadas');
require('./src/eventos/mensagens');
require('./src/enquetes');

const { iniciarAgenda } = require('./src/agenda');
const { iniciarAlertasDePreco } = require('./src/alertasPreco');
const { iniciarBackup } = require('./src/backup');
const { iniciarAlertasDefi } = require('./src/defi/alertas');
const { iniciarHeartbeat } = require('./src/heartbeat');
const { iniciarLimpezaPeriodica } = require('./src/limpeza');

// Tarefas periódicas
iniciarLimpezaDasMarcas();
iniciarWatchdog();
iniciarHeartbeat();
iniciarLimpezaPeriodica();
iniciarAlertasDePreco();
iniciarAlertasDefi();
iniciarAgenda();
iniciarBackup();

iniciarBot();
