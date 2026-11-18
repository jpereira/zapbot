const bot = require('./helpers/bot');
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const monitor = bot.src('monitor');
const { queryPresence } = bot.src('presence');

beforeEach(bot.restart);
afterEach(() => {
    monitor.stopMonitor();
    delete bot.client.pupPage;
});

const registration = async (id = bot.OTHERAlt.jid, nameAlt = 'Fulano') =>
    (await monitor.registerMonitored({ id, nome: nameAlt })).contato;
const time = (lastSeen = 1792007399, extra = {}) => ({
    presenceData: { isOnline: false, hasData: true, lastSeen,
        chatstate: { type: 'unavailable', t: lastSeen }, ...extra },
    lastSeenSource: 'Presence.chatstate.t',
    lastSeenKind: 'chatstate offline (confirmar no aplicativo)'
});
const releaseInterval = () => bot.dbRun('UPDATE monitor_contacts SET last_attempt_at = 0');

test('/monitor sem cadastro e /help explicam uso e risco', async () => {
    const [r] = await bot.replyAlt('/monitor');
    assert.match(r, /Nenhum contato cadastrado/);
    assert.match(r, /a cada 5 min \(300 s\)/);
    assert.match(r, /bloqueio/);
    const [help] = await bot.replyAlt('/help monitor');
    assert.match(help, /-add.*-a/);
    assert.match(help, /-rm.*-r/);
    assert.match(help, /-list.*-l/);
    assert.doesNotMatch((await bot.replyAlt('/help'))[0], /\n\*\/test\*\n/);
});

test('/monitor é só do dono e admins', async () => {
    assert.deepEqual(await bot.replyAlt('/monitor', { de: bot.OTHERAlt.jid }), []);
});

