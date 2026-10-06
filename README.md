# 🤖 ZapBot v2.4

[![Testes](https://github.com/jpereira/zapbot/actions/workflows/ci.yml/badge.svg)](https://github.com/jpereira/zapbot/actions/workflows/ci.yml)

> 🇧🇷 **Projeto em português (pt_BR).** Documentação, comandos e mensagens do bot
> estão em português do Brasil.

Bot para WhatsApp escrito em Node.js que roda em cima de uma sessão real do WhatsApp Web. Ele
recupera mensagens (e status) apagadas e editadas, baixa vídeos de redes sociais, cria figurinhas,
vigia mensagens por texto/regex e te avisa no privado, monitora quando contatos ficam online (em
desenvolvimento), traz notícias, tempo e CVEs, conversa com o ChatGPT e mais algumas brincadeiras,
tudo por comandos digitados no próprio chat (`/help`, `/get`, `/show`, `/news`, `/gpt`...).

Atalhos persistentes guardam comandos com argumentos e descrição opcional: cadastre com
`/alias dimdim -desc "Exibe o preço do dólar" /cotacao USD`, execute `/dimdim` e consulte
`/help alias`. O bot mostra o comando chamado antes do resultado.

A ideia vem dos velhos tempos do IRC: o ZapBot é inspirado nas antigas
[eggdrops](https://www.eggheads.org/), os bots que ficavam de plantão nos canais, respondendo a
comandos, guardando o que rolava e cuidando da casa. Aqui o canal é o grupo do WhatsApp, e os
comandos começam com `/`.

📖 **Documentação completa: [jpereira.github.io/zapbot](https://jpereira.github.io/zapbot/)** (da
última release; a do `main` fica em [`docs/`](docs/index.md)).

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

O bot age como a sua própria conta (um *aparelho conectado*), grava as mensagens num SQLite e reage
a comandos digitados em qualquer chat. Detalhes em
[Como funciona](https://jpereira.github.io/zapbot/#como-funciona).

## Instalação

Precisa só de Docker com o Compose v2, Git e um celular com WhatsApp. A versão estável é a última
release, hoje a `release-2.4`:

```bash
git clone https://github.com/jpereira/zapbot.git
cd zapbot
git checkout release-2.4

cp config/.env.example config/.env   # preencha o PHONE_NUMBER e o e-mail (veja abaixo)
touch config/.env.dev

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
[Configuração](https://jpereira.github.io/zapbot/configuracao/#e-mail-qr-code-e-alertas) e em
[E-mails](https://jpereira.github.io/zapbot/emails/).

### Atualizar

Para atualizar, use `git fetch --tags`, o mesmo `git checkout` (com a release nova) e o build de
novo. O passo a passo (inclusive a versão de desenvolvimento, `main`) está em
[Instalação](https://jpereira.github.io/zapbot/instalacao/); as variáveis do `config/.env`, em
[Configuração](https://jpereira.github.io/zapbot/configuracao/).

## Comandos

Digite no próprio chat. `/help` lista os comandos que você pode usar; `/<comando> -h` mostra a ajuda
de um. Os marcados como **Admin** só respondem à sua conta (e aos admins extras:
`/bot +o <pessoa>`). Por padrão, só você usa comandos: libere os comuns para alguns com
`/bot +v <pessoa|grupo>` (ou para todos, com `/set bot.users true`); o `/whois` diz o seu nível
([Permissões](https://jpereira.github.io/zapbot/comandos/#permissões-onlyadmin)).

| Comando | Aliases | Admin | Descrição |
|---|---|:-:|---|
| [`/alias`](https://jpereira.github.io/zapbot/comandos/alias/) | | ✅ | Cadastra, lista e remove atalhos para comandos com argumentos |
| [`/backup`](https://jpereira.github.io/zapbot/comandos/backup/) | `/bkp` | ✅ | Backup diário local e envio por `backup.to`; lista, detalha, restaura e envia o banco |
| [`/boletos`](https://jpereira.github.io/zapbot/comandos/boletos/) | | | Sorteia 2 membros para "pagar um boleto" |
| [`/bot`](https://jpereira.github.io/zapbot/comandos/bot/) | `/b` | ✅ | Status do bot (relatório de 24 h e os usuários); liga/desliga os comandos (`-on`/`-off`) e diz quem usa: admins (`+o`/`-o`) e usuários (`+v`/`-v`, em qualquer chat ou só num grupo, e os comandos de cada um com `+cmd`/`-cmd`); `-reset` volta ao padrão; `-status` (`-s`): relatório das últimas 24 h, e `-s 06h` manda todo dia; `-info` (`-i`): versões e sistema |
| [`/cache`](https://jpereira.github.io/zapbot/comandos/cache/) | `/c` | ✅ | Árvore do cache com tamanhos, contagens de mensagens e limpeza |
| [`/cotacao`](https://jpereira.github.io/zapbot/comandos/cotacao/) | `/cambio` | | Cotação de EUR e USDT (e USD, GBP) contra o real: atual, abertura, fechamento e variação; alertas de preço |
| [`/cron`](https://jpereira.github.io/zapbot/comandos/cron/) | `/agenda`, `/lembrete` | ✅ | Na hora marcada (`30m`, `às 18h`, `sexta 9h`...): envia uma mensagem (aqui ou com `-to`, em um ou vários chats) ou, como `/lembrete`, um ⏰ lembrete; pode repetir, editar e pausar, e rodar comandos no texto (`{/crypto}`) |
| [`/crypto`](https://jpereira.github.io/zapbot/comandos/crypto/) | `/bitcoio`, `/creptomoeda` | | Cotação das criptos ativadas (padrão: BTC, ETH, SOL e HYPE) ou só das pedidas (`BTC ETH`); alertas de preço |
| [`/cve`](https://jpereira.github.io/zapbot/comandos/cve/) | | | Últimas CVEs publicadas (NVD); `-highscore` só as críticas |
| [`/debug`](https://jpereira.github.io/zapbot/comandos/debug/) | `/d`, `/dbg` | ✅ | Logs de debug com níveis, filtro e cópia para chats |
| [`/defi`](https://jpereira.github.io/zapbot/comandos/defi/) | | ✅ | Posições de liquidez da Orca e do Project X: saldo, faixa, preço e taxas a coletar, lidos on-chain; `-alerta` avisa quando sai e volta para a faixa e quando as taxas passam de um valor. `morpho` e `aave`: posição, empréstimos e risco no Morpho e no Aave V3 |
| [`/enquete`](https://jpereira.github.io/zapbot/comandos/enquete/) | `/enq`, `/quiz` | ✅ | Cria uma enquete nativa do WhatsApp no chat; `-r` mostra o resultado |
| [`/get`](https://jpereira.github.io/zapbot/comandos/get/) | `/download` | | Baixa vídeo/áudio de redes sociais |
| [`/giphy`](https://jpereira.github.io/zapbot/comandos/giphy/) | `/gif` | | GIF do GIPHY por tag, URL ou ID, enviado em loop |
| [`/gpt`](https://jpereira.github.io/zapbot/comandos/gpt/) | `/ai` | ✅ | Pergunta ao ChatGPT (OpenAI) |
| [`/help`](https://jpereira.github.io/zapbot/comandos/help/) | `/h` | | Menu de ajuda, só com os comandos que quem pediu pode usar |
| [`/joke`](https://jpereira.github.io/zapbot/comandos/joke/) | `/piada`, `/humor` | | Piada aleatória em português |
| [`/kernel`](https://jpereira.github.io/zapbot/comandos/kernel/) | | | Versões atuais do kernel Linux (kernel.org) |
| [`/listageral`](https://jpereira.github.io/zapbot/comandos/listageral/) | `/list` | ✅ | Lista os membros do grupo |
| [`/meme`](https://jpereira.github.io/zapbot/comandos/meme/) | | | Template de meme aleatório (imgflip) |
| [`/monitor`](https://jpereira.github.io/zapbot/comandos/monitor/) 🚧 | | ✅ | Avisa quando números ficam online *(em desenvolvimento, desabilitado por padrão)* |
| [`/mute`](https://jpereira.github.io/zapbot/comandos/mute/) | `/m`, `/mudo` | ✅ | Silencia os avisos de apagadas, editadas e status de uma pessoa, um grupo ou uma comunidade; respondendo um aviso, de onde ele veio |
| [`/news`](https://jpereira.github.io/zapbot/comandos/news/) | | | Manchetes de feeds RSS: `-hack`, `-g1`, `-gazeta`, `-brasil` |
| [`/noffa`](https://jpereira.github.io/zapbot/comandos/noffa/) | `/🌈`, `/🏳️‍🌈` | | Enfeita o texto com arco-íris |
| [`/ping`](https://jpereira.github.io/zapbot/comandos/ping/) | `/p` | | Verifica se o bot está vivo |
| [`/pixelart`](https://jpereira.github.io/zapbot/comandos/pixelart/) | `/ansi`, `/px` | | Arte ANSI/ASCII aleatória (16colo.rs) |
| [`/set`](https://jpereira.github.io/zapbot/comandos/set/) | `/config` | ✅ | Lista e altera as configurações (settings); `-a`/`-rem` acrescentam e tiram itens das listas (ex.: o `bot.admins` e o `bot.users`) |
| [`/show`](https://jpereira.github.io/zapbot/comandos/show/) | `/s` | ✅ | No privado, lista o cache; reexibe apagadas, edições (`-e`) e status (`-s`); `-q` busca e `-mask` ofusca telefones |
| [`/stats`](https://jpereira.github.io/zapbot/comandos/stats/) | | ✅ | Ranking deste chat ou de outro (`/Grupo/`): quem mais fala, apaga e edita, horários de pico; `-me` para as suas, `-l` lista os chats, `-flush` apaga |
| [`/sticker`](https://jpereira.github.io/zapbot/comandos/sticker/) | `/st` | | Transforma imagem/vídeo em figurinha; com `-txt`, uma figurinha animada de texto |
| [`/tempo`](https://jpereira.github.io/zapbot/comandos/tempo/) | `/t`, `/weather` | | Tempo agora e máx./mín. do dia (Open-Meteo); `/tempo 16d` mostra até 16 dias, contando hoje; sem cidade usa `tempo.city` |
| [`/tldr`](https://jpereira.github.io/zapbot/comandos/tldr/) | `/resumo` | ✅ | Resume a conversa do chat pelo ChatGPT (`2h`, `300`...) |
| [`/todos`](https://jpereira.github.io/zapbot/comandos/todos/) | `/todes` | ✅ | Menciona todos do grupo |
| [`/traduzir`](https://jpereira.github.io/zapbot/comandos/traduzir/) | `/tr`, `/translate` | | Traduz o texto ou a mensagem respondida (Google Translate); `-para en` muda o idioma |
| [`/unmute`](https://jpereira.github.io/zapbot/comandos/unmute/) | | ✅ | Desfaz o silêncio do `/mute`: pelo nome, pelo nº da lista, respondendo um aviso ou todos (`-all`) |
| [`/uptime`](https://jpereira.github.io/zapbot/comandos/uptime/) | `/u`, `/up` | | Tempo de execução e de conexão |
| [`/version`](https://jpereira.github.io/zapbot/comandos/version/) | `/ver` | | Versão do bot (mesmo banner do `/uptime`) |
| [`/walissu`](https://jpereira.github.io/zapbot/comandos/walissu/) | `/ualisu` | ✅ | Walissu CVE BOT: marca 2 membros com uma CVE aleatória |
| [`/watch`](https://jpereira.github.io/zapbot/comandos/watch/) | `/w` | ✅ | Regras de texto/regex, com origem opcional em `-in`; lista ocorrências e avisa nos destinos de `-to`; `-mask` ofusca telefones |
| [`/whois`](https://jpereira.github.io/zapbot/comandos/whois/) | `/who`, `/id` | | Quem é e o que pode no bot, neste chat: 🤖 dono, 👑 admin, 🗣️ usuário ou 🚫 sem permissão; o dono e os admins veem os outros |

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
make deps         # dependências de desenvolvimento, sem baixar Chromium
make test         # testes, sem rede nem WhatsApp (Node 22.13+)
make DOCK_REMOTE=1 test # testes da imagem em execução no homelab
make lint         # ESLint
make check        # lint, testes e documentação em modo estrito
```

O código fica em `src/` (o `app.js` só faz o bootstrap). Veja
[Desenvolvimento](https://jpereira.github.io/zapbot/desenvolvimento/) para a estrutura, os testes, a
documentação e o `bump.sh` das releases.

---

**Autor:** Jorge Pereira ([@jpereira](https://github.com/jpereira)) · jpereiran@gmail.com
**Licença:** [MIT](LICENSE)
