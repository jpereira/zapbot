#!/usr/bin/env bash
#
# scripts/bump.sh - Closes the current version (release) and opens the next, in one run
#
# ... 2.2.0 commits ── Release 2.2.0 (tag v2.2.0) ── Bump to 2.2.1 ── ...
#
# The current version is package.json's (e.g.: 2.2.0, in development since the
# last bump). ./scripts/bump.sh does, in order:
#
# 1. Release 2.2.0 (skipped if the v2.2.0 tag already exists)
# - The stable version in the README and docs/ (the vX.Y.Z right after a
# backtick, of "checkout " or of "versão: ": "hoje a `v2.1.0`",
# "git checkout v2.1.0") becomes v2.2.0, with today's date in
# "v2.2.0 (from DD/MM/YYYY)".
# - The examples of the in-development version lose the label:
#        "2.2.0 (devel) (git+abc1234/HEAD)" vira "2.2.0 (git+abc1234/v2.2.0)",
#        e "ZapBot 2.2.0 (devel)" vira "ZapBot 2.2.0".
# - Commit "Release 2.2.0" with the annotated tag v2.2.0 on it (with nothing to
# swap, the tag goes on the current commit).
# 2. Bump to 2.2.1 (or 2.3.0 with --minor, 3.0.0 with --major, or the version
#      informada, ex.: ./scripts/bump.sh 3.1.0)
# - package.json/package-lock.json at the new version.
# - The examples go back to being of the in-development version, already with the label:
#        "2.2.0 (git+abc1234/v2.2.0)" vira "2.2.1 (devel) (git+abc1234/HEAD)", e
# "ZapBot 2.2.0" becomes "ZapBot 2.2.1 (devel)". The stable version stays v2.2.0.
# - Commit "Bump to 2.2.1" (no tag).
# 3. git pack-refs --all, so the Docker image knows the tag commit without the
# git objects (src/version.js).
#
# Only the README and docs/ change (except requirements.txt, with the MkDocs versions):
# in the code and the tests, "2.0.0" may be something else (the version of a
# dependency). The lines that cite bump.sh itself stay as they are, and those that
# explain the format use X.Y.Z, which nobody swaps.
#
# Uso: ./scripts/bump.sh [-n|--dry-run] [--minor|--major|X.Y.Z]
# -n, --dry-run   only shows what would change (changes nothing)
# --minor         opens X.(Y+1).0 after the release
# --major         opens (X+1).0.0 after the release
# X.Y.Z           the version to open after the release (greater than the current one);
# with nothing, X.Y.(Z+1)
#
# The push is up to you: git push && git push origin vX.Y.Z
#

set -euo pipefail

cd "$(dirname "$0")/.."

uso() {
    echo "Uso: $0 [-n|--dry-run] [--minor|--major|X.Y.Z]" >&2
    exit 1
}

DRY_RUN=0
version_requested=""
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
            [ -z "$version_requested" ] || { echo "❌ Informe uma versão só." >&2; uso; }
            version_requested="$arg"
            ;;
    esac
done

if [ -n "$version_requested" ] && [ -n "$parte" ]; then
    echo "❌ Use --${parte} ou a versão X.Y.Z, não os dois." >&2
    uso
fi

