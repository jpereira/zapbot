/*
 * /tts with several lines (one speech per line, a single voice note) and with -beat.
 */
const bot = require('./helpers/bot');

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { MessageMedia, processes } = bot;

beforeEach(async () => {
    await bot.restart();
    await bot.setSetting('gpt.status', false);
});

const piper = () => processes.calls.filter(c => /tts\.py$/.test(c.args[0]));
const flag = (call, name) => call.args[call.args.indexOf(name) + 1];
const ffmpegGraphs = () => processes.calls.filter(c => c.bin.endsWith('ffmpeg') && c.args.includes('-filter_complex')).map(c => c.args[c.args.indexOf('-filter_complex') + 1]);
const voiceNotes = (r) => r.filter(x => x.content instanceof MessageMedia);

describe('/tts with several lines', () => {
    test('the first line has the defaults; each line is a speech; one voice note comes out', async () => {
        const r = await bot.execute('/tts -local -voice tugão -speed 60 -pause 200\nUm dois\n-pitch 2 Três quatro\n-speed 90 Cinco');
        assert.deepEqual(processes.spokenAll, ['Um dois', 'Três quatro', 'Cinco']);
        assert.equal(voiceNotes(r).length, 1);
        assert.equal(voiceNotes(r)[0].content.mimetype, 'audio/ogg; codecs=opus');
        assert.equal(voiceNotes(r)[0].options.sendAudioAsVoice, true);

        // each line has its own speed (default 60) and the same voice
        assert.deepEqual(piper().map(c => flag(c, '--speed')), ['0.6', '0.6', '0.9']);
        assert.ok(piper().every(c => flag(c, '--voice') === 'pt_PT-tugão-medium'));
        // the pitch of the second line is its own: only that voice note goes through the pitch filter
        const pitched = processes.calls.filter(c => c.args.some(a => /asetrate/.test(String(a))));
        assert.equal(pitched.length, 1);

        // the voice notes are joined (a 200 ms pause after each, none after the last)
        const [graph] = ffmpegGraphs();
        assert.match(graph, /concat=n=3:v=0:a=1\[out\]/);
        assert.equal((graph.match(/apad=pad_dur=0\.2/g) ?? []).length, 2);
    });

    test('a blank line doubles the pause; a line with only options changes the next ones', async () => {
        await bot.execute('/tts -local -pause 100\nUm\n\nDois\n-pause 300\nTrês\nQuatro');
        assert.deepEqual(processes.spokenAll, ['Um', 'Dois', 'Três', 'Quatro']);
        const [graph] = ffmpegGraphs();
        // after "Um" (blank line): 200; after "Dois": 100; after "Três": 300; none after the last
        assert.deepEqual([...graph.matchAll(/apad=pad_dur=([\d.]+)/g)].map(m => Number(m[1])), [0.2, 0.1, 0.3]);
    });

    test('a plain text with lines is still one speech', async () => {
        await bot.execute('/tts -local Primeira linha\nsegunda linha');
        assert.equal(processes.spokenAll.length, 1);
        assert.equal(ffmpegGraphs().length, 0);
    });

    test('-gpt with several lines is refused; a wrong option in any line fails before speaking', async () => {
        await bot.setSetting('gpt.api.key', 'sk-teste');
        assert.match((await bot.replyAlt('/tts -gpt\nUm\nDois'))[0], /só funcionam com a voz local/);

        assert.match((await bot.replyAlt('/tts -local\nUm\n-speed 500 Dois'))[0], /-speed: "500" não vale/);
        assert.match((await bot.replyAlt('/tts -local -pause 99999\nUm\nDois'))[0], /-pause: "99999" não vale/);
        assert.equal(piper().length, 0);
    });

    test('more than 60 lines is refused', async () => {
        const lines = Array.from({ length: 61 }, (_, i) => `linha ${i}`).join('\n');
        assert.match((await bot.replyAlt(`/tts -local\n${lines}`))[0], /61 linhas para falar: o limite é 60/);
        assert.equal(piper().length, 0);
    });

    test('the total text respects tts.maxChars', async () => {
        await bot.setSetting('tts.maxChars', 100);
        assert.match((await bot.replyAlt(`/tts -local\n${'a'.repeat(60)}\n${'b'.repeat(60)}`))[0], /120 caracteres/);
        assert.equal(piper().length, 0);
    });

    test('-q: only the voice note, no notice', async () => {
        const r = await bot.execute('/tts -local -q\nUm\nDois');
        assert.equal(r.length, 1);
        assert.ok(r[0].content instanceof MessageMedia);
    });
});

