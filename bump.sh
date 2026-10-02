#!/usr/bin/env bash
#
# bump.sh - Fecha a versão atual (release) e abre a próxima, numa execução só
#
#   ... commits da 2.2 ── Release 2.2 (tag release-2.2) ── Bump para 2.3 ── ...
#
# A versão atual é a do package.json (ex.: 2.2, em desenvolvimento desde o último
# bump). O ./bump.sh faz, em ordem:
#
#   1. Release 2.2 (pula se a tag release-2.2 já existe)
#      - A versão estável do README e do docs/ (o release-X.Y sem "/" antes:
#        "hoje a release-2.1", "git checkout release-2.1") vira release-2.2, com
#        a data de hoje em "release-2.2 (de DD/MM/AAAA)".
#      - Os exemplos da versão em desenvolvimento perdem o rótulo:
#        "2.2 (devel) (git+abc1234/HEAD)" vira "2.2 (git+abc1234/release-2.2)",
#        e "ZapBot 2.2 (devel)" vira "ZapBot 2.2".
#      - Commit "Release 2.2" com a tag anotada release-2.2 nele (sem nada a
#        trocar, a tag vai no commit atual).
#   2. Bump para 2.3 (ou a versão informada, ex.: ./bump.sh 3.0)
#      - package.json/package-lock.json na versão nova.
#      - Os exemplos voltam a ser da versão em desenvolvimento, já com o rótulo:
#        "2.2 (git+abc1234/release-2.2)" vira "2.3 (devel) (git+abc1234/HEAD)", e
#        "ZapBot 2.2" vira "ZapBot 2.3 (devel)". A versão estável fica release-2.2.
#      - Commit "Bump para 2.3" (sem tag).
#   3. git pack-refs --all, para a imagem Docker saber o commit da tag sem os
#      objetos do git (src/versao.js).
#
# Só o README e o docs/ mudam (fora o requirements.txt, com as versões do MkDocs):
# no código e nos testes, "2.0" pode ser outra coisa (a API do NVD, o JSON-RPC da
# Solana). As linhas que citam o próprio bump.sh ficam como estão, e as que
# explicam o formato usam X.Y, que ninguém troca.
#
# Uso: ./bump.sh [-n|--dry-run] [X.Y]
#   -n, --dry-run   só mostra o que seria alterado (não altera nada)
#   X.Y             a versão a abrir depois da release (maior que a atual); sem ela, X.(Y+1)
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

atual="$(node -p 'require("./package.json").version')"
if ! [[ "$atual" =~ ^([0-9]+)\.([0-9]+)$ ]]; then
    echo "❌ Versão '$atual' do package.json fora do formato X.Y." >&2
    exit 1
fi
nova="${versao_pedida:-${BASH_REMATCH[1]}.$((BASH_REMATCH[2] + 1))}"

ultima_tag="$(git tag --list 'release-*' --sort=-v:refname | head -n1)"
if [ -z "$ultima_tag" ]; then
    echo "❌ Nenhuma tag release-X.Y encontrada." >&2
    exit 1
fi
estavel="${ultima_tag#release-}"

