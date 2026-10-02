# `/cron` (`/agenda`, `/lembrete`) · admin

Faz algo na hora marcada. Tem dois modos, na mesma agenda:

- **Mensagem** (`/cron`, `/agenda`): envia o texto como se você
  digitasse, no chat atual ou, com `-to`, num contato, num grupo ou num número.
  Serve para aniversários, avisos e mensagens recorrentes.
- **Lembrete** (`/lembrete`, ou qualquer um com `-lembrete`): envia
  `⏰ Lembrete` e o texto, respondendo a mensagem do comando, no chat atual (ou
  no seu privado, com `-pv`). Respondendo (reply) uma mensagem, o lembrete cita
  essa mensagem, e o texto dela vira o lembrete se você não escrever outro.

| Opção | Valor | Descrição |
|---|---|---|
| `<quando>` | | Quando: `6h`, `às 18h`, `+2h`, `30m`, `amanhã 9h`, `sexta 18h`, `25/12 10:00`... Veja [Quando](#quando) |
| `-to` | `<destino>` | Modo mensagem: envia num contato (`/Jorge Pereira/`), num grupo (`/Grupo L200/`) ou num número (`+5521999999999`) em vez do chat atual. O contato é buscado primeiro; vários com o nome: você escolhe na lista. E-mail não vale: a mensagem sai no WhatsApp. Veja [Destinos](index.md#destinos-contato-grupo-número-ou-e-mail) |
| `-lembrete` | | Modo lembrete (o mesmo de chamar como `/lembrete`) |
| `-pv` | | Modo lembrete: lembra no seu privado em vez do chat atual |
| `-repetir`, `-r` | `<diario\|semanal\|mensal>` | Repete no mesmo horário: todo dia, toda semana ou todo mês |
| `-list`, `-l` | | Lista os lembretes e as mensagens (o mesmo que o comando sem nada) |
| `-rm` | `<nº\|all>` | Remove o item nº N da lista (ou todos) |

```
/cron 25/12 00:00 Feliz Natal, família! 🎄
/cron sexta 18h -to /Grupo L200/ Bom fim de semana!
/cron seg 8h -repetir semanal -to trabalho Bom dia! Pauta da semana no drive.
/agenda 05/11 9h -repetir mensal -to +5521999999999 Lembrete: aluguel vence hoje.
/cron amanhã 8h -to /Jorge Pereira/ Bom dia! Não esquece a reunião.
/cron 20/10 -to /Família/ Parabéns, vó! 🎂
/lembrete 30m tirar o bolo do forno
/lembrete às 18h pagar o boleto
/lembrete -pv amanhã 9h ligar pro banco
/cron -lembrete sexta 18h -r semanal enviar o relatório
/lembrete +2h                   (respondendo uma mensagem: lembra dela daqui a 2 horas)
/cron 6h -r diario -to /Grupo L200/ Bom dia!   (todo dia às 06:00)
/cron                           → a lista
/cron -rm 2                     → remove o nº 2
```

```
📅 Mensagem agendada para sex 02/10 18:00 em 👥 Grupo sobre L200.
📝 Bom fim de semana!

⏰ Lembrete criado para sex 02/10 18:00 🔁 toda semana neste chat.
📝 enviar o relatório
```

Na hora, a mensagem sai como você a escreveu; o lembrete sai assim:

```
⏰ Lembrete

enviar o relatório
```

A lista mostra os dois tipos juntos, na ordem em que vão sair (📅 mensagem,
⏰ lembrete), e os números são os do `-rm`:

```
/cron -l
📅 Agenda (3)

1. ⏰ qui 01/10 18:00 — pagar o boleto
   → 👥 Família
2. 📅 sex 02/10 18:00 — Bom fim de semana!
   → 👥 Grupo sobre L200
3. 📅 qui 05/11 09:00 🔁 todo mês — Lembrete: aluguel vence hoje.
   → 👤 Fulano
```

## Quando

O "quando" vem no começo, junto com as opções (em qualquer ordem); o texto é o
resto, como foi digitado (com várias linhas, se for o caso). Tudo no horário de
Brasília.

| Forma | Exemplo | Significa |
|---|---|---|
| Horário | `6h`, `07h`, `18:30`, `18h30`, `às 18h` | Hoje nesse horário; se já passou, amanhã |
| Duração | `+2h`, `em 2h`, `daqui a 2h`, `30m`, `1d`, `1h30m` | Daqui a tanto tempo. Horas sozinhas são horário (`6h` é 06:00): para "daqui a 6 horas", use `+6h` ou `em 6h` |
| Hoje / amanhã | `hoje 22h`, `amanhã`, `amanhã 10:00` | Sem hora: 9h |
| Dia da semana | `sexta`, `seg 8h`, `sábado 10:00` | O próximo (hoje, se a hora ainda não passou). Sem hora: 9h |
| Data | `25/12`, `25/12 10:00`, `25/12/2027 10h` | Sem ano: a próxima vez que a data chega. Sem hora: 9h |

Até 366 dias à frente. O `-repetir mensal` (ou `-r mensal`) mantém o dia do mês: um item do dia
31 vai no último dia dos meses mais curtos e volta ao 31 depois.

## Detalhes

- Tudo fica na tabela `schedules`, sobrevive a reinícios e é verificado a cada
  30 s. Se o bot estiver fora do ar na hora, o item vai quando ele voltar (o
  lembrete avisa: `(atrasado: era para ...)`). Um repetido vai uma vez e segue
  para o próximo horário.
- Uma mensagem que comece com `/` é enviada, mas nunca roda como comando.
- O `-to` é só do modo mensagem; o `-pv`, só do lembrete.
- O limite é de 50 itens, somando os dois tipos (setting `agenda.max`).