test('cadastro por nome, delimitadores, número e menção não duplica a pessoa', async () => {
    for (const commandAlt of ['/monitor -add Fulano', '/monitor -a /Fulano/',
        '/monitor -add "Fulano"', `/monitor -a +${bot.OTHERAlt.user}`,
        `/monitor -add @${bot.OTHERAlt.user}`]) {
        const [r] = await bot.replyAlt(commandAlt, { mencoes: [bot.OTHERAlt.jid] });
        assert.match(r, /cadastrado/);
    }
    assert.equal((await monitor.listMonitored()).length, 1);
    assert.match((await bot.replyAlt('/monitor'))[0], /📹 #\d+ · Fulano/);
});

test('LID da menção e telefone do contato compartilham cadastro', async () => {
    const lid = '100000000123451@lid';
    bot.client.lids.set(lid, bot.OTHERAlt.jid);
    await bot.replyAlt('/monitor -a /Fulano/');
    await bot.replyAlt('/monitor -a @100000000123451', { mencoes: [lid] });
    assert.equal((await monitor.listMonitored()).length, 1);
});

test('nome com espaços e ambiguidades usa a escolha padrão', async () => {
    bot.createContact('5521999991101@c.us', 'Jorge Chip L200');
    bot.createContact('5521999991102@c.us', 'Jorge Casa');
    await bot.replyChoosing('/monitor -a Jorge', 2);
    const rows = await monitor.listMonitored();
    assert.equal(rows.length, 1);
    assert.match(rows[0].contact_name, /^Jorge/);
});

test('limite absoluto de 5 é atômico sob cadastros concorrentes', async () => {
    const results = await Promise.all(Array.from({ length: 7 }, (_, i) =>
        monitor.registerMonitored({ id: `552199999${1100 + i}@c.us`, nome: `Contato ${i}` })));
    assert.equal((await monitor.listMonitored()).length, 5);
    assert.equal(results.filter(r => r.limite).length, 2);
    const [r] = await bot.replyAlt('/monitor -a /Fulano/');
    assert.match(r, /Limite de 5 contatos atingido/);
});

test('settings aceitam = e espaço, validam limites e mostram avisos', async () => {
    assert.match((await bot.replyAlt('/set monitor.pool=120'))[0], /monitor.pool.*120/);
    assert.equal(bot.getSetting('monitor.pool'), 120);
    assert.match((await bot.replyAlt('/set monitor.pool 300'))[0], /bloqueio/);
    assert.match((await bot.replyAlt('/set monitor.max=5'))[0], /bloqueio/);
    assert.match((await bot.replyAlt('/set monitor.max 6'))[0], /entre 1 e 5/);
    assert.match((await bot.replyAlt('/set monitor.pool 119'))[0], /entre 120 e 86400/);
    assert.match((await bot.replyAlt('/set monitor.pool'))[0], /Nenhum intervalo/);
    await registration();
    await registration('5521999991101@c.us');
    assert.match((await bot.replyAlt('/set monitor.max=1'))[0], /remova contatos/);
    await bot.replyAlt('/set monitor.enabled=false');
    assert.equal(bot.getSetting('monitor.enabled'), false);
    assert.match((await bot.replyAlt('/monitor'))[0], /pausado/);
});

test('histórico guarda apenas horários distintos e diferencia a observação', async () => {
    const c = await registration();
    let resultAlt = time();
    let calls = 0;
    bot.client.pupPage = { async evaluate(fn, id, options) {
        assert.equal(id, c.contact_id);
        assert.deepEqual(options, { monitor: true });
        calls++;
        return resultAlt;
    } };
    await monitor.checkMonitor();
    await monitor.checkMonitor();
    assert.equal(calls, 1);
    await releaseInterval();
    await monitor.checkMonitor();
    assert.equal((await monitor.historyMonitored(c.id)).length, 1);
    resultAlt = time(1792007499);
    await releaseInterval();
    await monitor.checkMonitor();
    const h = await monitor.historyMonitored(c.id);
    assert.deepEqual(h.map(x => x.last_seen), [1792007499, 1792007399]);
    assert.ok(h[0].observed_at > h[0].last_seen);
    const [r] = await bot.replyAlt('/monitor -l');
    assert.match(r, /a cada 5 min/);
    assert.match(r, /Histórico: 2 horário/);
    assert.match(r, /Origem: presença do WhatsApp · horário não confirmado/);
    assert.doesNotMatch(r, /Presence\.chatstate|confirmar no aplicativo/);
    assert.equal(h[0].source, 'Presence.chatstate.t');
    assert.match(h[0].kind, /confirmar no aplicativo/);
});

test('sem dados ou online não fabrica horários nem apaga o anterior', async () => {
    const c = await registration();
    let resultAlt = time();
    bot.client.pupPage = { evaluate: async () => resultAlt };
    await monitor.checkMonitor();
    for (const r of [time(null, { hasData: false }), time(null, { isOnline: true }),
        time(1792007599, { hasData: false }), time(1792007599, { isOnline: true }),
        time(null)]) {
        resultAlt = r;
        await releaseInterval();
        await monitor.checkMonitor();
    }
    const rows = await monitor.listMonitored();
    assert.equal(rows[0].last_seen, 1792007399);
    assert.equal((await monitor.historyMonitored(c.id)).length, 1);
    assert.match(rows[0].last_status, /sem horário/);
});

test('conexão, pausa, comando desativado e setting off impedem consultas', async () => {
    await registration();
    let calls = 0;
    bot.client.pupPage = { evaluate: async () => { calls++; return time(); } };
    bot.estado.pronto = false;
    await monitor.checkMonitor();
    bot.estado.pronto = true;
    await bot.setSetting('monitor.enabled', false);
    await monitor.checkMonitor();
    await bot.setSetting('monitor.enabled', true);
    await bot.setSetting('bot.paused', true);
    await monitor.checkMonitor();
    await bot.setSetting('bot.paused', false);
    await bot.setSetting('commands.disabled', 'monitor');
    await monitor.checkMonitor();
    assert.equal(calls, 0);
    await bot.setSetting('commands.disabled', []);
    await monitor.checkMonitor();
    assert.equal(calls, 1);
});

test('cadastros e histórico sobrevivem à recarga de settings', async () => {
    const c = await registration();
    bot.client.pupPage = { evaluate: async () => time() };
    await monitor.checkMonitor();
    await bot.src('settings').loadSettings();
    assert.equal((await monitor.listMonitored())[0].id, c.id);
    assert.equal((await monitor.historyMonitored(c.id)).length, 1);
});

test('remoção apaga histórico e mantém o id dos outros contatos', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const a = await registration();
    const b = await registration('5521999991101@c.us', 'Outro');
    bot.client.pupPage = { evaluate: async () => time() };
    await bot.waitWithClock(t, monitor.checkMonitor());
    assert.match((await bot.replyAlt(`/monitor -rm ${a.id}`))[0], /histórico removidos/);
    assert.equal((await monitor.historyMonitored(a.id)).length, 0);
    assert.equal((await monitor.listMonitored())[0].id, b.id);
    assert.match((await bot.replyAlt(`/monitor -r ${a.id}`))[0], /não cadastrado/);
});

