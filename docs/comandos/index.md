# Comandos

Os comandos são definidos em [`src/comandos/comandos.json`](https://github.com/jpereira/zapbot/blob/main/src/comandos/comandos.json).
Podem ser enviados em **qualquer chat** (privado, grupo ou no chat consigo mesmo).

## Sintaxe geral

```
/comando [-opção] [-opção valor] [argumentos]
```

- Opções usam **um único hífen** e aceitam o nome longo ou o curto:
  `-audio` = `-a`, `-startSec 10` = `-ss 10`.
- Todo comando aceita `-help` / `-h`: `/get -h` mostra a ajuda só dele.
- `/help` lista todos; `/help get` ou `/help /get` mostram um específico.
- Aliases funcionam igual ao comando original (`/download` = `/get`).

## Permissões (`onlyAdmin`)

Comandos marcados como **admin** só executam quando enviados **pela própria
conta do bot** (você, de qualquer aparelho). Se outra pessoa tentar, nada
acontece no chat; com o [debug](debug.md) ligado, você recebe um
aviso no `PHONE_NUMBER`:

```
⚠️ Fulano tentou executar /show dentro de Família, mas sem permissão
```

O **modo admin vem ligado por padrão** (setting `bot.adminMode`): até você
mandar `/bot -admin`, só você usa comandos, inclusive os que não são admin
(`/get`, `/tempo`, `/sticker`...). Desligado, cada comando segue a coluna
*Admin* do [Resumo](#resumo).

As **respostas do próprio bot** também saem pela sua conta, mas nunca são
tratadas como comando, mesmo que comecem com `/`. Sem isso, alguém poderia
usar um comando que ecoa texto (ex.: `/noffa /cache -a`) para fazer o bot
"digitar" um comando de admin.

## Resumo

| Comando | Aliases | Admin | Descrição |
|---|---|:-:|---|
| [`/boletos`](boletos.md) | | ✅ | Sorteia 2 membros para "pagar um boleto" |
| [`/bot`](bot.md) | | ✅ | Liga/desliga todos os comandos (`-on`/`-off`) e o modo admin (`+admin`/`-admin`) |
| [`/cache`](cache.md) | `/c` | ✅ | Uso e limpeza do cache |
| [`/cotacao`](cotacao.md) | `/cambio` | | Cotação de EUR e USDT (e USD, GBP) contra o real: atual, abertura, fechamento e variação; alertas de preço |
| [`/crypto`](crypto.md) | `/bitcoio`, `/creptomoeda` | | Cotação das criptos ativadas (padrão: BTC, ETH, SOL e HYPE); alertas de preço |
| [`/cve`](cve.md) | | | Últimas CVEs publicadas (NVD); `-highscore` só as críticas |
| [`/debug`](debug.md) | `/d`, `/dbg` | ✅ | Liga/desliga logs de debug |
| [`/enquete`](enquete.md) | `/enq`, `/quiz` | ✅ | Cria uma enquete nativa do WhatsApp no chat |
| [`/everyone`](everyone.md) | | ✅ | Menciona todos do grupo |
| [`/get`](get.md) | `/download` | | Baixa vídeo/áudio de redes sociais |
| [`/gif`](gif.md) | | | GIF aleatório (GIPHY) |
| [`/gpt`](gpt.md) | `/ai` | ✅ | Pergunta ao ChatGPT (OpenAI) |
| [`/help`](help.md) | `/h` | | Menu de ajuda |
| [`/joke`](joke.md) | `/piada`, `/humor` | | Piada aleatória em português |
| [`/kernel`](kernel.md) | | | Versões atuais do kernel Linux (kernel.org) |
| [`/listageral`](listageral.md) | `/list` | ✅ | Lista os membros do grupo |
| [`/meme`](meme.md) | | | Template de meme aleatório (imgflip) |
| [`/monitor`](monitor.md) 🚧 | `/m` | ✅ | Avisa quando números ficam online *(em desenvolvimento, desabilitado por padrão)* |
| [`/news`](news.md) | | ✅ | Manchetes de feeds RSS: `-hack`, `-g1`, `-gazeta`, `-brasil` |
| [`/noffa`](noffa.md) | `/🌈`, `/🏳️‍🌈` | | Enfeita o texto com arco-íris |
| [`/ping`](ping.md) | `/p` | ✅ | Verifica se o bot está vivo |
| [`/set`](set.md) | | ✅ | Lista e altera as configurações (settings) |
| [`/show`](show.md) | `/undo`, `/s` | ✅ | Reexibe mensagens apagadas ou editadas (`-e`) |
| [`/stats`](stats.md) | | ✅ | Ranking do chat (quem mais fala, apaga e edita, horários de pico); `-me` para as suas |
| [`/sticker`](sticker.md) | `/st` | | Transforma imagem/vídeo em figurinha |
| [`/tempo`](tempo.md) | `/weather` | | Tempo agora e máx./mín. do dia (Open-Meteo); `/tempo 7d` mostra os próximos 7 dias; sem cidade usa `tempo.city` |
| [`/uptime`](uptime.md) | `/u`, `/up` | ✅ | Tempo de execução e de conexão |
| [`/version`](version.md) | `/ver` | ✅ | Versão do bot (mesmo banner do `/uptime`) |
| [`/walissu`](walissu.md) | `/ualisu` | ✅ | Walissu CVE BOT: marca 2 membros com uma CVE aleatória |
| [`/watch`](watch.md) | `/w` | ✅ | Avisa no seu privado quando uma mensagem casa com um texto/regex |
