# 🤖 ZapBot v1.0.25 (devel)

<p align="center">
  <img src="docs/assets/logo.png" alt="Logo do ZapBot: um robô anjo, com auréola e asas, piscando e
  fazendo joinha num balão de conversa verde, e uma cara de demônio espiando do lado" width="320">
</p>

<p align="center">
  <a href="https://github.com/jpereira/zapbot/actions/workflows/ci.yml"><img src="https://github.com/jpereira/zapbot/actions/workflows/ci.yml/badge.svg" alt="Testes"></a>
  <a href="https://github.com/jpereira/zapbot/actions/workflows/containers.yml"><img src="https://github.com/jpereira/zapbot/actions/workflows/containers.yml/badge.svg" alt="Imagem do container"></a>
  <a href="https://github.com/jpereira/zapbot/actions/workflows/docs.yml"><img src="https://github.com/jpereira/zapbot/actions/workflows/docs.yml/badge.svg" alt="Build da documentação"></a>
  <a href="https://github.com/jpereira/zapbot/blob/main/package.json"><img src="https://img.shields.io/github/package-json/v/jpereira/zapbot" alt="Versão"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/jpereira/zapbot" alt="Licença"></a>
  <img src="https://img.shields.io/badge/node-24-339933?logo=nodedotjs&amp;logoColor=white" alt="Node.js 24">
  <a href="https://github.com/jpereira/zapbot/commits/main"><img src="https://img.shields.io/github/last-commit/jpereira/zapbot" alt="Last commit"></a>
  <a href="https://jpereira.github.io/zapbot/pt-BR/"><img src="https://img.shields.io/badge/docs-jpereira.github.io%2Fzapbot-blue?logo=readthedocs&amp;logoColor=white" alt="Documentation"></a>
  <a href="https://chat.whatsapp.com/LrYlfasTbRx5lBhGdGNj4F?mode=gi_t"><img src="https://img.shields.io/badge/WhatsApp-Entrar%20no%20grupo-25D366?logo=whatsapp&amp;logoColor=white" alt="WhatsApp group"></a>
</p>

> 🇺🇸 **English version: [README.md](README.md).** Este é o README em português (pt_BR): a
> documentação e os comandos estão em português do Brasil, e o bot responde em português com
> `/set zapbot.lang pt_BR` (o padrão é `en_US`). A documentação também
> existe em inglês (`docs/` e o site, com seletor de idioma).

**O cão de guarda do seu grupo de WhatsApp.** O ZapBot é um bot de WhatsApp auto-hospedado, escrito em Node.js. Ele roda
em cima de uma sessão real do WhatsApp Web, como um *aparelho conectado* da sua própria conta: sem API Business, sem
mensalidade, e as suas mensagens ficam no seu servidor. Você digita comandos em qualquer chat e ele responde
(`/help`, `/show`, `/gpt`, `/qr`...).

## 🆕 Novidades (as boas)

Pois é, a gente andou ocupado. O melhor da última leva:

- 🎙️ **Transcreva qualquer vídeo ou áudio.** Mande um link (Instagram, YouTube, X, TikTok...) ou responda um vídeo ou
  uma nota de voz e receba o **texto da fala**, ou `-sum` para um **resumo** em cima. Roda no seu próprio servidor
  (faster-whisper), então sem conta da OpenAI e o áudio nunca sai de casa. [`/stt`](docs/commands/stt.md) · [`/get -t`](docs/commands/get.md)
- 📈 **Cotações num comando só.** O `/stocks` traz o dólar, o euro e o USDT (ele substitui o `/rates`) e qualquer ação,
  ETF ou índice (`MSTR`, `NVDA`, `PETR4.SA`, `^GSPC`...), com alertas como `/stocks MSTR -alert < 90`. O `/crypto`
  agora mostra também o preço **em reais** (🇧🇷, direto da Binance) e o ouro como `XAUT`. [`/stocks`](docs/commands/stocks.md) · [`/crypto`](docs/commands/crypto.md)
- 🧮 **Uma calculadora para listas.** Responda `437 maromba / 351 corrida` (ou uma lista de dívida em `R$`, `EUR`,
  `USD`, com sinais e o total) com `/calc`: ele imprime uma fita com cada número e confere o total do texto. Também
  faz `100/2*6` e `((1+7)*8)/2`. [`/calc`](docs/commands/calc.md)
- 📨 **Encaminhe para a sua turma com um reply.** O `/forward` manda a mensagem respondida (com um texto seu em cima, se
  quiser) para contatos, grupos, e-mails ou listas salvas. Crie uma lista e um alias e vira uma palavra:
  `/alias -q nopt /forward -q #nopt`, depois responda `/nopt Olha isso!`. O `-q` é totalmente mudo e o `-s` traz o
  cabeçalho e o resumo. [`/forward`](docs/commands/forward.md)
