#!/usr/bin/env bash
#
# bump.sh - Generates a new ZapBot release
#
# 1. Increments the last vX.Y.Z tag (e.g.: v1.5.0 -> v1.6.0) or
# uses the given version (e.g.: ./bump.sh 2.0, to leave 1.x)
# 2. Swaps the old version for the new one in README.md and docs/ (and the date beside
# its, in "vX.Y.Z (from DD/MM/YYYY)", by today's). Only in those: in the code
# and in the tests, "2.0" may be something else (the NVD API, Solana's JSON-RPC).
# The lines that cite bump.sh itself (its examples) stay as they are
# 3. Commits and applies the tag on the current branch with the message "Bump to X.Y"
# 4. Writes the refs to .git/packed-refs (git pack-refs --all), for the image
# Docker knows the tag commit without the git objects (src/version.js)
#
# Uso: ./bump.sh [-n|--dry-run] [X.Y]
# -n, --dry-run   only shows what would change (changes nothing)
# X.Y             the new version (greater than the current one); without it, X.(Y+1)
#
# The push is up to you: git push && git push origin vX.Y.Z
#

set -euo pipefail

cd "$(dirname "$0")"

uso() {
    echo "Uso: $0 [-n|--dry-run] [X.Y]" >&2
    exit 1
}

DRY_RUN=0
version_requested=""
for arg in "$@"; do
    case "$arg" in
        -n|--dry-run) DRY_RUN=1 ;;
        -h|--help) uso ;;
        -*) echo "❌ Opção desconhecida: $arg" >&2; uso ;;
        *)
            [ -z "$version_requested" ] || { echo "❌ Informe uma versão só." >&2; uso; }
            version_requested="$arg"
            ;;
    esac
done

if [ -n "$version_requested" ] && ! [[ "$version_requested" =~ ^[0-9]+\.[0-9]+$ ]]; then
    echo "❌ Versão '$version_requested' fora do formato X.Y (ex.: 2.0)." >&2
    exit 1
fi

if [ "$DRY_RUN" -eq 0 ] && [ -n "$(git status --porcelain)" ]; then
    echo "❌ Há alterações não commitadas. Commite ou descarte antes do bump." >&2
    exit 1
fi

last_tag="$(git tag --list 'v*' --sort=-v:refname | head -n1)"

if [ -z "$last_tag" ]; then
    echo "❌ Nenhuma tag vX.Y.Z encontrada." >&2
    exit 1
fi

version_current="${last_tag#release-}"

if ! [[ "$version_current" =~ ^([0-9]+)\.([0-9]+)$ ]]; then
    echo "❌ Tag '$last_tag' fora do formato release-X.Y." >&2
    exit 1
fi

new_version="${version_requested:-${BASH_REMATCH[1]}.$((BASH_REMATCH[2] + 1))}"
new_tag="release-${new_version}"

# The given version must be greater than the current one (comparing X and Y as numbers: 1.10 > 1.9)
if [ "$(printf '%s\n%s\n' "$version_current" "$new_version" | sort -t. -k1,1n -k2,2n | tail -n1)" != "$new_version" ] \
    || [ "$new_version" = "$version_current" ]; then
    echo "❌ A versão ${new_version} não é maior que a atual (${version_current})." >&2
    exit 1
fi

if git rev-parse -q --verify "refs/tags/${new_tag}" >/dev/null; then
    echo "❌ A tag '$new_tag' já existe." >&2
    exit 1
fi

echo "🔖 ${last_tag} -> ${new_tag}"

# "1.5" on its own (does not match 11.5, 1.5.2, 1.50...); the "v" of "v1.5" still matches
current_re="${version_current//./\\.}"
padrao="(^|[^0-9.])${current_re}([^0-9.]|$)"

# Only the README and docs/ (except requirements.txt, which has the MkDocs versions).
# package.json/package-lock.json go separately: only the project's own version (the
# dependencies also have "1.5" and cannot be touched).
ONDE=(README.md docs ':!docs/requirements.txt')
arquivos=()
while IFS= read -r arq; do
    arquivos+=("$arq")
done < <(git grep -lIE "$padrao" -- "${ONDE[@]}" || true)

if [ "$DRY_RUN" -eq 1 ]; then
    echo "📝 Seriam alterados:"
    echo "   package.json, package-lock.json (versão do projeto)"
    for arq in "${arquivos[@]}"; do
        git grep -nIE "$padrao" -- "$arq" | grep -v 'bump\.sh' | sed 's/^/   /'
    done
    exit 0
fi

for arq in "${arquivos[@]}"; do
    # Repeats to catch neighboring occurrences (one's separator is consumed by the other)
    perl -pi -e "next if /bump\\.sh/; 1 while s/(^|[^0-9.])${current_re}([^0-9.]|\$)/\${1}${new_version}\${2}/" "$arq"
done

# The release date beside the version: "vX.Y.Z (from DD/MM/YYYY)" (the version may be between backticks)
hoje="$(date +%d/%m/%Y)"
new_re="${new_version//./\\.}"
while IFS= read -r arq; do
    perl -pi -e "s|(release-${new_re}\`? \\(de )\\d{2}/\\d{2}/\\d{4}|\${1}${hoje}|g" "$arq"
done < <(git grep -lIE "release-${new_re}\`? \\(de [0-9]{2}/" -- "${ONDE[@]}" || true)

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
git tag -a "$new_tag" -m "Bump to ${new_version}"

# Writes the tags to .git/packed-refs with each one's commit: the Docker image does not
# carries the git objects, and that is how /version shows "(git+<commit>/<tag>)"
git pack-refs --all

echo "✅ Commit e tag '${new_tag}' criados em '$(git branch --show-current)'."
echo "💡 Para publicar: git push && git push origin ${new_tag}"
