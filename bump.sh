#!/usr/bin/env bash
#
# bump.sh - Gera uma nova release do ZapBot
#
#   1. Incrementa a última tag release-X.Y (ex.: release-1.5 -> release-1.6)
#   2. Troca a versão antiga pela nova nos arquivos do repositório (e a data ao
#      lado dela, em "release-X.Y (de DD/MM/AAAA)", pela de hoje)
#   3. Commita e aplica a tag no branch atual com a mensagem "Bump para X.Y"
#
# Uso: ./bump.sh [-n|--dry-run]
#   -n, --dry-run   só mostra o que seria alterado (não altera nada)
#
# O push fica por sua conta: git push && git push origin release-X.Y
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

ultima_tag="$(git tag --list 'release-*' --sort=-v:refname | head -n1)"

if [ -z "$ultima_tag" ]; then
    echo "❌ Nenhuma tag release-X.Y encontrada." >&2
    exit 1
fi

versao_atual="${ultima_tag#release-}"

if ! [[ "$versao_atual" =~ ^([0-9]+)\.([0-9]+)$ ]]; then
    echo "❌ Tag '$ultima_tag' fora do formato release-X.Y." >&2
    exit 1
fi

nova_versao="${BASH_REMATCH[1]}.$((BASH_REMATCH[2] + 1))"
nova_tag="release-${nova_versao}"

if git rev-parse -q --verify "refs/tags/${nova_tag}" >/dev/null; then
    echo "❌ A tag '$nova_tag' já existe." >&2
    exit 1
fi

echo "🔖 ${ultima_tag} -> ${nova_tag}"

# "1.5" isolado (não pega 11.5, 1.5.2, 1.50...); o "v" de "v1.5" continua casando
atual_re="${versao_atual//./\\.}"
padrao="(^|[^0-9.])${atual_re}([^0-9.]|$)"

# package.json/package-lock.json: só a versão do próprio projeto (as dependências
# também têm "1.5" e não podem ser tocadas). Os binários e os patches ficam de fora.
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
    # Repete para pegar ocorrências vizinhas (o separador de uma é consumido pela outra)
    perl -pi -e "1 while s/(^|[^0-9.])${atual_re}([^0-9.]|\$)/\${1}${nova_versao}\${2}/" "$arq"
done

# A data da release ao lado da versão: "release-X.Y (de DD/MM/AAAA)" (a versão pode estar entre crases)
hoje="$(date +%d/%m/%Y)"
nova_re="${nova_versao//./\\.}"
while IFS= read -r arq; do
    perl -pi -e "s|(release-${nova_re}\`? \\(de )\\d{2}/\\d{2}/\\d{4}|\${1}${hoje}|g" "$arq"
done < <(git grep -lIE "release-${nova_re}\`? \\(de [0-9]{2}/" -- . ':!bump.sh' || true)

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
' "$nova_versao"

git --no-pager diff --stat

git commit -qam "Bump para ${nova_versao}"
git tag -a "$nova_tag" -m "Bump para ${nova_versao}"

echo "✅ Commit e tag '${nova_tag}' criados em '$(git branch --show-current)'."
echo "💡 Para publicar: git push && git push origin ${nova_tag}"
