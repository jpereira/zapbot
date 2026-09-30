/*
 * URLs: extração, validação e o anti-SSRF do /get (só endereços públicos).
 */

const dns = require('dns').promises;
const net = require('net');

function extractFirstUrl(text) {
    const m = String(text ?? '').match(/https?:\/\/[^\s"'<>]+/);
    return m ? m[0] : null;
}

function isValidHttpUrl(str) {
    try {
        const url = new URL(str);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

/*
 * Anti-SSRF do /get: o yt-dlp roda na rede do servidor, então uma URL como
 * http://192.168.0.1/ ou http://localhost:2375/ alcançaria a rede interna.
 * Recusamos hosts que resolvem para endereços privados/loopback/link-local.
 * (Não cobre redirects nem DNS rebinding feitos depois pelo yt-dlp.)
 */
const REDES_BLOQUEADAS = new net.BlockList();

for (const [rede, prefixo] of [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
    ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16],
    ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]
]) {
    REDES_BLOQUEADAS.addSubnet(rede, prefixo, 'ipv4');
}

for (const [rede, prefixo] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]]) {
    REDES_BLOQUEADAS.addSubnet(rede, prefixo, 'ipv6');
}

function isEnderecoBloqueado(address) {
    // ::ffff:10.0.0.1 (IPv4 mapeado em IPv6) é checado como IPv4
    const v4 = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
    if (v4) return REDES_BLOQUEADAS.check(v4, 'ipv4');

    return REDES_BLOQUEADAS.check(address, net.isIPv6(address) ? 'ipv6' : 'ipv4');
}

async function isUrlPublica(str) {
    const host = new URL(str).hostname.replace(/^\[|\]$/g, '');

    const enderecos = net.isIP(host)
        ? [{ address: host }]
        : await dns.lookup(host, { all: true }).catch(() => []);

    return enderecos.length > 0 && !enderecos.some(e => isEnderecoBloqueado(e.address));
}

module.exports = {
    extractFirstUrl,
    isUrlPublica,
    isValidHttpUrl
};
