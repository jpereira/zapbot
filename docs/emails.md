# E-mails do bot (QR Code e alertas)

O bot manda quatro tipos de e-mail, pelo mesmo SMTP (`QRCODE_EMAIL_SMTP_*`): o
QR Code, quando `QRCODE_EMAIL_ENABLE="true"`, os
[alertas](#alertas-por-e-mail) de crash, queda, reconexão etc., os backups
pedidos com [`/backup -s -to <e-mail>`](comandos/backup.md#enviar-o-arquivo) e os
alertas criados com `-to email` (ou um endereço): o
[`/defi -alerta`](comandos/defi.md#alerta-de-saída-da-faixa) (assunto
`[ZapBot] DeFi: a posição ... saiu da faixa`) e os alertas de preço do
[`/cotacao`](comandos/cotacao.md#avisar-em-outro-chat-ou-por-e-mail) e do `/crypto`
(assunto `[ZapBot] 🔔 Alerta de preço: ...`).

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

## Troque o código anti-phishing

O campo `QRCODE_EMAIL_SMTP_ANTIPHISHING` é uma frase secreta que **só você
conhece**. Ela vem em todo e-mail legítimo do bot. Se chegar um e-mail
"do ZapBot" pedindo para você escanear um QR e a frase estiver ausente ou
diferente, **é golpe**: escanear um QR de terceiros conecta a *sua* conta ao
aparelho *deles*.

- **Não use o valor do `.env.example`**: ele é público no repositório.
- Escolha algo pessoal e difícil de adivinhar, e troque se suspeitar de vazamento.

## Alertas por e-mail

Quando o WhatsApp cai, o aviso no privado não chega. Por isso os eventos
importantes também vão por e-mail, pelo mesmo SMTP do QR Code
(`QRCODE_EMAIL_SMTP_*`, independente do `QRCODE_EMAIL_ENABLE`). Ligado por
padrão; desligue com `/set email.alerts off`. Sem `QRCODE_EMAIL_SMTP_HOST`,
`_USER` e `_TO` preenchidos, nada é enviado.

| Assunto | Quando |
|---|---|
| `[ZapBot] 🟢 Bot iniciado` | O bot conectou ao WhatsApp depois de subir (avisa também se está desligado ou em modo admin) |
| `[ZapBot] 🔄 Reconectado` | Conectou de novo depois de uma queda (com o motivo da queda) |
| `[ZapBot] 🔴 Desconectado` | O WhatsApp desconectou; o cliente é reiniciado sozinho |
| `[ZapBot] 🔴 Desconectado (ação manual)` | Desconectou por `LOGOUT`, `CONFLICT`, `UNPAIRED`...: o bot **não** reinicia sozinho |
| `[ZapBot] ⚠️ Estado do WhatsApp: <estado>` | O WhatsApp Web entrou num estado de problema (`CONFLICT`, `UNPAIRED`, `TOS_BLOCK`...) |
| `[ZapBot] ⛔ Falha de autenticação` | A sessão salva não autenticou |
| `[ZapBot] 🔑 Sessão perdida: novo QR Code` | Pediu QR Code de novo depois de já ter autenticado |
| `[ZapBot] ♻️ Browser caiu` | O Chromium morreu e o watchdog está reiniciando o cliente |
| `[ZapBot] 🩺 WhatsApp sem resposta` | Conectado, mas o WhatsApp Web não respondeu `CONNECTED` em 3 verificações seguidas do [heartbeat](operacao.md#saúde-do-container-heartbeat); o cliente é reiniciado |
| `[ZapBot] ❌ Falha ao reiniciar` | O reinício do cliente falhou |
| `[ZapBot] 💾 Backup falhou` | O [backup diário](comandos/backup.md#backup-automático) do banco deu erro (ex.: disco cheio) |
| `[ZapBot] 💥 Crash` | Exceção ou promise rejeitada sem tratamento (com o stack). O processo sai e o Docker sobe de novo |
| `[ZapBot] 🛑 Bot encerrado` | `docker stop`/`restart` ou Ctrl+C (SIGTERM/SIGINT) |

Cada e-mail traz o horário, o número mascarado, a versão, o host, há quanto
tempo o processo está no ar e o código anti-phishing. O mesmo evento não se
repete antes de 5 minutos (exceto crash e encerramento), para não lotar a
caixa num loop de reconexão.
