# `/leave` · admin

Sai de um ou mais grupos do WhatsApp. Sem nada, lista os grupos em que você está, numerados. Para voltar, é
preciso um novo convite ([`/join`](join.md)).

```text
/leave <grupo|nº>...  ou  /leave -l
```

| Opção | Valor | Descrição |
|---|---|---|
| *(nenhuma)* | `<grupo\|nº>...` | Os grupos, separados por espaço ou vírgula, pelo nome ou parte dele, como no `-to` ([Destinos](index.md#destinos-contato-grupo-número-ou-e-mail); vários que servem: você escolhe na lista), ou pelo nº da última lista do `-l` (nome com espaço entre `/.../` ou aspas; palavras soltas, sem nº, barras nem aspas, são um nome só) |
| `-list`, `-l` | | Lista os grupos em que você está (o mesmo que `/leave` sem nada) |

```text
/leave -l
👥 *GRUPOS* (2)

1. Família · 12 participantes
2. Trabalho · 40 participantes

/leave 2
👋 Saí de 👥 Trabalho

/leave 2 1 /Grupo L200/  → vários de uma vez
```

Saindo do próprio grupo em que o comando foi dado, a confirmação pode não chegar (você já não está lá).
