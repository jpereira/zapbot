# Operação do dia a dia

Todos com `-f docker/docker-compose.yml` (ou `COMPOSE_FILE` exportado):

| Ação | Comando |
|---|---|
| Ver logs | `docker logs -f zapbot` |
| Reiniciar | `docker compose restart zapbot` |
| Parar | `docker compose stop zapbot` |
| Shell no container | `docker exec -it zapbot bash -l` |
| Consultar o banco | `docker exec -it zapbot sqlite3 cache/bot_database.db` |
| Ver configurações | `docker exec -it zapbot sqlite3 cache/bot_database.db "SELECT * FROM settings"` |
| Limpar mensagens/mídias | Pelo WhatsApp: `/cache -a` (tudo, inclusive os backups), `/cache -m` (só as mídias) ou `/cache -b` (só os backups). Veja [`/cache`](comandos/cache.md) |
| Backup do banco | Pelo WhatsApp: `/backup -now` (cria), `/backup -s` (envia o arquivo). Veja [`/backup`](comandos/backup.md) |
| **Forçar novo QR** (apaga a sessão) | `docker compose down && docker volume rm zapbot_wwebjs_auth && docker compose up -d zapbot` |

O container usa `restart: unless-stopped`, então volta sozinho após reboot do
host.

## Saúde do container (heartbeat)

O `restart: unless-stopped` só age quando o processo **morre**. Para o caso do
bot travar com o processo vivo (Node preso, Chromium sem resposta, sessão num
estado ruim), existe um heartbeat:

1. A cada 30 s o bot (`src/heartbeat.js`) confere se está funcionando e, se
   estiver, grava `/tmp/zapbot-heartbeat.json` com a hora e o estado.
   "Funcionando" é: conectado e o WhatsApp Web respondendo `CONNECTED` em até
   10 s; ou ainda não conectado (boot, esperando o QR Code, reconectando), em
   que o processo vivo basta; ou reiniciando há menos de 5 minutos.
2. O `HEALTHCHECK` da imagem (`docker/app/healthcheck.js`) só olha a idade do
   arquivo: parado há mais de 90 s, o container fica `unhealthy` (há 2 min de
   tolerância no boot).
3. Conectado mas sem `CONNECTED` 3 vezes seguidas, o próprio bot reinicia o
   cliente do WhatsApp e avisa por e-mail (`🩺 WhatsApp sem resposta`).

```bash
docker ps                                          # STATUS: Up 2 hours (healthy)
docker inspect --format '{{json .State.Health}}' zapbot
docker exec zapbot cat /tmp/zapbot-heartbeat.json
```

O Docker (fora do Swarm) **só marca** o container como `unhealthy`: não
reinicia. Para reiniciar automaticamente, rode o
[autoheal](https://github.com/willfarrell/docker-autoheal) ao lado do bot e
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
| `docker ps` mostra `(unhealthy)` | O bot parou de gravar o heartbeat. Veja o motivo com `docker inspect --format '{{json .State.Health}}' zapbot` e os logs; reinicie com `docker compose restart zapbot`. Veja [Saúde do container](#saúde-do-container-heartbeat). |
| `npm test`: `No such built-in module: node:sqlite` | Node antigo: os testes precisam do Node 22.13+. |
| `Motivo 'LOGOUT' exige ação manual` | Sessão desconectada pelo celular. Reinicie o container para gerar novo QR. |
| `Motivo 'CONFLICT' ...` | O WhatsApp Web foi aberto em outro lugar com a mesma sessão, ou há dois containers rodando. |
| `browser is already running` | Lock antigo do Chromium; o entrypoint limpa no boot. Reinicie o container. |
| Nenhum comando responde a outra pessoa | O modo admin vem ligado: só você usa comandos até `/bot -admin`. Os comandos admin continuam só seus. Veja [Permissões](comandos/index.md#permissões-onlyadmin). |
| `/get` falha em algum site | O site mudou; refaça o build (`--no-cache`) para pegar o yt-dlp mais recente. |

---

Feito por **Jorge Pereira**. Contribuições são bem-vindas via issues e pull
requests.
