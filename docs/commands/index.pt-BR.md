# Comandos

Os comandos são definidos em
[`src/commands/definitions/`](https://github.com/jpereira/zapbot/tree/main/src/commands/definitions).
Podem ser enviados em **qualquer chat** (privado, grupo ou no chat consigo mesmo).

## Sintaxe geral

```text
/comando [-opção] [-opção valor] [argumentos]
```

- Opções usam **um único hífen** e aceitam o nome longo ou o curto: `-audio` = `-a`, `-startSec 10`
  = `-ss 10`. Um valor com `-` na frente também vale quando é tempo (`-ss -10`: os últimos 10 s).
- **Para escrever um texto que parece uma opção**, use uma barra invertida na frente: `\-foo` é o
  texto `-foo`, não uma opção. Vale no meio de qualquer texto, mesmo quando `-foo` é uma opção do
  comando: `/notes #casa comprar leite \-to o mercado` guarda `comprar leite -to o mercado` (sem o `\-to`,
  seria lido como destino), e `/gpt explique \-a` manda `-a` para o ChatGPT. Também vale como valor de
  uma opção (`-msg \-to`). Só conta a `\` logo antes do `-`, no começo da palavra.
- Todo comando aceita `-help` / `-h`: `/get -h` mostra a ajuda só dele. Um comando digitado sem o que ele precisa
  responde só com o *Uso* e a dica do `-h` (sem ❌: faltar parâmetro não é um erro): `/qr` responde
  `*Uso*`, a linha `/qr [-decode|-d] [<texto>]` e `💡 /qr -h para ajuda`.
- `/help` mostra as categorias disponíveis e `/help -f` lista os comandos. Use `/help get` ou
  `/help /get` mostram um específico, e `/help -r` agrupa a lista por role (`owner`, `admin` e
  `user`).
- Os comandos têm nome em inglês e não há aliases fixos: o nome é o mesmo em qualquer idioma. O
  [`/alias`](alias.md) salva os atalhos que você quiser (`/alias tempo /weather`), com argumentos
  ou textos com vários `{/comando}`; `/help alias` lista os atalhos disponíveis para você.
- O idioma é o setting `zapbot.lang` (`en_US`, o padrão, ou `pt_BR`; veja
  [Idioma](../configuration.md#idioma)). Ele traduz o `-h` e o `/help` e também as respostas, os
  avisos, os erros, as datas e os números do bot. As descrições que o `/set` mostra de cada
  setting ainda estão em português.
- Basta digitar o começo do comando: `/wat` ou `/watc` viram `/watch`. Se o começo servir para mais
  de um (`/wa`), o bot responde com os possíveis comandos (`/walissu, /warn, /watch`). O nome exato e os
  atalhos do `/alias` têm prioridade.

## Pipes: `/a | /b`

A saída de um comando pode ser a entrada do próximo: `/a | /b` é o mesmo que responder a resposta do
`/a` com o `/b`, numa linha só.

```text
/stocks -q USD | /tts -q -sp 50 -l -v tugão        → fala a cotação do dólar
/weather -q Lisboa | /translate -to en             → a previsão, em inglês
/draw um gato astronauta | /sticker                → o desenho, como figurinha
/get -a <link> | /stt | /gpt -q resuma em 3 linhas → transcreve o vídeo e resume
/crypto -q BTC | /translate -to en | /tts -l       → três etapas
```

- Só o último comando responde no chat; os anteriores trabalham calados (inclusive os avisos "⏳").
- O que passa adiante é o texto sem as marcas do WhatsApp (`*`, `_`, `~`, `` ` ``) e sem o bloco
  "💡 Dicas", ou a mídia (foto, áudio, vídeo, figurinha) com a legenda: o próximo comando lê isso como a
  mensagem que você respondeu.
- Depois de um `|` vêm os comandos que leem uma mensagem respondida. Texto: `/tts`, `/translate`,
  `/ascii`, `/calc`, `/carbon` e `/screenshot` (um link); mídia: `/ocr`; os dois: `/gpt`, `/draw`,
  `/sticker`, `/stt`, `/get` e `/qr`. Qualquer outro responde com essa lista, e uma foto entregue a quem
  lê texto (ou o contrário) é avisada antes de rodar.
- Um comando que falha (❌, ⚠️) para o pipe com a mensagem dele: o erro não é traduzido nem falado. No
  máximo 4 comandos, e 10 minutos para cada um.
