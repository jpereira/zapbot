# `/lembrete` (`/lemb`) · admin

Lembrete na hora marcada, no chat atual (ou no seu privado, com `-pv`). O bot
responde a mensagem do comando com `⏰ Lembrete` e o texto. Respondendo (reply)
uma mensagem, o lembrete cita essa mensagem, e o texto dela vira o lembrete se
você não escrever outro.

| Opção | Valor | Descrição |
|---|---|---|
| `<quando>` | | Quando lembrar. Veja [Quando](#quando) |
| `-pv` | | Lembra no seu privado em vez do chat atual |
| `-repetir` | `<diario\|semanal\|mensal>` | Repete no mesmo horário: todo dia, toda semana ou todo mês |
| `-list`, `-l` | | Lista os lembretes (o mesmo que `/lembrete` sem nada) |
| `-rm` | `<nº\|all>` | Remove o lembrete nº N da lista (ou todos) |

```
/lembrete 30m tirar o bolo do forno
/lembrete às 18h pagar o boleto
/lemb -pv amanhã 9h ligar pro banco
/lembrete sexta 18h -repetir semanal enviar o relatório
/lembrete 2h                    (respondendo uma mensagem: lembra dela)
/lembrete                       → a lista
/lembrete -rm 2                 → remove o nº 2
```

```
⏰ Lembrete criado para sex 02/10 18:00 🔁 toda semana neste chat.
📝 enviar o relatório
```

Na hora:

```
⏰ Lembrete

enviar o relatório
```

## Quando

O "quando" vem no começo, junto com as opções (em qualquer ordem); o texto é o
resto. Tudo no horário de Brasília.

| Forma | Exemplo | Significa |
|---|---|---|
| Duração | `30m`, `2h`, `1d`, `1h30m` | Daqui a tanto tempo (`18h` sozinho é "daqui a 18 horas") |
| Horário | `18:30`, `18h30`, `às 18h` | Hoje nesse horário; se já passou, amanhã |
| Hoje / amanhã | `hoje 22h`, `amanhã`, `amanhã 10:00` | Sem hora: 9h |
| Dia da semana | `sexta`, `seg 8h`, `sábado 10:00` | O próximo (hoje, se a hora ainda não passou). Sem hora: 9h |
| Data | `25/12`, `25/12 10:00`, `25/12/2027 10h` | Sem ano: a próxima vez que a data chega. Sem hora: 9h |

Até 366 dias à frente. O `-repetir mensal` mantém o dia do mês: um lembrete do
dia 31 vai no último dia dos meses mais curtos e volta ao 31 depois.

## Detalhes

- Os lembretes ficam na tabela `schedules` e sobrevivem a reinícios. São
  verificados a cada 30 s.
- Se o bot estiver fora do ar na hora, o lembrete vai quando ele voltar, com
  `(atrasado: era para ...)`. Um repetido vai uma vez e segue para o próximo
  horário.
- O limite é de 50, somando os do [`/agendar`](agendar.md) (setting
  `agenda.max`).
- Para mandar uma mensagem a outra pessoa ou grupo na hora marcada, use o
  [`/agendar`](agendar.md).
