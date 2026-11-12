# Comandos

Os comandos são definidos em
[`src/comandos/definicoes/`](https://github.com/jpereira/zapbot/tree/main/src/comandos/definicoes).
Podem ser enviados em **qualquer chat** (privado, grupo ou no chat consigo mesmo).

## Sintaxe geral

```text
/comando [-opção] [-opção valor] [argumentos]
```

- Opções usam **um único hífen** e aceitam o nome longo ou o curto: `-audio` = `-a`, `-startSec 10`
  = `-ss 10`. Um valor com `-` na frente também vale quando é tempo (`-ss -10`: os últimos 10 s).
- Todo comando aceita `-help` / `-h`: `/get -h` mostra a ajuda só dele.
- `/help` lista os comandos que você pode usar (o dono e os admins veem todos); `/help get` ou
  `/help /get` mostram um específico, e `/help -r` agrupa a lista por role (`owner`, `admin` e
  `user`).
- Os comandos têm nome em inglês; os que tinham nome em português o mantêm como alias fixo (`/desenhe`,
  `/tempo`, `/todos`, `/boletos`, `/cotacao`, `/traduzir`, `/enquete`, `/listageral`...). Aliases funcionam igual ao comando original
  (`/download` = `/get`) e não dependem do idioma. O [`/alias`](alias.md) salva
  atalhos com argumentos ou textos com vários `{/comando}`; `/help alias` lista os atalhos
  disponíveis para você.
- O idioma é o setting `zapbot.lang` (`en_US`, o padrão, ou `pt_BR`; veja
  [Idioma](../configuracao.md#idioma)). Hoje ele traduz o `-h` e o `/help`; as respostas dos
  comandos ainda estão em português e estão sendo migradas.
- Basta digitar o começo do comando: `/wat` ou `/watc` viram `/watch`. Se o começo servir para mais
  de um (`/wa`), o bot responde com os possíveis comandos (`/walissu, /watch`). O nome exato e os
  atalhos do `/alias` têm prioridade.

## Destinos: contato, grupo, número ou e-mail

Os comandos com envio a destinos usam **`-to`**: o [`/cron`](cron.md), os alertas do
[`/rates`](rates.md#avisar-em-outro-chat-ou-por-e-mail) e do [`/crypto`](crypto.md), o
[`/defi -alerta`](defi.md#alerta-de-saída-da-faixa), o [`/watch`](watch.md#avisar-em-outro-lugar) e
o [`/backup -send`](backup.md#enviar-o-arquivo). O `/bot -status` também aceita `-to`. Esses
comandos aceitam vários `-to`: o aviso (ou a mensagem, ou o arquivo) sai em cada destino. O alvo do
[`/mute`](mute.md), as pessoas do [`/bot +a`/`+u`](bot.md#admins-extras) e do [`/whois`](whois.md)
usam a mesma busca. Sem `-to`, os avisos (e o arquivo do `/backup`) vão para o seu privado, e o
`/cron`, para o chat atual.

| Forma | Exemplo | Encontra |
|---|---|---|
| Nome | `/Jorge Pereira/`, `"Jorge Pereira"` ou `Jorge` | Busca contatos e grupos; nomes exatos têm prioridade, e contatos ganham em caso de empate. O seu próprio nome (o salvo na agenda ou o do seu perfil) é o seu privado |
| Grupo | `/Grupo L200/`, `"Grupo L200"` ou `L200` | O grupo, com prioridade para o nome exato |
| Menção | `@Fulano` (escolhido na lista do `@` do WhatsApp) | A pessoa mencionada. Útil num grupo, para quem não está na sua agenda. Um `@número` digitado, sem ser menção, é recusado |
| Número | `+5521999999999` | O privado do número: DDI + DDD + número (o `+` é opcional; o bot confere se ele está no WhatsApp) |
| E-mail | `email`, `voce@exemplo.com` ou `"a@x.com, b@y.com"` | Nos alertas (`/rates`, `/crypto` e `/defi`), no `/watch`, no `/bot -status` e no `/backup -send`: `email` é o `QRCODE_EMAIL_SMTP_TO`; sai pelo SMTP do bot, sem a formatação do WhatsApp ([E-mails](../emails.md)) |

O `/debug` usa `-copy-to` para copiar logs a um chat, sem aceitar e-mail. O `/watch -in` seleciona a
origem das mensagens: contato, grupo ou canal `@newsletter`.

As mesmas formas, num comando só:

```text
/cron 8h -r diario -to /Jorge Pereira/ -to @Fulano Da Silva -to /Grupo L200/ -to +5521999999999 Bom dia!
/rates -alerta USD > 5.30 -to email           → por e-mail (o QRCODE_EMAIL_SMTP_TO)
/crypto -alerta BTC < 90000 -to /Grupo L200/ -to email  → no grupo e por e-mail
/mute @Fulano Da Silva                          → o alvo do /mute, mencionando
/bot +a /Jorge Pereira/ +5511988887777         → o /bot +a (e o +u) aceita várias pessoas de uma vez
```

- **Menção:** num grupo, digite `@` e escolha a pessoa na lista do WhatsApp. No texto da mensagem
  ela vira um id (`@100000000000002`), e o bot pega a pessoa pelo id que o WhatsApp manda junto.
  Serve para quem está no grupo mas não na sua agenda. Um `@número` digitado à mão, sem escolher na
  lista, é recusado: para um número, use o `+5521999999999`.
- O `/cron` e o `/mute` não aceitam e-mail: a mensagem do `/cron` sai no WhatsApp, e o `/mute`
  silencia uma pessoa ou um grupo. Os admins (`/bot +a`) e o `/whois` aceitam só pessoas (contato,
  menção ou número); os usuários (`/bot +u`), pessoas e grupos.
- O nome casa quando tem **todas** as palavras, em qualquer ordem, sem diferenciar maiúsculas nem
  acentos. No `-to`, nomes com espaço vão entre `/.../` ou aspas (sem eles, só a primeira palavra
  conta); no `/mute`, o alvo é o resto do texto, com ou sem `/.../`.
- O nome **inteiro igual** ganha de um que só contém as palavras (e um contato ganha de um grupo).
- Se mais de um servir, o bot lista e espera você **responder só com o nº**, no mesmo chat, em até 2
  minutos:

```text
/mute /Jorge/
🔎 "Jorge" corresponde a 2 contatos:

1. 👤 Jorge Pereira · +5521999999999
2. 👤 Jorge Silva · +5511988888888

💡 Responda só com o nº (em até 2 minutos), ou repita o comando com mais palavras do nome.

1
🔇 Silenciado: 👤 Jorge Pereira — apagadas, editadas, status
```

Sem resposta em 2 minutos, nada é feito, e a própria lista vira o aviso (sem outra mensagem):
`⌛ Nenhum nº escolhido para "Jorge" em 2 minutos: nada foi feito.`

## Permissões (`role`)

Quem digita e cada comando têm o mesmo nível: **owner > admin > user**. Um comando só roda para
quem tem o nível dele ou um acima.

| Nível | Quem é | Como entra |
|---|---|---|
| `owner` | Você: a conta pareada ao bot, de qualquer aparelho | Já é |
| `admin` | Os admins extras (setting `bot.admins`) | `/bot +a /Jorge Pereira/`, `@Fulano Da Silva` ou `+5521999999999` (veja [Admins extras](bot.md#admins-extras)) |
| `user` | As pessoas e os grupos do setting `bot.users` | `/bot +u /Maria Lucia/ /Grupo Familia/` (veja [Usuários](bot.md#usuários)) |

O `role` de um comando (a coluna Role da tabela, e o `role` da definição) é o nível mínimo para
usá-lo:

| Role | Quem usa |
|---|---|
| `user` | Qualquer um dos três: os comandos comuns (`/get`, `/weather`, `/sticker`...) |
| `admin` | Os admins e o dono (`/set`, `/alias`, `/backup`...) |
| `admin` · delegável | Os admins e o dono, e o dono pode **delegar** a um usuário (ou a um grupo), citando o comando num `+cmd` ("Apenas"): `/bot +u +cmd /gpt` |
| `owner` | Só o dono (hoje nenhum comando; as opções do `/bot` que mexem em quem tem acesso são do dono) |

Só o dono mexe em quem tem acesso: `+a`/`-a`, `+u`/`-u`, `+cmd`/`-cmd`, `-reset`, `-passwd` e
`-flush-email`. Um admin extra não promove ninguém, nem a si mesmo. Se alguém tentar um comando
acima do nível dele, nada acontece no chat; com o [debug](debug.md) ligado, você recebe um aviso no
`PHONE_NUMBER`:

```text
⚠️ Fulano tentou executar /show dentro de Família, mas sem permissão
```

Os comandos `user` são de quem estiver no setting `bot.users`, que **vem `false`**: só você (e os
admins extras) usa comandos. Com `/bot +u /Maria Lucia/ /Grupo Familia/`, essas pessoas (em qualquer
chat) e esses grupos (qualquer um, dentro do grupo) também usam; o `/bot +u` de uma pessoa digitado
num grupo vale só nesse grupo; com `/set bot.users true`, todos. O `/bot +cmd`/ `-cmd` limita os
comandos de cada usuário. Veja [Usuários](bot.md#usuários). Para saber o seu nível (ou, sendo dono
ou admin, o de alguém), use o [`/whois`](whois.md). Quem não é admin tem uma
[proteção contra flood](bot.md#proteção-contra-flood): o mesmo comando, no máximo 3 vezes em 2
segundos.

### Delegando um comando admin

Um comando `admin` **delegável** (a tabela Resumo marca) entra na regra do usuário só se for citado
num `+cmd` ("Apenas"). O `-cmd` ("Todos, menos") e o `bot.users = true` **não** o liberam, e o
`/bot +cmd` recusa um comando que o dono não delega (`/set`, `/bot`...).

```text
/bot +u +cmd /gpt                 → digitado no grupo Familia: todos ali usam só o /gpt
/bot +u +cmd /gpt /Familia/       → o mesmo, de qualquer chat
/bot +cmd /show /Sofia Izabel/    → a Sofia (que já tem "Apenas") ganha o /show
/bot +u +cmd /rates,/gpt /Sofia Izabel/   → a Sofia usa os comuns citados e o /gpt
```

Mesmo delegado, o comando não **ajusta** nada para um usuário: as opções que trocam um setting ou
apagam dados (`/gpt -model <modelo>`, `/stats -flush`, `/show -flush`...) respondem
`⛔ Apenas o dono do bot (ou um admin) pode ...`. Só o dono e os admins ajustam.

Quem recebe o comando também vê **só o chat atual**: o que olha outros chats ou o seu privado
responde `⛔ Apenas o dono do bot (ou um admin) pode ver outros chats.`

<!-- gerado:limites -->
| Comando | Só o chat atual (fica de fora) | Só o dono e os admins |
|---|---|---|
| `/crypto` |  | `-add`, `-del` |
| `/draw` |  | `-model` |
| `/gpt` |  | `-model`, `-img`, `-gif`, `-audio`, `-prices`, `-usage` |
| `/profile` | `[/contato/\|@menção\|+número]...` |  |
| `/rates` |  | `-add`, `-del` |
| `/show` | `-list`, `chat` | `-flush` |
| `/stats` | `-list`, `-me`, `</chat/>` | `-flush`, `-flush-all` |
| `/tldr` | `-chat`, `-pv` |  |
<!-- /gerado:limites -->

Quem já usa todos os comuns (sem regra, ou "Todos, menos") não ganha um `admin` com o `+cmd`: o bot
recusa e pede a lista "Apenas" com os comandos dele. Os atalhos do [`/alias`](alias.md) seguem o
destino: quem pode o `/gpt` usa os atalhos para ele, e o nome de um atalho não entra no `+cmd`.

<!-- gerado:roles -->
### Comandos por role

**user** (de quem está no `bot.users`) (23):

[`/ascii`](ascii.md), [`/bills`](bills.md), [`/crypto`](crypto.md), [`/cve`](cve.md),
[`/get`](get.md), [`/giphy`](giphy.md), [`/help`](help.md), [`/joke`](joke.md),
[`/kernel`](kernel.md), [`/me`](me.md), [`/meme`](meme.md), [`/news`](news.md),
[`/noffa`](noffa.md), [`/ping`](ping.md), [`/pixelart`](pixelart.md), [`/rates`](rates.md),
[`/sticker`](sticker.md), [`/translate`](translate.md), [`/uptime`](uptime.md),
[`/version`](version.md), [`/walissu`](walissu.md), [`/weather`](weather.md), [`/whois`](whois.md)

**admin, delegáveis** (admins e o dono; o dono libera a um usuário com `+cmd`) (9):

[`/draw`](draw.md), [`/everybody`](everybody.md), [`/gpt`](gpt.md), [`/members`](members.md),
[`/poll`](poll.md), [`/profile`](profile.md), [`/show`](show.md), [`/stats`](stats.md),
[`/tldr`](tldr.md)

**admin** (admins e o dono; nunca delegáveis) (19):

[`/alias`](alias.md), [`/backup`](backup.md), [`/batch`](batch.md), [`/block`](block.md),
[`/bot`](bot.md), [`/cache`](cache.md), [`/cron`](cron.md), [`/debug`](debug.md),
[`/defi`](defi.md), [`/join`](join.md), [`/leave`](leave.md), [`/monitor`](monitor.md),
[`/mute`](mute.md), [`/notes`](notes.md), [`/search`](search.md), [`/set`](set.md),
[`/unblock`](unblock.md), [`/unmute`](unmute.md), [`/watch`](watch.md)
<!-- /gerado:roles -->

As **respostas do próprio bot** também saem pela sua conta, mas nunca são tratadas como comando,
mesmo que comecem com `/`. Sem isso, alguém poderia usar um comando que ecoa texto (ex.:
`/noffa /cache -a`) para fazer o bot "digitar" um comando de admin.

## Resumo

| Comando | Aliases | Role | Descrição |
|---|---|:-:|---|
| [`/alias`](alias.md) | | `admin` | Cadastra, lista e remove atalhos para comandos com argumentos ou textos com vários `{/comando}` |
| [`/ascii`](ascii.md) | | `user` | O texto em letras grandes de ASCII, num bloco que cabe na tela do celular |
| [`/backup`](backup.md) | `/bkp` | `admin` | Backup diário local e envio por `backup.to`; lista, detalha, restaura e envia o banco |
| [`/batch`](batch.md) |  | `admin` | Executa vários comandos de uma mensagem só, em sequência (cada linha que começa com um comando abre um bloco), e responde um resumo; `-stop` e `-dry` |
| [`/bills`](bills.md) | `/boletos` | `user` | Sorteia 2 membros para "pagar um boleto" |
| [`/block`](block.md) | `/bloquear` | `admin` | Bloqueia uma ou várias pessoas na sua conta do WhatsApp (respondendo uma mensagem, quem a escreveu); sem nada, lista os bloqueados; `-mask` ofusca telefones |
| [`/bot`](bot.md) | | `admin` | Status do bot (relatório de 24 h e os usuários); liga/desliga os comandos (`-on`/`-off`) e diz quem usa: admins (`+a`/`-a`) e usuários (`+u`/`-u`, em qualquer chat ou só num grupo, e os comandos de cada um com `+cmd`/`-cmd`); `-reset` volta ao padrão; `-status` (`-s`): relatório das últimas 24 h, e `-s 06h` manda todo dia; `-info` (`-i`): versões e sistema; `-test` (`-t`): testa cache, disco, banco, WhatsApp, internet, SMTP e programas |
| [`/cache`](cache.md) | | `admin` | Árvore do cache com tamanhos, contagens de mensagens e limpeza |
| [`/cron`](cron.md) | `/agenda`, `/lembrete` | `admin` | Na hora marcada (`30m`, `às 18h`, `sexta 9h`...): envia uma mensagem (aqui ou com `-to`, em um ou vários chats) ou, como `/lembrete`, um ⏰ lembrete; pode repetir, editar e pausar, e rodar comandos no texto (`{/crypto}`) |
| [`/crypto`](crypto.md) | `/bitcoio`, `/creptomoeda` | `user` | Cotação das criptos ativadas (padrão: BTC, ETH, SOL e HYPE) ou só das pedidas (`BTC ETH`); alertas de preço |
| [`/cve`](cve.md) | | `user` | Últimas CVEs publicadas (NVD); `-highscore` só as críticas |
| [`/debug`](debug.md) | `/d`, `/dbg` | `admin` | Logs de debug com níveis, filtro e cópia para chats |
| [`/defi`](defi.md) | | `admin` | Posições de liquidez da Orca e do Project X: saldo, faixa, preço e taxas a coletar, lidos on-chain; `-alerta` avisa quando sai e volta para a faixa e quando as taxas passam de um valor. `liquidswap`: posições de LP na Aptos. `morpho` e `aave`: posição, empréstimos e risco no Morpho e no Aave V3 |
| [`/draw`](draw.md) | `/desenhe`, `/desenha`, `/img` | `admin` · delegável | Desenha uma imagem ou um GIF animado (`-gif`) com o GPT Image (OpenAI); numa foto, edita ou anima |
| [`/everybody`](everybody.md) | `/todos`, `/todes` | `admin` · delegável | Menciona todos do grupo |
| [`/get`](get.md) | `/download` | `user` | Baixa vídeo/áudio de redes sociais ou da mídia respondida |
| [`/giphy`](giphy.md) | `/gif` | `user` | GIF do GIPHY por tag, URL ou ID, enviado em loop |
| [`/gpt`](gpt.md) | `/ai` | `admin` · delegável | Pergunta ao ChatGPT (OpenAI); `-img`, `-gif`, `-voz`, `-prices` e `-usage` |
| [`/help`](help.md) | `/h` | `user` | Menu de ajuda, só com os comandos que quem pediu pode usar |
| [`/join`](join.md) |  | `admin` | Entra em um grupo pelo link de convite (`-info` mostra o grupo sem entrar); `-l` lista os seus grupos |
| [`/joke`](joke.md) | `/piada`, `/humor` | `user` | Piada aleatória em português |
| [`/kernel`](kernel.md) | | `user` | Versões atuais do kernel Linux (kernel.org) |
| [`/leave`](leave.md) |  | `admin` | Sai de um ou mais grupos, pelo nome ou pelo nº da lista; `-l` lista os seus grupos |
| [`/me`](me.md) | | `user` | Envia a mensagem digitada; `{/comando}` roda e a resposta entra no lugar, `\n` quebra a linha |
| [`/members`](members.md) | `/listageral`, `/list` | `admin` · delegável | Lista os membros do grupo |
| [`/meme`](meme.md) | | `user` | Template de meme aleatório (imgflip) |
| [`/monitor`](monitor.md) | | `admin` | 👀 Até 5 contatos, histórico limitado, filtro por contato e alertas de entrada online |
| [`/mute`](mute.md) | `/mudo` | `admin` | Silencia os avisos de apagadas, editadas, status e reações (e os do `/watch`) de uma pessoa, um grupo ou uma comunidade; respondendo um aviso, de onde ele veio |
| [`/news`](news.md) |  | `user` | Manchetes de feeds RSS: `-hack`, `-g1`, `-gazeta`, `-brasil` |
| [`/noffa`](noffa.md) | `/🌈`, `/🏳️‍🌈` | `user` | Enfeita o texto com arco-íris |
| [`/notes`](notes.md) |  | `admin` | Anotações com ID e `#tag` (`-a`, `-l`, `-s`, `-r`): ver com a mídia (`-v`), editar (`-u`), renomear tag (`-m`), descrever tag (`-d`), exportar em PDF (`-e`) e `-alerta` que avisa numa data/hora |
| [`/ping`](ping.md) | | `user` | Verifica se o bot está vivo |
| [`/pixelart`](pixelart.md) | `/ansi`, `/px` | `user` | Arte ANSI/ASCII aleatória (16colo.rs) |
| [`/poll`](poll.md) | `/enquete`, `/quiz` | `admin` · delegável | Cria uma enquete nativa do WhatsApp no chat; `-r` mostra o resultado |
| [`/profile`](profile.md) | `/perfil` | `admin` · delegável | A foto de perfil de um contato, com o nome da sua agenda e o telefone |
| [`/rates`](rates.md) | `/cotacao`, `/cambio` | `user` | Cotação de EUR e USDT (e USD, GBP) contra o real: atual, abertura, fechamento e variação; alertas de preço |
| [`/search`](search.md) | `/buscar` | `admin` | Busca no histórico do WhatsApp Web, não só no cache: neste chat ou, no seu privado, em todos (`-N` para mais); `-mask` ofusca telefones |
| [`/set`](set.md) | `/config` | `admin` | Lista e altera as configurações (settings); `-a`/`-rm` acrescentam e tiram itens das listas (ex.: o `bot.admins` e o `bot.users`) |
| [`/show`](show.md) |  | `admin` · delegável | No privado, lista o cache; reexibe apagadas, edições (`-e`), status (`-s`) e reações removidas ou trocadas (`-r`); `-q` busca (texto ou regex) e `-mask` ofusca telefones |
| [`/stats`](stats.md) |  | `admin` · delegável | Ranking deste chat ou de outro (`/Grupo/`): quem mais fala, apaga e edita, horários de pico; `-me` para as suas, `-l` lista os chats, `-flush` apaga |
| [`/sticker`](sticker.md) |  | `user` | Figurinha de imagem, vídeo ou link (o `/get -st`); com `-txt`, uma figurinha animada de texto |
| [`/tldr`](tldr.md) | `/resumo` | `admin` · delegável | Resume a conversa do chat pelo ChatGPT (`30m`, `2h`, `1d`, `1h30m` ou `300` mensagens; respondendo uma mensagem, a partir dela) |
| [`/translate`](translate.md) | `/traduzir` | `user` | Traduz o texto ou a mensagem respondida pelo Google Translate, sem chave; `-para en` muda o idioma |
| [`/unblock`](unblock.md) |  | `admin` | Desbloqueia uma pessoa: pelo nome, pelo número, pelo nº da lista do `/block` ou respondendo uma mensagem |
| [`/unmute`](unmute.md) |  | `admin` | Desfaz o silêncio do `/mute`: pelo nome, pelo nº da lista, respondendo um aviso ou todos (`-all`) |
| [`/uptime`](uptime.md) | | `user` | Tempo de execução e de conexão |
| [`/version`](version.md) |  | `user` | Versão do bot (mesmo banner do `/uptime`) |
| [`/walissu`](walissu.md) | `/ualisu` | `user` | Walissu CVE BOT: marca 2 membros com uma CVE aleatória |
| [`/watch`](watch.md) |  | `admin` | Regras de texto/regex, com origem opcional em `-in`; lista ocorrências, busca nelas com `-q` e avisa nos destinos de `-to`; `-mask` ofusca telefones e `-mask N` liga o 🔒 na regra N |
| [`/weather`](weather.md) | `/tempo` | `user` | Tempo agora e máx./mín. do dia (Open-Meteo); `/weather 16d` mostra até 16 dias, contando hoje; sem cidade usa `tempo.city` |
| [`/whois`](whois.md) | `/who`, `/id` | `user` | Quem é e o que pode no bot, neste chat: 🤖 dono, 👑 admin, 🗣️ usuário ou 🚫 sem permissão; o dono e os admins veem os outros |
