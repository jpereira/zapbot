#!/usr/bin/env bash
# Converte uma gravação (.mov do screencapture) em GIF.
# Uso: scripts/gif.sh <entrada.mov> [largura=720] [fps=12] [corte-esquerda=0]
#   corte-esquerda: % da largura cortada à esquerda (a lista de contatos), ex.: 33
set -euo pipefail

entrada="${1:-}"
largura="${2:-720}"
fps="${3:-12}"
corte="${4:-0}"

if [ -z "$entrada" ] || [ ! -f "$entrada" ]; then
    echo "uso: $0 <entrada.mov> [largura=720] [fps=12] [corte-esquerda=0]" >&2
    exit 1
fi
case "$corte" in
    '' | *[!0-9]*) echo "corte-esquerda deve ser um número de 0 a 90" >&2; exit 1 ;;
esac
if [ "$corte" -gt 90 ]; then
    echo "corte-esquerda deve ser um número de 0 a 90" >&2
    exit 1
fi
command -v ffmpeg > /dev/null || { echo "ffmpeg não encontrado" >&2; exit 1; }

saida="${entrada%.*}.gif"
paleta="$(mktemp -t paleta).png"
trap 'rm -f "$paleta"' EXIT

filtro="fps=$fps,scale=$largura:-1:flags=lanczos"
if [ "$corte" -gt 0 ]; then
    filtro="crop=iw*(100-$corte)/100:ih:iw*$corte/100:0,$filtro"
fi
ffmpeg -v error -y -i "$entrada" -vf "$filtro,palettegen=stats_mode=diff" "$paleta"
ffmpeg -v error -y -i "$entrada" -i "$paleta" \
    -lavfi "$filtro [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=5" "$saida"

echo "$saida ($(du -h "$saida" | cut -f1))"
