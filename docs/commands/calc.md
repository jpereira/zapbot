# `/calc` `/math` `/sum`

Does a calculation or **sums the numbers of a list**, from the text you typed or from the message you reply
to. It is for those messages that arrive like this:

```text
437 gym
351 running
```

Reply to it with `/calc` and you get the total, with a **tape** of everything it read as a number, so you can
check it. No API, no key, no cost.

| Option | Value | Description |
|---|---|---|
| `-all`, `-a` | | Sums all the numbers of each line, not only the first |
| `-col`, `-c` | `<n>` | Uses the number `n` of each line (`1` is the first, `-1` the last) |
| `-short`, `-s` | | Only the total (and the check), without the tape |
| `-group`, `-g` | | Subtotal by name: the lines with the same text (gym, running...) are added together |
| `<calculation>` | | A calculation, or the text of a list; the replied message is added to it |

```text
(replying to "437 gym / 351 running")  /calc
🧮 Total: 788

  437  Gym
+ 351  Running
─────
= 788
2 numbers · average 394

/calc 437 + 351 * 2
🧮 437 + 351 * 2 = 1,139

/calc 1.234,50 - 200
🧮 1.234,50 - 200 = 1,034.5

/calc (2+3)*4
/calc 100/2*6
/calc ((1+7)*8)/2
/calc 2^10
/calc -short (replying to the list)
/calc -group (replying to the list)
/calc -col -1 (replying to a list like "Day 3 - 437")
```

## The tape

Under the total comes everything that was read as a number, in a single format and aligned (a monospaced
block): the sign, the amount and the name of the line. It is the same list a calculator would print, and it
is where you see at a glance if something was read wrong. Up to 40 lines (the total always counts all of
them); with `-short` it is left out.

## The numbers

- **Comma or dot:** `1.234,56` and `1,234.56` are the same number. With a single separator and 3 digits
  after it (`1.234`), the language of the bot decides: in English the dot is the decimal (1.234), in
  Portuguese it is the thousands separator (1234). `1,5` and `1.5` are always 1.5.
- **Signs:** `-50`, `+30`, `R$ -20`, `-R$ 20` and `- R$ 20` count with their sign. A `+` or `-` at the
  **start of the line** is the sign of its number even when loose (`- 144,93 Verdana`). The exception is a
  list where every line starts with `-`: that is a list with bullets, not negatives. A dash after the text
  is only a separator: in `Day 1 - 437` the 437 is positive.
- **One per line:** a list takes the first number of each line (`437 gym` is 437, `gym: 437` too). If the
  first one isn't the value (`Day 3 - 437`), use `-col -1` for the last, or `-all` for all of them.
- **Ignored:** dates (`15/11`, `2026-11-15`), times (`12:30`, `9h30`), and numbers with 11 digits or more
  (phones, ids). Currency (`R$`, `US$`, `USD$`, `EUR$`, `$`, `€`, `£` and the codes `USD` and `EUR`), the invisible characters WhatsApp puts in lists and
  formatting (`*437*`) are fine.
- **Calculations:** `+ - * / % x × ÷ ^` (`%` is the remainder) and parentheses, with no `eval` (it is a small
  parser): `100/2*6` is 300 and `((1+7)*8)/2` is 32. A line made only of numbers and operators, like
  `437 - 351`, is a calculation; in a list, each such line gives its result and the tape shows the
  calculation as its name. A badly written one (`(1+2`) is an error, and a date alone on a line (`15/11`)
  is not a division.

## Money and the total of the text

When every number of the list has the same currency (`R$ 144,93`, `EUR 50`, `USD$ 10`, `$ 3`), the result comes with it and always with two
decimals. If the text has its **own total** (a line with the word `total` or `soma`), it is left out of the
sum and used as a check. With positives and negatives (a balance, a debt), the reply shows the balance, what
came in, what went out and the biggest expense:

