# `/cron` (`/agenda`, `/lembrete`) · admin

Faz algo na hora marcada. Tem dois modos, na mesma agenda:

- **Mensagem** (`/cron`, `/agenda`): envia o texto como se você
  digitasse, no chat atual ou, com `-to`, num contato, num grupo ou num número.
  Serve para aniversários, avisos e mensagens recorrentes.
- **Lembrete** (`/lembrete`, ou qualquer um com `-lembrete`/`-lem`): envia
  `⏰ Lembrete` e o texto, respondendo a mensagem do comando, no chat atual (ou
  no seu privado, com `-pv`). Respondendo (reply) uma mensagem, o lembrete cita
  essa mensagem, e o texto dela vira o lembrete se você não escrever outro.

| Opção | Valor | Descrição |
|---|---|---|
| `<quando>` | | Quando: `6h`, `às 18h`, `+2h`, `30m`, `amanhã 9h`, `sexta 18h`, `25/12 10:00`... Veja [Quando](#quando) |
| `-to` | `<destino>` | Modo mensagem: envia num contato (`/Jorge Pereira/`), num grupo (`/Grupo L200/`) ou num número (`+5521999999999`) em vez do chat atual. Repita para vários: um item por destino. O contato é buscado primeiro; vários com o nome: você escolhe na lista. E-mail não vale: a mensagem sai no WhatsApp. Veja [Destinos](index.md#destinos-contato-grupo-número-ou-e-mail) |
| `-lembrete`, `-lem` | | Modo lembrete (o mesmo de chamar como `/lembrete`) |
| `-pv` | | Modo lembrete: lembra no seu privado em vez do chat atual |
| `-repetir`, `-r` | `<diario\|semanal\|mensal>` | Repete no mesmo horário: todo dia, toda semana ou todo mês |
| `-list`, `-l` | | Lista os lembretes e as mensagens (o mesmo que o comando sem nada) |
| `-edit` | `<nº>` | Edita o item nº N: troca a hora, o texto e/ou o `-repetir`. Veja [Editar, pausar e retomar](#editar-pausar-e-retomar) |
| `-pause` | `<nº\|all>` | Pausa o item nº N (ou todos): fica na lista, mas não sai |
| `-resume` | `<nº\|all>` | Retoma um item pausado |
| `-rm` | `<nº\|all>` | Remove o item nº N da lista (ou todos) |

```
/cron 25/12 00:00 Feliz Natal, família! 🎄
/cron sexta 18h -to /Grupo L200/ Bom fim de semana!
/cron seg 8h -repetir semanal -to trabalho Bom dia! Pauta da semana no drive.
/agenda 05/11 9h -repetir mensal -to +5521999999999 Lembrete: aluguel vence hoje.
/cron amanhã 8h -to /Jorge Pereira/ Bom dia! Não esquece a reunião.
/cron 20/10 -to /Família/ Parabéns, vó! 🎂
/cron 8h -r diario -to /Família/ -to /Trabalho/ Bom dia!   (um item em cada grupo)
/lembrete 30m tirar o bolo do forno
/lembrete às 18h pagar o boleto
/lembrete -pv amanhã 9h ligar pro banco
/cron -lem sexta 18h -r semanal enviar o relatório
/lembrete +2h                   (respondendo uma mensagem: lembra dela daqui a 2 horas)
/cron 6h -r diario -to /Grupo L200/ Bom dia!   (todo dia às 06:00)
/cron                           → a lista
/cron -edit 2 18:30             → o nº 2 passa para 18:30
/cron -pause 3                  → segura o nº 3 (e /cron -resume 3 solta)
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
⏰ lembrete), e os números são os do `-edit`, do `-pause`/`-resume` e do `-rm`:

```
/cron -l
📅 Agenda (3)

1. ⏰ qui 01/10 18:00 — pagar o boleto
   → 👥 Família
2. 📅 sex 02/10 18:00 — Bom fim de semana!
   → 👥 Grupo sobre L200
3. 📅 qui 05/11 09:00 🔁 todo mês ⏸️ pausado — Lembrete: aluguel vence hoje.
   → 👤 Fulano
```

## Editar, pausar e retomar

O `-edit <nº>` troca o que vier depois dele, com a mesma leitura de um item
novo: um "quando" muda a hora, o `-repetir` (`-r`) muda a repetição (`-r nao`
tira) e o resto vira o texto novo. O destino e o modo (mensagem ou lembrete)
não mudam: para isso, remova (`-rm`) e crie de novo.

```
/cron -edit 2 18:30                       → só a hora
/cron -edit 2 Bom dia, pessoal!           → só o texto
/cron -edit 2 sexta 9h -r semanal Pauta   → hora, repetição e texto
/cron -edit 2 -r nao                      → deixa de repetir
```

O `-pause <nº|all>` segura o item: ele continua na lista (com ⏸️), mas não sai.
O `-resume <nº|all>` solta. Um item repetido que venceu enquanto estava pausado
pula para o próximo horário; um item único que já passou sai na hora (a
resposta avisa).

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
- O `-to` é só do modo mensagem; o `-pv`, só do lembrete. Com vários `-to`,
  cada destino vira um item (e conta no limite); o mesmo destino repetido
  conta uma vez.
- O limite é de 50 itens, somando os dois tipos (setting `agenda.max`).
