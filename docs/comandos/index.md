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
- `/help` lista os comandos que você pode usar (o dono e os admins veem
  todos); `/help get` ou `/help /get` mostram um específico.
- Aliases funcionam igual ao comando original (`/download` = `/get`).

## Destinos: contato, grupo, número ou e-mail

"Para onde" é sempre o **`-to`**, em todos os comandos: o [`/cron`](cron.md),
os alertas do [`/cotacao`](cotacao.md#avisar-em-outro-chat-ou-por-e-mail) e do
[`/crypto`](crypto.md), o [`/defi -alerta`](defi.md#alerta-de-saída-da-faixa), o
[`/watch`](watch.md#avisar-em-outro-lugar) e o [`/backup -send`](backup.md#enviar-o-arquivo).
Todos aceitam vários `-to`: o aviso (ou a mensagem, ou o arquivo) sai em cada
destino.
O alvo do [`/mudo`](mudo.md), as pessoas do [`/bot +o`/`+v`](bot.md#admins-extras) e do
[`/whois`](whois.md) usam a mesma busca. Sem `-to`, os avisos (e o
arquivo do `/backup`) vão para o seu privado, e o `/cron`, para o chat atual.

| Forma | Exemplo | Encontra |
|---|---|---|
| Nome | `/Jorge Pereira/`, `"Jorge Pereira"` ou `Jorge` | **Primeiro** um contato da sua agenda, pelo nome salvo; **se nenhum** casar, um grupo de que você participa. O seu próprio nome (o salvo na agenda ou o do seu perfil) é o seu privado |
| Grupo | `/Grupo L200/`, `"Grupo L200"` ou `L200` | O grupo (quando nenhum contato tem essas palavras no nome) |
| Menção | `@Fulano` (escolhido na lista do `@` do WhatsApp) | A pessoa mencionada. Útil num grupo, para quem não está na sua agenda. Um `@número` digitado, sem ser menção, é recusado |
| Número | `+5521999999999` | O privado do número: DDI + DDD + número (o `+` é opcional; o bot confere se ele está no WhatsApp) |
| E-mail | `email`, `voce@exemplo.com` ou `"a@x.com, b@y.com"` | Nos alertas (`/cotacao`, `/crypto` e `/defi`) e no `/backup -send`: `email` é o `QRCODE_EMAIL_SMTP_TO`; sai pelo SMTP do bot, sem a formatação do WhatsApp ([E-mails](../emails.md)) |

As mesmas formas, num comando só:

```
/cron 8h -r diario -to /Jorge Pereira/ -to @Fulano Da Silva -to /Grupo L200/ -to +5521999999999 Bom dia!
/cotacao -alerta USD > 5.30 -to email           → por e-mail (o QRCODE_EMAIL_SMTP_TO)
/crypto -alerta BTC < 90000 -to /Grupo L200/ -to email  → no grupo e por e-mail
/mudo @Fulano Da Silva                          → o alvo do /mudo, mencionando
/bot +o /Jorge Pereira/ +5511988887777         → o /bot +o (e o +v) aceita várias pessoas de uma vez
```

- **Menção:** num grupo, digite `@` e escolha a pessoa na lista do WhatsApp. No
  texto da mensagem ela vira um id (`@100000000000002`), e o bot pega a pessoa
  pelo id que o WhatsApp manda junto. Serve para quem está no grupo mas não na
  sua agenda. Um `@número` digitado à mão, sem escolher na lista, é recusado:
  para um número, use o `+5521999999999`.
- O `/cron` e o `/mudo` não aceitam e-mail: a mensagem do `/cron` sai no
  WhatsApp, e o `/mudo` silencia uma pessoa ou um grupo. Os admins (`/bot +o`)
  e o `/whois` aceitam só pessoas (contato, menção ou número); os usuários
  (`/bot +v`), pessoas e grupos.
- O nome casa quando tem **todas** as palavras, em qualquer ordem, sem
  diferenciar maiúsculas nem acentos. No `-to`, nomes com espaço vão entre
  `/.../` ou aspas (sem eles, só a primeira palavra conta); no `/mudo`, o alvo
  é o resto do texto, com ou sem `/.../`.
- O nome **inteiro igual** ganha de um que só contém as palavras (e um
  contato ganha de um grupo).
- Se mais de um servir, o bot lista e espera você **responder só com o nº**,
  no mesmo chat, em até 2 minutos:

```
/mudo /Jorge/
🔎 "Jorge" corresponde a 2 contatos:

1. 👤 Jorge Pereira · +5521999999999
2. 👤 Jorge Silva · +5511988888888

💡 Responda só com o nº (em até 2 minutos), ou repita o comando com mais palavras do nome.

1
🔇 Silenciado: 👤 Jorge Pereira — apagadas, editadas, status
```

## Permissões (`onlyAdmin`)

Comandos marcados como **admin** só executam quando enviados **pela própria
conta do bot** (você, de qualquer aparelho) ou por um **admin extra**: as
pessoas que você puser no setting `bot.admins`
(`/bot +o /Jorge Pereira/`, `@Fulano Da Silva` ou `+5521999999999`;
veja [Admins extras](bot.md#admins-extras)). Se outra pessoa tentar, nada
acontece no chat; com o [debug](debug.md) ligado, você recebe um
aviso no `PHONE_NUMBER`:

```
⚠️ Fulano tentou executar /show dentro de Família, mas sem permissão
```

Os comandos que não são admin (`/get`, `/tempo`, `/sticker`...) são de quem
estiver no setting `bot.users`, que **vem `false`**: só você (e os admins
extras) usa comandos. Com `/bot -admin` (`bot.users` = `true`), todos usam; com
`/bot +v /Camila Gama/ /Grupo Familia/`, só essas pessoas (em qualquer chat) e
esses grupos (qualquer um, dentro do grupo). Veja [Usuários](bot.md#usuários).
Para saber o seu nível (ou, sendo dono ou admin, o de alguém), use o
[`/whois`](whois.md).

As **respostas do próprio bot** também saem pela sua conta, mas nunca são
tratadas como comando, mesmo que comecem com `/`. Sem isso, alguém poderia
usar um comando que ecoa texto (ex.: `/noffa /cache -a`) para fazer o bot
"digitar" um comando de admin.

## Resumo

| Comando | Aliases | Admin | Descrição |
|---|---|:-:|---|
| [`/backup`](backup.md) | `/bkp` | ✅ | Backup do banco: automático todo dia; lista, detalha, restaura e envia o arquivo |
| [`/boletos`](boletos.md) | | ✅ | Sorteia 2 membros para "pagar um boleto" |
| [`/bot`](bot.md) | | ✅ | Liga/desliga todos os comandos (`-on`/`-off`) e diz quem usa: admins (`+o`/`-o`), usuários (`+v`/`-v`), todos (`-admin`) ou só você (`+admin`); `-reset` volta ao padrão; `-status` (`-s`): relatório das últimas 24 h, e `-s 06h` manda todo dia; `-info` (`-i`): versões e sistema |
| [`/cache`](cache.md) | `/c` | ✅ | Uso e limpeza do cache |
| [`/cotacao`](cotacao.md) | `/cambio` | | Cotação de EUR e USDT (e USD, GBP) contra o real: atual, abertura, fechamento e variação; alertas de preço |
| [`/cron`](cron.md) | `/agenda`, `/lembrete` | ✅ | Na hora marcada (`30m`, `às 18h`, `sexta 9h`...): envia uma mensagem (aqui ou com `-to`, em um ou vários chats) ou, como `/lembrete`, um ⏰ lembrete; pode repetir, editar e pausar, e rodar comandos no texto (`{/crypto}`) |
| [`/crypto`](crypto.md) | `/bitcoio`, `/creptomoeda` | | Cotação das criptos ativadas (padrão: BTC, ETH, SOL e HYPE) ou só das pedidas (`BTC ETH`); alertas de preço |
| [`/cve`](cve.md) | | | Últimas CVEs publicadas (NVD); `-highscore` só as críticas |
| [`/debug`](debug.md) | `/d`, `/dbg` | ✅ | Liga/desliga logs de debug |
| [`/defi`](defi.md) | | ✅ | Posições de liquidez da Orca e do Project X: saldo, faixa, preço e taxas a coletar, lidos on-chain; `-alerta` avisa quando sai e volta para a faixa e quando as taxas passam de um valor |
| [`/enquete`](enquete.md) | `/enq`, `/quiz` | ✅ | Cria uma enquete nativa do WhatsApp no chat; `-r` mostra o resultado |
| [`/get`](get.md) | `/download` | | Baixa vídeo/áudio de redes sociais |
| [`/giphy`](giphy.md) | `/gif` | | GIF aleatório (GIPHY) |
| [`/gpt`](gpt.md) | `/ai` | ✅ | Pergunta ao ChatGPT (OpenAI) |
| [`/help`](help.md) | `/h` | | Menu de ajuda, só com os comandos que quem pediu pode usar |
| [`/joke`](joke.md) | `/piada`, `/humor` | | Piada aleatória em português |
| [`/kernel`](kernel.md) | | | Versões atuais do kernel Linux (kernel.org) |
| [`/listageral`](listageral.md) | `/list` | ✅ | Lista os membros do grupo |
| [`/meme`](meme.md) | | | Template de meme aleatório (imgflip) |
| [`/monitor`](monitor.md) 🚧 | | ✅ | Avisa quando números ficam online *(em desenvolvimento, desabilitado por padrão)* |
| [`/mudo`](mudo.md) | `/m`, `/mute` | ✅ | Silencia os avisos de apagadas, editadas e status de uma pessoa ou grupo |
| [`/news`](news.md) | | ✅ | Manchetes de feeds RSS: `-hack`, `-g1`, `-gazeta`, `-brasil` |
| [`/noffa`](noffa.md) | `/🌈`, `/🏳️‍🌈` | | Enfeita o texto com arco-íris |
| [`/ping`](ping.md) | `/p` | ✅ | Verifica se o bot está vivo |
| [`/pixelart`](pixelart.md) | `/ansi`, `/px` | | Arte ANSI/ASCII aleatória (16colo.rs) |
| [`/set`](set.md) | `/config` | ✅ | Lista e altera as configurações (settings); `-a`/`-rem` acrescentam e tiram itens das listas (ex.: o `bot.admins` e o `bot.users`) |
| [`/show`](show.md) | `/s` | ✅ | Reexibe mensagens apagadas ou editadas (`-e`); `-q` busca pelo texto |
| [`/stats`](stats.md) | | ✅ | Ranking deste chat ou de outro (`/Grupo/`): quem mais fala, apaga e edita, horários de pico; `-me` para as suas, `-l` lista os chats, `-flush` apaga |
| [`/sticker`](sticker.md) | `/st` | | Transforma imagem/vídeo em figurinha; com `-txt`, uma figurinha animada de texto |
| [`/tempo`](tempo.md) | `/t`, `/weather` | | Tempo agora e máx./mín. do dia (Open-Meteo); `/tempo 7d` mostra os próximos 7 dias; sem cidade usa `tempo.city` |
| [`/tldr`](tldr.md) | `/resumo` | ✅ | Resume a conversa do chat pelo ChatGPT (`2h`, `300`...) |
| [`/todos`](todos.md) | `/todes` | ✅ | Menciona todos do grupo |
| [`/traduzir`](traduzir.md) | `/tr`, `/translate` | | Traduz o texto ou a mensagem respondida (Google Translate); `-para en` muda o idioma |
| [`/uptime`](uptime.md) | `/u`, `/up` | ✅ | Tempo de execução e de conexão |
| [`/version`](version.md) | `/ver` | ✅ | Versão do bot (mesmo banner do `/uptime`) |
| [`/walissu`](walissu.md) | `/ualisu` | ✅ | Walissu CVE BOT: marca 2 membros com uma CVE aleatória |
| [`/watch`](watch.md) | `/w` | ✅ | Avisa no seu privado (ou, com um ou vários `-to`, em outros chats ou por e-mail) quando uma mensagem casa com um texto/regex |
| [`/whois`](whois.md) | `/who`, `/id` | | Quem é e o que pode no bot, neste chat: 🤖 dono, 👑 admin, 🗣️ usuário ou 🚫 sem permissão; o dono e os admins veem os outros |
