/*
 * /watch (/w): text and regex rules, private notices and the command options.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, OTHERAlt } = bot;
const { compileRuleWatch } = bot.src('watch/rules');

beforeEach(bot.restart);

// Someone writes in the group; returns the notices the bot sent
const someoneWrite = (textAlt, optionsAlt = {}) => bot.executar(textAlt, { de: OTHERAlt.jid, ...optionsAlt });

describe('regras', () => {
    test('texto: contém, sem diferenciar maiúsculas nem acentos', () => {
        const rule = compileRuleWatch('Reunião');
        assert.equal(rule('a REUNIAO de amanhã'), true);
        assert.equal(rule('reuniões'), false);
    });

    test('regex com flags (g e y são ignoradas)', () => {
        assert.equal(compileRuleWatch('/pix|boleto/i')('Me manda o PIX'), true);
        const g = compileRuleWatch('/a/g');
        assert.equal(g('a'), true);
        assert.equal(g('a'), true); // without the g flag, lastIndex does not get in the way
    });

    test('inválidas: regex quebrada, vazia ou longa demais', () => {
        assert.throws(() => compileRuleWatch('/[/'), /regex inválida/);
        assert.throws(() => compileRuleWatch(''), /1 a 200/);
        assert.throws(() => compileRuleWatch('x'.repeat(201)), /1 a 200/);
    });
});

describe('detecção', () => {
    test('status resolve o autor LID e ignora nomes alheios nos metadados', async () => {
        await bot.setSetting('watch.rules', '/Defesa.*Civil/');
        const author = '67658770853938@lid';
        const phoneAlt = '5521999999988@c.us';
        bot.client.lids.set(author, phoneAlt);
        bot.createContact(phoneAlt, 'Defesa Civil');
        bot.createContact('status@broadcast', 'Fátima');
        const msg = bot.createMessage({
            texto: 'Centro de Monitoramento da Defesa Civil de Niterói informa',
            chat: 'status@broadcast', de: OTHERAlt.jid,
            extras: {
                from: 'status@broadcast', author: '67658770853938:12@lid', isStatus: true,
                _data: { notifyName: 'Fátima', chat: { name: 'Fátima' } }
            }
        });
        const [notice] = await bot.deliver(msg);
        assert.match(notice.texto, /👤 \*Nome:\* Defesa Civil/);
        assert.match(notice.texto, /📱 \*Número:\* \+5521999999988/);
        assert.doesNotMatch(notice.texto, /Fátima/);
        const salvo = await bot.dbGet('SELECT * FROM messages WHERE id = ?', [msg.id.id]);
        assert.equal(salvo.sender_jid, phoneAlt);
        assert.equal(salvo.sender_name, 'Defesa Civil');
        assert.equal(salvo.chat_name, 'Status de Defesa Civil');
        const hit = await bot.dbGet('SELECT * FROM watch_hits WHERE message_id = ?', [msg.id.id]);
        assert.equal(hit.sender_name, 'Defesa Civil');
        assert.equal(hit.sender_number, '5521999999988');
        assert.equal(hit.chat_name, 'Status de Defesa Civil');
    });

    test('broadcast sem telefone mantém LID do autor, sem inventar número', async () => {
        await bot.setSetting('watch.rules', 'alerta');
        bot.createContact('67658770853939@lid', 'Defesa Civil sem telefone');
        const [notice] = await someoneWrite('alerta de chuva', {
            chat: '123@broadcast',
            extras: { from: '123@broadcast', author: undefined,
                _data: { participant: { _serialized: '67658770853939@lid' }, notifyName: 'Fátima' } }
        });
        assert.match(notice.texto, /Nome:\* Defesa Civil sem telefone/);
        assert.match(notice.texto, /Número:\* Número indisponível/);
        assert.doesNotMatch(notice.texto, /Fátima/);
        const hit = await bot.dbGet('SELECT * FROM watch_hits');
        assert.equal(hit.chat_name, 'Transmissão de Defesa Civil sem telefone');
    });

    test('status sem autor usa origem desconhecida, sem atribuir notifyName a uma pessoa', async () => {
        await bot.setSetting('watch.rules', 'alerta');
        const [notice] = await someoneWrite('alerta de chuva', {
            chat: 'status@broadcast',
            extras: { from: 'status@broadcast', author: undefined,
                _data: { notifyName: 'Fátima', chat: { name: 'Defesa Civil' } } }
        });
        assert.match(notice.texto, /Nome:\* Desconhecido/);
        assert.match(notice.texto, /Número:\* Número indisponível/);
        assert.doesNotMatch(notice.texto, /Fátima|Defesa Civil/);
        const hit = await bot.dbGet('SELECT * FROM watch_hits');
        assert.equal(hit.chat_name, 'Status');
    });

    test('mensagem que casa: grava e avisa no seu privado', async () => {
        await bot.setSetting('watch.rules', 'promoção\n/pix/i');
        const notices = await someoneWrite('olha a PROMOCAO do pix');

        assert.equal(notices.length, 1);
        assert.equal(notices[0].chatId, OWNER.jid);
        assert.match(notices[0].texto, /👀 \*WATCH: MENSAGEM DETECTADA\*/);
        assert.match(notices[0].texto, /🔎 \*Regra #1:\* promoção\n🔎 \*Regra #2:\* \/pix\/i/);
        assert.match(notices[0].texto, /👥 \*Grupo:\* Família\n👤 \*Nome:\* Fulano/);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM watch_hits')).n, 2);
    });

    test('não avisa: suas mensagens, comandos, sem casar, repetida e /watch desativado', async () => {
        await bot.setSetting('watch.rules', 'pix');
        assert.deepEqual(await bot.executar('meu pix'), []);                  // your
        const commandAltAlt = await someoneWrite('/noffa pix');             // command: only its reply
        assert.ok(!commandAltAlt.some(e => /WATCH/.test(e.texto)));
        assert.deepEqual(await someoneWrite('nada a ver'), []);

        const msg = bot.createMessage({ texto: 'pix', de: OTHERAlt.jid, id: 'REPETIDA' });
        assert.equal((await bot.deliver(msg)).length, 1);
        assert.equal((await bot.deliver(msg)).length, 0);

        await bot.setSetting('commands.disabled', 'watch');
        assert.deepEqual(await someoneWrite('outro pix'), []);
    });

    test('/mute (de qualquer tipo): sem aviso no privado, mas a ocorrência fica guardada', async () => {
        await bot.setSetting('watch.rules', 'pix');
        await bot.replyAlt(`/mute -e +${OTHERAlt.user}`);
        assert.deepEqual(await someoneWrite('manda o pix'), []);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM watch_hits')).n, 1);
        assert.equal((await bot.dbGet("SELECT COUNT(*) AS n FROM mute_hits WHERE kind = 'watch'")).n, 1);

        await bot.replyAlt('/unmute -all');
        await bot.replyAlt('/mute -s /Família/');
        assert.deepEqual(await someoneWrite('outro pix'), []);

        await bot.replyAlt('/unmute -all');
        assert.equal((await someoneWrite('mais um pix')).length, 1);
    });

    test('menções cruas viram nomes no aviso', async () => {
        await bot.setSetting('watch.rules', 'oi');
        const [notice] = await someoneWrite(`oi @${OTHERAlt.user}`, { mencoes: [OTHERAlt.jid] });
        assert.match(notice.texto, /"oi @Fulano"/);
    });
});

