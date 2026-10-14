/*
 * URLs: extraction, validation and the /get anti-SSRF (public addresses only).
 */

const dns = require('dns').promises;
const net = require('net');
const http = require('http');
const https = require('https');
const axios = require('axios');

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
 * Anti-SSRF for /get: yt-dlp runs on the server's network, so a URL like
 * http://192.168.0.1/ or http://localhost:2375/ would reach the internal network.
 * We refuse hosts that resolve to private/loopback/link-local addresses.
 * (Does not cover redirects or DNS rebinding done later by yt-dlp.)
 */
const NETWORKS_BLOCKED = new net.BlockList();

for (const [network, prefix] of [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
    ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16],
    ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4]
]) {
    NETWORKS_BLOCKED.addSubnet(network, prefix, 'ipv4');
}

for (const [network, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]]) {
    NETWORKS_BLOCKED.addSubnet(network, prefix, 'ipv6');
}

function isAddressBlocked(address) {
    // ::ffff:10.0.0.1 (IPv4 mapped into IPv6) is checked as IPv4
    const v4 = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)?.[1];
    if (v4) return NETWORKS_BLOCKED.check(v4, 'ipv4');

    return NETWORKS_BLOCKED.check(address, net.isIPv6(address) ? 'ipv6' : 'ipv4');
}

// The host's public IPs, or [] if it does not resolve/is blocked (no exception for the caller)
async function addressesPublic(host) {
    const target = host.replace(/^\[|\]$/g, '');
    const addresses = net.isIP(target)
        ? [{ address: target }]
        : await dns.lookup(target, { all: true }).catch(() => []);

    return addresses.filter(e => !isAddressBlocked(e.address)).map(e => e.address);
}

async function isUrlPublic(str) {
    const host = new URL(str).hostname;
    const public = await addressesPublic(host);
    // A mixed DNS answer (one public IP, one private) is refused: the host
    // may rebind between the check and the real connection.
    const total = net.isIP(host.replace(/^\[|\]$/g, ''))
        ? 1
        : (await dns.lookup(host.replace(/^\[|\]$/g, ''), { all: true }).catch(() => [])).length;
    return public.length > 0 && public.length === total;
}

/*
 * GET that closes the isUrlPublic TOCTOU window: the connection is pinned to the
 * IP already verified — the host cannot swap to an internal address between
 * the check and the connect (DNS rebinding) — and each redirect is revalidated in the
 * same scheme before being followed. Only applies to the fetches made by the
 * Node itself; external processes (yt-dlp) need network isolation.
 */
async function httpGetSafe(urlInitial, { maxRedirects = 3, ...optionsAlt } = {}) {
    let url = urlInitial;

    for (let jump = 0; jump <= maxRedirects; jump++) {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            throw new Error(`protocolo não permitido: ${parsed.protocol}`);
        }

        const public = await addressesPublic(parsed.hostname);
        if (!public.length) throw new Error(`endereço não permitido: ${parsed.hostname}`);

        const ip = public[0];
        const familia = net.isIPv6(ip) ? 6 : 4;
        // fixed lookup: the socket connects to the verified IP, not to a new resolution
        const lookup = (_host, _opts, cb) => cb(null, ip, familia);
        const agent = parsed.protocol === 'https:'
            ? new https.Agent({ lookup })
            : new http.Agent({ lookup });

        const resp = await axios.get(url, {
            ...optionsAlt,
            maxRedirects: 0,
            httpAgent: agent,
            httpsAgent: agent,
            validateStatus: (s) => s >= 200 && s < 400
        });

        if (resp.status >= 300 && resp.status < 400 && resp.headers.location) {
            url = new URL(resp.headers.location, url).toString();
            continue;
        }
        return resp;
    }

    throw new Error('redirects demais');
}

module.exports = {
    addressesPublic,
    extractFirstUrl,
    httpGetSafe,
    isAddressBlocked,
    isUrlPublic,
    isValidHttpUrl
};
