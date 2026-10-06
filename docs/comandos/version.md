# `/version` (`/ver`)

Exibe o mesmo banner do `/uptime`, com a versão do bot.

```text
/ver
🤖 ZapBot 2.3 (devel) (git+9029cfb/HEAD)
━━━━━━━━━━━━━━━━━━
⚡ Online: 2 dias, 3 horas
🔐 Conectado: 2 dias, 2 horas, 58 minutos
```

O `git+9029cfb/release-X.Y` diz de onde vem o código que está rodando: o commit e, depois da `/`, a
**tag** dele. Vale com a tag em checkout ou num branch que está no commit dela (o `main` logo depois
do `bump.sh`, no commit da release). Num commit sem tag, no lugar dela vem `HEAD`, e a versão ganha
o **`(devel)`**: é código que ainda não virou release (o `main` entre um bump e a release seguinte),
para ninguém confundir com a estável:

```text
🤖 ZapBot X.Y (git+9029cfb/release-X.Y)           → a release X.Y (checkout da tag, ou o main nela)
🤖 ZapBot X.Y (devel) (git+7f68066/HEAD)          → um commit sem tag (ex.: o main em desenvolvimento)
```

O `(devel)` também aparece no `/bot -status`, no `/bot -info`, no início do boot, na mensagem de
inicialização, nos e-mails e nos backups.

Os dois são lidos do `.git` do projeto, sem o `git`. O `.dockerignore` deixa a imagem levar só o
necessário: o `.git/HEAD`, as refs dos branches e das tags, o `packed-refs` e o reflog do `HEAD`.
Assim, cada `docker compose build` grava o commit e a tag do código que foi para ela, sem passo
extra.

As tags do `bump.sh` são *anotadas*: a ref aponta para um objeto do git, não para o commit, e a
imagem não leva os objetos. Por isso o `bump.sh` roda `git pack-refs --all` ao criar a tag, gravando
no `.git/packed-refs` o commit de cada tag (um clone novo já vem assim). Depois de um
`git fetch --tags`, o checkout da tag (`git checkout release-X.Y`) também resolve, pelo reflog. Se
mesmo assim aparecer `HEAD` num commit com tag, rode `git pack-refs --all` e refaça o build. Para
montar a imagem de outro jeito (ex.: sem o `.git`), defina `ZAPBOT_COMMIT` (`9029cfb` ou
`9029cfb/release-X.Y`; veja [Configuração](../configuracao.md)). Sem nenhum dos dois, aparece só a
versão.
