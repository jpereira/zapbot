# `/cron` (`/agenda`, `/lembrete`) · admin

Faz algo na hora marcada. Tem dois modos, na mesma agenda:

- **Mensagem** (`/cron`, `/agenda`): envia o texto como se você digitasse, no chat atual ou, com
  `-to`, num contato, num grupo ou num número. Serve para aniversários, avisos e mensagens
  recorrentes.
- **Lembrete** (`/lembrete`, ou qualquer um com `-lembrete`/ `-lem`): envia `⏰ Lembrete` e o texto,
  respondendo a mensagem do comando, no chat atual (ou no seu privado, com `-pv`). Respondendo
  (reply) uma mensagem, o lembrete cita essa mensagem, e o texto dela vira o lembrete se você não
  escrever outro.

| Opção | Valor | Descrição |
|---|---|---|
| `<quando>` | | Quando: `6h`, `às 18h`, `+2h`, `30m`, `amanhã 9h`, `sexta 18h`, `25/12 10:00`... Veja [Quando](#quando) |
| `-to` | `<destino>` | Modo mensagem: envia num contato (`/Jorge Pereira/`), numa menção (`@Fulano Da Silva`), num grupo (`/Grupo L200/`) ou num número (`+5521999999999`) em vez do chat atual. Repita para vários: um item só, que sai em todos os destinos. Nomes exatos têm prioridade; vários resultados: você escolhe na lista. E-mail não vale: a mensagem sai no WhatsApp. Veja [Destinos](index.md#destinos-contato-grupo-número-ou-e-mail) |
| `-lembrete`, `-lem` | | Modo lembrete (o mesmo de chamar como `/lembrete`) |
| `-pv` | | Modo lembrete: lembra no seu privado em vez do chat atual |
| `-repetir`, `-r` | `<diario\|semanal\|mensal>` | Repete no mesmo horário: todo dia, toda semana ou todo mês |
| `-list`, `-l` | | Lista os lembretes e as mensagens, com o texto inteiro (o mesmo que o comando sem nada) |
| `-edit` | `<nº>` | Edita o item nº N: troca a hora, o texto e/ou o `-repetir`. Veja [Editar, pausar e retomar](#editar-pausar-e-retomar) |
| `-pause` | `<nº...\|all>` | Pausa o item nº N, vários (`-pause 1 3` ou `1,3`) ou todos: fica na lista, mas não sai. Se algum nº não existe, nenhum é pausado |
| `-resume` | `<nº...\|all>` | Retoma itens pausados: um, vários ou todos |
| `-rm` | `<nº...\|all>` | Remove o item nº N da lista, vários de uma vez (`-rm 1 3 5` ou `-rm 1,3,5`) ou todos. Se algum nº não existe, nenhum sai |
| `-test` | `<nº>` | Monta o item nº N agora, rodando os `{/comando}` do texto, e mostra aqui como ele sairia. Veja [Comandos no texto](#comandos-no-texto) |

```text
/cron 25/12 00:00 Feliz Natal, família! 🎄
/cron sexta 18h -to /Grupo L200/ Bom fim de semana!
/cron seg 8h -repetir semanal -to trabalho Bom dia! Pauta da semana no drive.
/agenda 05/11 9h -repetir mensal -to +5521999999999 Lembrete: aluguel vence hoje.
/cron amanhã 8h -to /Jorge Pereira/ Bom dia! Não esquece a reunião.
/cron 18h -to @Fulano Da Silva Já saiu do trabalho?   (num grupo, mencionando)
/cron 20/10 -to /Família/ Parabéns, vó! 🎂
/cron 8h -r diario -to /Família/ -to /Trabalho/ Bom dia!   (um item, nos dois grupos)
/lembrete 30m tirar o bolo do forno
/lembrete às 18h pagar o boleto
/lembrete -pv amanhã 9h ligar pro banco
/cron -lem sexta 18h -r semanal enviar o relatório
/lembrete +2h                   (respondendo uma mensagem: lembra dela daqui a 2 horas)
/cron 6h -r diario -to /Grupo L200/ Bom dia!   (todo dia às 06:00)
/cron 9h -r diario -to /ZapBot/ O preço do Bitcoin agora: {/crypto BTC}
/cron                           → a lista
/cron -edit 2 18:30             → o nº 2 passa para 18:30
/cron -pause 3                  → segura o nº 3 (e /cron -resume 3 solta)
/cron -rm 2                     → remove o nº 2
/cron -rm 1 3 5                 → remove o 1, o 3 e o 5 (os números da lista de antes)
```

```text
📅 Mensagem agendada para sex 02/10 18:00 em 👥 Grupo sobre L200.
📝 Bom fim de semana!

⏰ Lembrete criado para sex 02/10 18:00 🔁 toda semana neste chat.
📝 enviar o relatório
```

Na hora, a mensagem sai como você a escreveu; o lembrete sai assim:

```text
⏰ Lembrete

enviar o relatório
```

A lista mostra os dois tipos juntos, na ordem em que vão sair (📅 mensagem, ⏰ lembrete), com o texto
inteiro, como foi cadastrado (os `{/comando}` também), e os números são os do `-edit`, do `-pause`/
`-resume` e do `-rm`. Um item com vários `-to` mostra um destino por linha:

```text
/cron -l
📅 Agenda (3)

1. ⏰ qui 01/10 18:00 — pagar o boleto
   → 👥 Família
2. 📅 sex 02/10 18:00 — Bom fim de semana!
   → 👥 Grupo sobre L200
   → 👥 Família
   → 👤 Lourival Neto
3. 📅 qui 05/11 09:00 🔁 todo mês ⏸️ pausado — Lembrete: aluguel vence hoje.
   → 👤 Fulano
```

## Editar, pausar e retomar

O `-edit <nº>` troca o que vier depois dele, com a mesma leitura de um item novo: um "quando" muda a
hora, o `-repetir` (`-r`) muda a repetição (`-r nao` tira) e o resto vira o texto novo. O destino e
o modo (mensagem ou lembrete) não mudam: para isso, remova (`-rm`) e crie de novo.

```text
/cron -edit 2 18:30                       → só a hora
/cron -edit 2 Bom dia, pessoal!           → só o texto
/cron -edit 2 sexta 9h -r semanal Pauta   → hora, repetição e texto
/cron -edit 2 -r nao                      → deixa de repetir
```

O `-pause <nº...|all>` segura o item (ou vários: `-pause 1 3`): ele continua na lista (com ⏸️), mas
não sai. O `-resume <nº...|all>` solta. Um item repetido que venceu enquanto estava pausado pula
para o próximo horário; um item único que já passou sai na hora (a resposta avisa).

## Comandos no texto

Um `{/comando args}` no texto roda **na hora do envio**, e a resposta dele entra no lugar. Vale nos
dois modos, em qualquer ponto do texto e mais de uma vez:

```text
/cron 09:24 -to /ZapBot/ O preço do Bitcoin agora: {/crypto BTC}
/cron 8h -r diario -to /Família/ Bom dia! {/tempo Rio de Janeiro}
/cron seg 9h -r semanal Dólar: {/cotacao USD} · BTC: {/crypto BTC}
/lembrete sexta 18h -r semanal {/stats -7}
/cron 12h -to /Grupo L200/ {/meme}       (só mídia: sai a imagem, sem texto)
```

Vários comandos e vários destinos no mesmo item (um item só; na hora, ele sai em cada destino, com
os comandos rodando para cada chat):

```text
/cron 06:00 -r diario -to /Krishina Da Silva/ -to /Grupo da Faculdade/ ⏰ Status da DeFi! {/defi} Preço do BTC! {/crypto BTC} Preço do Dólar! {/cotacao USD}
/cron 07:30 -r diario -to /Família/ Bom dia! ☀️ {/tempo Recife} Cripto: {/crypto BTC ETH} Câmbio: {/cotacao USD EUR}
/cron seg 08:00 -r semanal -to /Trabalho/ -to @Fulano Da Silva Resumo da semana: {/news -hack 5} CVEs: {/cve 3}
/lembrete -pv 23:00 -r diario Fechamento do dia: {/crypto} {/defi}
```

Para quebrar a linha sem sair do campo de texto, digite `\n`: ele vira uma quebra de linha, e os
espaços em volta dele são removidos. Vale em qualquer texto do `/cron`, com ou sem comandos, ao
criar e no `-edit`:

```text
/cron 8h -r diario Verificando Orca {/defi orca}\n Verificando Prjx {/defi prjx}
/cron 07:30 -r diario -to /Família/ Bom dia! ☀️\n{/tempo Recife}\nCâmbio: {/cotacao USD}
/lembrete sexta 18h Fechar a semana:\n- relatório\n- backup\n- planilha
/cron -edit 2 Linha 1\nLinha 2
```

Cada resposta de várias linhas vira um parágrafo, e o texto em volta fica entre elas. O primeiro
exemplo chega assim, todo dia às 06:00, nos dois chats:

```text
⏰ Status da DeFi!

🌊 Orca · SOL/cbBTC · taxa 0.16%
📍 7xKp…3mQa · ✅ dentro da faixa

💰 Saldo: $2,476.30
   ...

Preço do BTC!

🚀 MERCADO CRIPTO
₿ BTC
    💰 $86,906.96  🟢 +3.81%
    ...

Preço do Dólar!

💱 COTAÇÕES (em reais)
🇺🇸 USD/BRL (Dólar)
   💰 R$ 5,2000  🟢 +0,50%
   ...
```

- O comando roda como se você o digitasse no chat de destino, com o resultado daquele momento: num
  item repetido, cada envio traz um valor novo.
- A resposta em texto entra no lugar do `{...}`. Uma de várias linhas (o `/crypto`, o `/tempo`...)
  vira um parágrafo, com uma linha em branco antes e depois, para não colar no texto em volta; uma
  de uma linha só fica na frase. Um comando que responde mais de uma vez (o `/defi`, uma por
  posição) tem as respostas separadas por uma linha em branco. Mídias (`/meme`, `/giphy`,
  `/pixelart`) saem logo depois da mensagem.
- Só os comandos de consulta rodam aí: `/cotacao`, `/crypto`, `/cve`, `/defi`, `/giphy`, `/joke`,
  `/kernel`, `/meme`, `/news`, `/pixelart`, `/stats`, `/tempo`, `/uptime` e `/version` (no
  `comandos.json`, os com `"cron": true`). As opções que mudam algo também não: o `-add`, o `-del` e
  o `-alerta` do `/crypto` e do `/cotacao`; o `-address`, o `-wallet`, o `-pool`, o `-nft`, o
  `-name`, o `-rm`, o `-alerta`, o `-taxas` e o `-to` do `/defi` (rodam os quatro protocolos, o
  `-l`, o `-mask` e o `aave -full`); e o `-flush` e o `-flush-all` do `/stats`.
- O comando é conferido ao criar (e no `-edit`): um que não existe ou que não roda no `/cron` dá
  erro na hora, não no envio.
- Se o comando falhar na hora do envio, a mensagem sai assim mesmo, com `⚠️ /crypto falhou` no
  lugar.
- Fora das chaves, nada roda: um texto que comece com `/` continua sendo só texto.

O `-test <nº>` monta o item agora e mostra aqui como ele sairia, sem enviar ao destino nem mudar o
horário:

```text
/cron -test 1
🧪 Teste do nº 1 (sai em sex 02/10 09:24 → 👥 ZapBot)

O preço do Bitcoin agora: (a resposta do /crypto BTC naquele momento)
```

## Quando

O "quando" vem no começo, junto com as opções (em qualquer ordem); o texto é o resto, como foi
digitado (com várias linhas, se for o caso). Tudo no horário de Brasília.

| Forma | Exemplo | Significa |
|---|---|---|
| Horário | `6h`, `07h`, `18:30`, `18h30`, `às 18h` | Hoje nesse horário; se já passou, amanhã |
| Duração | `+2h`, `em 2h`, `daqui a 2h`, `30m`, `1d`, `1h30m` | Daqui a tanto tempo. Horas sozinhas são horário (`6h` é 06:00): para "daqui a 6 horas", use `+6h` ou `em 6h` |
| Hoje / amanhã | `hoje 22h`, `amanhã`, `amanhã 10:00` | Sem hora: 9h |
| Dia da semana | `sexta`, `seg 8h`, `sábado 10:00` | O próximo (hoje, se a hora ainda não passou). Sem hora: 9h |
| Data | `25/12`, `25/12 10:00`, `25/12/2027 10h` | Sem ano: a próxima vez que a data chega. Sem hora: 9h |

Até 366 dias à frente. O `-repetir mensal` (ou `-r mensal`) mantém o dia do mês: um item do dia 31
vai no último dia dos meses mais curtos e volta ao 31 depois.

## Detalhes

- Tudo fica na tabela `schedules`, sobrevive a reinícios e é verificado a cada 30 s. Se o bot
  estiver fora do ar na hora, o item vai quando ele voltar (o lembrete avisa:
  `(atrasado: era para ...)`). Um repetido vai uma vez e segue para o próximo horário.
- Uma mensagem que comece com `/` é enviada, mas nunca roda como comando (só os `{/comando}` rodam;
  veja [Comandos no texto](#comandos-no-texto)).
- O `-to` é só do modo mensagem; o `-pv`, só do lembrete. Com vários `-to`, é um item só, que sai em
  todos os destinos (e conta 1 no limite); o mesmo destino repetido conta uma vez. Se o envio falhar
  num destino, os outros recebem assim mesmo. Os `-edit`, `-pause` e `-rm` valem para o item
  inteiro.
- O limite é de 50 itens, somando os dois tipos (setting `agenda.max`).
