/*
 * The local models of /stt (faster-whisper) and /tts (Piper): which ones exist, which ones are here, and the ones
 * to keep ready. STT_MODELS and TTS_VOICES (config/.env) list more of them ("all": every one); the models the settings
 * use (stt.model, tts.voice.pt, tts.voice.en) always, and first. At startup the log shows every model that exists, each
 * one marked ready or not, and the missing ones are downloaded in the background, one at a time, to the cache
 * volume (WHISPER_MODELS_DIR, PIPER_VOICES_DIR): they survive a new image. What comes in the image stays there.
 */

const fs = require('fs');

const { BIN_PYTHON, PIPER_DIR, SCRIPT_STT, SCRIPT_TTS, STT_MODEL_NAMES, WHISPER_DIR } = require('./constants');
const { printError, printInfo, printSuccess } = require('./log');
const { captureOutput } = require('./util/processes');
const { humanSize } = require('./util/files');
const { t } = require('./i18n');

// Empty (the default): only the ones the settings use (STT_MODEL, TTS_VOICE_PT, TTS_VOICE_EN, in the image);
// "all": every model that exists (~20 GB of STT, ~11 GB of TTS), downloaded in the background after the start
const DEFAULT_STT = '';
const DEFAULT_TTS = '';
const DOWNLOAD_TIMEOUT_MS = 60 * 60 * 1000; // a large-v3 is ~3 GB
// free space kept on the disk beyond the model (the database, the media and the backups live there too)
const DISK_MARGIN = 5 * 1024 ** 3;
// the aliases of faster-whisper (the same repository as large-v3 and large-v3-turbo): never downloaded twice
const STT_ALIASES = { large: 'large-v3', turbo: 'large-v3-turbo' };

// About how big each faster-whisper model is (int8 on the disk), for the log before the download
const STT_SIZES_MB = {
    tiny: 75, base: 145, small: 465, medium: 1500, 'large-v1': 3000, 'large-v2': 3000, 'large-v3': 3000, large: 3000,
    'large-v3-turbo': 1600, turbo: 1600, 'distil-large-v2': 1500, 'distil-large-v3': 1500, 'distil-large-v3.5': 1500,
    'distil-medium.en': 790, 'distil-small.en': 330
};
const sttSize = (model) => STT_SIZES_MB[model] ?? STT_SIZES_MB[model.replace(/\.en$/, '')];

// "small, large-v3-turbo" or "small large-v3-turbo": the names, once each, in order
const parseList = (text) => [...new Set(String(text ?? '').split(/[\s,;]+/).map(s => s.trim()).filter(Boolean))];

// What the bot keeps: { stt: {...}, tts: {...} } (Health shows it)
const state = { stt: null, tts: null };

/**
 * What to do with the wanted models, given the status of the script.
 * @returns {{ready: string[], missing: string[], unknown: string[]}}
 */
function planModels(wanted, status, key) {
    const installed = new Set((status?.installed ?? []).map(item => item[key]));
    const available = status?.available ? new Set(status.available) : null; // null: the catalog did not come
    const ready = [], missing = [], unknown = [];
    for (const name of wanted) {
        // an alias (large, turbo) is installed when its first name is
        if (installed.has(name) || installed.has(STT_ALIASES[name])) ready.push(name);
        else if (available && !available.has(name)) unknown.push(name);
        else missing.push(name);
    }
    return { ready, missing, unknown };
}

// The models that exist, one line, each one with ✅ (here) or ⬇️ (being downloaded)
function availableLine(status, key, downloading, limit = Infinity) {
    const installed = new Set((status.installed ?? []).map(item => item[key]));
    const names = status.available ?? [];
    const shown = names.slice(0, limit).map(name => (installed.has(name) ? `${name} ✅` : downloading.includes(name) ? `${name} ⬇️` : name));
    return names.length > limit ? `${shown.join(', ')}, … (${names.length} in all)` : shown.join(', ');
}

// The two kinds of model, with their script, folder and how the log names them
const KINDS = {
    stt: { label: '🎙️ STT', command: '/stt', script: SCRIPT_STT, dir: WHISPER_DIR, key: 'model', flag: '--model', envName: 'STT_MODELS', sizeOf: (model) => sttSize(model) },
    tts: { label: '🗣️ TTS', command: '/tts', script: SCRIPT_TTS, dir: PIPER_DIR, key: 'voice', flag: '--voice', envName: 'TTS_VOICES', limit: 40, sizeOf: (voice) => ({ x_low: 20, low: 28, medium: 63, high: 114 })[voice.split('-').at(-1)] }
};

