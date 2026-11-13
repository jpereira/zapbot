/*
 * /welcome e /goodbye: a mensagem que o bot manda no grupo quando alguém entra (group_join) ou sai
 * (group_leave). Cada grupo tem a sua, na tabela `group_greetings`; sem texto próprio, vale o padrão
 * do idioma. {name} é a pessoa (na entrada, uma menção) e {group}, o nome do grupo.
 */

const { client } = require('./cliente');
const { nomeDaAgenda, nomeDoContato, resolverNomeDoGrupo } = require('./contatos');
const { dbGet, dbPronto, dbRun } = require('./db');
const { t } = require('./i18n');
const { printError, printInfo } = require('./log');

const TIPOS = {
    welcome: { evento: 'group_join', padrao: 'saudacoes.welcomeDefault' },
    goodbye: { evento: 'group_leave', padrao: 'saudacoes.goodbyeDefault' }
};

const MAX_CARACTERES = 1000;

// { text: string|null } (null: o padrão do idioma) ou null (desligada neste grupo)
async function lerSaudacao(chatId, tipo) {
    await dbPronto;
    const linha = await dbGet('SELECT text FROM group_greetings WHERE chat_id = ? AND kind = ?', [chatId, tipo]);
    return linha ? { text: linha.text } : null;
}

async function gravarSaudacao(chatId, tipo, texto) {
    await dbPronto;
    await dbRun(
        `INSERT INTO group_greetings (chat_id, kind, text) VALUES (?, ?, ?)
         ON CONFLICT(chat_id, kind) DO UPDATE SET text = excluded.text`,
        [chatId, tipo, texto]
    );
}

async function apagarSaudacao(chatId, tipo) {
    await dbPronto;
    await dbRun('DELETE FROM group_greetings WHERE chat_id = ? AND kind = ?', [chatId, tipo]);
}

// O texto final: {name} e {group} trocados (o padrão do idioma, sem texto próprio)
function montarTexto(tipo, saudacao, { nome, grupo }) {
    const modelo = saudacao.text ?? t(TIPOS[tipo].padrao);
    return modelo.replace(/\{name\}/g, nome).replace(/\{group\}/g, grupo);
}

// Quem entrou/saiu: a menção (@número) na entrada e o nome da agenda na saída
async function nomeDe(id, mencionar) {
    if (mencionar) return `@${id.split('@')[0]}`;
    const contato = await client.getContactById(id).catch(() => null);
    return (contato && (nomeDaAgenda(contato) || nomeDoContato(contato))) || `+${id.split('@')[0]}`;
}

/**
 * Manda a saudação do grupo para cada pessoa do evento (se o grupo tem uma ligada).
 * @param {'welcome'|'goodbye'} tipo
 * @param {{ chatId: string, recipientIds?: string[] }} notificacao  o GroupNotification do whatsapp-web.js
 */
async function saudar(tipo, notificacao) {
    try {
        const chatId = notificacao.chatId;
        const saudacao = await lerSaudacao(chatId, tipo);
        if (!saudacao) return;

        const souEu = client.info?.wid?._serialized;
        const pessoas = (notificacao.recipientIds ?? []).filter(id => id !== souEu);
        if (!pessoas.length) return;

        const grupo = (await resolverNomeDoGrupo(chatId).catch(() => null)) ?? chatId.split('@')[0];
        for (const id of pessoas) {
            const texto = montarTexto(tipo, saudacao, { nome: await nomeDe(id, tipo === 'welcome'), grupo });
            await client.sendMessage(chatId, texto, tipo === 'welcome' ? { mentions: [id] } : {});
            printInfo(`/${tipo}: ${id} em ${grupo}`);
        }
    } catch (err) {
        printError(`/${tipo}: falhou:`, err.message);
    }
}

for (const [tipo, { evento }] of Object.entries(TIPOS)) {
    client.on(evento, (notificacao) => saudar(tipo, notificacao));
}

module.exports = {
    MAX_CARACTERES,
    TIPOS,
    apagarSaudacao,
    gravarSaudacao,
    lerSaudacao,
    montarTexto,
    saudar
};
