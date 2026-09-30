# 🤖 ZapBot v1.7

> 🇧🇷 **Projeto em português (pt_BR).** Documentação, comandos e mensagens do bot
> estão em português do Brasil.

Bot para WhatsApp escrito em Node.js que roda em cima de uma sessão real do
WhatsApp Web. Ele recupera mensagens (e status) apagadas e editadas, baixa
vídeos de redes sociais, cria figurinhas, vigia mensagens por texto/regex e te
avisa no privado, monitora quando contatos ficam online (em desenvolvimento),
traz notícias, tempo e CVEs, conversa com o ChatGPT e mais algumas brincadeiras,
tudo por comandos digitados no próprio chat (`/help`, `/get`, `/show`, `/news`,
`/gpt`...).

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
 │     ├──► APIs HTTP (axios)  /gpt /tempo /cve /news /gif...     │
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
  e podem ser reexibidas com `/show`. Status (textos/fotos/vídeos) apagados
  também são recuperados, com o título `📸 STATUS APAGADO DETECTADO`
  (desative com `/set revoke.status off`).
- **Editadas**: quando alguém edita uma mensagem, o bot grava o texto de antes
  e o de depois (tabela `message_edits`) e te avisa **no seu privado** com o
  título `✏️ MENSAGEM EDITADA DETECTADA` (desative o aviso com
  `/set edit.alert off`; a edição continua guardada). As edições ficam 30 dias
  (setting `cache.editedRetentionDays`) e podem ser reexibidas com
  [`/edit`](#edit-e--admin). As suas próprias edições são ignoradas.
- **Limpeza automática**: a cada 10 minutos o bot remove do banco/disco as
  mensagens comuns com mais de 68 h (janela máxima que o WhatsApp permite
  apagar), as apagadas e as editadas com mais de 30 dias e as ocorrências do
  `/watch` com mais de 30 dias (setting `watch.hitsRetentionDays`).
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
  (nome, aliases, opções, ajuda, permissão) e implementados em `app.js`. Os que
  consultam a internet (`/gpt`, `/tempo`, `/cve`, `/news`...) usam os serviços
  da tabela [Serviços externos](#serviços-externos).
- **Controle**: o [`/bot`](#bot--admin) liga/desliga todos os comandos
  (`-on`/`-off`) e o modo admin (`+admin`/`-admin`), em que só você usa
  comandos.
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
[+] 🤖 ZapBot 1.7 inicializado! Informando 5521999999999@c.us
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

### Serviços externos

Comandos que consultam serviços na internet. Só dois precisam de chave; os
outros funcionam sem configuração.

| Comando | Serviço | Chave |
|---|---|---|
| `/gpt` | [OpenAI](https://platform.openai.com/) (pago por uso) | `OPENAI_API_KEY` ou setting `openai.api.key` |
| `/gif` | [GIPHY](https://developers.giphy.com/) (grátis, 100 chamadas/hora) | `GIPHY_API_KEY` ou setting `gif.giphy.api.key` |
| `/tempo` | [Open-Meteo](https://open-meteo.com/) | — |
| `/cve`, `/ualisu` | [NVD](https://nvd.nist.gov/) (~5 consultas a cada 30 s) | — |
| `/news` | Feeds RSS (g1, Gazeta do Povo, The Hacker News...) | — |
| `/crypto` | [Binance](https://www.binance.com/) | — |
| `/kernel` | [kernel.org](https://www.kernel.org/) | — |
| `/meme` | [imgflip](https://imgflip.com/) | — |
| `/joke` | [JokeAPI](https://jokeapi.dev/) | — |

Para as chaves, a variável do `config/.env` tem prioridade; se estiver vazia,
vale o setting, que dá para trocar pelo WhatsApp com `/set` sem reiniciar.

### OpenAI (opcional)

| Variável | Exemplo | Descrição |
|---|---|---|
| `OPENAI_API_KEY` | `sk-proj-...` | Chave da OpenAI usada pelo `/gpt`. Se estiver vazia, o bot usa o setting `openai.api.key`; sem nenhuma das duas o `/gpt` fica desativado. |
| `OPENAI_MODEL` | `gpt-4o-mini` | Modelo do `/gpt` (padrão: `gpt-4o-mini`). |
| `OPENAI_TIMEOUT_MS` | `60000` | Tempo máximo de espera pela resposta, em ms. Se estiver vazio, o bot usa o setting `openai.timeout.ms` (60000). |

### GIPHY (opcional)

| Variável | Exemplo | Descrição |
|---|---|---|
| `GIPHY_API_KEY` | | Chave do GIPHY usada pelo `/gif` ([developers.giphy.com](https://developers.giphy.com/)). Se estiver vazia, o bot usa o setting `gif.giphy.api.key` (`/set gif.giphy.api.key <chave>`). |

#### Como gerar a chave do GIPHY (grátis)

1. Crie uma conta (ou entre) em [developers.giphy.com](https://developers.giphy.com/)
   e abra o **Dashboard**.
2. Clique em **Create an API Key** e escolha a opção **API** (a opção SDK é
   para apps mobile).
3. Dê um nome ao app (ex.: `zapbot`) e uma descrição curta, aceite os termos
   e confirme.
4. A chave aparece no Dashboard. Copie e configure de um dos jeitos:
   - no `config/.env`: `GIPHY_API_KEY=suachave` (vale no próximo start), ou
   - pelo WhatsApp, sem reiniciar: `/set gif.giphy.api.key suachave` (o
     `GIPHY_API_KEY` do `.env`, se existir, tem prioridade).

A chave nova é do tipo **beta**: gratuita, mas limitada a **100 chamadas por
hora**, o que sobra para o `/gif`. Acima disso a API responde `429` e o
comando avisa que não conseguiu buscar o GIF. Para mais que isso é preciso
pedir a chave de produção no próprio Dashboard.

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
| `/boletos` | | ✅ | Sorteia 2 membros para "pagar um boleto" |
| `/bot` | | ✅ | Liga/desliga todos os comandos (`-on`/`-off`) e o modo admin (`+admin`/`-admin`) |
| `/cache` | `/c` | ✅ | Uso e limpeza do cache |
| `/crypto` | `/bitcoio`, `/creptomoeda`, `/moedinha` | | Cotação das criptos ativadas (padrão: BTC, ETH, SOL e HYPE) |
| `/cve` | | | Últimas CVEs publicadas (NVD); `-highscore` só as críticas |
| `/debug` | `/d`, `/dbg` | ✅ | Liga/desliga logs de debug |
| `/edit` | `/e` | ✅ | Reexibe mensagens editadas (antes e depois) |
| `/everyone` | | ✅ | Menciona todos do grupo |
| `/get` | `/download` | | Baixa vídeo/áudio de redes sociais |
| `/gif` | | | GIF aleatório (GIPHY) |
| `/gpt` | `/ai` | ✅ | Pergunta ao ChatGPT (OpenAI) |
| `/help` | `/h` | | Menu de ajuda |
| `/joke` | `/piada`, `/humor` | | Piada aleatória em português |
| `/kernel` | | | Versões atuais do kernel Linux (kernel.org) |
| `/listageral` | | ✅ | Lista os membros do grupo |
| `/meme` | | | Template de meme aleatório (imgflip) |
| `/monitor` 🚧 | `/m` | ✅ | Avisa quando números ficam online *(em desenvolvimento, desabilitado por padrão)* |
| `/news` | | ✅ | Manchetes de feeds RSS: `-hack`, `-g1`, `-gazeta`, `-brasil` |
| `/noffa` | `/🌈`, `/🏳️‍🌈` | | Enfeita o texto com arco-íris |
| `/ping` | `/p` | ✅ | Verifica se o bot está vivo |
| `/set` | | ✅ | Lista e altera as configurações (settings) |
| `/show` | `/undo`, `/s` | ✅ | Reexibe mensagens apagadas |
| `/sticker` | `/st` | | Transforma imagem/vídeo em figurinha |
| `/tempo` | `/weather` | | Tempo agora e máx./mín. do dia (Open-Meteo); sem cidade usa `tempo.city` |
| `/ualisu` | | ✅ | Marca 2 membros com uma CVE aleatória |
| `/uptime` | `/u`, `/up` | ✅ | Tempo de execução e de conexão |
| `/version` | `/ver` | ✅ | Versão do bot (mesmo banner do `/uptime`) |
| `/watch` | `/w` | ✅ | Avisa no seu privado quando uma mensagem casa com um texto/regex |

### `/boletos` · admin

Só em grupos: sorteia 2 membros diferentes (fora o bot) e os marca para "pagar
um boleto".

### `/bot` · admin

Controla quem pode usar o bot. Tem dois interruptores independentes, que
sobrevivem a reinícios:

- **Ligado/desligado** (setting `bot.paused`, padrão ligado): desligado, o bot
  ignora **todos** os comandos, inclusive os seus, exceto o próprio `/bot`.
- **Modo admin** (setting `bot.adminMode`, padrão ligado): ligado, só você
  usa comandos; os de qualquer outra pessoa são ignorados em silêncio, mesmo
  os que normalmente são liberados (`/ping`, `/tempo`...).

| Opção | Descrição |
|---|---|
| *(nenhuma)* | Mostra o estado dos dois |
| `-on` | Liga o bot |
| `-off` | Desliga o bot |
| `+admin` | Liga o modo admin |
| `-admin` | Desliga o modo admin (cada comando volta a seguir a coluna *Admin* da [tabela de comandos](#comandos)) |

As opções combinam; `-on` com `-off` (ou `+admin` com `-admin`) no mesmo
comando é recusado. A resposta sempre mostra o estado final:

```
/bot               → ▶️ Bot: ativo
                     🔓 Modo admin: desligado
/bot +admin        → ▶️ Bot: ativo
                     🔒 Modo admin: ligado (só o dono usa comandos)
/bot -admin        → volta a liberar os comandos públicos para todos
/bot -off          → ⏸️ Bot: desligado (todos os comandos são ignorados)
/bot -on -admin    → liga o bot e desliga o modo admin de uma vez
/bot -h            → ajuda do comando
```

Quando usar cada um:

| Situação | Comando |
|---|---|
| Alguém está abusando dos comandos num grupo | `/bot +admin` |
| Vários zapbots no mesmo grupo e você quer que só o seu responda a você | `/bot +admin` |
| Parar o bot por completo por um tempo, sem derrubar o container | `/bot -off` |
| Voltar ao normal | `/bot -on -admin` |

Detalhes:

- Com o bot desligado o `/set` também é ignorado: para ligar use sempre o
  `/bot -on`. Com ele ligado, `/set bot.paused` e `/set bot.adminMode` têm o
  mesmo efeito das opções.
- Se o bot reiniciar desligado ou em modo admin, a mensagem de inicialização
  no seu privado avisa.
- Só os **comandos** são afetados: a recuperação de mensagens apagadas e
  editadas, o `/watch` e as notificações do `/monitor` continuam funcionando.
- Comandos ignorados aparecem no log: `Comando '/ping' ignorado: bot
  desligado` (sempre) e `Comando '/ping' de Fulano ignorado: modo admin` (só
  com o [debug](#debug--admin) ligado).
- "Você" é a conta pareada ao bot, de qualquer aparelho. Para desligar só
  alguns comandos, para todos, use o setting `commands.disabled`.

### `/cache` · admin

Mostra o espaço ocupado em `cache/` (banco, mídias, temporários).

| Opção | Descrição |
|---|---|
| `-clean`, `-c` | Remove só o que passou da janela de retenção (68 h / `cache.revokedRetentionDays` para apagadas / `cache.editedRetentionDays` para editadas / `watch.hitsRetentionDays` para ocorrências do `/watch`) |
| `-force`, `-f` | Junto com `-clean`: apaga **todas** as mensagens (inclusive as guardadas para o `/show` e o `/edit`), mídias e temporários, e compacta o banco. Números e logs do `/monitor` e ocorrências do `/watch` são mantidos |

```
/cache           → lista o conteúdo de cache/ e total de mensagens
/c -clean        → limpeza normal
/cache -c -f     → limpeza geral
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

### `/cve`

Lista as CVEs publicadas mais recentemente no [NVD](https://nvd.nist.gov/)
(base oficial do NIST), da mais nova para a mais antiga. Cada uma vem com o ID,
a nota CVSS e a severidade, um resumo da descrição e o link para a página no NVD.

| Opção | Valor | Descrição |
|---|---|---|
| `max` | | Quantidade de CVEs, de 1 a 20. Sem o valor usa o setting `cve.max` (10) |
| `-highscore`, `-high` | `[max]` | Só as `max` críticas (CVSS v3 `CRITICAL`, nota ≥ 9) mais recentes, de 1 a 20, dos últimos `cve.maxDays` dias (7). Sem o valor usa o setting `cve.max` (10) |

```
/cve                 → as 10 mais recentes dos últimos 2 dias
/cve 5               → só as 5 mais recentes dos últimos 2 dias
/cve -high           → as 10 críticas mais recentes dos últimos 7 dias
/cve -high 2         → só as 2 críticas mais recentes dos últimos 7 dias
/set cve.max 5       → passa a exibir 5 por vez
/set cve.maxDays 30  → o -highscore passa a olhar os últimos 30 dias
```

Exemplo de resposta:

```
🔥 3 CVEs críticas mais recentes (CVSS ≥ 9, últimos 7 dias)

🛡️ CVE-2026-103056 — 9 CRITICAL
AiSOC versions 7.2.0 before 12.0.0 contain a command injection …
https://nvd.nist.gov/vuln/detail/CVE-2026-103056
```

Detalhes:

- A quantidade exibida vem do setting `cve.max` (padrão 10, máx. 20). O `max`
  do comando (`/cve 5` ou `/cve -high 5`) sobrepõe o `cve.max` só naquela
  chamada; valores fora de 1–20 (ou que não são números) são recusados com uma
  mensagem de ajuda.
- A janela do `-highscore` vem do setting `cve.maxDays` (padrão 7). O NVD não
  aceita janelas maiores que 120 dias, por isso o setting vai de 1 a 120.
- A nota exibida segue a ordem CVSS v3.1 → v4.0 → v3.0 → v2, preferindo a
  métrica principal (do NVD). CVEs recém-publicadas podem vir ainda sem nota.
- O filtro de críticas usa a severidade CVSS v3: CVEs avaliadas só em v4.0 ou
  v2 não entram no `-highscore`.
- Sem chave de API, o NVD aceita cerca de 5 consultas a cada 30 s e às vezes
  demora. Cada `/cve` faz 2 consultas (o NVD só ordena da mais antiga para a
  mais nova: uma conta o total e a outra busca o final da lista). Em erro, o
  bot pede para tentar de novo em 30 s.

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

### `/edit` (`/e`) · admin

Reexibe mensagens editadas deste chat que ainda estão no cache (30 dias,
setting `cache.editedRetentionDays`), com o texto de antes e o de depois.
Funciona como o `/show`: mesmas opções, mesmo limite (`show.max`) e mesmo
intervalo entre os envios (`show.delayMs`). Cada edição é um item: uma
mensagem editada duas vezes aparece duas vezes.

| Opção | Valor | Descrição |
|---|---|---|
| `-N` | | Quantidade (padrão 1, máx. 20, setting `show.max`). Ex.: `-3` |
| `-list`, `-l` | | A mesma lista do `/show -l`: apagadas e editadas por chat |
| `-pv` | | Envia no seu privado em vez de expor no chat atual |
| `-chat`, `-c` | `<nº\|nome>` | Escolhe outro chat: nº da lista de **editadas** do `/edit -l` ou parte do nome |
| `-flush`, `-f` | | Remove as editadas deste chat (no seu privado: de todos) |

```
/edit                → última mensagem editada deste chat
/e -3 -pv            → as 3 últimas, enviadas no seu privado
/edit -c 1 -5        → 5 últimas do chat nº 1 da lista de editadas
/edit -f             → apaga do cache as editadas deste chat
```

```
✏️ MENSAGEM EDITADA (1/1)

👥 Grupo: Trabalho
👤 Nome: Fulano
📱 Número: +5521999999999
📅 Enviada em: 30/09/2026, 11:14:03
✏️ Editada em: 30/09/2026, 11:15:42
📝 Antes: "reunião às 14h"
💬 Depois: "reunião às 15h"
```

### `/everyone` · admin

Só em grupos. Responde à sua mensagem mencionando todos os participantes
(exceto você).

```
/everyone
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

### `/gif [tag]`

GIF aleatório do GIPHY, enviado como vídeo em loop. Sem tag usa o setting
`gif.tag`. Precisa de uma chave do GIPHY: `GIPHY_API_KEY` no `config/.env` ou,
se ela não existir, o setting `gif.giphy.api.key` (`/set gif.giphy.api.key <chave>`).

### `/gpt` (`/ai`) · admin

Pergunta ao ChatGPT pela API da OpenAI e responde no chat. Respondendo uma
mensagem, o texto dela entra antes da pergunta. Enquanto espera a resposta, o
bot aparece como "digitando...". Sem pergunta, mostra a ajuda.

```
/gpt explique o que é SSRF em 3 linhas
/ai qual a capital da Mongólia?
/gpt resuma          (respondendo uma mensagem)
/gpt -h              → ajuda do comando
```

#### Configurando a chave

O `/gpt` precisa de uma API key da OpenAI (paga por uso: crie em
[platform.openai.com/api-keys](https://platform.openai.com/api-keys)). Ela é
procurada nesta ordem:

1. `OPENAI_API_KEY` no `config/.env` (vale no próximo start);
2. o setting `openai.api.key`, que dá para trocar pelo WhatsApp sem reiniciar:
   `/set openai.api.key sk-proj-...` (exibido mascarado; `/set -reset
   openai.api.key` apaga).

Sem nenhuma das duas o `/gpt` fica **desativado** e responde `API key da
OpenAI não encontrada`. O tempo máximo de espera segue a mesma ordem:
`OPENAI_TIMEOUT_MS` no `.env` ou o setting `openai.timeout.ms` (padrão 60000,
de 5000 a 300000). Um valor inválido no `.env` é ignorado (com aviso no log) e
vale o setting. O modelo vem do `OPENAI_MODEL` (padrão `gpt-4o-mini`).

Detalhes:

- É só do dono do bot para ninguém dos grupos gastar os seus créditos.
- Erros comuns têm resposta própria: chave inválida (`🔑`), limite ou créditos
  esgotados (`💸`) e demora maior que o timeout (`⏱️`). Os outros mostram a
  mensagem da API.
- A chave nunca vai para o chat nem para o log.
- Se a resposta começar com `/`, o bot põe um `🤖` na frente, para ela não
  ser lida como comando.

### `/help`

Exibe o menu com todos os comandos, ou a ajuda de um só.

```
/help
/help get
/h /show
```

### `/joke` (`/piada`, `/humor`)

Piada em português da [JokeAPI](https://jokeapi.dev/) (safe-mode).

### `/kernel`

Versões mainline, stable e longterm publicadas em `kernel.org/releases.json`.

### `/listageral` · admin

Só em grupos: lista os membros (número, nome, 👑 dono, ⭐ admin).

### `/meme [busca]`

Template de meme aleatório do [imgflip](https://imgflip.com/), opcionalmente
filtrado pelo nome (`/meme drake`).

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

### `/news` · admin

Junta as manchetes mais recentes dos feeds RSS de uma categoria, com fonte,
data e link. Sem categoria, mostra a ajuda com todas as opções. Só o dono do
bot usa: o `/news` de qualquer outra pessoa é ignorado em silêncio.

| Opção | Valor | Descrição |
|---|---|---|
| `-hack`, `-hacknews` | | Hacking/segurança: The Hacker News, BleepingComputer e Krebs on Security (setting `news.hack`) |
| `-g1` | | Últimas notícias do [g1](https://g1.globo.com/) (setting `news.g1`) |
| `-gazeta`, `-gaz` | | [Gazeta do Povo](https://www.gazetadopovo.com.br/), seção Brasil (setting `news.gazeta`) |
| `-brasil`, `-br` | | Blogs sobre o Brasil listados no [feedspot](https://rss.feedspot.com/brazil_rss_feeds/), a maioria em inglês (setting `news.brasil`) |
| `quantidade` | 1–10 | Quantas manchetes. Sem ela usa o setting `news.max` (5) |

```
/news                → ajuda com todas as opções
/news -g1            → as 5 mais recentes do g1
/news -gazeta 3      → as 3 mais recentes da Gazeta do Povo
/news -br 5          → as 5 mais recentes dos blogs sobre o Brasil
/news -hack 10       → as 10 mais recentes de hacking
/news -g1 -gazeta 6  → g1 e Gazeta juntos (3 de cada, no máximo)
/news -h             → ajuda do comando
```

Exemplo de resposta:

```
📰 g1

1. Debate com candidatos ao governo de Rondônia é marcado por acusações …
g1 · 30/09/2026, 00:29:33
https://g1.globo.com/ro/rondonia/eleicoes/2026/noticia/...
```

#### Alterando os feeds

Cada categoria lê a lista do seu setting (`news.<categoria>`), que aceita
qualquer feed RSS:

```
/set news.g1 https://g1.globo.com/rss/g1/economia/
/set news.hack https://feeds.feedburner.com/TheHackersNews https://krebsonsecurity.com/feed/
/set -reset news.g1                → volta ao padrão
/set news.max 3                    → muda a quantidade padrão
```

Detalhes:

- Várias categorias no mesmo comando somam os feeds.
- Cada fonte ocupa no máximo a sua fatia da lista (ex.: 6 manchetes de 2
  feeds → até 3 de cada); senão a que publica mais toma tudo.
- Um feed fora do ar não derruba os outros: ele só aparece no log.
- O `-brasil` lê cerca de 15 feeds de uma vez; a página do feedspot é HTML,
  então os feeds dela foram copiados para o setting `news.brasil` (não é
  lida a cada uso).
- Os feeds precisam ser RSS (`<item>`); feeds só em Atom (`<entry>`) não são
  lidos.

### `/noffa`

Coloca emojis de arco-íris entre as palavras. Aceita texto ou reply numa mensagem.

```
/noffa bom dia grupo
→ bom 🌈 dia 🏳️‍🌈 grupo
```

Se o texto começar com `/`, a resposta ganha um 🌈 na frente, para nunca parecer
um comando.

### `/ping` · admin

```
/ping  → pong
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
| `bot.adminMode` | on/off | `on` | Modo admin: só você usa comandos (o mesmo do `/bot +admin`/`-admin`) |
| `bot.paused` | on/off | `off` | Bot desligado: todos os comandos ignorados, exceto o `/bot` (o mesmo do `/bot -on`/`-off`) |
| `cache.editedRetentionDays` | 1–365 | `30` | Dias que as mensagens editadas ficam guardadas para o `/edit` |
| `cache.revokedRetentionDays` | 1–365 | `30` | Dias que as mensagens apagadas ficam guardadas |
| `commands.disabled` | lista | *(vazia)* | Comandos desativados em tempo de execução: o bot os ignora e eles somem do `/help`. O `/set` não pode ser desativado |
| `crypto.coins` | lista | `BTC, ETH, SOL, HYPE` | Moedas do `/crypto` (só as suportadas) |
| `cve.max` | 1–20 | `10` | Quantidade de CVEs exibidas pelo `/cve` (o `/cve <max>` sobrepõe) |
| `cve.maxDays` | 1–120 | `7` | Janela, em dias, do `/cve -highscore` |
| `debug.enabled` | on/off | `on` se `APP_ENV=dev` | Modo debug (o mesmo do `/debug`) |
| `edit.alert` | on/off | `on` | Avisa no seu privado quando alguém edita uma mensagem; `off` só guarda para o `/edit` |
| `get.maxDownloadMB` | 10–2000 | `200` | Tamanho máximo baixado pelo yt-dlp no `/get`, antes da conversão |
| `get.maxSizeMB` | 1–100 | `20` | Tamanho máximo do arquivo do `/get` |
| `gif.giphy.api.key` | texto (pode ser vazio) | *(vazio)* | Chave do GIPHY, usada quando `GIPHY_API_KEY` não está no `config/.env`. Exibida mascarada (`••••1234`); `/set -reset gif.giphy.api.key` apaga |
| `gif.tag` | texto | `fail` | Tag padrão do `/gif` |
| `monitor.max` | 1–1000 | `20` | Máximo de números monitorados |
| `news.brasil` | lista | 15 blogs do [feedspot](https://rss.feedspot.com/brazil_rss_feeds/) | Feeds RSS do `/news -brasil` |
| `news.g1` | lista | `https://g1.globo.com/dynamo/rss2.xml` | Feeds RSS do `/news -g1` |
| `news.gazeta` | lista | `https://www.gazetadopovo.com.br/feed/rss/brasil.xml` | Feeds RSS do `/news -gazeta` |
| `news.hack` | lista | The Hacker News, BleepingComputer, Krebs on Security | Feeds RSS do `/news -hack` |
| `news.max` | 1–10 | `5` | Manchetes exibidas pelo `/news` (o `/news <quantidade>` sobrepõe) |
| `openai.api.key` | texto (pode ser vazio) | *(vazio)* | Chave da OpenAI, usada quando `OPENAI_API_KEY` não está no `config/.env`. Exibida mascarada (`••••1234`); `/set -reset openai.api.key` apaga |
| `openai.timeout.ms` | 5000–300000 | `60000` | Timeout do `/gpt`, usado quando `OPENAI_TIMEOUT_MS` não está no `config/.env` |
| `revoke.status` | on/off | `on` | Recupera status apagados; `off` ignora (nem alerta, nem `/show`) |
| `show.delayMs` | 0–10000 | `700` | Intervalo entre os envios do `/show` e do `/edit` |
| `show.max` | 1–100 | `20` | Máximo de mensagens por `/show -N` e `/edit -N` |
| `sticker.author` | texto | `https://github.com/jpereira/zapbot/` | Autor das figurinhas |
| `sticker.name` | texto | `ZapBot` | Nome do pacote das figurinhas |
| `tempo.city` | texto | `Niteroi, Rio de Janeiro, Brazil` | Cidade do `/tempo` quando nenhuma é informada |
| `watch.hitsRetentionDays` | 1–365 | `30` | Dias que as ocorrências do `/watch` ficam guardadas |
| `watch.max` | 1–100 | `20` | Máximo de regras do `/watch` |
| `watch.rules` | lista (uma por linha) | *(vazia)* | Regras do `/watch`: texto ou `/regex/flags`. Normalmente alterada pelo `/watch -a`/`-d` |
| `watch.showMax` | 1–100 | `20` | Máximo de ocorrências listadas por `/watch -show` |

Uma chave nova é declarada em `SETTINGS_SCHEMA` (`app.js`) com padrão, tipo,
descrição e limites (`allowEmpty` para texto que pode ficar vazio, `secret`
para mascarar o valor no `/set` e nos logs), e lida com
`getSetting('<chave>')`. Valores inválidos no
banco são ignorados no boot (vale o padrão, com aviso nos logs). Ao renomear
uma chave, registre `antiga → nova` em `SETTINGS_RENOMEADOS`: no boot o valor
salvo passa para o nome novo (ex.: `api.key.giphy` → `gif.giphy.api.key`).

### `/show` (`/undo`, `/s`) · admin

Reexibe mensagens apagadas deste chat que ainda estão no cache (30 dias,
setting `cache.revokedRetentionDays`). Os envios são espaçados por
`show.delayMs` (700 ms) para evitar flood.

| Opção | Valor | Descrição |
|---|---|---|
| `-N` | | Quantidade (padrão 1, máx. 20, setting `show.max`). Ex.: `-3` |
| `-list`, `-l` | | Lista as apagadas **e as editadas** do cache por chat (em qualquer chat), marcando com `← este chat` o chat atual. É a mesma lista do `/edit -l` |
| `-pv` | | Envia no seu privado em vez de expor no chat atual |
| `-chat`, `-c` | `<nº\|nome>` | Escolhe outro chat: nº da lista de **deletadas** do `/show -l` ou parte do nome. Funciona em qualquer chat; junte `-pv` para não expor as mensagens no chat atual |
| `-flush`, `-f` | | Remove as apagadas deste chat (no seu privado: de todos) |

```
/show                → última mensagem apagada deste chat
/show -5             → as 5 últimas
/undo -3 -pv         → as 3 últimas, enviadas no seu privado
/show -l             → apagadas e editadas, por chat
/show -l -pv         → a mesma lista, enviada no seu privado
/show -c 2 -5        → 5 últimas do chat nº 2 da lista de deletadas
/show -c família -pv → do chat cujo nome contém "família", no seu privado
/show -f             → apaga do cache as apagadas deste chat
```

O `-l` (no `/show` ou no `/edit`) mostra os dois tipos, cada um com a sua
numeração para o `-c`:

```
🗄️ Mensagens no cache

🗑️ Deletadas: 3 (1 com mídia · a mais antiga expira em 29 dias)
1. 👥 Família — 2 (última 30/09/2026, 10:02:11) ← este chat
2. 👤 Beltrano — 1 (última 30/09/2026, 09:40:05)

✏️ Editadas: 1 (a mais antiga expira em 30 dias)
1. 👥 Trabalho — 1 (última 30/09/2026, 11:15:42)

💡 /show -N reexibe as deletadas e /edit -N as editadas deste chat (máx. 20).
💡 Junte -c <nº ou nome> para outro chat: o nº é o da lista do tipo (/show -c 2, /edit -c 1).
💡 -pv envia no seu privado; -f remove do cache as deste chat (no seu privado: de todos).
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

### `/tempo` (`/weather`)

Tempo agora (condição, temperatura, sensação, umidade e vento), máxima, mínima e
chance de chuva do dia, pela [Open-Meteo](https://open-meteo.com/) (gratuita,
sem chave de API).

| Argumento | Descrição |
|---|---|
| `[cidade]` | Cidade a consultar, opcionalmente com estado e país separados por vírgula. Sem ela usa o setting `tempo.city` |

```
/tempo                         → cidade padrão (tempo.city)
/tempo Rio de Janeiro          → Rio de Janeiro, RJ
/tempo Niteroi, Sergipe        → Niterói de Sergipe (não a do RJ)
/tempo Paris, Texas            → Paris dos EUA (não a da França)
/weather Lisboa                → o mesmo, pelo alias
/tempo -h                      → ajuda do comando
```

Exemplo de resposta:

```
⛅ Tempo em Niterói, Rio de Janeiro, Brasil

Parcialmente nublado
🌡️ Agora: 24°C (sensação 25°C)
📈 Máx: 27°C  📉 Mín: 20°C
💧 Umidade: 78%  🌬️ Vento: 12 km/h
☔ Chance de chuva: 35%
```

#### Alterando a cidade padrão

A cidade usada pelo `/tempo` sem argumento fica no setting `tempo.city`
(padrão `Niteroi, Rio de Janeiro, Brazil`). Para trocar, mande no WhatsApp
(o `/set` é só do dono do bot):

```
/set tempo.city São Paulo, Sao Paulo, Brazil
/set tempo.city                  → mostra o valor atual
/set -reset tempo.city           → volta para Niteroi, Rio de Janeiro, Brazil
```

A mudança vale na hora, sem reiniciar. Dicas:

- Use `cidade, estado, país` quando o nome se repete em outros lugares: só
  `Niteroi` também funciona, mas a busca escolhe a mais relevante com esse nome
  (normalmente a mais populosa).
- Acentos são opcionais (`Niteroi` ou `Niterói`) e o país pode estar em
  português ou inglês.
- Se a cidade não for encontrada o bot responde `❌ Cidade não encontrada`;
  teste antes com `/tempo <cidade>` e só depois grave no `tempo.city`.

### `/ualisu` · admin

Só em grupos: o Walissu CVE BOT sorteia 2 membros diferentes (fora o bot), os
marca e responde com uma CVE aleatória entre as 50 publicadas mais
recentemente no [NVD](https://nvd.nist.gov/) nos últimos 2 dias.

```
/ualisu
```

Exemplo de resposta:

```
Hey @Fulano e @Beltrano, aqui é o Walissu CVE BOT! Dá uma olhada nesse CVE ou você vai sair da rave 😊

🛡️ CVE-2026-103056 — 9 CRITICAL
AiSOC versions 7.2.0 before 12.0.0 contain a command injection …
https://nvd.nist.gov/vuln/detail/CVE-2026-103056

Cadê o exploit? Preciso sair de Brasília!
```

Detalhes:

- Usa o mesmo sorteio do [`/boletos`](#boletos--admin) e a mesma consulta do
  [`/cve`](#cve): grupos com menos de 2 membros (fora o bot) são recusados, e
  vale o limite do NVD sem chave (~5 consultas a cada 30 s).
- A CVE pode vir de qualquer severidade; nos raros dias sem nenhuma publicação
  o bot avisa em vez de marcar alguém.

### `/uptime` (`/u`, `/up`) · admin

```
/uptime
🤖 ZapBot 1.7
━━━━━━━━━━━━━━━━━━
⚡ Online: 2 dias, 3 horas
🔐 Conectado: 2 dias, 2 horas, 58 minutos
```

### `/version` (`/ver`) · admin

Exibe o mesmo banner do `/uptime`, com a versão do bot.

```
/ver
🤖 ZapBot 1.7
━━━━━━━━━━━━━━━━━━
⚡ Online: 2 dias, 3 horas
🔐 Conectado: 2 dias, 2 horas, 58 minutos
```

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
make clean   # remove a imagem zapbot-dev
make destroy # clean + apaga os volumes de dev (sessão do WhatsApp e cache!)
```

Os alvos `deploy.*` do `Makefile` fazem deploy num Docker remoto via SSH;
ajuste `DOCKER_REMOTE_SERVER` para o seu host antes de usá-los. Eles usam
`docker --context homelab` em cada comando, sem trocar o contexto global do
Docker.

### Nova versão

O `bump.sh` incrementa a última tag `release-X.Y` (ex.: `release-X.Y` →
`release-X.Y+1`), troca a versão no `package.json`, no `package-lock.json` e nos
arquivos que citam a versão (ex.: README), commita e cria a tag anotada, as
duas com a mensagem `Bump para X.Y`. Precisa do working tree limpo e não faz
push.

```bash
./bump.sh -n    # dry-run: só mostra o que seria alterado
./bump.sh       # commit "Bump para X.Y" + tag release-X.Y
git push && git push origin release-X.Y
```

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
