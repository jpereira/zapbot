# `/forward` · admin

Role `admin`: só você e os admins extras. Não pode ser delegado: ele manda mensagens da sua conta
para qualquer um.

Encaminha a mensagem que você **respondeu** (texto, foto, vídeo, áudio, documento, figurinha,
localização...) para um ou mais destinatários, no WhatsApp ou por e-mail. Só envia **se todos os
destinatários forem encontrados**: se algum não casar, não manda nada e o bot diz qual falhou. Enquanto envia, responde na hora
`⏳ Encaminhando mensagem...` e, quando termina, edita essa mesma mensagem com o resultado (abaixo).

```text
/forward [-quiet|-q|-status|-s] [-dry|-d] [-nohdr] [#lista]... [-N|-N,-N|-N..-N] [/contato/|@menção|+número]... [-to <destino>]...
```

| Opção | Valor | Descrição |
|---|---|---|
| *(nenhuma)* | `[/contato/\|@menção\|+número]...` | Os destinatários, separados por espaço: contato ou grupo pelo nome ou parte dele (nome com espaço entre `/.../` ou aspas; vários que servem: você escolhe na lista), alguém mencionado com `@`, um número ou um e-mail |
| `-to` | `<destino>` | Mais um destinatário: um contato, um grupo, um número ou um e-mail (veja [Destinos](index.md#destinos-contato-grupo-número-ou-e-mail)). Repita para vários |
| `-N` | `-N,-N` · `-N..-N` | Sem resposta: a posição das mensagens acima (veja [Várias mensagens](#várias-mensagens--n)) |
| `-quiet`, `-q` | | Não mostra **nada**: nem status (nem o aviso enquanto envia, nem a lista no fim) nem o cabeçalho no que é enviado. Só as falhas são avisadas |
| `-status`, `-s` | | Força o cabeçalho no que é enviado **e** o status (o aviso e o resumo de quem recebeu), mesmo com os settings `forward.header` e `forward.status` desligados |
| `-nohdr` | | Envia sem o cabeçalho `🤖 Mensagem encaminhada pelo ZapBot!` apenas (o status fica; o `-q` tira os dois). Veja [Cabeçalho](#cabeçalho) |
| `-dry`, `-d` | | Só valida os destinatários: responde quem foi encontrado (ou o que está errado) e não envia nada. Não precisa de resposta nem de posições |
| `-add`, `-a` | `#lista <destinatários>...` | Cria a [lista de destinatários](#listas-de-destinatários) (ou acrescenta). Os destinatários são resolvidos agora e guardados com os ids; nunca substitui |
| `-list`, `-l` | `[#lista...]` | Sem nome, todas as listas com o tamanho; com nomes, os destinatários delas (o nome pode ser parcial) |
| `-rm`, `-r` | `<#lista...\|all>` · `#lista <destinatário>...` | Remove a lista inteira, ou só os destinatários indicados dela. Se algum não existir, nada é removido |
| `-move`, `-m` | `#lista #nova` | Renomeia a lista (se o nome novo já existe, junta as duas) |
| `-desc` | `#lista [<descrição>\|-rm]` | Descrição da lista, mostrada no `-list`. Sem texto, mostra; com `-rm`, apaga |

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

## Listas de destinatários

Como as tags do [`/notes`](notes.md), uma `#lista` é um grupo salvo de destinatários, para não digitar
tudo toda vez (uma mala direta).

```text
/forward -a #amigos /Jorge Pereira/ /Rossam Silva/ +5521999999999 a@b.com   cria (ou acrescenta)
/forward -a #amigos -to /Família/                                          o -to também vale como membro
/forward -l                                                                  todas as listas
/forward -l #amigos                                                          os destinatários de #amigos
/forward -r #amigos /Jorge Pereira/                                         tira um destinatário
/forward -r #amigos 2                                                       ...ou pelo número mostrado no -l
/forward -r #amigos                                                         apaga a lista
/forward -m #amigos #time                                                 renomeia (junta se #time existe)
/forward -desc #amigos A turma de sempre                                     descrição

/forward #amigos                        envia para a lista toda (resposta, ou -1 ...)
/forward #amigos #trabalho /Maria/ -to x@y.com   várias listas e avulsos, ninguém duas vezes
/forward -d #amigos                   valida e mostra quem receberia, sem enviar
```

- Os destinatários são resolvidos **na hora de adicionar** (se o nome for ambíguo, você escolhe na
  lista) e guardados com os ids, então o envio é determinístico.
- O `-add` só acrescenta, nunca substitui: para recomeçar, `-rm #amigos` e `-add` de novo.
- Para enviar ou apagar, a lista pede o **nome inteiro**; o nome parcial (`#ami`) só vale para ler
  (`-list`, `-desc`).
- O `-rm` é tudo ou nada: se alguma lista ou destinatário não existir, nada é removido. Tirar o último
  destinatário remove a lista.
- Se alguém da lista for o chat onde você digitou o comando (a conversa de onde veio a mensagem), ele fica de fora: não volta para ele. Um destinatário digitado de propósito recebe, e o `-dry` diz quem ficou de fora.
- Os nomes são minúsculos, com letras, dígitos, `_` e `-`.
- Um envio (listas e avulsos somados) e cada lista são limitados pelo setting
  `forward.maxRecipients` (padrão 30).
- Só admin, como o resto do comando.

## Um texto junto da mensagem

Depois dos destinatários, o que sobrar é um **texto para enviar**. Ele vai no começo da mensagem e, quando você
responde uma mensagem, a respondida vem embaixo (depois de uma linha em branco), abaixo do cabeçalho:

```text
/forward /Meu Contato/ #grupo /Família/ Essa mensagem vai para todos!
(respondendo "Reunião às 10h")
→ 🤖 Mensagem encaminhada pelo ZapBot!

  Essa mensagem vai para todos!

  Reunião às 10h

/forward -q /Jorge Pereira/ Bom dia!             → sem resposta: só o texto, sem cabeçalho e sem status
/forward /Fulano/ Silva                          → "Silva" é o texto (o destinatário é o /Fulano/)
/forward Fulano Silva                            → sem destinatário explícito: é um nome, como sempre
```

- Contam como destinatário explícito: `/Nome/`, `"Nome"`, `@menção`, `+número`, um e-mail, uma `#lista` e o `-to`. A
  primeira palavra solta depois de um deles começa o texto. Só com palavras soltas, elas são um nome (`/forward Fulano Silva`).
- Sem resposta (e sem posições), o texto sozinho é o que vai: não pede uma resposta.
- Com `-q`, não há cabeçalho nem status, só o texto (e a mensagem respondida, se houver).

## Um atalho para um grupo de amigos

Um uso comum: sempre que você vir algo para mandar para as mesmas pessoas, vira um reply só. Aqui com uma lista de
amigos que não gostam do PT (chame de `#nopt`):

**1. Crie a lista** (uma vez). Os destinatários ficam salvos com os ids, e podem ser contatos, grupos ou e-mails:

```text
/forward -add #nopt /Fulano/ /Lourival Neto/ /Grupo Faculdade/ /Rodrigo Souza/ /Rossam Silva/ /Erik Gielow/ /Bruno Melo/
```

**2. Crie um atalho** (uma vez). Com `-q` no alias, só a mensagem encaminhada vai, sem o cabeçalho `🔗 Alias ...`, e
com `-q` no `/forward`, também sem cabeçalho nem status:

```text
/alias -q nopt /forward -q #nopt
```

**3. Use.** Sempre que ver algo que valha mandar, **responda a mensagem com `/nopt`**. Dá para pôr um texto extra, que
vai no começo, com a mensagem respondida embaixo:

```text
(respondendo a mensagem)  /nopt
→ eles recebem só a mensagem

(respondendo a mensagem)  /nopt Olha isso!
→ eles recebem:
  Olha isso!

  <a mensagem respondida>
```

- Para ver quem está na lista: `/forward -l #nopt`. Para pôr ou tirar alguém: `/forward -a #nopt /Maria/` e
  `/forward -r #nopt /Maria/`. Mais em [Listas de destinatários](#listas-de-destinatários).
- Quer o cabeçalho e a confirmação? Use `/alias -q nopt /forward -s #nopt` (o `-s` força os dois).
- Vale para várias listas (`#família`, `#trabalho`): um alias para cada, ou misture numa só:
  `/alias -q todos /forward -q #família #trabalho`. Sem reply, `/nopt Bom dia!` manda só o texto.
- Mais sobre aliases no [`/alias`](alias.md).

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

Ou só numa vez: o `-nohdr` tira só o cabeçalho (o status fica), o `-q` tira o cabeçalho e o status, e o `-s` força os dois:

```text
/forward -nohdr /Jorge Pereira/
/alias -q /nopt /forward -q -nohdr #nopt
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
