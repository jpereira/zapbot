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

    test('menções cruas viram nomes no aviso', async () => {
        await bot.setSetting('watch.rules', 'oi');
        const [aviso] = await alguemEscreve(`oi @${OUTRO.user}`, { mencoes: [OUTRO.jid] });
        assert.match(aviso.texto, /"oi @Fulano"/);
    });
});

describe('/watch', () => {
    test('-a adiciona texto e regex; aspas e espaços são mantidos', async () => {
        assert.match((await bot.responder('/watch -a promoção relâmpago'))[0], /✅ Regra \*#1\* adicionada _\(texto\)_: promoção relâmpago/);
        assert.match((await bot.responder('/w -add "/pix|boleto/i"'))[0], /✅ Regra \*#2\* adicionada _\(regex\)_: \/pix\|boleto\/i/);
        assert.deepEqual(bot.getSetting('watch.rules'), ['promoção relâmpago', '/pix|boleto/i']);
    });

    test('-a: sem regra, repetida, inválida e acima do watch.max', async () => {
        assert.match((await bot.responder('/watch -a'))[0], /Usage: \/watch/);
        await bot.responder('/watch -a pix');
        assert.match((await bot.responder('/watch -a pix'))[0], /ℹ️ A regra #1 já existe: pix/);
        assert.match((await bot.responder('/watch -a /[/'))[0], /❌ Regra inválida: regex inválida/);

        await bot.setSetting('watch.max', 1);
        assert.match((await bot.responder('/watch -a outra'))[0], /❌ Limite de 1 regras atingido/);
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

    test('-s (e sem opção): ocorrências de todas; -s N de uma regra', async () => {
        await bot.setSetting('watch.rules', 'pix\nboleto');
        await alguemEscreve('pix 1');
        await alguemEscreve('boleto 1');

        const todas = (await bot.executar('/watch', { chat: DONO.jid }))[0].texto;
        assert.match(todas, /🔎 \*Regras:\* todas\n📦 \*Total:\* 2/);
        // Cada ocorrência com o nº da regra que casou (a ordem é por horário; aqui empatam)
        assert.match(todas, /· 🔎 #1\n.*\n    💬 "pix 1"/);
        assert.match(todas, /· 🔎 #2\n.*\n    💬 "boleto 1"/);

        const uma = (await bot.executar('/watch -s -2', { chat: DONO.jid }))[0].texto;
        assert.match(uma, /🔎 \*Regra #2:\* boleto\n📦 \*Total:\* 1/);
        assert.doesNotMatch(uma, /pix 1/);

        assert.match((await bot.responder('/watch -s 9'))[0], /❌ Regra inválida\. Existem 2 regras/);
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
        const [r] = await bot.responder('/watch -r -1');
        assert.match(r, /🗑️ Regra \*#1\* removida: pix\n🗄️ Ocorrências apagadas: \*1\*\n💡 _As regras seguintes foram renumeradas/);
        assert.deepEqual(bot.getSetting('watch.rules'), ['boleto']);

        assert.match((await bot.responder('/watch -r 5'))[0], /❌ A regra #5 não existe/);
        assert.match((await bot.responder('/watch -r'))[0], /Usage: \/watch/);
    });

    test('-f apaga as ocorrências (de todas ou de uma) e mantém as regras', async () => {
        await bot.setSetting('watch.rules', 'pix\nboleto');
        await alguemEscreve('pix');
        await alguemEscreve('boleto');

        assert.match((await bot.responder('/watch -f -2'))[0], /Flush das ocorrências da regra #2:\* boleto\n🗄️ Ocorrências apagadas: \*1\*/);
        assert.match((await bot.responder('/watch -f'))[0], /Flush das ocorrências de todas as regras\*\n🗄️ Ocorrências apagadas: \*1\*/);
        assert.deepEqual(bot.getSetting('watch.rules'), ['pix', 'boleto']);
    });

    test('só o dono usa', async () => {
        assert.deepEqual(await bot.responder('/watch -a x', { de: OUTRO.jid }), []);
        assert.deepEqual(bot.getSetting('watch.rules'), []);
    });
});

describe('/watch -to', () => {
    const L200 = '120363000000000200@g.us';

    beforeEach(() => bot.criarGrupo(L200, 'Grupo sobre L200', [DONO.jid]));

    test('-a com -to: a regra avisa no destino; as sem -to, no seu privado (um aviso por destino)', async () => {
        assert.match((await bot.responder('/watch -a promoção -to /Grupo sobre L200/'))[0],
            /^✅ Regra \*#1\* adicionada _\(texto\)_: promoção\n💡 _Avisos em 👥 Grupo sobre L200\._$/);
        await bot.responder('/watch -a pix');

        const avisos = await alguemEscreve('promoção no pix');
        assert.deepEqual(avisos.map(a => a.chatId).sort(), [DONO.jid, L200].sort());
        assert.match(avisos.find(a => a.chatId === L200).texto, /🔎 \*Regra #1:\* promoção\n👥/);
        assert.match(avisos.find(a => a.chatId === DONO.jid).texto, /🔎 \*Regra #2:\* pix\n👥/);

        const [lista] = await bot.responder('/watch -l');
        assert.match(lista, /#1  promoção  \(1\)  → 👥 Grupo sobre L200\n#2  pix  \(1\)\n/);
    });

    test('-N -to troca o destino; off volta ao privado; -rem apaga o destino', async () => {
        await bot.responder('/watch -a pix');
        assert.deepEqual(await bot.responder('/watch -1 -to /Fulano/'), ['📣 Regra *#1* (pix): os avisos vão para *👤 Fulano*.']);
        assert.equal((await alguemEscreve('pix'))[0].chatId, OUTRO.jid);

        assert.deepEqual(await bot.responder('/watch -1 -to off'), ['📣 Regra *#1* (pix): os avisos vão para *seu privado*.']);
        assert.equal((await alguemEscreve('outro pix'))[0].chatId, DONO.jid);

        await bot.responder('/watch -1 -to /Fulano/');
        await bot.responder('/watch -r -1');
        assert.deepEqual(await bot.dbAll('SELECT * FROM watch_destinations'), []);
    });

    test('vários -to: a regra avisa em todos, juntando as regras de cada destino', async () => {
        assert.match((await bot.responder('/watch -a promoção -to /Grupo sobre L200/ -to /Fulano/ -to /Fulano/'))[0],
            /💡 _Avisos em 👥 Grupo sobre L200, 👤 Fulano\._$/);
        await bot.responder('/watch -a pix -to /Fulano/');

        const avisos = await alguemEscreve('promoção no pix');
        assert.deepEqual(avisos.map(a => a.chatId).sort(), [L200, OUTRO.jid].sort());
        assert.match(avisos.find(a => a.chatId === OUTRO.jid).texto, /🔎 \*Regra #1:\* promoção\n🔎 \*Regra #2:\* pix\n/);
        assert.match((await bot.responder('/watch -l'))[0], /#1  promoção  \(1\)  → 👥 Grupo sobre L200, 👤 Fulano\n/);

        // -N com vários -to troca todos; off não se mistura com outros
        assert.deepEqual(await bot.responder('/watch -2 -to /Fulano/ -to /Grupo sobre L200/'),
            ['📣 Regra *#2* (pix): os avisos vão para *👤 Fulano, 👥 Grupo sobre L200*.']);
        assert.match((await bot.responder('/watch -2 -to off -to /Fulano/'))[0], /❌ O -to off volta ao seu privado: use-o sozinho/);
        assert.deepEqual(await bot.responder('/watch -2 -to off'), ['📣 Regra *#2* (pix): os avisos vão para *seu privado*.']);
    });

    test('-to email: o aviso vai por e-mail', async () => {
        const env = { QRCODE_EMAIL_SMTP_HOST: 'smtp.exemplo.com', QRCODE_EMAIL_SMTP_USER: 'bot@exemplo.com', QRCODE_EMAIL_SMTP_TO: 'Eu <eu@exemplo.com>' };
        Object.assign(process.env, env);
        try {
            await bot.responder('/watch -a "vaga" -to email');
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
        await bot.responder('/watch -a pix');
        assert.match((await bot.responder('/watch -to /Fulano/'))[0], /❌ Use o -to ao adicionar/);
        assert.match((await bot.responder('/watch -9 -to /Fulano/'))[0], /A regra #9 não existe/);
        assert.match((await bot.responder('/watch -a boleto -to xyz'))[0], /❌ Nenhum contato ou grupo com "xyz"/);
        assert.deepEqual(bot.getSetting('watch.rules'), ['pix']);
    });
});
