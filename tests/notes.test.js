/*
 * /notes: notes (-add, -list, -rem) and the -alerta (date/time, -to, one-shot).
 */
const bot = require('./helpers/bot');

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { checkNotes } = bot.src('notes');

const L200 = '120363000000000200@g.us';

beforeEach(async () => {
    await bot.restart();
    await bot.dbRun('DELETE FROM notes');
    await bot.dbRun("DELETE FROM sqlite_sequence WHERE name = 'notes'");
    bot.createGroup(L200, 'Grupo sobre L200', [bot.OWNER.jid]);
});

const notes = () => bot.dbAll('SELECT id, text, alert_at FROM notes ORDER BY id');

async function expire(id) {
    await bot.dbRun('UPDATE notes SET alert_at = ? WHERE id = ?', [Date.now() - 1000, id]);
    const beforeAlt = bot.client.enviadas.length;
    await checkNotes();
    return bot.client.enviadas.slice(beforeAlt);
}

test('-add, -list e -rem (vários IDs, all e ID inexistente sem remover nada)', async () => {
    assert.match((await bot.replyAlt('/notes'))[0], /Nenhuma anotação/);
    assert.match((await bot.replyAlt('/notes -add comprar leite'))[0], /^📝 \*#1\* · comprar leite$/);
    await bot.replyAlt('/notes -a ligar pro João\nsegunda linha');
    await bot.replyAlt('/notes -a pagar boleto');
    assert.deepEqual((await notes()).map(n => n.text), ['comprar leite', 'ligar pro João\nsegunda linha', 'pagar boleto']);

    const [list] = await bot.replyAlt('/notes');
    assert.match(list, /\*#1\* comprar leite/);
    assert.match(list, /\*#3\* pagar boleto/);
    assert.equal((await bot.replyAlt('/notes -l'))[0], list);
    assert.equal((await bot.replyAlt('/notes -list'))[0], list);

    assert.match((await bot.replyAlt('/notes -r 2 9'))[0], /ID 9 não existe/);
    assert.equal((await notes()).length, 3);
    assert.match((await bot.replyAlt('/notes -rem 2'))[0], /1 anotação removida/);
    assert.deepEqual((await notes()).map(n => n.id), [1, 3]);
    assert.match((await bot.replyAlt('/notes -r all'))[0], /2 anotações removidas/);
    assert.equal((await notes()).length, 0);
});

test('-add sem texto, com -to sem -alerta e com quando inválido ou no passado', async () => {
    assert.match((await bot.replyAlt('/notes -add'))[0], /Use: \/notes -add/);
    assert.match((await bot.replyAlt('/notes -add texto -to /Grupo sobre L200/'))[0], /só vale com o -alerta/);
    assert.match((await bot.replyAlt('/notes -add texto -alerta banana'))[0], /Quando inválido/);
    assert.match((await bot.replyAlt('/notes -add texto -alerta 18h sobra'))[0], /Quando inválido/);
    assert.equal((await notes()).length, 0);
});

test('-alerta no -add: dispara uma vez no privado e a anotação continua', async () => {
    const [reply] = await bot.replyAlt('/notes -a ligar pro João -alerta +2h');
    assert.match(reply, /^📝 \*#1\* · ligar pro João\n⏰ .* → seu privado$/);
    assert.equal((await notes())[0].text, 'ligar pro João');
    assert.ok((await notes())[0].alert_at > Date.now());

    const beforeAlt = bot.client.enviadas.length;
    await checkNotes();
    assert.equal(bot.client.enviadas.length, beforeAlt, 'ainda não venceu');

    const sentAlt2 = await expire(1);
    assert.equal(sentAlt2.length, 1);
    assert.match(sentAlt2[0].content, /ANOTAÇÃO #1[\s\S]*ligar pro João/);
    assert.equal((await notes())[0].alert_at, null, 'o alerta zera, a anotação fica');
    assert.equal((await expire(1)).length, 1, 'forçando o vencimento de novo, avisa de novo');
    assert.match((await bot.replyAlt('/notes -alerta'))[0], /Nenhuma anotação com alerta/);
});

test('-alerta <id> <quando> com -to, lista e -alerta -rm', async () => {
    await bot.replyAlt('/notes -a reunião');
    await bot.replyAlt('/notes -a outra');
    assert.match((await bot.replyAlt('/notes -alerta 9 +1h'))[0], /ID 9 não existe/);
    assert.match((await bot.replyAlt('/notes -alerta 1 banana'))[0], /Quando inválido/);
    assert.match((await bot.replyAlt('/notes -alerta -to /Grupo sobre L200/'))[0], /só vale ao criar/);

    const [created] = await bot.replyAlt('/notes -alerta 1 +1h -to /Grupo sobre L200/');
    assert.match(created, /Alerta criado.*#1/);
    assert.match(created, /Grupo sobre L200/);

    const [list] = await bot.replyAlt('/notes -alerta');
    assert.match(list, /#1/);
    assert.doesNotMatch(list, /#2/);

    const sentAlt2 = await expire(1);
    assert.equal(sentAlt2[0].chatId, L200);

    await bot.replyAlt('/notes -alerta 2 +1h');
    await bot.replyAlt('/notes -alerta -rm 2');
    assert.equal((await notes())[1].alert_at, null);
    assert.equal((await notes()).length, 2, '-alerta -rm mantém as anotações');
    assert.match((await bot.replyAlt('/notes -alerta -rm 7'))[0], /ID 7 não existe/);
});

test('texto sem opção na frente anota (igual ao -add); opção desconhecida dá erro', async () => {
    assert.match((await bot.replyAlt('/notes não esquecer de remover a opção tal'))[0], /^📝 \*#1\* · não esquecer de remover a opção tal$/);
    assert.match((await bot.replyAlt('/notes comprar pão -alerta +1h'))[0], /^📝 \*#2\* · comprar pão\n⏰/);
    assert.deepEqual((await notes()).map(n => n.text), ['não esquecer de remover a opção tal', 'comprar pão']);
    assert.match((await bot.replyAlt('/notes'))[0], /\*#1\* não esquecer/);
    assert.match((await bot.replyAlt('/notes -banana'))[0], /Use: \/notes/);
    assert.equal((await notes()).length, 2);
});

test('#tag: agrupa na lista, filtra e remove por tag', async () => {
    await bot.replyAlt('/notes #casa Lembrar de comprar pão');
    await bot.replyAlt('/notes -a #Duvidas Olhar sobre ETFs');
    await bot.replyAlt('/notes #casa trocar lâmpada');
    await bot.replyAlt('/notes sem tag nenhuma');
    assert.deepEqual((await bot.dbAll('SELECT tag, text FROM notes ORDER BY id')).map(n => n.tag),
        ['casa', 'duvidas', 'casa', null]);

    const [list] = await bot.replyAlt('/notes');
    assert.ok(list.indexOf('*#casa* (2)') < list.indexOf('*#duvidas* (1)'));
    assert.ok(list.indexOf('*#duvidas* (1)') < list.indexOf('*sem tag* (1)'));

    const [soHome] = await bot.replyAlt('/notes #casa');
    assert.match(soHome, /comprar pão/);
    assert.match(soHome, /lâmpada/);
    assert.doesNotMatch(soHome, /ETFs/);
    assert.equal((await bot.replyAlt('/notes -l #casa'))[0], soHome);
    assert.match((await bot.replyAlt('/notes #nada'))[0], /Nenhuma anotação em #nada/);

    assert.match((await bot.replyAlt('/notes -rem #nada'))[0], /#nada não existe/);
    assert.match((await bot.replyAlt('/notes -rem #casa'))[0], /2 anotações removidas/);
    assert.deepEqual((await notes()).map(n => n.id), [2, 4]);
    await bot.replyAlt('/notes -rem all');
    assert.deepEqual(await notes(), []);
});

test('-export gera o PDF (tudo ou só da #tag) com o nome por data/hora', async () => {
    assert.match((await bot.replyAlt('/notes -e'))[0], /Nenhuma anotação/);
    await bot.replyAlt('/notes #casa Lembrar de comprar pão — “urgente” 🍞');
    await bot.replyAlt('/notes -a #Dúvidas Olhar sobre ETFs');
    await bot.replyAlt('/notes sem tag');

    const beforeAlt = bot.client.enviadas.length;
    await bot.replyAlt('/notes -export');
    const allAlt = bot.client.enviadas.slice(beforeAlt).at(-1);
    assert.match(allAlt.content.filename, /^ZapBot_notes_\d{8}_\d{4}\.pdf$/);
    assert.equal(allAlt.content.mimetype, 'application/pdf');
    assert.equal(allAlt.options.sendMediaAsDocument, true);
    const pdf = Buffer.from(allAlt.content.data, 'base64').toString('latin1');
    assert.match(pdf, /^%PDF-1\.4/);
    assert.match(pdf, /comprar p/);
    assert.match(pdf, /Página 1 de 1/);
    assert.match(pdf, /%%EOF\n$/);

    await bot.replyAlt('/notes -e #casa');
    const soHome = bot.client.enviadas.at(-1);
    assert.match(soHome.content.filename, /^ZapBot_notes_tag-casa_\d{8}_\d{4}\.pdf$/);
    assert.doesNotMatch(Buffer.from(soHome.content.data, 'base64').toString('latin1'), /ETFs/);

    assert.match((await bot.replyAlt('/notes -e #nada'))[0], /Nenhuma anotação em #nada/);
    assert.match((await bot.replyAlt('/notes -e abc'))[0], /Use: \/notes -export/);
});

test('respostas com link na anotação saem sem thumbnail (linkPreview: false)', async () => {
    const url = 'https://www.youtube.com/watch?v=lAt0lgxwnKM';
    const last = async (line) => {
        const beforeAlt = bot.client.enviadas.length;
        await bot.replyAlt(line);
        return bot.client.enviadas.slice(beforeAlt).at(-1);
    };

    for (const line of [`/notes #minhatag lembrar de ver ${url}`, `/notes -a ver ${url} -alerta +2h`,
        '/notes -alerta 1 +3h', '/notes', '/notes #minhatag', '/notes -alerta']) {
        const sent = await last(line);
        assert.equal(sent.options.linkPreview, false, line);
    }
    assert.match((await last('/notes')).content, /youtube\.com/);

    const notices = await expire(1);
    assert.equal(notices.at(-1).options.linkPreview, false);
});

test('em resposta a uma mensagem: anota o texto dela com ↩️, com ou sem #tag', async () => {
    const quoted = bot.createMessage({ de: bot.OWNER.jid, texto: 'ver https://exemplo.com/video' });
    const withoutText = bot.createMessage({ de: bot.OWNER.jid, texto: '' });

    assert.match((await bot.replyAlt('/notes', { citada: quoted }))[0], /^📝 \*#1\* · ↩️ ver https:\/\/exemplo\.com\/video$/);
    assert.match((await bot.replyAlt('/notes #lembrete', { citada: quoted }))[0], /^📝 \*#2\* · #lembrete · ↩️ ver https:\/\/exemplo\.com\/video$/);
    await bot.replyAlt('/notes -a #lembrete', { citada: quoted });
    await bot.replyAlt('/notes -a -alerta +2h', { citada: quoted });
    await bot.replyAlt('/notes #lembrete outro texto', { citada: quoted });
    assert.deepEqual(await bot.dbAll('SELECT text, tag, alert_at IS NOT NULL AS alerta FROM notes ORDER BY id'), [
        { text: '↩️ ver https://exemplo.com/video', tag: null, alerta: 0 },
        { text: '↩️ ver https://exemplo.com/video', tag: 'lembrete', alerta: 0 },
        { text: '↩️ ver https://exemplo.com/video', tag: 'lembrete', alerta: 0 },
        { text: '↩️ ver https://exemplo.com/video', tag: null, alerta: 1 },
        { text: 'outro texto', tag: 'lembrete', alerta: 0 }
    ]);

    assert.match((await bot.replyAlt('/notes', { citada: withoutText }))[0], /não tem texto/);
    assert.match((await bot.replyAlt('/notes -l', { citada: quoted }))[0], /ANOTAÇÕES/);
    assert.equal((await notes()).length, 5);
});

test('-to nas listas e no -export: manda nos destinos; no -rem é recusado', async () => {
    await bot.replyAlt('/notes #casa comprar pão');
    await bot.replyAlt('/notes #duvidas ETFs');
    const sentAlt2 = async (line) => {
        const beforeAlt = bot.client.enviadas.length;
        const replies = await bot.replyAlt(line);
        return { respostas: replies, novas: bot.client.enviadas.slice(beforeAlt).filter(e => e.chatId === L200) };
    };

    for (const line of ['/notes -l -to /Grupo sobre L200/', '/notes -to /Grupo sobre L200/']) {
        const { respostas: replies, novas: freshAlt2 } = await sentAlt2(line);
        assert.equal(freshAlt2.length, 1, line);
        assert.match(freshAlt2[0].content, /#casa/);
        assert.match(freshAlt2[0].content, /#duvidas/);
        assert.equal(freshAlt2[0].options.linkPreview, false);
        assert.match(replies.at(-1), /Anotações enviadas em/);
    }

    const filtered = await sentAlt2('/notes #casa -to /Grupo sobre L200/');
    assert.match(filtered.novas[0].content, /comprar pão/);
    assert.doesNotMatch(filtered.novas[0].content, /ETFs/);

    const pdf = await sentAlt2('/notes -e #duvidas -to /Grupo sobre L200/');
    assert.match(pdf.novas[0].content.filename, /^ZapBot_notes_tag-duvidas_\d{8}_\d{4}\.pdf$/);
    assert.equal(pdf.novas[0].options.sendMediaAsDocument, true);
    assert.match(pdf.respostas.at(-1), /PDF das anotações enviado em/);

    assert.match((await bot.replyAlt('/notes -rem #casa -to /Grupo sobre L200/'))[0], /-to não vale ao remover/);
    assert.equal((await notes()).length, 2);
    assert.match((await bot.replyAlt('/notes -l abc -to /Grupo sobre L200/'))[0], /Use: \/notes -l/);
});

test('-export -to e-mail: manda o PDF em anexo, sem mexer no chat', async () => {
    process.env.QRCODE_EMAIL_SMTP_HOST = 'smtp.exemplo.com';
    process.env.QRCODE_EMAIL_SMTP_USER = 'bot@exemplo.com';
    await bot.replyAlt('/notes #minhatag ver https://exemplo.com');
    await bot.replyAlt('/notes #outra nada a ver');

    const beforeAlt = bot.client.enviadas.length;
    const replies = await bot.replyAlt('/notes -e #minhatag -to jpereiran@gmail.com');
    const m = bot.emails.at(-1);
    assert.equal(m.to, 'jpereiran@gmail.com');
    assert.match(m.subject, /Anotações #minhatag/);
    assert.equal(m.attachments.length, 1);
    assert.match(m.attachments[0].filename, /^ZapBot_notes_tag-minhatag_\d{8}_\d{4}\.pdf$/);
    assert.match(m.attachments[0].content.toString('latin1'), /^%PDF-1\.4/);
    assert.doesNotMatch(m.attachments[0].content.toString('latin1'), /nada a ver/);
    assert.match(replies.at(-1), /PDF das anotações enviado em .*jpereiran@gmail\.com/);
    assert.equal(bot.client.enviadas.slice(beforeAlt).filter(e => e.content?.mimetype).length, 0);
});

test('\\n digitado vira quebra de linha na anotação (\\\\n fica como texto)', async () => {
    await bot.replyAlt('/notes linha 1\\nlinha 2');
    await bot.replyAlt('/notes -a #casa um\\ndois\\ntrês');
    await bot.replyAlt('/notes #casa\\nsó depois da quebra');
    await bot.replyAlt('/notes caminho C:\\\\novo');
    assert.deepEqual(await bot.dbAll('SELECT text, tag FROM notes ORDER BY id'), [
        { text: 'linha 1\nlinha 2', tag: null },
        { text: 'um\ndois\ntrês', tag: 'casa' },
        { text: 'só depois da quebra', tag: 'casa' },
        { text: 'caminho C:\\novo', tag: null }
    ]);
});

test('alias de /notes mantém as quebras de linha do texto', async () => {
    await bot.dbRun("INSERT OR REPLACE INTO command_aliases (name, command) VALUES ('/pt', '/notes #pt')");
    await bot.replyAlt('/pt Lista dos casos!\n\n* MENSALÃO R$ 100 MILHÕES\n•  PETROLÃO R$ 42 BILHÕES');
    assert.deepEqual(await bot.dbAll('SELECT text, tag FROM notes'), [
        { text: 'Lista dos casos!\n\n* MENSALÃO R$ 100 MILHÕES\n•  PETROLÃO R$ 42 BILHÕES', tag: 'pt' }
    ]);
});

test('imagem: na própria mensagem ou em resposta, vai para o disco; -rem apaga o arquivo', async () => {
    const fs = require('fs');
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    const mediaAlt = { mimetype: 'image/png', data: png.toString('base64') };
    const photo = (textAlt, extras = {}) => bot.createMessage({ de: bot.OWNER.jid, texto: textAlt, midia: mediaAlt, ...extras });

    const [r1] = await bot.replyAlt('/notes #minhatag Imagem de teste', { midia: mediaAlt });
    assert.match(r1, /^📝 \*#1\* · #minhatag · 🖼️ · Imagem de teste$/);

    await bot.replyAlt('/notes #lembrete', { citada: photo('legenda da foto') });  // reply, with a caption
    await bot.replyAlt('/notes', { midia: mediaAlt });                                       // only the image
    await bot.replyAlt('/notes', { citada: photo('') });                            // reply, without a caption

    const linesAlt = await bot.dbAll('SELECT text, tag, media_path, media_mime FROM notes ORDER BY id');
    assert.deepEqual(linesAlt.map(n => [n.text, n.tag, n.media_mime]), [
        ['Imagem de teste', 'minhatag', 'image/png'],
        ['↩️ legenda da foto', 'lembrete', 'image/png'],
        ['', null, 'image/png'],
        ['', null, 'image/png']
    ]);
    for (const n of linesAlt) {
        assert.match(n.media_path, /notes[\\/]\d+_\w+\.png$/);
        assert.deepEqual(fs.readFileSync(n.media_path), png);
    }

    const [list] = await bot.replyAlt('/notes');
    assert.match(list, /\*#1\* Imagem de teste\n   🖼️ _imagem_/);
    assert.match(list, /\*#3\* 🖼️ _imagem_/);

    await bot.replyAlt('/notes -rem 1');
    assert.equal(fs.existsSync(linesAlt[0].media_path), false);
    assert.equal(fs.existsSync(linesAlt[1].media_path), true);
    await bot.replyAlt('/notes -rem all');
    assert.equal(linesAlt.some(n => fs.existsSync(n.media_path)), false);

    // Images only
    const video = { mimetype: 'video/mp4', data: 'AAAA' };
    assert.match((await bot.replyAlt('/notes #v filme', { midia: video }))[0], /guarda só imagens/);
    assert.equal((await notes()).length, 0);
});

test('-export: as imagens entram no PDF (JPEG), com a anotação como legenda; imagem inválida não derruba', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    await bot.replyAlt('/notes #eleicao Narrativas polares', { midia: { mimetype: 'image/png', data: png.toString('base64') } });
    await bot.replyAlt('/notes #eleicao quebrada', { midia: { mimetype: 'image/png', data: Buffer.from('nao e imagem').toString('base64') } });

    await bot.replyAlt('/notes -export', { erroEsperado: true });
    const pdf = Buffer.from(bot.client.enviadas.at(-1).content.data, 'base64').toString('latin1');
    assert.equal(pdf.match(/\/Subtype \/Image/g).length, 1);
    assert.match(pdf, /\/Filter \/DCTDecode/);
    assert.match(pdf, /\/Im5 5 0 R/);
    assert.match(pdf, /Narrativas polares/);
    assert.match(pdf, /imagem n.o inclu.da/);
    assert.match(pdf, /%%EOF\n$/);
    await bot.replyAlt('/notes -rem all');
});

test('-view: manda a imagem com o texto na legenda (e só o texto, sem imagem)', async () => {
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    const mediaAlt = { mimetype: 'image/png', data: png.toString('base64') };
    await bot.replyAlt('/notes #eleicao Narrativas', { midia: mediaAlt });
    await bot.replyAlt('/notes #eleicao sem imagem');

    const beforeAlt = bot.client.enviadas.length;
    await bot.replyAlt('/notes -v 1');
    const photo = bot.client.enviadas.slice(beforeAlt).at(-1);
    assert.match(photo.options.caption, /#1\* · #eleicao · .*\nNarrativas/);
    assert.ok(photo.content?.data || photo.content?.mimetype);

    assert.match((await bot.replyAlt('/notes -v 2'))[0], /#2\* · #eleicao[\s\S]*sem imagem/);
    assert.match((await bot.replyAlt('/notes -v #eleic'))[0], /Narrativas|sem imagem/);
    assert.match((await bot.replyAlt('/notes -v 9'))[0], /9 não existe/);
    assert.match((await bot.replyAlt('/notes -v'))[0], /Use: \/notes -view/);

    const n = bot.client.enviadas.length;
    await bot.replyAlt('/notes -v 1 -to /Grupo sobre L200/');
    const fresh = bot.client.enviadas.slice(n).find(e => e.chatId === L200);
    assert.match(fresh.options.caption, /Narrativas/);
    await bot.replyAlt('/notes -rem all');
});

test('a confirmação mostra só os 35 primeiros caracteres do texto, numa linha', async () => {
    const [r] = await bot.replyAlt('/notes #casa Lista dos principais casos de corrupção\ndo Brasil e do mundo');
    assert.equal(r, '📝 *#1* · #casa · Lista dos principais casos de corru…');
    assert.equal(Array.from(r.split(' · ').at(-1).replace('…', '')).length, 35);
});

test('-search: texto (sem acento/maiúscula), /regex/flags, #tag, -to e erros', async () => {
    await bot.replyAlt('/notes #casa Comprar pão e leite');
    await bot.replyAlt('/notes #duvidas Olhar sobre ETFs');
    await bot.replyAlt('/notes Ligar pro João amanhã');

    assert.equal((await bot.replyAlt('/notes -search'))[0], '❌ Use: /notes -search [#tag...] <texto|/regex/flags> [-to <destino>]...');

    const [textAlt] = await bot.replyAlt('/notes -s PAO');
    assert.match(textAlt, /🔎 PAO\* \(1\)/);
    assert.match(textAlt, /Comprar pão/);
    assert.doesNotMatch(textAlt, /ETFs|João/);

    const [regex] = await bot.replyAlt('/notes -search /etf|joão/i');
    assert.match(regex, /\(2\)/);
    assert.match(regex, /ETFs/);
    assert.match(regex, /João/);
    assert.doesNotMatch(regex, /pão/);

    assert.match((await bot.replyAlt('/notes -s /^ligar pro/i'))[0], /\(1\)/);
    assert.match((await bot.replyAlt('/notes -s duvidas'))[0], /ETFs/);            // casa a tag
    assert.match((await bot.replyAlt('/notes -s #casa leite'))[0], /\(1\)/);        // tag + busca
    assert.match((await bot.replyAlt('/notes -s #duvidas leite'))[0], /Nenhuma anotação em #duvidas com 🔎 leite/);
    assert.match((await bot.replyAlt('/notes -s "comprar pão"'))[0], /\(1\)/);
    assert.match((await bot.replyAlt('/notes -s /(x+)+y/'))[0], /risco de travar/);
    assert.match((await bot.replyAlt('/notes -s /[/'))[0], /regex inválida/);

    const beforeAlt = bot.client.enviadas.length;
    await bot.replyAlt('/notes -s etf -to /Grupo sobre L200/');
    const fresh = bot.client.enviadas.slice(beforeAlt).find(e => e.chatId === L200);
    assert.match(fresh.content, /ETFs/);
    assert.equal(fresh.options.linkPreview, false);
});

test('-tags: as tags com a quantidade de anotações (sem tag por último)', async () => {
    assert.match((await bot.replyAlt('/notes -tags'))[0], /Nenhuma anotação/);
    await bot.replyAlt('/notes #casa um');
    await bot.replyAlt('/notes #duvidas dois');
    await bot.replyAlt('/notes #casa três');
    await bot.replyAlt('/notes sem tag');

    const [r] = await bot.replyAlt('/notes -t');
    assert.equal(r.split('\n\n💡')[0], '🏷️ *TAGS* (2)\n\n#casa: 2\n#duvidas: 1\nsem tag: 1\n\n📝 4 anotações');
    assert.equal((await bot.replyAlt('/notes -tags'))[0], r);
    assert.match((await bot.replyAlt('/notes -tags abc'))[0], /Use: \/notes -tags/);

    const beforeAlt = bot.client.enviadas.length;
    await bot.replyAlt('/notes -t -to /Grupo sobre L200/');
    assert.match(bot.client.enviadas.slice(beforeAlt).find(e => e.chatId === L200).content, /#casa: 2/);
});

test('-move: renomeia a tag (juntando se a nova já existe)', async () => {
    await bot.replyAlt('/notes #casa um');
    await bot.replyAlt('/notes #casa dois');
    await bot.replyAlt('/notes #lar três');
    assert.match((await bot.replyAlt('/notes -move #casa #CASA'))[0], /igual/);
    assert.match((await bot.replyAlt('/notes -m #nada #x'))[0], /#nada não existe/);
    assert.match((await bot.replyAlt('/notes -m casa'))[0], /Use: \/notes -move/);
    assert.match((await bot.replyAlt('/notes -m #casa #lar'))[0], /#casa → #lar · 2 anotações/);
    assert.match((await bot.replyAlt('/notes -t'))[0], /#lar: 3/);
    await bot.replyAlt('/notes -rem all');
});

test('tag parcial: #idei acha #ideias (exata ganha; remover pede a inteira)', async () => {
    await bot.replyAlt('/notes #ideias app novo');
    await bot.replyAlt('/notes #ideia curta');
    await bot.replyAlt('/notes #casa pão');
    assert.match((await bot.replyAlt('/notes #idei'))[0], /curta[\s\S]*app novo/);
    assert.doesNotMatch((await bot.replyAlt('/notes #idei'))[0], /pão/);
    assert.doesNotMatch((await bot.replyAlt('/notes #ideia'))[0], /app novo/);
    assert.match((await bot.replyAlt('/notes -s #cas pão'))[0], /pão/);
    assert.match((await bot.replyAlt('/notes -rem #idei'))[0], /#idei não existe/);
    await bot.replyAlt('/notes -rem all');
});

test('-desc: grava, mostra, aparece na lista e no -tags, vai no -move e apaga com -rm', async () => {
    await bot.replyAlt('/notes #casa pão');
    assert.match((await bot.replyAlt('/notes -d #casa'))[0], /não tem descrição/);
    assert.match((await bot.replyAlt('/notes -d #casa Coisas da casa'))[0], /descrição salva/);
    assert.match((await bot.replyAlt('/notes -d #casa Coisas de casa'))[0], /trocada/);
    assert.match((await bot.replyAlt('/notes -d #cas'))[0], /Coisas de casa/);
    assert.match((await bot.replyAlt('/notes #casa'))[0], /_Coisas de casa_/);
    assert.match((await bot.replyAlt('/notes -t'))[0], /#casa: 1 · _Coisas de casa_/);
    await bot.replyAlt('/notes -m #casa #lar');
    assert.match((await bot.replyAlt('/notes -d #lar'))[0], /Coisas de casa/);
    assert.match((await bot.replyAlt('/notes -d #lar -rm'))[0], /apagada/);
    assert.match((await bot.replyAlt('/notes -d #lar -rm'))[0], /não tem descrição/);
    assert.match((await bot.replyAlt('/notes -d'))[0], /Use: \/notes -desc/);
    await bot.replyAlt('/notes -rem all');
});

test('-update: troca o texto (e a tag, se vier) e mantém o alerta', async () => {
    await bot.replyAlt('/notes #casa comprar pão -alerta +2h');
    await bot.replyAlt('/notes #duvidas ETFs');

    assert.match((await bot.replyAlt('/notes -update 1 comprar pão e leite'))[0], /^✏️ \*#1\* · #casa · comprar pão e leite$/);
    assert.match((await bot.replyAlt('/notes -u #2 #estudo ver ETFs\\nde novo'))[0], /^✏️ \*#2\* · #estudo · ver ETFs de novo$/);
    assert.deepEqual(await bot.dbAll('SELECT text, tag, alert_at IS NOT NULL AS alerta FROM notes ORDER BY id'), [
        { text: 'comprar pão e leite', tag: 'casa', alerta: 1 },
        { text: 'ver ETFs\nde novo', tag: 'estudo', alerta: 0 }
    ]);

    assert.match((await bot.replyAlt('/notes -update 9 x'))[0], /ID 9 não existe/);
    assert.match((await bot.replyAlt('/notes -u 1'))[0], /Use: \/notes -update/);
    assert.match((await bot.replyAlt('/notes -update #novatag'))[0], /Use: \/notes -update/);
    assert.match((await bot.replyAlt('/notes -update 1 #so'))[0], /Use: \/notes -update/);

    // In reply to a message, without text: uses its own, with ↩️
    const quoted = bot.createMessage({ de: bot.OWNER.jid, texto: 'texto citado' });
    await bot.replyAlt('/notes -u 1', { citada: quoted });
    assert.equal((await notes())[0].text, '↩️ texto citado');

    // -e is just -export
    await bot.replyAlt('/notes -e');
    assert.match(bot.client.enviadas.at(-1).content.filename, /^ZapBot_notes_\d{8}_\d{4}\.pdf$/);
    await bot.replyAlt('/notes -e #estudo');
    assert.match(bot.client.enviadas.at(-1).content.filename, /^ZapBot_notes_tag-estudo_/);
});

test('-alerta com #tag: põe o alerta em todas as anotações da tag (com -to), lista e tira por tag', async () => {
    await bot.replyAlt('/notes #minhatag um');
    await bot.replyAlt('/notes #minhatag dois');
    await bot.replyAlt('/notes #outra três');
    await bot.replyAlt('/notes sem tag');

    const [r] = await bot.replyAlt('/notes -alerta #minhatag +2h -to /Grupo sobre L200/');
    assert.match(r, /Alerta criado\* em 2 anotações de #minhatag \(#1, #2\)/);
    assert.match(r, /Grupo sobre L200/);
    assert.deepEqual((await bot.dbAll('SELECT id, alert_at IS NOT NULL AS a FROM notes ORDER BY id')).map(n => n.a), [1, 1, 0, 0]);

    // Lists only the tag's alerts
    const [list] = await bot.replyAlt('/notes -alerta #minhatag');
    assert.match(list, /ALERTAS DAS ANOTAÇÕES #minhatag/);
    assert.match(list, /um/);
    assert.match(list, /dois/);
    assert.match((await bot.replyAlt('/notes -alerta #outra'))[0], /Nenhuma anotação em #outra com alerta/);

    // Fires each one, in the group
    assert.equal((await expire(1)).filter(e => e.chatId === L200).length, 1);
    assert.equal((await expire(2)).filter(e => e.chatId === L200).length, 1);

    // Errors: tag without notes, when invalid and -to without an alert
    assert.match((await bot.replyAlt('/notes -alerta #nada +2h'))[0], /Nenhuma anotação em #nada/);
    assert.match((await bot.replyAlt('/notes -alerta #minhatag lixo'))[0], /Quando inválido/);
    assert.match((await bot.replyAlt('/notes -alerta #minhatag -to /Grupo sobre L200/'))[0], /-to só vale ao criar/);

    // Removes by tag (it already existed) and the id still works
    await bot.replyAlt('/notes -alerta #outra +1h');
    assert.match((await bot.replyAlt('/notes -alerta -rm #outra'))[0], /1 alerta removido/);
    assert.match((await bot.replyAlt('/notes -alerta 4 +3h'))[0], /Alerta criado\* na anotação #4/);
});
