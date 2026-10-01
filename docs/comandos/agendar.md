# `/agendar` (`/agenda`) · admin

Envia um texto na hora marcada, como se você digitasse: no chat atual ou, com
`-to`, no privado de uma pessoa ou num grupo. Serve para aniversários, avisos e
mensagens recorrentes.

| Opção | Valor | Descrição |
|---|---|---|
| `<quando>` | | Quando enviar: `30m`, `às 18h`, `amanhã 9h`, `sexta 18h`, `25/12 10:00`... Veja [Quando](lembrete.md#quando) |
| `-to` | `<destino>` | Envia no privado de uma pessoa (`@5521999999999`) ou num grupo, pelo nome ou parte dele (`/Grupo L200/`, `"Grupo L200"` ou `L200`). Veja [Avisar outra pessoa ou um grupo](cotacao.md#avisar-outra-pessoa-ou-um-grupo) |
| `-repetir` | `<diario\|semanal\|mensal>` | Repete no mesmo horário: todo dia, toda semana ou todo mês |
| `-list`, `-l` | | Lista as mensagens agendadas (o mesmo que `/agendar` sem nada) |
| `-rm` | `<nº\|all>` | Remove a mensagem nº N da lista (ou todas) |

```
/agendar 25/12 00:00 Feliz Natal, família! 🎄
/agendar sexta 18h -to /Grupo L200/ Bom fim de semana!
/agenda 05/11 9h -repetir mensal -to @5521999999999 Lembrete: aluguel vence hoje.
/agendar seg 8h -repetir semanal -to trabalho Bom dia! Pauta da semana no drive.
/agendar                        → a lista
/agendar -rm 1                  → remove o nº 1
```

```
📅 Mensagem agendada para sex 02/10 18:00 em 👥 Grupo sobre L200.
📝 Bom fim de semana!
```

```
/agendar -l
📅 Mensagens agendadas (2)

1. sex 02/10 18:00 — Bom fim de semana!
   → 👥 Grupo sobre L200
2. qui 05/11 09:00 🔁 todo mês — Lembrete: aluguel vence hoje.
   → 👤 Fulano
```

Detalhes:

- O texto vai exatamente como foi digitado, inclusive com várias linhas. Um
  texto que comece com `/` é enviado, mas nunca roda como comando.
- As mensagens ficam na tabela `schedules`, são verificadas a cada 30 s e
  sobrevivem a reinícios. Se o bot estiver fora do ar na hora, a mensagem vai
  quando ele voltar.
- O limite é de 50, somando os lembretes do [`/lembrete`](lembrete.md)
  (setting `agenda.max`).