if [ -n "$version_requested" ] && ! [[ "$version_requested" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "❌ Versão '$version_requested' fora do formato X.Y.Z (ex.: 2.0.1)." >&2
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
nova="${version_requested:-$proxima}"

last_tag="$(git tag --list 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | head -n1)"
if [ -z "$last_tag" ]; then
    echo "❌ Nenhuma tag vX.Y.Z encontrada." >&2
    exit 1
fi
estavel="${last_tag#v}"

# a > b, comparing X, Y and Z as numbers (1.10.0 > 1.9.0)
maior() {
    [ "$1" != "$2" ] &&
        [ "$(printf '%s\n%s\n' "$1" "$2" | sort -t. -k1,1n -k2,2n -k3,3n | tail -n1)" = "$1" ]
}

if ! maior "$nova" "$atual"; then
    echo "❌ A versão ${nova} não é maior que a atual (${atual})." >&2
    exit 1
fi

do_release=1
if git rev-parse -q --verify "refs/tags/v${atual}" >/dev/null; then
    do_release=0
elif ! maior "$atual" "$estavel"; then
    echo "❌ A versão ${atual} do package.json não é maior que a última release (${last_tag})." >&2
    exit 1
fi

re() { printf '%s' "${1//./\\.}"; }
A="$(re "$atual")"
hoje="$(date +%d/%m/%Y)"

# The stable version: the vX.Y.Z right after a backtick, "checkout " or "versão: "
# (the "Node.js: v24.9.0" of /bot -info, for example, stays as is)
STABLE_BEFORE='(?:(?<=`)|(?<=checkout )|(?<=versão: ))'

# Release: the stable one becomes the current one (with the date) and the examples lose the "(devel)"
CODE_RELEASE="
    s#${STABLE_BEFORE}v[0-9]+\\.[0-9]+\\.[0-9]+(?![0-9.])#v${atual}#g;
    s|(v${A}\`? \\(de )\\d{2}/\\d{2}/\\d{4}|\${1}${hoje}|g;
    s#(?<![-\\d./])${A} \\(devel\\) \\(git\\+([0-9a-f]+)/HEAD\\)#${atual} (git+\${1}/v${atual})#g;
    s#(?<![-\\d./])${A} \\(devel\\)#${atual}#g;"

# Bump: the examples move to the new one, with the "(devel)"; the stable one is kept and
# comes back as it was
CODE_BUMP="
    s#(?<![-\\d./])${A} \\(devel\\)#${nova} (devel)#g;
    s#${STABLE_BEFORE}v${A}(?![0-9.])#\\x00ESTAVEL\\x00#g;
    s#(?<![-\\d./])${A} \\(git\\+([0-9a-f]+)/v${A}\\)#${nova} (devel) (git+\${1}/HEAD)#g;
    s#(?<![-\\d./])${A}(?![0-9.])(?! \\(devel\\))#${nova} (devel)#g;
    s#\\x00ESTAVEL\\x00#v${atual}#g;"

# README e docs/ (fora o requirements.txt)
arquivos() { git ls-files README.md 'docs/*.md' 'docs/**/*.md'; }

# Applies the perl code; the lines that cite bump.sh itself stay as they are
aplicar() {
    local codigo="next if /bump\\.sh/; $1"
    arquivos | while IFS= read -r arq; do perl -pi -e "$codigo" "$arq"; done
}

update_package() {
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

# The message goes to a file and respects the commit column limit.
commitar() {
    local mensagem
    mensagem="$(mktemp "${TMPDIR:-/tmp}/zapbot-commit.XXXXXX")"
    printf '%s\n' "$1" > "$mensagem"
    awk 'length > 100 { print; erro = 1 } END { exit erro }' "$mensagem"
    git commit -a -F "$mensagem"
    rm -f "$mensagem"
}

if [ "$DRY_RUN" -eq 1 ]; then
    # Both steps over the same lines, as they would come out in the end
    if [ "$do_release" -eq 1 ]; then
        codigo="next if /bump\\.sh/; $CODE_RELEASE $CODE_BUMP"
        echo "🔖 Release ${atual}: commit \"Release ${atual}\" + tag v${atual} (estável: ${last_tag} -> v${atual})"
    else
        codigo="next if /bump\\.sh/; $CODE_BUMP"
        echo "ℹ️ A v${atual} já existe: só o bump."
    fi
    echo "🚀 Bump to ${nova}: package.json, package-lock.json e, no README/docs/:"
    arquivos | while IFS= read -r arq; do
        perl -ne "my \$o = \$_; { $codigo } print \"   \$ARGV:\$.: \$_\" if \$_ ne \$o;" "$arq"
    done
    exit 0
fi

if [ "$do_release" -eq 1 ]; then
    echo "🔖 Release ${atual} (estável: ${last_tag} -> v${atual})"
    aplicar "$CODE_RELEASE"
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

echo "🚀 Bump to ${nova} (em desenvolvimento)"
aplicar "$CODE_BUMP"
update_package "$nova"
git --no-pager diff --stat
commitar "Bump to ${nova}"

# Writes the tags to .git/packed-refs with each one's commit: the Docker image does not
# carries the git objects, and that is how /version shows "(git+<commit>/<tag>)"
git pack-refs --all

echo "✅ Pronto. Para publicar: git push && git push origin v${atual}"
