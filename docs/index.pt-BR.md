<p align="center">
  <img src="../assets/logo.png" alt="Logo do ZapBot: um robô anjo, com auréola e asas, piscando e
  fazendo joinha num balão de conversa verde, e uma cara de demônio espiando do lado" width="320">
</p>

# ZapBot

<p align="center">
  <a href="https://github.com/jpereira/zapbot/actions/workflows/ci.yml"><img src="https://github.com/jpereira/zapbot/actions/workflows/ci.yml/badge.svg" alt="Testes"></a>
  <a href="https://github.com/jpereira/zapbot/actions/workflows/containers.yml"><img src="https://github.com/jpereira/zapbot/actions/workflows/containers.yml/badge.svg" alt="Imagem do container"></a>
  <a href="https://github.com/jpereira/zapbot/actions/workflows/docs.yml"><img src="https://github.com/jpereira/zapbot/actions/workflows/docs.yml/badge.svg" alt="Build da documentação"></a>
  <a href="https://github.com/jpereira/zapbot/blob/main/package.json"><img src="https://img.shields.io/github/package-json/v/jpereira/zapbot" alt="Versão"></a>
  <a href="https://github.com/jpereira/zapbot/blob/main/LICENSE"><img src="https://img.shields.io/github/license/jpereira/zapbot" alt="Licença"></a>
  <img src="https://img.shields.io/badge/node-24-339933?logo=nodedotjs&amp;logoColor=white" alt="Node.js 24">
  <a href="https://github.com/jpereira/zapbot/commits/main"><img src="https://img.shields.io/github/last-commit/jpereira/zapbot" alt="Last commit"></a>
  <a href="https://chat.whatsapp.com/LrYlfasTbRx5lBhGdGNj4F?mode=gi_t"><img src="https://img.shields.io/badge/WhatsApp-Entrar%20no%20grupo-25D366?logo=whatsapp&amp;logoColor=white" alt="WhatsApp group"></a>
</p>

