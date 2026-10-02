#!/usr/bin/env bash
#
# bump.sh - Gera uma nova release do ZapBot
#
#   1. Incrementa a última tag release-X.Y (ex.: release-1.5 -> release-1.6) ou
#      usa a versão informada (ex.: ./bump.sh 2.0, para sair da 1.x)
#   2. Troca a versão antiga pela nova no README.md e no docs/ (e a data ao lado
#      dela, em "release-X.Y (de DD/MM/AAAA)", pela de hoje). Só nesses: no código
#      e nos testes, "2.0" pode ser outra coisa (a API do NVD, o JSON-RPC da Solana).
#      As linhas que citam o próprio bump.sh (os exemplos dele) ficam como estão
#   3. Commita e aplica a tag no branch atual com a mensagem "Bump para X.Y"
#   4. Grava as refs no .git/packed-refs (git pack-refs --all), para a imagem
#      Docker saber o commit da tag sem os objetos do git (src/versao.js)
#
# Uso: ./bump.sh [-n|--dry-run] [X.Y]
#   -n, --dry-run   só mostra o que seria alterado (não altera nada)
#   X.Y             a nova versão (maior que a atual); sem ela, X.(Y+1)
#
# O push fica por sua conta: git push && git push origin release-X.Y
#

set -euo pipefail

cd "$(dirname "$0")"

uso() {
    echo "Uso: $0 [-n|--dry-run] [X.Y]" >&2
    exit 1
}

DRY_RUN=0
versao_pedida=""
for arg in "$@"; do
    case "$arg" in
        -n|--dry-run) DRY_RUN=1 ;;
        -h|--help) uso ;;
        -*) echo "❌ Opção desconhecida: $arg" >&2; uso ;;
        *)
            [ -z "$versao_pedida" ] || { echo "❌ Informe uma versão só." >&2; uso; }
            versao_pedida="$arg"
            ;;
    esac
done

if [ -n "$versao_pedida" ] && ! [[ "$versao_pedida" =~ ^[0-9]+\.[0-9]+$ ]]; then
    echo "❌ Versão '$versao_pedida' fora do formato X.Y (ex.: 2.0)." >&2
    exit 1
fi

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

nova_versao="${versao_pedida:-${BASH_REMATCH[1]}.$((BASH_REMATCH[2] + 1))}"
nova_tag="release-${nova_versao}"

# A versão informada precisa ser maior que a atual (comparando X e Y como números: 1.10 > 1.9)
if [ "$(printf '%s\n%s\n' "$versao_atual" "$nova_versao" | sort -t. -k1,1n -k2,2n | tail -n1)" != "$nova_versao" ] \
    || [ "$nova_versao" = "$versao_atual" ]; then
    echo "❌ A versão ${nova_versao} não é maior que a atual (${versao_atual})." >&2
    exit 1
fi

if git rev-parse -q --verify "refs/tags/${nova_tag}" >/dev/null; then
    echo "❌ A tag '$nova_tag' já existe." >&2
    exit 1
fi

echo "🔖 ${ultima_tag} -> ${nova_tag}"

# "1.5" isolado (não pega 11.5, 1.5.2, 1.50...); o "v" de "v1.5" continua casando
atual_re="${versao_atual//./\\.}"
padrao="(^|[^0-9.])${atual_re}([^0-9.]|$)"

# Só o README e o docs/ (fora o requirements.txt, que tem as versões do MkDocs).
# O package.json/package-lock.json vão à parte: só a versão do próprio projeto (as
# dependências também têm "1.5" e não podem ser tocadas).
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
    # Repete para pegar ocorrências vizinhas (o separador de uma é consumido pela outra)
    perl -pi -e "next if /bump\\.sh/; 1 while s/(^|[^0-9.])${atual_re}([^0-9.]|\$)/\${1}${nova_versao}\${2}/" "$arq"
done

# A data da release ao lado da versão: "release-X.Y (de DD/MM/AAAA)" (a versão pode estar entre crases)
hoje="$(date +%d/%m/%Y)"
nova_re="${nova_versao//./\\.}"
while IFS= read -r arq; do
    perl -pi -e "s|(release-${nova_re}\`? \\(de )\\d{2}/\\d{2}/\\d{4}|\${1}${hoje}|g" "$arq"
done < <(git grep -lIE "release-${nova_re}\`? \\(de [0-9]{2}/" -- "${ONDE[@]}" || true)

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

# Grava as tags no .git/packed-refs com o commit de cada uma: a imagem Docker não
# leva os objetos do git, e é por aí que o /version mostra "(git+<commit>/<tag>)"
git pack-refs --all

echo "✅ Commit e tag '${nova_tag}' criados em '$(git branch --show-current)'."
echo "💡 Para publicar: git push && git push origin ${nova_tag}"
