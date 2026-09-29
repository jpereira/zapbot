# 🤖 ZapBot v1.3

> 🇧🇷 **Projeto em português (pt_BR).** Documentação, comandos e mensagens do bot
> estão em português do Brasil.

Bot para WhatsApp escrito em Node.js que roda em cima de uma sessão real do
WhatsApp Web. Ele recupera mensagens apagadas, baixa vídeos de redes sociais,
cria figurinhas, vigia mensagens por texto/regex e te avisa no privado, monitora quando contatos ficam online (em desenvolvimento) e mais algumas
brincadeiras, tudo por comandos digitados no próprio chat (`/help`, `/get`,
`/show`...).

**Autor:** Jorge Pereira ([@jpereira](https://github.com/jpereira)) · jpereiran@gmail.com
**Licença:** MIT

---

## Sumário

- [Como funciona](#como-funciona)
- [Autenticação: QR Code no terminal ou por e-mail](#autenticação-qr-code-no-terminal-ou-por-e-mail)
- [Requisitos](#requisitos)
- [Instalação (Docker)](#instalação-docker)
- [Configuração do `config/.env`](#configuração-do-configenv)
- [E-mail do QR Code](#e-mail-do-qr-code)
- [Comandos](#comandos)
- [Operação do dia a dia](#operação-do-dia-a-dia)
- [Solução de problemas](#solução-de-problemas)

---

## Como funciona

```
 ┌──────────── container zapbot-prod (node:24-alpine) ────────────┐
 │                                                                │
 │   app.js ──► whatsapp-web.js ──► Puppeteer ──► Chromium        │──► WhatsApp Web
 │     │                                          (headless)      │
 │     ├──► SQLite  (cache/bot_database.db)  mensagens, settings  │
 │     ├──► cache/media   mídias p/ recuperar mensagens apagadas  │
 │     ├──► yt-dlp + ffmpeg   comando /get                        │
 │     └──► SMTP (nodemailer)  envio do QR Code por e-mail        │
 │                                                                │
 │  volumes:  wwebjs_auth  → sessão do WhatsApp (.wwebjs_auth)    │
 │            app_cache    → banco SQLite + mídias (cache/)       │
 └────────────────────────────────────────────────────────────────┘
```

- **Sessão WhatsApp**: o [`whatsapp-web.js`](https://github.com/pedroslopez/whatsapp-web.js)
  abre o WhatsApp Web num Chromium headless e pareia com o seu celular como um
  *aparelho conectado*. A sessão fica salva no volume `wwebjs_auth`, então o QR
  Code só precisa ser lido na primeira vez (ou quando a sessão for revogada).
  A lib está fixada no commit [`58ddf15`](https://github.com/wwebjs/whatsapp-web.js/commit/58ddf1561cd783d6a548fa812eb70a05944604b4)
  (ainda sem release): ele corrige o `id._serialized` → `id.$1` do WhatsApp Web
  (jul/2026), que quebrava mensagem citada e download de mídia. O ajuste local
  fica em `patches/` (aplicado pelo `patch-package`). Para instalar fora do
  Docker: `PUPPETEER_SKIP_DOWNLOAD=true npm install`.
- **Número do bot = seu número**: o bot age como a conta que leu o QR Code. As
  mensagens que *você* envia (de qualquer aparelho) também passam pelo bot.
- **Persistência**: toda mensagem recebida é gravada no SQLite (mídias vão para
  `cache/media`). Quando alguém apaga uma mensagem "para todos", o bot encontra
  a cópia no banco e a reenvia **no seu privado** (chat consigo mesmo). Mensagens
  apagadas ficam guardadas por 30 dias (setting `cache.revokedRetentionDays`)
  e podem ser reexibidas com `/show`.
- **Limpeza automática**: a cada 10 minutos o bot remove do banco/disco as
  mensagens comuns com mais de 68 h (janela máxima que o WhatsApp permite
  apagar), as apagadas com mais de 30 dias e as ocorrências do `/watch` com
  mais de 30 dias (setting `watch.hitsRetentionDays`).
- **Watch**: toda mensagem recebida que não é comando é testada contra as
  regras do [`/watch`](#watch-w--admin) (setting `watch.rules`); quando casa, a
  ocorrência é gravada na tabela `watch_hits` e você é avisado **no seu
  privado**.
- **Configurações (`settings`)**: configurações gerais que podem mudar em
  tempo de execução (debug, moedas do `/crypto`, limites...) ficam na tabela
  genérica `settings` do SQLite (`key` → `value` em JSON) e são alteradas pelo
  [`/set`](#set--admin). No boot os valores padrão são gravados, se ainda não
  existirem, e tudo é carregado em memória. Veja [Settings](#settings).
- **Comandos**: definidos em [`config/bot-config.json`](config/bot-config.json)
  (nome, aliases, opções, ajuda, permissão) e implementados em `app.js`.
- **Reconexão**: em caso de queda o cliente é reiniciado sozinho, exceto quando o
  motivo exige ação manual (`LOGOUT`, `CONFLICT`, `UNPAIRED`...).
- **Aviso de início**: quando fica pronto, o bot manda
  `🤖 ZapBot <versão> inicializado.` para o `PHONE_NUMBER`.

## Autenticação: QR Code no terminal ou por e-mail

Na primeira execução (ou se a sessão expirar) o WhatsApp exige a leitura de um
QR Code. O ZapBot oferece dois modos, escolhidos por `QRCODE_EMAIL_ENABLE`:

| Modo | `QRCODE_EMAIL_ENABLE` | Onde aparece o QR |
|------|------|------|
| Terminal | `false` | Desenhado em ASCII nos logs do container (`docker logs -f zapbot-prod`) |
| E-mail   | `true`  | Enviado como imagem PNG para `QRCODE_EMAIL_SMTP_TO` |

O modo e-mail é útil quando o bot roda num servidor remoto/homelab e você não
quer ficar olhando logs: o QR chega na sua caixa de entrada, você abre no
computador e lê com o celular em **WhatsApp › Aparelhos conectados › Conectar
um aparelho**. O WhatsApp renova o QR periodicamente; cada novo QR gera um novo
e-mail numerado (`#1`, `#2`...) e **só o mais recente vale**.

## Requisitos

- Docker com o plugin **Docker Compose v2** (`docker compose ...`)
- Git
- Um celular com WhatsApp para parear
- (Opcional) Uma conta SMTP para o envio do QR por e-mail

Não é preciso ter Node, Chromium, ffmpeg ou yt-dlp instalados: tudo vai dentro
da imagem.

## Instalação (Docker)

```bash
# 1. Clonar o projeto
git clone https://github.com/jpereira/zapbot.git
cd zapbot

# 2. Criar o arquivo de configuração a partir do exemplo e editá-lo
cp config/.env.example config/.env
vim config/.env            # veja a seção "Configuração do config/.env"

# 3. O docker-compose.yml também referencia config/.env.dev (serviço de dev).
#    Mesmo usando só produção, o arquivo precisa existir:
touch config/.env.dev

# 4. Build da imagem
docker compose -f docker/docker-compose.yml build zapbot-prod

# 5. Subir o container em background
docker compose -f docker/docker-compose.yml up -d zapbot-prod

# 6. Acompanhar os logs (e ler o QR Code, se estiver no modo terminal)
docker logs -f zapbot-prod
```

> 💡 Para não repetir `-f docker/docker-compose.yml` em todo comando:
> `export COMPOSE_FILE=docker/docker-compose.yml`

Depois de ler o QR Code você deve ver nos logs:

```
[+] 🔐 Whatsapp authentication success!
[+] 🤖 ZapBot 1.3 inicializado! Informando 5521999999999@c.us
```

e receber a mesma mensagem no seu WhatsApp. Mande `/ping` para qualquer chat:
o bot deve responder `pong`.

### Atualizar para uma nova versão

```bash
git pull
docker compose -f docker/docker-compose.yml build zapbot-prod
docker compose -f docker/docker-compose.yml up -d --force-recreate zapbot-prod
```

A sessão do WhatsApp e o banco ficam em volumes, então sobrevivem ao rebuild.

> ⚠️ O `config/` é copiado para dentro da imagem no build. Não publique a imagem
> em registries públicos, pois ela contém o seu `config/.env`.

## Configuração do `config/.env`

O arquivo é carregado pelo Compose (`env_file: ../config/.env`) e as variáveis
ficam disponíveis para o bot. Nunca faça commit dele (já está no `.gitignore`).

### Docker Compose

| Variável | Exemplo | Descrição |
|---|---|---|
| `COMPOSE_PROJECT_NAME` | `zapbot` | Nome do projeto no Compose. Define o prefixo dos volumes (`zapbot_wwebjs_auth`, `zapbot_app_cache`). |
| `COMPOSE_FILE` | `docker/docker-compose.yml` | Caminho do compose. Útil se você exportar/usar este arquivo como `.env` do Compose. |

### WhatsApp

| Variável | Exemplo | Descrição |
|---|---|---|
| `PHONE_NUMBER` | `5521999999999@c.us` | **Obrigatório.** Número da conta que será pareada, no formato `DDI + DDD + número` seguido de `@c.us`, sem `+`, espaços ou traços. É para ele que o bot manda o aviso de inicialização, as notificações do `/monitor` e os alertas de uso indevido de comandos. Também aparece (mascarado) no e-mail do QR. |

### QR Code por e-mail

| Variável | Exemplo | Descrição |
|---|---|---|
| `QRCODE_EMAIL_ENABLE` | `"true"` / `"false"` | Liga o envio por e-mail. Com `false`, o QR aparece só no terminal. |
| `QRCODE_EMAIL_SMTP_HOST` | `smtp.mail.yahoo.com` | Servidor SMTP. |
| `QRCODE_EMAIL_SMTP_PORT` | `465` | Porta SMTP. **Use uma porta SSL/TLS implícita (465)**: o bot conecta com `secure: true`, portas STARTTLS como 587 não funcionam. O certificado do servidor é validado: servidores com certificado autoassinado/inválido são recusados, porque um MITM capturaria a senha e o QR Code (que dá acesso à conta). |
| `QRCODE_EMAIL_SMTP_USER` | `minhaconta@yahoo.com.br` | Usuário de login no SMTP. |
| `QRCODE_EMAIL_SMTP_PASS` | `abcd efgh ijkl mnop` | Senha do SMTP. Em Gmail/Yahoo/Outlook use uma **senha de app** (exige 2FA ativo), não a senha normal da conta. |
| `QRCODE_EMAIL_SMTP_FROM` | `ZapBot <minhaconta@yahoo.com.br>` | Remetente. O endereço deve ser o mesmo da conta SMTP, senão o provedor rejeita ou o e-mail cai no spam. |
| `QRCODE_EMAIL_SMTP_TO` | `Fulano <fulano@gmail.com>` | Destinatário que vai receber o QR. |
| `QRCODE_EMAIL_SMTP_ANTIPHISHING` | `MinhaFraseSecreta42` | Código anti-phishing exibido no corpo do e-mail. Veja abaixo. |

#### Por que configurar o e-mail com cuidado

Quando `QRCODE_EMAIL_ENABLE="true"`, **o e-mail é o único lugar onde o QR
aparece**: ele não é desenhado no terminal. Se host, porta, usuário ou senha
estiverem errados, o envio falha (o erro aparece nos logs como
`Erro ao enviar QR por email`) e o bot fica esperando um pareamento que você
nunca vai conseguir fazer.

Antes de habilitar:

1. Confira host/porta SSL do seu provedor (ex.: Gmail `smtp.gmail.com:465`,
   Yahoo `smtp.mail.yahoo.com:465`).
2. Gere uma senha de app e use-a em `QRCODE_EMAIL_SMTP_PASS`.
3. Suba o bot e verifique nos logs a linha
   `QR Code #1 received at (...) and sent to '...' (messageId=...)`.
4. Se algo der errado, coloque `QRCODE_EMAIL_ENABLE="false"` e leia o QR pelos
   logs.

Lembre também que **quem tiver acesso a esse QR pode sequestrar sua conta de
WhatsApp**: mande-o apenas para um e-mail que só você lê.

### Exemplo completo

```dotenv
COMPOSE_PROJECT_NAME="zapbot"
COMPOSE_FILE=docker/docker-compose.yml

PHONE_NUMBER=5521999999999@c.us

QRCODE_EMAIL_ENABLE="true"
QRCODE_EMAIL_SMTP_HOST="smtp.gmail.com"
QRCODE_EMAIL_SMTP_PORT="465"
QRCODE_EMAIL_SMTP_USER="meubot@gmail.com"
QRCODE_EMAIL_SMTP_PASS="abcd efgh ijkl mnop"
QRCODE_EMAIL_SMTP_FROM="ZapBot <meubot@gmail.com>"
QRCODE_EMAIL_SMTP_TO="Eu <eu@exemplo.com>"
QRCODE_EMAIL_SMTP_ANTIPHISHING="TroqueEstaFrase-7f3a"
```

## E-mail do QR Code

Assunto: **`[ZapBot] WhatsApp QR Code Authentication`**

Corpo esperado:

```
┌──────────────────────────────────────────────────────────┐
│ 🔢 QR Code:            #1                                │
│ 📱 Phone Number:       5521XXXX9999                      │
│ 🛡️ Anti-Phishing Code: TroqueEstaFrase-7f3a              │
│ 📅 Generated At:       2026-09-29 14:32:07 BRT           │
├──────────────────────────────────────────────────────────┤
│ ⚠️ Atenção: Este QR Code substitui qualquer QR Code      │
│    enviado anteriormente.                                │
├──────────────────────────────────────────────────────────┤
│ 📱 Escaneie o QR:                                        │
│                                                          │
│      ██████████████  ██  ██████████████                  │
│      ██          ██    ████          ██                  │
│      ██  ██████  ██  ██  ██  ██████  ██                  │
│      ██  ██████  ██ ████ ██  ██████  ██   (imagem PNG    │
│      ██  ██████  ██  ██  ██  ██████  ██    300×300,      │
│      ██          ██ ██   ██          ██    também em     │
│      ██████████████ ██ █ ██████████████    anexo como    │
│                                            qrcode-1.png) │
└──────────────────────────────────────────────────────────┘
```

- **QR Code #N**: contador de QRs enviados desde que o container subiu. Use
  sempre o de número mais alto.
- **Phone Number**: o `PHONE_NUMBER` com os dígitos do meio mascarados.
- **Generated At**: horário de geração (fuso `America/Sao_Paulo`).

### 🛡️ Troque o código anti-phishing!

O campo `QRCODE_EMAIL_SMTP_ANTIPHISHING` é uma frase secreta que **só você
conhece**. Ela vem em todo e-mail legítimo do bot. Se chegar um e-mail
"do ZapBot" pedindo para você escanear um QR e a frase estiver ausente ou
diferente, **é golpe**: escanear um QR de terceiros conecta a *sua* conta ao
aparelho *deles*.

- **Não use o valor do `.env.example`**: ele é público no repositório.
- Escolha algo pessoal e difícil de adivinhar, e troque se suspeitar de vazamento.

## Comandos

Os comandos são definidos em [`config/bot-config.json`](config/bot-config.json).
Podem ser enviados em **qualquer chat** (privado, grupo ou no chat consigo mesmo).

### Sintaxe geral

```
/comando [-opção] [-opção valor] [argumentos]
```

- Opções usam **um único hífen** e aceitam o nome longo ou o curto:
  `-audio` = `-a`, `-startSec 10` = `-ss 10`.
- Todo comando aceita `-help` / `-h`: `/get -h` mostra a ajuda só dele.
- `/help` lista todos; `/help get` ou `/help /get` mostram um específico.
- Aliases funcionam igual ao comando original (`/download` = `/get`).

### Permissões (`onlyAdmin`)

Comandos marcados como **admin** só executam quando enviados **pela própria
conta do bot** (você, de qualquer aparelho). Se outra pessoa tentar, nada
acontece no chat e você recebe um aviso no `PHONE_NUMBER`:

```
⚠️ Fulano tentou executar /show dentro de Família, mas sem permissão
```

As **respostas do próprio bot** também saem pela sua conta, mas nunca são
tratadas como comando, mesmo que comecem com `/`. Sem isso, alguém poderia
usar um comando que ecoa texto (ex.: `/noffa /cache -c -f`) para fazer o bot
"digitar" um comando de admin.

### Resumo

| Comando | Aliases | Admin | Descrição |
|---|---|:-:|---|
| `/help` | `/h` | | Menu de ajuda |
| `/debug` | `/d`, `/dbg` | ✅ | Liga/desliga logs de debug |
| `/uptime` | `/u` | ✅ | Tempo de execução e de conexão |
| `/ping` | `/p` | ✅ | Verifica se o bot está vivo |
| `/noffa` | `/🌈`, `/🏳️‍🌈` | | Enfeita o texto com arco-íris |
| `/everyone` | | ✅ | Menciona todos do grupo |
| `/monitor` 🚧 | `/m` | ✅ | Avisa quando números ficam online *(em desenvolvimento, desabilitado por padrão)* |
| `/crypto` | `/bitcoio`, `/creptomoeda`, `/moedinha` | | Cotação das criptos ativadas (padrão: BTC, ETH, SOL e HYPE) |
| `/sticker` | `/st` | | Transforma imagem/vídeo em figurinha |
| `/get` | `/download` | | Baixa vídeo/áudio de redes sociais |
| `/cache` | `/c` | ✅ | Uso e limpeza do cache |
| `/show` | `/undo`, `/s` | ✅ | Reexibe mensagens apagadas |
| `/set` | | ✅ | Lista e altera as configurações (settings) |
| `/watch` | `/w` | ✅ | Avisa no seu privado quando uma mensagem casa com um texto/regex |

### `/help`

Exibe o menu com todos os comandos, ou a ajuda de um só.

```
/help
/help get
/h /show
```

### `/debug` · admin

Liga/desliga o modo debug (logs detalhados no container). O estado fica salvo
no setting `debug.enabled` e sobrevive a reinícios. No primeiro boot começa
ligado só com `APP_ENV=dev`.

| Opção | Descrição |
|---|---|
| `-on` | Ativa o debug |
| `-off` | Desativa o debug |

```
/debug -on      → 🪲 Debug Ativado.
/dbg -off       → 🪲 Debug Desativado.
/debug          → mostra o estado atual
```

### `/uptime` · admin

```
/uptime
🤖 ZapBot 1.3
━━━━━━━━━━━━━━━━━━
⚡ Online: 2 dias, 3 horas
🔐 Conectado: 2 dias, 2 horas, 58 minutos
```

### `/ping` · admin

```
/ping  → pong
```

### `/noffa`

Coloca emojis de arco-íris entre as palavras. Aceita texto ou reply numa mensagem.

```
/noffa bom dia grupo
→ bom 🌈 dia 🏳️‍🌈 grupo
```

Se o texto começar com `/`, a resposta ganha um 🌈 na frente, para nunca parecer
um comando.

### `/everyone` · admin

Só em grupos. Responde à sua mensagem mencionando todos os participantes
(exceto você).

```
/everyone
```

### `/monitor` · admin · 🚧 em desenvolvimento

> 🚧 **Em desenvolvimento.** Este comando ainda não está finalizado: o
> comportamento e as opções podem mudar, e algumas partes podem não funcionar
> como descrito abaixo. Use por sua conta e risco.
>
> Por isso ele vem **desabilitado** (`"disabled": true` no
> `config/bot-config.json`): o bot não responde a `/monitor` nem `/m`, o comando
> não aparece no `/help` e os avisos de "ficou online" ficam desligados, mesmo
> para números cadastrados antes. Para testar, remova a linha `"disabled": true`
> (ou mude para `false`), refaça o build e recrie o container.

Monitora números (máx. 20, setting `monitor.max`). Quando um deles fica online, você recebe no
`PHONE_NUMBER`: `🔔 *Fulano* (5521999999999) acabou de ficar online.` Cada
evento também é registrado no banco.

| Opção | Valor | Descrição |
|---|---|---|
| `-list` | | Lista os números monitorados |
| `-logs` | | Lista o histórico de eventos |
| `-add` | `numero` | Adiciona um número |
| `-del` | `numero` | Remove um número |
| `-clean` | | Remove todos |

Aceita também a forma sem hífen:

```
/monitor -add 5521999999999
/monitor add +55 21 99999-9999
/m -list
/m logs
/monitor -del 5521999999999
/monitor -clean
```

### `/crypto`

Preço atual e variação de 24 h das moedas ativadas (via API da Binance, par
`<TOKEN>USDT`). Por padrão: BTC, ETH, SOL e HYPE.

| Opção | Descrição |
|---|---|
| *(nenhuma)* | Exibe as cotações |
| `-l`, `-list` | Lista as moedas suportadas; as ativadas vêm marcadas com `*` |
| `-a`, `-add <TOKEN>` | Ativa uma moeda suportada (só o dono do bot) |
| `-d`, `-del <TOKEN>` | Desativa uma moeda (só o dono do bot) |

Suportadas: BTC, ETH, SOL, HYPE, BNB, XRP, DOGE, ADA, TRX, AVAX, LINK, DOT, LTC,
TON, SUI, PEPE, SHIB, XLM, NEAR e UNI (lista `CRYPTO_SUPPORTED` em `app.js`).

As moedas ativadas ficam na tabela `settings`, chave `crypto.coins`, e
sobrevivem a reinícios.

```
/creptomoeda
/crypto -l
/crypto -a doge
/crypto -d hype
```

### `/sticker`

Responda (reply) a uma imagem, vídeo/GIF ou mensagem com link com `/sticker`.
Com link, o bot usa a miniatura do preview. Nome e autor da figurinha vêm dos
settings `sticker.name` e `sticker.author`.

Imagens (inclusive a miniatura do link) viram um quadrado 512x512 **enquadrado
no meio da imagem**: numa foto deitada as laterais são cortadas, numa em pé o
topo e a base. GIFs mantêm a animação. Figurinhas (WebP) vão como estão, e
vídeos respondidos com `/sticker` seguem a conversão padrão (redimensionados
sem corte). Já o `/get -sticker` enquadra o vídeo no meio, do mesmo jeito.

```
(reply numa foto)  /sticker
(reply num link)   /st
```

### `/get`

Baixa vídeos de Instagram, YouTube, X/Twitter, TikTok e outros sites
suportados pelo [yt-dlp](https://github.com/yt-dlp/yt-dlp). A URL pode vir como
argumento ou você pode dar reply numa mensagem que contenha o link.

| Opção | Valor | Descrição |
|---|---|---|
| `-sticker`, `-st` | | Envia como figurinha animada (até 6 s), enquadrada no meio do vídeo como no `/sticker` |
| `-audio`, `-a` | | Extrai só o áudio (`.mp3`) |
| `-startSec`, `-ss` | `<segundo>` | Começa a partir deste segundo |
| `-endSec`, `-es` | `<segundo>` | Corta neste segundo |
| `-verbose`, `-v` | | Mostra os parâmetros usados no yt-dlp/ffmpeg |
| `<url>` | | Link do vídeo |

O arquivo final é limitado a 20 MB (setting `get.maxSizeMB`).

Limites (o `/get` é liberado para qualquer um):

- Download de no máximo 200 MB antes da conversão (setting `get.maxDownloadMB`).
- Link de playlist baixa só o vídeo do link (`--no-playlist`).
- yt-dlp e ffmpeg são interrompidos após 5 minutos cada.
- No máximo 2 `/get` ao mesmo tempo. Os demais recebem um aviso para tentar de novo.

URLs que apontam para a rede interna (`localhost`, `10.x`, `192.168.x`,
`169.254.x`, IPv6 local etc.) são recusadas, para que o `/get` não sirva de
ponte para a sua rede (SSRF). A checagem é feita no host informado; redirects
feitos depois pelo yt-dlp não são verificados.

```
/get https://www.instagram.com/reel/XXXXXXXX/
/get -a https://youtu.be/XXXXXXXXXXX
/get -ss 10 -es 25 https://x.com/usuario/status/123456
/download -st -ss 3 -es 6 https://youtu.be/XXXXXXXXXXX
(reply numa mensagem com link)  /get -a
```

### `/cache` · admin

Mostra o espaço ocupado em `cache/` (banco, mídias, temporários).

| Opção | Descrição |
|---|---|
| `-clean`, `-c` | Remove só o que passou da janela de retenção (68 h / `cache.revokedRetentionDays` para apagadas / `watch.hitsRetentionDays` para ocorrências do `/watch`) |
| `-force`, `-f` | Junto com `-clean`: apaga **todas** as mensagens (inclusive as guardadas para o `/show`), mídias e temporários, e compacta o banco. Números e logs do `/monitor` e ocorrências do `/watch` são mantidos |

```
/cache           → lista o conteúdo de cache/ e total de mensagens
/c -clean        → limpeza normal
/cache -c -f     → limpeza geral
```

### `/show` (`/undo`, `/s`)

Reexibe mensagens apagadas deste chat que ainda estão no cache (30 dias,
setting `cache.revokedRetentionDays`). Os envios são espaçados por
`show.delayMs` (700 ms) para evitar flood.

| Opção | Valor | Descrição |
|---|---|---|
| `-N` | | Quantidade (padrão 1, máx. 20, setting `show.max`). Ex.: `-3` |
| `-list`, `-l` | | Mostra quantas apagadas existem no cache |
| `-pv` | | Envia no seu privado em vez de expor no chat atual |
| `-chat`, `-c` | `<nº\|nome>` | *(Só no seu privado)* Escolhe outro chat: nº do `/show -l` ou parte do nome |
| `-flush`, `-f` | | Remove as apagadas deste chat (no seu privado: de todos) |

```
/show                → última mensagem apagada deste chat
/show -5             → as 5 últimas
/undo -3 -pv         → as 3 últimas, enviadas no seu privado
/show -l             → contagem por chat
/show -c 2 -5        → (no seu privado) 5 últimas do chat nº 2 da lista
/show -c família     → (no seu privado) do chat cujo nome contém "família"
/show -f             → apaga do cache as apagadas deste chat
```

### `/set` · admin

Lista e altera as configurações do bot guardadas na tabela `settings` (veja
[Settings](#settings)). A mudança vale na hora e sobrevive a reinícios.

| Opção | Valor | Descrição |
|---|---|---|
| *(nenhuma)* | | Lista todas as chaves e valores |
| `<chave>` | | Mostra valor, padrão, tipo e descrição |
| `<chave> <valor>` | | Altera. Listas: itens separados por vírgula ou espaço (`watch.rules`: uma regra por linha); `""` esvazia |
| `-reset`, `-r` | `<chave>` | Volta ao valor padrão |

```
/set
/set show.max
/set show.max 10
/set debug.enabled off
/set sticker.name "Meu Bot"
/set commands.disabled noffa everyone
/set commands.disabled ""
/set -r crypto.coins
/set watch.rules ""
```

#### Settings

| Chave | Tipo | Padrão | Descrição |
|---|---|---|---|
| `debug.enabled` | on/off | `on` se `APP_ENV=dev` | Modo debug (o mesmo do `/debug`) |
| `commands.disabled` | lista | *(vazia)* | Comandos desativados em tempo de execução: o bot os ignora e eles somem do `/help`. O `/set` não pode ser desativado |
| `crypto.coins` | lista | `BTC, ETH, SOL, HYPE` | Moedas do `/crypto` (só as suportadas) |
| `sticker.name` | texto | `ZapBot` | Nome do pacote das figurinhas |
| `sticker.author` | texto | `https://github.com/jpereira/zapbot/` | Autor das figurinhas |
| `cache.revokedRetentionDays` | 1–365 | `30` | Dias que as mensagens apagadas ficam guardadas |
| `get.maxSizeMB` | 1–100 | `20` | Tamanho máximo do arquivo do `/get` |
| `get.maxDownloadMB` | 10–2000 | `200` | Tamanho máximo baixado pelo yt-dlp no `/get`, antes da conversão |
| `show.max` | 1–100 | `20` | Máximo de mensagens por `/show -N` |
| `show.delayMs` | 0–10000 | `700` | Intervalo entre os envios do `/show` |
| `monitor.max` | 1–1000 | `20` | Máximo de números monitorados |
| `watch.rules` | lista (uma por linha) | *(vazia)* | Regras do `/watch`: texto ou `/regex/flags`. Normalmente alterada pelo `/watch -a`/`-d` |
| `watch.max` | 1–100 | `20` | Máximo de regras do `/watch` |
| `watch.showMax` | 1–100 | `20` | Máximo de ocorrências listadas por `/watch -show` |
| `watch.hitsRetentionDays` | 1–365 | `30` | Dias que as ocorrências do `/watch` ficam guardadas |

Uma chave nova é declarada em `SETTINGS_SCHEMA` (`app.js`) com padrão, tipo,
descrição e limites, e lida com `getSetting('<chave>')`. Valores inválidos no
banco são ignorados no boot (vale o padrão, com aviso nos logs).

### `/watch` (`/w`) · admin

Vigia as mensagens que chegam em **qualquer chat** (privados e grupos) e, quando
alguma casa com uma regra, manda o alerta **no seu privado**:

```
👀 WATCH: MENSAGEM DETECTADA

🔎 Regra #2: /pix\s*\d+/i
👥 Grupo: Família
👤 Nome: Fulano
📱 Número: +5521999999999
📅 Enviada em: 29/09/2026, 14:32:07
💬 Texto: "me manda um pix 50 aí"
```

Tipos de regra:

- **Texto**: casa se a mensagem *contém* o texto, sem diferenciar maiúsculas
  nem acentos (`promoção` casa com `PROMOCAO`).
- **`/regex/flags`**: expressão regular do JavaScript (ex.: `/^bom dia$/i`). As
  flags `g` e `y` são ignoradas.

As regras são testadas contra o texto original da mensagem (menções como
`@111780869222483`), mas no alerta e no `-show` as menções aparecem com o nome
do contato (`@Fulano`) e o grupo com o nome atual.

| Opção | Valor | Descrição |
|---|---|---|
| *(nenhuma)* | | O mesmo que `-show`: ocorrências de todas as regras |
| `-list`, `-l` | | Lista as regras, com o nº e a quantidade de ocorrências |
| `-show`, `-s` | `[-N]` | Resumo das mensagens que casaram com a regra nº N (sem `-N`: de todas). Máx. 20 (setting `watch.showMax`) |
| `-add`, `-a` | `<PATTERN\|/REGEX/>` | Adiciona uma regra (máx. 20, setting `watch.max`). Pode ter espaços |
| `-del`, `-d` | `-N` | Remove a regra nº N e as ocorrências dela. As seguintes são renumeradas |
| `-flush`, `-f` | `[-N]` | Apaga as ocorrências da regra nº N (sem `-N`: de todas, inclusive de regras já removidas). As regras são mantidas |

```
/watch -a promoção
/watch -a "bom dia grupo"
/watch -a /pix\s*\d+/i
/watch -l
/watch -s -2       → mensagens que casaram com a regra 2
/w -s              → de todas as regras (o mesmo que /watch)
/watch -f -2       → apaga as ocorrências da regra 2
/w -f              → apaga as ocorrências de todas as regras
/watch -d -1
```

Detalhes:

- As regras ficam no setting `watch.rules` (sobrevivem a reinícios); dá para
  vê-las também com `/set watch.rules`.
- **Suas próprias mensagens e comandos são ignorados** (senão os próprios
  alertas no seu privado casariam de novo).
- A mesma mensagem não gera dois alertas para a mesma regra; se casar com várias
  regras, vem um alerta só listando todas.
- `-list` e `-show` mostram conversas de terceiros: usados fora do seu privado,
  a resposta vai para o seu privado.
- As ocorrências ficam na tabela `watch_hits` por 30 dias (setting
  `watch.hitsRetentionDays`), ou até um `/watch -f`.

### Adicionando ou alterando comandos

O arquivo tem uma chave `_about` (metadados do projeto, ignorada pelo bot) e a
lista `commands`. Cada entrada de `commands` segue este formato:

```jsonc
{
  "cmd": "/get",                     // nome principal
  "usage": "/get [OPTION]... URL",   // linha "Usage:" no -help
  "aliases": ["/download"],          // nomes alternativos
  "help": "Caso seja válido, ...",   // descrição curta
  "cmd_opts": [
    { "opts": ["audio", "a"], "values": [], "desc": "..." },          // flag
    { "opts": ["startSec", "ss"], "values": ["<second>"], "desc": "..." }, // opção com valor
    { "argv": ["<url>"], "desc": "..." }                              // argumento posicional (só doc)
  ],
  "onlyAdmin": false,                // true = só a conta do bot pode usar
  "disabled": false                  // opcional; true = o bot ignora o comando
}
```

- Alterar `help`, `usage`, `aliases`, descrições, `onlyAdmin` ou `disabled`
  não exige código: basta refazer o build e recriar o container.
- Com `"disabled": true` o comando não é carregado: o bot não responde a ele
  nem aos aliases, e ele some do `/help`. No boot aparece nos logs
  `Disabled N callers (...)`. Para desativar sem rebuild, use o setting
  `commands.disabled` (`/set commands.disabled noffa`).
- Um comando **novo** precisa de uma função em `app.js` registrada no objeto
  `HANDLERS`. No boot, o bot avisa nos logs se existir comando no JSON sem
  handler.

## Operação do dia a dia

Todos com `-f docker/docker-compose.yml` (ou `COMPOSE_FILE` exportado):

| Ação | Comando |
|---|---|
| Ver logs | `docker logs -f zapbot-prod` |
| Reiniciar | `docker compose restart zapbot-prod` |
| Parar | `docker compose stop zapbot-prod` |
| Shell no container | `docker exec -it zapbot-prod bash -l` |
| Consultar o banco | `docker exec -it zapbot-prod sqlite3 cache/bot_database.db` |
| Ver configurações | `docker exec -it zapbot-prod sqlite3 cache/bot_database.db "SELECT * FROM settings"` |
| Limpar mensagens/mídias | `docker exec -it zapbot-prod sh -c 'rm -rf cache/tmp cache/media && sqlite3 cache/bot_database.db "DELETE FROM messages"'` |
| **Forçar novo QR** (apaga a sessão) | `docker compose down && docker volume rm zapbot_wwebjs_auth && docker compose up -d zapbot-prod` |

O container usa `restart: unless-stopped`, então volta sozinho após reboot do
host.

### Desenvolvimento

O serviço `zapbot-dev` monta o código-fonte em `/workspace` e usa
`config/.env.dev`. O `Makefile` tem atalhos:

```bash
make help    # lista todos os alvos
make build   # build da imagem zapbot-dev
make shell   # shell dentro do container de dev; rode "node app.js" lá dentro
```

Os alvos `deploy.*` do `Makefile` fazem deploy num Docker remoto via SSH;
ajuste `DOCKER_REMOTE_SERVER` para o seu host antes de usá-los. Eles usam
`docker --context homelab` em cada comando, sem trocar o contexto global do
Docker.

## Solução de problemas

| Sintoma | Causa provável / solução |
|---|---|
| `env file .../config/.env.dev not found` | Crie o arquivo: `touch config/.env.dev`. |
| QR não aparece nos logs | `QRCODE_EMAIL_ENABLE` está `"true"`. Veja o e-mail ou mude para `"false"`. |
| `Erro ao enviar QR por email` | Host/porta/usuário/senha SMTP errados. Use porta 465 e senha de app. |
| `Erro ao enviar QR por email: ... self-signed certificate` / `unable to verify` | O certificado do SMTP não é válido. Use o host oficial do provedor (o nome precisa bater com o certificado). |
| E-mail do QR chega no spam | `QRCODE_EMAIL_SMTP_FROM` diferente da conta SMTP. |
| `Motivo 'LOGOUT' exige ação manual` | Sessão desconectada pelo celular. Reinicie o container para gerar novo QR. |
| `Motivo 'CONFLICT' ...` | O WhatsApp Web foi aberto em outro lugar com a mesma sessão, ou há dois containers rodando. |
| `browser is already running` | Lock antigo do Chromium; o entrypoint limpa no boot. Reinicie o container. |
| Comando admin não responde a outra pessoa | Esperado: veja [Permissões](#permissões-onlyadmin). |
| `/get` falha em algum site | O site mudou; refaça o build (`--no-cache`) para pegar o yt-dlp mais recente. |

---

Feito por **Jorge Pereira**. Contribuições são bem-vindas via issues e pull
requests.
