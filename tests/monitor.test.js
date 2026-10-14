const bot = require('./helpers/bot');
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const monitor = bot.src('monitor');
const { consultarPresenca } = bot.src('presenca');

beforeEach(bot.reiniciar);
afterEach(() => {
    monitor.pararMonitor();
    delete bot.client.pupPage;
});

const cadastro = async (id = bot.OUTRO.jid, nome = 'Fulano') =>
    (await monitor.cadastrarMonitorado({ id, nome })).contato;
const horario = (lastSeen = 1792007399, extra = {}) => ({
    presenceData: { isOnline: false, hasData: true, lastSeen,
        chatstate: { type: 'unavailable', t: lastSeen }, ...extra },
    lastSeenSource: 'Presence.chatstate.t',
    lastSeenKind: 'chatstate offline (confirmar no aplicativo)'
});
const liberarIntervalo = () => bot.dbRun('UPDATE monitor_contacts SET last_attempt_at = 0');

test('/monitor sem cadastro e /help explicam uso e risco', async () => {
    const [r] = await bot.responder('/monitor');
    assert.match(r, /Nenhum contato cadastrado/);
    assert.match(r, /a cada 5 min \(300 s\)/);
    assert.match(r, /bloqueio/);
    const [help] = await bot.responder('/help monitor');
    assert.match(help, /-add.*-a/);
    assert.match(help, /-rem.*-r/);
    assert.match(help, /-list.*-l/);
    assert.doesNotMatch((await bot.responder('/help'))[0], /Uso: \/test/);
});

test('/monitor é só do dono e admins', async () => {
    assert.deepEqual(await bot.responder('/monitor', { de: bot.OUTRO.jid }), []);
});

