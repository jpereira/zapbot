#!/bin/bash
#
# egress-firewall.sh — bloqueia o acesso do container à rede interna.
#
# Fecha o SSRF do /get de raiz: o isUrlPublica() (src/util/url.js) valida a URL
# no Node, mas o yt-dlp é um processo externo que resolve o DNS de novo e segue
# redirects por conta própria — um host com DNS rebinding ou um redirect 30x
# alcançaria a rede interna/metadata a partir da rede do servidor.
#
# O ZapBot só fala com serviços PÚBLICOS (WhatsApp, Binance, Open-Meteo, APIs
# DeFi...) e com o DNS. Então dropar todo egresso para faixas internas não
# afeta a operação normal e cobre qualquer processo filho (yt-dlp, ffmpeg,
# chromium), que o pin de IP do Node não alcança.
#
# Requer a capability NET_ADMIN (compose: cap_add: [NET_ADMIN]) e o iptables
# instalado na imagem. Sem uma das duas, apenas avisa e segue — o firewall é
# defesa em profundidade, não pode impedir o boot.
#
# Ativação: ZAPBOT_EGRESS_FIREWALL=1 no ambiente do serviço.

set -u

if [ "${ZAPBOT_EGRESS_FIREWALL:-0}" != "1" ]; then
    return 0 2>/dev/null || exit 0
fi

if ! command -v iptables >/dev/null 2>&1; then
    echo "⚠️  egress-firewall: iptables ausente na imagem; egresso NÃO filtrado" >&2
    return 0 2>/dev/null || exit 0
fi

# Sem NET_ADMIN o iptables falha; detecta cedo para não derrubar o boot
if ! iptables -L OUTPUT -n >/dev/null 2>&1; then
    echo "⚠️  egress-firewall: sem NET_ADMIN (cap_add); egresso NÃO filtrado" >&2
    return 0 2>/dev/null || exit 0
fi

# Faixas internas (RFC1918, loopback, link-local/metadata, CGNAT, multicast...)
INTERNAS_V4="
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
INTERNAS_V6="
::1/128
fc00::/7
fe80::/10
ff00::/8
"

echo "🔒 egress-firewall: bloqueando egresso para faixas internas"

# Permite respostas de conexões que o próprio container iniciou e o tráfego local
iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT 2>/dev/null || true
# O resolvedor embutido do Docker (127.0.0.11) — sem isto o DNS do container cai
iptables -A OUTPUT -d 127.0.0.11 -j ACCEPT 2>/dev/null || true

for rede in $INTERNAS_V4; do
    # Exceção: o gateway/DNS do Docker pode estar numa faixa interna. Se você usa
    # um resolvedor interno, libere-o explicitamente ANTES deste drop com:
    #   iptables -A OUTPUT -d <ip-do-dns> -p udp --dport 53 -j ACCEPT
    iptables -A OUTPUT -d "$rede" -j REJECT --reject-with icmp-admin-prohibited
done

if command -v ip6tables >/dev/null 2>&1 && ip6tables -L OUTPUT -n >/dev/null 2>&1; then
    for rede in $INTERNAS_V6; do
        ip6tables -A OUTPUT -d "$rede" -j REJECT 2>/dev/null || true
    done
fi

echo "🔒 egress-firewall: ativo"
