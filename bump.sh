#!/usr/bin/env bash
#
# bump.sh - Opens and closes ZapBot versions
#
# The bump opens the version (it is its first commit) and the tag closes it (on the last):
#
# v2.1.0 ── Bump to 2.2.0 ── ...2.2 commits... ── Release 2.2.0 (tag v2.2.0)
#
# ./bump.sh [X.Y]: opens the next version (the current one must already have the tag)
# 1. The new one is X.(Y+1) of the current one (package.json's) or the given one (e.g.:
# ./bump.sh 3.0, to leave 2.x), greater than the current one
# 2. Swaps the current version for the new one in package.json, README.md and docs/:
# "ZapBot 2.2.0", the examples "git+<commit>/v2.2.0"... Only in those: in the code
# and in the tests, "2.0" may be something else (the NVD API, Solana's JSON-RPC).
# The stable version stays as it is ("hoje a v2.1.0", "git checkout
# v2.1.0"), which only changes on -r, and the lines that cite bump.sh itself
# 3. Commits with the message "Bump to X.Y" (no tag)
#
# ./bump.sh -r: closes the current version (package.json's) as a release
# 1. Swaps the stable version (the vX.Y.Z without "/" before: "hoje a v2.1.0",
# "git checkout v2.1.0") with the current one, with today's date beside it in
# "vX.Y.Z (from DD/MM/YYYY)"
# 2. Commits with the message "Release X.Y" and creates the annotated tag vX.Y.Z on it
# 3. Writes the refs to .git/packed-refs (git pack-refs --all), for the image
# Docker knows the tag commit without the git objects (src/version.js)
#
# Uso: ./bump.sh [-n|--dry-run] [X.Y]
#      ./bump.sh [-n|--dry-run] -r|--release
# -n, --dry-run   only shows what would change (changes nothing)
# -r, --release   closes the current version: commit "Release X.Y" + tag vX.Y.Z
# X.Y             the version to open (greater than the current one); without it, X.(Y+1)
#
# The push is up to you: git push (and, with -r, git push origin vX.Y.Z)
#

set -euo pipefail

cd "$(dirname "$0")"

uso() {
    echo "Uso: $0 [-n|--dry-run] [X.Y]  ou  $0 [-n|--dry-run] -r|--release" >&2
    exit 1
}

DRY_RUN=0
RELEASE=0
version_requested=""
for arg in "$@"; do
    case "$arg" in
        -n|--dry-run) DRY_RUN=1 ;;
        -r|--release) RELEASE=1 ;;
        -h|--help) uso ;;
        -*) echo "❌ Opção desconhecida: $arg" >&2; uso ;;
        *)
            [ -z "$version_requested" ] || { echo "❌ Informe uma versão só." >&2; uso; }
            version_requested="$arg"
            ;;
    esac
done

if [ "$RELEASE" -eq 1 ] && [ -n "$version_requested" ]; then
    echo "❌ O -r fecha a versão do package.json: não informe a versão." >&2
    uso
fi

if [ -n "$version_requested" ] && ! [[ "$version_requested" =~ ^[0-9]+\.[0-9]+$ ]]; then
    echo "❌ Versão '$version_requested' fora do formato X.Y (ex.: 2.0)." >&2
    exit 1
fi

if [ "$DRY_RUN" -eq 0 ] && [ -n "$(git status --porcelain)" ]; then
    echo "❌ Há alterações não commitadas. Commite ou descarte antes do bump." >&2
    exit 1
fi

version_current="$(node -p 'require("./package.json").version')"
if ! [[ "$version_current" =~ ^([0-9]+)\.([0-9]+)$ ]]; then
    echo "❌ Versão '$version_current' do package.json fora do formato X.Y." >&2
    exit 1
fi
proxima="${BASH_REMATCH[1]}.$((BASH_REMATCH[2] + 1))"

last_tag="$(git tag --list 'v*' --sort=-v:refname | head -n1)"
if [ -z "$last_tag" ]; then
    echo "❌ Nenhuma tag vX.Y.Z encontrada." >&2
    exit 1
fi

has_tag() { git rev-parse -q --verify "refs/tags/v$1" >/dev/null; }

