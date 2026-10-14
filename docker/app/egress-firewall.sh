#!/bin/bash
#
# egress-firewall.sh — blocks the container's access to the internal network.
#
# Closes the /get SSRF at the root: isUrlPublic() (src/util/url.js) validates the URL
# in Node, but yt-dlp is an external process that resolves DNS again and follows
# redirects on its own — a host with DNS rebinding or a 30x redirect
# would reach the internal/metadata network from the server network.
#
# ZapBot only talks to PUBLIC services (WhatsApp, Binance, Open-Meteo, APIs
# DeFi...) and with DNS. So dropping all egress to internal ranges does not
# affects normal operation and covers any child process (yt-dlp, ffmpeg,
# chromium), which Node's IP pin does not reach.
#
# Requer a capability NET_ADMIN (compose: cap_add: [NET_ADMIN]) e o iptables
# installed in the image. Without one of the two, it only warns and carries on — the firewall is
# defense in depth, it cannot prevent the boot.
#
# Activation: ZAPBOT_EGRESS_FIREWALL=1 in the service environment.

set -u

if [ "${ZAPBOT_EGRESS_FIREWALL:-0}" != "1" ]; then
    return 0 2>/dev/null || exit 0
fi

if ! command -v iptables >/dev/null 2>&1; then
    echo "⚠️  egress-firewall: iptables ausente na imagem; egresso NÃO filtrado" >&2
    return 0 2>/dev/null || exit 0
fi

# Without NET_ADMIN iptables fails; detects early so as not to bring down the boot
if ! iptables -L OUTPUT -n >/dev/null 2>&1; then
    echo "⚠️  egress-firewall: sem NET_ADMIN (cap_add); egresso NÃO filtrado" >&2
    return 0 2>/dev/null || exit 0
fi

# Faixas internas (RFC1918, loopback, link-local/metadata, CGNAT, multicast...)
INTERNAL_V4="
10.0.0.0/8
100.64.0.0/10
127.0.0.0/8
169.254.0.0/16
172.16.0.0/12
192.0.0.0/24
192.168.0.0/16
198.18.0.0/15
224.0.0.0/4
240.0.0.0/4
"
INTERNAL_V6="
::1/128
fc00::/7
fe80::/10
ff00::/8
"

echo "🔒 egress-firewall: bloqueando egresso para faixas internas"

# Allows replies to connections the container itself started and local traffic
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT 2>/dev/null || true
# Docker's embedded resolver (127.0.0.11) — without this the container DNS goes down
iptables -A OUTPUT -d 127.0.0.11 -j ACCEPT 2>/dev/null || true

for rede in $INTERNAL_V4; do
    # Exception: the Docker gateway/DNS may be in an internal range. If you use
    # an internal resolver, allow it explicitly BEFORE this drop with:
    # iptables -A OUTPUT -d <dns-ip> -p udp --dport 53 -j ACCEPT
    iptables -A OUTPUT -d "$rede" -j REJECT --reject-with icmp-admin-prohibited
done

if command -v ip6tables >/dev/null 2>&1 && ip6tables -L OUTPUT -n >/dev/null 2>&1; then
    for rede in $INTERNAL_V6; do
        ip6tables -A OUTPUT -d "$rede" -j REJECT 2>/dev/null || true
    done
fi

echo "🔒 egress-firewall: ativo"