async function readStatus(script, dir) {
    const output = await captureOutput(BIN_PYTHON, [script, '--status', '--dir', dir], 60_000);
    return JSON.parse(String(output).trim().split('\n').at(-1));
}

/**
 * The wanted list: "all" becomes every model that exists (without the aliases); the ones the settings use go
 * first, then the smallest ones (the most models ready soonest).
 */
function expandWanted(spec, first, available, sizeOf) {
    const all = spec.includes('all');
    const rest = all ? (available ?? []).filter(name => !STT_ALIASES[name]) : spec;
    const bySize = [...rest].sort((a, b) => (sizeOf(a) ?? 1e9) - (sizeOf(b) ?? 1e9));
    return [...new Set([...first, ...(all ? bySize : rest).filter(name => name !== 'all')])];
}

// The free space of the disk of a folder (created if it is not there), in bytes; null if it cannot be read
function freeSpace(dir) {
    try {
        fs.mkdirSync(dir, { recursive: true });
        const s = fs.statfsSync(dir);
        return s.bavail * s.bsize;
    } catch {
        return null;
    }
}

const elapsed = (ms) => (ms < 90_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`);

async function prepareKind({ kind, label, script, dir, spec, first, key, envName, limit, sizeOf }) {
    let status;
    try {
        status = await readStatus(script, dir);
    } catch (err) {
        printError(`${label}: could not read the models (${err.message})`);
        return;
    }
    if (spec.includes('all') && !status.available) printError(`${label}: ${envName}=all without the catalog (no network?): only the ones of the settings`);
    const wanted = expandWanted(spec, first, status.available, sizeOf);
    const plan = planModels(wanted, status, key);
    state[kind] = { wanted, first, ...plan, downloading: [], failed: [], installed: status.installed, available: status.available, dir };

    for (const name of plan.unknown) {
        const sameFamily = (status.available ?? []).filter(other => other.split(/[-_]/)[0] === name.split(/[-_]/)[0]).slice(0, 12);
        printError(`${label}: '${name}' (${envName} or a setting) does not exist${sameFamily.length ? `; close ones: ${sameFamily.join(', ')}` : ''}`);
    }
    const installed = status.installed ?? [];
    const readyText = installed.length > 8
        ? `${installed.length} (${humanSize(installed.reduce((n, item) => n + item.bytes, 0))})`
        : installed.map(item => `${item[key]} (${item.where === 'image' ? 'image' : 'cache'}, ${humanSize(item.bytes)})`).join(', ');
    const missingMb = plan.missing.reduce((n, name) => n + (sizeOf(name) ?? 0), 0);
    const missingText = plan.missing.length > 8 ? `${plan.missing.length} models (≈ ${humanSize(missingMb * 1024 * 1024)})` : plan.missing.join(', ');
    printInfo(`${label} ${spec.length ? `${envName}=${spec.join(',')}` : `the defaults (${envName}=all installs every one)`}: ready ${readyText || 'none'}${plan.missing.length ? `; downloading ${missingText} in the background` : ''}`);
    if (status.available) printInfo(`${label} available: ${availableLine(status, key, plan.missing, limit)}`);

    for (const name of plan.missing) await download(kind, name);
}

// One download at a time (the start and a changed setting share the queue): the same name is never downloaded twice
let queue = Promise.resolve();
const queued = new Set();

/**
 * Downloads one model (in the queue); the notice goes to your private chat when it is done (notify: a setting changed).
 * @returns {Promise<boolean>} true: ready
 */
function download(kind, name, { notify = false } = {}) {
    const k = KINDS[kind];
    const id = `${kind}:${name}`;
    if (queued.has(id)) return Promise.resolve(false);
    queued.add(id);
    const s = state[kind] ??= { wanted: [name], ready: [], missing: [], unknown: [], downloading: [], failed: [], installed: [], available: null, dir: k.dir };
    if (!s.wanted.includes(name)) s.wanted.push(name);
    s.failed = s.failed.filter(n => n !== name);
    const run = async () => {
        const size = k.sizeOf(name);
        const approx = size ? humanSize(size * 1024 * 1024) : null;
        // the disk first: the models never take the space of the database, the media and the backups
        const free = freeSpace(k.dir);
        if (free !== null && free < (size ?? 100) * 1024 * 1024 + DISK_MARGIN) {
            s.failed.push(name);
            queued.delete(id);
            printError(`${k.label}: ${name} not downloaded: ${humanSize(free)} free on the disk, it needs ≈ ${approx ?? '?'} and ${humanSize(DISK_MARGIN)} are kept free`);
            if (notify) notifySelf(t('models.failed', { kind: k.command, name, reason: t('models.noDisk', { free: humanSize(free) }) }));
            return false;
        }
        s.downloading = [name];
        printInfo(`${k.label}: downloading ${name}${approx ? ` (≈ ${approx})` : ''} to ${k.dir}...`);
        if (notify) notifySelf(t('models.downloading', { kind: k.command, name, size: approx ? ` (≈ ${approx})` : '' }));
        const start = Date.now();
        try {
            await captureOutput(BIN_PYTHON, [k.script, '--prefetch', k.flag, name, '--dir', k.dir], DOWNLOAD_TIMEOUT_MS);
            const after = await readStatus(k.script, k.dir).catch(() => null);
            const item = after?.installed?.find(entry => entry[k.key] === name);
            if (after) s.installed = after.installed;
            s.ready.push(name);
            s.missing = s.missing.filter(n => n !== name);
            printSuccess(`${k.label}: ${name} ready${item ? ` (${humanSize(item.bytes)})` : ''} in ${elapsed(Date.now() - start)}`);
            if (notify) notifySelf(t('models.ready', { kind: k.command, name, time: elapsed(Date.now() - start) }));
            return true;
        } catch (err) {
            const reason = String(err.message).split('\n').at(-1);
            s.failed.push(name);
            printError(`${k.label}: the download of ${name} failed: ${reason}`);
            if (notify) notifySelf(t('models.failed', { kind: k.command, name, reason }));
            return false;
        } finally {
            s.downloading = [];
            queued.delete(id);
        }
    };
    const result = queue.then(run);
    queue = result.catch(() => false);
    return result;
}

function notifySelf(text) {
    try {
        require('./client').messageToSelf(text)?.catch?.(() => {});
    } catch { /* WhatsApp not ready: the log has it */ }
}

/**
 * A setting changed to a model that is not here (stt.model, tts.voice.pt, tts.voice.en): downloaded at once, in the
 * background, with a notice; the /set answers right away.
 * @returns {Promise<string|null>} the name being downloaded, or null (already here, or not a model setting)
 */
async function onSettingChanged(key, value) {
    const kind = key === 'stt.model' ? 'stt' : /^tts\.voice\.(pt|en)$/.test(key) ? 'tts' : null;
    if (!kind || !value || process.env.ZAPBOT_MODELS_PREFETCH === 'false') return null;
    const k = KINDS[kind];
    const status = await readStatus(k.script, k.dir).catch(() => null);
    if (!status) return null;
    const plan = planModels([value], status, k.key);
    if (!plan.missing.length) return null;
    download(kind, value, { notify: true });
    return value;
}

// What is being downloaded now, of a kind (the /stt waits for it instead of downloading it twice)
const downloadingNow = (kind) => state[kind]?.downloading?.[0] ?? null;

/**
 * Lists the models, and downloads the wanted ones that are missing (in the background: never holds the start).
 * STT first (the bigger ones), then TTS.
 */
async function prepareModels() {
    const { getSetting } = require('./settings');
    // the ones the settings use go first: the first /stt or /tts does not wait for the rest
    const sttFirst = [getSetting('stt.model')].filter(Boolean);
    const ttsFirst = [getSetting('tts.voice.pt'), getSetting('tts.voice.en')].filter(Boolean);

    await prepareKind({ kind: 'stt', ...KINDS.stt, spec: parseList(process.env.STT_MODELS || DEFAULT_STT), first: sttFirst });
    await prepareKind({ kind: 'tts', ...KINDS.tts, spec: parseList(process.env.TTS_VOICES || DEFAULT_TTS), first: ttsFirst });
}

function startModels() {
    if (process.env.ZAPBOT_MODELS_PREFETCH === 'false') return;
    // after the start settles (WhatsApp and the web first); errors are only logged
    setTimeout(() => {
        require('./db').dbReady.then(prepareModels).catch(err => printError(`models: ${err.message}`));
    }, 5000).unref();
}

const modelsStatus = () => state;

module.exports = { STT_MODEL_NAMES, expandWanted, parseList, planModels, prepareModels, startModels, modelsStatus, availableLine, sttSize, download, onSettingChanged, downloadingNow };
