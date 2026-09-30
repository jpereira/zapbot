/*
 * URLs: extraction, validation and the /get anti-SSRF (public addresses only).
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

async function isUrlPublic(str) {
    const host = new URL(str).hostname.replace(/^\[|\]$/g, '');

    const addresses = net.isIP(host)
        ? [{ address: host }]
        : await dns.lookup(host, { all: true }).catch(() => []);

    return addresses.length > 0 && !addresses.some(e => isAddressBlocked(e.address));
}

module.exports = {
    extractFirstUrl,
    isUrlPublic,
    isValidHttpUrl
};
