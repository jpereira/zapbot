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
e, depois da `/`, a **tag** dele. Fora de uma tag (no `main` ou num commit
qualquer), no lugar dela vem `HEAD`:

```
🤖 ZapBot 1.0.10 (git+9029cfb/v1.0.10)   → a release 1.0.10 (git checkout v1.0.10)
🤖 ZapBot 1.0.10 (git+7f68066/HEAD)          → um commit fora de uma release (ex.: o main)
```

Os dois são lidos do `.git` do projeto, sem o `git`. O `.dockerignore` deixa a
imagem levar só o necessário: o `.git/HEAD`, as refs dos branches e das tags, o
`packed-refs` e o reflog do `HEAD` (que confirma a tag depois de um
`git fetch --tags`). Assim, cada `docker compose build` grava o commit e a tag
do código que foi para ela, sem passo extra. Para montar a imagem de outro jeito
(ex.: sem o `.git`), defina `ZAPBOT_COMMIT` (`9029cfb` ou `9029cfb/v1.0.10`;
veja [Configuração](../configuration.md)). Sem nenhum dos dois, aparece só a versão.
