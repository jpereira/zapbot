/*
 * Criação das tabelas, carga dos settings e das pastas de cache: o que precisa rodar antes de o banco ser usado.
 */

const fs = require('fs-extra');

const { MEDIA_DIR, TMP_DIR } = require('./constantes');
const { dbAll, dbRun } = require('./db');
const { printInfo } = require('./log');
const { carregarSettings } = require('./settings');

/*
 * Colunas novas numa tabela que já existe: o CREATE TABLE IF NOT EXISTS não
 * mexe numa tabela criada por uma versão anterior.
 */
async function adicionarColunas(tabela, colunas) {
    const existentes = new Set((await dbAll(`PRAGMA table_info(${tabela})`)).map(c => c.name));

    for (const [coluna, tipo] of Object.entries(colunas)) {
        if (existentes.has(coluna)) continue;
        await dbRun(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${tipo}`);
        printInfo(`Coluna ${tabela}.${coluna} criada`);
    }
}

/*
 * Criação das tabelas.
 * Tudo em sequência (await): antes, o CREATE TABLE podia ainda não ter
 * terminado quando a primeira consulta chegava.
 *
 * Handlers que usam o banco fazem `await dbPronto` antes de consultar.
 */
async function inicializarBanco() {
    // Histórico de quando os contatos monitorados ficam online
    await dbRun(`
        CREATE TABLE IF NOT EXISTS presence_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone_number TEXT,
            display_name TEXT,
            status TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Números monitorados via /monitor
    await dbRun(`
        CREATE TABLE IF NOT EXISTS monitored_numbers (
            phone_number TEXT PRIMARY KEY,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Mensagens recebidas (para recuperar as apagadas)
    await dbRun(`
        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,

            sender_name TEXT,
            sender_jid TEXT,
            sender_number TEXT,

            chat_id TEXT,
            chat_name TEXT,
            is_group INTEGER DEFAULT 0,

            body TEXT,
            type TEXT,

            timestamp INTEGER,

            has_media INTEGER DEFAULT 0,
            media_path TEXT,

            location_lat REAL,
            location_lng REAL,

            raw_json TEXT,

            revoked INTEGER DEFAULT 0,
            revoked_at INTEGER,

            from_me INTEGER DEFAULT 0
        )
    `);
    // from_me: enviada pela sua conta (no privado, sender_* é o outro participante)
    await adicionarColunas('messages', { from_me: 'INTEGER DEFAULT 0' });

    // Consulta do /show: apagadas de um chat, das mais recentes para as mais antigas
    await dbRun('CREATE INDEX IF NOT EXISTS idx_messages_chat_revoked ON messages (chat_id, revoked, revoked_at)');

    /*
     * Mensagens editadas (para o /show -e): uma linha por edição, com o texto de
     * antes e o de depois. UNIQUE(message_id, edited_at): o WhatsApp Web avisa
     * a mesma edição mais de uma vez (body e caption), mas ela é gravada uma só.
     */
    await dbRun(`
        CREATE TABLE IF NOT EXISTS message_edits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            message_id TEXT NOT NULL,
            chat_id TEXT,
            chat_name TEXT,
            is_group INTEGER DEFAULT 0,
            sender_name TEXT,
            sender_number TEXT,
            type TEXT,
            old_body TEXT,
            new_body TEXT,
            timestamp INTEGER,
            edited_at INTEGER,
            UNIQUE (message_id, edited_at)
        )
    `);
    await dbRun('CREATE INDEX IF NOT EXISTS idx_message_edits_chat ON message_edits (chat_id, edited_at)');

    /*
     * Estatísticas do /stats: contadores por chat, dia, hora e remetente.
     * As mensagens comuns saem do banco em 68 h; os contadores ficam
     * 'stats.retentionDays' dias.
     */
    await dbRun(`
        CREATE TABLE IF NOT EXISTS stats (
            chat_id TEXT NOT NULL,
            chat_name TEXT,
            is_group INTEGER DEFAULT 0,
            day TEXT NOT NULL,
            hour INTEGER NOT NULL,
            sender_id TEXT NOT NULL,
            sender_name TEXT,
            msgs INTEGER DEFAULT 0,
            media INTEGER DEFAULT 0,
            deleted INTEGER DEFAULT 0,
            edited INTEGER DEFAULT 0,
            PRIMARY KEY (chat_id, day, hour, sender_id)
        )
    `);
    await dbRun('CREATE INDEX IF NOT EXISTS idx_stats_chat_day ON stats (chat_id, day)');

    /*
     * Alertas de preço do /cotacao -alerta e do /crypto -alerta (disparam uma
     * vez e saem). dest_*: o chat do aviso (-to); vazio = o seu privado.
     */
    await dbRun(`
        CREATE TABLE IF NOT EXISTS price_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL,
            symbol TEXT NOT NULL,
            op TEXT NOT NULL,
            target REAL NOT NULL,
            price_at_creation REAL,
            created_at INTEGER NOT NULL,
            dest_id TEXT,
            dest_name TEXT,
            dest_is_group INTEGER DEFAULT 0
        )
    `);
    await adicionarColunas('price_alerts', { dest_id: 'TEXT', dest_name: 'TEXT', dest_is_group: 'INTEGER DEFAULT 0' });

    /*
     * Enquetes da sua conta (as do /enquete e as que chegam com os votos) e os
     * votos, um por pessoa: o 'vote_update' traz a escolha atual de quem votou.
     */
    await dbRun(`
        CREATE TABLE IF NOT EXISTS polls (
            id TEXT PRIMARY KEY,
            chat_id TEXT NOT NULL,
            chat_name TEXT,
            question TEXT,
            options TEXT,
            multi INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL
        )
    `);
    await dbRun('CREATE INDEX IF NOT EXISTS idx_polls_chat ON polls (chat_id, created_at)');

    await dbRun(`
        CREATE TABLE IF NOT EXISTS poll_votes (
            poll_id TEXT NOT NULL,
            voter TEXT NOT NULL,
            voter_name TEXT,
            options TEXT,
            voted_at INTEGER,
            PRIMARY KEY (poll_id, voter)
        )
    `);

    /*
     * Agenda do /agendar: mensagens e lembretes (kind). due_at é
     * o próximo envio; com repeat, ele avança a cada envio (day_of_month guarda
     * o dia original do mensal, para um 31 voltar a 31 depois de fevereiro).
     */
    await dbRun(`
        CREATE TABLE IF NOT EXISTS schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL,
            chat_id TEXT NOT NULL,
            chat_name TEXT,
            is_group INTEGER DEFAULT 0,
            text TEXT NOT NULL,
            due_at INTEGER NOT NULL,
            repeat TEXT,
            day_of_month INTEGER,
            quoted_id TEXT,
            created_at INTEGER NOT NULL
        )
    `);
    await dbRun('CREATE INDEX IF NOT EXISTS idx_schedules_due ON schedules (due_at)');

    // Posições DeFi do /defi (por enquanto, da Orca): o resto é lido on-chain a cada -show
    await dbRun(`
        CREATE TABLE IF NOT EXISTS defi_positions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            protocol TEXT NOT NULL,
            position TEXT NOT NULL UNIQUE,
            nft TEXT,
            pool TEXT,
            created_at INTEGER NOT NULL
        )
    `);

    // Configurações gerais do bot (chave -> valor em JSON)
    await dbRun(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Ocorrências do /watch: mensagens que casaram com alguma regra do setting 'watch.rules'.
    // UNIQUE(rule, message_id): a mesma mensagem não gera dois avisos para a mesma regra.
    await dbRun(`
        CREATE TABLE IF NOT EXISTS watch_hits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rule TEXT NOT NULL,
            message_id TEXT NOT NULL,
            chat_id TEXT,
            chat_name TEXT,
            is_group INTEGER DEFAULT 0,
            sender_name TEXT,
            sender_number TEXT,
            body TEXT,
            timestamp INTEGER,
            UNIQUE (rule, message_id)
        )
    `);
    await dbRun('CREATE INDEX IF NOT EXISTS idx_watch_hits_rule ON watch_hits (rule, timestamp)');

    await carregarSettings();

    for (const dir of [MEDIA_DIR, TMP_DIR]) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            printInfo(`Creating ${dir}`);
        }
    }
}

module.exports = {
    adicionarColunas,
    inicializarBanco
};
