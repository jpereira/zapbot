#!/bin/bash
#
# Exports the cookies of some sites from the browser, in Netscape format, for yt-dlp
# (/get and /sticker, for example the sensitive content of x.com).
#
# Uso: ./scripts/get-cookie.sh [-o arquivo] [-b navegador] dominio [dominio...]
# E.g.: ./scripts/get-cookie.sh x.com twitter.com instagram.com youtube.com facebook.com
#
# The file gives access to the account: it gets chmod 600, stays out of git, and must be deleted
# after being sent to the server.
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

# yt-dlp reads the --cookies file before writing: it must not exist (not even empty)
DIR=$(mktemp -d)
trap 'rm -rf "$DIR"' EXIT
TMP=$DIR/jar.txt

# yt-dlp writes the cookie jar at the end, even without downloading anything (the download error is expected)
yt-dlp -q --cookies-from-browser "$NAVEGADOR" --cookies "$TMP" --skip-download "https://$1" >/dev/null 2>&1 || true
[ -s "$TMP" ] || { echo "Não consegui ler os cookies do $NAVEGADOR (feche-o e tente de novo)" >&2; exit 1; }

# The cookie that only exists with the account logged in, per site (empty: the site has no check)
cookie_login() {
    case $1 in
        x.com|twitter.com) echo auth_token ;;
        facebook.com) echo c_user ;;
        instagram.com) echo sessionid ;;
        youtube.com) echo LOGIN_INFO ;;
        *) echo '' ;;
    esac
}

echo "# Netscape HTTP Cookie File" > "$SAIDA"
semLogin=0
for dominio in "$@"; do
    esc=${dominio//./\\.}
    linhas=$(grep -E "^(#HttpOnly_)?\.?([^[:space:]]*\.)?${esc}[[:space:]]" "$TMP" || true)
    [ -n "$linhas" ] && printf '%s\n' "$linhas" >> "$SAIDA"
    total=$(printf '%s' "$linhas" | grep -c . || true)
    nome=$(cookie_login "$dominio")
    if [ "$total" -eq 0 ]; then
        echo "⚠️  $dominio: nenhum cookie (abra o site no $NAVEGADOR e faça login)" >&2; semLogin=1
    elif [ -n "$nome" ] && ! printf '%s\n' "$linhas" | grep -q -E "[[:space:]]${nome}[[:space:]]"; then
        echo "⚠️  $dominio: $total cookies, mas sem $nome (a conta não está logada no $NAVEGADOR)" >&2; semLogin=1
    else
        echo "✅ $dominio: $total cookies${nome:+ (logado)}"
    fi
done
chmod 600 "$SAIDA"

echo "$(grep -c -v '^#' "$SAIDA" || true) cookies em $SAIDA"
[ "$semLogin" -eq 0 ] || echo "⚠️  Faça login nos sites acima no $NAVEGADOR e rode de novo" >&2
