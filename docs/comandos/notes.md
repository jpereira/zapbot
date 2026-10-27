# `/notes` · admin

Anotações salvas no banco, que valem para qualquer chat (grupo ou privado). Cada uma tem um ID, e o
`-alerta` avisa dela numa data/hora. Só o dono (e os admins) usa.

```text
/notes [-list|-l] [#tag...] [-to <destino>]...
/notes #tag [-to <destino>]...
/notes -search|-s [#tag...] <texto|/regex/flags> [-to <destino>]...
/notes -tags|-t [-to <destino>]...
/notes -update|-u <id> [#tag] <novo texto>
/notes -export|-e [#tag...] [-to <destino>]...
/notes [#tag] <texto>
/notes -add|-a [#tag] <texto> [-alerta <quando> [-to <destino>]...]
/notes -rem|-r <id...|#tag...|all>
/notes -alerta [<id|#tag...> [<quando> [-to <destino>]...]]
/notes -alerta -rm <id...|#tag...|all>
```

| Opção | Valor | Descrição |
|---|---|---|
| `-list`, `-l` | `[#tag...]` | Lista as anotações com o ID, agrupadas por `#tag` (é o que o `/notes` sem opção faz). Com uma ou mais tags, só as delas |
| `-search`, `-s` | `[#tag...] <texto\|/regex/flags>` | Só as anotações que casam, agrupadas como na lista. Veja [Buscar](#buscar) |
| `-tags`, `-t` | | Todas as tags com a quantidade de anotações de cada uma (as sem tag por último) |
| `-update`, `-u` | `<id> [#tag] <novo texto>` | Troca o texto da anotação (e a tag, se vier uma; o alerta e a imagem ficam). Em resposta a uma mensagem, sem texto, usa o dela |
| `-export`, `-e` | `[#tag...]` | Manda as anotações num PDF (cabeçalho, rodapé com versão, host, data e hora, e paginação). Com tags, só as delas. Veja [Exportar](#exportar) |
| `<texto>` | | Sem opção na frente, o texto vira uma anotação nova, igual ao `-add`: `/notes não esquecer de remover a opção tal` |
| `-add`, `-a` | `[#tag] <texto>` | Adiciona uma anotação; a `#tag` só vale no começo do texto. O texto vai até o `-alerta`, se houver, e aceita várias linhas |
| `-rem`, `-r` | `<id...\|#tag...\|all>` | Remove as anotações com esses IDs (`-r 2`, `-r 1 2 3` ou `-r 1,2,3`), de uma tag (`-r #casa`) ou todas (`all`). Se algum ID ou tag não existe, nenhuma sai |
| `-alerta` | `<quando>` | Avisa da anotação (ou de todas as de uma `#tag`) numa data/hora. Veja [Alertas](#alertas) |
| `-rm` | `<id...\|#tag...\|all>` | Junto com `-alerta`: tira o alerta dessas anotações, de uma tag ou de todas, mantendo as anotações |
| `-to` | `<destino>` | Com `-alerta`: avisa num contato, grupo, número ou e-mail em vez do seu privado. Com a lista (`-l`, `#tag`) ou o `-export`: manda a lista ou o PDF lá, em vez de responder no chat. Repita para vários |

```text
/notes -a comprar leite
/notes comprar pão                                → o mesmo que -a
/notes -a ligar pro João -alerta amanhã 9h
/notes -l
/notes -r 2
/notes -r all
/notes -update 3 comprar pão e leite             → troca o texto da nº 3
/notes -u #3 #casa comprar pão\ne leite          → troca o texto e passa para a #casa
/notes -tags                                      → #casa: 3, #duvidas: 1, sem tag: 2
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

- Respondendo uma mensagem, `/notes` (ou `/notes #lembrete`, `/notes -a`) anota o texto dela, com o
  ↩️ na frente. Texto digitado junto vale no lugar do da mensagem (sem o ↩️). Dá para juntar com
  `-alerta`: `/notes -a #lembrete -alerta amanhã 9h`. No PDF, o ↩️ vira `[resp.]`.
- No texto da anotação, `\n` vira quebra de linha (`/notes #casa pão\nleite`); `\\n` fica como está.
- **Imagens:** mande uma foto com a legenda `/notes #minhatag Imagem de teste` ou responda uma foto
  com `/notes [#tag] [texto]`. O texto é opcional (numa resposta com legenda, vale a legenda, com o
  ↩️). A imagem fica em `cache/notes/` (fora do `cache/media/`, então o `/cache -media` não apaga) e
  a lista mostra `🖼️ imagem`. `-rem` apaga o arquivo junto. Só imagens (JPEG, PNG, WebP, GIF).
- Cada anotação tem no máximo uma tag, a do começo do texto. Maiúsculas e minúsculas valem igual.
- `/notes #casa` sozinho filtra; com texto depois, anota.

## Buscar

O mesmo `-q` do [`/show`](show.md) e do [`/watch`](watch.md): texto sem diferenciar maiúsculas e
acentos, ou `/regex/flags`.

```text
/notes -s pao                    → as que têm "pão" (e "PAO", "Pão"...)
/notes -search /etf|bolsa/i      → regex
/notes -s "comprar pão"          → com espaços, o texto vale direto (as aspas são opcionais)
/notes -s #casa leite            → só as da #casa que casam
/notes -s casa                   → também casa o nome da tag (as da #casa)
/notes -s etf -to /Família/      → manda o resultado nos destinos
```

- Regex com risco de travar o bot (como `(x+)+`) é recusada.

## Exportar

```text
/notes -e          → ZapBot_notes_20261027_1530.pdf, com tudo, agrupado por #tag
/notes -e #casa    → ZapBot_notes_tag-casa_20261027_1530.pdf, só as da #casa
/notes -e -to /Família/                  → o PDF no grupo Família
/notes #casa -to /Jorge Pereira/ -to email  → a lista da #casa no contato e por e-mail
```

O `-to` funciona como nos outros comandos (veja
[Avisar em outro chat ou por e-mail](cotacao.md#avisar-em-outro-chat-ou-por-e-mail)). Não vale no
`-rem`.

- Sai como documento no próprio chat (com `-to`, nos destinos; por e-mail, em anexo). A data e a hora do nome são de Brasília.
- A fonte do PDF é Latin-1: acentos saem normais, mas emojis e símbolos fora dela são omitidos.

## Alertas

O mesmo esquema do `-alerta` do [`/cotacao`](cotacao.md#alertas-de-preço): lista, `-rm`, `-to` e
uma verificação periódica (a cada minuto). Aqui a condição é uma data/hora, e o aviso é a própria
anotação.

```text
/notes -a ligar pro João -alerta amanhã 9h       → anota e avisa amanhã às 9h
/notes -alerta 3 +2h                              → avisa da anotação 3 daqui a 2 horas
/notes -alerta 3 sexta 18:30 -to /Família/        → avisa no grupo Família
/notes -alerta #casa +2h -to /Família/            → avisa de todas as da #casa, no grupo Família
/notes -a pagar boleto -alerta 25/12 10h -to /Jorge Pereira/ -to email
/notes -alerta                                    → lista só as anotações com alerta
/notes -alerta #casa                              → só as da #casa que têm alerta
/notes -alerta -rm 3                              → tira o alerta da nº 3 (a anotação fica)
/notes -alerta -rm #casa                          → tira os alertas da #casa
/notes -alerta -rm all                            → tira todos os alertas
```

- O `<quando>` é o mesmo do [`/cron`](cron.md): `+2h`, `30m`, `1h30m`, `18h`, `18:30`, `hoje 18h`,
  `amanhã [9h]`, `sexta [18h]`, `25/12 [10h]`, `25/12/2027 10h` (sem hora: 9h). Máximo de 365 dias à
  frente; datas passadas são recusadas.
- O alerta dispara **uma vez** e some; a anotação continua na lista. Para repetir, crie outro
  `-alerta <id> <quando>` (ele troca o anterior).
- Com `#tag`, o alerta vai em todas as anotações da tag (trocando os que já tinham), e na hora saem
  uma mensagem por anotação. Se a tag não existe, nada é mexido.
- Sem `-to`, o aviso vai para o seu privado. O `-to` aceita os mesmos destinos dos outros alertas
  (veja [Avisar em outro chat ou por e-mail](cotacao.md#avisar-em-outro-chat-ou-por-e-mail)).
- Se o bot estava fora do ar na hora, o aviso sai assim que ele voltar.
