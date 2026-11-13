# `/forward` · admin

Role `admin`: só você e os admins extras. Não pode ser delegado: ele manda mensagens da sua conta
para qualquer um.

Encaminha a mensagem que você **respondeu** (texto, foto, vídeo, áudio, documento, figurinha,
localização...) para um ou mais destinatários, no WhatsApp ou por e-mail. Só envia **se todos os
destinatários forem encontrados**: se algum não casar, não manda nada e o bot diz qual falhou. Enquanto envia, responde na hora
`⏳ Encaminhando mensagem...` e, quando termina, edita essa mesma mensagem com o resultado (abaixo).

```text
/forward [-quiet|-q] [-N|-N,-N|-N..-N] [/contato/|@menção|+número]... [-to <destino>]...
```

| Opção | Valor | Descrição |
|---|---|---|
| *(nenhuma)* | `[/contato/\|@menção\|+número]...` | Os destinatários, separados por espaço: contato ou grupo pelo nome ou parte dele (nome com espaço entre `/.../` ou aspas; vários que servem: você escolhe na lista), alguém mencionado com `@`, um número ou um e-mail |
| `-to` | `<destino>` | Mais um destinatário: um contato, um grupo, um número ou um e-mail (veja [Destinos](index.md#destinos-contato-grupo-número-ou-e-mail)). Repita para vários |
| `-N` | `-N,-N` · `-N..-N` | Sem resposta: a posição das mensagens acima (veja [Várias mensagens](#várias-mensagens--n)) |
| `-quiet`, `-q` | | Não mostra nenhum status: nem o aviso enquanto envia, nem a lista no fim. Só as falhas são avisadas |

```text
/forward /Fulano de Tal/
/forward /Jorge Pereira/ @Maria /Camila Gama/
/forward -q /Jorge Pereira/
/forward -to fulano@exemplo.com /Jorge Pereira/ @Maria -to root@exemplo.org
```

Quando tudo dá certo, a mensagem `⏳` vira:

```text
✉️ Mensagem encaminhada com sucesso!

👤 Fulano
👥 Família
📧 fulano@exemplo.com
```

A lista de quem recebeu só aparece com o setting `forward.header` ligado (o padrão, veja
[Cabeçalho](#cabeçalho)); desligado, a mensagem é só `✉️ Mensagem encaminhada com sucesso!`. Cada linha
traz o tipo do destinatário (👤 contato, 👥 grupo, 📧 e-mail). Se algum envio falhar (chat bloqueado,
SMTP fora do ar...), o título é `⚠️ Encaminhada para 2 de 3` e o que falhou vem com `❌` e o motivo
(`👤 Beltrano · ❌ chat bloqueado`); os outros são enviados do mesmo jeito. Se todos falharem, o título
é `❌ Não consegui encaminhar a mensagem`.

## Cabeçalho

Por padrão a mensagem vai com um cabeçalho dizendo que veio do bot:

```text
🤖 Mensagem encaminhada pelo ZapBot!

<o texto da mensagem>
```

Com foto, vídeo ou documento, o cabeçalho e o texto vão na legenda. Áudio, nota de voz e figurinha
não têm legenda: o cabeçalho vai antes, numa mensagem só dele. Por e-mail, o cabeçalho abre o texto e
a mídia vai em anexo. Para mandar só a mensagem, desligue:

```text
/set forward.header false
```

- Localização vira a descrição e um link do mapa; enquete vira a pergunta e as opções.
- Destinatário repetido conta uma vez.

## Várias mensagens (`-N`)

Sem responder nada, diga a posição das mensagens acima, logo depois do comando (e do `-quiet`): o
`-1` é a mensagem logo acima do comando.

```text
/forward -1 /Rafael Silva/
/forward -1 -4 -6 /Rafael Silva/ /Grupo Família/
/forward -1,-4,-6 /Rafael Silva/
/forward -3..-1 /Rafael Silva/
```

- `-1 -4 -6` e `-1,-4,-6` encaminham exatamente essas posições; `-3..-1` encaminha a faixa (`-1..-3`
  é o mesmo). Elas sempre vão da mais antiga para a mais nova, mesmo digitadas fora de ordem.
- As mensagens que o próprio bot enviou (respostas, status) e os avisos do WhatsApp (alguém entrou...)
  não contam na numeração.
- Até `forward.max` mensagens por vez (padrão 10), com uma pausa de `forward.delayMs` entre elas
  (padrão 1 s). Se houver menos mensagens acima do que você pediu, nada é enviado.
- O cabeçalho vai **uma vez**, numa mensagem antes de todas. Por e-mail, é um e-mail só com todos os
  textos em sequência e as mídias em anexo.
- O aviso conta (`⏳ Encaminhando 3 mensagens...`) e o resultado também: `✉️ 3 mensagens encaminhadas com sucesso!`.
- Responder e dar números ao mesmo tempo é recusado: use um ou outro.
