#!/usr/bin/env node
/*
 * The icons of the installable web page (src/web/public/icon-192.png, icon-512.png and icon.svg): a white chat bubble
 * with a green "Z" on the WhatsApp green. Drawn pixel by pixel (no image library), 4x4 samples per pixel.
 *
 *   node scripts/web-icons.js
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const OUT = path.join(__dirname, '..', 'src', 'web', 'public');
const GREEN = [0, 168, 132];
const WHITE = [255, 255, 255];

// The shapes in a 0..1 square
const inRounded = (x, y, r = 0.22) => {
    const dx = Math.max(r - x, 0, x - (1 - r));
    const dy = Math.max(r - y, 0, y - (1 - r));
    return dx * dx + dy * dy <= r * r;
};
const TAIL = [[0.27, 0.6], [0.46, 0.68], [0.22, 0.84]];
const inTriangle = (x, y, [a, b, c]) => {
    const side = (p, q) => (x - q[0]) * (p[1] - q[1]) - (p[0] - q[0]) * (y - q[1]);
    const [d1, d2, d3] = [side(a, b), side(b, c), side(c, a)];
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};
// The bubble, with its tail down on the left
const inBubble = (x, y) => ((x - 0.5) / 0.33) ** 2 + ((y - 0.47) / 0.29) ** 2 <= 1 || inTriangle(x, y, TAIL);
const segment = (x, y, [ax, ay], [bx, by], w) => {
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
    return Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))) <= w;
};
const Z = [[[0.38, 0.36], [0.62, 0.36]], [[0.62, 0.36], [0.38, 0.58]], [[0.38, 0.58], [0.62, 0.58]]];
const inZ = (x, y) => Z.some(([a, b]) => segment(x, y, a, b, 0.045));

function color(x, y) {
    if (!inRounded(x, y)) return null;
    if (inBubble(x, y)) return inZ(x, y) ? GREEN : WHITE;
    return GREEN;
}

function png(size) {
    const S = 4;
    const raw = Buffer.alloc(size * (size * 4 + 1));
    for (let py = 0; py < size; py++) {
        raw[py * (size * 4 + 1)] = 0;
        for (let px = 0; px < size; px++) {
            const sum = [0, 0, 0, 0];
            for (let sy = 0; sy < S; sy++) {
                for (let sx = 0; sx < S; sx++) {
                    const c = color((px + (sx + 0.5) / S) / size, (py + (sy + 0.5) / S) / size);
                    if (!c) continue;
                    sum[0] += c[0]; sum[1] += c[1]; sum[2] += c[2]; sum[3] += 255;
                }
            }
            const n = sum[3] / 255;
            const at = py * (size * 4 + 1) + 1 + px * 4;
            raw.set(n ? [sum[0] / n, sum[1] / n, sum[2] / n, sum[3] / (S * S)].map(Math.round) : [0, 0, 0, 0], at);
        }
    }
    const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
    const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const chunk = (type, data) => {
        const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
        const body = Buffer.concat([Buffer.from(type), data]);
        const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
        return Buffer.concat([len, body, sum]);
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(size, 0);
    header.writeUInt32BE(size, 4);
    header.set([8, 6, 0, 0, 0], 8); // 8 bits, RGBA
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<rect width="100" height="100" rx="22" fill="#00a884"/>
<ellipse cx="50" cy="47" rx="33" ry="29" fill="#fff"/>
<path d="M27 60 L46 68 L22 84 Z" fill="#fff"/>
<path d="M38 36 H62 L38 58 H62" fill="none" stroke="#00a884" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

for (const size of [192, 512]) fs.writeFileSync(path.join(OUT, `icon-${size}.png`), png(size));
fs.writeFileSync(path.join(OUT, 'icon.svg'), svg);
console.log('icons written to', OUT);
