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

## ✨ O que ele faz

| | Habilidade | O que faz | Experimente |
|---|---|---|---|
| 🕵️ | **Recuperar o que foi apagado** | Reexibe as mensagens apagadas e editadas (e os status, e as reações removidas), com a mídia original | [`/show`](commands/show.md) · `/show -e` · `/show -s` |
| 🤖 | **Conversar com o ChatGPT** | Responde perguntas, lê fotos e PDFs, transcreve notas de voz, resume conversas, desenha imagens e GIFs, transforma texto em voz e lê o texto de figuras | [`/gpt`](commands/gpt.md) · [`/tldr`](commands/tldr.md) · [`/draw`](commands/draw.md) · [`/tts`](commands/tts.md) · [`/ocr`](commands/ocr.md) |
| 📱 | **QR Codes** | Gera um QR Code de qualquer texto e lê um quando você responde a foto dele | [`/qr`](commands/qr.md) |
| 🎞️ | **Mídia e figurinhas** | Baixa vídeos e áudios de redes sociais, cria figurinhas (de imagens, vídeos ou texto), memes, GIFs, imagens de código e arte ASCII | [`/get`](commands/get.md) · [`/sticker`](commands/sticker.md) · [`/meme`](commands/meme.md) · [`/giphy`](commands/giphy.md) · [`/carbon`](commands/carbon.md) · [`/ascii`](commands/ascii.md) |
| 🔔 | **Vigiar e avisar** | Vigia mensagens por texto ou regex, avisa de cotações de moedas e cripto, de posições DeFi fora da faixa e de contatos que ficaram online, no seu privado, num grupo ou por e-mail | [`/watch`](commands/watch.md) · [`/rates`](commands/rates.md) · [`/crypto`](commands/crypto.md) · [`/defi`](commands/defi.md) · [`/monitor`](commands/monitor.md) |
| 📅 | **Agendar e automatizar** | Mensagens avulsas e recorrentes, lembretes, atalhos seus, vários comandos numa mensagem só, anotações com `#tags` e alertas, listas de destinatários | [`/cron`](commands/cron.md) · [`/alias`](commands/alias.md) · [`/batch`](commands/batch.md) · [`/notes`](commands/notes.md) · [`/forward`](commands/forward.md) |
| 👥 | **Gerir grupos** | Marca todo mundo, promove e rebaixa, links de convite, enquetes, boas-vindas e despedidas, silencia e bloqueia | [`/everybody`](commands/everybody.md) · [`/promote`](commands/promote.md) · [`/invite`](commands/invite.md) · [`/poll`](commands/poll.md) · [`/welcome`](commands/welcome.md) · [`/mute`](commands/mute.md) |
| 🌎 | **Informação do dia a dia** | Tempo conferido em mais de uma fonte, notícias, CVEs, versões do kernel Linux, tradução e estatísticas do chat | [`/weather`](commands/weather.md) · [`/news`](commands/news.md) · [`/cve`](commands/cve.md) · [`/kernel`](commands/kernel.md) · [`/translate`](commands/translate.md) · [`/stats`](commands/stats.md) |
| 🛡️ | **Seu, e seguro** | Papéis de dono, admin e usuário por comando, proteção contra flood, anti-SSRF nos downloads, backups, login do QR Code por e-mail, em inglês ou português do Brasil | [`/bot`](commands/bot.md) · [`/backup`](commands/backup.md) · [`/set`](commands/set.md) |

Todos os comandos, com as opções e os exemplos, estão em [Comandos](commands/index.md).

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
/alias dimdim -d "Exibe o preço do dólar" /rates USD     → cadastra o atalho
/dimdim                                                  → executa o /rates USD
/alias carteira Orca {/defi orca}\n Prjx {/defi prjx}   → um texto, vários comandos
```

O bot mostra o comando chamado antes do resultado. Os atalhos seguem as permissões dos comandos que chamam, e o
`/help alias` lista os seus.

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
- **Alertas de preço**: `/rates -alert USD > 5.30` e `/crypto -alert BTC < 90000` guardam a
  regra na tabela `price_alerts`; a cada 5 minutos (setting `alert.intervalMin`) o bot consulta os
  preços e avisa **no seu privado** (ou, com um ou vários `-to`, em contatos, grupos, números ou por
  e-mail) quando a regra é cumprida; com o `-msg`, um texto seu vai no início do aviso. Veja
  [Alertas de preço](commands/rates.md#alertas-de-preço).
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