describe('/watch', () => {
    test('cria texto e regex diretamente; aspas e espaços são mantidos', async () => {
        assert.match((await bot.replyAlt('/watch promoção relâmpago'))[0], /✅ Regra \*#1\* adicionada _\(texto\)_: promoção relâmpago/);
        assert.match((await bot.replyAlt('/w "/pix|boleto/i"'))[0], /✅ Regra \*#2\* adicionada _\(regex\)_: \/pix\|boleto\/i/);
        assert.deepEqual(bot.getSetting('watch.rules'), ['promoção relâmpago', '/pix|boleto/i']);
    });

    test('recusa opção inválida, regra repetida, inválida e limite de regras', async () => {
        assert.match((await bot.replyAlt('/watch -add'))[0], /Uso: \/watch/);
        await bot.replyAlt('/watch pix');
        assert.match((await bot.replyAlt('/watch pix'))[0], /ℹ️ A regra #1 já existe: pix/);
        assert.match((await bot.replyAlt('/watch /[/'))[0], /❌/);

        await bot.setSetting('watch.max', 1);
        assert.match((await bot.replyAlt('/watch outra'))[0], /❌ Limite de 1 regras atingido/);
    });

    test('-l lista as regras com as ocorrências, no chat onde foi digitado', async () => {
        assert.match((await bot.replyAlt('/watch -l'))[0], /Nenhuma regra cadastrada/);

        await bot.setSetting('watch.rules', 'pix\nboleto');
        await someoneWrite('pix');
        const r = await bot.executar('/watch -l');
        assert.equal(r.length, 1);
        assert.equal(r[0].chatId, bot.GROUP);
        assert.match(r[0].texto, /#1  pix  \(1\)\n#2  boleto  \(0\)/);

        const [here] = await bot.executar('/watch -s');
        assert.equal(here.chatId, bot.GROUP);
        assert.match(here.texto, /WATCH/);
    });

    test('listagem com ocorrências de todas; -s N de uma regra', async () => {
        await bot.setSetting('watch.rules', 'pix\nboleto');
        await someoneWrite('pix 1');
        await someoneWrite('boleto 1');

        const allAlt = (await bot.executar('/watch', { chat: OWNER.jid }))[0].texto;
        assert.match(allAlt, /🔎 \*Regras:\* todas\n📦 \*Total:\* 2/);
        // Each occurrence with the no. of the rule that matched (the order is by time; here they tie)
        assert.match(allAlt, /· 🔎 #1\n.*\n    💬 "pix 1"/);
        assert.match(allAlt, /· 🔎 #2\n.*\n    💬 "boleto 1"/);

        const aAlt = (await bot.executar('/watch -s 2', { chat: OWNER.jid }))[0].texto;
        assert.match(aAlt, /🔎 \*Regra #2:\* boleto\n📦 \*Total:\* 1/);
        assert.doesNotMatch(aAlt, /pix 1/);

        assert.match((await bot.replyAlt('/watch -s 9'))[0], /❌ A regra #9 não existe\. Existem 2 regras/);
    });

    test('-s respeita o watch.showMax', async () => {
        await bot.setSetting('watch.rules', 'pix');
        await bot.setSetting('watch.showMax', 1);
        await someoneWrite('pix a');
        await someoneWrite('pix b');
        const [r] = await bot.replyAlt('/watch -s', { chat: OWNER.jid });
        assert.match(r, /📦 \*Total:\* 2 _\(exibindo as 1 mais recentes\)_/);
    });

    test('-rem (-r) remove a regra e as ocorrências dela', async () => {
        await bot.setSetting('watch.rules', 'pix\nboleto');
        await someoneWrite('pix');
        const [r] = await bot.replyAlt('/watch -r 1');
        assert.match(r, /🗑️ Regra \*#1\* removida: pix\n🗄️ Ocorrências apagadas: \*1\*\n💡 _As regras seguintes foram renumeradas/);
        assert.deepEqual(bot.getSetting('watch.rules'), ['boleto']);

        assert.match((await bot.replyAlt('/watch -r 5'))[0], /❌ A regra #5 não existe/);
        assert.match((await bot.replyAlt('/watch -r'))[0], /Uso: \/watch/);
    });

    test('-f apaga as ocorrências (de todas ou de uma) e mantém as regras', async () => {
        await bot.setSetting('watch.rules', 'pix\nboleto');
        await someoneWrite('pix');
        await someoneWrite('boleto');

        assert.match((await bot.replyAlt('/watch -f 2'))[0], /Flush das ocorrências da regra #2:\* boleto\n🗄️ Ocorrências apagadas: \*1\*/);
        assert.match((await bot.replyAlt('/watch -f'))[0], /Flush das ocorrências de todas as regras\*\n🗄️ Ocorrências apagadas: \*1\*/);
        assert.deepEqual(bot.getSetting('watch.rules'), ['pix', 'boleto']);
    });

    test('só o dono usa', async () => {
        assert.deepEqual(await bot.replyAlt('/watch x', { de: OTHERAlt.jid }), []);
        assert.deepEqual(bot.getSetting('watch.rules'), []);
    });
});

describe('/watch -to', () => {
    const L200 = '120363000000000200@g.us';

    beforeEach(() => bot.createGroup(L200, 'Grupo sobre L200', [OWNER.jid]));

    test('regra com -to avisa no destino; sem -to, no seu privado', async () => {
        assert.match((await bot.replyAlt('/watch promoção -to /Grupo sobre L200/'))[0],
            /^✅ Regra \*#1\* adicionada _\(texto\)_: promoção\n💡 _Avisos em 👥 Grupo sobre L200\._$/);
        await bot.replyAlt('/watch pix');

        const notices = await someoneWrite('promoção no pix');
        assert.deepEqual(notices.map(a => a.chatId).sort(), [OWNER.jid, L200].sort());
        assert.match(notices.find(a => a.chatId === L200).texto, /🔎 \*Regra #1:\* promoção\n👥/);
        assert.match(notices.find(a => a.chatId === OWNER.jid).texto, /🔎 \*Regra #2:\* pix\n👥/);

        const [list] = await bot.replyAlt('/watch -l');
        assert.match(list, /#1  promoção  \(1\)  → 👥 Grupo sobre L200\n#2  pix  \(1\)/);

        // /mute only cuts the notice in your private chat: -to keeps receiving
        await bot.replyAlt(`/mute +${OTHERAlt.user}`);
        const muted = await someoneWrite('outra promoção no pix');
        assert.deepEqual(muted.map(a => a.chatId), [L200]);
    });

    test('-s N -to troca destinos; off volta ao privado; -rem apaga os destinos', async () => {
        await bot.replyAlt('/watch pix');
        assert.deepEqual(await bot.replyAlt('/watch -s 1 -to /Fulano/'), ['📣 Regra *#1* (pix): os avisos vão para *👤 Fulano*.']);
        assert.equal((await someoneWrite('pix'))[0].chatId, OTHERAlt.jid);

        assert.deepEqual(await bot.replyAlt('/watch -s 1 -to off'), ['📣 Regra *#1* (pix): os avisos vão para *seu privado*.']);
        assert.equal((await someoneWrite('outro pix'))[0].chatId, OWNER.jid);

        await bot.replyAlt('/watch -s 1 -to /Fulano/');
        await bot.replyAlt('/watch -r 1');
        assert.deepEqual(await bot.dbAll('SELECT * FROM watch_destinations'), []);
    });

    test('vários -to: a regra avisa em todos, juntando as regras de cada destino', async () => {
        assert.match((await bot.replyAlt('/watch promoção -to /Grupo sobre L200/ -to /Fulano/ -to /Fulano/'))[0],
            /💡 _Avisos em 👥 Grupo sobre L200, 👤 Fulano\._$/);
        await bot.replyAlt('/watch pix -to /Fulano/');

        const notices = await someoneWrite('promoção no pix');
        assert.deepEqual(notices.map(a => a.chatId).sort(), [L200, OTHERAlt.jid].sort());
        assert.match(notices.find(a => a.chatId === OTHERAlt.jid).texto, /🔎 \*Regra #1:\* promoção\n🔎 \*Regra #2:\* pix\n/);
        assert.match((await bot.replyAlt('/watch -l'))[0], /#1  promoção  \(1\)  → 👥 Grupo sobre L200, 👤 Fulano/);

        // -N with several -to changes all; off does not mix with others
        assert.deepEqual(await bot.replyAlt('/watch -s 2 -to /Fulano/ -to /Grupo sobre L200/'),
            ['📣 Regra *#2* (pix): os avisos vão para *👤 Fulano, 👥 Grupo sobre L200*.']);
        assert.match((await bot.replyAlt('/watch -s 2 -to off -to /Fulano/'))[0], /❌ O -to off volta ao seu privado: use-o sozinho/);
        assert.deepEqual(await bot.replyAlt('/watch -s 2 -to off'), ['📣 Regra *#2* (pix): os avisos vão para *seu privado*.']);
    });

    test('-to email: o aviso vai por e-mail', async () => {
        const env = { QRCODE_EMAIL_SMTP_HOST: 'smtp.exemplo.com', QRCODE_EMAIL_SMTP_USER: 'bot@exemplo.com', QRCODE_EMAIL_SMTP_TO: 'Eu <eu@exemplo.com>' };
        Object.assign(process.env, env);
        try {
            await bot.replyAlt('/watch "vaga" -to email');
            assert.deepEqual(await someoneWrite('tem vaga aqui'), [], 'nada no WhatsApp');
            const [m] = bot.emails;
            assert.equal(m.to, 'eu@exemplo.com');
            assert.equal(m.subject, '[ZapBot] 👀 Watch: #1 vaga');
            assert.match(m.text, /^👀 WATCH: MENSAGEM DETECTADA\n\n🔎 Regra #1: vaga\n/);
        } finally {
            for (const v of Object.keys(env)) delete process.env[v];
        }
    });

    test('erros: -to sem regra, regra que não existe, destino inválido (a regra não é criada)', async () => {
        await bot.replyAlt('/watch pix');
        assert.match((await bot.replyAlt('/watch -to /Fulano/'))[0], /❌ Use o -to ao adicionar/);
        assert.match((await bot.replyAlt('/watch -s 9 -to /Fulano/'))[0], /A regra #9 não existe/);
        assert.match((await bot.replyAlt('/watch boleto -to xyz'))[0], /❌ Nenhum contato ou grupo com "xyz"/);
        assert.deepEqual(bot.getSetting('watch.rules'), ['pix']);
    });
});

describe('/watch com origem e listagem', () => {
    test('sem argumentos lista regras; com hits acrescenta ocorrências recentes e dicas', async () => {
        await bot.replyAlt('/watch /pix/i');
        const [without] = await bot.replyAlt('/watch');
        assert.match(without, /WATCH: REGRAS/);
        assert.match(without, /#1  \/pix\/i  \(0\)/);
        assert.doesNotMatch(without, /WATCH: OCORRÊNCIAS/);
        await someoneWrite('pix antigo', { timestamp: 1 });
        await someoneWrite('pix recente', { timestamp: 2 });
        await bot.dbRun("UPDATE watch_hits SET timestamp = 1 WHERE body = 'pix antigo'");
        const [r] = await bot.replyAlt('/watch -1');
        assert.match(r, /WATCH: REGRAS[\s\S]*WATCH: OCORRÊNCIAS/);
        assert.match(r, /Total:\* 2 _\(exibindo as 1 mais recentes\)_/);
        assert.match(r, /pix recente/);
        assert.doesNotMatch(r, /pix antigo/);
        assert.match(r, /\/watch -s N -to/);
        assert.match((await bot.replyAlt('/watch -0'))[0], /quantidade/);
    });

    test('-in contato filtra o remetente no grupo, no privado e em status', async () => {
        const [r] = await bot.replyAlt('/watch /pix/i -in /Fulano/');
        assert.match(r, /Apenas em 👤 Fulano/);
        assert.equal((await someoneWrite('PIX aqui')).length, 1);
        assert.equal((await someoneWrite('PIX privado', { chat: OTHERAlt.jid })).length, 1);
        assert.equal((await someoneWrite('PIX status', { chat: 'status@broadcast' })).length, 1);
        bot.createContact('5521888888888@c.us', 'Outra pessoa');
        assert.deepEqual(await someoneWrite('PIX dele', { de: '5521888888888@c.us' }), []);
        assert.match((await bot.replyAlt('/watch'))[0], /apenas em 👤 Fulano/);
        await bot.src('settings').loadSettings();
        assert.equal((await someoneWrite('PIX depois de recarregar')).length, 1);
    });

    test('-in grupo aceita nomes com espaços e distingue chats', async () => {
        bot.createGroup('120363000000003333@g.us', 'Outro grupo', [OTHERAlt.jid]);
        await bot.replyAlt('/watch /pix/i -in /Família/');
        assert.equal((await someoneWrite('pix aqui')).length, 1);
        assert.deepEqual(await someoneWrite('pix lá', { chat: '120363000000003333@g.us' }), []);
        assert.deepEqual(await someoneWrite('pix privado', { chat: OTHERAlt.jid }), []);
        assert.match((await bot.replyAlt('/watch -list'))[0], /apenas em 👥 Família/);
    });

    test('-in canal por nome ou ID restringe à publicação do canal', async () => {
        const id = '120363000009999@newsletter';
        bot.client.chats.set(id, { id: { _serialized: id }, name: 'Defesa Civil', isChannel: true });
        await bot.replyAlt('/watch /chuva/i -in /Defesa Civil/');
        assert.match((await bot.replyAlt('/watch -list'))[0], /apenas em 📰 Defesa Civil/);
        assert.equal((await someoneWrite('chuva no canal', { chat: id })).length, 1);
        assert.deepEqual(await someoneWrite('chuva no grupo'), []);
        await bot.replyAlt(`/watch /vento/i -in ${id}`);
        assert.equal((await someoneWrite('vento no canal', { chat: id })).length, 1);
    });

    test('origem ambígua permite escolher e falha de origem não cria regra', async () => {
        bot.createContact('5521999999901@c.us', 'Jorge Um');
        bot.createContact('5521999999902@c.us', 'Jorge Dois');
        await bot.replyChoosing('/watch pix -in /Jorge/', 2);
        assert.equal((await bot.dbGet('SELECT * FROM watch_sources')).source_id,
            '5521999999902@c.us');
        assert.match((await bot.replyAlt('/watch boleto -in desconhecido'))[0], /Nenhum contato/);
        assert.match((await bot.replyAlt('/watch boleto -in email@exemplo.com'))[0], /não e-mail/);
        assert.deepEqual(bot.getSetting('watch.rules'), ['pix']);
    });

    test('regex com espaços e opções no texto é preservada; -s N mostra texto completo', async () => {
        await bot.replyAlt('/watch /pix -to -h azul/i');
        const body = 'PIX -to -h AZUL ' + 'abcdefghij'.repeat(50);
        await someoneWrite(body);
        assert.match((await bot.replyAlt('/watch'))[0], /…/);
        const [complete] = await bot.replyAlt('/watch -s 1');
        assert.ok(complete.includes(body));
        await bot.replyAlt('/watch -s 1 -to /Fulano/');
        assert.equal((await someoneWrite('pix -to -h azul novo'))[0].chatId, OTHERAlt.jid);
    });

    test('-flush N mantém origem e destinos; -rem N elimina tudo da regra', async () => {
        await bot.replyAlt('/watch pix -in /Fulano/ -to /Família/');
        await someoneWrite('pix');
        await bot.replyAlt('/watch -flush 1');
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM watch_hits')).n, 0);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM watch_sources')).n, 1);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM watch_destinations')).n, 1);
        await bot.replyAlt('/watch -rem 1');
        assert.deepEqual(bot.getSetting('watch.rules'), []);
        assert.deepEqual(await bot.dbAll('SELECT * FROM watch_sources'), []);
        assert.deepEqual(await bot.dbAll('SELECT * FROM watch_destinations'), []);
    });

    test('ações inválidas e opções sem valor não alteram configurações', async () => {
        for (const commandAlt of ['pix -in', 'pix -to', 'pix -in /Fulano/ -in /Família/',
            '-rem 0', '-show 0', '-list -flush', '-a pix', '-add pix', '-rem 1 -2']) {
            assert.match((await bot.replyAlt(`/watch ${commandAlt}`))[0], /^❌/, commandAlt);
            assert.deepEqual(bot.getSetting('watch.rules'), []);
        }
    });
});
