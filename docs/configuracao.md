# Configuração do `config/.env`

O arquivo é carregado pelo Compose (`env_file: ../config/.env`) e as variáveis
ficam disponíveis para o bot. Nunca faça commit dele (já está no `.gitignore`).

## Docker Compose

| Variável | Exemplo | Descrição |
|---|---|---|
| `COMPOSE_PROJECT_NAME` | `zapbot` | Nome do projeto no Compose. Define o prefixo dos volumes (`zapbot_wwebjs_auth`, `zapbot_app_cache`). |
| `COMPOSE_FILE` | `docker/docker-compose.yml` | Caminho do compose. Útil se você exportar/usar este arquivo como `.env` do Compose. |

## WhatsApp

| Variável | Exemplo | Descrição |
|---|---|---|
| `PHONE_NUMBER` | `5521999999999@c.us` | **Obrigatório.** Número da conta que será pareada, no formato `DDI + DDD + número` seguido de `@c.us`, sem `+`, espaços ou traços. É para ele que o bot manda o aviso de inicialização, as notificações do `/monitor` e, com o debug ligado, os avisos de uso indevido de comandos. Também aparece (mascarado) no e-mail do QR. |

## Avançado

| Variável | Exemplo | Descrição |
|---|---|---|
| `ZAPBOT_CACHE_DIR` | `/tmp/zapbot-cache` | Diretório do banco (`bot_database.db`) e das mídias. Padrão: `cache/` na raiz do projeto. Os [testes](desenvolvimento.md#testes) usam uma pasta temporária. **No Docker, não defina**: o volume `app_cache` é montado em `/app/cache`. |
| `ZAPBOT_HEARTBEAT_FILE` | `/tmp/zapbot-heartbeat.json` | Arquivo do [heartbeat](operacao.md#saúde-do-container-heartbeat). Padrão: `zapbot-heartbeat.json` no diretório temporário. Lido pelo `docker/app/healthcheck.js`. |
| `ZAPBOT_HEARTBEAT_MAX_AGE_S` | `90` | Idade máxima, em segundos, do heartbeat para o healthcheck considerar o bot saudável. |

## Serviços externos

Comandos que consultam serviços na internet. Só dois precisam de chave; os
outros funcionam sem configuração.

| Comando | Serviço | Chave |
|---|---|---|
| `/gpt` | [OpenAI](https://platform.openai.com/) (pago por uso) | `OPENAI_API_KEY` ou setting `openai.api.key` |
| `/gif` | [GIPHY](https://developers.giphy.com/) (grátis, 100 chamadas/hora) | `GIPHY_API_KEY` ou setting `gif.giphy.api.key` |
| `/tempo` | [Open-Meteo](https://open-meteo.com/) | — |
| `/cve`, `/ualisu` | [NVD](https://nvd.nist.gov/) (~5 consultas a cada 30 s) | — |
| `/news` | Feeds RSS (g1, Gazeta do Povo, The Hacker News...) | — |
| `/cotacao` | [Yahoo Finance](https://finance.yahoo.com/) (reserva: [AwesomeAPI](https://docs.awesomeapi.com.br/)) e [Binance](https://www.binance.com/) para o USDT | — |
| `/crypto` | [Binance](https://www.binance.com/) | — |
| `/kernel` | [kernel.org](https://www.kernel.org/) | — |
| `/meme` | [imgflip](https://imgflip.com/) | — |
| `/joke` | [JokeAPI](https://jokeapi.dev/) | — |

Para as chaves, a variável do `config/.env` tem prioridade; se estiver vazia,
vale o setting, que dá para trocar pelo WhatsApp com `/set` sem reiniciar.

## OpenAI (opcional)

| Variável | Exemplo | Descrição |
|---|---|---|
| `OPENAI_API_KEY` | `sk-proj-...` | Chave da OpenAI usada pelo `/gpt`. Se estiver vazia, o bot usa o setting `openai.api.key`; sem nenhuma das duas o `/gpt` fica desativado. |
| `OPENAI_MODEL` | `gpt-4o-mini` | Modelo do `/gpt`. Se estiver vazio, o bot usa o setting `openai.api.model` (padrão `gpt-4o-mini`), que dá para trocar pelo WhatsApp com `/gpt -m`. Preenchido, tem prioridade sobre o setting. |
| `OPENAI_TIMEOUT_MS` | `60000` | Tempo máximo de espera pela resposta, em ms. Se estiver vazio, o bot usa o setting `openai.timeout.ms` (60000). |

## GIPHY (opcional)

| Variável | Exemplo | Descrição |
|---|---|---|
| `GIPHY_API_KEY` | | Chave do GIPHY usada pelo `/gif` ([developers.giphy.com](https://developers.giphy.com/)). Se estiver vazia, o bot usa o setting `gif.giphy.api.key` (`/set gif.giphy.api.key <chave>`). |

### Como gerar a chave do GIPHY (grátis)

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

## E-mail (QR Code e alertas)

| Variável | Exemplo | Descrição |
|---|---|---|
| `QRCODE_EMAIL_ENABLE` | `"true"` / `"false"` | Liga o envio por e-mail. Com `false`, o QR aparece só no terminal. |
| `QRCODE_EMAIL_SMTP_HOST` | `smtp.mail.yahoo.com` | Servidor SMTP. |
| `QRCODE_EMAIL_SMTP_PORT` | `465` | Porta SMTP. **Use uma porta SSL/TLS implícita (465)**: o bot conecta com `secure: true`, portas STARTTLS como 587 não funcionam. O certificado do servidor é validado: servidores com certificado autoassinado/inválido são recusados, porque um MITM capturaria a senha e o QR Code (que dá acesso à conta). |
| `QRCODE_EMAIL_SMTP_USER` | `minhaconta@yahoo.com.br` | Usuário de login no SMTP. |
| `QRCODE_EMAIL_SMTP_PASS` | `abcd efgh ijkl mnop` | Senha do SMTP. Em Gmail/Yahoo/Outlook use uma **senha de app** (exige 2FA ativo), não a senha normal da conta. |
| `QRCODE_EMAIL_SMTP_FROM` | `ZapBot <minhaconta@yahoo.com.br>` | Remetente. O endereço deve ser o mesmo da conta SMTP, senão o provedor rejeita ou o e-mail cai no spam. |
| `QRCODE_EMAIL_SMTP_TO` | `Fulano <fulano@gmail.com>` | Destinatário que vai receber o QR (e os [alertas por e-mail](emails.md#alertas-por-e-mail)). |
| `QRCODE_EMAIL_SMTP_ANTIPHISHING` | `MinhaFraseSecreta42` | Código anti-phishing exibido em todo e-mail do bot. Veja [Troque o código anti-phishing](emails.md#troque-o-código-anti-phishing). |

### Por que configurar o e-mail com cuidado

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

## Exemplo completo

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
