/*
 * /watch (/w): regras de texto e regex, avisos no privado e as opções do comando.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { DONO, OUTRO } = bot;
const { compilarRegraWatch } = bot.src('watch/regras');

beforeEach(bot.reiniciar);

// Alguém escreve no grupo; devolve os avisos que o bot mandou
const alguemEscreve = (texto, opcoes = {}) => bot.executar(texto, { de: OUTRO.jid, ...opcoes });

describe('regras', () => {
    test('texto: contém, sem diferenciar maiúsculas nem acentos', () => {
        const regra = compilarRegraWatch('Reunião');
        assert.equal(regra('a REUNIAO de amanhã'), true);
        assert.equal(regra('reuniões'), false);
    });

    test('regex com flags (g e y são ignoradas)', () => {
        assert.equal(compilarRegraWatch('/pix|boleto/i')('Me manda o PIX'), true);
        const g = compilarRegraWatch('/a/g');
        assert.equal(g('a'), true);
        assert.equal(g('a'), true); // sem a flag g, o lastIndex não atrapalha
    });

    test('inválidas: regex quebrada, vazia ou longa demais', () => {
        assert.throws(() => compilarRegraWatch('/[/'), /regex inválida/);
        assert.throws(() => compilarRegraWatch(''), /1 a 200/);
        assert.throws(() => compilarRegraWatch('x'.repeat(201)), /1 a 200/);
    });
});

describe('detecção', () => {
    test('status resolve o autor LID e ignora nomes alheios nos metadados', async () => {
        await bot.setSetting('watch.rules', '/Defesa.*Civil/');
        const autor = '67658770853938@lid';
        const telefone = '5521999999988@c.us';
        bot.client.lids.set(autor, telefone);
        bot.criarContato(telefone, 'Defesa Civil');
        bot.criarContato('status@broadcast', 'Fátima');
        const msg = bot.criarMensagem({
            texto: 'Centro de Monitoramento da Defesa Civil de Niterói informa',
            chat: 'status@broadcast', de: OUTRO.jid,
            extras: {
                from: 'status@broadcast', author: '67658770853938:12@lid', isStatus: true,
                _data: { notifyName: 'Fátima', chat: { name: 'Fátima' } }
            }
        });
        const [aviso] = await bot.entregar(msg);
        assert.match(aviso.texto, /👤 \*Nome:\* Defesa Civil/);
        assert.match(aviso.texto, /📱 \*Número:\* \+5521999999988/);
        assert.doesNotMatch(aviso.texto, /Fátima/);
        const salvo = await bot.dbGet('SELECT * FROM messages WHERE id = ?', [msg.id.id]);
        assert.equal(salvo.sender_jid, telefone);
        assert.equal(salvo.sender_name, 'Defesa Civil');
        assert.equal(salvo.chat_name, 'Status de Defesa Civil');
        const hit = await bot.dbGet('SELECT * FROM watch_hits WHERE message_id = ?', [msg.id.id]);
        assert.equal(hit.sender_name, 'Defesa Civil');
        assert.equal(hit.sender_number, '5521999999988');
        assert.equal(hit.chat_name, 'Status de Defesa Civil');
    });

    test('broadcast sem telefone mantém LID do autor, sem inventar número', async () => {
        await bot.setSetting('watch.rules', 'alerta');
        bot.criarContato('67658770853939@lid', 'Defesa Civil sem telefone');
        const [aviso] = await alguemEscreve('alerta de chuva', {
            chat: '123@broadcast',
            extras: { from: '123@broadcast', author: undefined,
                _data: { participant: { _serialized: '67658770853939@lid' }, notifyName: 'Fátima' } }
        });
        assert.match(aviso.texto, /Nome:\* Defesa Civil sem telefone/);
        assert.match(aviso.texto, /Número:\* Número indisponível/);
        assert.doesNotMatch(aviso.texto, /Fátima/);
        const hit = await bot.dbGet('SELECT * FROM watch_hits');
        assert.equal(hit.chat_name, 'Transmissão de Defesa Civil sem telefone');
    });

    test('status sem autor usa origem desconhecida, sem atribuir notifyName a uma pessoa', async () => {
        await bot.setSetting('watch.rules', 'alerta');
        const [aviso] = await alguemEscreve('alerta de chuva', {
            chat: 'status@broadcast',
            extras: { from: 'status@broadcast', author: undefined,
                _data: { notifyName: 'Fátima', chat: { name: 'Defesa Civil' } } }
        });
        assert.match(aviso.texto, /Nome:\* Desconhecido/);
        assert.match(aviso.texto, /Número:\* Número indisponível/);
        assert.doesNotMatch(aviso.texto, /Fátima|Defesa Civil/);
        const hit = await bot.dbGet('SELECT * FROM watch_hits');
        assert.equal(hit.chat_name, 'Status');
    });

    test('mensagem que casa: grava e avisa no seu privado', async () => {
        await bot.setSetting('watch.rules', 'promoção\n/pix/i');
        const avisos = await alguemEscreve('olha a PROMOCAO do pix');

        assert.equal(avisos.length, 1);
        assert.equal(avisos[0].chatId, DONO.jid);
        assert.match(avisos[0].texto, /👀 \*WATCH: MENSAGEM DETECTADA\*/);
        assert.match(avisos[0].texto, /🔎 \*Regra #1:\* promoção\n🔎 \*Regra #2:\* \/pix\/i/);
        assert.match(avisos[0].texto, /👥 \*Grupo:\* Família\n👤 \*Nome:\* Fulano/);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM watch_hits')).n, 2);
    });

    test('não avisa: suas mensagens, comandos, sem casar, repetida e /watch desativado', async () => {
        await bot.setSetting('watch.rules', 'pix');
        assert.deepEqual(await bot.executar('meu pix'), []);                  // sua
        const doComando = await alguemEscreve('/noffa pix');             // comando: só a resposta dele
        assert.ok(!doComando.some(e => /WATCH/.test(e.texto)));
        assert.deepEqual(await alguemEscreve('nada a ver'), []);

        const msg = bot.criarMensagem({ texto: 'pix', de: OUTRO.jid, id: 'REPETIDA' });
        assert.equal((await bot.entregar(msg)).length, 1);
        assert.equal((await bot.entregar(msg)).length, 0);

        await bot.setSetting('commands.disabled', 'watch');
        assert.deepEqual(await alguemEscreve('outro pix'), []);
    });

    test('/mute (de qualquer tipo): sem aviso no privado, mas a ocorrência fica guardada', async () => {
        await bot.setSetting('watch.rules', 'pix');
        await bot.responder(`/mute -e +${OUTRO.user}`);
        assert.deepEqual(await alguemEscreve('manda o pix'), []);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM watch_hits')).n, 1);
        assert.equal((await bot.dbGet("SELECT COUNT(*) AS n FROM mute_hits WHERE kind = 'watch'")).n, 1);

        await bot.responder('/unmute -all');
        await bot.responder('/mute -s /Família/');
        assert.deepEqual(await alguemEscreve('outro pix'), []);

        await bot.responder('/unmute -all');
        assert.equal((await alguemEscreve('mais um pix')).length, 1);
    });

    test('menções cruas viram nomes no aviso', async () => {
        await bot.setSetting('watch.rules', 'oi');
        const [aviso] = await alguemEscreve(`oi @${OUTRO.user}`, { mencoes: [OUTRO.jid] });
        assert.match(aviso.texto, /"oi @Fulano"/);
    });
});

