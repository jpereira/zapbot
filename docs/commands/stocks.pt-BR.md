# `/stocks` `/stock` `/rates`

Cotações de mercado num lugar só: **dólar, euro, libra e USDT contra o real**, e **ações, ETFs e índices** (MSTR,
NVDA, PETR4.SA, o S&P 500...). Mostra os símbolos habilitados (padrão: `USD`, `EUR`, `USDT` e `MSTR`), ou só os
pedidos. O `/rates` é o mesmo comando (o nome antigo). Para **cripto**, use o [`/crypto`](crypto.md) (BTC, ETH,
**XAUT**, o token do ouro...).

| Opção | Valor | Descrição |
|---|---|---|
| *(nada)* | `[SÍMBOLO...]` | Os habilitados, ou só os símbolos pedidos (habilitados ou não), na ordem pedida: `USD`, `EUR`, `GBP`, `USDT` ou um ticker do Yahoo Finance |
| `-list`, `-l` | | Lista tudo o que ele suporta: os símbolos habilitados, as moedas (✅ as habilitadas) e os tipos de ticker, com exemplos |
| `-add`, `-a` | `<SÍMBOLO>` | Habilita uma moeda (`USD`, `EUR`, `GBP`, `USDT`) ou um ticker que exista no Yahoo Finance (só o dono do bot ou um [admin](bot.md#admins-extras)) |
| `-del`, `-d` | `<SÍMBOLO>` | Desabilita um símbolo (só o dono do bot ou um [admin](bot.md#admins-extras)) |
| `-alert` | `[regra]` | Sem regra, lista os alertas; com regra (ex.: `USD > 5.30` ou `MSTR < 90`), cria um (só o dono do bot ou um [admin](bot.md#admins-extras)). O símbolo também pode vir antes: `/stocks MSTR -alert < 90`. Veja [Alertas de preço](#alertas-de-preço) |
| `-msg` | `<texto>` | Junto do `-alert`: o texto vai no começo do aviso. Vai até o fim do comando. Veja [Mensagem no aviso](#mensagem-no-aviso) |
| `-rm` | `<nº...\|all>` | Junto do `-alert`: remove os alertas com esses números (`-rm 2`, `-rm 1 2 3` ou `-rm 1,2,3`), ou todos (`all`). Se algum número não existir, nenhum é removido |
| `-to` | `<destino>` | Junto do `-alert`: avisa um contato (`/Jorge Pereira/`), uma menção (`@Fulano Da Silva`), um grupo (`/Grupo L200/`), um número (`+5521999999999`) ou por e-mail (`email`) em vez do seu privado. Repita para vários: um alerta só que avisa todos. Veja [Avisar em outro chat ou por e-mail](#avisar-em-outro-chat-ou-por-e-mail) |

```text
/stocks                       → os habilitados (padrão: USD, EUR, USDT e MSTR)
/stocks usd                   → só o dólar
/stocks usd eur gbp           → dólar, euro e libra
/stocks MSTR NVDA             → duas ações de uma vez
/stocks usd MSTR              → uma moeda e uma ação na mesma resposta
/stocks PETR4.SA VALE3.SA     → ações da B3 (o ticker termina em .SA), em reais
/stocks ^GSPC ^BVSP           → o S&P 500 e o Ibovespa
/stocks IBIT                  → um ETF (o de bitcoin da BlackRock)
/stocks -l                    → os símbolos habilitados e as moedas suportadas
/stocks -a gbp                → passa a mostrar a libra
/stocks -a NVDA               → habilita a NVDA (ela precisa existir no Yahoo Finance)
/stocks -d eur                → deixa de mostrar o euro
```

O que o `/stocks -l` traz (tudo o que ele suporta, de uma vez):

```text
📈 Símbolos habilitados

• 🇺🇸 USD — Dólar
• 🇪🇺 EUR — Euro
• 🪙 USDT — Tether
• 🏢 MSTR

💱 Moedas contra o real (✅ habilitada)
🇺🇸 USD — Dólar ✅
🇪🇺 EUR — Euro ✅
🇬🇧 GBP — Libra
🪙 USDT — Tether ✅

🏢 Ações, ETFs e índices (qualquer ticker do Yahoo Finance)
• EUA: MSTR, NVDA, AAPL, IBIT, SPY
• Brasil (B3, termina em .SA): PETR4.SA, VALE3.SA, BOVA11.SA
• Índices (começam com ^): ^GSPC, ^IXIC, ^BVSP
• Outros: BRK-B, EURUSD=X

💡 /stocks -a <SÍMBOLO> habilita, /stocks -d <SÍMBOLO> desabilita, /stocks <SÍMBOLO>... pede uma cotação avulsa.
Cripto está em /crypto -l.
```

Qual comando para quê: o `/stocks` é câmbio contra o real e tudo o que negocia em bolsa; o [`/crypto`](crypto.md) é
cripto da Binance (BTC, ETH, **XAUT**...).

## Moedas

As moedas são cotadas **contra o real**: valor atual, abertura e fechamento anterior, máxima e mínima do dia e
variação (🟢 alta, 🔴 queda). Suportadas: `USD`, `EUR`, `GBP` e `USDT`.

- **USD, EUR, GBP**: Yahoo Finance. Se falhar, AwesomeAPI (que não informa a abertura: aparece `—`).
- **USDT**: candles diários da Binance. O "dia" da Binance vira às 21h de Brasília (00:00 UTC), então a
  abertura é a desse horário.

```text
📈 MERCADOS

🇪🇺 EUR/BRL (Euro)
   💰 R$ 5,8569  🔴 -0,67%
   🔔 Abertura: R$ 5,8811 (🔴 -0,41% desde a abertura)
   🏁 Fechamento anterior: R$ 5,8962
   📈 Máx: R$ 5,9117  📉 Mín: R$ 5,8531

🪙 USDT/BRL (Tether)
   💰 R$ 5,1816  🔴 -0,70%
   🔔 Abertura: R$ 5,2181 (🔴 -0,70% desde a abertura)
   🏁 Fechamento anterior: R$ 5,2181
   📈 Máx: R$ 5,2259  📉 Mín: R$ 5,1725

🕐 30/09/2026, 16:57 · Yahoo Finance, Binance
💡 % ao lado do valor: variação desde o fechamento anterior. As cotações de ações podem ter atraso.
```

## Ações, ETFs e índices

Preço na **moeda do ativo** (`US$` para dólar, `R$` para a B3), variação desde o fechamento anterior, abertura,
máxima, mínima, volume e a faixa de 52 semanas, do Yahoo Finance:

```text
/stocks MSTR
📈 MERCADOS

🏢 MSTR (Strategy Inc · NasdaqGS)
   💰 US$ 97,11  🔴 -5,75%
   🔔 Abertura: US$ 101,20 (🔴 -4,04% desde a abertura)
   🏁 Fechamento anterior: US$ 103,03
   📈 Máx: US$ 103,76  📉 Mín: US$ 96,85
   📊 Volume: 14,79 mi
   🗓️ 52 semanas: US$ 81,81 – US$ 213,83

🕐 17/11/2026, 16:50 · Yahoo Finance
💡 % ao lado do valor: variação desde o fechamento anterior. As cotações de ações podem ter atraso.
```

O ticker é o do [Yahoo Finance](https://finance.yahoo.com/): maiúscula ou minúscula tanto faz, e aceita letras,
números, `.`, `-`, `^` e `=` (até 15 caracteres).

| O quê | Ticker | Exemplo |
|---|---|---|
| Ações e ETFs dos EUA | o símbolo | `MSTR`, `NVDA`, `AAPL`, `IBIT`, `SPY` |
| Brasil (B3) | o símbolo + `.SA`, em reais | `PETR4.SA`, `VALE3.SA`, `BOVA11.SA` |
| Classes de ação | com hífen | `BRK-B` |
| Índices | com `^` | `^GSPC` (S&P 500), `^IXIC` (Nasdaq), `^BVSP` (Ibovespa) |
| Outros pares de moeda | o par do Yahoo | `EURUSD=X` |

Um ticker que o Yahoo não conhece recebe `❌ Ticker não encontrado no Yahoo Finance: XXXX`; no meio de outros, é só
um aviso na própria linha. `USD`, `EUR`, `GBP` e `USDT` são sempre as moedas contra o real, não tickers. As
cotações podem ter atraso de alguns minutos (dados públicos do Yahoo), e fora do horário da bolsa mostram o último
fechamento.

## Alertas de preço

O `/stocks` (ou `/rates`) e o `/crypto` avisam no **seu privado** (ou, com
[`-to`](#avisar-em-outro-chat-ou-por-e-mail), em contatos, grupos, números ou por e-mail) quando um
preço passa de um valor, com um texto seu no início, se quiser ([`-msg`](#mensagem-no-aviso)). Cada
alerta dispara uma vez e é removido. Só o dono do bot (e os [admins extras](bot.md#admins-extras))
cria, lista e remove.

```text
/stocks -alert USD > 5.30    → quando o dólar passar de R$ 5,30
/stocks -alert eur < 5,50    → quando o euro ficar abaixo de R$ 5,50
/crypto -alert BTC < 90000    → quando o BTC ficar abaixo de $90.000
/crypto BTC -alert > 120000   → a moeda também pode vir antes do -alert
/stocks MSTR -alert < 90      → quando a MSTR ficar abaixo de US$ 90 (uma ação, na moeda do ativo)
/stocks -alert               → lista os alertas do /stocks, numerados
/stocks -alert -rm 2         → remove o nº 2 da lista
/crypto -alert -rm 1 2 3      → remove os nº 1, 2 e 3 (também -rm 1,2,3)
/crypto -alert -rm all        → remove todos os do /crypto
```

- A regra é `<SÍMBOLO> > valor` ou `<SÍMBOLO> < valor`. O valor aceita `.` ou `,` como decimal, **sem**
  separador de milhar (`90000`, não `90.000`).
- O `/stocks` compara as moedas (`USD`, `EUR`...) em reais e as ações na moeda do ativo (dólar; reais na B3,
  tickers terminados em `.SA`); o `/crypto`, em dólares (par `<TOKEN>USDT`).
- Se o preço **já** está do lado pedido, o alerta não é criado (dispararia na hora): o bot mostra o
  valor atual.
- Os preços são consultados a cada 5 minutos (setting `stocks.alert.intervalMin`, de 1 a 60), uma vez por
  moeda. O limite é de 20 alertas (setting `stocks.alert.max`, de 1 a 100). O `/crypto` tem os seus:
  `crypto.alert.intervalMin` e `crypto.alert.max`.
- No `-rm` com vários nºs, se algum não existir, nenhum é removido (o bot diz quais faltam). Os nºs
  são os da lista de antes de remover.
- Os alertas ficam na tabela `price_alerts` e sobrevivem a reinícios.

### Mensagem no aviso

Com `-msg <texto>`, o texto vai no início do aviso, antes do `🔔 ALERTA DE PREÇO`. Ele vai até o fim
do comando, então pode ter espaços e pontuação; o `-to` pode vir antes ou depois dele.

```text
/crypto BTC -alert > 90000 -to /Jorge Pereira/ -msg Isso é uma mensagem que vai no início!
/stocks USD -alert > 6 -msg Dólar nas alturas! -to /Família/
```

```text
Isso é uma mensagem que vai no início!

🔔 ALERTA DE PREÇO

📈 ₿ BTC/USDT ficou acima de $90,000.00
💰 Agora: $90,512.30 (🟢 +0,57% desde a criação)
📅 Alerta criado em 02/10/2026, 18:40:12
```

- A lista (`-alert`) mostra o texto embaixo do alerta: `💬 Isso é uma mensagem...`.
- O texto só não pode ter um ` -to ` solto no meio: ele é lido como destino.

### Avisar em outro chat ou por e-mail

Com `-to <destino>`, o aviso vai para outro chat (ou por e-mail) em vez do seu privado; repita o
`-to` para avisar em vários. No WhatsApp, ele sai da sua conta, como qualquer mensagem do bot. O
destino é um contato, grupo, número ou e-mail. Nomes exatos têm prioridade, como em
[Destinos: contato, grupo, número ou e-mail](index.md#destinos-contato-grupo-número-ou-e-mail).

```text
/crypto -alert BTC < 90000 -to /Grupo L200/      → no grupo "Grupo sobre L200"
/stocks -alert USD > 5.30 -to /Jorge Pereira/   → no privado do contato
/stocks -alert USD > 5.30 -to +5521999999999    → no privado do número
/stocks -alert EUR < 5,50 -to @Fulano Da Silva  → num grupo, mencionando a pessoa
/crypto -alert SOL > 200 -to email               → por e-mail (QRCODE_EMAIL_SMTP_TO)
/crypto -alert BTC < 90000 -to /Grupo L200/ -to email  → no grupo e por e-mail
/stocks -alert -to familia EUR < 5,50           → o -to pode vir antes da regra
```

- Com vários `-to`, é um alerta só (conta 1 no `stocks.alert.max`): ele dispara uma vez e avisa em todos
  os destinos. Se o envio falhar num, os outros recebem assim mesmo. O mesmo destino repetido conta
  uma vez.
- Se o nome servir para mais de um contato (ou grupo), o bot lista e você responde com o nº; o
  alerta só é criado depois da escolha.
- O grupo precisa ser um em que a sua conta está; o número, uma conta do WhatsApp (o bot confere).
- A lista (`-alert`) mostra o destino de cada alerta: `→ 👥 Grupo sobre L200` ou
  `→ 📧 voce@exemplo.com` (vários: `→ 👥 Grupo sobre L200, 📧 voce@exemplo.com`).

```text
🔔 ALERTA DE PREÇO

📈 🇺🇸 USD/BRL ficou acima de R$ 5,3000
💰 Agora: R$ 5,3100 (🟢 +2,12% desde a criação)
📅 Alerta criado em 30/09/2026, 10:12:03
```

## Atalho para as cotações que você confere

Para a cotação que você olha todo dia, um alias poupa a digitação: `/alias -q /mstr /stocks MSTR` e daí em diante o `/mstr`
traz só a cotação (`/dolar`, `/euro`, `/usdt`...). Mais em
[Atalhos para cotações](alias.md#atalhos-para-cotações).

```text
/alias -q /mstr /stocks MSTR
/alias -q /dolar /stocks USD
/mstr                          → a MicroStrategy
/dolar                         → o dólar contra o real
```

## A lista habilitada

Os símbolos habilitados ficam no setting `stocks.symbols` (padrão: `USD`, `EUR`, `USDT` e `MSTR`) e sobrevivem a
reinícios. Dá para mudar também pelo [`/set`](set.md): `/set stocks.symbols USD EUR MSTR NVDA PETR4.SA`.
