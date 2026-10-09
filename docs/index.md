<p align="center">
  <img src="assets/logo.svg" alt="Logo do ZapBot: um robô anjo, com auréola e asas, piscando num
  balão de conversa verde, e uma cara de demônio espiando do lado" width="180">
</p>

# ZapBot

[![Testes](https://github.com/jpereira/zapbot/actions/workflows/ci.yml/badge.svg)](https://github.com/jpereira/zapbot/actions/workflows/ci.yml)

Bot para WhatsApp escrito em Node.js que roda em cima de uma sessão real do WhatsApp Web. Ele
recupera mensagens (e status) apagadas e editadas, baixa vídeos de redes sociais, cria figurinhas,
vigia mensagens por texto/regex e te avisa no privado, monitora quando contatos ficam online (em
desenvolvimento), traz notícias, tempo e CVEs, conversa com o ChatGPT e mais algumas brincadeiras,
tudo por comandos digitados no próprio chat (`/help`, `/get`, `/show`, `/news`, `/gpt`...).

Atalhos persistentes guardam comandos com argumentos e descrição opcional: cadastre com
`/alias dimdim -desc "Exibe o preço do dólar" /cotacao USD`, execute `/dimdim` e consulte
`/help alias`. O bot mostra o comando chamado antes do resultado. Um atalho também pode juntar
vários comandos num texto, como no `/cron`:
`/alias carteira Orca {/defi orca}\n Prjx {/defi prjx}`.

A ideia vem dos velhos tempos do IRC: o ZapBot é inspirado nas antigas
[eggdrops](https://www.eggheads.org/), os bots que ficavam de plantão nos canais, respondendo a
comandos, guardando o que rolava e cuidando da casa. Aqui o canal é o grupo do WhatsApp, e os
comandos começam com `/`.

**Principais funções:**

- Recupera mensagens e status apagados ou editados: [`/show`](comandos/show.md)
- Baixa vídeos com yt-dlp e ffmpeg: [`/get`](comandos/get.md)
- Cria figurinhas: [`/sticker`](comandos/sticker.md)
- Vigia mensagens por texto ou regex: [`/watch`](comandos/watch.md)
- Agenda mensagens: [`/cron`](comandos/cron.md)
- Mostra cotações e alertas de preço: [`/cotacao`](comandos/cotacao.md),
  [`/crypto`](comandos/crypto.md)
- Acompanha posições DeFi (Orca, Project X, Liquidswap, Morpho, Aave V3): [`/defi`](comandos/defi.md)
- Integra o ChatGPT: [`/gpt`](comandos/gpt.md), [`/tldr`](comandos/tldr.md)
- Consulta CVEs, notícias e o tempo: [`/cve`](comandos/cve.md), [`/news`](comandos/news.md),
  [`/tempo`](comandos/tempo.md)
- Faz backup do banco: [`/backup`](comandos/backup.md)
- Controla permissões por usuário e grupo, com proteção contra flood:
  [`/bot`](comandos/bot.md)

Por onde começar:

- [Instalação](instalacao.md): requisitos, instalação pela última release e atualização.
- [Configuração](configuracao.md): o `config/.env`, as chaves de API e o e-mail.
- [Comandos](comandos/index.md): todos os comandos, com opções e exemplos.
- [Operação](operacao.md): o dia a dia, a saúde do container e a solução de problemas.

## Como funciona

```text
 ┌────────────── container zapbot (node:24-trixie-slim) ──────────────┐
 │                                                                    │
 │   app.js ──► whatsapp-web.js ──► Puppeteer ──► Chromium            │──► WhatsApp Web
 │     │                                          (headless)          │
 │     ├──► SQLite  (cache/bot_database.db)  mensagens, settings      │
 │     ├──► cache/media   mídias p/ recuperar mensagens apagadas      │
 │     ├──► yt-dlp + ffmpeg   comando /get                            │
 │     ├──► APIs HTTP (axios)  /gpt /tempo /cve /news /giphy...       │
 │     └──► SMTP (nodemailer)  QR Code e alertas por e-mail           │
 │                                                                    │
 │  volumes:  wwebjs_auth  → sessão do WhatsApp (.wwebjs_auth)        │
 │            app_cache    → banco SQLite + mídias (cache/)           │
 └────────────────────────────────────────────────────────────────────┘
```

- **Sessão WhatsApp**: o [`whatsapp-web.js`](https://github.com/wwebjs/whatsapp-web.js) abre o
  WhatsApp Web num Chromium headless e pareia com o seu celular como um *aparelho conectado*. A
  sessão fica salva no volume `wwebjs_auth`, então o QR Code só precisa ser lido na primeira vez (ou
  quando a sessão for revogada). A versão da biblioteca é fixada no `package-lock.json` para
  instalações reproduzíveis. Os ajustes locais ficam em `patches/` e são aplicados pelo
  `scripts/aplicar-patches.js` durante a instalação, usando `git apply`.
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
  [`/show -e`](comandos/show.md). As suas próprias edições são ignoradas.
- **Silenciar**: o [`/mute`](comandos/mute.md) corta os avisos de apagadas, editadas e status de uma
  pessoa, de um grupo ou de uma comunidade (a mensagem continua guardada); respondendo um aviso,
  silencia de onde ele veio. Quem está silenciado também não gera aviso do `/watch` no seu privado.
  O [`/unmute`](comandos/unmute.md) desfaz.
- **Limpeza automática**: a cada 10 minutos o bot remove do banco/disco as mensagens comuns com mais
  de 68 h (janela máxima que o WhatsApp permite apagar), as apagadas e as editadas com mais de 30
  dias, as ocorrências do `/watch` com mais de 30 dias (setting `watch.hitsRetentionDays`), os
  contadores do `/stats` com mais de 90 dias (setting `stats.retentionDays`), as enquetes com mais
  de 90 dias (setting `enquete.retentionDays`) e os avisos ignorados pelo `/mute` com mais de 30
  dias.
- **Estatísticas**: cada mensagem nova (e cada apagada/editada) soma 1 num contador por chat, dia,
  hora e remetente (tabela `stats`), usado pelo [`/stats`](comandos/stats.md). Só números, sem o
  texto; ficam 90 dias (setting `stats.retentionDays`). As respostas do bot, o seu privado e os
  status não entram. Desligue com `/set stats.enable off`.
- **Alertas de preço**: `/cotacao -alerta USD > 5.30` e `/crypto -alerta BTC < 90000` guardam a
  regra na tabela `price_alerts`; a cada 5 minutos (setting `alerta.intervalMin`) o bot consulta os
  preços e avisa **no seu privado** (ou, com um ou vários `-to`, em contatos, grupos, números ou por
  e-mail) quando a regra é cumprida; com o `-msg`, um texto seu vai no início do aviso. Veja
  [Alertas de preço](comandos/cotacao.md#alertas-de-preço).
- **DeFi**: o [`/defi`](comandos/defi.md) lê on-chain as posições de liquidez da Orca, do Project X e da
  Liquidswap (pela carteira) cadastradas (tabela `defi_positions`) e, com o `-alerta`, confere a cada 10
  minutos (setting `defi.alerta.intervalMin`) e avisa (no seu privado ou nos destinos do `-to`)
  quando uma posição sai da faixa, quando volta e, com o `-taxas`, quando as taxas a coletar passam
  de um valor. O `/defi morpho` e o `/defi aave` mostram a posição, os empréstimos e o risco de uma
  carteira no Morpho (pela API oficial) e no Aave V3 (nos contratos, on-chain).
- **Enquetes**: os votos das enquetes da sua conta (evento `vote_update`) vão para as tabelas
  `polls` e `poll_votes`, e o [`/enquete -r`](comandos/enquete.md#resultado) mostra o placar. Ficam
  90 dias (setting `enquete.retentionDays`).
- **Agenda**: os lembretes e as mensagens do [`/cron`](comandos/cron.md) (também `/agenda` e
  `/lembrete`) ficam na tabela `schedules`; a cada 30 s o bot envia o que venceu (os repetidos
  seguem para o próximo horário). Um `{/comando}` no texto roda na hora do envio e a resposta entra
  no lugar.
- **Status diário**: com [`/bot -status 06h`](comandos/bot.md#status-do-bot), um relatório das
  últimas 24 h (no ar, cache, watch, apagadas, editadas, `/mute`) chega todo dia no seu privado.
- **Backup**: todo dia, às 3h (setting `backup.hour`), o bot guarda uma cópia compactada do banco em
  `cache/backups`; o [`/backup`](comandos/backup.md) também envia o backup diário ao destino de
  `backup.to`, quando preenchido. O comando lista, restaura e envia os arquivos (no seu privado, por
  e-mail ou, com um ou vários `-to`, noutros chats).
- **Watch**: mensagens recebidas de outras contas, fora dos comandos reconhecidos, são testadas
  contra as regras do [`/watch`](comandos/watch.md) (setting `watch.rules`); quando casa, a
  ocorrência é gravada na tabela `watch_hits` e você é avisado **no seu privado** (ou nos destinos
  do `-to` da regra: outros chats ou e-mails). Quem está silenciado no `/mute` não gera o aviso no
  privado; a ocorrência é gravada do mesmo jeito.
- **Configurações (`settings`)**: configurações gerais que podem mudar em tempo de execução (debug,
  moedas do `/crypto`, limites...) ficam na tabela genérica `settings` do SQLite (`key` → `value` em
  JSON) e são alteradas pelo [`/set`](comandos/set.md). No boot os valores padrão são gravados, se
  ainda não existirem, e tudo é carregado em memória. Veja [Settings](settings.md).
- **Comandos**: definidos em
  [`src/comandos/comandos.json`](https://github.com/jpereira/zapbot/blob/main/src/comandos/comandos.json)
  (nome, aliases, opções, ajuda, permissão) e implementados em `src/comandos/` (um arquivo por
  comando; veja [Estrutura do código](desenvolvimento.md#estrutura-do-código)). Os que consultam a
  internet (`/gpt`, `/tempo`, `/cve`, `/news`...) usam os serviços da tabela
  [Serviços externos](configuracao.md#serviços-externos).
- **Controle**: o [`/bot`](comandos/bot.md) mostra o status (o relatório de 24 h e os usuários),
  liga/desliga todos os comandos (`-on`/`-off`) e diz quem usa: você, os
  [admins extras](comandos/bot.md#admins-extras) (`+o`/`-o`) e os
  [usuários](comandos/bot.md#usuários) (`+v`/`-v`: pessoas e grupos, com os comandos de cada um
  limitados pelo `+cmd`/ `-cmd`, se quiser); o `-reset` volta ao padrão, o `-status 06h` manda o
  relatório todo dia (no seu privado, noutros chats ou por e-mail) e o `-info` mostra as versões do
  que o bot usa. Quem não é admin tem uma
  [proteção contra flood](comandos/bot.md#proteção-contra-flood). O [`/whois`](comandos/whois.md)
  diz o nível de cada um no chat.
- **Reconexão**: em caso de queda o cliente é reiniciado sozinho, exceto quando o motivo exige ação
  manual (`LOGOUT`, `CONFLICT`, `UNPAIRED`...). Sem internet, ele tenta de novo, com espera
  crescente, até conectar ([Queda da internet](operacao.md#queda-da-internet)).
- **Saúde (heartbeat)**: a cada 30 s o bot confere se o WhatsApp Web responde e grava
  `/tmp/zapbot-heartbeat.json`; o `HEALTHCHECK` do Docker marca o container como `unhealthy` se o
  arquivo parar de ser atualizado. Veja
  [Saúde do container](operacao.md#saúde-do-container-heartbeat).
- **Aviso de início**: quando fica pronto, o bot manda
  `🤖 ZapBot <versão> (git+<commit>/<tag ou HEAD>) inicializado.` para o `PHONE_NUMBER` (o commit é o
  do código que está rodando; veja o [`/version`](comandos/version.md)).
- **Alertas por e-mail**: crash, queda, reconexão, falha de autenticação e outros eventos também vão
  por e-mail, pelo mesmo SMTP do QR Code (veja [Alertas por e-mail](emails.md#alertas-por-e-mail)).
  Ligado por padrão (setting `email.alerts`).
