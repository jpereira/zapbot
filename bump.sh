#!/usr/bin/env bash
#
# bump.sh - Generates a new ZapBot release
#
# 1. Increments the last vX.Y.Z tag (e.g.: v1.5.0 -> v1.6.0)
# 2. Swaps the old version for the new one in the repository files
# 3. Commits and applies the tag on the current branch with the message "Bump to X.Y"
#
# Uso: ./bump.sh [-n|--dry-run]
# -n, --dry-run   only shows what would change (changes nothing)
#
# The push is up to you: git push && git push origin vX.Y.Z
#

set -euo pipefail

cd "$(dirname "$0")"

DRY_RUN=0
case "${1:-}" in
    -n|--dry-run) DRY_RUN=1 ;;
    "") ;;
    *) echo "Uso: $0 [-n|--dry-run]" >&2; exit 1 ;;
esac

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

new_version="${BASH_REMATCH[1]}.$((BASH_REMATCH[2] + 1))"
new_tag="release-${new_version}"

if git rev-parse -q --verify "refs/tags/${new_tag}" >/dev/null; then
    echo "❌ A tag '$new_tag' já existe." >&2
    exit 1
fi

echo "🔖 ${last_tag} -> ${new_tag}"

# "1.5" on its own (does not match 11.5, 1.5.2, 1.50...); the "v" of "v1.5" still matches
current_re="${version_current//./\\.}"
padrao="(^|[^0-9.])${current_re}([^0-9.]|$)"

# package.json/package-lock.json: only the project's own version (the dependencies
# also have "1.5" and cannot be touched). The binaries and the patches are left out.
arquivos=()
while IFS= read -r arq; do
    arquivos+=("$arq")
done < <(git grep -lIE "$padrao" -- . ':!package.json' ':!package-lock.json' ':!patches/' ':!bump.sh' || true)

if [ "$DRY_RUN" -eq 1 ]; then
    echo "📝 Seriam alterados:"
    echo "   package.json, package-lock.json (versão do projeto)"
    for arq in "${arquivos[@]}"; do
        git grep -nIE "$padrao" -- "$arq" | sed 's/^/   /'
    done
    exit 0
fi

for arq in "${arquivos[@]}"; do
    # Repeats to catch neighboring occurrences (one's separator is consumed by the other)
    perl -pi -e "1 while s/(^|[^0-9.])${current_re}([^0-9.]|\$)/\${1}${new_version}\${2}/" "$arq"
done

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

echo "✅ Commit e tag '${new_tag}' criados em '$(git branch --show-current)'."
echo "💡 Para publicar: git push && git push origin ${new_tag}"
