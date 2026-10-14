#!/usr/bin/env bash
#
# bump.sh - Fecha a versão atual (release) e abre a próxima, numa execução só
#
#   ... commits da 2.2.0 ── Release 2.2.0 (tag v2.2.0) ── Bump para 2.2.1 ── ...
#
# A versão atual é a do package.json (ex.: 2.2.0, em desenvolvimento desde o
# último bump). O ./bump.sh faz, em ordem:
#
#   1. Release 2.2.0 (pula se a tag v2.2.0 já existe)
#      - A versão estável do README e do docs/ (o vX.Y.Z logo depois de uma
#        crase, de "checkout " ou de "versão: ": "hoje a `v2.1.0`",
#        "git checkout v2.1.0") vira v2.2.0, com a data de hoje em
#        "v2.2.0 (de DD/MM/AAAA)".
#      - Os exemplos da versão em desenvolvimento perdem o rótulo:
#        "2.2.0 (devel) (git+abc1234/HEAD)" vira "2.2.0 (git+abc1234/v2.2.0)",
#        e "ZapBot 2.2.0 (devel)" vira "ZapBot 2.2.0".
#      - Commit "Release 2.2.0" com a tag anotada v2.2.0 nele (sem nada a
#        trocar, a tag vai no commit atual).
#   2. Bump para 2.2.1 (ou 2.3.0 com --minor, 3.0.0 com --major, ou a versão
#      informada, ex.: ./bump.sh 3.1.0)
#      - package.json/package-lock.json na versão nova.
#      - Os exemplos voltam a ser da versão em desenvolvimento, já com o rótulo:
#        "2.2.0 (git+abc1234/v2.2.0)" vira "2.2.1 (devel) (git+abc1234/HEAD)", e
#        "ZapBot 2.2.0" vira "ZapBot 2.2.1 (devel)". A versão estável fica v2.2.0.
#      - Commit "Bump para 2.2.1" (sem tag).
#   3. git pack-refs --all, para a imagem Docker saber o commit da tag sem os
#      objetos do git (src/versao.js).
#
# Só o README e o docs/ mudam (fora o requirements.txt, com as versões do MkDocs):
# no código e nos testes, "2.0.0" pode ser outra coisa (a versão de uma
# dependência). As linhas que citam o próprio bump.sh ficam como estão, e as que
# explicam o formato usam X.Y.Z, que ninguém troca.
#
# Uso: ./bump.sh [-n|--dry-run] [--minor|--major|X.Y.Z]
#   -n, --dry-run   só mostra o que seria alterado (não altera nada)
#   --minor         abre X.(Y+1).0 depois da release
#   --major         abre (X+1).0.0 depois da release
#   X.Y.Z           a versão a abrir depois da release (maior que a atual);
#                   sem nada, X.Y.(Z+1)
#
# O push fica por sua conta: git push && git push origin vX.Y.Z
#

set -euo pipefail

cd "$(dirname "$0")"

uso() {
    echo "Uso: $0 [-n|--dry-run] [--minor|--major|X.Y.Z]" >&2
    exit 1
}

DRY_RUN=0
versao_pedida=""
parte=""
for arg in "$@"; do
    case "$arg" in
        -n|--dry-run) DRY_RUN=1 ;;
        --minor|--major)
            [ -z "$parte" ] || { echo "❌ Use --minor ou --major, não os dois." >&2; uso; }
            parte="${arg#--}"
            ;;
        -h|--help) uso ;;
        -*) echo "❌ Opção desconhecida: $arg" >&2; uso ;;
        *)
            [ -z "$versao_pedida" ] || { echo "❌ Informe uma versão só." >&2; uso; }
            versao_pedida="$arg"
            ;;
    esac
done

if [ -n "$versao_pedida" ] && [ -n "$parte" ]; then
    echo "❌ Use --${parte} ou a versão X.Y.Z, não os dois." >&2
    uso
fi