- As permissões são as mesmas de digitar cada comando (e o limite de uso conta cada um); as opções de
  cada comando são conferidas como digitadas (`-h`, opção desconhecida, opções que não combinam).
- Respondendo a uma mensagem com um pipe, ela é a entrada do primeiro comando: responda um áudio com
  `/stt | /translate -to en`.
- Só `" | /comando"` separa: a barra entre espaços e seguida de um comando ou atalho, fora de um
  `{/comando}`. `\|` é a própria barra, e `/alias`, `/cron`, `/me`, `/batch` e `/watch` guardam a barra
  como texto, então um atalho pode salvar um pipe: `/alias /dolarvoz /stocks -q USD | /tts -l`
  (veja [`examples/pipes.zb`](https://github.com/jpereira/zapbot/blob/main/examples/pipes.zb)).

## Destinos: contato, grupo, número ou e-mail

Os comandos com envio a destinos usam **`-to`**: o [`/cron`](cron.md), os alertas do
[`/stocks`](stocks.md#avisar-em-outro-chat-ou-por-e-mail) e do [`/crypto`](crypto.md), o
[`/defi -alert`](defi.md#alerta-de-saída-da-faixa), o [`/watch`](watch.md#avisar-em-outro-lugar) e
o [`/backup -send`](backup.md#enviar-o-arquivo) e os alertas do
[`/notes -alert`](notes.md#alertas) (o `/notes` também usa para enviar uma lista, uma
visualização ou uma exportação). O `/bot -status` também aceita `-to`. Esses
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
| E-mail | `email`, `voce@exemplo.com` ou `"a@x.com, b@y.com"` | Nos alertas (`/stocks`, `/crypto`, `/defi` e `/notes`), no `/watch`, no `/bot -status` e no `/backup -send`: `email` é o `QRCODE_EMAIL_SMTP_TO`; sai pelo SMTP do bot, sem a formatação do WhatsApp ([E-mails](../emails.md)) |

O `/debug` usa `-copy-to` para copiar logs a um chat, sem aceitar e-mail. O `/watch -in` seleciona a
origem das mensagens: contato, grupo ou canal `@newsletter`.

As mesmas formas, num comando só:

```text
/cron 8h -r d -to /Jorge Pereira/ -to @Fulano Da Silva -to /Grupo L200/ -to +5521999999999 Bom dia!
/stocks -alert USD > 5.30 -to email           → por e-mail (o QRCODE_EMAIL_SMTP_TO)
/crypto -alert BTC < 90000 -to /Grupo L200/ -to email  → no grupo e por e-mail
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

💡 Responda só com o nº (em até 2 minutos; 0 cancela), ou repita o comando com mais palavras do nome.

1
🔇 Silenciado: 👤 Jorge Pereira — apagadas, editadas, status, reações
Só o aviso some: as mensagens continuam guardadas para o /show.
💡 Dicas
/mute mostra a lista
/unmute desfaz
```

Para desistir sem esperar, responda `0` (ou `cancelar`):

```text
0
🚫 Cancelado.
```

Na confirmação de sim ou não vale o mesmo: `cancelar` conta como "não".

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
segundos por padrão (`bot.flood.maxCommandRepeated` e `bot.flood.intervalCommand`).

### Delegando um comando admin

Um comando `admin` **delegável** (a tabela Resumo marca) entra na regra do usuário só se for citado
num `+cmd` ("Apenas"). O `-cmd` ("Todos, menos") e o `bot.users = true` **não** o liberam, e o
`/bot +cmd` recusa um comando que o dono não delega (`/set`, `/bot`...).

```text
/bot +u +cmd /gpt                 → digitado no grupo Familia: todos ali usam só o /gpt
/bot +u +cmd /gpt /Familia/       → o mesmo, de qualquer chat
/bot +cmd /show /Sofia Izabel/    → a Sofia (que já tem "Apenas") ganha o /show
/bot +u +cmd /stocks,/gpt /Sofia Izabel/   → a Sofia usa os comuns citados e o /gpt
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
| `/draw` |  | `-model`, `-quality`, `-size` |
| `/gpt` |  | `-model`, `-img`, `-gif`, `-audio`, `-prices`, `-usage` |
| `/profile` | `[/contato/\|@menção\|+número]...` | `-set` |
| `/show` | `-list`, `chat` | `-flush`, `-yes` |
| `/stats` | `-list`, `-me`, `</chat/>` | `-flush`, `-flush-all` |
| `/stocks` |  | `-add`, `-del` |
| `/tldr` | `-chat`, `-private` |  |
<!-- /gerado:limites -->

Quem já usa todos os comuns (sem regra, ou "Todos, menos") não ganha um `admin` com o `+cmd`: o bot
recusa e pede a lista "Apenas" com os comandos dele. Os atalhos do [`/alias`](alias.md) seguem o
destino: quem pode o `/gpt` usa os atalhos para ele, e o nome de um atalho não entra no `+cmd`.

<!-- gerado:roles -->
### Comandos por role

**user** (de quem está no `bot.users`) (32):

[`/ascii`](ascii.md), [`/bills`](bills.md), [`/calc`](calc.md), [`/calendar`](calendar.md),
[`/carbon`](carbon.md), [`/crypto`](crypto.md), [`/cve`](cve.md), [`/games`](games.md),
[`/get`](get.md), [`/giphy`](giphy.md), [`/help`](help.md), [`/joke`](joke.md),
[`/kernel`](kernel.md), [`/me`](me.md), [`/meme`](meme.md), [`/news`](news.md),
[`/noffa`](noffa.md), [`/ocr`](ocr.md), [`/ping`](ping.md), [`/pixelart`](pixelart.md),
[`/qr`](qr.md), [`/sticker`](sticker.md), [`/stocks`](stocks.md), [`/stt`](stt.md),
[`/translate`](translate.md), [`/tts`](tts.md), [`/uptime`](uptime.md), [`/usage`](usage.md),
[`/version`](version.md), [`/walissu`](walissu.md), [`/weather`](weather.md), [`/whois`](whois.md)

**admin, delegáveis** (admins e o dono; o dono libera a um usuário com `+cmd`) (19):

[`/antibadword`](antibadword.md), [`/antilink`](antilink.md), [`/antitag`](antitag.md),
[`/demote`](demote.md), [`/draw`](draw.md), [`/everybody`](everybody.md), [`/goodbye`](goodbye.md),
[`/gpt`](gpt.md), [`/group`](group.md), [`/members`](members.md), [`/poll`](poll.md),
[`/profile`](profile.md), [`/promote`](promote.md), [`/screenshot`](screenshot.md),
[`/show`](show.md), [`/stats`](stats.md), [`/tldr`](tldr.md), [`/warn`](warn.md),
[`/welcome`](welcome.md)

**admin** (admins e o dono; nunca delegáveis) (20):

[`/alias`](alias.md), [`/batch`](batch.md), [`/block`](block.md), [`/bot`](bot.md),
[`/call`](call.md), [`/cron`](cron.md), [`/defi`](defi.md), [`/forward`](forward.md),
[`/invite`](invite.md), [`/join`](join.md), [`/leave`](leave.md), [`/monitor`](monitor.md),
[`/mute`](mute.md), [`/notes`](notes.md), [`/search`](search.md), [`/set`](set.md),
[`/status`](status.md), [`/unblock`](unblock.md), [`/unmute`](unmute.md), [`/watch`](watch.md)

**owner** (só o dono) (5):

[`/backup`](backup.md), [`/cache`](cache.md), [`/contacts`](contacts.md), [`/debug`](debug.md),
[`/web`](web.md)
<!-- /gerado:roles -->

As **respostas do próprio bot** também saem pela sua conta, mas nunca são tratadas como comando,
mesmo que comecem com `/`. Sem isso, alguém poderia usar um comando que ecoa texto (ex.:
`/noffa /cache -a`) para fazer o bot "digitar" um comando de admin.

## Atalhos com o `/alias`

Se você acha que o bot tem parâmetros demais, simplifique com o [`/alias`](alias.md) e deixe do seu
jeito. Cada atalho fica salvo no banco e funciona como um comando:

```text
/alias -q /usd /stocks USD          → mostra o preço do dólar
/alias -q /btc /crypto BTC         → mostra o preço do Bitcoin
/alias -q /clima /weather ${1:-Rio de Janeiro}   → /clima mostra o Rio; /clima Lisboa, Lisboa
/alias /rec /sticker -ss $1 -es $2           → /rec 10 20 <link> executa /sticker -ss 10 -es 20 <link>
/alias -q /tofriends /forward -q /Grupo da Família/ +5521999999999 /Maria Lucia/ /Rafael Silva/   → um atalho para uma lista de /forward
```

`$1`, `$2`... pegam os argumentos digitados ao executar, e `${1:-padrão}` define um valor padrão
(o `/clima` sozinho usa ele; veja [Parâmetros](alias.md#parâmetros-1-n)). Esse é o poder do `/alias`:
digite `/usd` e pronto. O atalho segue as permissões do comando de destino,
e o `/alias /usd` mostra o que um atalho faz.

## Resumo

| Comando | Aliases | Role | Descrição |
|---|---|:-:|---|
| [`/alias`](alias.md) | | `admin` | Cadastra, lista e remove atalhos para comandos com argumentos ou textos com vários `{/comando}` |
| [`/antibadword`](antibadword.md) | | `admin` · delegável | Apaga mensagens de quem não é admin com palavras proibidas (uma lista por grupo) |
| [`/antilink`](antilink.md) | | `admin` · delegável | Apaga links de quem não é admin do grupo |
| [`/antitag`](antitag.md) | | `admin` · delegável | Apaga mensagens de quem não é admin que marcam muita gente |
| [`/ascii`](ascii.md) | | `user` | O texto em letras grandes de ASCII, num bloco que cabe na tela do celular |
| [`/backup`](backup.md) | | `owner` | Backup diário local e envio por `backup.to`; lista, detalha, restaura, envia e apaga o banco |
| [`/batch`](batch.md) | | `admin` | Executa vários comandos de uma mensagem só, em sequência (cada linha que começa com um comando abre um bloco), e responde um resumo; `-stop` e `-dry` |
| [`/bills`](bills.md) | | `user` | Piada: sorteia 2 membros para "pagar um boleto" |
| [`/block`](block.md) | | `admin` | Bloqueia uma ou várias pessoas na sua conta do WhatsApp (respondendo uma mensagem, quem a escreveu); sem nada, lista os bloqueados; `-mask` ofusca telefones |
| [`/bot`](bot.md) | | `admin` | Status do bot (relatório de 24 h e os usuários); liga/desliga os comandos (`-on`/`-off`) e diz quem usa: admins (`+a`/`-a`) e usuários (`+u`/`-u`, em qualquer chat ou só num grupo, e os comandos de cada um com `+cmd`/`-cmd`); `-reset` volta ao padrão; `-status` (`-s`): relatório das últimas 24 h, e `-s 06h` manda todo dia; `-info` (`-i`): versões e sistema; `-test` (`-t`): testa cache, disco, banco, WhatsApp, internet, SMTP, IMAP e programas |
| [`/cache`](cache.md) | | `owner` | Árvore do cache com tamanhos, contagens de mensagens e limpeza |
| [`/calc`](calc.md) | `/math`, `/sum` | `user` | Calcula e soma os números de uma lista: responda "437 maromba / 351 corrida" e leia 788; entende 1.234,56, sinais, mostra a fita do que leu e o `-group` por nome |
| [`/calendar`](calendar.md) | `/cal` | `user` | Um texto com um compromisso vira um evento de agenda |
| [`/call`](call.md) | | `admin` | Recusa ligações de voz e de vídeo e responde com uma mensagem: liga/desliga, muda o texto e quem sempre toca |
| [`/carbon`](carbon.md) | | `user` | O código numa imagem de janela de editor |
| [`/contacts`](contacts.md) | | `owner` | Exporta a sua agenda em vCard (`.vcf`) com nome, número, recado e foto de perfil, pronto para Android e iPhone; fotos em cache em `cache/contacts`. Só no seu próprio privado |
| [`/cron`](cron.md) | | `admin` | Na hora marcada (`30m`, `às 18h`, `sexta 9h`...): envia uma mensagem (aqui ou com `-to`, em um ou vários chats) ou, com `-reminder`, um ⏰ lembrete; pode repetir, editar e pausar, e rodar comandos no texto (`{/crypto}`) |
| [`/crypto`](crypto.md) | | `user` | Cotação das criptos ativadas (padrão: BTC, ETH, SOL e HYPE) ou só das pedidas (`BTC ETH`); alertas de preço |
| [`/cve`](cve.md) | | `user` | Últimas CVEs publicadas (NVD); `-highscore` só as críticas |
| [`/debug`](debug.md) | | `owner` | Logs de debug com níveis, filtro e cópia para chats |
| [`/defi`](defi.md) | | `admin` | Posições de liquidez da Orca e do Project X: saldo, faixa, preço e taxas a coletar, lidos on-chain; `-alert` avisa quando sai e volta para a faixa e quando as taxas passam de um valor. `liquidswap`: posições de LP na Aptos. `morpho` e `aave`: posição, empréstimos e risco no Morpho e no Aave V3 |
| [`/demote`](demote.md) | | `admin` · delegável | Tira o admin de alguém do grupo |
| [`/draw`](draw.md) | | `admin` · delegável | Desenha uma imagem ou um GIF animado (`-gif`) com o ChatGPT (GPT Image); numa foto, edita ou anima |
| [`/everybody`](everybody.md) | | `admin` · delegável | Menciona todos do grupo |
| [`/forward`](forward.md) | | `admin` | Encaminha a mensagem respondida para pessoas, grupos e e-mails (`-to`), só se todos os destinatários forem encontrados |
| [`/games`](games.md) | | `user` | Jogos de grupo: bola 8 mágica, verdade, desafio e quiz |
| [`/get`](get.md) | | `user` | Baixa vídeo/áudio de redes sociais ou da mídia respondida |
| [`/giphy`](giphy.md) | | `user` | GIF do GIPHY por tag, URL ou ID, enviado em loop |
| [`/goodbye`](goodbye.md) | | `admin` · delegável | Mensagem quando alguém sai do grupo (por grupo; `{name}`, `{group}`) |
| [`/gpt`](gpt.md) | | `admin` · delegável | Pergunta ao ChatGPT (OpenAI); `-img`, `-gif`, `-voice`, `-prices`, `-usage` e `-status` (bytes, tokens, custo e saldo) |
| [`/group`](group.md) | | `admin` · delegável | Mostra e muda o grupo: nome, descrição, foto, quem pode enviar, editar e adicionar; `-send admins -for 30m` fecha por um tempo |
| [`/help`](help.md) | | `user` | Menu de ajuda, só com os comandos que quem pediu pode usar |
| [`/invite`](invite.md) | | `admin` | O link de convite do grupo (`-revoke` gera outro) |
| [`/join`](join.md) | | `admin` | Entra em um grupo pelo link de convite (`-info` mostra o grupo sem entrar); `-l` lista os seus grupos |
| [`/joke`](joke.md) | | `user` | Piada aleatória em português |
| [`/kernel`](kernel.md) | | `user` | Versões atuais do kernel Linux (kernel.org) |
| [`/leave`](leave.md) | | `admin` | Sai de um ou mais grupos, pelo nome ou pelo nº da lista; `-l` lista os seus grupos |
| [`/me`](me.md) | | `user` | Envia a mensagem digitada; `{/comando}` roda e a resposta entra no lugar, `\n` quebra a linha |
| [`/members`](members.md) | | `admin` · delegável | Lista os membros do grupo |
| [`/meme`](meme.md) | | `user` | Template de meme aleatório (imgflip) |
| [`/monitor`](monitor.md) | | `admin` | 👀 Até 5 contatos, histórico limitado, filtro por contato e alertas de entrada online |
| [`/mute`](mute.md) | | `admin` | Silencia os avisos de apagadas, editadas, status e reações (e os do `/watch`) de uma pessoa, um grupo ou uma comunidade; respondendo um aviso, de onde ele veio |
| [`/news`](news.md) | | `user` | Manchetes de feeds RSS: `-hack`, `-g1`, `-gazeta`, `-brazil` |
| [`/noffa`](noffa.md) | | `user` | Piada: enfeita o texto com arco-íris |
| [`/notes`](notes.md) | | `admin` | Anotações com ID e `#tag` (`-a`, `-l`, `-s`, `-r`): ver com a mídia (`-v`), editar (`-u`), renomear tag (`-m`), descrever tag (`-d`), exportar em PDF (`-e`), `-alert` que avisa numa data/hora e `-lock`, que protege uma tag com senha (cifrada, só no seu privado) |
| [`/ocr`](ocr.md) | | `user` | O texto de uma foto, lido localmente (Tesseract) ou pelo ChatGPT (`-gpt`) |
| [`/ping`](ping.md) | | `user` | Verifica se o bot está vivo |
| [`/pixelart`](pixelart.md) | | `user` | Arte ANSI/ASCII aleatória (16colo.rs) |
| [`/poll`](poll.md) | | `admin` · delegável | Cria uma enquete nativa do WhatsApp no chat; `-r` mostra o resultado |
| [`/profile`](profile.md) | | `admin` · delegável | A foto de perfil de um contato, com o nome da sua agenda e o telefone |
| [`/promote`](promote.md) | | `admin` · delegável | Torna alguém admin do grupo |
| [`/qr`](qr.md) | | `user` | Gera o QR Code de um texto (`-decode` lê um) |
| [`/screenshot`](screenshot.md) | `/ss` | `admin` · delegável | Uma captura de tela de uma página da web |
| [`/search`](search.md) | | `admin` | Busca no histórico do WhatsApp Web, não só no cache: neste chat ou, no seu privado, em todos (`-N` para mais); `-mask` ofusca telefones |
| [`/set`](set.md) | | `admin` | Lista e altera as configurações (settings); `-a`/`-rm` acrescentam e tiram itens das listas (ex.: o `bot.admins` e o `bot.users`) |
| [`/show`](show.md) | | `admin` · delegável | No privado, lista o cache; reexibe apagadas, edições (`-e`), status (`-s`) e reações removidas ou trocadas (`-r`); `-q` busca (texto ou regex) e `-mask` ofusca telefones |
| [`/stats`](stats.md) | | `admin` · delegável | Ranking deste chat ou de outro (`/Grupo/`): quem mais fala, apaga e edita, horários de pico; `-me` para as suas, `-l` lista os chats, `-flush` apaga |
| [`/status`](status.md) | | `admin` | Posta no seu Status do WhatsApp (texto, foto ou vídeo); o `/cron -status` agenda |
| [`/sticker`](sticker.md) | | `user` | Figurinha de imagem, vídeo ou link (o `/get -st`), respondendo ou na legenda da mídia; com `-txt`, uma figurinha animada de texto |
| [`/stocks`](stocks.md) | | `user` | Cotações do dólar, euro, libra e USDT contra o real, e de ações, ETFs e índices (Yahoo Finance): USD, EUR, MSTR, PETR4.SA, `^GSPC`; `-alert` para alertas de preço |
| [`/stt`](stt.md) | | `user` | Texto da fala de um link, vídeo ou áudio (o `/get -t` é um atalho), respondendo ou na legenda; `-ss` e `-es` escolhem um trecho |
| [`/tldr`](tldr.md) | | `admin` · delegável | Resume a conversa do chat pelo ChatGPT (`30m`, `2h`, `1d`, `1h30m` ou `300` mensagens; respondendo uma mensagem, a partir dela) |
| [`/translate`](translate.md) | | `user` | Traduz o texto ou a mensagem respondida pelo Google Translate, sem chave; `-to en` muda o idioma |
| [`/tts`](tts.md) | | `user` | O texto numa nota de voz, com uma voz local (Piper) ou o ChatGPT (`-gpt`) |
| [`/unblock`](unblock.md) | | `admin` | Desbloqueia uma pessoa: pelo nome, pelo número, pelo nº da lista do `/block` ou respondendo uma mensagem |
| [`/unmute`](unmute.md) | | `admin` | Desfaz o silêncio do `/mute`: pelo nome, pelo nº da lista, respondendo um aviso ou todos (`-all`) |
| [`/uptime`](uptime.md) | | `user` | Tempo de execução e de conexão |
| [`/usage`](usage.md) | | `user` | Os seus limites de uso (definidos pelo dono com o `/bot +limit`): usados, restantes e quando renovam; `-l` mostra as suas últimas chamadas |
| [`/version`](version.md) | | `user` | Versão do bot (mesmo banner do `/uptime`) |
| [`/walissu`](walissu.md) | | `user` | Piada: Walissu CVE BOT: marca 2 membros com uma CVE aleatória |
| [`/warn`](warn.md) | | `admin` · delegável | Avisa alguém no grupo; no limite, a pessoa é removida |
| [`/watch`](watch.md) | | `admin` | Regras de texto/regex, com origem opcional em `-in`; lista ocorrências, busca nelas com `-q` e avisa nos destinos de `-to`; `-mask` ofusca telefones e `-mask N` liga o 🔒 na regra N |
| [`/weather`](weather.md) | | `user` | Tempo agora e máx./mín. do dia (Open-Meteo); `/weather 16d` mostra até 16 dias, contando hoje; sem cidade usa `weather.city` |
| [`/web`](web.md) | | `owner` | Gerencia a interface web e suas sessões |
| [`/welcome`](welcome.md) | | `admin` · delegável | Mensagem quando alguém entra no grupo (por grupo; `{name}`, `{group}`) |
| [`/whois`](whois.md) | | `user` | Quem é e o que pode no bot, neste chat: 🤖 dono, 👑 admin, 🗣️ usuário ou 🚫 sem permissão; o dono e os admins veem os outros |
