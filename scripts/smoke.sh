#!/usr/bin/env bash
#
# Checks that the bot came up after a deploy: the container is running, loaded the commands
# ("Loaded N callers") and, if there is time, connected to WhatsApp ("ready!").
#
# Usage: scripts/smoke.sh "<docker --context X>" <service> [seconds]
# failure (1): the container stopped, or the commands did not load in time
# warns (0): did not connect to WhatsApp in time (it may be waiting for the QR code), or there are [*] lines in the log
#
set -u

DOCKER=${1:?uso: smoke.sh "<docker --context X>" <serviço> [segundos]}
SERVICE=${2:?falta o serviço}
PRAZO=${3:-120}

inicio=$(date +%s)
carregou=0
conectou=0

while :; do
    # shellcheck disable=SC2086
    rodando=$($DOCKER inspect -f '{{.State.Running}}' "$SERVICE" 2>/dev/null)
    if [ "$rodando" != "true" ]; then
        echo "smoke: FALHOU, o container $SERVICE não está rodando" >&2
        $DOCKER logs --tail 20 "$SERVICE" 2>&1 | sed 's/^/  /' >&2
        exit 1
    fi

    # shellcheck disable=SC2086
    log=$($DOCKER logs --tail 400 "$SERVICE" 2>&1)
    echo "$log" | grep -Eq 'Loaded [0-9]+ callers' && carregou=1
    echo "$log" | grep -Eq 'ZapBot .* ready!' && conectou=1

    [ "$conectou" = 1 ] && break
    [ $(($(date +%s) - inicio)) -ge "$PRAZO" ] && break
    sleep 3
done

if [ "$carregou" != 1 ]; then
    echo "smoke: FALHOU, os comandos não carregaram em ${PRAZO}s" >&2
    echo "$log" | tail -20 | sed 's/^/  /' >&2
    exit 1
fi

n=$(echo "$log" | grep -Eo 'Loaded [0-9]+ callers' | tail -1 | grep -Eo '[0-9]+')
echo "smoke: ok, $n comandos carregados"

if [ "$conectou" != 1 ]; then
    echo "smoke: aviso, não vi o WhatsApp conectar em ${PRAZO}s (esperando o QR code?)" >&2
fi

erros=$(echo "$log" | grep -c '\[\*\]')
if [ "$erros" -gt 0 ]; then
    echo "smoke: aviso, $erros linha(s) [*] no log:" >&2
    echo "$log" | grep '\[\*\]' | tail -5 | cut -c1-200 | sed 's/^/  /' >&2
fi
exit 0
