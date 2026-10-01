# 🤖 ZapBot v1.8

[![Testes](https://github.com/jpereira/zapbot/actions/workflows/ci.yml/badge.svg)](https://github.com/jpereira/zapbot/actions/workflows/ci.yml)

> 🇧🇷 **Projeto em português (pt_BR).** Documentação, comandos e mensagens do bot
> estão em português do Brasil.

Bot para WhatsApp escrito em Node.js que roda em cima de uma sessão real do
WhatsApp Web. Ele recupera mensagens (e status) apagadas e editadas, baixa
vídeos de redes sociais, cria figurinhas, vigia mensagens por texto/regex e te
avisa no privado, monitora quando contatos ficam online (em desenvolvimento),
traz notícias, tempo e CVEs, conversa com o ChatGPT e mais algumas brincadeiras,
tudo por comandos digitados no próprio chat (`/help`, `/get`, `/show`, `/news`,
`/gpt`...).

📖 **Documentação completa: [jpereira.github.io/zapbot](https://jpereira.github.io/zapbot/)** (da última
release; a do `main` fica em [`docs/`](docs/index.md)).

## Como funciona

```
 ┌────────────── container zapbot (node:24-alpine) ───────────────┐
 │                                                                │
 │   app.js ──► whatsapp-web.js ──► Puppeteer ──► Chromium        │──► WhatsApp Web
 │     │                                          (headless)      │
 │     ├──► SQLite  (cache/bot_database.db)  mensagens, settings  │
 │     ├──► cache/media   mídias p/ recuperar mensagens apagadas  │
 │     ├──► yt-dlp + ffmpeg   comando /get                        │
 │     ├──► APIs HTTP (axios)  /gpt /tempo /cve /news /giphy...   │
 │     └──► SMTP (nodemailer)  QR Code e alertas por e-mail       │
 │                                                                │
 │  volumes:  wwebjs_auth  → sessão do WhatsApp (.wwebjs_auth)    │
 │            app_cache    → banco SQLite + mídias (cache/)       │
 └────────────────────────────────────────────────────────────────┘
```

O bot age como a sua própria conta (um *aparelho conectado*), grava as
mensagens num SQLite e reage a comandos digitados em qualquer chat. Detalhes
em [Como funciona](https://jpereira.github.io/zapbot/#como-funciona).

## Instalação

Precisa só de Docker com o Compose v2, Git e um celular com WhatsApp. A versão
estável é a última release, hoje a `release-1.8`:

```bash
git clone https://github.com/jpereira/zapbot.git
cd zapbot
git checkout release-1.8

cp config/.env.example config/.env   # preencha o PHONE_NUMBER (veja Configuração)
touch config/.env.dev

docker compose -f docker/docker-compose.yml build zapbot
docker compose -f docker/docker-compose.yml up -d zapbot
docker logs -f zapbot           # leia o QR Code em WhatsApp › Aparelhos conectados
```

Para atualizar, use `git fetch --tags`, o mesmo `git checkout` e o build de
novo. O passo a passo (inclusive a versão de desenvolvimento, `main`) está em
[Instalação](https://jpereira.github.io/zapbot/instalacao/); as variáveis do
`config/.env`, em [Configuração](https://jpereira.github.io/zapbot/configuracao/).

## Comandos

Digite no próprio chat. `/help` lista todos; `/<comando> -h` mostra a ajuda de
um. Os marcados como **Admin** só respondem à sua conta e, por padrão, o modo
admin está ligado: só você usa comandos até `/bot -admin`
([Permissões](https://jpereira.github.io/zapbot/comandos/#permissões-onlyadmin)).

| Comando | Aliases | Admin | Descrição |
|---|---|:-:|---|
| [`/agendar`](https://jpereira.github.io/zapbot/comandos/agendar/) | `/agenda`, `/cron`, `/lemb`, `/lembrete` | ✅ | Na hora marcada (`30m`, `às 18h`, `sexta 9h`...): envia uma mensagem (aqui ou com `-to`) ou, como `/lembrete`, um ⏰ lembrete; pode repetir |
| [`/backup`](https://jpereira.github.io/zapbot/comandos/backup/) | `/bkp` | ✅ | Backup do banco: automático todo dia; lista, detalha, restaura e envia o arquivo |
| [`/boletos`](https://jpereira.github.io/zapbot/comandos/boletos/) | | ✅ | Sorteia 2 membros para "pagar um boleto" |
| [`/bot`](https://jpereira.github.io/zapbot/comandos/bot/) | | ✅ | Liga/desliga todos os comandos (`-on`/`-off`) e o modo admin (`+admin`/`-admin`) |
| [`/cache`](https://jpereira.github.io/zapbot/comandos/cache/) | `/c` | ✅ | Uso e limpeza do cache |
| [`/cotacao`](https://jpereira.github.io/zapbot/comandos/cotacao/) | `/cambio` | | Cotação de EUR e USDT (e USD, GBP) contra o real: atual, abertura, fechamento e variação; alertas de preço |
| [`/crypto`](https://jpereira.github.io/zapbot/comandos/crypto/) | `/bitcoio`, `/creptomoeda` | | Cotação das criptos ativadas (padrão: BTC, ETH, SOL e HYPE); alertas de preço |
| [`/cve`](https://jpereira.github.io/zapbot/comandos/cve/) | | | Últimas CVEs publicadas (NVD); `-highscore` só as críticas |
| [`/debug`](https://jpereira.github.io/zapbot/comandos/debug/) | `/d`, `/dbg` | ✅ | Liga/desliga logs de debug |
| [`/defi`](https://jpereira.github.io/zapbot/comandos/defi/) | | ✅ | Posições de liquidez da Orca: saldo, faixa, preço e taxas a coletar, lidos on-chain |
| [`/enquete`](https://jpereira.github.io/zapbot/comandos/enquete/) | `/enq`, `/quiz` | ✅ | Cria uma enquete nativa do WhatsApp no chat; `-r` mostra o resultado |
| [`/get`](https://jpereira.github.io/zapbot/comandos/get/) | `/download` | | Baixa vídeo/áudio de redes sociais |
| [`/giphy`](https://jpereira.github.io/zapbot/comandos/giphy/) | `/gif` | | GIF aleatório (GIPHY) |
| [`/gpt`](https://jpereira.github.io/zapbot/comandos/gpt/) | `/ai` | ✅ | Pergunta ao ChatGPT (OpenAI) |
| [`/help`](https://jpereira.github.io/zapbot/comandos/help/) | `/h` | | Menu de ajuda |
| [`/joke`](https://jpereira.github.io/zapbot/comandos/joke/) | `/piada`, `/humor` | | Piada aleatória em português |
| [`/kernel`](https://jpereira.github.io/zapbot/comandos/kernel/) | | | Versões atuais do kernel Linux (kernel.org) |
| [`/listageral`](https://jpereira.github.io/zapbot/comandos/listageral/) | `/list` | ✅ | Lista os membros do grupo |
| [`/meme`](https://jpereira.github.io/zapbot/comandos/meme/) | | | Template de meme aleatório (imgflip) |
| [`/monitor`](https://jpereira.github.io/zapbot/comandos/monitor/) 🚧 | `/m` | ✅ | Avisa quando números ficam online *(em desenvolvimento, desabilitado por padrão)* |
| [`/mudo`](https://jpereira.github.io/zapbot/comandos/mudo/) | `/mute` | ✅ | Silencia os avisos de apagadas, editadas e status de uma pessoa ou grupo |
| [`/news`](https://jpereira.github.io/zapbot/comandos/news/) | | ✅ | Manchetes de feeds RSS: `-hack`, `-g1`, `-gazeta`, `-brasil` |
| [`/noffa`](https://jpereira.github.io/zapbot/comandos/noffa/) | `/🌈`, `/🏳️‍🌈` | | Enfeita o texto com arco-íris |
| [`/ping`](https://jpereira.github.io/zapbot/comandos/ping/) | `/p` | ✅ | Verifica se o bot está vivo |
| [`/resumo`](https://jpereira.github.io/zapbot/comandos/resumo/) | `/tldr` | ✅ | Resume a conversa do chat pelo ChatGPT (`2h`, `300`...) |
| [`/set`](https://jpereira.github.io/zapbot/comandos/set/) | `/config` | ✅ | Lista e altera as configurações (settings) |
| [`/show`](https://jpereira.github.io/zapbot/comandos/show/) | `/s` | ✅ | Reexibe mensagens apagadas ou editadas (`-e`) |
| [`/stats`](https://jpereira.github.io/zapbot/comandos/stats/) | | ✅ | Ranking do chat (quem mais fala, apaga e edita, horários de pico); `-me` para as suas |
| [`/status`](https://jpereira.github.io/zapbot/comandos/status/) | | ✅ | Relatório das últimas 24 h (cache, no ar, watch, apagadas, editadas, `/mudo`); `/status 06h` manda todo dia |
| [`/sticker`](https://jpereira.github.io/zapbot/comandos/sticker/) | `/st` | | Transforma imagem/vídeo em figurinha |
| [`/tempo`](https://jpereira.github.io/zapbot/comandos/tempo/) | `/weather` | | Tempo agora e máx./mín. do dia (Open-Meteo); `/tempo 7d` mostra os próximos 7 dias; sem cidade usa `tempo.city` |
| [`/todos`](https://jpereira.github.io/zapbot/comandos/todos/) | `/todes` | ✅ | Menciona todos do grupo |
| [`/traduzir`](https://jpereira.github.io/zapbot/comandos/traduzir/) | `/tr`, `/translate` | | Traduz o texto ou a mensagem respondida (Google Translate); `-para en` muda o idioma |
| [`/uptime`](https://jpereira.github.io/zapbot/comandos/uptime/) | `/u`, `/up` | ✅ | Tempo de execução e de conexão |
| [`/version`](https://jpereira.github.io/zapbot/comandos/version/) | `/ver` | ✅ | Versão do bot (mesmo banner do `/uptime`) |
| [`/walissu`](https://jpereira.github.io/zapbot/comandos/walissu/) | `/ualisu` | ✅ | Walissu CVE BOT: marca 2 membros com uma CVE aleatória |
| [`/watch`](https://jpereira.github.io/zapbot/comandos/watch/) | `/w` | ✅ | Avisa no seu privado quando uma mensagem casa com um texto/regex |

## Documentação

| Página | O que tem |
|---|---|
| [Instalação](https://jpereira.github.io/zapbot/instalacao/) | Requisitos, instalação, atualização (estável e `main`) e QR Code |
| [Configuração](https://jpereira.github.io/zapbot/configuracao/) | `config/.env`, serviços externos e chaves de API |
| [E-mails](https://jpereira.github.io/zapbot/emails/) | QR Code por e-mail, código anti-phishing e alertas por e-mail |
| [Comandos](https://jpereira.github.io/zapbot/comandos/) | Uma página por comando, com opções e exemplos |
| [Settings](https://jpereira.github.io/zapbot/settings/) | Configurações alteráveis pelo `/set` |
| [Operação](https://jpereira.github.io/zapbot/operacao/) | Dia a dia, saúde do container (heartbeat) e solução de problemas |
| [Desenvolvimento](https://jpereira.github.io/zapbot/desenvolvimento/) | Estrutura do código, testes, documentação e nova versão |

## Desenvolvimento

```bash
npm test          # 370+ testes, sem rede nem WhatsApp (Node 22.13+)
npm run lint      # ESLint
```

O código fica em `src/` (o `app.js` só faz o bootstrap). Veja
[Desenvolvimento](https://jpereira.github.io/zapbot/desenvolvimento/) para a estrutura, os testes, a
documentação e o `bump.sh` das releases.

---

**Autor:** Jorge Pereira ([@jpereira](https://github.com/jpereira)) · jpereiran@gmail.com
**Licença:** MIT
