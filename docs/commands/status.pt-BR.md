# `/status` · admin

Posta no **Status do WhatsApp** da conta do bot (os "stories"): um texto ou uma foto/vídeo com
legenda.

!!! warning "Risco de banimento"
    Postar no Status muitas vezes seguidas é o tipo de comportamento que o WhatsApp pune banindo o
    número. Uma postagem por dia vai bem; um laço não. A partir de `status.warnAfter` postagens em
    24 horas (padrão 3) o bot acrescenta um aviso à resposta. Ele não bloqueia, a decisão é sua.

| Opção | Valor | Descrição |
|---|---|---|
| *(texto)* | `<texto>` | O texto do Status (até 700 caracteres) ou a legenda da foto/vídeo |

```text
/status Bom dia, pessoal! ☀️
📣 Postado no seu Status.
```

## Com foto ou vídeo

Responda uma foto ou um vídeo (ou envie com `/status` na legenda). O que você escrever vira a legenda:

```text
(respondendo a foto do pôr do sol)
/status Domingo à tarde 🌇
📣 Postado no seu Status.
```

```text
(enviando um vídeo com a legenda)  /status Música nova, escutem
📣 Postado no seu Status.
```

## Agendado: `/cron -status`

O mesmo Status, na hora marcada, com os `{/comando}` do [`/cron`](cron.md) rodando na hora de
postar:

```text
/cron 8h -r d -status Bom dia! {/weather}
🗓️ Agendado para ter 17/11 08:00 🔁 diário para 👤 Status do WhatsApp.
📝 Bom dia! {/weather}
⚠️ Postar no Status demais é o que o WhatsApp pune com banimento: um por dia vai bem, vários seguidos não.
```

```text
/cron 18h -status Treino feito 💪
```

O `-status` não leva `-to`, `-private` nem `-reminder` (o Status não tem destino). A lista
(`/cron -l`), o `-pause`, o `-resume`, o `-rm` e o `-test` funcionam como em qualquer item.

## Avisos

```text
/status Mais uma!
📣 Postado no seu Status.
⚠️ São 4 postagens em 24 horas. Postar demais seguido é o que o WhatsApp pune com banimento: vá devagar.
```

## O que o bot não faz

- Não **vê nem reage aos status dos outros** (nem os salva): automatizar isso é o que mais derruba
  conta.
- Não reposta nada sozinho: toda postagem vem de um `/status` ou de um `/cron -status` que você
  escreveu.

Veja também o [`/profile -about`](profile.md#o-texto-de-recado--about), o recado embaixo do seu nome.
