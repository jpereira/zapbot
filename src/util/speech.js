/*
 * The reply of a command (/crypto, /weather...) as something to be SPOKEN: no emoji, no markdown, no links and
 * no symbols that the voice would read out ("asterisk", "dot").
 */

/**
 * @param {string} textAlt
 * @returns {string}
 */
function speakable(textAlt) {
    return String(textAlt ?? '')
        .replace(/```[\s\S]*?```/g, ' ')                          // code blocks
        .replace(/https?:\/\/\S+/gi, ' ')                          // links
        .replace(/\p{Extended_Pictographic}/gu, ' ')                // emoji
        .replace(/\u200d|\ufe0f|\u20e3/g, '')
        .replace(/[*_~`]+/g, '')                                  // markdown
        .replace(/[·•▪◦→←↑↓│┃─━╌═]+/g, ',')                       // separators
        .replace(/\s*\n+\s*/g, '. ')                              // a line is a sentence
        .replace(/\s+/g, ' ')
        .replace(/(?:\s*[.,]){2,}/g, '.')                         // ". ." and ", ." left by the cleaning
        .replace(/\s+([.,;:!?])/g, '$1')
        .replace(/^[\s.,]+|[\s,]+$/g, '')
        .trim();
}

module.exports = { speakable };
