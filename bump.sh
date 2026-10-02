#!/usr/bin/env bash
#
# bump.sh - Abre e fecha as versões do ZapBot
#
# O bump abre a versão (é o primeiro commit dela) e a tag a fecha (no último):
#
#   release-2.1 ── Bump para 2.2 ── ...commits da 2.2... ── Release 2.2 (tag release-2.2)
#
# ./bump.sh [X.Y]: abre a próxima versão (a atual precisa já ter a tag)
#   1. A nova é X.(Y+1) da atual (a do package.json) ou a informada (ex.:
#      ./bump.sh 3.0, para sair da 2.x), maior que a atual
#   2. Troca a versão atual pela nova no package.json, no README.md e no docs/:
#      "ZapBot 2.2", os exemplos "git+<commit>/release-2.2"... Só nesses: no código
#      e nos testes, "2.0" pode ser outra coisa (a API do NVD, o JSON-RPC da Solana).
#      Ficam como estão a versão estável ("hoje a release-2.1", "git checkout
#      release-2.1"), que só muda no -r, e as linhas que citam o próprio bump.sh
#   3. Commita com a mensagem "Bump para X.Y" (sem tag)
#
# ./bump.sh -r: fecha a versão atual (a do package.json) como release
#   1. Troca a versão estável (o release-X.Y sem "/" antes: "hoje a release-2.1",
#      "git checkout release-2.1") pela atual, com a data de hoje ao lado dela em
#      "release-X.Y (de DD/MM/AAAA)"
#   2. Commita com a mensagem "Release X.Y" e cria a tag anotada release-X.Y nele
#   3. Grava as refs no .git/packed-refs (git pack-refs --all), para a imagem
#      Docker saber o commit da tag sem os objetos do git (src/versao.js)
#
# Uso: ./bump.sh [-n|--dry-run] [X.Y]
#      ./bump.sh [-n|--dry-run] -r|--release
#   -n, --dry-run   só mostra o que seria alterado (não altera nada)
#   -r, --release   fecha a versão atual: commit "Release X.Y" + tag release-X.Y
#   X.Y             a versão a abrir (maior que a atual); sem ela, X.(Y+1)
#
# O push fica por sua conta: git push (e, no -r, git push origin release-X.Y)
#

set -euo pipefail

cd "$(dirname "$0")"

uso() {
    echo "Uso: $0 [-n|--dry-run] [X.Y]  ou  $0 [-n|--dry-run] -r|--release" >&2
    exit 1
}

DRY_RUN=0
RELEASE=0
versao_pedida=""
for arg in "$@"; do
    case "$arg" in
        -n|--dry-run) DRY_RUN=1 ;;
        -r|--release) RELEASE=1 ;;
        -h|--help) uso ;;
        -*) echo "❌ Opção desconhecida: $arg" >&2; uso ;;
        *)
            [ -z "$versao_pedida" ] || { echo "❌ Informe uma versão só." >&2; uso; }
            versao_pedida="$arg"
            ;;
    esac
done

if [ "$RELEASE" -eq 1 ] && [ -n "$versao_pedida" ]; then
    echo "❌ O -r fecha a versão do package.json: não informe a versão." >&2
    uso
fi

if [ -n "$versao_pedida" ] && ! [[ "$versao_pedida" =~ ^[0-9]+\.[0-9]+$ ]]; then
    echo "❌ Versão '$versao_pedida' fora do formato X.Y (ex.: 2.0)." >&2
    exit 1
fi

if [ "$DRY_RUN" -eq 0 ] && [ -n "$(git status --porcelain)" ]; then
    echo "❌ Há alterações não commitadas. Commite ou descarte antes do bump." >&2
    exit 1
fi

versao_atual="$(node -p 'require("./package.json").version')"
if ! [[ "$versao_atual" =~ ^([0-9]+)\.([0-9]+)$ ]]; then
    echo "❌ Versão '$versao_atual' do package.json fora do formato X.Y." >&2
    exit 1
fi
proxima="${BASH_REMATCH[1]}.$((BASH_REMATCH[2] + 1))"

ultima_tag="$(git tag --list 'release-*' --sort=-v:refname | head -n1)"
if [ -z "$ultima_tag" ]; then
    echo "❌ Nenhuma tag release-X.Y encontrada." >&2
    exit 1
fi

tem_tag() { git rev-parse -q --verify "refs/tags/release-$1" >/dev/null; }

