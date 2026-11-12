# `/kernel`

Versões mainline, stable e longterm publicadas em `kernel.org/releases.json` (até 6 linhas, na ordem
do kernel.org), com a data de lançamento de cada uma.

Exemplo ilustrativo de resposta:

```text
/kernel
🐧 Linux 7.2.8 (latest stable)

mainline  7.3-rc5      2026-09-27
stable    7.2.8        2026-09-25
stable    7.1.13       2026-09-02
longterm  6.18.54      2026-09-25
longterm  6.12.111     2026-09-21
longterm  6.6.157      2026-09-14
```

Se o kernel.org não responder, o bot avisa: `❌ Não consegui consultar o kernel.org agora.`
