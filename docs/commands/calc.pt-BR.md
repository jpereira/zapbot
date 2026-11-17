# `/calc` `/math` `/sum`

Faz uma conta ou **soma os números de uma lista**, do texto que você digitou ou da mensagem que você
responde. Serve para aquelas mensagens que chegam assim:

```text
437 maromba
351 corrida
```

Responda com `/calc` e saia com o total, junto de uma **fita** com tudo o que foi lido como número, para você
conferir. Sem API, sem chave, sem custo.

| Opção | Valor | Descrição |
|---|---|---|
| `-all`, `-a` | | Soma todos os números de cada linha, não só o primeiro |
| `-col`, `-c` | `<n>` | Usa o número `n` de cada linha (`1` é o primeiro, `-1` o último) |
| `-short`, `-s` | | Só o total (e a conferência), sem a fita |
| `-group`, `-g` | | Subtotal por nome: as linhas com o mesmo texto (maromba, corrida...) são somadas |
| `<conta>` | | Uma conta, ou o texto de uma lista; a mensagem respondida é somada a ele |

```text
(respondendo "437 maromba / 351 corrida")  /calc
🧮 Total: 788

  437  Maromba
+ 351  Corrida
─────
= 788
2 números · média 394

/calc 437 + 351 * 2
🧮 437 + 351 * 2 = 1.139

/calc 1.234,50 - 200
🧮 1.234,50 - 200 = 1.034,5

/calc (2+3)*4
/calc 100/2*6
/calc ((1+7)*8)/2
/calc 2^10
/calc -short (respondendo a lista)
/calc -group (respondendo a lista)
/calc -col -1 (respondendo uma lista como "Dia 3 - 437")
```

## A fita

Embaixo do total vem tudo o que foi lido como número, num formato só e alinhado (um bloco monoespaçado): o
sinal, o valor e o nome da linha. É a mesma lista que uma calculadora imprimiria, e é onde você vê de relance
se algo foi lido errado. Até 40 linhas (o total sempre conta todas); com o `-short` ela não aparece.

## Os números

- **Vírgula ou ponto:** `1.234,56` e `1,234.56` são o mesmo número. Com um separador só e 3 dígitos
  depois dele (`1.234`), o idioma do bot decide: em português o ponto é milhar (1234), em inglês é
  decimal (1.234). `1,5` e `1.5` são sempre 1,5.
- **Sinais:** `-50`, `+30`, `R$ -20`, `-R$ 20` e `- R$ 20` valem com o sinal. Um `+` ou `-` no **começo da
  linha** é o sinal do número dela, mesmo solto (`- 144,93 Verdana`). A exceção é a lista em que toda linha
  começa com `-`: aí são marcadores, não negativos. Um traço depois do texto é só separador: em
  `Dia 1 - 437` o 437 é positivo.
- **Um por linha:** a lista pega o primeiro número de cada linha (`437 maromba` é 437, `maromba: 437`
  também). Se o primeiro não é o valor (`Dia 3 - 437`), use `-col -1` para o último, ou `-all` para todos.
- **Ignorados:** datas (`15/11`, `2026-11-15`), horas (`12:30`, `9h30`) e números com 11 dígitos ou mais
  (telefones, ids). Moeda (`R$`, `US$`, `USD$`, `EUR$`, `$`, `€`, `£` e os códigos `USD` e `EUR`), os caracteres invisíveis que o WhatsApp põe nas listas e a
  formatação (`*437*`) não atrapalham.
- **Contas:** `+ - * / % x × ÷ ^` (`%` é o resto) e parênteses, sem `eval` (é um parser pequeno): `100/2*6`
  dá 300 e `((1+7)*8)/2` dá 32. Uma linha só com números e operadores, como `437 - 351`, é uma conta;
  numa lista, cada linha assim dá o seu resultado e a fita mostra a conta como nome. Uma mal escrita
  (`(1+2`) dá erro, e uma data sozinha na linha (`15/11`) não é uma divisão.

## Dinheiro e o total do texto

