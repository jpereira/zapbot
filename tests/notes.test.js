/*
 * /notes: anotações (-add, -list, -rem) e o -alerta (data/hora, -to, disparo único).
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { verificarNotas } = bot.src('notas');

const L200 = '120363000000000200@g.us';

beforeEach(async () => {
    await bot.reiniciar();
    await bot.dbRun('DELETE FROM notes');
    await bot.dbRun("DELETE FROM sqlite_sequence WHERE name = 'notes'");
    bot.criarGrupo(L200, 'Grupo sobre L200', [bot.DONO.jid]);
});

const notas = () => bot.dbAll('SELECT id, text, alert_at FROM notes ORDER BY id');

async function vencer(id) {
    await bot.dbRun('UPDATE notes SET alert_at = ? WHERE id = ?', [Date.now() - 1000, id]);
    const antes = bot.client.enviadas.length;
    await verificarNotas();
    return bot.client.enviadas.slice(antes);
}

test('-add, -list e -rem (vários IDs, all e ID inexistente sem remover nada)', async () => {
    assert.match((await bot.responder('/notes'))[0], /Nenhuma anotação/);
    assert.match((await bot.responder('/notes -add comprar leite'))[0], /^📝 \*#1\* · comprar leite$/);
    await bot.responder('/notes -a ligar pro João\nsegunda linha');
    await bot.responder('/notes -a pagar boleto');
    assert.deepEqual((await notas()).map(n => n.text), ['comprar leite', 'ligar pro João\nsegunda linha', 'pagar boleto']);

    const [lista] = await bot.responder('/notes');
    assert.match(lista, /\*#1\* comprar leite/);
    assert.match(lista, /\*#3\* pagar boleto/);
    assert.equal((await bot.responder('/notes -l'))[0], lista);
    assert.equal((await bot.responder('/notes -list'))[0], lista);

    assert.match((await bot.responder('/notes -r 2 9'))[0], /ID 9 não existe/);
    assert.equal((await notas()).length, 3);
    assert.match((await bot.responder('/notes -rem 2'))[0], /1 anotação removida/);
    assert.deepEqual((await notas()).map(n => n.id), [1, 3]);
    assert.match((await bot.responder('/notes -r all'))[0], /2 anotações removidas/);
    assert.equal((await notas()).length, 0);
});

test('-add sem texto, com -to sem -alerta e com quando inválido ou no passado', async () => {
    assert.match((await bot.responder('/notes -add'))[0], /Use: \/notes -add/);
    assert.match((await bot.responder('/notes -add texto -to /Grupo sobre L200/'))[0], /só vale com o -alerta/);
    assert.match((await bot.responder('/notes -add texto -alerta banana'))[0], /Quando inválido/);
    assert.match((await bot.responder('/notes -add texto -alerta 18h sobra'))[0], /Quando inválido/);
    assert.equal((await notas()).length, 0);
});

test('-alerta no -add: dispara uma vez no privado e a anotação continua', async () => {
    const [resposta] = await bot.responder('/notes -a ligar pro João -alerta +2h');
    assert.match(resposta, /^📝 \*#1\* · ligar pro João\n⏰ .* → seu privado$/);
    assert.equal((await notas())[0].text, 'ligar pro João');
    assert.ok((await notas())[0].alert_at > Date.now());

    const antes = bot.client.enviadas.length;
    await verificarNotas();
    assert.equal(bot.client.enviadas.length, antes, 'ainda não venceu');

    const enviadas = await vencer(1);
    assert.equal(enviadas.length, 1);
    assert.match(enviadas[0].content, /ANOTAÇÃO #1[\s\S]*ligar pro João/);
    assert.equal((await notas())[0].alert_at, null, 'o alerta zera, a anotação fica');
    assert.equal((await vencer(1)).length, 1, 'forçando o vencimento de novo, avisa de novo');
    assert.match((await bot.responder('/notes -alerta'))[0], /Nenhuma anotação com alerta/);
});

test('-alerta <id> <quando> com -to, lista e -alerta -rm', async () => {
    await bot.responder('/notes -a reunião');
    await bot.responder('/notes -a outra');
    assert.match((await bot.responder('/notes -alerta 9 +1h'))[0], /ID 9 não existe/);
    assert.match((await bot.responder('/notes -alerta 1 banana'))[0], /Quando inválido/);
    assert.match((await bot.responder('/notes -alerta -to /Grupo sobre L200/'))[0], /só vale ao criar/);

    const [criado] = await bot.responder('/notes -alerta 1 +1h -to /Grupo sobre L200/');
    assert.match(criado, /Alerta criado.*#1/);
    assert.match(criado, /Grupo sobre L200/);

    const [lista] = await bot.responder('/notes -alerta');
    assert.match(lista, /#1/);
    assert.doesNotMatch(lista, /#2/);

    const enviadas = await vencer(1);
    assert.equal(enviadas[0].chatId, L200);

    await bot.responder('/notes -alerta 2 +1h');
    await bot.responder('/notes -alerta -rm 2');
    assert.equal((await notas())[1].alert_at, null);
    assert.equal((await notas()).length, 2, '-alerta -rm mantém as anotações');
    assert.match((await bot.responder('/notes -alerta -rm 7'))[0], /ID 7 não existe/);
});

test('texto sem opção na frente anota (igual ao -add); opção desconhecida dá erro', async () => {
    assert.match((await bot.responder('/notes não esquecer de remover a opção tal'))[0], /^📝 \*#1\* · não esquecer de remover a opção tal$/);
    assert.match((await bot.responder('/notes comprar pão -alerta +1h'))[0], /^📝 \*#2\* · comprar pão\n⏰/);
    assert.deepEqual((await notas()).map(n => n.text), ['não esquecer de remover a opção tal', 'comprar pão']);
    assert.match((await bot.responder('/notes'))[0], /\*#1\* não esquecer/);
    assert.match((await bot.responder('/notes -banana'))[0], /Use: \/notes/);
    assert.equal((await notas()).length, 2);
});

test('#tag: agrupa na lista, filtra e remove por tag', async () => {
    await bot.responder('/notes #casa Lembrar de comprar pão');
    await bot.responder('/notes -a #Duvidas Olhar sobre ETFs');
    await bot.responder('/notes #casa trocar lâmpada');
    await bot.responder('/notes sem tag nenhuma');
    assert.deepEqual((await bot.dbAll('SELECT tag, text FROM notes ORDER BY id')).map(n => n.tag),
        ['casa', 'duvidas', 'casa', null]);

    const [lista] = await bot.responder('/notes');
    assert.ok(lista.indexOf('*#casa* (2)') < lista.indexOf('*#duvidas* (1)'));
    assert.ok(lista.indexOf('*#duvidas* (1)') < lista.indexOf('*sem tag* (1)'));

    const [soCasa] = await bot.responder('/notes #casa');
    assert.match(soCasa, /comprar pão/);
    assert.match(soCasa, /lâmpada/);
    assert.doesNotMatch(soCasa, /ETFs/);
    assert.equal((await bot.responder('/notes -l #casa'))[0], soCasa);
    assert.match((await bot.responder('/notes #nada'))[0], /Nenhuma anotação em #nada/);

    assert.match((await bot.responder('/notes -rem #nada'))[0], /#nada não existe/);
    assert.match((await bot.responder('/notes -rem #casa'))[0], /2 anotações removidas/);
    assert.deepEqual((await notas()).map(n => n.id), [2, 4]);
    await bot.responder('/notes -rem all');
    assert.deepEqual(await notas(), []);
});

test('-export gera o PDF (tudo ou só da #tag) com o nome por data/hora', async () => {
    assert.match((await bot.responder('/notes -e'))[0], /Nenhuma anotação/);
    await bot.responder('/notes #casa Lembrar de comprar pão — “urgente” 🍞');
    await bot.responder('/notes -a #Dúvidas Olhar sobre ETFs');
    await bot.responder('/notes sem tag');

    const antes = bot.client.enviadas.length;
    await bot.responder('/notes -export');
    const todas = bot.client.enviadas.slice(antes).at(-1);
    assert.match(todas.content.filename, /^ZapBot_notes_\d{8}_\d{4}\.pdf$/);
    assert.equal(todas.content.mimetype, 'application/pdf');
    assert.equal(todas.options.sendMediaAsDocument, true);
    const pdf = Buffer.from(todas.content.data, 'base64').toString('latin1');
    assert.match(pdf, /^%PDF-1\.4/);
    assert.match(pdf, /comprar p/);
    assert.match(pdf, /Página 1 de 1/);
    assert.match(pdf, /%%EOF\n$/);

    await bot.responder('/notes -e #casa');
    const soCasa = bot.client.enviadas.at(-1);
    assert.match(soCasa.content.filename, /^ZapBot_notes_tag-casa_\d{8}_\d{4}\.pdf$/);
    assert.doesNotMatch(Buffer.from(soCasa.content.data, 'base64').toString('latin1'), /ETFs/);

    assert.match((await bot.responder('/notes -e #nada'))[0], /Nenhuma anotação em #nada/);
    assert.match((await bot.responder('/notes -e abc'))[0], /Use: \/notes -export/);
});

test('respostas com link na anotação saem sem thumbnail (linkPreview: false)', async () => {
    const url = 'https://www.youtube.com/watch?v=lAt0lgxwnKM';
    const ultima = async (linha) => {
        const antes = bot.client.enviadas.length;
        await bot.responder(linha);
        return bot.client.enviadas.slice(antes).at(-1);
    };

    for (const linha of [`/notes #minhatag lembrar de ver ${url}`, `/notes -a ver ${url} -alerta +2h`,
        '/notes -alerta 1 +3h', '/notes', '/notes #minhatag', '/notes -alerta']) {
        const enviada = await ultima(linha);
        assert.equal(enviada.options.linkPreview, false, linha);
    }
    assert.match((await ultima('/notes')).content, /youtube\.com/);

    const avisos = await vencer(1);
    assert.equal(avisos.at(-1).options.linkPreview, false);
});

test('em resposta a uma mensagem: anota o texto dela com ↩️, com ou sem #tag', async () => {
    const citada = bot.criarMensagem({ de: bot.DONO.jid, texto: 'ver https://exemplo.com/video' });
    const semTexto = bot.criarMensagem({ de: bot.DONO.jid, texto: '' });

    assert.match((await bot.responder('/notes', { citada }))[0], /^📝 \*#1\* · ↩️ ver https:\/\/exemplo\.com\/video$/);
    assert.match((await bot.responder('/notes #lembrete', { citada }))[0], /^📝 \*#2\* · #lembrete · ↩️ ver https:\/\/exemplo\.com\/video$/);
    await bot.responder('/notes -a #lembrete', { citada });
    await bot.responder('/notes -a -alerta +2h', { citada });
    await bot.responder('/notes #lembrete outro texto', { citada });
    assert.deepEqual(await bot.dbAll('SELECT text, tag, alert_at IS NOT NULL AS alerta FROM notes ORDER BY id'), [
        { text: '↩️ ver https://exemplo.com/video', tag: null, alerta: 0 },
        { text: '↩️ ver https://exemplo.com/video', tag: 'lembrete', alerta: 0 },
        { text: '↩️ ver https://exemplo.com/video', tag: 'lembrete', alerta: 0 },
        { text: '↩️ ver https://exemplo.com/video', tag: null, alerta: 1 },
        { text: 'outro texto', tag: 'lembrete', alerta: 0 }
    ]);

    assert.match((await bot.responder('/notes', { citada: semTexto }))[0], /não tem texto/);
    assert.match((await bot.responder('/notes -l', { citada }))[0], /ANOTAÇÕES/);
    assert.equal((await notas()).length, 5);
});

test('-to nas listas e no -export: manda nos destinos; no -rem é recusado', async () => {
    await bot.responder('/notes #casa comprar pão');
    await bot.responder('/notes #duvidas ETFs');
    const enviadas = async (linha) => {
        const antes = bot.client.enviadas.length;
        const respostas = await bot.responder(linha);
        return { respostas, novas: bot.client.enviadas.slice(antes).filter(e => e.chatId === L200) };
    };

    for (const linha of ['/notes -l -to /Grupo sobre L200/', '/notes -to /Grupo sobre L200/']) {
        const { respostas, novas } = await enviadas(linha);
        assert.equal(novas.length, 1, linha);
        assert.match(novas[0].content, /#casa/);
        assert.match(novas[0].content, /#duvidas/);
        assert.equal(novas[0].options.linkPreview, false);
        assert.match(respostas.at(-1), /Anotações enviadas em/);
    }

    const filtrada = await enviadas('/notes #casa -to /Grupo sobre L200/');
    assert.match(filtrada.novas[0].content, /comprar pão/);
    assert.doesNotMatch(filtrada.novas[0].content, /ETFs/);

    const pdf = await enviadas('/notes -e #duvidas -to /Grupo sobre L200/');
    assert.match(pdf.novas[0].content.filename, /^ZapBot_notes_tag-duvidas_\d{8}_\d{4}\.pdf$/);
    assert.equal(pdf.novas[0].options.sendMediaAsDocument, true);
    assert.match(pdf.respostas.at(-1), /PDF das anotações enviado em/);

    assert.match((await bot.responder('/notes -rem #casa -to /Grupo sobre L200/'))[0], /-to não vale ao remover/);
    assert.equal((await notas()).length, 2);
    assert.match((await bot.responder('/notes -l abc -to /Grupo sobre L200/'))[0], /Use: \/notes -l/);
});

test('-export -to e-mail: manda o PDF em anexo, sem mexer no chat', async () => {
    process.env.QRCODE_EMAIL_SMTP_HOST = 'smtp.exemplo.com';
    process.env.QRCODE_EMAIL_SMTP_USER = 'bot@exemplo.com';
    await bot.responder('/notes #minhatag ver https://exemplo.com');
    await bot.responder('/notes #outra nada a ver');

    const antes = bot.client.enviadas.length;
    const respostas = await bot.responder('/notes -e #minhatag -to jpereiran@gmail.com');
    const m = bot.emails.at(-1);
    assert.equal(m.to, 'jpereiran@gmail.com');
    assert.match(m.subject, /Anotações #minhatag/);
    assert.equal(m.attachments.length, 1);
    assert.match(m.attachments[0].filename, /^ZapBot_notes_tag-minhatag_\d{8}_\d{4}\.pdf$/);
    assert.match(m.attachments[0].content.toString('latin1'), /^%PDF-1\.4/);
    assert.doesNotMatch(m.attachments[0].content.toString('latin1'), /nada a ver/);
    assert.match(respostas.at(-1), /PDF das anotações enviado em .*jpereiran@gmail\.com/);
    assert.equal(bot.client.enviadas.slice(antes).filter(e => e.content?.mimetype).length, 0);
});

test('\\n digitado vira quebra de linha na anotação (\\\\n fica como texto)', async () => {
    await bot.responder('/notes linha 1\\nlinha 2');
    await bot.responder('/notes -a #casa um\\ndois\\ntrês');
    await bot.responder('/notes #casa\\nsó depois da quebra');
    await bot.responder('/notes caminho C:\\\\novo');
    assert.deepEqual(await bot.dbAll('SELECT text, tag FROM notes ORDER BY id'), [
        { text: 'linha 1\nlinha 2', tag: null },
        { text: 'um\ndois\ntrês', tag: 'casa' },
        { text: 'só depois da quebra', tag: 'casa' },
        { text: 'caminho C:\\novo', tag: null }
    ]);
});

test('alias de /notes mantém as quebras de linha do texto', async () => {
    await bot.dbRun("INSERT OR REPLACE INTO command_aliases (name, command) VALUES ('/pt', '/notes #pt')");
    await bot.responder('/pt Lista dos casos!\n\n* MENSALÃO R$ 100 MILHÕES\n•  PETROLÃO R$ 42 BILHÕES');
    assert.deepEqual(await bot.dbAll('SELECT text, tag FROM notes'), [
        { text: 'Lista dos casos!\n\n* MENSALÃO R$ 100 MILHÕES\n•  PETROLÃO R$ 42 BILHÕES', tag: 'pt' }
    ]);
});

test('imagem: na própria mensagem ou em resposta, vai para o disco; -rem apaga o arquivo', async () => {
    const fs = require('fs');
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    const midia = { mimetype: 'image/png', data: png.toString('base64') };
    const foto = (texto, extras = {}) => bot.criarMensagem({ de: bot.DONO.jid, texto, midia, ...extras });

    const [r1] = await bot.responder('/notes #minhatag Imagem de teste', { midia });
    assert.match(r1, /^📝 \*#1\* · #minhatag · 🖼️ · Imagem de teste$/);

    await bot.responder('/notes #lembrete', { citada: foto('legenda da foto') });  // reply, com legenda
    await bot.responder('/notes', { midia });                                       // só a imagem
    await bot.responder('/notes', { citada: foto('') });                            // reply, sem legenda

    const linhas = await bot.dbAll('SELECT text, tag, media_path, media_mime FROM notes ORDER BY id');
    assert.deepEqual(linhas.map(n => [n.text, n.tag, n.media_mime]), [
        ['Imagem de teste', 'minhatag', 'image/png'],
        ['↩️ legenda da foto', 'lembrete', 'image/png'],
        ['', null, 'image/png'],
        ['', null, 'image/png']
    ]);
    for (const n of linhas) {
        assert.match(n.media_path, /notes[\\/]\d+_\w+\.png$/);
        assert.deepEqual(fs.readFileSync(n.media_path), png);
    }

    const [lista] = await bot.responder('/notes');
    assert.match(lista, /\*#1\* Imagem de teste\n   🖼️ _imagem_/);
    assert.match(lista, /\*#3\* 🖼️ _imagem_/);

    await bot.responder('/notes -rem 1');
    assert.equal(fs.existsSync(linhas[0].media_path), false);
    assert.equal(fs.existsSync(linhas[1].media_path), true);
    await bot.responder('/notes -rem all');
    assert.equal(linhas.some(n => fs.existsSync(n.media_path)), false);

    // Só imagens
    const video = { mimetype: 'video/mp4', data: 'AAAA' };
    assert.match((await bot.responder('/notes #v filme', { midia: video }))[0], /guarda só imagens/);
    assert.equal((await notas()).length, 0);
});

test('a confirmação mostra só os 35 primeiros caracteres do texto, numa linha', async () => {
    const [r] = await bot.responder('/notes #casa Lista dos principais casos de corrupção\ndo Brasil e do mundo');
    assert.equal(r, '📝 *#1* · #casa · Lista dos principais casos de corru…');
    assert.equal(Array.from(r.split(' · ').at(-1).replace('…', '')).length, 35);
});

test('-search: texto (sem acento/maiúscula), /regex/flags, #tag, -to e erros', async () => {
    await bot.responder('/notes #casa Comprar pão e leite');
    await bot.responder('/notes #duvidas Olhar sobre ETFs');
    await bot.responder('/notes Ligar pro João amanhã');

    assert.equal((await bot.responder('/notes -search'))[0], '❌ Use: /notes -search [#tag...] <texto|/regex/flags> [-to <destino>]...');

    const [texto] = await bot.responder('/notes -s PAO');
    assert.match(texto, /🔎 PAO\* \(1\)/);
    assert.match(texto, /Comprar pão/);
    assert.doesNotMatch(texto, /ETFs|João/);

    const [regex] = await bot.responder('/notes -search /etf|joão/i');
    assert.match(regex, /\(2\)/);
    assert.match(regex, /ETFs/);
    assert.match(regex, /João/);
    assert.doesNotMatch(regex, /pão/);

    assert.match((await bot.responder('/notes -s /^ligar pro/i'))[0], /\(1\)/);
    assert.match((await bot.responder('/notes -s duvidas'))[0], /ETFs/);            // casa a tag
    assert.match((await bot.responder('/notes -s #casa leite'))[0], /\(1\)/);        // tag + busca
    assert.match((await bot.responder('/notes -s #duvidas leite'))[0], /Nenhuma anotação em #duvidas com 🔎 leite/);
    assert.match((await bot.responder('/notes -s "comprar pão"'))[0], /\(1\)/);
    assert.match((await bot.responder('/notes -s /(x+)+y/'))[0], /risco de travar/);
    assert.match((await bot.responder('/notes -s /[/'))[0], /regex inválida/);

    const antes = bot.client.enviadas.length;
    await bot.responder('/notes -s etf -to /Grupo sobre L200/');
    const nova = bot.client.enviadas.slice(antes).find(e => e.chatId === L200);
    assert.match(nova.content, /ETFs/);
    assert.equal(nova.options.linkPreview, false);
});

test('-tags: as tags com a quantidade de anotações (sem tag por último)', async () => {
    assert.match((await bot.responder('/notes -tags'))[0], /Nenhuma anotação/);
    await bot.responder('/notes #casa um');
    await bot.responder('/notes #duvidas dois');
    await bot.responder('/notes #casa três');
    await bot.responder('/notes sem tag');

    const [r] = await bot.responder('/notes -t');
    assert.equal(r.split('\n\n💡')[0], '🏷️ *TAGS* (2)\n\n#casa: 2\n#duvidas: 1\nsem tag: 1\n\n📝 4 anotações');
    assert.equal((await bot.responder('/notes -tags'))[0], r);
    assert.match((await bot.responder('/notes -tags abc'))[0], /Use: \/notes -tags/);

    const antes = bot.client.enviadas.length;
    await bot.responder('/notes -t -to /Grupo sobre L200/');
    assert.match(bot.client.enviadas.slice(antes).find(e => e.chatId === L200).content, /#casa: 2/);
});

test('-update: troca o texto (e a tag, se vier) e mantém o alerta', async () => {
    await bot.responder('/notes #casa comprar pão -alerta +2h');
    await bot.responder('/notes #duvidas ETFs');

    assert.match((await bot.responder('/notes -update 1 comprar pão e leite'))[0], /^✏️ \*#1\* · #casa · comprar pão e leite$/);
    assert.match((await bot.responder('/notes -u #2 #estudo ver ETFs\\nde novo'))[0], /^✏️ \*#2\* · #estudo · ver ETFs de novo$/);
    assert.deepEqual(await bot.dbAll('SELECT text, tag, alert_at IS NOT NULL AS alerta FROM notes ORDER BY id'), [
        { text: 'comprar pão e leite', tag: 'casa', alerta: 1 },
        { text: 'ver ETFs\nde novo', tag: 'estudo', alerta: 0 }
    ]);

    assert.match((await bot.responder('/notes -update 9 x'))[0], /ID 9 não existe/);
    assert.match((await bot.responder('/notes -u 1'))[0], /Use: \/notes -update/);
    assert.match((await bot.responder('/notes -update #novatag'))[0], /Use: \/notes -update/);
    assert.match((await bot.responder('/notes -update 1 #so'))[0], /Use: \/notes -update/);

    // Em resposta a uma mensagem, sem texto: usa o dela, com ↩️
    const citada = bot.criarMensagem({ de: bot.DONO.jid, texto: 'texto citado' });
    await bot.responder('/notes -u 1', { citada });
    assert.equal((await notas())[0].text, '↩️ texto citado');

    // O -e é só o -export
    await bot.responder('/notes -e');
    assert.match(bot.client.enviadas.at(-1).content.filename, /^ZapBot_notes_\d{8}_\d{4}\.pdf$/);
    await bot.responder('/notes -e #estudo');
    assert.match(bot.client.enviadas.at(-1).content.filename, /^ZapBot_notes_tag-estudo_/);
});

test('-alerta com #tag: põe o alerta em todas as anotações da tag (com -to), lista e tira por tag', async () => {
    await bot.responder('/notes #minhatag um');
    await bot.responder('/notes #minhatag dois');
    await bot.responder('/notes #outra três');
    await bot.responder('/notes sem tag');

    const [r] = await bot.responder('/notes -alerta #minhatag +2h -to /Grupo sobre L200/');
    assert.match(r, /Alerta criado\* em 2 anotações de #minhatag \(#1, #2\)/);
    assert.match(r, /Grupo sobre L200/);
    assert.deepEqual((await bot.dbAll('SELECT id, alert_at IS NOT NULL AS a FROM notes ORDER BY id')).map(n => n.a), [1, 1, 0, 0]);

    // Lista só os alertas da tag
    const [lista] = await bot.responder('/notes -alerta #minhatag');
    assert.match(lista, /ALERTAS DAS ANOTAÇÕES #minhatag/);
    assert.match(lista, /um/);
    assert.match(lista, /dois/);
    assert.match((await bot.responder('/notes -alerta #outra'))[0], /Nenhuma anotação em #outra com alerta/);

    // Dispara cada uma, no grupo
    assert.equal((await vencer(1)).filter(e => e.chatId === L200).length, 1);
    assert.equal((await vencer(2)).filter(e => e.chatId === L200).length, 1);

    // Erros: tag sem notas, quando inválido e -to sem alerta
    assert.match((await bot.responder('/notes -alerta #nada +2h'))[0], /Nenhuma anotação em #nada/);
    assert.match((await bot.responder('/notes -alerta #minhatag lixo'))[0], /Quando inválido/);
    assert.match((await bot.responder('/notes -alerta #minhatag -to /Grupo sobre L200/'))[0], /-to só vale ao criar/);

    // Tira por tag (já existia) e o id continua funcionando
    await bot.responder('/notes -alerta #outra +1h');
    assert.match((await bot.responder('/notes -alerta -rm #outra'))[0], /1 alerta removido/);
    assert.match((await bot.responder('/notes -alerta 4 +3h'))[0], /Alerta criado\* na anotação #4/);
});