> 🇺🇸 **English version: [English](https://jpereira.github.io/zapbot/).**

**O cão de guarda do seu grupo de WhatsApp.** O ZapBot é um bot de WhatsApp auto-hospedado, escrito em Node.js. Ele roda
em cima de uma sessão real do WhatsApp Web, como um *aparelho conectado* da sua própria conta: sem API Business, sem
mensalidade, e as suas mensagens ficam no seu servidor. Você digita comandos em qualquer chat e ele responde
(`/help`, `/show`, `/gpt`, `/qr`...).

## 🆕 Novidades (as boas)

Pois é, a gente andou ocupado. O melhor da última leva:

- 🎙️ **Transcreva qualquer vídeo ou áudio.** Mande um link (Instagram, YouTube, X, TikTok...) ou responda um vídeo ou
  uma nota de voz e receba o **texto da fala**. Roda no seu próprio servidor (faster-whisper), sem conta na OpenAI
  e o áudio não sai de casa. [`/transcribe`](commands/transcribe.md) · [`/get -t`](commands/get.md)
- 📈 **Cotações num comando só.** O `/stocks` agora tem também o dólar, o euro e o USDT (ele substitui o `/rates`), e o `/stocks MSTR` traz o preço, a variação e a faixa de 52 semanas de qualquer ação (MSTR, NVDA, PETR4.SA,
  `^GSPC`...), com alertas como `/stocks MSTR -alert < 90`; o ouro é o `/crypto XAUT`. [`/stocks`](commands/stocks.md) · [`/crypto`](commands/crypto.md)
- 🧮 **Uma calculadora para listas.** Responda uma mensagem como `437 maromba / 351 corrida` (ou uma lista de dívida, com `R$`,
  sinais e o total) com `/calc`: ele lê os números, mostra uma fita com todos e confere o total do texto.
  Também faz `100/2*6` e `((1+7)*8)/2`. [`/calc`](commands/calc.md)
- 📸 **Carrossel do Instagram vira álbum.** O `/get <link>` num post só de fotos manda **todas** no chat
  (`Imagem 1/10`...), a última com o texto do post. [`/get`](commands/get.md)
- 🎨 **Desenhe você e os amigos.** `/draw @me @this desenhe nós dois como piratas` pega as fotos de perfil
  sozinho (`@me` é você, `@this` é o chat, `@reply` é quem você respondeu, e nome solto também vale).
  [`/draw`](commands/draw.md) · [`/gpt`](commands/gpt.md)
- 🎲 **Jogos para o grupo.** Bola 8 mágica, verdade, desafio e trivia, e dá para jogar só respondendo o
  bot. [`/games`](commands/games.md)
- 📣 **Poste no seu Status** (e agende), espie o Recado de qualquer um e mude o seu.
  [`/status`](commands/status.md) · [`/profile`](commands/profile.md)
- 👥 **Controle o grupo pelo chat.** O `/group` mostra e muda nome, descrição, foto e quem pode enviar, e o
  `/group -send admins -for 30m` fecha e reabre sozinho; o `/antitag` e o `/antibadword` apagam o abuso de "marcar
  todo mundo" e as palavras proibidas. [`/group`](commands/group.md) · [`/antitag`](commands/antitag.md) · [`/antibadword`](commands/antibadword.md)
- 🛡️ **Moderação de grupo.** O `/warn` com limite que expulsa e o `/antilink` que apaga link de quem não
  é admin. [`/warn`](commands/warn.md) · [`/antilink`](commands/antilink.md)
- 🔇 **Silêncio por um tempo.** `/mute -for 2h` e os avisos voltam sozinhos. [`/mute`](commands/mute.md)
- 📊 **Relatórios.** O `/usage -all` mostra quem está usando o quê, e o `/whois -id` traz os ids
  escondidos. [`/usage`](commands/usage.md) · [`/whois`](commands/whois.md)
- 🏷️ **Nome no lugar de número.** Os avisos de mensagem apagada, editada e reação agora mostram
  `@Luis`, não `@265472113143884`. [`/show`](commands/show.md)
- 🔌 **API e MCP (experimental).** Mande mensagens e leia as suas notas por scripts ou por um cliente de
  IA. [API e MCP](api.md)
- 🧰 **O `/help` mudou a cara**: o comando em **negrito** e o que ele faz em _itálico_.

```text
/draw @me @this desenhe nós dois como piratas
/transcribe https://www.instagram.com/reel/XXXXXXXX/
/transcribe -ss 30 -es 90 https://youtu.be/XXXXXXXXXXX
/stocks MSTR NVDA
/crypto XAUT
/calc 100/2*6
/get https://www.instagram.com/p/XXXXXXXX/            (um carrossel: todas as fotos)
/games -trivia
/warn @Fulano mandou link
/antilink -delete -allow youtube.com
/mute -for 2h /Grupo do trabalho/
/usage -a
```

## ✨ O que ele faz

| | Habilidade | O que faz | Experimente |
|---|---|---|---|
| 🕵️ | **Recuperar o que foi apagado** | Reexibe as mensagens apagadas e editadas (e os status, e as reações removidas), com a mídia original | [`/show`](commands/show.md) · `/show -e` · `/show -s` |
| 🤖 | **Conversar com o ChatGPT** | Responde perguntas, lê fotos e PDFs, transcreve notas de voz, resume conversas, desenha imagens e GIFs, transforma texto em voz e lê o texto de figuras | [`/gpt`](commands/gpt.md) · [`/tldr`](commands/tldr.md) · [`/draw`](commands/draw.md) · [`/tts`](commands/tts.md) · [`/ocr`](commands/ocr.md) |
| 📱 | **QR Codes** | Gera um QR Code de qualquer texto e lê um quando você responde a foto dele | [`/qr`](commands/qr.md) |
| 🎞️ | **Mídia e figurinhas** | Baixa vídeos e áudios de redes sociais, cria figurinhas (de imagens, vídeos ou texto), memes, GIFs, imagens de código e arte ASCII | [`/get`](commands/get.md) · [`/sticker`](commands/sticker.md) · [`/meme`](commands/meme.md) · [`/giphy`](commands/giphy.md) · [`/carbon`](commands/carbon.md) · [`/ascii`](commands/ascii.md) |
| 🎙️ | **Transcrição de fala** | Transforma a fala de qualquer link, vídeo, áudio ou nota de voz em texto, no seu próprio servidor (sem API, sem custo por minuto); `-ss` e `-es` escolhem um trecho | [`/transcribe`](commands/transcribe.md) · [`/get -t`](commands/get.md#transcrever-a-fala--transcribe) |
| 🔔 | **Vigiar e avisar** | Vigia mensagens por texto ou regex, avisa de cotações de moedas e cripto, de posições DeFi fora da faixa e de contatos que ficaram online, no seu privado, num grupo ou por e-mail | [`/watch`](commands/watch.md) · [`/stocks`](commands/stocks.md) · [`/crypto`](commands/crypto.md) · [`/defi`](commands/defi.md) · [`/monitor`](commands/monitor.md) |
| 📅 | **Agendar e automatizar** | Mensagens avulsas e recorrentes, lembretes, atalhos seus, vários comandos numa mensagem só, anotações com `#tags` e alertas, listas de destinatários | [`/cron`](commands/cron.md) · [`/alias`](commands/alias.md) · [`/batch`](commands/batch.md) · [`/notes`](commands/notes.md) · [`/forward`](commands/forward.md) |
| 👥 | **Gerir grupos** | Marca todo mundo, promove e rebaixa, links de convite, enquetes, boas-vindas e despedidas, silencia e bloqueia | [`/everybody`](commands/everybody.md) · [`/promote`](commands/promote.md) · [`/invite`](commands/invite.md) · [`/poll`](commands/poll.md) · [`/welcome`](commands/welcome.md) · [`/mute`](commands/mute.md) · [`/warn`](commands/warn.md) · [`/antilink`](commands/antilink.md) |
| 📈 | **Mercados** | Dólar e euro contra o real, cripto (BTC, ETH, o ouro como **XAUT**) e **ações e índices** (MSTR, NVDA, PETR4.SA, o S&P 500), com alertas quando o preço cruza o valor que você definir | [`/crypto`](commands/crypto.md) · [`/stocks`](commands/stocks.md) |
| 🌎 | **Informação do dia a dia** | Tempo conferido em mais de uma fonte, notícias, CVEs, versões do kernel Linux, tradução e estatísticas do chat | [`/weather`](commands/weather.md) · [`/news`](commands/news.md) · [`/cve`](commands/cve.md) · [`/kernel`](commands/kernel.md) · [`/translate`](commands/translate.md) · [`/stats`](commands/stats.md) |
| 🎲 | **Diversão e jogos** | Bola 8 mágica, verdade, desafio e trivia para o grupo (dá para jogar só respondendo), piadas e os seus amigos desenhados em imagens | [`/games`](commands/games.md) · [`/joke`](commands/joke.md) · [`/draw`](commands/draw.md) |
| 📣 | **Seu perfil e Status** | Posta no seu Status do WhatsApp (e agenda), mostra o recado de qualquer pessoa e troca o seu, exporta seus contatos com fotos | [`/status`](commands/status.md) · [`/profile`](commands/profile.md) · [`/contacts`](commands/contacts.md) |
| 🔌 | **API e MCP (experimental)** | Uma API HTTP local (desligada por padrão) para mandar mensagens e ler as suas notas por scripts, e um servidor MCP experimental para clientes de IA | [API e MCP](api.md) |
| ⭐ | **Pro: limites por pessoa** | Divida o `/gpt` e outros comandos com amigos e grupos, com um limite de chamadas bem-sucedidas por pessoa, por dia, semana ou mês, e o `/usage` para ver o que resta | [`/usage`](commands/usage.md) |
| 🛡️ | **Seu, e seguro** | Papéis de dono, admin e usuário por comando, proteção contra flood, anti-SSRF nos downloads, backups, login do QR Code por e-mail, em inglês ou português do Brasil | [`/bot`](commands/bot.md) · [`/backup`](commands/backup.md) · [`/set`](commands/set.md) |

Todos os comandos, com as opções e os exemplos, estão em [Comandos](commands/index.md).

## ⭐ Pro: deixe os amigos usarem o `/gpt` sem esvaziar o seu crédito

Os comandos mais pedidos em grupos e entre amigos (o `/gpt` principalmente) custam dinheiro a cada
chamada. Com o **limite de uso por pessoa**, você decide quantas chamadas *bem-sucedidas* cada uma
tem, por dia, semana ou mês. Quando acaba, o comando nem roda:

```text
/bot +u /Rafael Silva/ +cmd /gpt +limit 5/dia      → Rafael: 5 chamadas do /gpt por dia
/bot +u +cmd /gpt,/tldr +limit 20/mês              → digitado num grupo: dividido por todos de lá
/bot -limit /gpt /Rafael Silva/                    → tira o limite
```

```text
/gpt qual a capital da França?
🚫 Limite do /gpt atingido: 3 de 3 por dia. Renova em ter 17/11 00:00.

/usage
⏱️ *Limites de uso*
• /gpt  2/3 por dia · renova ter 17/11 00:00
• /tldr  0/3 por dia · renova ter 17/11 00:00
```

Ajuda, uso e erros nunca contam, você e os admins não têm limite, e o histórico está a um
`/usage -l` de distância. Tudo no [`/usage`](commands/usage.md) e no [`/bot`](commands/bot.md#limite-de-uso-por-usuário-limit).

## 👀 Veja funcionando

**Alguém editou uma mensagem? Você ainda tem a original:**

```text
/show -e
✏️ MENSAGEM EDITADA (1/1)

👥 Grupo: Trabalho
👤 Nome: Fulano
📅 Enviada em: 30/09/2026, 11:14:03
✏️ Editada em: 30/09/2026, 11:15:42
📝 Antes: "reunião às 14h"
💬 Depois: "reunião às 15h"
```

**Pergunte ao ChatGPT sobre uma foto, um PDF ou uma nota de voz** (é só responder a ela):

```text
(respondendo a foto de um cachorro)
/gpt qual a raça desse cachorro?
🤖 Parece um labrador retriever, pelo focinho e pelo pelo curto...
```

**QR Codes, nos dois sentidos:**

```text
/qr https://exemplo.com            → manda a imagem do QR Code
(respondendo a foto de um QR Code)
/qr                                → 📱 https://exemplo.com
```

**Um alerta de preço que vem até você:**

```text
/crypto -alert BTC < 90000
🔔 Alerta criado
₿ BTC/USDT abaixo de $90,000.00
💰 Agora: $64,820.55
💡 Aviso no seu privado; verificação a cada 5 minutos.
```

**Seus próprios atalhos, e vários comandos em um:**

```text
/alias dimdim -d "Exibe o preço do dólar" /stocks USD     → cadastra o atalho
/dimdim                                                  → executa o /stocks USD
/alias carteira Orca {/defi orca}\n Prjx {/defi prjx}   → um texto, vários comandos
```

O bot mostra o comando chamado antes do resultado. Os atalhos seguem as permissões dos comandos que chamam, e o
`/help alias` lista os seus.

**Jogos para o grupo, só respondendo:**

```text
/games -trivia
🧠 Trivia

Qual é a capital da Austrália?

A) Sydney
B) Melbourne
C) Camberra
D) Perth

(Rafael responde a ela)  c
✅ Acertou! C) Camberra
```

```text
/games -8ball vai chover no sábado?
🎱 vai chover no sábado?
Não conte com isso.
```

**Poste no seu Status (e agende), com o aviso do risco de banimento:**

```text
/status Bom dia, pessoal! ☀️
📣 Postado no seu Status.

/cron 8h -r d -status Bom dia! {/weather}
🗓️ Agendado para ter 17/11 08:00 🔁 diário para 👤 Status do WhatsApp.
```

**O recado de alguém, e o seu:**

```text
/profile -a /Fulano/
📝 Recado de Fulano <+5521999999999>: Disponível só para emergências

/profile -s Ocupado até segunda
✅ Seu recado agora é: Ocupado até segunda
```

**Quem é quem: os ids do chat e da pessoa** (para preencher um setting, por exemplo):

```text
/whois -id
🆔 IDs
👥 Grupo: 120363012345678901@g.us
• 📞 +5521911111111
  🪪 5521911111111@c.us
```

**Um lembrete, uma mensagem agendada e uma recorrente:**

```text
/cron amanhã 9h -rem ligar pro banco
/cron sexta 18h -to /Família/ O jantar é às 20h!
/cron 8h -r d Hoje: {/weather}
```

**Um retrato do grupo com as fotos de perfil, sem baixar nada:**

```text
/draw -p /Rafael Silva/ /Maria Lucia/ desenhe os dois numa festa de aniversário
/draw @me @this desenhe nós dois como piratas           (no chat com alguém)
/draw @reply desenhe ela como super-heroína             (respondendo a mensagem dela)
🎨 desenhe os dois numa festa de aniversário
```

**A fala de um vídeo, em texto (sem API, roda no seu servidor):**

```text
/transcribe https://www.instagram.com/reel/XXXXXXXX/
⏳ Transcrevendo a fala, pode levar um tempo.
📝 Transcrição · 🗣️ pt · 1:23

oi gente, hoje eu vou mostrar como fazer um pão de queijo bem fofinho em casa...
(reply numa nota de voz)  /transcribe
```

**Seus contatos, com fotos, num arquivo só:**

```text
/contacts
📇 1.248 contatos exportados, com fotos. Enviando o .vcf...
```

**Baixe um vídeo ou só o áudio:**

```text
/get https://youtu.be/dQw4w9WgXcQ
/get -a https://youtu.be/dQw4w9WgXcQ
```

**Fale com o bot pelos seus scripts** (a API local, desligada por padrão; em cima dela há um
servidor MCP experimental para clientes de IA):

```text
$ curl -s -X POST http://127.0.0.1:3100/send \
    -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -d '{"to":"5521999999999","text":"Backup feito ✅"}'
{"ok":true,"to":"5521999999999@c.us"}
```

Veja [API e MCP](api.md).

A ideia vem dos velhos tempos do IRC: o ZapBot é inspirado nas antigas
[eggdrops](https://www.eggheads.org/), os bots que ficavam de plantão nos canais, respondendo a
comandos, guardando o que rolava e cuidando da casa. Aqui o canal é o grupo do WhatsApp, e os
comandos começam com `/`.

## ℹ️ Bom saber

- O ZapBot **não tem vínculo com o WhatsApp nem com a Meta**. Ele usa um cliente não oficial (`whatsapp-web.js`), então o
  WhatsApp pode bloquear contas que automatizam demais: use com cuidado (veja as notas sobre o risco no
  [`/monitor`](commands/monitor.md)).
- **Tudo fica com você**: o banco, as mídias e os backups ficam em `cache/`, no seu servidor. O que sai dele são só as
  consultas aos serviços que você ligar (OpenAI, GIPHY, tempo, notícias...).
- O bot responde em **inglês por padrão**; `/set zapbot.lang pt_BR` troca as respostas para português do Brasil.

## Demonstração

<p align="center">
  <a href="../assets/demo/01-warmup.gif" target="_blank" rel="noopener"><img src="../assets/demo/01-warmup.gif" alt="/ping, /version e /help respondendo" title="01-warmup.gif" width="220"></a>
  <a href="../assets/demo/02-show.gif" target="_blank" rel="noopener"><img src="../assets/demo/02-show.gif" alt="/show reexibindo mensagens apagadas" title="02-show.gif" width="220"></a>
  <a href="../assets/demo/03-monitor.gif" target="_blank" rel="noopener"><img src="../assets/demo/03-monitor.gif" alt="/monitor avisando quando um contato fica online" title="03-monitor.gif" width="220"></a>
  <a href="../assets/demo/05-sticker.gif" target="_blank" rel="noopener"><img src="../assets/demo/05-sticker.gif" alt="/sticker -txt criando figurinhas de texto" title="05-sticker.gif" width="220"></a>
  <a href="../assets/demo/07-crypto.gif" target="_blank" rel="noopener"><img src="../assets/demo/07-crypto.gif" alt="/crypto mostrando a cotação das criptomoedas" title="07-crypto.gif" width="220"></a>
  <a href="../assets/demo/10-watch.gif" target="_blank" rel="noopener"><img src="../assets/demo/10-watch.gif" alt="/watch avisando quando uma mensagem casa com uma regra" title="10-watch.gif" width="220"></a>
</p>

`/ping`, `/show`, `/monitor`, `/sticker -txt`, `/crypto` e `/watch`. Todas as cenas em
[Demonstração](demo.md).

Por onde começar:

- [Instalação](installation.md): requisitos, instalação pela última release e atualização.
- [Configuração](configuration.md): o `config/.env`, as chaves de API e o e-mail.
- [Comandos](commands/index.md): todos os comandos, com opções e exemplos.
- [Operação](operation.md): o dia a dia, a saúde do container e a solução de problemas.

## Como funciona

```text
 ┌────────────── container zapbot (node:24-trixie-slim) ──────────────┐
 │                                                                    │
 │  app.js ──► whatsapp-web.js ──► Puppeteer ──► Chromium             │──► WhatsApp Web
 │    │                                          (headless)           │
 │    ├──► SQLite  (cache/zapbot.db)  mensagens, settings             │
 │    ├──► cache/media  mídias p/ recuperar mensagens apagadas        │
 │    ├──► yt-dlp + ffmpeg  comando /get                              │
 │    ├──► APIs HTTP (axios)  /gpt /weather /cve /news /giphy ...     │
 │    └──► SMTP (nodemailer)  QR Code e alertas por e-mail            │
 │                                                                    │
 │ volumes:  wwebjs_auth  → sessão do WhatsApp (.wwebjs_auth)         │
 │           app_cache    → banco SQLite + mídias (cache/)            │
 └────────────────────────────────────────────────────────────────────┘
```

- **Sessão WhatsApp**: o [`whatsapp-web.js`](https://github.com/wwebjs/whatsapp-web.js) abre o
  WhatsApp Web num Chromium headless e pareia com o seu celular como um *aparelho conectado*. A
  sessão fica salva no volume `wwebjs_auth`, então o QR Code só precisa ser lido na primeira vez (ou
  quando a sessão for revogada). A versão da biblioteca é fixada no `package-lock.json` para
  instalações reproduzíveis. Os ajustes locais ficam em `patches/` e são aplicados pelo
  `scripts/apply-patches.js` durante a instalação, usando `git apply`.
  Para instalar fora do Docker: `PUPPETEER_SKIP_DOWNLOAD=true npm install`.
- **Número do bot = seu número**: o bot age como a conta que leu o QR Code. As mensagens que *você*
  envia (de qualquer aparelho) também passam pelo bot.
- **Persistência**: toda mensagem recebida é gravada no SQLite (mídias vão para `cache/media`).
  Quando alguém apaga uma mensagem "para todos", o bot encontra a cópia no banco e a reenvia **no
  seu privado** (chat consigo mesmo; desative o aviso com `/set show.alert.deleted off`, a mensagem
  continua guardada). Mensagens apagadas ficam guardadas por 30 dias (setting
  `cache.revokedRetentionDays`) e podem ser reexibidas com `/show`. Status (textos/fotos/vídeos)
  apagados também são recuperados, com o título `📸 STATUS APAGADO DETECTADO` e reexibidos com
  `/show -s`. Com `/set show.alert.status off`, novas exclusões de status são ignoradas: não geram
  aviso nem entram na lista de apagados.
- **Editadas**: quando alguém edita uma mensagem, o bot grava o texto de antes e o de depois (tabela
  `message_edits`) e te avisa **no seu privado** com o título `✏️ MENSAGEM EDITADA DETECTADA`
  (desative o aviso com `/set show.alert.edited off`; a edição continua guardada). As edições ficam
  30 dias (setting `cache.editedRetentionDays`) e podem ser reexibidas com
  [`/show -e`](commands/show.md). As suas próprias edições são ignoradas.
- **Reações**: quando alguém remove uma reação (ou troca por outra), o bot te avisa **no seu
  privado** com o título `😶 REAÇÃO REMOVIDA DETECTADA` (ou `🔄 REAÇÃO TROCADA DETECTADA`), com a
  reação de antes e o texto da mensagem reagida (desative o aviso com
  `/set show.alert.reaction off`; a reação continua guardada). Elas ficam 30 dias (setting
  `cache.reactionRetentionDays`) e podem ser reexibidas com [`/show -r`](commands/show.md#reações).
- **Silenciar**: o [`/mute`](commands/mute.md) corta os avisos de apagadas, editadas, status e reações de uma
  pessoa, de um grupo ou de uma comunidade (a mensagem continua guardada); respondendo um aviso,
  silencia de onde ele veio. Quem está silenciado também não gera aviso do `/watch` no seu privado.
  O [`/unmute`](commands/unmute.md) desfaz.
- **Limpeza automática**: a cada 10 minutos o bot remove do banco/disco as mensagens comuns com mais
  de 68 h (janela máxima que o WhatsApp permite apagar; o texto fica mais tempo com o `cache.messageRetentionHours` e as mídias, com o `cache.messageMediaRetentionHours`), as apagadas, as editadas e as reações com
  mais de 30 dias, as ocorrências do `/watch` com mais de 30 dias (setting `watch.hitsRetentionDays`), os
  contadores do `/stats` com mais de 90 dias (setting `stats.retentionDays`), as enquetes com mais
  de 90 dias (setting `poll.retentionDays`) e os avisos ignorados pelo `/mute` com mais de 30
  dias.
- **Monitor de contatos**: o [`/monitor`](commands/monitor.md) consulta até cinco pessoas,
  uma por vez, em ordem aleatória e com espera de 1 a 15 segundos entre consultas. O intervalo
  mínimo por pessoa é de cinco minutos por padrão (`monitor.pool`). Guarda até 30 horários distintos
  por pessoa (`monitor.maxRecords`) nas tabelas `monitor_contacts` e `monitor_history`.
  `/monitor` e `/monitor -l` mostram o histórico observado; `/monitor -l /Maria/` filtra uma pessoa.
  `/monitor -add /Maria/ -alert` ou `/monitor -alert /Maria/` ativa avisos online no privado
  do dono do bot, uma vez por transição observada. `/monitor -rm all` limpa os cadastros
  e históricos locais. `/set monitor.enabled false` pausa as consultas sem apagar dados.
  Horários podem vir do cache e não são confirmados; não há garantia de registrar todos os acessos
  nem de evitar bloqueio da conta pelo WhatsApp.
- **Estatísticas**: cada mensagem nova (e cada apagada/editada) soma 1 num contador por chat, dia,
  hora e remetente (tabela `stats`), usado pelo [`/stats`](commands/stats.md). Só números, sem o
  texto; ficam 90 dias (setting `stats.retentionDays`). As respostas do bot, o seu privado e os
  status não entram. Desligue com `/set stats.enable off`.
- **Alertas de preço**: `/stocks -alert USD > 5.30` e `/crypto -alert BTC < 90000` guardam a
  regra na tabela `price_alerts`; a cada 5 minutos (setting `alert.intervalMin`) o bot consulta os
  preços e avisa **no seu privado** (ou, com um ou vários `-to`, em contatos, grupos, números ou por
  e-mail) quando a regra é cumprida; com o `-msg`, um texto seu vai no início do aviso. Veja
  [Alertas de preço](commands/stocks.md#alertas-de-preço).
- **Anotações**: o [`/notes`](commands/notes.md) guarda textos (e mídias: imagem, documento, áudio, vídeo) na
  tabela `notes`, cada um com um ID e, se quiser, uma `#tag` (a descrição das tags fica em
  `note_tags`). O `-alert` avisa de uma anotação numa data/hora (uma vez; a anotação continua), no
  seu privado ou nos destinos do `-to`, com uma verificação por minuto.
- **DeFi**: o [`/defi`](commands/defi.md) lê on-chain as posições de liquidez da Orca, do Project X e da
  Liquidswap (pela carteira) cadastradas (tabela `defi_positions`) e, com o `-alert`, confere a cada 10
  minutos (setting `defi.alert.intervalMin`) e avisa (no seu privado ou nos destinos do `-to`)
  quando uma posição sai da faixa, quando volta e, com o `-fees`, quando as taxas a coletar passam
  de um valor. O `/defi morpho` e o `/defi aave` mostram a posição, os empréstimos e o risco de uma
  carteira no Morpho (pela API oficial) e no Aave V3 (nos contratos, on-chain).
- **Enquetes**: os votos das enquetes da sua conta (evento `vote_update`) vão para as tabelas
  `polls` e `poll_votes`, e o [`/poll -r`](commands/poll.md#resultado) mostra o placar. Ficam
  90 dias (setting `poll.retentionDays`).
- **Agenda**: os lembretes e as mensagens do [`/cron`](commands/cron.md) ficam na tabela `schedules`; a cada 30 s o bot envia o que venceu (os repetidos
  seguem para o próximo horário). Um `{/comando}` no texto roda na hora do envio e a resposta entra
  no lugar.
- **Status diário**: com [`/bot -status 06h`](commands/bot.md#status-do-bot), um relatório das
  últimas 24 h (no ar, cache, watch, apagadas, editadas, `/mute`) chega todo dia no seu privado.
- **Backup**: todo dia, às 3h (setting `backup.hour`), o bot guarda uma cópia compactada do banco em
  `cache/backups`; o [`/backup`](commands/backup.md) também envia o backup diário ao destino de
  `backup.to`, quando preenchido. O comando lista, restaura e envia os arquivos (no seu privado, por
  e-mail ou, com um ou vários `-to`, noutros chats).
- **Watch**: mensagens recebidas de outras contas, fora dos comandos reconhecidos, são testadas
  contra as regras do [`/watch`](commands/watch.md) (setting `watch.rules`); quando casa, a
  ocorrência é gravada na tabela `watch_hits` e você é avisado **no seu privado** (ou nos destinos
  do `-to` da regra: outros chats ou e-mails). Quem está silenciado no `/mute` não gera o aviso no
  privado; a ocorrência é gravada do mesmo jeito.
- **Configurações (`settings`)**: configurações gerais que podem mudar em tempo de execução (debug,
  moedas do `/crypto`, limites...) ficam na tabela genérica `settings` do SQLite (`key` → `value` em
  JSON) e são alteradas pelo [`/set`](commands/set.md). No boot os valores padrão são gravados, se
  ainda não existirem, e tudo é carregado em memória. Veja [Settings](settings.md).
- **Idioma**: o setting `zapbot.lang` (`en_US`, o padrão, ou `pt_BR`) escolhe o idioma da ajuda,
  das respostas, dos avisos, dos erros, e das datas e números. Veja
  [Idioma](configuration.md#idioma).
- **Comandos**: definidos em
  [`src/commands/definitions/`](https://github.com/jpereira/zapbot/tree/main/src/commands/definitions)
  (nome, aliases, opções, ajuda, permissão) e implementados em `src/commands/` (um arquivo por
  comando; veja [Estrutura do código](development.md#estrutura-do-código)). Os que consultam a
  internet (`/gpt`, `/weather`, `/cve`, `/news`...) usam os serviços da tabela
  [Serviços externos](configuration.md#serviços-externos).
- **Controle**: o [`/bot`](commands/bot.md) mostra o status (o relatório de 24 h e os usuários),
  liga/desliga todos os comandos (`-on`/`-off`) e diz quem usa: você, os
  [admins extras](commands/bot.md#admins-extras) (`+a`/`-a`) e os
  [usuários](commands/bot.md#usuários) (`+u`/`-u`: pessoas e grupos, com os comandos de cada um
  limitados pelo `+cmd`/ `-cmd`, e com comandos `admin` delegados, se quiser); o `-reset` volta ao
  padrão, o `-status 06h` manda o
  relatório todo dia (no seu privado, noutros chats ou por e-mail), o `-info` mostra as versões do
  que o bot usa e o `-test` confere cache, disco, banco,
  WhatsApp, internet, SMTP, IMAP e programas. Quem não é admin tem uma
  [proteção contra flood](commands/bot.md#proteção-contra-flood). O [`/whois`](commands/whois.md)
  diz o nível de cada um no chat.
- **Reconexão**: em caso de queda o cliente é reiniciado sozinho, exceto quando o motivo exige ação
  manual (`LOGOUT`, `CONFLICT`, `UNPAIRED`...). Sem internet, ele tenta de novo, com espera
  crescente, até conectar ([Queda da internet](operation.md#queda-da-internet)).
- **Saúde (heartbeat)**: a cada 30 s o bot confere se o WhatsApp Web responde e grava
  `/tmp/zapbot-heartbeat.json`; o `HEALTHCHECK` do Docker marca o container como `unhealthy` se o
  arquivo parar de ser atualizado. Veja
  [Saúde do container](operation.md#saúde-do-container-heartbeat).
- **Aviso de início**: quando fica pronto, o bot manda
  `🤖 ZapBot <versão> (git+<commit>/<tag ou HEAD>) inicializado.` para o `PHONE_NUMBER` (o commit é o
  do código que está rodando; veja o [`/version`](commands/version.md)).
- **Alertas por e-mail**: crash, queda, reconexão, falha de autenticação e outros eventos também vão
  por e-mail, pelo mesmo SMTP do QR Code (veja [Alertas por e-mail](emails.md#alertas-por-e-mail)).
  Ligado por padrão (setting `email.alerts`).