if [ -n "$versao_pedida" ] && ! [[ "$versao_pedida" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "❌ Versão '$versao_pedida' fora do formato X.Y.Z (ex.: 2.0.1)." >&2
    exit 1
fi

if [ "$DRY_RUN" -eq 0 ] && [ -n "$(git status --porcelain)" ]; then
    echo "❌ Há alterações não commitadas. Commite ou descarte antes do bump." >&2
    exit 1
fi

atual="$(node -p 'require("./package.json").version')"
if ! [[ "$atual" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    echo "❌ Versão '$atual' do package.json fora do formato X.Y.Z." >&2
    exit 1
fi
x="${BASH_REMATCH[1]}" y="${BASH_REMATCH[2]}" z="${BASH_REMATCH[3]}"
case "$parte" in
    major) proxima="$((x + 1)).0.0" ;;
    minor) proxima="${x}.$((y + 1)).0" ;;
    *) proxima="${x}.${y}.$((z + 1))" ;;
esac
nova="${versao_pedida:-$proxima}"

ultima_tag="$(git tag --list 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | head -n1)"
if [ -z "$ultima_tag" ]; then
    echo "❌ Nenhuma tag vX.Y.Z encontrada." >&2
    exit 1
fi
estavel="${ultima_tag#v}"

# a > b, comparando X, Y e Z como números (1.10.0 > 1.9.0)
maior() {
    [ "$1" != "$2" ] &&
        [ "$(printf '%s\n%s\n' "$1" "$2" | sort -t. -k1,1n -k2,2n -k3,3n | tail -n1)" = "$1" ]
}

if ! maior "$nova" "$atual"; then
    echo "❌ A versão ${nova} não é maior que a atual (${atual})." >&2
    exit 1
fi

fazer_release=1
if git rev-parse -q --verify "refs/tags/v${atual}" >/dev/null; then
    fazer_release=0
elif ! maior "$atual" "$estavel"; then
    echo "❌ A versão ${atual} do package.json não é maior que a última release (${ultima_tag})." >&2
    exit 1
fi

re() { printf '%s' "${1//./\\.}"; }
A="$(re "$atual")"
hoje="$(date +%d/%m/%Y)"

# A versão estável: o vX.Y.Z logo depois de uma crase, de "checkout " ou de "versão: "
# (o "Node.js: v24.9.0" do /bot -info, por exemplo, fica como está)
ANTES_DA_ESTAVEL='(?:(?<=`)|(?<=checkout )|(?<=versão: ))'

# Release: a estável vira a atual (com a data) e os exemplos perdem o "(devel)"
CODIGO_RELEASE="
    s#${ANTES_DA_ESTAVEL}v[0-9]+\\.[0-9]+\\.[0-9]+(?![0-9.])#v${atual}#g;
    s|(v${A}\`? \\(de )\\d{2}/\\d{2}/\\d{4}|\${1}${hoje}|g;
    s#(?<![-\\d./])${A} \\(devel\\) \\(git\\+([0-9a-f]+)/HEAD\\)#${atual} (git+\${1}/v${atual})#g;
    s#(?<![-\\d./])${A} \\(devel\\)#${atual}#g;"

# Bump: os exemplos passam para a nova, com o "(devel)"; a estável é guardada e
# volta como estava
CODIGO_BUMP="
    s#(?<![-\\d./])${A} \\(devel\\)#${nova} (devel)#g;
    s#${ANTES_DA_ESTAVEL}v${A}(?![0-9.])#\\x00ESTAVEL\\x00#g;
    s#(?<![-\\d./])${A} \\(git\\+([0-9a-f]+)/v${A}\\)#${nova} (devel) (git+\${1}/HEAD)#g;
    s#(?<![-\\d./])${A}(?![0-9.])(?! \\(devel\\))#${nova} (devel)#g;
    s#\\x00ESTAVEL\\x00#v${atual}#g;"

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

# A mensagem vai para um arquivo e respeita o limite de colunas dos commits.
commitar() {
    local mensagem
    mensagem="$(mktemp "${TMPDIR:-/tmp}/zapbot-commit.XXXXXX")"
    printf '%s\n' "$1" > "$mensagem"
    awk 'length > 100 { print; erro = 1 } END { exit erro }' "$mensagem"
    git commit -a -F "$mensagem"
    rm -f "$mensagem"
}

if [ "$DRY_RUN" -eq 1 ]; then
    # Os dois passos sobre as mesmas linhas, como sairiam no fim
    if [ "$fazer_release" -eq 1 ]; then
        codigo="next if /bump\\.sh/; $CODIGO_RELEASE $CODIGO_BUMP"
        echo "🔖 Release ${atual}: commit \"Release ${atual}\" + tag v${atual} (estável: ${ultima_tag} -> v${atual})"
    else
        codigo="next if /bump\\.sh/; $CODIGO_BUMP"
        echo "ℹ️ A v${atual} já existe: só o bump."
    fi
    echo "🚀 Bump para ${nova}: package.json, package-lock.json e, no README/docs/:"
    arquivos | while IFS= read -r arq; do
        perl -ne "my \$o = \$_; { $codigo } print \"   \$ARGV:\$.: \$_\" if \$_ ne \$o;" "$arq"
    done
    exit 0
fi

if [ "$fazer_release" -eq 1 ]; then
    echo "🔖 Release ${atual} (estável: ${ultima_tag} -> v${atual})"
    aplicar "$CODIGO_RELEASE"
    if git diff --quiet; then
        echo "ℹ️ Nada a trocar nos docs: a tag vai no commit atual."
    else
        git --no-pager diff --stat
        commitar "Release ${atual}"
    fi
    git tag -a "v${atual}" -m "Release ${atual}"
else
    echo "ℹ️ A v${atual} já existe: só o bump."
fi

echo "🚀 Bump para ${nova} (em desenvolvimento)"
aplicar "$CODIGO_BUMP"
atualizar_package "$nova"
git --no-pager diff --stat
commitar "Bump para ${nova}"

# Grava as tags no .git/packed-refs com o commit de cada uma: a imagem Docker não
# leva os objetos do git, e é por aí que o /version mostra "(git+<commit>/<tag>)"
git pack-refs --all

echo "✅ Pronto. Para publicar: git push && git push origin v${atual}"