test('falhas respeitam intervalo e não impedem a próxima pessoa', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const a = await registration();
    const b = await registration('5521999991101@c.us', 'Outro');
    let calls = 0;
    bot.client.pupPage = { evaluate: async (fn, id) => {
        calls++;
        if (id === a.contact_id) throw new Error('Página indisponível');
        return time();
    } };
    await bot.waitWithClock(t, monitor.checkMonitor());
    await bot.waitWithClock(t, monitor.checkMonitor());
    assert.equal(calls, 2);
    const rows = await monitor.listMonitored();
    assert.equal(rows[0].last_error, 'Página indisponível');
    assert.equal((await monitor.historyMonitored(b.id)).length, 1);
});

test('consulta em andamento não se sobrepõe nem recria cadastro removido', async () => {
    const c = await registration();
    let complete;
    let started;
    const inputAlt = new Promise(resolve => { started = resolve; });
    bot.client.pupPage = { evaluate: () => new Promise(resolve => {
        complete = resolve;
        started();
    }) };
    const first = monitor.checkMonitor();
    await inputAlt;
    await monitor.checkMonitor();
    await monitor.removeMonitored(c.id);
    complete(time());
    await first;
    assert.equal((await monitor.historyMonitored(c.id)).length, 0);
    assert.equal((await monitor.listMonitored()).length, 0);
});

test('trava compartilhada não consome o intervalo de uma consulta adiada', async () => {
    const c = await registration();
    let complete;
    bot.client.pupPage = { evaluate: () => new Promise(resolve => { complete = resolve; }) };
    const other = queryPresence('5521999991101@c.us');
    await monitor.checkMonitor();
    assert.equal((await monitor.listMonitored())[0].last_attempt_at, 0);
    complete(time());
    await other;
    bot.client.pupPage.evaluate = async () => time();
    await monitor.checkMonitor();
    assert.equal((await monitor.historyMonitored(c.id)).length, 1);
});

test('histórico extenso é enviado completo como documento de texto', async () => {
    await bot.src('settings').setSetting('monitor.maxRecords', 70);
    const c = await registration();
    for (let i = 0; i < 70; i++) {
        await bot.dbRun(`INSERT INTO monitor_history
            (contact_id, last_seen, observed_at, source, kind) VALUES (?, ?, ?, ?, ?)`,
        [c.id, 1792007399 + i, Date.now(), 'Presence.chatstate.t', 'candidato offline']);
    }
    await bot.replyAlt('/monitor -list');
    const media = bot.client.enviadas.at(-1).content;
    assert.equal(media.filename, 'monitor-historico.txt');
    const textAlt = Buffer.from(media.data, 'base64').toString();
    assert.match(textAlt, /Histórico: 70 horário/);
    assert.equal((textAlt.match(/observado em/g) ?? []).length, 70);
    assert.match(textAlt, /a cada 5 min/);
});