test('cadastro por nome, delimitadores, número e menção não duplica a pessoa', async () => {
    for (const comando of ['/monitor -add Fulano', '/monitor -a /Fulano/',
        '/monitor -add "Fulano"', `/monitor -a +${bot.OUTRO.user}`,
        `/monitor -add @${bot.OUTRO.user}`]) {
        const [r] = await bot.responder(comando, { mencoes: [bot.OUTRO.jid] });
        assert.match(r, /cadastrado/);
    }
    assert.equal((await monitor.listarMonitorados()).length, 1);
    assert.match((await bot.responder('/monitor'))[0], /📹 #\d+ · Fulano/);
});

test('LID da menção e telefone do contato compartilham cadastro', async () => {
    const lid = '100000000123451@lid';
    bot.client.lids.set(lid, bot.OUTRO.jid);
    await bot.responder('/monitor -a /Fulano/');
    await bot.responder('/monitor -a @100000000123451', { mencoes: [lid] });
    assert.equal((await monitor.listarMonitorados()).length, 1);
});

test('nome com espaços e ambiguidades usa a escolha padrão', async () => {
    bot.criarContato('5521999991101@c.us', 'Jorge Chip L200');
    bot.criarContato('5521999991102@c.us', 'Jorge Casa');
    await bot.responderEscolhendo('/monitor -a Jorge', 2);
    const rows = await monitor.listarMonitorados();
    assert.equal(rows.length, 1);
    assert.match(rows[0].contact_name, /^Jorge/);
});

test('limite absoluto de 5 é atômico sob cadastros concorrentes', async () => {
    const resultados = await Promise.all(Array.from({ length: 7 }, (_, i) =>
        monitor.cadastrarMonitorado({ id: `552199999${1100 + i}@c.us`, nome: `Contato ${i}` })));
    assert.equal((await monitor.listarMonitorados()).length, 5);
    assert.equal(resultados.filter(r => r.limite).length, 2);
    const [r] = await bot.responder('/monitor -a /Fulano/');
    assert.match(r, /Limite de 5 contatos atingido/);
});

test('settings aceitam = e espaço, validam limites e mostram avisos', async () => {
    assert.match((await bot.responder('/set monitor.pool=120'))[0], /monitor.pool.*120/);
    assert.equal(bot.getSetting('monitor.pool'), 120);
    assert.match((await bot.responder('/set monitor.pool 300'))[0], /bloqueio/);
    assert.match((await bot.responder('/set monitor.max=5'))[0], /bloqueio/);
    assert.match((await bot.responder('/set monitor.max 6'))[0], /entre 1 e 5/);
    assert.match((await bot.responder('/set monitor.pool 119'))[0], /entre 120 e 86400/);
    assert.match((await bot.responder('/set monitor.pool'))[0], /Nenhum intervalo/);
    await cadastro();
    await cadastro('5521999991101@c.us');
    assert.match((await bot.responder('/set monitor.max=1'))[0], /remova contatos/);
    await bot.responder('/set monitor.enabled=false');
    assert.equal(bot.getSetting('monitor.enabled'), false);
    assert.match((await bot.responder('/monitor'))[0], /pausado/);
});

test('histórico guarda apenas horários distintos e diferencia a observação', async () => {
    const c = await cadastro();
    let resultado = horario();
    let calls = 0;
    bot.client.pupPage = { async evaluate(fn, id, options) {
        assert.equal(id, c.contact_id);
        assert.deepEqual(options, { monitor: true });
        calls++;
        return resultado;
    } };
    await monitor.verificarMonitor();
    await monitor.verificarMonitor();
    assert.equal(calls, 1);
    await liberarIntervalo();
    await monitor.verificarMonitor();
    assert.equal((await monitor.historicoMonitorado(c.id)).length, 1);
    resultado = horario(1792007499);
    await liberarIntervalo();
    await monitor.verificarMonitor();
    const h = await monitor.historicoMonitorado(c.id);
    assert.deepEqual(h.map(x => x.last_seen), [1792007499, 1792007399]);
    assert.ok(h[0].observed_at > h[0].last_seen);
    const [r] = await bot.responder('/monitor -l');
    assert.match(r, /a cada 5 min/);
    assert.match(r, /Histórico: 2 horário/);
    assert.match(r, /Origem: presença do WhatsApp · horário não confirmado/);
    assert.doesNotMatch(r, /Presence\.chatstate|confirmar no aplicativo/);
    assert.equal(h[0].source, 'Presence.chatstate.t');
    assert.match(h[0].kind, /confirmar no aplicativo/);
});

test('sem dados ou online não fabrica horários nem apaga o anterior', async () => {
    const c = await cadastro();
    let resultado = horario();
    bot.client.pupPage = { evaluate: async () => resultado };
    await monitor.verificarMonitor();
    for (const r of [horario(null, { hasData: false }), horario(null, { isOnline: true }),
        horario(1792007599, { hasData: false }), horario(1792007599, { isOnline: true }),
        horario(null)]) {
        resultado = r;
        await liberarIntervalo();
        await monitor.verificarMonitor();
    }
    const rows = await monitor.listarMonitorados();
    assert.equal(rows[0].last_seen, 1792007399);
    assert.equal((await monitor.historicoMonitorado(c.id)).length, 1);
    assert.match(rows[0].last_status, /sem horário/);
});

test('conexão, pausa, comando desativado e setting off impedem consultas', async () => {
    await cadastro();
    let calls = 0;
    bot.client.pupPage = { evaluate: async () => { calls++; return horario(); } };
    bot.estado.pronto = false;
    await monitor.verificarMonitor();
    bot.estado.pronto = true;
    await bot.setSetting('monitor.enabled', false);
    await monitor.verificarMonitor();
    await bot.setSetting('monitor.enabled', true);
    await bot.setSetting('bot.paused', true);
    await monitor.verificarMonitor();
    await bot.setSetting('bot.paused', false);
    await bot.setSetting('commands.disabled', 'monitor');
    await monitor.verificarMonitor();
    assert.equal(calls, 0);
    await bot.setSetting('commands.disabled', []);
    await monitor.verificarMonitor();
    assert.equal(calls, 1);
});

test('cadastros e histórico sobrevivem à recarga de settings', async () => {
    const c = await cadastro();
    bot.client.pupPage = { evaluate: async () => horario() };
    await monitor.verificarMonitor();
    await bot.src('settings').carregarSettings();
    assert.equal((await monitor.listarMonitorados())[0].id, c.id);
    assert.equal((await monitor.historicoMonitorado(c.id)).length, 1);
});

test('remoção apaga histórico e mantém o id dos outros contatos', async () => {
    const a = await cadastro();
    const b = await cadastro('5521999991101@c.us', 'Outro');
    bot.client.pupPage = { evaluate: async () => horario() };
    await monitor.verificarMonitor();
    assert.match((await bot.responder(`/monitor -rem ${a.id}`))[0], /histórico removidos/);
    assert.equal((await monitor.historicoMonitorado(a.id)).length, 0);
    assert.equal((await monitor.listarMonitorados())[0].id, b.id);
    assert.match((await bot.responder(`/monitor -r ${a.id}`))[0], /não cadastrado/);
});

test('falhas respeitam intervalo e não impedem a próxima pessoa', async () => {
    const a = await cadastro();
    const b = await cadastro('5521999991101@c.us', 'Outro');
    let calls = 0;
    bot.client.pupPage = { evaluate: async (fn, id) => {
        calls++;
        if (id === a.contact_id) throw new Error('Página indisponível');
        return horario();
    } };
    await monitor.verificarMonitor();
    await monitor.verificarMonitor();
    assert.equal(calls, 2);
    const rows = await monitor.listarMonitorados();
    assert.equal(rows[0].last_error, 'Página indisponível');
    assert.equal((await monitor.historicoMonitorado(b.id)).length, 1);
});

test('consulta em andamento não se sobrepõe nem recria cadastro removido', async () => {
    const c = await cadastro();
    let concluir;
    let iniciou;
    const entrada = new Promise(resolve => { iniciou = resolve; });
    bot.client.pupPage = { evaluate: () => new Promise(resolve => {
        concluir = resolve;
        iniciou();
    }) };
    const primeira = monitor.verificarMonitor();
    await entrada;
    await monitor.verificarMonitor();
    await monitor.removerMonitorado(c.id);
    concluir(horario());
    await primeira;
    assert.equal((await monitor.historicoMonitorado(c.id)).length, 0);
    assert.equal((await monitor.listarMonitorados()).length, 0);
});

test('trava compartilhada não consome o intervalo de uma consulta adiada', async () => {
    const c = await cadastro();
    let concluir;
    bot.client.pupPage = { evaluate: () => new Promise(resolve => { concluir = resolve; }) };
    const outra = consultarPresenca('5521999991101@c.us');
    await monitor.verificarMonitor();
    assert.equal((await monitor.listarMonitorados())[0].last_attempt_at, 0);
    concluir(horario());
    await outra;
    bot.client.pupPage.evaluate = async () => horario();
    await monitor.verificarMonitor();
    assert.equal((await monitor.historicoMonitorado(c.id)).length, 1);
});

test('histórico extenso é enviado completo como documento de texto', async () => {
    await bot.src('settings').setSetting('monitor.maxRecords', 70);
    const c = await cadastro();
    for (let i = 0; i < 70; i++) {
        await bot.dbRun(`INSERT INTO monitor_history
            (contact_id, last_seen, observed_at, source, kind) VALUES (?, ?, ?, ?, ?)`,
        [c.id, 1792007399 + i, Date.now(), 'Presence.chatstate.t', 'candidato offline']);
    }
    await bot.responder('/monitor -list');
    const media = bot.client.enviadas.at(-1).content;
    assert.equal(media.filename, 'monitor-historico.txt');
    const texto = Buffer.from(media.data, 'base64').toString();
    assert.match(texto, /Histórico: 70 horário/);
    assert.equal((texto.match(/observado em/g) ?? []).length, 70);
    assert.match(texto, /a cada 5 min/);
});

test('recusa sintaxe inválida, grupo, e-mail e menção digitada', async () => {
    for (const linha of ['/monitor -add', '/monitor -rem', '/monitor -rem 0',
        '/monitor -rem -1', '/monitor -list extra', '/monitor -x',
        '/monitor -a /Família/', '/monitor -a fulano@exemplo.com',
        `/monitor -a @${bot.OUTRO.user}`]) {
        assert.match((await bot.responder(linha))[0], /^❌/, linha);
    }
    assert.equal((await monitor.listarMonitorados()).length, 0);
});

test('histórico ignora horários inválidos e preserva o último horário conhecido', async () => {
    const c = await cadastro();
    let resultado = horario();
    bot.client.pupPage = { evaluate: async () => resultado };
    await monitor.verificarMonitor();
    for (const valor of [true, false, {}, 'deny', -1, 0, NaN, 9e15]) {
        resultado = horario(valor);
        await liberarIntervalo();
        await monitor.verificarMonitor();
    }
    assert.equal((await monitor.historicoMonitorado(c.id)).length, 1);
    resultado = horario(1792007299);
    await liberarIntervalo();
    await monitor.verificarMonitor();
    assert.equal((await monitor.historicoMonitorado(c.id)).length, 2);
    assert.equal((await monitor.listarMonitorados())[0].last_seen, 1792007399);
});

test('remoção por contato usa o mesmo resolvedor do cadastro', async () => {
    for (const linha of ['/monitor -rem Fulano', '/monitor -r /Fulano/',
        '/monitor -rem "Fulano"', `/monitor -r @${bot.OUTRO.user}`,
        `/monitor -rem +${bot.OUTRO.user}`, `/monitor -r ${bot.OUTRO.user}`]) {
        await cadastro();
        const [r] = await bot.responder(linha, { mencoes: [bot.OUTRO.jid] });
        assert.match(r, /cadastro e histórico removidos/, linha);
        assert.equal((await monitor.listarMonitorados()).length, 0);
    }
});

test('remoção por nome com espaços e ambiguidade oferece a escolha padrão', async () => {
    const a = '5521999991131@c.us';
    const b = '5521999991132@c.us';
    bot.criarContato(a, 'Jorge Chip L200');
    bot.criarContato(b, 'Jorge Casa');
    await cadastro(a, 'Jorge Chip L200');
    await cadastro(b, 'Jorge Casa');
    await bot.responderEscolhendo('/monitor -r Jorge', 2);
    assert.equal((await monitor.listarMonitorados()).length, 1);
    const restante = (await monitor.listarMonitorados())[0];
    const [r] = await bot.responder(`/monitor -rem /${restante.contact_name}/`);
    assert.match(r, /removidos/);
    assert.equal((await monitor.listarMonitorados()).length, 0);
});

test('remoção reconhece LID/telefone e informa pessoa não cadastrada', async () => {
    const lid = '100000000123452@lid';
    bot.client.lids.set(lid, bot.OUTRO.jid);
    await cadastro(lid);
    assert.match((await bot.responder('/monitor -rem /Fulano/'))[0], /removidos/);
    assert.equal((await monitor.listarMonitorados()).length, 0);
    assert.match((await bot.responder('/monitor -r /Fulano/'))[0], /não está cadastrado/);
});

test('remove o id com prefixo # mostrado em /monitor -l', async () => {
    const c = await cadastro();
    assert.match((await bot.responder('/monitor -l'))[0], new RegExp(`#${c.id} · Fulano`));
    assert.match((await bot.responder(`/monitor -r #${c.id}`))[0], /removidos/);
    assert.equal((await monitor.listarMonitorados()).length, 0);
});

test('agendador inicia uma vez e sua parada cancela o timer', async t => {
    let calls = 0;
    bot.client.pupPage = { evaluate: async () => { calls++; return horario(); } };
    await cadastro();
    t.mock.timers.enable({ apis: ['setInterval'] });
    monitor.iniciarMonitor();
    monitor.iniciarMonitor();
    t.mock.timers.tick(10000);
    for (let i = 0; i < 20; i++) await new Promise(setImmediate);
    assert.equal(calls, 1);
    monitor.pararMonitor();
    await liberarIntervalo();
    t.mock.timers.tick(10000);
    for (let i = 0; i < 20; i++) await new Promise(setImmediate);
    assert.equal(calls, 1);
});


test('maxRecords limita o banco por contato e as duas listas aos horários mais recentes', async () => {
    const settings = bot.src('settings');
    assert.equal(settings.getSetting('monitor.maxRecords'), 30);
    assert.match((await bot.responder('/set monitor.maxRecords=2'))[0], /maxRecords.*2/);
    const a = await cadastro();
    const b = await cadastro('5521999999999@c.us', 'Outro');
    let t = 1792007399;
    bot.client.pupPage = { evaluate: async () => horario(t) };
    for (let i = 0; i < 4; i++) {
        await liberarIntervalo();
        await monitor.verificarMonitor();
        t++;
    }
    for (const c of [a, b]) {
        const rows = await bot.dbAll('SELECT * FROM monitor_history WHERE contact_id = ?', [c.id]);
        assert.equal(rows.length, 2);
        assert.deepEqual(rows.map(r => r.last_seen).sort(), [t - 2, t - 1]);
    }
    for (const cmd of ['/monitor', '/monitor -l']) {
        const [reply] = await bot.responder(cmd);
        assert.match(reply, /Histórico: 2 horário/);
        assert.match(reply, /limite: 2/);
        assert.equal((reply.match(/observado em/g) ?? []).length, 4);
    }
    await settings.setSetting('monitor.maxRecords', 1);
    assert.equal((await bot.dbAll('SELECT * FROM monitor_history')).length, 2);
    assert.match((await bot.responder('/set monitor.maxRecords 0'))[0], /entre 1 e 1000/);
    assert.match((await bot.responder('/set monitor.maxRecords 1001'))[0], /entre 1 e 1000/);
});

test('carregar settings remove histórico excedente por contato', async () => {
    const c = await cadastro();
    await bot.src('settings').setSetting('monitor.maxRecords', 1);
    for (const t of [100, 200, 300]) {
        await bot.dbRun(`INSERT INTO monitor_history (contact_id, last_seen, observed_at)
            VALUES (?, ?, ?)`, [c.id, t, Date.now()]);
    }
    await bot.src('settings').carregarSettings();
    const rows = await bot.dbAll('SELECT * FROM monitor_history WHERE contact_id = ?', [c.id]);
    assert.deepEqual(rows.map(r => r.last_seen), [300]);
});
