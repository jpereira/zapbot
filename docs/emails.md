# E-mails do bot (QR Code e alertas)

O bot usa o mesmo SMTP (`QRCODE_EMAIL_SMTP_*`) para:

- QR Code, quando `QRCODE_EMAIL_ENABLE="true"` (se o envio falhar, o QR aparece no terminal;
  veja `QRCODE_EMAIL_FALLBACK_TERMINAL`);
- [alertas operacionais](#alertas-por-e-mail), como crash, queda e reconexão;
- backups enviados com [`/backup -s -to`](comandos/backup.md#enviar-o-arquivo) ou pelo destino
  configurado em `backup.to` no backup diário;
- alertas de preço do `/cotacao` e `/crypto`, de posições e taxas do `/defi` e das anotações do
  [`/notes -alerta`](comandos/notes.md#alertas);
- ocorrências do `/watch` e relatórios do `/bot -status` com destino de e-mail.

O destino `email` usa `QRCODE_EMAIL_SMTP_TO`; `-to voce@exemplo.com` escolhe outro endereço.

## E-mail do QR Code

Assunto: **`[ZapBot] WhatsApp QR Code Authentication`**

Exemplo dos campos do e-mail:

| Campo | Conteúdo ilustrativo |
|---|---|
| 🔢 QR Code | `#1` |
| 📱 Phone Number | `5521XXXX9999` |
| 🛡️ Anti-Phishing Code | `TroqueEstaFrase-7f3a` |
| 📅 Generated At | `2026-09-29 14:32:07 BRT` |

O QR aparece como imagem PNG de 300×300 pixels no corpo e em anexo (`qrcode-1.png`). O e-mail avisa
que esse QR substitui os enviados anteriormente.

- **QR Code #N**: contador de QRs enviados desde que o container subiu. Use sempre o de número mais
  alto.
- **Phone Number**: o `PHONE_NUMBER` com os dígitos do meio mascarados.
- **Generated At**: horário de geração (fuso `America/Sao_Paulo`).

## Troque o código anti-phishing

O campo `QRCODE_EMAIL_SMTP_ANTIPHISHING` é uma frase secreta que **só você conhece**. Ela vem em
todo e-mail legítimo do bot. Se chegar um e-mail "do ZapBot" pedindo para você escanear um QR e a
frase estiver ausente ou diferente, **é golpe**: escanear um QR de terceiros conecta a *sua* conta
ao aparelho *deles*.

- **Não use o valor do `.env.example`**: ele é público no repositório.
- Escolha algo pessoal e difícil de adivinhar, e troque se suspeitar de vazamento.

## Alertas por e-mail

Quando o WhatsApp cai, o aviso no privado não chega. Por isso os eventos importantes também vão por
e-mail, pelo mesmo SMTP do QR Code (`QRCODE_EMAIL_SMTP_*`, independente do `QRCODE_EMAIL_ENABLE`).
Ligado por padrão; desligue com `/set email.alerts off`. Sem `QRCODE_EMAIL_SMTP_HOST`, `_USER` e
`_TO` preenchidos, nada é enviado.

| Assunto | Quando |
|---|---|
| `[ZapBot] 🟢 Bot iniciado` | O bot conectou ao WhatsApp depois de subir (avisa também se está desligado ou só com você usando comandos, o `bot.users` em `false`) |
| `[ZapBot] 🔄 Reconectado` | Conectou de novo depois de uma queda (com o motivo da queda e, se ficou sem conseguir conectar, por quanto tempo e quantas tentativas falharam) |
| `[ZapBot] 🔴 Desconectado` | O WhatsApp desconectou; o cliente é reiniciado sozinho |
| `[ZapBot] 🔴 Desconectado (ação manual)` | Desconectou por `LOGOUT`, `CONFLICT`, `UNPAIRED`...: o bot **não** reinicia sozinho |
| `[ZapBot] ⚠️ Estado do WhatsApp: <estado>` | O WhatsApp Web entrou num estado de problema (`CONFLICT`, `UNPAIRED`, `TOS_BLOCK`...) |
| `[ZapBot] ⛔ Falha de autenticação` | A sessão salva não autenticou |
| `[ZapBot] 🔑 Sessão perdida: novo QR Code` | Pediu QR Code de novo depois de já ter autenticado |
| `[ZapBot] ♻️ Browser caiu` | O Chromium morreu e o watchdog está reiniciando o cliente |
| `[ZapBot] 🩺 WhatsApp sem resposta` | Conectado, mas o WhatsApp Web não respondeu `CONNECTED` em 3 verificações seguidas do [heartbeat](operacao.md#saúde-do-container-heartbeat); o cliente é reiniciado |
| `[ZapBot] ❌ Falha ao reiniciar` | O reinício do cliente falhou (ex.: sem internet); o bot tenta de novo sozinho, com espera crescente. Um e-mail só, na primeira falha ([Queda da internet](operacao.md#queda-da-internet)) |
| `[ZapBot] 💾 Backup falhou` | O [backup diário](comandos/backup.md#backup-automático) do banco deu erro (ex.: disco cheio) |
| `[ZapBot] 💾 Envio do backup falhou` | O arquivo diário foi salvo localmente, mas o envio para `backup.to` falhou |
| `[ZapBot] 💥 Crash` | Exceção ou promise rejeitada sem tratamento (com o stack). O processo sai e o Docker sobe de novo |
| `[ZapBot] 🛑 Bot encerrado` | `docker stop`/`restart` ou Ctrl+C (SIGTERM/SIGINT) |

Cada e-mail traz o horário, o número mascarado, a versão com o commit que está rodando
(`X.Y.Z (git+4465374/vX.Y.Z)`, veja o [`/version`](comandos/version.md)), o host, há quanto tempo
o processo está no ar e o código anti-phishing. O mesmo evento não se repete antes de 5 minutos
(exceto crash e encerramento), para não lotar a caixa num loop de reconexão.

## Pausa depois de falha de login

Se o provedor recusar o login (`EAUTH`, por exemplo o Gmail com
`535 5.7.0 Too many bad auth attempts`), o bot para de usar o SMTP por **30 minutos**:
qualquer envio nesse período falha na hora, com `SMTP em pausa por falha de autenticação anterior`, sem abrir
conexão. Cada tentativa errada conta para o bloqueio do provedor, e insistir (um QR novo, um alerta,
uma reconexão) só o prolonga. Passado o tempo, o bot tenta de novo; se a senha ainda estiver
errada, a pausa recomeça.

Para sair disso: confira a senha de app em `QRCODE_EMAIL_SMTP_PASS`, espere o bloqueio passar e
rode o [`/bot -test`](comandos/bot.md#teste-do-bot), que só faz o login (sem enviar nada) e também
respeita a pausa. Enquanto isso, o QR continua saindo nos logs, se o
`QRCODE_EMAIL_FALLBACK_TERMINAL` estiver ligado.
