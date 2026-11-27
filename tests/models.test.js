/*
 * The local models of /stt and /tts (src/models.js): STT_MODELS and TTS_VOICES, what is ready, what is missing
 * (downloaded in the background) and the names that do not exist; stt.model takes only a known name.
 */
const bot = require('./helpers/bot');

const { test, beforeEach, describe } = require('node:test');
const assert = require('node:assert/strict');

const models = bot.src('models');

describe('STT_MODELS and TTS_VOICES', () => {
    test('the list: commas or spaces, once each, in order', () => {
        assert.deepEqual(models.parseList('small, large-v3-turbo  small;medium'), ['small', 'large-v3-turbo', 'medium']);
        assert.deepEqual(models.parseList(''), []);
    });

    test('the plan: ready, missing (downloaded) and unknown (told), the aliases included', () => {
        const status = { available: ['small', 'large-v3', 'large', 'large-v3-turbo', 'turbo'], installed: [{ model: 'small' }, { model: 'large-v3-turbo' }] };
        assert.deepEqual(models.planModels(['small', 'turbo', 'large', 'large-v9'], status, 'model'),
            { ready: ['small', 'turbo'], missing: ['large'], unknown: ['large-v9'] });
    });

    test('without the catalog (no network for the Piper voices), nothing is unknown: the download tells', () => {
        assert.deepEqual(models.planModels(['pt_BR-faber-medium', 'xx'], { available: null, installed: [{ voice: 'pt_BR-faber-medium' }] }, 'voice'),
            { ready: ['pt_BR-faber-medium'], missing: ['xx'], unknown: [] });
    });

    test('the log line of the ones that exist: ✅ here, ⬇️ downloading, and a long catalog cut with the total', () => {
        const status = { available: ['tiny', 'small', 'large-v3-turbo'], installed: [{ model: 'small' }] };
        assert.equal(models.availableLine(status, 'model', ['large-v3-turbo']), 'tiny, small ✅, large-v3-turbo ⬇️');
        assert.equal(models.availableLine(status, 'model', [], 2), 'tiny, small ✅, … (3 in all)');
    });

    test('an approximate size for the log before the download', () => {
        assert.equal(models.sttSize('large-v3-turbo'), 1600);
        assert.equal(models.sttSize('base.en'), 145);
    });
});

describe('stt.model', () => {
    beforeEach(() => bot.restart());

    test('takes a name faster-whisper knows, or a Hugging Face repository; a typo is refused with the list', async () => {
        await bot.setSetting('stt.model', 'large-v3-turbo');
        assert.equal(bot.getSetting('stt.model'), 'large-v3-turbo');
        await bot.setSetting('stt.model', 'Systran/faster-whisper-small');
        await assert.rejects(bot.setSetting('stt.model', 'large-v3-trubo'), /large-v3-turbo/);
        assert.equal(bot.getSetting('stt.model'), 'Systran/faster-whisper-small');
    });
});

describe('/stt without the dash', () => {
    beforeEach(() => bot.restart());

    test('"/stt model large-v3-turbo" asks "did you mean -model?" instead of taking "model" as a link', async () => {
        const [reply] = await bot.replyAlt('/stt model large-v3-turbo', { chat: bot.OWNER.jid });
        assert.match(reply, /-model/);
        assert.doesNotMatch(reply, /inválida|invalid/);
    });
});

describe('"all" and the best defaults', () => {
    test('"all": every model, without the aliases; the ones of the settings first, then the smallest', () => {
        const available = ['tiny', 'small', 'large-v3', 'large', 'large-v3-turbo', 'turbo', 'medium'];
        assert.deepEqual(models.expandWanted(['all'], ['large-v3-turbo'], available, models.sttSize),
            ['large-v3-turbo', 'tiny', 'small', 'medium', 'large-v3']);
        assert.deepEqual(models.expandWanted(['small', 'medium'], ['large-v3-turbo'], available, models.sttSize), ['large-v3-turbo', 'small', 'medium']);
        assert.deepEqual(models.expandWanted(['all'], ['x'], null, models.sttSize), ['x'], 'no catalog: only the ones of the settings');
    });

    test('the defaults are the best ones: large-v3, the tuga voice and en_US-lessac-high', async () => {
        await bot.restart();
        assert.equal(bot.getSetting('stt.model'), 'large-v3');
        assert.equal(bot.getSetting('tts.voice.en'), 'en_US-lessac-high');
        assert.equal(bot.getSetting('tts.voice.pt'), 'pt_PT-tugão-medium');
    });
});

describe('STT_MODEL, TTS_VOICE_PT and TTS_VOICE_EN', () => {
    test('the env is the default of the setting; a name that is not a model keeps the best one', () => {
        const path = require.resolve('../src/settings');
        const saved = require.cache[path];
        process.env.STT_MODEL = 'large-v3';
        process.env.TTS_VOICE_EN = 'not a voice';
        delete require.cache[path];
        try {
            const { SETTINGS_SCHEMA } = require(path);
            assert.equal(SETTINGS_SCHEMA['stt.model'].default, 'large-v3');
            assert.equal(SETTINGS_SCHEMA['tts.voice.en'].default, 'en_US-lessac-high');
            assert.equal(SETTINGS_SCHEMA['tts.voice.pt'].default, 'pt_PT-tugão-medium');
        } finally {
            delete process.env.STT_MODEL;
            delete process.env.TTS_VOICE_EN;
            require.cache[path] = saved;
        }
    });
});

describe('STT_MODEL changed in config/.env and the bot restarted', () => {
    beforeEach(() => bot.restart());

    test('the setting takes the new model (downloaded at the start); an unchanged .env keeps a /set', async () => {
        const settings = bot.src('settings');
        const { dbRun } = bot.src('db');
        const schema = settings.SETTINGS_SCHEMA['stt.model'];
        const saved = schema.default;
        try {
            await dbRun('DELETE FROM env_applied');
            process.env.STT_MODEL = schema.default;
            await settings.loadSettings();
            assert.equal(bot.getSetting('stt.model'), 'large-v3', 'the first time it is only recorded');

            await bot.setSetting('stt.model', 'small');
            await settings.loadSettings();
            assert.equal(bot.getSetting('stt.model'), 'small', 'the same .env does not undo the /set');

            process.env.STT_MODEL = schema.default = 'medium';
            await settings.loadSettings();
            assert.equal(bot.getSetting('stt.model'), 'medium', 'the .env changed: it wins');
            assert.ok(bot.logs.some(l => /'stt.model' → medium: STT_MODEL changed/.test(l)));
        } finally {
            schema.default = saved;
            delete process.env.STT_MODEL;
        }
    });
});