# a > b, comparing X and Y as numbers (1.10 > 1.9)
maior() { [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -t. -k1,1n -k2,2n | tail -n1)" = "$1" ]; }

# Only the README and docs/ (except requirements.txt, which has the MkDocs versions).
# package.json/package-lock.json go separately: only the project's own version (the
# dependencies also have "1.5" and cannot be touched).
ONDE=(README.md docs ':!docs/requirements.txt')
hoje="$(date +%d/%m/%Y)"

# The README/docs files with the regex (empty if none)
files_with() { git grep -lIE "$1" -- "${ONDE[@]}" || true; }

# Applies the perl code (a substitution) to the files with the regex; in dry-run,
# only shows the lines that would change, already swapped. The lines that cite
# bump.sh (its examples) stay as they are.
trocar() {
    local regex=$1 codigo="next if /bump\\.sh/; $2"
    while IFS= read -r arq; do
        [ -n "$arq" ] || continue
        if [ "$DRY_RUN" -eq 1 ]; then
            perl -ne "my \$o = \$_; { $codigo } print \"   \$ARGV:\$.: \$_\" if \$_ ne \$o;" "$arq"
        else
            perl -pi -e "$codigo" "$arq"
        fi
    done < <(files_with "$regex")
}

if [ "$RELEASE" -eq 1 ]; then
    # Closes the package.json version
    if has_tag "$version_current"; then
        echo "❌ A release-${version_current} já existe. Abra a próxima com $0." >&2
        exit 1
    fi
    if ! maior "$version_current" "${last_tag#release-}"; then
        echo "❌ A versão ${version_current} não é maior que a última release (${last_tag})." >&2
        exit 1
    fi

    new_tag="release-${version_current}"
    echo "🔖 ${last_tag} -> ${new_tag} (versão estável)"

    # The stable version: "vX.Y.Z" without "/" before (the "git+<commit>/vX.Y.Z"
    # of the examples is the bot version, which changes on the bump)
    est_re="${last_tag//./\\.}"
    padrao="(^|[^/])${est_re}([^0-9.]|$)"

    [ "$DRY_RUN" -eq 1 ] && echo "📝 Seriam alterados (commit \"Release ${version_current}\" + tag ${new_tag}):"

    # And today's date beside it: "vX.Y.Z (from DD/MM/YYYY)" (the version may be between backticks)
    new_re="release-${version_current//./\\.}"
    trocar "$padrao" "1 while s#(^|[^/])${est_re}([^0-9.]|\$)#\${1}${new_tag}\${2}#;
        s|(${new_re}\`? \\(de )\\d{2}/\\d{2}/\\d{4}|\${1}${hoje}|g;"
    [ "$DRY_RUN" -eq 1 ] && exit 0

    git --no-pager diff --stat
    git commit -qam "Release ${version_current}"
    git tag -a "$new_tag" -m "Release ${version_current}"

    # Writes the tags to .git/packed-refs with each one's commit: the Docker image does not
    # carries the git objects, and that is how /version shows "(git+<commit>/<tag>)"
    git pack-refs --all
    exit 0
fi

# Opens the next version
if ! has_tag "$version_current"; then
    echo "❌ A ${version_current} ainda não foi fechada: rode $0 -r antes de abrir a próxima." >&2
    exit 1
fi

new_version="${version_requested:-$proxima}"
if ! maior "$new_version" "$version_current"; then
    echo "❌ A versão ${new_version} não é maior que a atual (${version_current})." >&2
    exit 1
fi

echo "🚀 ${version_current} -> ${new_version} (em desenvolvimento)"

# "1.5" on its own (does not match 11.5, 1.5.2, 1.50...); the "v" of "v1.5" still matches
current_re="${version_current//./\\.}"
padrao="(^|[^0-9.])${current_re}([^0-9.]|$)"

if [ "$DRY_RUN" -eq 1 ]; then
    echo "📝 Seriam alterados (commit \"Bump to ${new_version}\"; a versão estável continua release-${version_current}):"
    echo "   package.json, package-lock.json (versão do projeto)"
fi

# The stable version (vX.Y.Z without "/" before) is kept and comes back as it was;
# the rest swaps, repeating to catch neighboring occurrences (one's separator
# is consumed by the other)
trocar "$padrao" "s#(^|[^/])release-${current_re}(?=[^0-9.]|\$)#\${1}\\x00ESTAVEL\\x00#g;
    1 while s/(^|[^0-9.])${current_re}([^0-9.]|\$)/\${1}${new_version}\${2}/;
    s#\\x00ESTAVEL\\x00#release-${version_current}#g;"
[ "$DRY_RUN" -eq 1 ] && exit 0

node -e '
    const fs = require("fs");
    const versao = process.argv[1];

    for (const arq of ["package.json", "package-lock.json"]) {
        if (!fs.existsSync(arq)) continue;
        const json = JSON.parse(fs.readFileSync(arq, "utf8"));
        json.version = versao;
        if (json.packages?.[""]) json.packages[""].version = versao;
        fs.writeFileSync(arq, JSON.stringify(json, null, 2) + "\n");
    }
' "$new_version"

git --no-pager diff --stat
git commit -qam "Bump to ${new_version}"
