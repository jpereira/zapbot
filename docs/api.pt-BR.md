# API e MCP

O bot tem uma **API HTTP local** opcional, desligada por padrão, para integrá-lo a scripts, cron,
Home Assistant, n8n e afins: mandar uma mensagem, ler as suas notas, perguntar se está no ar. Em
cima dela há um **servidor MCP experimental**, para um cliente de IA (o Claude Desktop, por
exemplo) enviar mensagens e ler as suas `/notes`.

!!! danger "Ela fala pela sua conta do WhatsApp"
    Quem tem a `zapbot.api.key` manda mensagens **como você**. Trate como uma senha: longa, aleatória, em
    nenhum repositório. A API só escuta em `127.0.0.1` por padrão; para abrir para a rede, ponha um
    proxy reverso com HTTPS na frente.

!!! warning "O servidor MCP é experimental"
    O protocolo MCP e as ferramentas podem mudar entre versões, e uma IA com acesso a elas pode agir
    na sua conta. Ele vem desligado (`zapbot.mcp.enabled`), só envia para os destinos do `zapbot.api.sendTo` e é
    limitado a **10 mensagens por minuto**.

## Ligando

Os settings, todos pelo [`/set`](commands/set.md) (valem ao reiniciar o bot):

```text
/set zapbot.api.key <sua-chave-aleatória>
/set zapbot.api.port 3100
/set zapbot.api.enabled on
```

Gere uma chave aleatória própria, por exemplo com `openssl rand -hex 32`.

No Docker, publique a porta só na própria máquina, no `docker-compose.yml`:

```yaml
ports:
  - "127.0.0.1:3100:3100"
```

O `zapbot.api.host` é `127.0.0.1` por padrão; dentro de um container, ponha `0.0.0.0` (a porta publicada
acima é o que a mantém fechada para a rede).

Sem a `zapbot.api.key` a API não inicia (o log avisa), e ela precisa de pelo menos 20 caracteres: uma curta é
força-bruta rápido demais.

## Endpoints

Toda chamada (menos o `/health`) manda a chave no cabeçalho `Authorization: Bearer <chave>` (ou em
`X-API-Key`). 5 chaves erradas do mesmo endereço bloqueiam por 15 minutos, igual ao login da interface web.
A API conta o endereço da conexão direta, então clientes atrás do mesmo proxy compartilham o limite.

| Método | Caminho | O que faz |
|---|---|---|
| `GET` | `/health` | `{ "ok": true, "connected": true }`, **sem chave** (para health checks) |
| `GET` | `/status` | Versão, se o WhatsApp está conectado e se o MCP está ligado |
| `GET` | `/notes?limit=N` | As últimas notas do [`/notes`](commands/notes.md) (padrão 20, até 100) |
| `POST` | `/send` | `{ "to": "5521999999999", "text": "..." }`: manda uma mensagem de texto |
| `POST` | `/mcp` | O servidor MCP (só com `zapbot.mcp.enabled`) |

```text
$ curl -s http://127.0.0.1:3100/health
{"ok":true,"connected":true}

$ curl -s -H "Authorization: Bearer $KEY" http://127.0.0.1:3100/status
{"name":"zapbot","version":"1.0.25","connected":true,"mcp":false}

$ curl -s -H "Authorization: Bearer $KEY" "http://127.0.0.1:3100/notes?limit=2"
[{"id":12,"text":"ligar pro banco #amanha","createdAt":1794800000000,"alertAt":null},
 {"id":11,"text":"comprar leite","createdAt":1794790000000,"alertAt":null}]
```

### Mandando uma mensagem

```text
$ curl -s -X POST http://127.0.0.1:3100/send \
    -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -d '{"to":"5521999999999","text":"Backup feito ✅"}'
{"ok":true,"to":"5521999999999@c.us"}
```

O `to` é um telefone com DDI (conferido no WhatsApp) ou um id (`…@c.us`, `…@g.us`). Só pode ser o
**seu próprio chat** ou algo da lista do [`zapbot.api.sendTo`](settings.md); os ids dos grupos o
[`/whois -id`](commands/whois.md#os-ids--id) mostra:

```text
/set -a zapbot.api.sendTo +5521999999999
/set -a zapbot.api.sendTo 120363012345678901@g.us
```

| Status | Quando |
|---|---|
| `200` | Enviou |
| `400` | `to` ou `text` faltando/inválidos, texto com mais de 4000 caracteres ou JSON inválido |
| `401` | Chave errada ou ausente |
| `403` | O destino não está no `zapbot.api.sendTo` |
| `404` | O número não está no WhatsApp, ou o caminho não existe |
| `413` | Corpo com mais de 64 KB |
| `429` | Mais de 10 mensagens em um minuto |
| `503` | WhatsApp desconectado |

## Servidor MCP (experimental)

Com o `zapbot.mcp.enabled` ligado, o `POST /mcp` fala JSON-RPC 2.0 do [Model Context
Protocol](https://modelcontextprotocol.io) (os métodos `initialize`, `ping`, `tools/list` e
`tools/call`, respondidos em JSON no próprio POST). As ferramentas:

| Ferramenta | O que faz |
|---|---|
| `send_message` | Manda um texto (`to`, `text`), com as mesmas regras do `POST /send` |
| `list_notes` | As últimas notas (`limit`) |
| `get_note` | Uma nota pelo número (`id`) |
| `get_status` | Versão e conexão |

```text
/set zapbot.mcp.enabled on
```

O Claude Desktop conecta a servidores locais por linha de comando; para usar este, que é HTTP,
passe pela ponte `mcp-remote`, no `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "zapbot": {
      "command": "npx",
      "args": [
        "mcp-remote", "http://127.0.0.1:3100/mcp",
        "--header", "Authorization: Bearer ${ZAPBOT_KEY}"
      ],
      "env": { "ZAPBOT_KEY": "o mesmo valor da zapbot.api.key" }
    }
  }
}
```

Depois peça, por exemplo: *"leia as minhas 3 últimas notas e me mande um resumo no WhatsApp"*. As
descrições das ferramentas levam a marca `[EXPERIMENTAL]`, e o `send_message` só alcança o seu
próprio chat a menos que você ponha mais destinos no `zapbot.api.sendTo`.

## Boas práticas

- Deixe o `zapbot.api.sendTo` vazio se não precisar e **nunca** use `all` com uma chave que outras
  pessoas ou programas conseguem ler.
- Mantenha a porta fechada para a internet. Se precisar abrir, use HTTPS e um firewall.
- Mandar muitas mensagens seguidas é o que bane contas de WhatsApp: o limite de 10 por minuto
  existe por isso, não tente contorná-lo.
- Troque a chave na dúvida: `/set zapbot.api.key <nova>` e reinicie o bot.
