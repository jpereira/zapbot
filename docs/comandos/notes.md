# `/notes` · admin

Anotações salvas no banco, que valem para qualquer chat (grupo ou privado). Cada uma tem um ID, e o
`-alerta` avisa dela numa data/hora. Só o dono (e os admins) usa.

```text
/notes [-list|-l] [#tag...]
/notes #tag
/notes [#tag] <texto>
/notes -add|-a [#tag] <texto> [-alerta <quando> [-to <destino>]...]
/notes -rem|-r <id...|#tag...|all>
/notes -alerta [<id> <quando> [-to <destino>]...]
/notes -alerta -rm <id...|all>
```

| Opção | Valor | Descrição |
|---|---|---|
| `-list`, `-l` | `[#tag...]` | Lista as anotações com o ID, agrupadas por `#tag` (é o que o `/notes` sem opção faz). Com uma ou mais tags, só as delas |
| `<texto>` | | Sem opção na frente, o texto vira uma anotação nova, igual ao `-add`: `/notes não esquecer de remover a opção tal` |
| `-add`, `-a` | `[#tag] <texto>` | Adiciona uma anotação; a `#tag` só vale no começo do texto. O texto vai até o `-alerta`, se houver, e aceita várias linhas |
| `-rem`, `-r` | `<id...\|#tag...\|all>` | Remove as anotações com esses IDs (`-r 2`, `-r 1 2 3` ou `-r 1,2,3`), de uma tag (`-r #casa`) ou todas (`all`). Se algum ID ou tag não existe, nenhuma sai |
| `-alerta` | `<quando>` | Avisa da anotação numa data/hora. Veja [Alertas](#alertas) |
| `-rm` | `<id...\|all>` | Junto com `-alerta`: tira o alerta dessas anotações (ou de todas), mantendo as anotações |
| `-to` | `<destino>` | Junto com `-alerta`: avisa num contato, grupo, número ou e-mail em vez do seu privado. Repita para vários |

```text
/notes -a comprar leite
/notes comprar pão                                → o mesmo que -a
/notes -a ligar pro João -alerta amanhã 9h
/notes -l
/notes -r 2
/notes -r all
```

## Tags

```text
/notes #casa Lembrar de comprar pão
/notes -a #duvidas Olhar sobre como funciona as ETFs
/notes                → lista tudo, agrupado por #tag (as sem tag por último)
/notes #casa          → só as da #casa (o mesmo que /notes -l #casa)
/notes -rem #casa     → remove todas as da #casa
/notes -rem all       → remove tudo
```

- Cada anotação tem no máximo uma tag, a do começo do texto. Maiúsculas e minúsculas valem igual.
- `/notes #casa` sozinho filtra; com texto depois, anota.

## Alertas

O mesmo esquema do `-alerta` do [`/cotacao`](cotacao.md#alertas-de-preço): lista, `-rm`, `-to` e
uma verificação periódica (a cada minuto). Aqui a condição é uma data/hora, e o aviso é a própria
anotação.

```text
/notes -a ligar pro João -alerta amanhã 9h       → anota e avisa amanhã às 9h
/notes -alerta 3 +2h                              → avisa da anotação 3 daqui a 2 horas
/notes -alerta 3 sexta 18:30 -to /Família/        → avisa no grupo Família
/notes -a pagar boleto -alerta 25/12 10h -to /Jorge Pereira/ -to email
/notes -alerta                                    → lista só as anotações com alerta
/notes -alerta -rm 3                              → tira o alerta da nº 3 (a anotação fica)
/notes -alerta -rm all                            → tira todos os alertas
```

- O `<quando>` é o mesmo do [`/cron`](cron.md): `+2h`, `30m`, `1h30m`, `18h`, `18:30`, `hoje 18h`,
  `amanhã [9h]`, `sexta [18h]`, `25/12 [10h]`, `25/12/2027 10h` (sem hora: 9h). Máximo de 365 dias à
  frente; datas passadas são recusadas.
- O alerta dispara **uma vez** e some; a anotação continua na lista. Para repetir, crie outro
  `-alerta <id> <quando>` (ele troca o anterior).
- Sem `-to`, o aviso vai para o seu privado. O `-to` aceita os mesmos destinos dos outros alertas
  (veja [Avisar em outro chat ou por e-mail](cotacao.md#avisar-em-outro-chat-ou-por-e-mail)).
- Se o bot estava fora do ar na hora, o aviso sai assim que ele voltar.