# a > b, comparando X e Y como números (1.10 > 1.9)
maior() { [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -t. -k1,1n -k2,2n | tail -n1)" = "$1" ]; }

# Só o README e o docs/ (fora o requirements.txt, que tem as versões do MkDocs).
# O package.json/package-lock.json vão à parte: só a versão do próprio projeto (as
# dependências também têm "1.5" e não podem ser tocadas).
ONDE=(README.md docs ':!docs/requirements.txt')
hoje="$(date +%d/%m/%Y)"

# Os arquivos do README/docs com a regex (vazio se nenhum)
arquivos_com() { git grep -lIE "$1" -- "${ONDE[@]}" || true; }

# Aplica o código perl (uma substituição) nos arquivos com a regex; no dry-run,
# só mostra as linhas que mudariam, já trocadas. As linhas que citam o próprio
# bump.sh (os exemplos dele) ficam como estão.
trocar() {
    local regex=$1 codigo="next if /bump\\.sh/; $2"
    while IFS= read -r arq; do
        [ -n "$arq" ] || continue
        if [ "$DRY_RUN" -eq 1 ]; then
            perl -ne "my \$o = \$_; { $codigo } print \"   \$ARGV:\$.: \$_\" if \$_ ne \$o;" "$arq"
        else
            perl -pi -e "$codigo" "$arq"
        fi
    done < <(arquivos_com "$regex")
}

if [ "$RELEASE" -eq 1 ]; then
    # Fecha a versão do package.json
    if tem_tag "$versao_atual"; then
        echo "❌ A release-${versao_atual} já existe. Abra a próxima com $0." >&2
        exit 1
    fi
    if ! maior "$versao_atual" "${ultima_tag#release-}"; then
        echo "❌ A versão ${versao_atual} não é maior que a última release (${ultima_tag})." >&2
        exit 1
    fi

    nova_tag="release-${versao_atual}"
    echo "🔖 ${ultima_tag} -> ${nova_tag} (versão estável)"

    # A versão estável: "release-X.Y" sem "/" antes (o "git+<commit>/release-X.Y"
    # dos exemplos é a versão do bot, que muda no bump)
    est_re="${ultima_tag//./\\.}"
    padrao="(^|[^/])${est_re}([^0-9.]|$)"

    [ "$DRY_RUN" -eq 1 ] && echo "📝 Seriam alterados (commit \"Release ${versao_atual}\" + tag ${nova_tag}):"

    # E a data de hoje ao lado dela: "release-X.Y (de DD/MM/AAAA)" (a versão pode estar entre crases)
    nova_re="release-${versao_atual//./\\.}"
    trocar "$padrao" "1 while s#(^|[^/])${est_re}([^0-9.]|\$)#\${1}${nova_tag}\${2}#;
        s|(${nova_re}\`? \\(de )\\d{2}/\\d{2}/\\d{4}|\${1}${hoje}|g;"
    [ "$DRY_RUN" -eq 1 ] && exit 0

    git --no-pager diff --stat
    git commit -qam "Release ${versao_atual}"
    git tag -a "$nova_tag" -m "Release ${versao_atual}"

    # Grava as tags no .git/packed-refs com o commit de cada uma: a imagem Docker não
    # leva os objetos do git, e é por aí que o /version mostra "(git+<commit>/<tag>)"
    git pack-refs --all
    exit 0
fi

# Abre a próxima versão
if ! tem_tag "$versao_atual"; then
    echo "❌ A ${versao_atual} ainda não foi fechada: rode $0 -r antes de abrir a próxima." >&2
    exit 1
fi

nova_versao="${versao_pedida:-$proxima}"
if ! maior "$nova_versao" "$versao_atual"; then
    echo "❌ A versão ${nova_versao} não é maior que a atual (${versao_atual})." >&2
    exit 1
fi

echo "🚀 ${versao_atual} -> ${nova_versao} (em desenvolvimento)"

# "1.5" isolado (não pega 11.5, 1.5.2, 1.50...); o "v" de "v1.5" continua casando
atual_re="${versao_atual//./\\.}"
padrao="(^|[^0-9.])${atual_re}([^0-9.]|$)"

if [ "$DRY_RUN" -eq 1 ]; then
    echo "📝 Seriam alterados (commit \"Bump para ${nova_versao}\"; a versão estável continua release-${versao_atual}):"
    echo "   package.json, package-lock.json (versão do projeto)"
fi

# A versão estável (release-X.Y sem "/" antes) é guardada e volta como estava;
# o resto troca, repetindo para pegar ocorrências vizinhas (o separador de uma
# é consumido pela outra)
trocar "$padrao" "s#(^|[^/])release-${atual_re}(?=[^0-9.]|\$)#\${1}\\x00ESTAVEL\\x00#g;
    1 while s/(^|[^0-9.])${atual_re}([^0-9.]|\$)/\${1}${nova_versao}\${2}/;
    s#\\x00ESTAVEL\\x00#release-${versao_atual}#g;"
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
' "$nova_versao"

git --no-pager diff --stat
git commit -qam "Bump para ${nova_versao}"