```text
(replying to a debt list: "+ R$3.375,00 = 15 kits" / "- R$1.055,00 = Coat" / ... / "R$664,89 = Total Debt")  /calc
🧮 Balance: R$ 664,89
✅ Matches the total in the text

+ R$ 3.375,00  15 kits
- R$ 1.055,00  Coat
- R$   144,93  Verdana 17/Agos
- R$    55,02  Lunch 18/Agos
─────────────
= R$   664,89

➕ In: R$ 3.375,00 (1)
➖ Out: R$ 2.710,11 (8)
🔻 Biggest expense: Coat (R$ 1.055,00)
```

If the list and the text disagree, the reply says `⚠️ The text says R$ 600,00: a difference of R$ 64,89`.

Other currencies work the same way, before the number (`EUR`, `EUR$`, `USD`, `USD$`, `US$`, `$`, `€`). `EUR$ 10` and
`EUR 5` are the same currency; with different currencies in the same list, the result comes without a symbol:

```text
(replying to "EUR 120 hotel" / "EUR$ 35,50 dinner" / "- EUR 20 refund")  /calc
🧮 Balance: EUR 135,50

+ EUR 120,00  Hotel
+ EUR  35,50  Dinner
- EUR  20,00  Refund
────────────
= EUR 135,50

➕ In: EUR 155,50 (2)
➖ Out: EUR 20,00 (1)
```

## By name

`-group` adds the lines with the same name and puts the subtotals in the tape:

```text
(replying to "437 gym / 351 running / 200 gym / 80 running")  /calc -group
🧮 Total: 1,068

    637  Gym
+   431  Running
───────
= 1,068
4 numbers · average 267
```

## Examples

**Calculations**, typed after the command (no reply needed):

```text
/calc 100/2*6                  → 300
/calc ((1+7)*8)/2              → 32
/calc 2^10                     → 1,024
/calc 7%2                      → 1          (the remainder)
/calc 237.90/4                 → 59.475     (splitting a bill by 4)
/calc (1500 + 2300) * 0.9      → 3,420      (10% off)
/calc 1,234.50 - 200           → 1,034.5
/calc -5 * -3                  → 15
/calc 10 x 3 + 2               → 32
```

**A shopping list**, replying to the message (the decimals are the same on every line):

```text
(replying to "rice 22.90 / beans 8.50 / meat 54.30")  /calc
🧮 Total: 85.70

  22.90  Rice
+  8.50  Beans
+ 54.30  Meat
───────
= 85.70
3 numbers · average 28.57
```

**A balance**, with the signs at the start of the line (loose or not):

```text
(replying to "+ 1500 salary / - 320 rent / - 89.90 internet")  /calc
🧮 Balance: 1,090.10

+ 1,500.00  Salary
-   320.00  Rent
-    89.90  Internet
──────────
= 1,090.10

➕ In: 1,500.00 (1)
➖ Out: 409.90 (2)
🔻 Biggest expense: Rent (320.00)
```

**Dates, and which number counts** (`-col`, `-all`):

```text
(replying to "15/11 437 gym / 16/11 351 running")  /calc
🧮 Total: 788          → the dates are ignored: 437 + 351

(replying to "Day 1 - 437 / Day 2 - 351")  /calc -col -1
🧮 Total: 788          → the last number of each line

(replying to "trip 45 back 38 / lunch 52 tip 5")  /calc -all
🧮 Total: 140          → all the numbers of each line
```

**By name and short** (`-group`, `-short`):

```text
(replying to "$ 30 uber / $ 12 coffee / $ 18 uber / $ 9 coffee")  /calc -group
🧮 Total: $ 69.00

  $ 48.00  Uber
+ $ 21.00  Coffee
─────────
= $ 69.00
4 numbers · average $ 17.25

(replying to "437 gym / 351 running / 200 gym")  /calc -short
🧮 Total: 988
3 numbers · average 329.33
```

**When the text says its own total** and it doesn't match:

```text
(replying to "10 a / 20 b / Total: 35")  /calc
🧮 Total: 30
⚠️ The text says 35: a difference of 5

  10  A
+ 20  B
────
= 30
2 numbers · average 15
```
