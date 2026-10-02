# `/version` (`/ver`) · admin

Exibe o mesmo banner do `/uptime`, com a versão do bot.

```
/ver
🤖 ZapBot 2.1 (git+25b0870)
━━━━━━━━━━━━━━━━━━
⚡ Online: 2 dias, 3 horas
🔐 Conectado: 2 dias, 2 horas, 58 minutos
```

O `git+25b0870` é o commit do código que está rodando. Ele é lido do `.git` do
projeto: o `.dockerignore` deixa a imagem levar só o `.git/HEAD` e as refs, então
cada `docker compose build` grava o commit que foi para ela, sem passo extra. No
checkout de uma release (`git checkout release-2.1`) é o commit da tag. Para
montar a imagem de outro jeito (ex.: sem o `.git`), defina `ZAPBOT_COMMIT`
([Configuração](../configuracao.md)); sem nenhum dos dois, aparece só a versão.
