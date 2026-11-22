/*
 * The quality and the size of the image of /draw and /gpt -img (gpt.image.quality and gpt.image.size).
 * "auto" sends nothing: OpenAI picks. The size takes a name (square, landscape, portrait) or WxH.
 */

const { t } = require('./i18n');

const QUALITIES = ['auto', 'low', 'medium', 'high'];
const SIZE_NAMES = { square: '1024x1024', landscape: '1536x1024', portrait: '1024x1536' };

/** @returns {string} low | medium | high | auto; throws if it is another word */
function parseQuality(value) {
    const quality = String(value ?? '').trim().toLowerCase();
    if (!QUALITIES.includes(quality)) throw new Error(t('draw.badQuality', { value: String(value ?? ''), list: QUALITIES.join(', ') }));
    return quality;
}

/** @returns {string} auto or WxH (the names square, landscape and portrait become 1024x1024, 1536x1024 and 1024x1536) */
function parseSize(value) {
    const size = String(value ?? '').trim().toLowerCase().replace(/[×*]/g, 'x');
    if (size === 'auto') return size;
    if (SIZE_NAMES[size]) return SIZE_NAMES[size];
    if (/^\d{3,4}x\d{3,4}$/.test(size)) return size;
    throw new Error(t('draw.badSize', { value: String(value ?? ''), list: `auto, ${Object.keys(SIZE_NAMES).join(', ')}, 1024x1024...` }));
}

module.exports = { QUALITIES, SIZE_NAMES, parseQuality, parseSize };
