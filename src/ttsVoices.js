/*
 * The voices of /tts -voice: the Piper ones (local; Portuguese and English, from the rhasspy/piper-voices
 * catalog) and the OpenAI ones (-gpt). One that is not in the Docker image is downloaded the first time.
 */

const PIPER_VOICES_PT = [
    'pt_BR-cadu-medium',
    'pt_BR-edresson-low',
    'pt_BR-faber-medium',
    'pt_BR-jeff-medium',
    'pt_PT-tugão-medium'
];
const PIPER_VOICES_EN = [
    'en_US-amy-low',
    'en_US-amy-medium',
    'en_US-arctic-medium',
    'en_US-bryce-medium',
    'en_US-danny-low',
    'en_US-hfc_female-medium',
    'en_US-hfc_male-medium',
    'en_US-hifi_tts_92-medium',
    'en_US-joe-medium',
    'en_US-john-medium',
    'en_US-kathleen-low',
    'en_US-kathleen-medium',
    'en_US-kristin-medium',
    'en_US-kusal-medium',
    'en_US-l2arctic-medium',
    'en_US-lessac-high',
    'en_US-lessac-low',
    'en_US-lessac-medium',
    'en_US-libritts-high',
    'en_US-libritts_r-medium',
    'en_US-ljspeech-high',
    'en_US-ljspeech-medium',
    'en_US-mike-medium',
    'en_US-norman-medium',
    'en_US-reza_ibrahim-medium',
    'en_US-ryan-high',
    'en_US-ryan-low',
    'en_US-ryan-medium',
    'en_US-sam-medium',
    'en_GB-alan-low',
    'en_GB-alan-medium',
    'en_GB-alba-medium',
    'en_GB-aru-medium',
    'en_GB-cori-high',
    'en_GB-cori-medium',
    'en_GB-jenny_dioco-medium',
    'en_GB-northern_english_male-medium',
    'en_GB-semaine-medium',
    'en_GB-southern_english_female-low',
    'en_GB-vctk-medium'
];
const PIPER_VOICES = [...PIPER_VOICES_PT, ...PIPER_VOICES_EN];

// "pt_PT-tugão-medium" → { id, region: 'pt_PT', name: 'tugão', quality: 'medium' }
function parsePiperVoice(id) {
    const [, region, name, quality] = id.match(/^([a-z]{2}_[A-Z]{2})-(.+)-([a-z]+)$/);
    return { id, region, name, quality };
}

const PIPER_CATALOG = PIPER_VOICES.map(parsePiperVoice);
const QUALITY_ORDER = ['medium', 'high', 'low'];   // which one answers to just the name (-v faber)

// Lower case and no accent: tugão = Tugao = TUGÃO
const plain = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * The voice id for what was typed: the full id (pt_PT-tugão-medium), the name with the quality (tugão-medium)
 * or just the name (tugão: the medium one, else high, else low). Case and accents do not matter.
 * @returns {string|null}
 */
function resolvePiperVoice(typed) {
    const want = plain(String(typed).trim());
    const byId = PIPER_CATALOG.find(v => plain(v.id) === want);
    if (byId) return byId.id;
    const byNameQuality = PIPER_CATALOG.find(v => plain(`${v.name}-${v.quality}`) === want);
    if (byNameQuality) return byNameQuality.id;
    const named = PIPER_CATALOG.filter(v => plain(v.name) === want);
    named.sort((a, b) => QUALITY_ORDER.indexOf(a.quality) - QUALITY_ORDER.indexOf(b.quality));
    return named[0]?.id ?? null;
}

/**
 * The voices of a region grouped by name, in order: [{ name, qualities: ['low', 'medium'], ids: [...] }]
 * @param {string} region  'pt_BR', 'pt_PT', 'en_US' or 'en_GB'
 */
function piperVoicesByName(region) {
    const order = ['low', 'medium', 'high'];
    const groups = new Map();
    for (const v of PIPER_CATALOG.filter(x => x.region === region)) {
        const g = groups.get(v.name) ?? { name: v.name, voices: [] };
        g.voices.push(v);
        groups.set(v.name, g);
    }
    return [...groups.values()].map(({ name, voices }) => {
        voices.sort((a, b) => order.indexOf(a.quality) - order.indexOf(b.quality));
        return { name, qualities: voices.map(v => v.quality), ids: voices.map(v => v.id) };
    });
}

module.exports = { PIPER_REGIONS: ['pt_BR', 'pt_PT', 'en_US', 'en_GB'], PIPER_VOICES, PIPER_VOICES_EN, PIPER_VOICES_PT, piperVoicesByName, resolvePiperVoice };