test('recusa sintaxe inválida, grupo, e-mail e menção digitada', async () => {
    for (const line of ['/monitor -add', '/monitor -rm', '/monitor -rm 0',
        '/monitor -rm -1', '/monitor -list extra', '/monitor -x',
        '/monitor -a /Família/', '/monitor -a fulano@exemplo.com',
        `/monitor -a @${bot.OTHERAlt.user}`]) {
        assert.match((await bot.replyAlt(line))[0], /^(❌|Informe|Use \/monitor)/, line);
    }
    assert.equal((await monitor.listMonitored()).length, 0);
});

test('histórico ignora horários inválidos e preserva o último horário conhecido', async () => {
    const c = await registration();
    let resultAlt = time();
    bot.client.pupPage = { evaluate: async () => resultAlt };
    await monitor.checkMonitor();
    for (const valueAlt of [true, false, {}, 'deny', -1, 0, NaN, 9e15]) {
        resultAlt = time(valueAlt);
        await releaseInterval();
        await monitor.checkMonitor();
    }
    assert.equal((await monitor.historyMonitored(c.id)).length, 1);
    resultAlt = time(1792007299);
    await releaseInterval();
    await monitor.checkMonitor();
    assert.equal((await monitor.historyMonitored(c.id)).length, 2);
    assert.equal((await monitor.listMonitored())[0].last_seen, 1792007399);
});

test('remoção por contato usa o mesmo resolvedor do cadastro', async () => {
    for (const line of ['/monitor -rm Fulano', '/monitor -r /Fulano/',
        '/monitor -rm "Fulano"', `/monitor -r @${bot.OTHERAlt.user}`,
        `/monitor -rm +${bot.OTHERAlt.user}`, `/monitor -r ${bot.OTHERAlt.user}`]) {
        await registration();
        const [r] = await bot.replyAlt(line, { mencoes: [bot.OTHERAlt.jid] });
        assert.match(r, /cadastro e histórico removidos/, line);
        assert.equal((await monitor.listMonitored()).length, 0);
    }
});

test('remoção por nome com espaços e ambiguidade oferece a escolha padrão', async () => {
    const a = '5521999991131@c.us';
    const b = '5521999991132@c.us';
    bot.createContact(a, 'Jorge Chip L200');
    bot.createContact(b, 'Jorge Casa');
    await registration(a, 'Jorge Chip L200');
    await registration(b, 'Jorge Casa');
    await bot.replyChoosing('/monitor -r Jorge', 2);
    assert.equal((await monitor.listMonitored()).length, 1);
    const remaining = (await monitor.listMonitored())[0];
    const [r] = await bot.replyAlt(`/monitor -rm /${remaining.contact_name}/`);
    assert.match(r, /removidos/);
    assert.equal((await monitor.listMonitored()).length, 0);
});

test('remoção reconhece LID/telefone e informa pessoa não cadastrada', async () => {
    const lid = '100000000123452@lid';
    bot.client.lids.set(lid, bot.OTHERAlt.jid);
    await registration(lid);
    assert.match((await bot.replyAlt('/monitor -rm /Fulano/'))[0], /removidos/);
    assert.equal((await monitor.listMonitored()).length, 0);
    assert.match((await bot.replyAlt('/monitor -r /Fulano/'))[0], /não está cadastrado/);
});

test('remove o id com prefixo # mostrado em /monitor -l', async () => {
    const c = await registration();
    assert.match((await bot.replyAlt('/monitor -l'))[0], new RegExp(`#${c.id} · Fulano`));
    assert.match((await bot.replyAlt(`/monitor -r #${c.id}`))[0], /removidos/);
    assert.equal((await monitor.listMonitored()).length, 0);
});

test('agendador inicia uma vez e sua parada cancela o timer', async t => {
    let calls = 0;
    bot.client.pupPage = { evaluate: async () => { calls++; return time(); } };
    await registration();
    t.mock.timers.enable({ apis: ['setInterval'] });
    monitor.startMonitor();
    monitor.startMonitor();
    t.mock.timers.tick(10000);
    for (let i = 0; i < 20; i++) await new Promise(setImmediate);
    assert.equal(calls, 1);
    monitor.stopMonitor();
    await releaseInterval();
    t.mock.timers.tick(10000);
    for (let i = 0; i < 20; i++) await new Promise(setImmediate);
    assert.equal(calls, 1);
});


