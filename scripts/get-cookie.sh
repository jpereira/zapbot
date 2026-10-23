#!/bin/bash
#
# Exporta do navegador os cookies de alguns sites, no formato Netscape, para o yt-dlp
# (/get e /sticker, por exemplo o conteúdo sensível do x.com).
#
# Uso: ./scripts/get-cookie.sh [-o arquivo] [-b navegador] dominio [dominio...]
# Ex.: ./scripts/get-cookie.sh x.com twitter.com
#
# O arquivo dá acesso à conta: fica com chmod 600, fora do git, e deve ser apagado
# depois de enviado ao servidor.
#
set -euo pipefail
umask 077

SAIDA=cookies.txt
NAVEGADOR=chrome

while getopts "o:b:" opcao; do
    case $opcao in
        o) SAIDA=$OPTARG ;;
        b) NAVEGADOR=$OPTARG ;;
        *) exit 2 ;;
    esac
done
shift $((OPTIND - 1))

[ $# -ge 1 ] || { echo "Uso: $0 [-o arquivo] [-b navegador] dominio [dominio...]" >&2; exit 2; }
command -v yt-dlp >/dev/null || { echo "yt-dlp não encontrado" >&2; exit 1; }

# O yt-dlp lê o arquivo do --cookies antes de gravar: ele não pode existir (nem vazio)
DIR=$(mktemp -d)
trap 'rm -rf "$DIR"' EXIT
TMP=$DIR/jar.txt

# O yt-dlp grava o cookie jar no fim, mesmo sem baixar nada (o erro do download é esperado)
yt-dlp -q --cookies-from-browser "$NAVEGADOR" --cookies "$TMP" --skip-download "https://$1" >/dev/null 2>&1 || true
[ -s "$TMP" ] || { echo "Não consegui ler os cookies do $NAVEGADOR (feche-o e tente de novo)" >&2; exit 1; }

echo "# Netscape HTTP Cookie File" > "$SAIDA"
for dominio in "$@"; do
    esc=${dominio//./\\.}
    grep -E "^(#HttpOnly_)?\.?([^[:space:]]*\.)?${esc}[[:space:]]" "$TMP" >> "$SAIDA" || true
done
chmod 600 "$SAIDA"

echo "$(grep -c -v '^#' "$SAIDA" || true) cookies em $SAIDA"
grep -q -E 'auth_token|ct0' "$SAIDA" || echo "⚠️  sem auth_token/ct0: faça login no $NAVEGADOR" >&2
