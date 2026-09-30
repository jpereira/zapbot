/*
 * O cliente do whatsapp-web.js e a marca das mensagens enviadas pelo próprio bot.
 */

const { Client, LocalAuth } = require('whatsapp-web.js');

const { printError, printSuccess } = require('./log');

/*
 * Utilitários de contato
 */
function messageToSelf(message) {
    return client.sendMessage(process.env.PHONE_NUMBER, message)
        .catch(err => printError('messageToSelf falhou:', err.message));
}

const client = new Client({
    authStrategy: new LocalAuth(),

    webVersion: '2.3000.1023151854-alpha',

    /*
     * Sem cache remoto: o HTML de um repo de terceiros (branch main) rodaria na
     * origem web.whatsapp.com, com acesso à sessão. O WhatsApp Web é carregado
     * direto do site oficial.
     */
    webVersionCache: { type: 'none' },

    puppeteer: {
        headless: true,
        // No Windows, remova executablePath e args.
        executablePath: '/usr/bin/chromium-browser',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    }
});

printSuccess('Client created');

/*
 * Mensagens enviadas pelo próprio bot também disparam 'message_create' com
 * fromMe=true. Sem esta marca, uma resposta que começasse com "/" (ex.: o
 * /noffa ecoando "/cache -c -f") rodaria como comando do dono.
 *
 * msg.reply() também passa por client.sendMessage(). O texto é registrado
 * ANTES do envio porque o evento pode chegar antes do sendMessage resolver.
 */
const ENVIADAS_TTL_MS = 60 * 1000;
const enviadasPeloBot = new Map(); // texto -> [expira em, ...]

function textoDoEnvio(content, options = {}) {
    if (typeof content === 'string') return content;
    return options.caption ?? content?.description ?? null;
}

function marcarEnviadaPeloBot(texto) {
    texto = String(texto ?? '').trim();
    if (!texto.startsWith('/')) return; // só o que poderia virar comando

    const agora = Date.now();
    const validas = (enviadasPeloBot.get(texto) ?? []).filter(t => t > agora);
    enviadasPeloBot.set(texto, [...validas, agora + ENVIADAS_TTL_MS]);
}

// Consome a marca: true se esta mensagem foi enviada pelo bot
function foiEnviadaPeloBot(texto) {
    texto = String(texto ?? '').trim();

    const agora = Date.now();
    const validas = (enviadasPeloBot.get(texto) ?? []).filter(t => t > agora);
    if (!validas.length) {
        enviadasPeloBot.delete(texto);
        return false;
    }

    validas.shift();
    if (validas.length) enviadasPeloBot.set(texto, validas);
    else enviadasPeloBot.delete(texto);
    return true;
}

/*
 * /stats: as respostas do bot saem pela sua conta e voltam no 'message_create'
 * como suas. Cada envio deixa uma marca no chat; a próxima mensagem sua ali
 * consome a marca e não é contada.
 */
const enviosDoBotPorChat = new Map(); // chatId -> [expira em, ...]

function marcarEnvioDoBot(chatId) {
    const agora = Date.now();
    const validas = (enviosDoBotPorChat.get(chatId) ?? []).filter(t => t > agora);
    enviosDoBotPorChat.set(chatId, [...validas, agora + ENVIADAS_TTL_MS]);
}

function consumirEnvioDoBot(chatId) {
    const agora = Date.now();
    const validas = (enviosDoBotPorChat.get(chatId) ?? []).filter(t => t > agora);
    const achou = validas.length > 0;

    validas.shift();
    if (validas.length) enviosDoBotPorChat.set(chatId, validas);
    else enviosDoBotPorChat.delete(chatId);
    return achou;
}

const sendMessageOriginal = client.sendMessage.bind(client);

client.sendMessage = (chatId, content, options = {}) => {
    marcarEnviadaPeloBot(textoDoEnvio(content, options));
    marcarEnvioDoBot(chatId);
    return sendMessageOriginal(chatId, content, options);
};

// Marcas que nunca viraram 'message_create' (envio falhou) expiram aqui
function limparMarcasExpiradas() {
    const agora = Date.now();
    for (const [texto, expiracoes] of enviadasPeloBot) {
        if (!expiracoes.some(t => t > agora)) enviadasPeloBot.delete(texto);
    }
    for (const [chatId, expiracoes] of enviosDoBotPorChat) {
        if (!expiracoes.some(t => t > agora)) enviosDoBotPorChat.delete(chatId);
    }
}

// Chamada no app.js
function iniciarLimpezaDasMarcas() {
    setInterval(limparMarcasExpiradas, ENVIADAS_TTL_MS);
}

module.exports = {
    client,
    consumirEnvioDoBot,
    foiEnviadaPeloBot,
    iniciarLimpezaDasMarcas,
    marcarEnviadaPeloBot,
    messageToSelf
};
