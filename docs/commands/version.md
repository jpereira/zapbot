# `/version` (`/ver`) · admin

Exibe o mesmo banner do `/uptime`, com a versão do bot.

```
/ver
🤖 ZapBot 1.0.10 (git+9029cfb/v1.0.10)
━━━━━━━━━━━━━━━━━━
⚡ Online: 2 dias, 3 horas
🔐 Conectado: 2 dias, 2 horas, 58 minutos
```

O `git+9029cfb/v1.0.10` diz de onde vem o código que está rodando: o commit
e, depois da `/`, a **tag** dele. Vale com a tag em checkout ou num branch que
está no commit dela (o `main` logo depois do `bump.sh`). Num commit sem tag, no
lugar dela vem `HEAD`:

```
🤖 ZapBot 1.0.10 (git+9029cfb/v1.0.10)   → o commit da release 1.0.10 (checkout da tag, ou o main nele)
🤖 ZapBot 1.0.10 (git+7f68066/HEAD)          → um commit sem tag (ex.: o main depois da release)
```

Os dois são lidos do `.git` do projeto, sem o `git`. O `.dockerignore` deixa a
imagem levar só o necessário: o `.git/HEAD`, as refs dos branches e das tags, o
`packed-refs` e o reflog do `HEAD`. Assim, cada `docker compose build` grava o
commit e a tag do código que foi para ela, sem passo extra.

As tags do `bump.sh` são *anotadas*: a ref aponta para um objeto do git, não
para o commit, e a imagem não leva os objetos. Por isso o `bump.sh` roda
`git pack-refs --all` ao criar a tag, gravando no `.git/packed-refs` o commit de
cada tag (um clone novo já vem assim). Depois de um `git fetch --tags`, o
checkout da tag (`git checkout v1.0.10`) também resolve, pelo reflog. Se
mesmo assim aparecer `HEAD` num commit com tag, rode `git pack-refs --all` e
refaça o build. Para montar a imagem de outro jeito
(ex.: sem o `.git`), defina `ZAPBOT_COMMIT` (`9029cfb` ou `9029cfb/v1.0.10`;
veja [Configuração](../configuration.md)). Sem nenhum dos dois, aparece só a versão.
