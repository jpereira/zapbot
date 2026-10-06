# Operação do dia a dia

Execute os comandos Docker na raiz do projeto:

| Ação | Comando |
|---|---|
| Ver logs | `docker logs -f zapbot` |
| Reiniciar | `docker compose -f docker/docker-compose.yml restart zapbot` |
| Parar | `docker compose -f docker/docker-compose.yml stop zapbot` |
| Shell no container | `docker exec -it zapbot bash -l` |
| Consultar o banco | `docker exec -it zapbot sqlite3 cache/bot_database.db` |
| Ver configurações | `docker exec -it zapbot sqlite3 cache/bot_database.db "SELECT * FROM settings"` |
| Limpar mensagens/mídias | Pelo WhatsApp: `/cache -a` (tudo, inclusive os backups), `/cache -m` (só as mídias) ou `/cache -b` (só os backups). Veja [`/cache`](comandos/cache.md) |
| Estado do bot (no ar, cache, apagadas...) | Pelo WhatsApp: `/bot -status` (ou `/bot -status 06h` para receber todo dia). Veja [`/bot -status`](comandos/bot.md#status-do-bot) |
| Versões (Node.js, Chromium, yt-dlp, ffmpeg...) e sistema | Pelo WhatsApp: `/bot -info`. Veja [Informações do sistema](comandos/bot.md#informações-do-sistema) |
| Backup do banco | Pelo WhatsApp: `/backup -now` (cria), `/backup -s` (envia o arquivo). Veja [`/backup`](comandos/backup.md) |
| **Forçar novo QR** (apaga a sessão) | `docker compose -f docker/docker-compose.yml down && docker volume rm zapbot_wwebjs_auth && docker compose -f docker/docker-compose.yml up -d zapbot` |

O container usa `restart: unless-stopped`, então volta sozinho após reboot do host.

## Saúde do container (heartbeat)

O `restart: unless-stopped` só age quando o processo **morre**. Para o caso do bot travar com o
processo vivo (Node preso, Chromium sem resposta, sessão num estado ruim), existe um heartbeat:

1. A cada 30 s o bot (`src/heartbeat.js`) confere se está funcionando e, se estiver, grava
   `/tmp/zapbot-heartbeat.json` com a hora e o estado. "Funcionando" é: conectado e o WhatsApp Web
   respondendo `CONNECTED` em até 10 s; ou ainda não conectado (boot, esperando o QR Code,
   reconectando), em que o processo vivo basta; ou reiniciando há menos de 5 minutos.
2. O `HEALTHCHECK` da imagem (`docker/app/healthcheck.js`) só olha a idade do arquivo: parado há
   mais de 90 s, o container fica `unhealthy` (há 2 min de tolerância no boot).
3. Conectado mas sem `CONNECTED` 3 vezes seguidas, o próprio bot reinicia o cliente do WhatsApp e
   avisa por e-mail (`🩺 WhatsApp sem resposta`).

### Queda da internet

Sem internet, o reinício falha (`initialize falhou: net::ERR_NAME_NOT_RESOLVED`). O bot não para:
tenta de novo sozinho, com espera crescente (15 s, 30 s, 1 min, 2 min e depois a cada 5 min), até
conectar. No boot sem internet, o mesmo.

```text
♻️ Reiniciando cliente. Motivo: heartbeat: OPENING
initialize falhou: net::ERR_NAME_NOT_RESOLVED at https://web.whatsapp.com/
♻️ Nova tentativa de conectar em 15s (falhas seguidas: 1).
♻️ Reiniciando cliente. Motivo: nova tentativa nº 2 (heartbeat: OPENING)
...
🤖 ZapBot 2.5 (devel) inicializado!
```

- Um e-mail só, na primeira falha (`❌ Falha ao reiniciar`); com a internet fora, ele também falha, e
  o `🔄 Reconectado` diz quanto tempo o bot ficou sem conseguir conectar e quantas tentativas
  falharam.
- Enquanto tenta, o heartbeat continua batendo, com o estado `reconectando (N falhas seguidas)`:
  reiniciar o container não traria a internet de volta.
- Se a página abrir mas a conexão não terminar em 3 minutos (a rede caiu no meio), o bot reinicia o
  cliente. Esperando alguém ler o QR Code, não.

```bash
docker ps                                          # STATUS: Up 2 hours (healthy)
docker inspect --format '{{json .State.Health}}' zapbot
docker exec zapbot cat /tmp/zapbot-heartbeat.json
```

O Docker (fora do Swarm) **só marca** o container como `unhealthy`: não reinicia. Para reiniciar
automaticamente, rode o [autoheal](https://github.com/willfarrell/docker-autoheal) ao lado do bot e
adicione ao serviço `zapbot` o label `autoheal=true`:

```yaml
  autoheal:
    image: willfarrell/autoheal
    restart: unless-stopped
    environment:
      AUTOHEAL_CONTAINER_LABEL: autoheal
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
```

## Solução de problemas

| Sintoma | Causa provável / solução |
|---|---|
| `env file .../config/.env.dev not found` | Crie o arquivo: `touch config/.env.dev`. |
| QR não aparece nos logs | `QRCODE_EMAIL_ENABLE` está `"true"`. Veja o e-mail ou mude para `"false"`. |
| `Erro ao enviar QR por email` | Host/porta/usuário/senha SMTP errados. Use porta 465 e senha de app. |
| `Erro ao enviar QR por email: ... self-signed certificate` / `unable to verify` | O certificado do SMTP não é válido. Use o host oficial do provedor (o nome precisa bater com o certificado). |
| E-mail do QR chega no spam | `QRCODE_EMAIL_SMTP_FROM` diferente da conta SMTP. |
| Não chegam os alertas por e-mail | Confira `QRCODE_EMAIL_SMTP_HOST`, `_USER` e `_TO` (sem eles nada é enviado) e o setting `email.alerts` (`/set email.alerts`). Falhas do SMTP aparecem no log como `Alerta por e-mail '...' falhou`. |
| Um comando não responde | Veja nos logs se aparece `executed unknown command`: o nome está errado ou o comando está desativado (`commands.disabled`, ou `"disabled": true` no `comandos.json`). Dos outros, só aparece com o [`/debug`](comandos/debug.md) ligado. |
| `docker ps` mostra `(unhealthy)` | O bot parou de gravar o heartbeat. Veja o motivo com `docker inspect --format '{{json .State.Health}}' zapbot` e os logs; reinicie com `docker compose -f docker/docker-compose.yml restart zapbot`. Veja [Saúde do container](#saúde-do-container-heartbeat). |
| `make test`: `No such built-in module: node:sqlite` | Node antigo: os testes precisam do Node 22.13+. |
| `Motivo 'LOGOUT' exige ação manual` | Sessão desconectada pelo celular. Reinicie o container para gerar novo QR. |
| `Motivo 'CONFLICT' ...` | O WhatsApp Web foi aberto em outro lugar com a mesma sessão, ou há dois containers rodando. |
| `browser is already running` | Lock antigo do Chromium; o entrypoint limpa no boot. Reinicie o container. |
| Nenhum comando responde a outra pessoa | O `bot.users` vem `false`: só você usa comandos até `/bot +v <pessoa\|grupo>` (alguns, veja [Usuários](comandos/bot.md#usuários)) ou `/set bot.users true` (todos). Os comandos admin continuam só seus, a não ser para quem estiver no `bot.admins` (`/bot +o <pessoa>`, veja [Admins extras](comandos/bot.md#admins-extras)). Veja [Permissões](comandos/index.md#permissões-onlyadmin). |
| `/get` falha em algum site | O site mudou; refaça o build (`--no-cache`) para pegar o yt-dlp mais recente. A versão em uso aparece no `/bot -info`. |

---

Feito por **Jorge Pereira**. Contribuições são bem-vindas via issues e pull requests.