describe('/watch', () => {
    test('cria texto e regex diretamente; aspas e espaços são mantidos', async () => {
        assert.match((await bot.responder('/watch promoção relâmpago'))[0], /✅ Regra \*#1\* adicionada _\(texto\)_: promoção relâmpago/);
        assert.match((await bot.responder('/w "/pix|boleto/i"'))[0], /✅ Regra \*#2\* adicionada _\(regex\)_: \/pix\|boleto\/i/);
        assert.deepEqual(bot.getSetting('watch.rules'), ['promoção relâmpago', '/pix|boleto/i']);
    });

    test('recusa opção inválida, regra repetida, inválida e limite de regras', async () => {
        assert.match((await bot.responder('/watch -add'))[0], /Uso: \/watch/);
        await bot.responder('/watch pix');
        assert.match((await bot.responder('/watch pix'))[0], /ℹ️ A regra #1 já existe: pix/);
        assert.match((await bot.responder('/watch /[/'))[0], /❌/);

        await bot.setSetting('watch.max', 1);
        assert.match((await bot.responder('/watch outra'))[0], /❌ Limite de 1 regras atingido/);
    });

    test('-l lista as regras com as ocorrências, no chat onde foi digitado', async () => {
        assert.match((await bot.responder('/watch -l'))[0], /Nenhuma regra cadastrada/);

        await bot.setSetting('watch.rules', 'pix\nboleto');
        await alguemEscreve('pix');
        const r = await bot.executar('/watch -l');
        assert.equal(r.length, 1);
        assert.equal(r[0].chatId, bot.GRUPO);
        assert.match(r[0].texto, /#1  pix  \(1\)\n#2  boleto  \(0\)/);

        const [aqui] = await bot.executar('/watch -s');
        assert.equal(aqui.chatId, bot.GRUPO);
        assert.match(aqui.texto, /WATCH/);
    });

    test('listagem com ocorrências de todas; -s N de uma regra', async () => {
        await bot.setSetting('watch.rules', 'pix\nboleto');
        await alguemEscreve('pix 1');
        await alguemEscreve('boleto 1');

        const todas = (await bot.executar('/watch', { chat: DONO.jid }))[0].texto;
        assert.match(todas, /🔎 \*Regras:\* todas\n📦 \*Total:\* 2/);
        // Cada ocorrência com o nº da regra que casou (a ordem é por horário; aqui empatam)
        assert.match(todas, /· 🔎 #1\n.*\n    💬 "pix 1"/);
        assert.match(todas, /· 🔎 #2\n.*\n    💬 "boleto 1"/);

        const uma = (await bot.executar('/watch -s 2', { chat: DONO.jid }))[0].texto;
        assert.match(uma, /🔎 \*Regra #2:\* boleto\n📦 \*Total:\* 1/);
        assert.doesNotMatch(uma, /pix 1/);

        assert.match((await bot.responder('/watch -s 9'))[0], /❌ A regra #9 não existe\. Existem 2 regras/);
    });

    test('-s respeita o watch.showMax', async () => {
        await bot.setSetting('watch.rules', 'pix');
        await bot.setSetting('watch.showMax', 1);
        await alguemEscreve('pix a');
        await alguemEscreve('pix b');
        const [r] = await bot.responder('/watch -s', { chat: DONO.jid });
        assert.match(r, /📦 \*Total:\* 2 _\(exibindo as 1 mais recentes\)_/);
    });

    test('-rem (-r) remove a regra e as ocorrências dela', async () => {
        await bot.setSetting('watch.rules', 'pix\nboleto');
        await alguemEscreve('pix');
        const [r] = await bot.responder('/watch -r 1');
        assert.match(r, /🗑️ Regra \*#1\* removida: pix\n🗄️ Ocorrências apagadas: \*1\*\n💡 _As regras seguintes foram renumeradas/);
        assert.deepEqual(bot.getSetting('watch.rules'), ['boleto']);

        assert.match((await bot.responder('/watch -r 5'))[0], /❌ A regra #5 não existe/);
        assert.match((await bot.responder('/watch -r'))[0], /Uso: \/watch/);
    });

    test('-f apaga as ocorrências (de todas ou de uma) e mantém as regras', async () => {
        await bot.setSetting('watch.rules', 'pix\nboleto');
        await alguemEscreve('pix');
        await alguemEscreve('boleto');

        assert.match((await bot.responder('/watch -f 2'))[0], /Flush das ocorrências da regra #2:\* boleto\n🗄️ Ocorrências apagadas: \*1\*/);
        assert.match((await bot.responder('/watch -f'))[0], /Flush das ocorrências de todas as regras\*\n🗄️ Ocorrências apagadas: \*1\*/);
        assert.deepEqual(bot.getSetting('watch.rules'), ['pix', 'boleto']);
    });

    test('só o dono usa', async () => {
        assert.deepEqual(await bot.responder('/watch x', { de: OUTRO.jid }), []);
        assert.deepEqual(bot.getSetting('watch.rules'), []);
    });
});

describe('/watch -to', () => {
    const L200 = '120363000000000200@g.us';

    beforeEach(() => bot.criarGrupo(L200, 'Grupo sobre L200', [DONO.jid]));

    test('regra com -to avisa no destino; sem -to, no seu privado', async () => {
        assert.match((await bot.responder('/watch promoção -to /Grupo sobre L200/'))[0],
            /^✅ Regra \*#1\* adicionada _\(texto\)_: promoção\n💡 _Avisos em 👥 Grupo sobre L200\._$/);
        await bot.responder('/watch pix');

        const avisos = await alguemEscreve('promoção no pix');
        assert.deepEqual(avisos.map(a => a.chatId).sort(), [DONO.jid, L200].sort());
        assert.match(avisos.find(a => a.chatId === L200).texto, /🔎 \*Regra #1:\* promoção\n👥/);
        assert.match(avisos.find(a => a.chatId === DONO.jid).texto, /🔎 \*Regra #2:\* pix\n👥/);

        const [lista] = await bot.responder('/watch -l');
        assert.match(lista, /#1  promoção  \(1\)  → 👥 Grupo sobre L200\n#2  pix  \(1\)/);

        // /mute corta só o aviso no seu privado: o -to continua recebendo
        await bot.responder(`/mute +${OUTRO.user}`);
        const silenciado = await alguemEscreve('outra promoção no pix');
        assert.deepEqual(silenciado.map(a => a.chatId), [L200]);
    });

    test('-s N -to troca destinos; off volta ao privado; -rem apaga os destinos', async () => {
        await bot.responder('/watch pix');
        assert.deepEqual(await bot.responder('/watch -s 1 -to /Fulano/'), ['📣 Regra *#1* (pix): os avisos vão para *👤 Fulano*.']);
        assert.equal((await alguemEscreve('pix'))[0].chatId, OUTRO.jid);

        assert.deepEqual(await bot.responder('/watch -s 1 -to off'), ['📣 Regra *#1* (pix): os avisos vão para *seu privado*.']);
        assert.equal((await alguemEscreve('outro pix'))[0].chatId, DONO.jid);

        await bot.responder('/watch -s 1 -to /Fulano/');
        await bot.responder('/watch -r 1');
        assert.deepEqual(await bot.dbAll('SELECT * FROM watch_destinations'), []);
    });

    test('vários -to: a regra avisa em todos, juntando as regras de cada destino', async () => {
        assert.match((await bot.responder('/watch promoção -to /Grupo sobre L200/ -to /Fulano/ -to /Fulano/'))[0],
            /💡 _Avisos em 👥 Grupo sobre L200, 👤 Fulano\._$/);
        await bot.responder('/watch pix -to /Fulano/');

        const avisos = await alguemEscreve('promoção no pix');
        assert.deepEqual(avisos.map(a => a.chatId).sort(), [L200, OUTRO.jid].sort());
        assert.match(avisos.find(a => a.chatId === OUTRO.jid).texto, /🔎 \*Regra #1:\* promoção\n🔎 \*Regra #2:\* pix\n/);
        assert.match((await bot.responder('/watch -l'))[0], /#1  promoção  \(1\)  → 👥 Grupo sobre L200, 👤 Fulano/);

        // -N com vários -to troca todos; off não se mistura com outros
        assert.deepEqual(await bot.responder('/watch -s 2 -to /Fulano/ -to /Grupo sobre L200/'),
            ['📣 Regra *#2* (pix): os avisos vão para *👤 Fulano, 👥 Grupo sobre L200*.']);
        assert.match((await bot.responder('/watch -s 2 -to off -to /Fulano/'))[0], /❌ O -to off volta ao seu privado: use-o sozinho/);
        assert.deepEqual(await bot.responder('/watch -s 2 -to off'), ['📣 Regra *#2* (pix): os avisos vão para *seu privado*.']);
    });

    test('-to email: o aviso vai por e-mail', async () => {
        const env = { QRCODE_EMAIL_SMTP_HOST: 'smtp.exemplo.com', QRCODE_EMAIL_SMTP_USER: 'bot@exemplo.com', QRCODE_EMAIL_SMTP_TO: 'Eu <eu@exemplo.com>' };
        Object.assign(process.env, env);
        try {
            await bot.responder('/watch "vaga" -to email');
            assert.deepEqual(await alguemEscreve('tem vaga aqui'), [], 'nada no WhatsApp');
            const [m] = bot.emails;
            assert.equal(m.to, 'eu@exemplo.com');
            assert.equal(m.subject, '[ZapBot] 👀 Watch: #1 vaga');
            assert.match(m.text, /^👀 WATCH: MENSAGEM DETECTADA\n\n🔎 Regra #1: vaga\n/);
        } finally {
            for (const v of Object.keys(env)) delete process.env[v];
        }
    });

    test('erros: -to sem regra, regra que não existe, destino inválido (a regra não é criada)', async () => {
        await bot.responder('/watch pix');
        assert.match((await bot.responder('/watch -to /Fulano/'))[0], /❌ Use o -to ao adicionar/);
        assert.match((await bot.responder('/watch -s 9 -to /Fulano/'))[0], /A regra #9 não existe/);
        assert.match((await bot.responder('/watch boleto -to xyz'))[0], /❌ Nenhum contato ou grupo com "xyz"/);
        assert.deepEqual(bot.getSetting('watch.rules'), ['pix']);
    });
});

describe('/watch com origem e listagem', () => {
    test('sem argumentos lista regras; com hits acrescenta ocorrências recentes e dicas', async () => {
        await bot.responder('/watch /pix/i');
        const [sem] = await bot.responder('/watch');
        assert.match(sem, /WATCH: REGRAS/);
        assert.match(sem, /#1  \/pix\/i  \(0\)/);
        assert.doesNotMatch(sem, /WATCH: OCORRÊNCIAS/);
        await alguemEscreve('pix antigo', { timestamp: 1 });
        await alguemEscreve('pix recente', { timestamp: 2 });
        await bot.dbRun("UPDATE watch_hits SET timestamp = 1 WHERE body = 'pix antigo'");
        const [r] = await bot.responder('/watch -1');
        assert.match(r, /WATCH: REGRAS[\s\S]*WATCH: OCORRÊNCIAS/);
        assert.match(r, /Total:\* 2 _\(exibindo as 1 mais recentes\)_/);
        assert.match(r, /pix recente/);
        assert.doesNotMatch(r, /pix antigo/);
        assert.match(r, /\/watch -s N -to/);
        assert.match((await bot.responder('/watch -0'))[0], /quantidade/);
    });

    test('-in contato filtra o remetente no grupo, no privado e em status', async () => {
        const [r] = await bot.responder('/watch /pix/i -in /Fulano/');
        assert.match(r, /Apenas em 👤 Fulano/);
        assert.equal((await alguemEscreve('PIX aqui')).length, 1);
        assert.equal((await alguemEscreve('PIX privado', { chat: OUTRO.jid })).length, 1);
        assert.equal((await alguemEscreve('PIX status', { chat: 'status@broadcast' })).length, 1);
        bot.criarContato('5521888888888@c.us', 'Outra pessoa');
        assert.deepEqual(await alguemEscreve('PIX dele', { de: '5521888888888@c.us' }), []);
        assert.match((await bot.responder('/watch'))[0], /apenas em 👤 Fulano/);
        await bot.src('settings').carregarSettings();
        assert.equal((await alguemEscreve('PIX depois de recarregar')).length, 1);
    });

    test('-in grupo aceita nomes com espaços e distingue chats', async () => {
        bot.criarGrupo('120363000000003333@g.us', 'Outro grupo', [OUTRO.jid]);
        await bot.responder('/watch /pix/i -in /Família/');
        assert.equal((await alguemEscreve('pix aqui')).length, 1);
        assert.deepEqual(await alguemEscreve('pix lá', { chat: '120363000000003333@g.us' }), []);
        assert.deepEqual(await alguemEscreve('pix privado', { chat: OUTRO.jid }), []);
        assert.match((await bot.responder('/watch -list'))[0], /apenas em 👥 Família/);
    });

    test('-in canal por nome ou ID restringe à publicação do canal', async () => {
        const id = '120363000009999@newsletter';
        bot.client.chats.set(id, { id: { _serialized: id }, name: 'Defesa Civil', isChannel: true });
        await bot.responder('/watch /chuva/i -in /Defesa Civil/');
        assert.match((await bot.responder('/watch -list'))[0], /apenas em 📰 Defesa Civil/);
        assert.equal((await alguemEscreve('chuva no canal', { chat: id })).length, 1);
        assert.deepEqual(await alguemEscreve('chuva no grupo'), []);
        await bot.responder(`/watch /vento/i -in ${id}`);
        assert.equal((await alguemEscreve('vento no canal', { chat: id })).length, 1);
    });

    test('origem ambígua permite escolher e falha de origem não cria regra', async () => {
        bot.criarContato('5521999999901@c.us', 'Jorge Um');
        bot.criarContato('5521999999902@c.us', 'Jorge Dois');
        await bot.responderEscolhendo('/watch pix -in /Jorge/', 2);
        assert.equal((await bot.dbGet('SELECT * FROM watch_sources')).source_id,
            '5521999999902@c.us');
        assert.match((await bot.responder('/watch boleto -in desconhecido'))[0], /Nenhum contato/);
        assert.match((await bot.responder('/watch boleto -in email@exemplo.com'))[0], /não e-mail/);
        assert.deepEqual(bot.getSetting('watch.rules'), ['pix']);
    });

    test('regex com espaços e opções no texto é preservada; -s N mostra texto completo', async () => {
        await bot.responder('/watch /pix -to -h azul/i');
        const corpo = 'PIX -to -h AZUL ' + 'abcdefghij'.repeat(50);
        await alguemEscreve(corpo);
        assert.match((await bot.responder('/watch'))[0], /…/);
        const [completa] = await bot.responder('/watch -s 1');
        assert.ok(completa.includes(corpo));
        await bot.responder('/watch -s 1 -to /Fulano/');
        assert.equal((await alguemEscreve('pix -to -h azul novo'))[0].chatId, OUTRO.jid);
    });

    test('-s, -f e -r aceitam a regra no lugar do nº: inteira, sem maiúsculas ou só um trecho', async () => {
        await bot.setSetting('watch.rules', ['/TCPRO.*La.*Sportiva/i', '/Renato.*r38tao/', '/Jorge/']);
        await alguemEscreve('oi Jorge');

        const [porNumero] = await bot.responder('/watch -s 3');
        assert.match(porNumero, /🔎 \*Regra #3:\* \/Jorge\//);
        for (const ref of ['/Jorge/', '/jorge/', 'Jorge', '"jorge"']) {
            assert.equal((await bot.responder(`/watch -s ${ref}`))[0], porNumero, ref);
        }
        assert.match((await bot.responder('/watch -s /Jorge/ -to /Família/'))[0], /Regra \*#3\* \(\/Jorge\/\)/);

        const [ambigua] = await bot.responder('/watch -s r');
        assert.match(ambigua, /^🔎 "r" corresponde a 3 regras/);
        assert.match((await bot.responder('/watch -s nada'))[0], /❌ Nenhuma regra casa com "nada"/);

        assert.match((await bot.responder('/watch -f /Jorge/'))[0], /regra #3:\* \/Jorge\/\n🗄️ Ocorrências apagadas: \*1\*/);
        assert.match((await bot.responder('/watch -r Sportiva'))[0], /Regra \*#1\* removida/);
        assert.deepEqual(bot.getSetting('watch.rules'), ['/Renato.*r38tao/', '/Jorge/']);
    });

    test('-q filtra as ocorrências pelo texto (sem maiúsculas nem acentos), no -s e na listagem', async () => {
        await bot.setSetting('watch.rules', ['/Jorge/', 'pix']);
        await alguemEscreve('Jorge vendeu o CARRO');
        await alguemEscreve('Jorge comprou uma moto');
        await alguemEscreve('Jorge e o carrão novo');
        await alguemEscreve('pix do carro');

        const [r] = await bot.responder('/watch -s /Jorge/ -query "carro"');
        assert.match(r, /🔎 \*Regra #1:\* \/Jorge\/\n🔍 \*Busca:\* "carro"\n📦 \*Total:\* 1\n/);
        assert.match(r, /"Jorge vendeu o CARRO"/);
        assert.doesNotMatch(r, /moto|carrão|pix do carro/);

        assert.match((await bot.responder('/watch -s 1 -q carrao'))[0], /"Jorge e o carrão novo"/);
        assert.match((await bot.responder('/watch -s -q carro -1'))[0],
            /📦 \*Total:\* 2 _\(exibindo as 1 mais recentes\)_\n\n1\. [^\n]*\n[^\n]*\n {4}💬 "pix do carro"/);
        assert.match((await bot.responder('/watch -q moto'))[0], /👀 \*WATCH: REGRAS\*[\s\S]*Busca:\* "moto"\n📦 \*Total:\* 1/);
        assert.match((await bot.responder('/watch -s 1 -q avião'))[0], /_Nenhuma mensagem com "avião"\._/);

        for (const comando of ['-s 1 -q', '-l -q x', '-f 1 -q x', '-r 1 -q x', 'pix -q x', '-s 1 -q a -q b']) {
            assert.match((await bot.responder(`/watch ${comando}`))[0], /^❌/, comando);
        }
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM watch_hits')).n, 4);
    });

    test('-flush N mantém origem e destinos; -rem N elimina tudo da regra', async () => {
        await bot.responder('/watch pix -in /Fulano/ -to /Família/');
        await alguemEscreve('pix');
        await bot.responder('/watch -flush 1');
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM watch_hits')).n, 0);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM watch_sources')).n, 1);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM watch_destinations')).n, 1);
        await bot.responder('/watch -rem 1');
        assert.deepEqual(bot.getSetting('watch.rules'), []);
        assert.deepEqual(await bot.dbAll('SELECT * FROM watch_sources'), []);
        assert.deepEqual(await bot.dbAll('SELECT * FROM watch_destinations'), []);
    });

    test('ações inválidas e opções sem valor não alteram configurações', async () => {
        for (const comando of ['pix -in', 'pix -to', 'pix -in /Fulano/ -in /Família/',
            '-rem 0', '-show 0', '-list -flush', '-a pix', '-add pix', '-rem 1 -2']) {
            assert.match((await bot.responder(`/watch ${comando}`))[0], /^❌/, comando);
            assert.deepEqual(bot.getSetting('watch.rules'), []);
        }
    });
});