- 🚫 **Um "não" educado no lugar do silêncio.** Quem digita um comando que não pode usar recebe
  `🚫 Sem permissão para executar /backup, fale com Jorge`, de vez em quando, nunca como flood. Ligue, desligue ou
  mude o texto com `/bot -d`. [`/bot`](docs/commands/bot.md#aviso-de-comando-negado)
- 📸 **Um carrossel do Instagram vira álbum.** O `/get <link>` num post só de fotos manda **todas** (`Imagem 1/10`...),
  a última com o texto do post. [`/get`](docs/commands/get.md)
- 👥 **Controle o grupo pelo chat.** O `/group` mostra e muda nome, descrição, foto e quem pode enviar;
  `/group -send admins -for 30m` fecha e reabre sozinho. [`/group`](docs/commands/group.md)
- 🛡️ **Moderação do grupo.** `/warn` com um limite que remove, `/antilink` para links, `/antitag` contra o abuso de
  "marcar todo mundo" e `/antibadword` para palavrões. [`/warn`](docs/commands/warn.md) · [`/antilink`](docs/commands/antilink.md) · [`/antitag`](docs/commands/antitag.md) · [`/antibadword`](docs/commands/antibadword.md)
- 📵 **Recuse ligações com uma mensagem.** O `/call -on` desliga chamadas de voz e de vídeo e responde com um texto seu
  (`/call -msg ...`), uma vez a cada 10 minutos por pessoa, o `/call -allow` diz quem sempre toca e o `/call -deny /Fulano/ -msg "Agora não!"` recusa sempre alguém, com uma mensagem só dele. [`/call`](docs/commands/call.md)
- 🎨 **Desenhe você e os amigos.** `/draw @me @this desenhe nós dois como piratas` pega as fotos de perfil (`@me`,
  `@this`, `@reply` e nomes comuns). [`/draw`](docs/commands/draw.md) · [`/gpt`](docs/commands/gpt.md)
- 🎲 **Jogos para o grupo.** Bola 8 mágica, verdade, desafio e quiz; dá para jogar só respondendo o bot. [`/games`](docs/commands/games.md)
- 📣 **Poste no seu Status** (e agende), espie o Recado de qualquer um e mude o seu. [`/status`](docs/commands/status.md) · [`/profile`](docs/commands/profile.md)
- 📇 **Sua agenda, exportada.** O `/contacts` gera um vCard com nomes, números e fotos de perfil. [`/contacts`](docs/commands/contacts.md)
- 🔇 **Silencie por um tempo.** `/mute -for 2h` e os avisos voltam sozinhos. [`/mute`](docs/commands/mute.md)
- 📊 **Uso e limites.** O `/usage -all` mostra quem usa o quê, o `/bot +limit` limita cada pessoa, o `/bot -flood` ajusta o
  anti-flood e o `/whois -id` traz os ids escondidos. [`/usage`](docs/commands/usage.md) · [`/whois`](docs/commands/whois.md)
- 🏷️ **Nomes no lugar de números.** Os avisos de mensagens apagadas, editadas e reações mostram `@Luis`, não
  `@265472113143884`. [`/show`](docs/commands/show.md)
- 🔌 **API e MCP (experimental).** Envie mensagens e leia suas notas de scripts ou de um cliente de IA.
  [API e MCP](docs/api.md)

```text
/draw @me @this desenhe nós dois como piratas
/stt https://www.instagram.com/reel/XXXXXXXX/
/stt -sum https://youtu.be/XXXXXXXXXXX
/stt -ss 30 -es 90 https://youtu.be/XXXXXXXXXXX
/stocks MSTR NVDA
/crypto XAUT
/calc 100/2*6
/get https://www.instagram.com/p/XXXXXXXX/            (um carrossel: todas as fotos)
/forward /Família/ #amigos Olha isso!                 (respondendo a mensagem)
/bot -denied Você não pode usar o $cmd aqui. Fale com $admin!
/call -on -msg Não atendo ligações aqui, mande mensagem!
/bot -flood 5/10                                      (no máximo 5 repetições em 10 segundos)
/games -trivia
/warn @Fulano postou um link
/antilink -delete -allow youtube.com
/mute -for 2h /Grupo do Trabalho/
/usage -a
```

## ✨ O que ele faz

| | Habilidade | O que faz | Experimente |
|---|---|---|---|
| 🕵️ | **Recuperar o que foi apagado** | Reexibe as mensagens apagadas e editadas (e os status, e as reações removidas), com a mídia original | [`/show`](docs/commands/show.md) · `/show -e` · `/show -s` |
| 🤖 | **Conversar com o ChatGPT** | Responde perguntas, lê fotos e PDFs, transcreve notas de voz, resume conversas, desenha imagens e GIFs, transforma texto em voz e lê o texto de figuras | [`/gpt`](docs/commands/gpt.md) · [`/tldr`](docs/commands/tldr.md) · [`/draw`](docs/commands/draw.md) · [`/tts`](docs/commands/tts.md) · [`/ocr`](docs/commands/ocr.md) |
| 📱 | **QR Codes** | Gera um QR Code de qualquer texto e lê um quando você responde a foto dele | [`/qr`](docs/commands/qr.md) |
| 🎞️ | **Mídia e figurinhas** | Baixa vídeos e áudios de redes sociais, cria figurinhas (de imagens, vídeos ou texto), memes, GIFs, imagens de código e arte ASCII | [`/get`](docs/commands/get.md) · [`/sticker`](docs/commands/sticker.md) · [`/meme`](docs/commands/meme.md) · [`/giphy`](docs/commands/giphy.md) · [`/carbon`](docs/commands/carbon.md) · [`/ascii`](docs/commands/ascii.md) |
| 🎙️ | **Transcrição de fala** | Transforma a fala de qualquer link, vídeo, áudio ou nota de voz em texto, no seu próprio servidor (sem API, sem custo por minuto); `-ss` e `-es` escolhem um trecho | [`/stt`](docs/commands/stt.md) · [`/get -t`](docs/commands/get.md#transcrever-a-fala--stt) |
| 🔔 | **Vigiar e avisar** | Vigia mensagens por texto ou regex, avisa de cotações de moedas e cripto, de posições DeFi fora da faixa e de contatos que ficaram online, no seu privado, num grupo ou por e-mail | [`/watch`](docs/commands/watch.md) · [`/stocks`](docs/commands/stocks.md) · [`/crypto`](docs/commands/crypto.md) · [`/defi`](docs/commands/defi.md) · [`/monitor`](docs/commands/monitor.md) |
| 📅 | **Agendar e automatizar** | Mensagens avulsas e recorrentes, lembretes, atalhos seus, vários comandos numa mensagem só, anotações com `#tags` e alertas, listas de destinatários | [`/cron`](docs/commands/cron.md) · [`/alias`](docs/commands/alias.md) · [`/batch`](docs/commands/batch.md) · [`/notes`](docs/commands/notes.md) · [`/forward`](docs/commands/forward.md) |
| 👥 | **Gerir grupos** | Marca todo mundo, promove e rebaixa, links de convite, enquetes, boas-vindas e despedidas, silencia e bloqueia | [`/everybody`](docs/commands/everybody.md) · [`/promote`](docs/commands/promote.md) · [`/invite`](docs/commands/invite.md) · [`/poll`](docs/commands/poll.md) · [`/welcome`](docs/commands/welcome.md) · [`/mute`](docs/commands/mute.md) · [`/warn`](docs/commands/warn.md) · [`/antilink`](docs/commands/antilink.md) |
| 📈 | **Mercados** | Dólar e euro contra o real, cripto (BTC, ETH, o ouro como **XAUT**) e **ações e índices** (MSTR, NVDA, PETR4.SA, o S&P 500), com alertas quando o preço cruza o valor que você definir | [`/crypto`](docs/commands/crypto.md) · [`/stocks`](docs/commands/stocks.md) |
| 🌎 | **Informação do dia a dia** | Tempo conferido em mais de uma fonte, notícias, CVEs, versões do kernel Linux, tradução e estatísticas do chat | [`/weather`](docs/commands/weather.md) · [`/news`](docs/commands/news.md) · [`/cve`](docs/commands/cve.md) · [`/kernel`](docs/commands/kernel.md) · [`/translate`](docs/commands/translate.md) · [`/stats`](docs/commands/stats.md) |
| 🎲 | **Diversão e jogos** | Bola 8 mágica, verdade, desafio e trivia para o grupo (dá para jogar só respondendo), piadas e os seus amigos desenhados em imagens | [`/games`](docs/commands/games.md) · [`/joke`](docs/commands/joke.md) · [`/draw`](docs/commands/draw.md) |
| 📣 | **Seu perfil e Status** | Posta no seu Status do WhatsApp (e agenda), mostra o recado de qualquer pessoa e troca o seu, exporta seus contatos com fotos | [`/status`](docs/commands/status.md) · [`/profile`](docs/commands/profile.md) · [`/contacts`](docs/commands/contacts.md) |
| 🔌 | **API e MCP (experimental)** | Uma API HTTP local (desligada por padrão) para mandar mensagens e ler as suas notas por scripts, e um servidor MCP experimental para clientes de IA | [API e MCP](docs/api.md) |
| ⭐ | **Pro: limites por pessoa** | Divida o `/gpt` e outros comandos com amigos e grupos, com um limite de chamadas bem-sucedidas por pessoa, por dia, semana ou mês, e o `/usage` para ver o que resta | [`/usage`](docs/commands/usage.md) |
| 🛡️ | **Seu, e seguro** | Papéis de dono, admin e usuário por comando, proteção contra flood, anti-SSRF nos downloads, backups, login do QR Code por e-mail, em inglês ou português do Brasil | [`/bot`](docs/commands/bot.md) · [`/backup`](docs/commands/backup.md) · [`/set`](docs/commands/set.md) |

Todos os comandos, com as opções e os exemplos, estão em [Comandos](docs/commands/index.md).

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
`/usage -l` de distância. Tudo no [`/usage`](docs/commands/usage.md) e no [`/bot`](docs/commands/bot.md#limite-de-uso-por-usuário-limit).

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
Tem atalhos prontos (cotações, letreiros, traduções, vozes) nos [arquivos `.zb` do GitHub](https://github.com/jpereira/zapbot/tree/main/examples), que o `/alias -examples` carrega.

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
🎨 desenhe os dois numa festa de aniversário
```

**A fala de um vídeo, em texto (sem API, roda no seu servidor):**

```text
/stt https://www.instagram.com/reel/XXXXXXXX/
⏳ Transcrevendo a fala, pode levar um tempo.
📝 Transcrição · 🗣️ pt · 1:23

oi gente, hoje eu vou mostrar como fazer um pão de queijo bem fofinho em casa...
(reply numa nota de voz)  /stt
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

Veja [API e MCP](docs/api.md).

A ideia vem dos velhos tempos do IRC: o ZapBot é inspirado nas antigas
[eggdrops](https://www.eggheads.org/), os bots que ficavam de plantão nos canais, respondendo a
comandos, guardando o que rolava e cuidando da casa. Aqui o canal é o grupo do WhatsApp, e os
comandos começam com `/`.

## ℹ️ Bom saber

- O ZapBot **não tem vínculo com o WhatsApp nem com a Meta**. Ele usa um cliente não oficial (`whatsapp-web.js`), então o
  WhatsApp pode bloquear contas que automatizam demais: use com cuidado (veja as notas sobre o risco no
  [`/monitor`](docs/commands/monitor.md)).
- **Tudo fica com você**: o banco, as mídias e os backups ficam em `cache/`, no seu servidor. O que sai dele são só as
  consultas aos serviços que você ligar (OpenAI, GIPHY, tempo, notícias...).
- O bot responde em **inglês por padrão**; `/set zapbot.lang pt_BR` troca as respostas para português do Brasil.

## Demonstração

<p align="center">
  <a href="docs/assets/demo/01-warmup.gif" target="_blank" rel="noopener"><img src="docs/assets/demo/01-warmup.gif" alt="/ping, /version e /help respondendo" title="01-warmup.gif" width="220"></a>
  <a href="docs/assets/demo/02-show.gif" target="_blank" rel="noopener"><img src="docs/assets/demo/02-show.gif" alt="/show reexibindo mensagens apagadas" title="02-show.gif" width="220"></a>
  <a href="docs/assets/demo/03-monitor.gif" target="_blank" rel="noopener"><img src="docs/assets/demo/03-monitor.gif" alt="/monitor avisando quando um contato fica online" title="03-monitor.gif" width="220"></a>
  <a href="docs/assets/demo/05-sticker.gif" target="_blank" rel="noopener"><img src="docs/assets/demo/05-sticker.gif" alt="/sticker -txt criando figurinhas de texto" title="05-sticker.gif" width="220"></a>
  <a href="docs/assets/demo/07-crypto.gif" target="_blank" rel="noopener"><img src="docs/assets/demo/07-crypto.gif" alt="/crypto mostrando a cotação das criptomoedas" title="07-crypto.gif" width="220"></a>
  <a href="docs/assets/demo/10-watch.gif" target="_blank" rel="noopener"><img src="docs/assets/demo/10-watch.gif" alt="/watch avisando quando uma mensagem casa com uma regra" title="10-watch.gif" width="220"></a>
</p>

`/ping`, `/show`, `/monitor`, `/sticker -txt`, `/crypto` e `/watch`. Todas as cenas em
[Demonstração](docs/demo.md).

📖 **Documentação completa: [jpereira.github.io/zapbot](https://jpereira.github.io/zapbot/pt-BR/)** (da
última release; a do `main` fica em [`docs/`](docs/index.md)).

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

O bot age como a sua própria conta (um *aparelho conectado*), grava as mensagens num SQLite e reage
a comandos digitados em qualquer chat. Detalhes em
[Como funciona](https://jpereira.github.io/zapbot/pt-BR/#como-funciona).

## Instalação

Precisa só de Docker com o Compose v2, Git e um celular com WhatsApp. A versão estável é a última
release, hoje a `v1.0.24`:

```bash
git clone https://github.com/jpereira/zapbot.git
cd zapbot
git checkout v1.0.24

cp config/.env.example config/.env   # preencha o PHONE_NUMBER e o e-mail (veja abaixo)

docker compose -f docker/docker-compose.yml build zapbot
docker compose -f docker/docker-compose.yml up -d zapbot
docker logs -f zapbot
```

No primeiro boot (ou quando a sessão expira), o WhatsApp pede a leitura de um QR Code em **WhatsApp
› Aparelhos conectados › Conectar um aparelho**. Sem e-mail, ele aparece desenhado nos logs
(`docker logs -f zapbot`).

### QR Code por e-mail (recomendado)

Recomendamos receber o QR Code por e-mail, principalmente num servidor: ele chega na sua caixa de
entrada, você abre no computador e lê com o celular, sem precisar entrar no servidor para ver os
logs. O mesmo e-mail traz os alertas de queda, reconexão e crash do bot. No `config/.env`:

```bash
QRCODE_EMAIL_ENABLE="true"
QRCODE_EMAIL_SMTP_HOST="smtp.gmail.com"                # o servidor SMTP do seu provedor
QRCODE_EMAIL_SMTP_PORT="465"                           # SSL (a porta 587 não funciona)
QRCODE_EMAIL_SMTP_USER="minhaconta@gmail.com"          # a conta que envia
QRCODE_EMAIL_SMTP_PASS="abcd efgh ijkl mnop"           # senha de app, não a da conta
QRCODE_EMAIL_SMTP_FROM="ZapBot <minhaconta@gmail.com>" # o mesmo endereço da conta
QRCODE_EMAIL_SMTP_TO="Você <voce@exemplo.com>"         # quem recebe o QR Code
QRCODE_EMAIL_SMTP_ANTIPHISHING="UmaFraseSoSua"         # vai em todo e-mail do bot
```

- **Host, usuário e senha** são os do SMTP de quem **envia** (Gmail, Yahoo, outros provedores com
  SMTP SSL). Use a credencial SMTP exigida pelo provedor; em contas com senha de app, configure essa
  senha.
- **`QRCODE_EMAIL_SMTP_TO`** é o e-mail que vai **receber** o QR Code (e os alertas). Pode ser o
  mesmo da conta que envia.
- O WhatsApp renova o QR de tempos em tempos: cada um chega num e-mail numerado (`#1`, `#2`...), e
  só o mais recente vale.
- O `config/.env` fica fora do git (está no `.gitignore`): a senha não vai para o repositório.
  Troque o código anti-phishing por uma frase só sua: com ele, você reconhece que o e-mail veio
  mesmo do seu bot.

Se algo der errado, volte para `QRCODE_EMAIL_ENABLE="false"` e leia o QR pelos logs. Os detalhes
(provedores, erros comuns) estão em
[Configuração](https://jpereira.github.io/zapbot/pt-BR/configuration/#e-mail-qr-code-e-alertas) e em
[E-mails](https://jpereira.github.io/zapbot/pt-BR/emails/).

### Atualizar

Para atualizar, use `git fetch --tags`, o mesmo `git checkout` (com a release nova) e o build de
novo. O passo a passo (inclusive a versão de desenvolvimento, `main`) está em
[Instalação](https://jpereira.github.io/zapbot/pt-BR/installation/); as variáveis do `config/.env`, em
[Configuração](https://jpereira.github.io/zapbot/pt-BR/configuration/).

## Comandos

Digite no próprio chat. `/help` lista os comandos que você pode usar (`/help -r` agrupa por role);
`/<comando> -h` mostra a ajuda de um. Quem digita e cada comando têm um nível: **owner > admin > user**. A coluna **Role** diz o mínimo
para usar cada comando:

- `owner`: você, a conta pareada ao bot. Só você mexe em quem tem acesso (`/bot +a`, `+u`, `+cmd`).
- `admin`: os admins extras (`/bot +a <pessoa>`) e você. Um comando `admin` marcado como
  **delegável** o dono pode liberar a um usuário ou a um grupo. Ex.: `/bot +u +cmd /gpt`, digitado
  no grupo, libera só o `/gpt` ali. Quem recebe vê só o chat atual e não altera nada (trocar o
  modelo do `/gpt`, apagar estatísticas...).
- `user`: quem estiver no `bot.users` (`/bot +u <pessoa|grupo>`, ou todos com `/set bot.users true`).
  Por padrão, só você usa comandos.

O `/whois` diz o seu nível
([Permissões](https://jpereira.github.io/zapbot/pt-BR/commands/#permissões-role)).

💡 **Parâmetros demais?** Simplifique com o [`/alias`](https://jpereira.github.io/zapbot/pt-BR/commands/alias/)
e deixe o bot do seu jeito:

```text
/alias -q /usd /stocks USD          → mostra o preço do dólar
/alias -q /btc /crypto BTC         → mostra o preço do Bitcoin
/alias -q /clima /weather ${1:-Rio de Janeiro}   → /clima mostra o Rio; /clima Lisboa, Lisboa
/alias /rec /sticker -ss $1 -es $2           → /rec 10 20 <link> executa /sticker -ss 10 -es 20 <link>
/alias -q /tofriends /forward -q /Grupo da Família/ +5521999999999 /Maria Lucia/ /Rafael Silva/   → um atalho para uma lista de /forward
```

`$1`, `$2`... pegam os argumentos digitados ao executar, e `${1:-padrão}` define um valor padrão
(o `/clima` sozinho usa ele). Esse é o poder do `/alias`: digite `/usd` e pronto.

| Comando | Aliases | Role | Descrição |
|---|---|:-:|---|
| [`/alias`](https://jpereira.github.io/zapbot/pt-BR/commands/alias/) | | `admin` | Cadastra, lista e remove atalhos para comandos com argumentos ou textos com vários `{/comando}` |
| [`/antibadword`](https://jpereira.github.io/zapbot/pt-BR/commands/antibadword/) | | `admin` · delegável | Apaga mensagens de quem não é admin com palavras proibidas (uma lista por grupo) |
| [`/antilink`](https://jpereira.github.io/zapbot/pt-BR/commands/antilink/) | | `admin` · delegável | Apaga links de quem não é admin do grupo |
| [`/antitag`](https://jpereira.github.io/zapbot/pt-BR/commands/antitag/) | | `admin` · delegável | Apaga mensagens de quem não é admin que marcam muita gente |
| [`/ascii`](https://jpereira.github.io/zapbot/pt-BR/commands/ascii/) | | `user` | O texto em letras grandes de ASCII, num bloco que cabe na tela do celular |
| [`/backup`](https://jpereira.github.io/zapbot/pt-BR/commands/backup/) | | `admin` | Backup diário local e envio por `backup.to`; lista, detalha, restaura, envia e apaga o banco |
| [`/batch`](https://jpereira.github.io/zapbot/pt-BR/commands/batch/) | | `admin` | Executa vários comandos de uma mensagem só, em sequência (cada linha que começa com um comando abre um bloco), e responde um resumo; `-stop` e `-dry` |
| [`/bills`](https://jpereira.github.io/zapbot/pt-BR/commands/bills/) | | `user` | Piada: sorteia 2 membros para "pagar um boleto" |
| [`/block`](https://jpereira.github.io/zapbot/pt-BR/commands/block/) | | `admin` | Bloqueia uma ou várias pessoas na sua conta do WhatsApp (respondendo uma mensagem, quem a escreveu); sem nada, lista os bloqueados; `-mask` ofusca telefones |
| [`/bot`](https://jpereira.github.io/zapbot/pt-BR/commands/bot/) | | `admin` | Status do bot (relatório de 24 h e os usuários); liga/desliga os comandos (`-on`/`-off`) e diz quem usa: admins (`+a`/`-a`) e usuários (`+u`/`-u`, em qualquer chat ou só num grupo, e os comandos de cada um com `+cmd`/`-cmd`); `-reset` volta ao padrão; `-status` (`-s`): relatório das últimas 24 h, e `-s 06h` manda todo dia; `-info` (`-i`): versões e sistema; `-test` (`-t`): testa cache, disco, banco, WhatsApp, internet, SMTP, IMAP e programas; `-flush-email [true]`: conta e limpa as mensagens de Sent e Trash; `-passwd <senha\|off>` (dono) e `-login <senha>`: quem é de fora vira admin com a senha |
| [`/cache`](https://jpereira.github.io/zapbot/pt-BR/commands/cache/) | | `admin` | Árvore do cache com tamanhos, contagens de mensagens e limpeza |
| [`/calc`](https://jpereira.github.io/zapbot/pt-BR/commands/calc/) | `/math`, `/sum` | `user` | Calcula e soma os números de uma lista: responda "437 maromba / 351 corrida" e leia 788; entende 1.234,56, sinais, mostra a fita do que leu e o `-group` por nome |
| [`/call`](https://jpereira.github.io/zapbot/pt-BR/commands/call/) | | `admin` | Recusa ligações de voz e de vídeo e responde com uma mensagem: liga/desliga, muda o texto e quem sempre toca |
| [`/carbon`](https://jpereira.github.io/zapbot/pt-BR/commands/carbon/) | | `user` | O código numa imagem de janela de editor |
| [`/contacts`](https://jpereira.github.io/zapbot/pt-BR/commands/contacts/) | | `owner` | Exporta a sua agenda em vCard (`.vcf`) com nome, número, recado e foto de perfil, pronto para Android e iPhone. Só no seu próprio privado |
| [`/cron`](https://jpereira.github.io/zapbot/pt-BR/commands/cron/) | | `admin` | Na hora marcada (`30m`, `às 18h`, `sexta 9h`...): envia uma mensagem (aqui ou com `-to`, em um ou vários chats) ou, com `-reminder`, um ⏰ lembrete; pode repetir, editar e pausar, e rodar comandos no texto (`{/crypto}`) |
| [`/crypto`](https://jpereira.github.io/zapbot/pt-BR/commands/crypto/) | | `user` | Cotação das criptos ativadas (padrão: BTC, ETH, SOL e HYPE) ou só das pedidas (`BTC ETH`); alertas de preço |
| [`/cve`](https://jpereira.github.io/zapbot/pt-BR/commands/cve/) | | `user` | Últimas CVEs publicadas (NVD); `-highscore` só as críticas |
| [`/debug`](https://jpereira.github.io/zapbot/pt-BR/commands/debug/) | | `admin` | Logs de debug com níveis, filtro e cópia para chats |
| [`/defi`](https://jpereira.github.io/zapbot/pt-BR/commands/defi/) | | `admin` | Posições de liquidez da Orca e do Project X: saldo, faixa, preço e taxas a coletar, lidos on-chain; `-alert` avisa quando sai e volta para a faixa e quando as taxas passam de um valor. `liquidswap`: posições de LP na Aptos. `morpho` e `aave`: posição, empréstimos e risco no Morpho e no Aave V3 |
| [`/demote`](https://jpereira.github.io/zapbot/pt-BR/commands/demote/) | | `admin` · delegável | Tira o admin de alguém do grupo |
| [`/draw`](https://jpereira.github.io/zapbot/pt-BR/commands/draw/) | | `admin` · delegável | Desenha uma imagem ou um GIF animado (`-gif`) com o ChatGPT (GPT Image); numa foto, edita ou anima |
| [`/everybody`](https://jpereira.github.io/zapbot/pt-BR/commands/everybody/) | | `admin` · delegável | Menciona todos do grupo |
| [`/forward`](https://jpereira.github.io/zapbot/pt-BR/commands/forward/) | | `admin` | Encaminha a mensagem respondida para pessoas, grupos e e-mails (`-to`), só se todos os destinatários forem encontrados |
| [`/games`](https://jpereira.github.io/zapbot/pt-BR/commands/games/) | | `user` | Jogos de grupo: bola 8 mágica, verdade, desafio e quiz |
| [`/get`](https://jpereira.github.io/zapbot/pt-BR/commands/get/) | | `user` | Baixa vídeo/áudio de redes sociais ou da mídia respondida |
| [`/giphy`](https://jpereira.github.io/zapbot/pt-BR/commands/giphy/) | | `user` | GIF do GIPHY por tag, URL ou ID, enviado em loop |
| [`/goodbye`](https://jpereira.github.io/zapbot/pt-BR/commands/goodbye/) | | `admin` · delegável | Mensagem quando alguém sai do grupo (por grupo; `{name}`, `{group}`) |
| [`/gpt`](https://jpereira.github.io/zapbot/pt-BR/commands/gpt/) | | `admin` · delegável | Pergunta ao ChatGPT (OpenAI); `-img`, `-gif`, `-voice`, `-prices`, `-usage` e `-status` (bytes, tokens, custo e saldo) |
| [`/group`](https://jpereira.github.io/zapbot/pt-BR/commands/group/) | | `admin` · delegável | Mostra e muda o grupo: nome, descrição, foto, quem pode enviar, editar e adicionar; `-send admins -for 30m` fecha por um tempo |
| [`/help`](https://jpereira.github.io/zapbot/pt-BR/commands/help/) | | `user` | Menu de ajuda, só com os comandos que quem pediu pode usar |
| [`/invite`](https://jpereira.github.io/zapbot/pt-BR/commands/invite/) | | `admin` | O link de convite do grupo (`-revoke` gera outro) |
| [`/join`](https://jpereira.github.io/zapbot/pt-BR/commands/join/) | | `admin` | Entra em um grupo pelo link de convite (`-info` mostra o grupo sem entrar); `-l` lista os seus grupos |
| [`/joke`](https://jpereira.github.io/zapbot/pt-BR/commands/joke/) | | `user` | Piada aleatória em português |
| [`/kernel`](https://jpereira.github.io/zapbot/pt-BR/commands/kernel/) | | `user` | Versões atuais do kernel Linux (kernel.org) |
| [`/leave`](https://jpereira.github.io/zapbot/pt-BR/commands/leave/) | | `admin` | Sai de um ou mais grupos, pelo nome ou pelo nº da lista; `-l` lista os seus grupos |
| [`/me`](https://jpereira.github.io/zapbot/pt-BR/commands/me/) | | `user` | Envia a mensagem digitada; `{/comando}` roda e a resposta entra no lugar, `\n` quebra a linha |
| [`/members`](https://jpereira.github.io/zapbot/pt-BR/commands/members/) | | `admin` · delegável | Lista os membros do grupo |
| [`/meme`](https://jpereira.github.io/zapbot/pt-BR/commands/meme/) | | `user` | Template de meme aleatório (imgflip) |
| [`/monitor`](https://jpereira.github.io/zapbot/pt-BR/commands/monitor/) | | `admin` | 👀 Até 5 contatos, histórico limitado, filtro por contato e alertas de entrada online |
| [`/mute`](https://jpereira.github.io/zapbot/pt-BR/commands/mute/) | | `admin` | Silencia os avisos de apagadas, editadas, status e reações (e os do `/watch`) de uma pessoa, um grupo ou uma comunidade; respondendo um aviso, de onde ele veio |
| [`/news`](https://jpereira.github.io/zapbot/pt-BR/commands/news/) | | `user` | Manchetes de feeds RSS: `-hack`, `-g1`, `-gazeta`, `-brazil` |
| [`/noffa`](https://jpereira.github.io/zapbot/pt-BR/commands/noffa/) | | `user` | Piada: enfeita o texto com arco-íris |
| [`/notes`](https://jpereira.github.io/zapbot/pt-BR/commands/notes/) | | `admin` | Anotações com ID e `#tag` (`-a`, `-l`, `-s`, `-r`): ver com a mídia (`-v`), editar (`-u`), renomear tag (`-m`), descrever tag (`-d`), exportar em PDF (`-e`) e `-alert` que avisa numa data/hora |
| [`/ocr`](https://jpereira.github.io/zapbot/pt-BR/commands/ocr/) | | `admin` · delegável | O texto de uma foto, lido localmente (Tesseract) ou pelo ChatGPT (`-gpt`) |
| [`/ping`](https://jpereira.github.io/zapbot/pt-BR/commands/ping/) | | `user` | Verifica se o bot está vivo |
| [`/pixelart`](https://jpereira.github.io/zapbot/pt-BR/commands/pixelart/) | | `user` | Arte ANSI/ASCII aleatória (16colo.rs) |
| [`/poll`](https://jpereira.github.io/zapbot/pt-BR/commands/poll/) | | `admin` · delegável | Cria uma enquete nativa do WhatsApp no chat; `-r` mostra o resultado |
| [`/profile`](https://jpereira.github.io/zapbot/pt-BR/commands/profile/) | | `admin` · delegável | A foto de perfil de um contato, com o nome da sua agenda e o telefone |
| [`/promote`](https://jpereira.github.io/zapbot/pt-BR/commands/promote/) | | `admin` · delegável | Torna alguém admin do grupo |
| [`/qr`](https://jpereira.github.io/zapbot/pt-BR/commands/qr/) | | `user` | Gera o QR Code de um texto (`-decode` lê um) |
| [`/search`](https://jpereira.github.io/zapbot/pt-BR/commands/search/) | | `admin` | Busca no histórico do WhatsApp Web, não só no cache: neste chat ou, no seu privado, em todos (`-N` para mais); `-mask` ofusca telefones |
| [`/set`](https://jpereira.github.io/zapbot/pt-BR/commands/set/) | | `admin` | Lista e altera as configurações (settings); `-a`/`-rm` acrescentam e tiram itens das listas (ex.: o `bot.admins` e o `bot.users`) |
| [`/show`](https://jpereira.github.io/zapbot/pt-BR/commands/show/) | | `admin` · delegável | No privado, lista o cache; reexibe apagadas, edições (`-e`), status (`-s`) e reações removidas ou trocadas (`-r`); `-q` busca (texto ou regex) e `-mask` ofusca telefones |
| [`/stats`](https://jpereira.github.io/zapbot/pt-BR/commands/stats/) | | `admin` · delegável | Ranking deste chat ou de outro (`/Grupo/`): quem mais fala, apaga e edita, horários de pico; `-me` para as suas, `-l` lista os chats, `-flush` apaga |
| [`/status`](https://jpereira.github.io/zapbot/pt-BR/commands/status/) | | `admin` | Posta no seu Status do WhatsApp (texto, foto ou vídeo); o `/cron -status` agenda |
| [`/sticker`](https://jpereira.github.io/zapbot/pt-BR/commands/sticker/) | | `user` | Figurinha de imagem, vídeo ou link (o `/get -st`), respondendo ou na legenda da mídia; com `-txt`, uma figurinha animada de texto |
| [`/stocks`](https://jpereira.github.io/zapbot/pt-BR/commands/stocks/) | `/stock`, `/rates` | `user` | Cotações do dólar, euro, libra e USDT contra o real, e de ações, ETFs e índices (Yahoo Finance): USD, EUR, MSTR, PETR4.SA, `^GSPC`; `-alert` para alertas de preço |
| [`/stt`](https://jpereira.github.io/zapbot/pt-BR/commands/stt/) | | `user` | Texto da fala de um link, vídeo ou áudio (o `/get -t` é um atalho), respondendo ou na legenda; `-ss` e `-es` escolhem um trecho |
| [`/tldr`](https://jpereira.github.io/zapbot/pt-BR/commands/tldr/) | | `admin` · delegável | Resume a conversa do chat pelo ChatGPT (`30m`, `2h`, `1d`, `1h30m` ou `300` mensagens; respondendo uma mensagem, a partir dela) |
| [`/translate`](https://jpereira.github.io/zapbot/pt-BR/commands/translate/) | | `user` | Traduz o texto ou a mensagem respondida pelo Google Translate, sem chave; `-to en` muda o idioma |
| [`/tts`](https://jpereira.github.io/zapbot/pt-BR/commands/tts/) | | `admin` · delegável | O texto numa nota de voz, com uma voz local (Piper) ou o ChatGPT (`-gpt`) |
| [`/unblock`](https://jpereira.github.io/zapbot/pt-BR/commands/unblock/) | | `admin` | Desbloqueia uma pessoa: pelo nome, pelo número, pelo nº da lista do `/block` ou respondendo uma mensagem |
| [`/unmute`](https://jpereira.github.io/zapbot/pt-BR/commands/unmute/) | | `admin` | Desfaz o silêncio do `/mute`: pelo nome, pelo nº da lista, respondendo um aviso ou todos (`-all`) |
| [`/uptime`](https://jpereira.github.io/zapbot/pt-BR/commands/uptime/) | | `user` | Tempo de execução e de conexão |
| [`/usage`](https://jpereira.github.io/zapbot/pt-BR/commands/usage/) | | `user` | Os seus limites de uso (definidos pelo dono com o `/bot +limit`): usados, restantes e quando renovam; `-l` mostra as suas últimas chamadas |
| [`/version`](https://jpereira.github.io/zapbot/pt-BR/commands/version/) | | `user` | Versão do bot (mesmo banner do `/uptime`) |
| [`/walissu`](https://jpereira.github.io/zapbot/pt-BR/commands/walissu/) | | `user` | Piada: Walissu CVE BOT: marca 2 membros com uma CVE aleatória |
| [`/warn`](https://jpereira.github.io/zapbot/pt-BR/commands/warn/) | | `admin` · delegável | Avisa alguém no grupo; no limite, a pessoa é removida |
| [`/watch`](https://jpereira.github.io/zapbot/pt-BR/commands/watch/) | | `admin` | Regras de texto/regex, com origem opcional em `-in`; lista ocorrências, busca nelas com `-q` e avisa nos destinos de `-to`; `-mask` ofusca telefones e `-mask N` liga o 🔒 na regra N |
| [`/weather`](https://jpereira.github.io/zapbot/pt-BR/commands/weather/) | | `user` | Tempo agora e máx./mín. do dia (Open-Meteo); `/weather 16d` mostra até 16 dias, contando hoje; sem cidade usa `weather.city` |
| [`/welcome`](https://jpereira.github.io/zapbot/pt-BR/commands/welcome/) | | `admin` · delegável | Mensagem quando alguém entra no grupo (por grupo; `{name}`, `{group}`) |
| [`/whois`](https://jpereira.github.io/zapbot/pt-BR/commands/whois/) | | `user` | Quem é e o que pode no bot, neste chat: 🤖 dono, 👑 admin, 🗣️ usuário ou 🚫 sem permissão; o dono e os admins veem os outros |

## Documentação

| Página | O que tem |
|---|---|
| [Instalação](https://jpereira.github.io/zapbot/pt-BR/installation/) | Requisitos, instalação, atualização (estável e `main`) e QR Code |
| [Configuração](https://jpereira.github.io/zapbot/pt-BR/configuration/) | `config/.env`, serviços externos e chaves de API |
| [E-mails](https://jpereira.github.io/zapbot/pt-BR/emails/) | QR Code por e-mail, código anti-phishing e alertas por e-mail |
| [Comandos](https://jpereira.github.io/zapbot/pt-BR/commands/) | Uma página por comando, com opções e exemplos |
| [Demonstração](docs/demo.md) | O bot em ação, em GIFs |
| [Settings](https://jpereira.github.io/zapbot/pt-BR/settings/) | Configurações alteráveis pelo `/set` |
| [API e MCP](https://jpereira.github.io/zapbot/pt-BR/api/) | A API HTTP local opcional e o servidor MCP experimental para clientes de IA |
| [Operação](https://jpereira.github.io/zapbot/pt-BR/operation/) | Dia a dia, saúde do container (heartbeat) e solução de problemas |
| [Desenvolvimento](https://jpereira.github.io/zapbot/pt-BR/development/) | Estrutura do código, testes, documentação e nova versão |

## Desenvolvimento

```bash
make deps         # dependências de desenvolvimento, sem baixar Chromium
make test         # testes, sem rede nem WhatsApp (Node 22.13+)
make DOCK_REMOTE=1 test # testes da imagem em execução no homelab
make lint         # ESLint
make check        # lint, testes e documentação em modo estrito
```

O código fica em `src/` (o `app.js` só faz o bootstrap). Veja
[Desenvolvimento](https://jpereira.github.io/zapbot/pt-BR/development/) para a estrutura, os testes, a
documentação e o `scripts/bump.sh` das releases.

## Contribuições

Contribuições são bem-vindas via issues e pull requests. Fique à vontade para postar suas dúvidas ou problemas em qualquer um dos fóruns de discussão abaixo:

[![Join WhatsApp Group](https://img.shields.io/badge/Join-WhatsApp%20Group-blue.svg?logo=WhatsApp)](https://chat.whatsapp.com/LrYlfasTbRx5lBhGdGNj4F?mode=gi_t)

---

**Autor:** Jorge Pereira ([@jpereira](https://github.com/jpereira)) · jpereiran@gmail.com
**Licença:** [MIT](LICENSE)
