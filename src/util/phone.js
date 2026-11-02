/*
 * Mask only in the presentation: recipients and stored data remain intact.
 */
function maskPhones(textAlt) {
    return String(textAlt).replace(
        /(^|[^\w])(\+?\d{10,15})(?!\d|@(?!c\.us\b))/g,
        (_, beforeAlt, phone) => {
            const numberAlt = phone.replace(/^\+/, '');
            return beforeAlt + (phone.startsWith('+') ? '+' : '') +
                numberAlt.slice(0, 5) + '****' + numberAlt.slice(-2);
        }
    );
}

function removeOptionMask(args) {
    return args.replace(/"[^"]*"|'[^']*'|\/(?:\\.|[^/\\])*\/|(^|\s)-(?:mask|m)(?=\s|$)/g,
        (snippet, separator) => separator === undefined ? snippet : separator).trim();
}

module.exports = { maskPhones, removeOptionMask };
