# Instalação

## Requisitos

- Docker com o plugin **Docker Compose v2** (`docker compose ...`)
- Git
- Um celular com WhatsApp para parear
- (Opcional) Uma conta SMTP, para o QR Code e os alertas por e-mail

Não é preciso ter Node, Chromium, ffmpeg ou yt-dlp instalados: tudo vai dentro
da imagem.

## Instalação (Docker)

```bash
# 1. Clonar o projeto e ir para a última versão estável
git clone https://github.com/jpereira/zapbot.git
cd zapbot
git checkout release-2.0

# 2. Criar o arquivo de configuração a partir do exemplo e editá-lo
cp config/.env.example config/.env
vim config/.env            # veja a página "Configuração"

# 3. O docker-compose.yml também referencia config/.env.dev (serviço de dev).
#    Mesmo usando só produção, o arquivo precisa existir:
touch config/.env.dev

# 4. Build da imagem
docker compose -f docker/docker-compose.yml build zapbot

# 5. Subir o container em background
docker compose -f docker/docker-compose.yml up -d zapbot

# 6. Acompanhar os logs (e ler o QR Code, se estiver no modo terminal)
docker logs -f zapbot
```

> 💡 Para não repetir `-f docker/docker-compose.yml` em todo comando:
> `export COMPOSE_FILE=docker/docker-compose.yml`

Depois de ler o QR Code você deve ver nos logs:

```
[+] 🔐 Whatsapp authentication success!
[+] 🤖 ZapBot 2.0 inicializado! Informando 5521999999999@c.us
```

e receber a mesma mensagem no seu WhatsApp. Mande `/ping` para qualquer chat:
o bot deve responder `pong`.

### Atualizar para uma nova versão

A **versão estável** é a última release, hoje a `release-2.0` (cada uma tem as
notas em [Releases](https://github.com/jpereira/zapbot/releases)). Para ir para
ela:

```bash
git fetch --tags
git checkout release-2.0
git describe --tags        # confere a versão: release-2.0
docker compose -f docker/docker-compose.yml build zapbot
docker compose -f docker/docker-compose.yml up -d --force-recreate zapbot
```

O `git checkout` de uma tag deixa o repositório em *detached HEAD*; o aviso do
git é esperado e não atrapalha. A sessão do WhatsApp e o banco ficam em
volumes, então sobrevivem ao rebuild.

#### Versão de desenvolvimento (HEAD)

O branch `main` tem as mudanças mais recentes, que ainda não viraram release:
pode ter recursos incompletos ou quebrados. Use só para testar ou desenvolver.

```bash
git checkout main
git pull
docker compose -f docker/docker-compose.yml build zapbot
docker compose -f docker/docker-compose.yml up -d --force-recreate zapbot
```

Para voltar à estável, repita os comandos de cima (`git fetch --tags` e o
`git checkout` da última tag).

## Autenticação: QR Code no terminal ou por e-mail

Na primeira execução (ou se a sessão expirar) o WhatsApp exige a leitura de um
QR Code. O ZapBot oferece dois modos, escolhidos por `QRCODE_EMAIL_ENABLE`:

| Modo | `QRCODE_EMAIL_ENABLE` | Onde aparece o QR |
|------|------|------|
| Terminal | `false` | Desenhado em ASCII nos logs do container (`docker logs -f zapbot`) |
| E-mail   | `true`  | Enviado como imagem PNG para `QRCODE_EMAIL_SMTP_TO` |

O modo e-mail é útil quando o bot roda num servidor remoto/homelab e você não
quer ficar olhando logs: o QR chega na sua caixa de entrada, você abre no
computador e lê com o celular em **WhatsApp › Aparelhos conectados › Conectar
um aparelho**. O WhatsApp renova o QR periodicamente; cada novo QR gera um novo
e-mail numerado (`#1`, `#2`...) e **só o mais recente vale**.