# a > b, comparando X e Y como números (1.10 > 1.9)
maior() { [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -t. -k1,1n -k2,2n | tail -n1)" = "$1" ]; }

if ! maior "$nova" "$atual"; then
    echo "❌ A versão ${nova} não é maior que a atual (${atual})." >&2
    exit 1
fi

fazer_release=1
if git rev-parse -q --verify "refs/tags/release-${atual}" >/dev/null; then
    fazer_release=0
elif ! maior "$atual" "$estavel"; then
    echo "❌ A versão ${atual} do package.json não é maior que a última release (${ultima_tag})." >&2
    exit 1
fi

re() { printf '%s' "${1//./\\.}"; }
A="$(re "$atual")"
E="$(re "$estavel")"
hoje="$(date +%d/%m/%Y)"

# Release: a estável vira a atual (com a data) e os exemplos perdem o "(devel)"
CODIGO_RELEASE="
    1 while s#(^|[^/])release-${E}([^0-9.]|\$)#\${1}release-${atual}\${2}#;
    s|(release-${A}\`? \\(de )\\d{2}/\\d{2}/\\d{4}|\${1}${hoje}|g;
    s#(?<![-\\d./])${A} \\(devel\\) \\(git\\+([0-9a-f]+)/HEAD\\)#${atual} (git+\${1}/release-${atual})#g;
    s#(?<![-\\d./])${A} \\(devel\\)#${atual}#g;"

# Bump: os exemplos passam para a nova, com o "(devel)"; a estável (release-X.Y
# sem "/" antes) é guardada e volta como estava
CODIGO_BUMP="
    s#(^|[^/])release-${A}(?=[^0-9.]|\$)#\${1}\\x00ESTAVEL\\x00#g;
    s#(?<![-\\d./])${A} \\(git\\+([0-9a-f]+)/release-${A}\\)#${nova} (devel) (git+\${1}/HEAD)#g;
    s#(?<![-\\d./])${A}(?![0-9.])(?! \\(devel\\))#${nova} (devel)#g;
    s#\\x00ESTAVEL\\x00#release-${atual}#g;"

# README e docs/ (fora o requirements.txt)
arquivos() { git ls-files README.md 'docs/*.md' 'docs/**/*.md'; }

# Aplica o código perl; as linhas que citam o próprio bump.sh ficam como estão
aplicar() {
    local codigo="next if /bump\\.sh/; $1"
    arquivos | while IFS= read -r arq; do perl -pi -e "$codigo" "$arq"; done
}

atualizar_package() {
    node -e '
        const fs = require("fs");
        for (const arq of ["package.json", "package-lock.json"]) {
            if (!fs.existsSync(arq)) continue;
            const json = JSON.parse(fs.readFileSync(arq, "utf8"));
            json.version = process.argv[1];
            if (json.packages?.[""]) json.packages[""].version = process.argv[1];
            fs.writeFileSync(arq, JSON.stringify(json, null, 2) + "\n");
        }
    ' "$1"
}

if [ "$DRY_RUN" -eq 1 ]; then
    # Os dois passos sobre as mesmas linhas, como sairiam no fim
    if [ "$fazer_release" -eq 1 ]; then
        codigo="next if /bump\\.sh/; $CODIGO_RELEASE $CODIGO_BUMP"
        echo "🔖 Release ${atual}: commit \"Release ${atual}\" + tag release-${atual} (estável: ${ultima_tag} -> release-${atual})"
    else
        codigo="next if /bump\\.sh/; $CODIGO_BUMP"
        echo "ℹ️ A release-${atual} já existe: só o bump."
    fi
    echo "🚀 Bump para ${nova}: package.json, package-lock.json e, no README/docs/:"
    arquivos | while IFS= read -r arq; do
        perl -ne "my \$o = \$_; { $codigo } print \"   \$ARGV:\$.: \$_\" if \$_ ne \$o;" "$arq"
    done
    exit 0
fi

if [ "$fazer_release" -eq 1 ]; then
    echo "🔖 Release ${atual} (estável: ${ultima_tag} -> release-${atual})"
    aplicar "$CODIGO_RELEASE"
    if git diff --quiet; then
        echo "ℹ️ Nada a trocar nos docs: a tag vai no commit atual."
    else
        git --no-pager diff --stat
        git commit -qam "Release ${atual}"
    fi
    git tag -a "release-${atual}" -m "Release ${atual}"
else
    echo "ℹ️ A release-${atual} já existe: só o bump."
fi

echo "🚀 Bump para ${nova} (em desenvolvimento)"
aplicar "$CODIGO_BUMP"
atualizar_package "$nova"
git --no-pager diff --stat
git commit -qam "Bump para ${nova}"

# Grava as tags no .git/packed-refs com o commit de cada uma: a imagem Docker não
# leva os objetos do git, e é por aí que o /version mostra "(git+<commit>/<tag>)"
git pack-refs --all

echo "✅ Pronto. Para publicar: git push && git push origin release-${atual}"
