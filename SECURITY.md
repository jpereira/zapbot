# Política de segurança

## Versões suportadas

Só a **última release** (tag `release-X.Y` mais recente) recebe correções de
segurança. As correções saem numa release nova; atualize seguindo a
[documentação](https://jpereira.github.io/zapbot/instalacao/#atualizar-para-uma-nova-versão).

## Como reportar uma vulnerabilidade

**Não abra uma issue pública.** Reporte em particular, de um destes jeitos:

- pela aba **Security** do repositório no GitHub (**Report a vulnerability**);
- por e-mail para **jpereiran@gmail.com**.

Inclua, se possível: a versão (ou o commit), os passos para reproduzir, o
impacto que você observou e, se tiver, uma sugestão de correção. O projeto é
mantido por uma pessoa: a resposta vem assim que possível, e você será avisado
quando a correção for publicada.

## O que é sensível neste projeto

Alguns pontos merecem atenção especial num relato:

- **Sessão do WhatsApp** (`.wwebjs_auth`) e o **QR Code**: quem tiver um dos
  dois controla a conta. O QR pode ir por e-mail (veja o código anti-phishing
  em [E-mails](https://jpereira.github.io/zapbot/emails/)).
- **Comandos de admin**: qualquer forma de alguém que não é o dono executar um
  comando `onlyAdmin` (inclusive fazendo o bot "digitar" um comando).
- **`/get`**: o `yt-dlp` roda na rede do servidor; URLs para a rede interna
  são recusadas (anti-SSRF).
- **Chaves de API** (OpenAI, GIPHY, Google Translate) e a senha do SMTP: nunca devem aparecer no
  chat nem nos logs.
- **Mensagens guardadas**: o banco (`cache/bot_database.db`) e as mídias em
  `cache/media` têm conversas de terceiros.
