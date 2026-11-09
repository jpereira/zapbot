/*
 * ZapBot - Bot para WhatsApp baseado no whatsapp-web.js
 *
 * Definição dos comandos: um arquivo por comando em src/comandos/definicoes/ (o nome do arquivo é o
 * do comando, sem a barra). O handler de cada 'cmd' fica em src/comandos/index.js (HANDLERS).
 * Formato de cada campo: docs/desenvolvimento.md, seção 'Adicionando ou alterando comandos'
 * (https://jpereira.github.io/zapbot/desenvolvimento/).
 *
 * O "role" é o nível mínimo para usar o comando (src/roles.js): USER (quem está no bot.users),
 * ADMIN (os admins extras e o dono; com `delegavel: true`, o dono libera a um usuário com o
 * /bot +cmd) ou OWNER (só o dono).
 *
 * Jorge Pereira <jpereiran@gmail.com>
 * Copyright (c) 2026 Jorge Pereira · licença MIT
 * https://github.com/jpereira/zapbot
 */

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'definicoes');

// Os arquivos que começam com "_" são apoio (as opções repetidas), não comandos
const commands = fs.readdirSync(DIR)
    .filter(arquivo => arquivo.endsWith('.js') && !arquivo.startsWith('_'))
    .sort()
    .map(arquivo => require(path.join(DIR, arquivo)));

module.exports = { commands };
