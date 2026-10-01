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

        // /mudo: um aviso ignorado
        await bot.responder('/mudo -d +5521911111111');
        await apagada('silenciada');

        const [r] = await bot.responder('/bot -status');
        assert.match(r, /^📊 \*Status do ZapBot [\d.]+\* · últimas 24 h\n_\w{3} \d\d\/\d\d \d\d:\d\d_\n\n/);
        assert.match(r, /🤖 \*No ar:\* .* · conectado: /);
        assert.match(r, /🗄️ \*Cache:\* [\d.]+ \w+ _\(banco [\d.]+ \w+ · mídias [\d.]+ \w+\)_ · \d+ mensagens/);
        assert.match(r, /👀 \*Watch:\* 3 ocorrências _\(#1 pix: 2, #2 boleto: 1\)_/);
        assert.match(r, /🗑️ \*Apagadas:\* 2\n/);   // "uma" e a silenciada (a "duas" é antiga)
        assert.match(r, /✏️ \*Editadas:\* 1\n/);
        assert.match(r, /📸 \*Status apagados:\* 1\n/);
        assert.match(r, /🔇 \*Ignoradas \(\/mudo\):\* 1 _\(apagadas 1\)_/);
        assert.match(r, /💾 \*Último backup:\* nenhum/);
        assert.match(r, /\n\n🔕 Status diário desligado\.\n💡 _Ligue com \/bot -status 06h \(no horário que quiser\)\._$/);
    });

    test('-status 06h agenda no seu privado; o relatório mostra no fim; o envio sai pela agenda, todo dia', async () => {
        const [r] = await bot.responder('/bot -status 06h');
        assert.match(r, /^⏰ \*Status diário:\* todo dia às \*06:00\*, no seu privado\.\n📅 Próximo: \w{3} \d\d\/\d\d 06:00$/);

        assert.match((await bot.responder('/bot -status'))[0], /\n\n⏰ \*Status diário:\* todo dia às \*06:00\*, no seu privado\.\n📅 Próximo: \w{3} \d\d\/\d\d 06:00\n💡 _Mude com \/bot -status <hora> ou desligue com \/bot -status off\._$/);

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
        await bot.responder('/cron 1h -to +5521911111111 oi');
        await bot.responder('/cron -rm all');
        assert.equal((await bot.dbAll("SELECT * FROM schedules WHERE kind = 'status'")).length, 1);

        assert.deepEqual(await bot.responder('/bot -status off'), ['🔕 Status diário desligado.']);
        assert.deepEqual(await bot.responder('/bot -status OFF'), ['ℹ️ O status diário já estava desligado.']);
        assert.match((await bot.responder('/bot -s'))[0], /🔕 Status diário desligado/);
        assert.match((await bot.responder('/bot -status 25h'))[0], /❌ Não entendi a hora/);
        assert.match((await bot.responder('/bot -on -status'))[0], /❌ O -status não combina com as outras opções/);
        assert.equal(bot.getSetting('bot.paused'), false);
    });

    test('só o dono', async () => {
        assert.deepEqual(await bot.responder('/bot -status', { de: OUTRO.jid, chat: GRUPO }), []);
        assert.deepEqual(await bot.responder('/status'), [], 'o /status virou /bot -status');
    });
});