test('maxRecords limita o banco por contato e as duas listas aos horários mais recentes', async ctx => {
    ctx.mock.timers.enable({ apis: ['setTimeout'] });
    const settings = bot.src('settings');
    assert.equal(settings.getSetting('monitor.maxRecords'), 30);
    assert.match((await bot.replyAlt('/set monitor.maxRecords=2'))[0], /maxRecords.*2/);
    const a = await registration();
    const b = await registration('5521999999999@c.us', 'Outro');
    let t = 1792007399;
    bot.client.pupPage = { evaluate: async () => time(t) };
    for (let i = 0; i < 4; i++) {
        await releaseInterval();
        await bot.waitWithClock(ctx, monitor.checkMonitor());
        t++;
    }
    for (const c of [a, b]) {
        const rows = await bot.dbAll('SELECT * FROM monitor_history WHERE contact_id = ?', [c.id]);
        assert.equal(rows.length, 2);
        assert.deepEqual(rows.map(r => r.last_seen).sort(), [t - 2, t - 1]);
    }
    for (const cmd of ['/monitor', '/monitor -l']) {
        const [reply] = await bot.replyAlt(cmd);
        assert.match(reply, /Histórico: 2 horário/);
        assert.match(reply, /limite: 2/);
        assert.equal((reply.match(/observado em/g) ?? []).length, 4);
    }
    await settings.setSetting('monitor.maxRecords', 1);
    assert.equal((await bot.dbAll('SELECT * FROM monitor_history')).length, 2);
    assert.match((await bot.replyAlt('/set monitor.maxRecords 0'))[0], /entre 1 e 1000/);
    assert.match((await bot.replyAlt('/set monitor.maxRecords 1001'))[0], /entre 1 e 1000/);
});

test('carregar settings remove histórico excedente por contato', async () => {
    const c = await registration();
    await bot.src('settings').setSetting('monitor.maxRecords', 1);
    for (const t of [100, 200, 300]) {
        await bot.dbRun(`INSERT INTO monitor_history (contact_id, last_seen, observed_at)
            VALUES (?, ?, ?)`, [c.id, t, Date.now()]);
    }
    await bot.src('settings').loadSettings();
    const rows = await bot.dbAll('SELECT * FROM monitor_history WHERE contact_id = ?', [c.id]);
    assert.deepEqual(rows.map(r => r.last_seen), [300]);
});


test('-rm all e -r all apagam todos os cadastros e históricos, mantendo settings', async () => {
    for (const commandAlt of ['/monitor -rm all', '/monitor -r all']) {
        const a = await registration();
        const b = await registration('5521999999999@c.us', 'Outro');
        for (const c of [a, b]) {
            await bot.dbRun(`INSERT INTO monitor_history (contact_id, last_seen, observed_at)
                VALUES (?, ?, ?)`, [c.id, 100, Date.now()]);
        }
        const [reply] = await bot.replyAlt(commandAlt);
        assert.match(reply, /Monitor limpo: 2 contato/);
        assert.equal((await monitor.listMonitored()).length, 0);
        assert.equal((await bot.dbAll('SELECT * FROM monitor_history')).length, 0);
        assert.equal(bot.src('settings').getSetting('monitor.maxRecords'), 30);
        assert.match((await bot.replyAlt(commandAlt))[0], /Monitor limpo: 0 contato/);
    }
});