describe('/tts -beat', () => {
    test('the beat goes under the voice: one bar before and after, at the volume asked', async () => {
        const r = await bot.execute('/tts -local -beat 120 -beatvol 50 Yeah check it');
        assert.equal(voiceNotes(r).length, 1);
        const [graph] = ffmpegGraphs();
        assert.match(graph, /adelay=2000:all=1,apad=pad_dur=2/);      // 120 bpm: one bar (4 beats) is 2 s
        assert.match(graph, /aevalsrc=exprs='.+':s=48000:c=mono,volume=0\.5/);
        assert.match(graph, /amix=inputs=2:duration=first/);
    });

    test('with several lines the beat plays under the joined voice', async () => {
        await bot.execute('/tts -local -beat 90\nUm\nDois');
        const graphs = ffmpegGraphs();
        assert.match(graphs[0], /concat=n=2/);
        assert.match(graphs[1], /aevalsrc/);
    });

    test('bpm and volume have limits', async () => {
        assert.match((await bot.replyAlt('/tts -local -beat 300 oi'))[0], /-beat: "300" não vale\. Use um número de 60 a 180/);
        assert.match((await bot.replyAlt('/tts -local -beat 90 -beatvol 0 oi'))[0], /-beatvol: "0" não vale/);
        assert.equal(piper().length, 0);
    });

    test('the beat expression is made of ffmpeg functions only (no variables but t)', () => {
        const { beatExpression } = bot.src('ttsMix');
        const expr = beatExpression(90);
        assert.doesNotMatch(expr, /e[+-]\d/, 'no exponent notation');
        assert.match(expr, /exp\(-9\*mod\(t,2\*0\.666667\)\)/);
        assert.deepEqual([...new Set(expr.match(/[a-z_]+(?=\()/g))].sort(), ['exp', 'if', 'lt', 'mod', 'random', 'sin']);
    });
});

describe('examples/tts-hip-hop.zb', () => {
    test('/tts.hiphop: the whole song in one voice note, a voice per section, with its beat; what is typed goes in the first line', async () => {
        const OWNER_CHAT = { chat: bot.OWNER.jid };
        assert.match((await bot.replyAlt('/alias -yes -examples tts-hip-hop', OWNER_CHAT)).join('\n'), /tts\.hiphop/);

        const r = await bot.execute('/tts.hiphop -beat 110 -beatvol 55 -q');
        assert.equal(voiceNotes(r).length, 1);
        assert.equal(processes.spokenAll.length, 34);
        assert.equal(processes.spokenAll[0], 'Yeah, yeah, ahn!');
        assert.equal(processes.spokenAll.at(-1), 'O resto é farelo!');
        assert.ok(processes.spokenAll.every(line => !line.startsWith('#') && !line.startsWith('[')), 'the section comments are not spoken');

        // the voice of the first line, and the speed of each section (intro, verse, chorus, verse, final chorus, outro)
        assert.ok(piper().every(c => flag(c, '--voice') === 'pt_PT-tugão-medium'));
        const speeds = piper().map(c => flag(c, '--speed'));
        assert.deepEqual([speeds[0], speeds[4], speeds[12], speeds[16], speeds[18], speeds[26], speeds[30]], ['0.5', '0.75', '0.55', '0.65', '0.85', '0.55', '0.5']);

        // the typed -beat wins over the 95 of the shortcut
        const mix = ffmpegGraphs().at(-1);
        assert.match(mix, /adelay=2182:all=1/); // 110 bpm: one bar is 2.182 s
        assert.match(mix, /volume=0\.55/);
    });

    test('without anything typed, the beat is the 95 bpm of the song', async () => {
        await bot.replyAlt('/alias -yes -examples tts-hip-hop', { chat: bot.OWNER.jid });
        await bot.execute('/tts.hiphop -q');
        assert.match(ffmpegGraphs().at(-1), /adelay=2526:all=1/); // 95 bpm: one bar is 2.526 s
    });

    test('/tuga.rap: replying to any text speaks it with the beat; what is typed after it wins', async () => {
        await bot.replyAlt('/alias -yes -examples tts-hip-hop', { chat: bot.OWNER.jid });
        const quoted = bot.createMessage({ text: 'Qualquer texto que eu quiser', de: bot.OTHERAlt.jid });

        const r = await bot.execute('/tuga.rap -q', { quoted });
        assert.equal(voiceNotes(r).length, 1);
        assert.deepEqual(processes.spokenAll, ['Qualquer texto que eu quiser']);
        assert.equal(flag(piper()[0], '--voice'), 'pt_PT-tugão-medium');
        assert.equal(flag(piper()[0], '--speed'), '0.65');
        assert.match(ffmpegGraphs().at(-1), /adelay=2526:all=1/);

        await bot.execute('/tuga.rap -q -b 120 -sp 80', { quoted });
        assert.equal(flag(piper().at(-1), '--speed'), '0.8');
        assert.match(ffmpegGraphs().at(-1), /adelay=2000:all=1/);
    });
});

describe('examples/tts-lourival.zb', () => {
    test('/tts.lourival: the rap about Lourival in one voice note, with the 98 bpm beat; what is typed goes in the first line', async () => {
        assert.match((await bot.replyAlt('/alias -yes -examples tts-lourival', { chat: bot.OWNER.jid })).join('\n'), /tts\.lourival/);

        const r = await bot.execute('/tts.lourival -q');
        assert.equal(voiceNotes(r).length, 1);
        assert.equal(processes.spokenAll.length, 40);
        assert.equal(processes.spokenAll[0], 'Yeah, yeah, ahn!');
        assert.equal(processes.spokenAll.at(-1), 'O resto é moeda fiat!');
        assert.ok(processes.spokenAll.every(line => !line.startsWith('#') && !line.startsWith('[')), 'the section comments are not spoken');
        assert.ok(processes.spokenAll.some(line => /LOURIVAL/.test(line)) && processes.spokenAll.some(line => /Ancapistão/.test(line)));
        assert.ok(piper().every(c => flag(c, '--voice') === 'pt_PT-tugão-medium'));
        assert.match(ffmpegGraphs().at(-1), /adelay=2449:all=1/); // 98 bpm: one bar is 2.449 s

        await bot.execute('/tts.lourival -beat 110 -q');
        assert.match(ffmpegGraphs().at(-1), /adelay=2182:all=1/); // the typed -beat wins
    });
});