Quando todos os números da lista têm a mesma moeda (`R$ 144,93`, `EUR 50`, `USD$ 10`, `$ 3`), o resultado sai com ela e sempre com duas casas.
Se o texto traz o **próprio total** (uma linha com a palavra `total` ou `soma`), ele fica de fora da soma e
serve de conferência. Com positivos e negativos (um saldo, uma dívida), a resposta mostra o saldo, o que
entrou, o que saiu e o maior gasto:

```text
(respondendo uma lista de dívida: "+ R$3.375,00 = 15 kits" / "- R$1.055,00 = Casaco" / ... / "R$664,89 = Total Divida")  /calc
🧮 Saldo: R$ 664,89
✅ Confere com o total do texto

+ R$ 3.375,00  15 kits
- R$ 1.055,00  Casaco
- R$   144,93  Verdana 17/Agos
- R$    55,02  Almoço PF 18/Agos
─────────────
= R$   664,89

➕ Entradas: R$ 3.375,00 (1)
➖ Saídas: R$ 2.710,11 (8)
🔻 Maior saída: Casaco (R$ 1.055,00)
```

Se a lista e o texto discordam, a resposta diz `⚠️ O texto diz R$ 600,00: diferença de R$ 64,89`.

## Por nome

O `-group` soma as linhas com o mesmo nome e põe os subtotais na fita:

```text
(respondendo "437 maromba / 351 corrida / 200 maromba / 80 corrida")  /calc -group
🧮 Total: 1.068

    637  Maromba
+   431  Corrida
───────
= 1.068
4 números · média 267
```

## Exemplos

**Contas**, digitadas depois do comando (não precisa responder nada):

```text
/calc 100/2*6                  → 300
/calc ((1+7)*8)/2              → 32
/calc 2^10                     → 1.024
/calc 7%2                      → 1          (o resto)
/calc 237,90/4                 → 59,475     (rachar a conta por 4)
/calc (1500 + 2300) * 0,9      → 3.420      (10% de desconto)
/calc 1.234,50 - 200           → 1.034,5
/calc -5 * -3                  → 15
/calc 10 x 3 + 2               → 32
```

**Uma lista de mercado**, respondendo a mensagem (as casas decimais são as mesmas em toda linha):

```text
(respondendo "arroz 22,90 / feijão 8,50 / carne 54,30")  /calc
🧮 Total: 85,70

  22,90  Arroz
+  8,50  Feijão
+ 54,30  Carne
───────
= 85,70
3 números · média 28,57
```

**Um saldo**, com os sinais no começo da linha (soltos ou não):

```text
(respondendo "+ 1500 salário / - 320 aluguel / - 89,90 internet")  /calc
🧮 Saldo: 1.090,10

+ 1.500,00  Salário
-   320,00  Aluguel
-    89,90  Internet
──────────
= 1.090,10

➕ Entradas: 1.500,00 (1)
➖ Saídas: 409,90 (2)
🔻 Maior saída: Aluguel (320,00)
```

**Datas, e qual número vale** (`-col`, `-all`):

```text
(respondendo "15/11 437 maromba / 16/11 351 corrida")  /calc
🧮 Total: 788          → as datas são ignoradas: 437 + 351

(respondendo "Dia 1 - 437 / Dia 2 - 351")  /calc -col -1
🧮 Total: 788          → o último número de cada linha

(respondendo "ida 45 volta 38 / almoço 52 gorjeta 5")  /calc -all
🧮 Total: 140          → todos os números de cada linha
```

**Por nome e curto** (`-group`, `-short`):

```text
(respondendo "R$ 30 uber / R$ 12 café / R$ 18 uber / R$ 9 café")  /calc -group
🧮 Total: R$ 69,00

  R$ 48,00  Uber
+ R$ 21,00  Café
──────────
= R$ 69,00
4 números · média R$ 17,25

(respondendo "437 maromba / 351 corrida / 200 maromba")  /calc -short
🧮 Total: 988
3 números · média 329,33
```

**Quando o texto traz o próprio total** e ele não bate:

```text
(respondendo "10 a / 20 b / Total: 35")  /calc
🧮 Total: 30
⚠️ O texto diz 35: diferença de 5

  10  A
+ 20  B
────
= 30
2 números · média 15
```