test('embaralha sem repetir e espera de 1 a 15 segundos entre consultas', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
    const crypto = require('node:crypto');
    const pauses = [1, 15];
    t.mock.method(crypto, 'randomInt', (min, max) => max ? pauses.shift() : 0);
    const contacts = [await registration(), await registration('5521999999999@c.us', 'Segundo'),
        await registration('5521888888888@c.us', 'Terceiro')];
    const calls = [];
    bot.client.pupPage = { evaluate: async (fn, id) => {
        calls.push({ id, at: Date.now() });
        return time();
    } };
    await bot.waitWithClock(t, monitor.checkMonitor());
    assert.deepEqual(calls.map(c => c.id),
        [contacts[1].contact_id, contacts[2].contact_id, contacts[0].contact_id]);
    assert.equal(calls[1].at - calls[0].at, 1000);
    assert.equal(calls[2].at - calls[1].at, 15000);
    await monitor.checkMonitor();
    assert.equal(calls.length, 3);
});

for (const action of ['pausar', 'remover', 'parar']) {
    test(`durante a espera, ${action} impede a próxima consulta`, async t => {
        t.mock.timers.enable({ apis: ['setTimeout'] });
        t.mock.method(require('node:crypto'), 'randomInt', (min, max) => max ? 15 : min - 1);
        await registration();
        await registration('5521999999999@c.us', 'Segundo');
        let calls = 0;
        bot.client.pupPage = { evaluate: async () => { calls++; return time(); } };
        const tarefa = monitor.checkMonitor();
        for (let i = 0; i < 30; i++) await new Promise(setImmediate);
        assert.equal(calls, 1);
        await monitor.checkMonitor();
        assert.equal(calls, 1);
        if (action === 'pausar') await bot.src('settings').setSetting('monitor.enabled', false);
        if (action === 'remover') await monitor.removeAllMonitored();
        if (action === 'parar') monitor.stopMonitor();
        await bot.waitWithClock(t, tarefa);
        assert.equal(calls, 1);
    });
}


test('lista filtrada compara nome, delimitadores, telefone, id e menção dos cadastros', async () => {
    const c = await registration();
    await registration('5521999999999@c.us', 'Outro');
    for (const commandAlt of ['/monitor -l Fulano', '/monitor -list /Fulano/',
        `/monitor -l ${bot.OTHERAlt.user}`, `/monitor -l #${c.id}`]) {
        const [r] = await bot.replyAlt(commandAlt);
        assert.match(r, /Fulano/);
        assert.doesNotMatch(r, /📹.*Outro/);
    }
    const [r] = await bot.replyAlt(`/monitor -l @${bot.OTHERAlt.user}`, {
        mencoes: [bot.OTHERAlt.jid]
    });
    assert.match(r, /Fulano/);
});

test('ativa alerta ao cadastrar e para pessoa cadastrada sem duplicar o cadastro', async () => {
    await bot.replyAlt('/monitor -add /Fulano/ -alert');
    let [c] = await monitor.listMonitored();
    assert.equal(c.alert_enabled, 1);
    assert.match((await bot.replyAlt('/monitor -l /Fulano/'))[0], /Alerta online: ativado/);
    await bot.dbRun('UPDATE monitor_contacts SET alert_enabled = 0 WHERE id = ?', [c.id]);
    assert.match((await bot.replyAlt('/monitor -alert /Fulano/'))[0], /Alerta online ativado/);
    [c] = await monitor.listMonitored();
    assert.equal(c.alert_enabled, 1);
    await bot.src('settings').loadSettings();
    assert.equal((await monitor.listMonitored()).length, 1);
    assert.equal((await monitor.listMonitored())[0].alert_enabled, 1);
    await bot.replyAlt('/monitor -add /Fulano/ -alert');
    assert.equal((await monitor.listMonitored()).length, 1);
    assert.match((await bot.replyAlt('/monitor -alert'))[0], /Informe um contato/);
});

