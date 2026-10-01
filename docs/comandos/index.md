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

## Destinos: contato, grupo ou número

Os comandos que mandam algo para outro chat ou agem sobre uma pessoa ou um grupo
usam a mesma busca: o `-to` do [`/cron`](cron.md) e dos alertas do
[`/cotacao`](cotacao.md#avisar-outra-pessoa-ou-um-grupo) e do [`/crypto`](crypto.md),
o alvo do [`/mudo`](mudo.md) e o `-send` do [`/defi -alerta`](defi.md).

| Forma | Exemplo | Encontra |
|---|---|---|
| Nome | `/Jorge Pereira/`, `"Jorge Pereira"` ou `Jorge` | **Primeiro** um contato da sua agenda, pelo nome salvo; **se nenhum** casar, um grupo de que você participa |
| Grupo | `/Grupo L200/`, `"Grupo L200"` ou `L200` | O grupo (quando nenhum contato tem essas palavras no nome) |
| Número | `+5521999999999` | O privado do número: DDI + DDD + número (o `+` é opcional; o bot confere se ele está no WhatsApp) |

- O nome casa quando tem **todas** as palavras, em qualquer ordem, sem
  diferenciar maiúsculas nem acentos. Nomes com espaço vão entre `/.../` ou
  aspas; sem eles, só a primeira palavra conta.
- O nome **inteiro igual** ganha de um que só contém as palavras (e um
  contato ganha de um grupo).
- Se mais de um servir, o bot lista e espera você **responder só com o nº**,
  no mesmo chat, em até 2 minutos:

```
/mudo -a /Jorge/
🔎 "Jorge" corresponde a 2 contatos:

1. 👤 Jorge Pereira · +5521999999999
2. 👤 Jorge Silva · +5511988888888

💡 Responda só com o nº (em até 2 minutos), ou repita o comando com mais palavras do nome.

1
🔇 Silenciado: 👤 Jorge Pereira — apagadas, editadas, status
```

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
| [`/backup`](backup.md) | `/bkp` | ✅ | Backup do banco: automático todo dia; lista, detalha, restaura e envia o arquivo |
| [`/boletos`](boletos.md) | | ✅ | Sorteia 2 membros para "pagar um boleto" |
| [`/bot`](bot.md) | | ✅ | Liga/desliga todos os comandos (`-on`/`-off`) e o modo admin (`+admin`/`-admin`) |
| [`/cache`](cache.md) | `/c` | ✅ | Uso e limpeza do cache |
| [`/cotacao`](cotacao.md) | `/cambio` | | Cotação de EUR e USDT (e USD, GBP) contra o real: atual, abertura, fechamento e variação; alertas de preço |
| [`/cron`](cron.md) | `/agenda`, `/lembrete` | ✅ | Na hora marcada (`30m`, `às 18h`, `sexta 9h`...): envia uma mensagem (aqui ou com `-to`) ou, como `/lembrete`, um ⏰ lembrete; pode repetir |
| [`/crypto`](crypto.md) | `/bitcoio`, `/creptomoeda` | | Cotação das criptos ativadas (padrão: BTC, ETH, SOL e HYPE); alertas de preço |
| [`/cve`](cve.md) | | | Últimas CVEs publicadas (NVD); `-highscore` só as críticas |
| [`/debug`](debug.md) | `/d`, `/dbg` | ✅ | Liga/desliga logs de debug |
| [`/defi`](defi.md) | | ✅ | Posições de liquidez da Orca: saldo, faixa, preço e taxas a coletar, lidos on-chain |
| [`/enquete`](enquete.md) | `/enq`, `/quiz` | ✅ | Cria uma enquete nativa do WhatsApp no chat; `-r` mostra o resultado |
| [`/get`](get.md) | `/download` | | Baixa vídeo/áudio de redes sociais |
| [`/giphy`](giphy.md) | `/gif` | | GIF aleatório (GIPHY) |
| [`/gpt`](gpt.md) | `/ai` | ✅ | Pergunta ao ChatGPT (OpenAI) |
| [`/help`](help.md) | `/h` | | Menu de ajuda |
| [`/joke`](joke.md) | `/piada`, `/humor` | | Piada aleatória em português |
| [`/kernel`](kernel.md) | | | Versões atuais do kernel Linux (kernel.org) |
| [`/listageral`](listageral.md) | `/list` | ✅ | Lista os membros do grupo |
| [`/meme`](meme.md) | | | Template de meme aleatório (imgflip) |
| [`/monitor`](monitor.md) 🚧 | | ✅ | Avisa quando números ficam online *(em desenvolvimento, desabilitado por padrão)* |
| [`/mudo`](mudo.md) | `/m`, `/mute` | ✅ | Silencia os avisos de apagadas, editadas e status de uma pessoa ou grupo |
| [`/news`](news.md) | | ✅ | Manchetes de feeds RSS: `-hack`, `-g1`, `-gazeta`, `-brasil` |
| [`/noffa`](noffa.md) | `/🌈`, `/🏳️‍🌈` | | Enfeita o texto com arco-íris |
| [`/ping`](ping.md) | `/p` | ✅ | Verifica se o bot está vivo |
| [`/resumo`](resumo.md) | `/tldr` | ✅ | Resume a conversa do chat pelo ChatGPT (`2h`, `300`...) |
| [`/set`](set.md) | `/config` | ✅ | Lista e altera as configurações (settings) |
| [`/show`](show.md) | `/s` | ✅ | Reexibe mensagens apagadas ou editadas (`-e`) |
| [`/stats`](stats.md) | | ✅ | Ranking do chat (quem mais fala, apaga e edita, horários de pico); `-me` para as suas |
| [`/status`](status.md) | | ✅ | Relatório das últimas 24 h (cache, no ar, watch, apagadas, editadas, `/mudo`); `/status 06h` manda todo dia |
| [`/sticker`](sticker.md) | `/st` | | Transforma imagem/vídeo em figurinha |
| [`/tempo`](tempo.md) | `/t`, `/weather` | | Tempo agora e máx./mín. do dia (Open-Meteo); `/tempo 7d` mostra os próximos 7 dias; sem cidade usa `tempo.city` |
| [`/todos`](todos.md) | `/todes` | ✅ | Menciona todos do grupo |
| [`/traduzir`](traduzir.md) | `/tr`, `/translate` | | Traduz o texto ou a mensagem respondida (Google Translate); `-para en` muda o idioma |
| [`/uptime`](uptime.md) | `/u`, `/up` | ✅ | Tempo de execução e de conexão |
| [`/version`](version.md) | `/ver` | ✅ | Versão do bot (mesmo banner do `/uptime`) |
| [`/walissu`](walissu.md) | `/ualisu` | ✅ | Walissu CVE BOT: marca 2 membros com uma CVE aleatória |
| [`/watch`](watch.md) | `/w` | ✅ | Avisa no seu privado quando uma mensagem casa com um texto/regex |
