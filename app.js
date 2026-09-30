/*
 * ZapBot - Bot para WhatsApp baseado no whatsapp-web.js
 *
 * Recupera mensagens apagadas, baixa vídeos (/get), cria figurinhas,
 * vigia mensagens por texto/regex (/watch), monitora contatos e mais. Os comandos são definidos em
 * config/bot-config.json e implementados em src/comandos/ (ver src/comandos/index.js).
 *
 * Este arquivo só faz o bootstrap, na ordem abaixo; o código fica em src/:
 *   constantes, log, db, settings  → base (banco, configurações, log)
 *   cliente, conexao               → cliente do WhatsApp, QR Code, reconexão
 *   eventos/                       → mensagens, apagadas, editadas, presença
 *   comandos/                      → um arquivo por comando
 *   limpeza, alertasPreco, email   → tarefas periódicas e alertas
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
 *
 * Projeto não oficial, sem vínculo com o WhatsApp ou a Meta. Usar bots em
 * contas pessoais viola os Termos de Serviço do WhatsApp e pode levar ao
 * banimento do número. Use por sua conta e risco.
 */

// Carrega o .env antes de qualquer outro módulo: vários leem process.env ao carregar
require('dotenv').config();

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

const { iniciarAlertasDePreco } = require('./src/alertasPreco');
const { iniciarLimpezaPeriodica } = require('./src/limpeza');

// Tarefas periódicas
iniciarLimpezaDasMarcas();
iniciarWatchdog();
iniciarLimpezaPeriodica();
iniciarAlertasDePreco();

iniciarBot();
