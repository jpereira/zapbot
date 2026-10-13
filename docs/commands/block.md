# `/block` (`/bloquear`) · admin

Bloqueia uma ou várias pessoas na sua conta do WhatsApp, como o **Bloquear** do celular: elas deixam
de conseguir te mandar mensagens e ligar. Respondendo uma mensagem, bloqueia quem a escreveu. Sem nada, lista os
bloqueados, inclusive os que você bloqueou no celular, numerados para o [`/unblock <nº>`](unblock.md).

```text
/block [/contato/|@menção|+número]...  ou  /block -l
```

| Opção | Valor | Descrição |
|---|---|---|
| *(nenhuma)* | `[/contato/\|@menção\|+número]...` | As pessoas, separadas por espaço: contato da agenda pelo nome ou parte dele (vários que servem: você escolhe na lista), alguém mencionado com `@` ou um número. Sem ninguém, respondendo uma mensagem: quem a escreveu. Veja [Várias pessoas](#várias-pessoas) |
| `-list`, `-l` | | Lista os bloqueados (o mesmo que `/block` sem nada) |
| `-mask`, `-m` | | Ofusca telefones na saída desta execução. Ex.: `+55219****44` |

A pessoa é buscada como no `-to` ([Destinos](index.md#destinos-contato-grupo-número-ou-e-mail)),
só entre os contatos: grupos não se bloqueiam.

```text
/block /Fulano/             → bloqueia o contato
/block +5521999999999       → pelo número
/block @Fulano              → num grupo, mencionando a pessoa
/block +5521999999999 +5521988888888 /Ciclano Souza/  → várias de uma vez
/block                      → respondendo uma mensagem: quem a escreveu (sem responder: a lista)
/block -l                   → a lista
```

```text
/block /Fulano/
🚫 Bloqueado: 👤 Fulano
💡 Desfaça com /unblock; veja a lista com /block.

/block
🚫 Bloqueados (2)

1. 👤 Beltrano · +5521988887777
2. 👤 Fulano · +5521999999999

💡 Desbloqueie com /unblock <nº|nome>.
```

## Várias pessoas

Separe as pessoas por espaço: cada número (`+5521…`), cada `@menção` e cada nome entre barras
(`/Ciclano Souza/`) ou aspas é uma pessoa. Palavras soltas, sem nenhum desses, são um nome só:
`/block Ciclano Souza` é o Ciclano Souza, não o Ciclano e o Souza. Cada nome com mais de um contato
pede a escolha na lista, um de cada vez; quem não é achado tem o erro de sempre, e os outros seguem.
No fim, um resumo só:

```text
/block +5521999999999 /Ciclano Souza/ @Beltrano
🚫 Bloqueados (2):
👤 Fulano
👤 Ciclano Souza

ℹ️ Já estavam bloqueados (1):
👤 Beltrano

💡 Desfaça com /unblock; veja a lista com /block.
```

A mesma pessoa repetida conta uma vez.

## Detalhes

- O bloqueio é feito pelo id interno da pessoa (`@lid`), que o bot pergunta ao WhatsApp antes; um
  número que o WhatsApp Web ainda não conhecia também funciona. Depois, o bot confere na lista do
  WhatsApp: só conta como bloqueado quem entrou nela.
- Se o WhatsApp recusar (ou a pessoa não entrar na lista), o bot diz por quê, em vez de bloqueado:
  `⚠️ Não consegui bloquear 👤 Fulano: o WhatsApp recusou o bloqueio (erro "t").`. Com várias
  pessoas, ela vai para `❌ Não bloqueados`, e as outras seguem.
- Quem já está bloqueado: o bot avisa (`ℹ️ 👤 Fulano já está bloqueado.`).
- A conta do próprio bot não pode ser bloqueada.
- A lista vem do WhatsApp, que guarda os bloqueios pelo id interno (`@lid`): o bot converte cada um
  para o telefone e usa o nome da sua agenda (ou o do perfil). Quem não tem telefone conhecido
  aparece pelo id, com `(id interno, sem telefone conhecido)`, depois dos outros.
