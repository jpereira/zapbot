// WhatsApp may expose an embedded JPEG preview as the body when the actual media is unavailable.
function isJpegPreview(value) {
    const text = String(value ?? '').trim();
    return text.length >= 24 && /^\/9j\/[A-Za-z0-9+/]+={0,2}$/.test(text);
}

function visibleBody(value) {
    return isJpegPreview(value) ? '' : String(value ?? '');
}

module.exports = { isJpegPreview, visibleBody };