test('alerta online vai ao dono uma vez por entrada observada, sem rearmar com dados ausentes',
    async () => {
        const c = await registration();
        await monitor.enableAlertMonitor(c.id);
        let dataAlt = time(null, { isOnline: true });
        bot.client.pupPage = { evaluate: async () => dataAlt };
        const query = async () => {
            await releaseInterval();
            await monitor.checkMonitor();
        };
        await query();
        await query();
        dataAlt = time(null, { hasData: false });
        await query();
        dataAlt = time(null, { isOnline: true });
        await query();
        let notices = bot.client.enviadas.filter(e => e.content.startsWith('🚨'));
        assert.equal(notices.length, 1);
        assert.equal(notices[0].chatId, bot.OWNER.jid);
        assert.match(notices[0].content, /O contato "Fulano" ficou online em/);
        assert.match(notices[0].content, /💡 Para mais, digite \/monitor -l/);
        assert.equal((await monitor.historyMonitored(c.id)).length, 0);
        dataAlt = time();
        await query();
        dataAlt = time(null, { isOnline: true });
        await query();
        notices = bot.client.enviadas.filter(e => e.content.startsWith('🚨'));
        assert.equal(notices.length, 2);
    });

test('sem alerta ativado não envia avisos e remoção durante consulta impede alerta pendente',
    async () => {
        const c = await registration();
        bot.client.pupPage = { evaluate: async () => time(null, { isOnline: true }) };
        await monitor.checkMonitor();
        assert.equal(bot.client.enviadas.length, 0);
        await monitor.enableAlertMonitor(c.id);
        await bot.dbRun('UPDATE monitor_contacts SET online_state = 0, last_attempt_at = 0');
        bot.client.pupPage = { evaluate: async () => {
            await monitor.removeMonitored(c.id);
            return time(null, { isOnline: true });
        } };
        await monitor.checkMonitor();
        assert.equal(bot.client.enviadas.length, 0);
    });


test('migração de banco existente preserva contatos e inicia alertas desativados', async () => {
    const c = await registration();
    await bot.dbRun('ALTER TABLE monitor_contacts DROP COLUMN alert_enabled');
    await bot.dbRun('ALTER TABLE monitor_contacts DROP COLUMN online_state');
    await bot.src('initialization').initializeDb();
    const [salvo] = await monitor.listMonitored();
    assert.equal(salvo.id, c.id);
    assert.equal(salvo.alert_enabled, 0);
    assert.equal(salvo.online_state, null);
});


test('pausar durante consulta impede envio do alerta pendente', async () => {
    const c = await registration();
    await monitor.enableAlertMonitor(c.id);
    bot.client.pupPage = { evaluate: async () => {
        await bot.src('settings').setSetting('monitor.enabled', false);
        return time(null, { isOnline: true });
    } };
    await monitor.checkMonitor();
    assert.equal(bot.client.enviadas.length, 0);
});


test('prefixo /monit filtra apenas nomes monitorados sem consultar a agenda', async t => {
    await registration(bot.OTHERAlt.jid, 'Maria Lucia');
    await registration('5521999999999@c.us', 'Jorge Chip L200');
    bot.createContact('5521888888888@c.us', 'Maria da Agenda');
    for (const method of ['getContacts', 'getContactLidAndPhone']) {
        t.mock.method(bot.client, method, () => { throw new Error('Não consultar agenda'); });
    }
    for (const filter of ['/Maria/', 'mÁria', 'Lucia', 'Maria Lucia']) {
        const [r] = await bot.replyAlt(`/monit -l ${filter}`);
        assert.match(r, /📹.*Maria Lucia/);
        assert.doesNotMatch(r, /Jorge Chip L200|Maria da Agenda|Escolha/);
    }
    const [r] = await bot.replyAlt('/monit -l /da Agenda/');
    assert.match(r, /Nenhum contato monitorado encontrado/);
    assert.equal((await monitor.listMonitored()).length, 2);
});

test('filtro mostra todos os cadastros correspondentes, sem buscar na agenda', async () => {
    await registration(bot.OTHERAlt.jid, 'Maria Lucia');
    await registration('5521999999999@c.us', 'Maria Santos');
    const [r] = await bot.replyAlt('/monitor -l /Maria/');
    assert.match(r, /📹.*Maria Lucia/);
    assert.match(r, /📹.*Maria Santos/);
});
