// WhatsApp may expose an embedded JPEG preview as the body when the actual media is unavailable.
function isJpegPreview(value) {
    const text = String(value ?? '').trim();
    return text.length >= 24 && /^\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(text);
}

function visibleBody(value) {
    return isJpegPreview(value) ? '' : String(value ?? '');
}

// Invisible characters WhatsApp may put in the text: "/Name/" may come with a WORD JOINER (U+2060) right after the
// "/", and a name pasted from elsewhere may carry a zero-width space, a direction mark or a BOM. They break command
// words and name lookups, and nobody sees them. The direction overrides (U+202A-202E, U+2066-2069) are not here: they
// are deliberate, and /profile -set refuses them. The ZWJ (U+200D) stays too: it joins emojis such as 🏃🏽‍♂️.
const INVISIBLE = /[\u00AD\u180E\u200B\u200C\u200E\u200F\u2060-\u2064\uFEFF]/g;
const withoutInvisible = (value) => String(value ?? '').replace(INVISIBLE, '');

module.exports = { isJpegPreview, visibleBody, withoutInvisible };
