# Política de segurança

> 🇬🇧 **Read this in English: [SECURITY.md](SECURITY.md).**

## Versões suportadas

Só a **última release** (tag `vX.Y.Z` mais recente) recebe correções de segurança. As correções
saem numa release nova; atualize seguindo a
[documentação](https://jpereira.github.io/zapbot/pt-BR/installation/#atualizar-para-uma-nova-versão).

## Como reportar uma vulnerabilidade

**Não abra uma issue pública.** Reporte em particular, de um destes jeitos:

- pela aba **Security** do repositório no GitHub (**Report a vulnerability**);
- por e-mail para **jpereiran@gmail.com**.

Inclua, se possível: a versão (ou o commit), os passos para reproduzir, o impacto que você observou
e, se tiver, uma sugestão de correção. O projeto é mantido por uma pessoa: a resposta vem assim que
possível, e você será avisado quando a correção for publicada.

## O que é sensível neste projeto

Alguns pontos merecem atenção especial num relato:

- **Sessão do WhatsApp** (`.wwebjs_auth`) e o **QR Code**: quem tiver um dos dois controla a conta.
  O QR pode ir por e-mail (veja o código anti-phishing em
  [E-mails](https://jpereira.github.io/zapbot/pt-BR/emails/)).
- **Níveis dos comandos** (owner > admin > user): qualquer forma de alguém executar um comando
  acima do nível dele, ou de role `admin` sem o dono ter liberado (`/bot +cmd`, só nos
  delegáveis), inclusive fazendo o bot "digitar" um comando ou por um atalho do `/alias`. Ou de um
  admin extra (`/bot +a`) alterar o `bot.admins` ou o `bot.users`, que só o dono pode mudar. Também conta
  alguém de fora do `bot.users` conseguir usar os comandos comuns, ou um usuário usar um comando
  fora dos dele (`/bot +cmd`).
- **`/get`**: o `yt-dlp` roda na rede do servidor; URLs para a rede interna são recusadas
  (anti-SSRF).
- **Chaves de API** (OpenAI, GIPHY, Google Translate) e a senha do SMTP: nunca devem aparecer no
  chat nem nos logs.
- **Notas protegidas** (`/notes -lock`): o texto e os arquivos de uma tag protegida são cifrados (AES-256-GCM, chave
  derivada por scrypt) e a senha nunca é guardada. Conta como vulnerabilidade qualquer jeito de lê-los **sem a
  senha** ou **fora do seu próprio privado**: num grupo ou no chat de outra pessoa, enviados com `-to`, num alerta,
  nos logs, no histórico (`messages`) ou num backup; a senha aparecendo em qualquer lugar onde o bot escreve; ou uma
  tag que continua liberada depois do tempo (`notes.lockMinutes`), de um reinício ou do `-now`. O que ele não promete
  está em [Cenários de privacidade](https://jpereira.github.io/zapbot/pt-BR/commands/notes/#cenários-de-privacidade).
- **Mensagens guardadas**: o banco (`cache/zapbot.db`), as mídias em `cache/media` e os
  backups em `cache/backups` têm conversas de terceiros. O `/backup -send` para outro chat pede
  confirmação (`-yes`) por isso.
