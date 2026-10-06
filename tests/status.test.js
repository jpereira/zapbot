/*
 * /bot -status: o relatório das últimas 24 h e o envio diário (pela agenda).
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { DONO, GRUPO, OUTRO } = bot;
const { verificarAgenda } = bot.src('agenda');
const { fmtQuando } = bot.src('util/quando');

const DIA = 86400_000;

beforeEach(() => bot.reiniciar());

async function apagada(texto, opcoes = {}) {
    const msg = bot.criarMensagem({ texto, de: OUTRO.jid, ...opcoes });
    await bot.entregar(msg);
    return bot.apagar(msg);
}

describe('/bot -status', () => {
    test('relatório das últimas 24 h, com cada contagem', async () => {
        await bot.setSetting('watch.rules', 'pix\nboleto');
        await bot.entregar(bot.criarMensagem({ texto: 'manda o pix', de: OUTRO.jid }));
        await bot.entregar(bot.criarMensagem({ texto: 'outro pix', de: OUTRO.jid }));
        await bot.entregar(bot.criarMensagem({ texto: 'paga o boleto', de: OUTRO.jid }));

        await apagada('uma');
        await apagada('duas');
        await apagada('meu status', { chat: 'status@broadcast' });
        const editada = bot.criarMensagem({ texto: 'a', de: OUTRO.jid });
        await bot.entregar(editada);
        await bot.editar(editada, 'b');

        // Uma apagada antiga não entra nas 24 h
        await bot.dbRun("UPDATE messages SET revoked_at = ? WHERE body = 'duas'", [Date.now() - 2 * DIA]);

        // /mute: um aviso ignorado
        await bot.responder('/mute -d +5521911111111');
        await apagada('silenciada');

        const [r] = await bot.responder('/bot -status');
        assert.match(r, /^📊 \*Status do ZapBot [\d.]+(?: \(devel\))?\* · últimas 24 h\n_[a-zá]{3} \d\d\/\d\d \d\d:\d\d_\n\n/);
        assert.match(r, /🤖 \*No ar:\* .* · conectado: /);
        assert.match(r, /🗄️ \*Cache:\* [\d.]+ \w+ _\(banco [\d.]+ \w+ · mídias [\d.]+ \w+\)_ · \d+ mensagens/);
        assert.match(r, /👀 \*Watch:\* 3 ocorrências _\(#1 pix: 2, #2 boleto: 1\)_/);
        assert.match(r, /🗑️ \*Apagadas:\* 2\n/);   // "uma" e a silenciada (a "duas" é antiga)
        assert.match(r, /✏️ \*Editadas:\* 1\n/);
        assert.match(r, /📸 \*Status apagados:\* 1\n/);
        assert.match(r, /🔇 \*Ignoradas \(\/mute\):\* 1 _\(apagadas 1\)_ · 1 silenciado\n/);
        assert.match(r, /💾 \*Último backup:\* nenhum/);
        assert.match(r, /\n\n🔕 Status diário desligado\.\n💡 _Ligue com \/bot -status 06h \(no horário que quiser\)\._\n\nℹ️ _Mais informações em \/bot -h_$/);
    });

    test('com o aviso desligado, a linha diz como ligar de novo', async () => {
        await bot.setSetting('show.alert.deleted', false);
        await bot.setSetting('show.alert.edited', false);
        await bot.setSetting('show.alert.status', false);

        const [r] = await bot.responder('/bot -status');
        assert.match(r, /🗑️ \*Apagadas:\* 0 _\(aviso desligado; ligue com \/set show\.alert\.deleted on\)_\n/);
        assert.match(r, /✏️ \*Editadas:\* 0 _\(aviso desligado; ligue com \/set show\.alert\.edited on\)_\n/);
        assert.match(r, /📸 \*Status apagados:\* 0 _\(recuperação desligada; ligue com \/set show\.alert\.status on\)_\n/);
        assert.match(r, /🔇 \*Ignoradas \(\/mute\):\* 0\n/);   // ninguém silenciado: sem o "· N silenciados"
    });

    test('-status 06h agenda no seu privado; o relatório mostra no fim; o envio sai pela agenda, todo dia', async () => {
        const [r] = await bot.responder('/bot -status 06h');
        assert.match(r, /^⏰ \*Status diário:\* todo dia às \*06:00\*, no seu privado\.\n📅 Próximo: [a-zá]{3} \d\d\/\d\d 06:00$/);

        assert.match((await bot.responder('/bot -status'))[0], /\n\n⏰ \*Status diário:\* todo dia às \*06:00\*, no seu privado\.\n📅 Próximo: [a-zá]{3} \d\d\/\d\d 06:00\n💡 _Mude com \/bot -status <hora> ou desligue com \/bot -status off\._\n\nℹ️ _Mais informações em \/bot -h_$/);

        // Não aparece na agenda do /cron, nem conta no limite
        assert.match((await bot.responder('/cron'))[0], /📅 Nada agendado/);

        // Trocar a hora substitui; formatos aceitos
        await bot.responder('/bot -status às 18h30');
        const itens = await bot.dbAll("SELECT * FROM schedules WHERE kind = 'status'");
        assert.equal(itens.length, 1);
        assert.equal(fmtQuando(itens[0].due_at).slice(-5), '18:30');

        // Na hora: o relatório vai para o seu privado, e o próximo fica para amanhã
        await bot.dbRun("UPDATE schedules SET due_at = ? WHERE kind = 'status'", [Date.now() - 1000]);
        const antes = bot.client.enviadas.length;
        await verificarAgenda();
        const [enviado] = bot.client.enviadas.slice(antes);
        assert.equal(enviado.chatId, DONO.jid);
        assert.match(enviado.content, /^📊 \*Status do ZapBot/);
        const [proximo] = await bot.dbAll("SELECT due_at FROM schedules WHERE kind = 'status'");
        assert.ok(proximo.due_at > Date.now() && proximo.due_at <= Date.now() + DIA);
    });

    test('-status off desliga; hora inválida; não combina; o /cron -rm all não apaga o status diário', async () => {
        await bot.responder('/bot -status 7h');
        await bot.responder('/cron +1h -to +5521911111111 oi');
        await bot.responder('/cron -rm all');
        assert.equal((await bot.dbAll("SELECT * FROM schedules WHERE kind = 'status'")).length, 1);

        assert.deepEqual(await bot.responder('/bot -status off'), ['🔕 Status diário desligado.']);
        assert.deepEqual(await bot.responder('/bot -status OFF'), ['ℹ️ O status diário já estava desligado.']);
        assert.match((await bot.responder('/bot -s'))[0], /🔕 Status diário desligado/);
        assert.match((await bot.responder('/bot -status 25h'))[0], /❌ Não entendi a hora/);
        assert.match((await bot.responder('/bot -on -status'))[0], /❌ O -status não combina com as outras opções/);
        assert.equal(bot.getSetting('bot.paused'), false);
    });

    test('-status -to: o envio diário em pessoas, grupos e e-mails; sem hora, envia agora', async () => {
        const env = { QRCODE_EMAIL_SMTP_HOST: 'smtp.exemplo.com', QRCODE_EMAIL_SMTP_USER: 'bot@exemplo.com', QRCODE_EMAIL_SMTP_TO: 'eu@exemplo.com' };
        Object.assign(process.env, env);
        try {
            const [r] = await bot.responder('/bot -s 06h -to /Fulano/ -to email');
            assert.match(r, /^⏰ \*Status diário:\* todo dia às \*06:00\* → 👤 Fulano, 📧 eu@exemplo\.com\n📅 Próximo: /);
            assert.match((await bot.responder('/bot -s'))[0], /\n⏰ \*Status diário:\* todo dia às \*06:00\* → 👤 Fulano, 📧 eu@exemplo\.com\n/);

            // Trocar só a hora mantém os destinos
            assert.match((await bot.responder('/bot -s 07h'))[0], /às \*07:00\* → 👤 Fulano, 📧 eu@exemplo\.com\n/);

            // Na hora: no Fulano e por e-mail (sem a formatação do WhatsApp)
            await bot.dbRun("UPDATE schedules SET due_at = ? WHERE kind = 'status'", [Date.now() - 1000]);
            const antes = bot.client.enviadas.length;
            await verificarAgenda();
            const enviados = bot.client.enviadas.slice(antes);
            assert.deepEqual(enviados.map(e => e.chatId), [OUTRO.jid]);
            assert.match(enviados[0].content, /^📊 \*Status do ZapBot/);
            assert.equal(bot.emails.at(-1).to, 'eu@exemplo.com');
            assert.match(bot.emails.at(-1).subject, /📊 Status do ZapBot/);
            assert.match(bot.emails.at(-1).text, /^📊 Status do ZapBot/);

            // Sem hora: envia agora, sem a lista de quem usa
            await bot.setSetting('bot.users', ['5521911111111']);
            const agora = await bot.executar('/bot -s -to /Fulano/');
            assert.equal(agora[0].chatId, OUTRO.jid);
            assert.doesNotMatch(agora[0].texto, /Usuários/);
            assert.equal(agora[1].texto, '📊 Status enviado em 👤 Fulano.');

            // Erros: -to sem -status, -to com off
            assert.match((await bot.responder('/bot -to /Fulano/'))[0], /❌ O -to é do -status/);
            assert.match((await bot.responder('/bot -s off -to /Fulano/'))[0], /❌ O -to não vale com o off/);
        } finally {
            for (const k of Object.keys(env)) delete process.env[k];
        }
    });

    test('só o dono', async () => {
        assert.deepEqual(await bot.responder('/bot -status', { de: OUTRO.jid, chat: GRUPO }), []);
        assert.deepEqual(await bot.responder('/status'),
            ["⚠️ Comando '/status' desconhecido, tente: /help"], 'o /status virou /bot -status');
    });
});
