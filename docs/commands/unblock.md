# `/unblock` · admin

Desbloqueia uma pessoa bloqueada pelo [`/block`](block.md) ou no celular, ou todas com `-all`.
Respondendo uma mensagem, desbloqueia quem a escreveu. Sem nada, mostra a lista do `/block`.

```text
/unblock [/contato/|@menção|+número|nº]  ou  /unblock -all
```

| Opção | Valor | Descrição |
|---|---|---|
| *(nenhuma)* | `[/contato/\|@menção\|+número\|nº]` | A pessoa, como no `/block`, ou o nº da lista do `/block`. Sem nada, a lista |
| `-all`, `-a` | | Desbloqueia todos os bloqueados, inclusive os que você bloqueou no celular |

```text
/unblock /Fulano/           → desbloqueia o contato
/unblock 2                  → o nº 2 da lista do /block
/unblock +5521999999999     → pelo número
/unblock -all               → todos (o mesmo que /unblock -a)
```

```text
/unblock 2
✅ Desbloqueado: 👤 Fulano · +5521999999999

/unblock -all
⏳ Desbloqueando 36 contatos, aguarde.
```

No fim, essa mesma mensagem vira o resultado (como no [`/get`](get.md)):

```text
✅ 36 desbloqueados.
```

- O nº é o da última lista do `/block` que você viu; sem lista, o bot consulta os bloqueados na
  hora.
- O WhatsApp guarda os bloqueios pelo id interno (`@lid`): o bot converte para o telefone e usa o
  nome da sua agenda. Quem não tem telefone conhecido aparece pelo id, com `(id interno, sem
  telefone conhecido)`, e o `/unblock <nº>` funciona do mesmo jeito.
- Depois de desbloquear, o bot confere na lista do WhatsApp: só conta quem saiu dela. Um bloqueio
  antigo, guardado pelo telefone, pode resistir ao primeiro desbloqueio (que é pelo id interno,
  `@lid`); quem fica é desbloqueado de novo pelo id que está na lista e, se ainda assim ficar,
  aparece como falha (`o WhatsApp não desbloqueou (continua na lista)`), não como desbloqueado.
- O `-all` desbloqueia um por um: quem falhar não segura os outros, e a resposta lista as falhas
  (`⚠️ Não consegui desbloquear (1):`, com o motivo de cada uma).
- Quem não está bloqueado: o bot avisa (`ℹ️ 👤 Fulano não está bloqueado.`).
