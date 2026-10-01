# `/cotacao` (`/cambio`)

Cotação contra o real das moedas habilitadas (setting `cotacao.coins`, padrão:
EUR e USDT), ou só das pedidas: valor atual, abertura e fechamento anterior,
máxima e mínima do dia e variação (🟢 alta, 🔴 queda). Suportadas: `USD`,
`EUR`, `GBP` e `USDT`.

| Opção | Valor | Descrição |
|---|---|---|
| *(nenhuma)* | `[MOEDA...]` | Cotação das habilitadas, ou só das moedas informadas |
| `-list`, `-l` | | Lista as suportadas; as habilitadas vêm com ✅ |
| `-add`, `-a` | `<MOEDA>` | Habilita uma moeda suportada (só o dono do bot) |
| `-del`, `-d` | `<MOEDA>` | Desabilita uma moeda (só o dono do bot) |
| `-alerta` | `[regra]` | Sem regra, lista os alertas; com regra, cria um. Veja [Alertas de preço](#alertas-de-preço) |
| `-rm` | `<nº\|all>` | Junto com `-alerta`: remove o alerta nº N (ou todos) |

- **USD, EUR, GBP**: Yahoo Finance. Se ele falhar, a AwesomeAPI (que não
  informa a abertura: aparece `—`).
- **USDT**: candles diários da Binance. O "dia" da Binance vira às 21h de
  Brasília (00h UTC), então a abertura é a desse horário.

```
/cotacao             → as habilitadas (padrão: EUR e USDT)
/cotacao usd         → só o dólar
/cambio usd eur gbp  → dólar, euro e libra
/cotacao -l          → suportadas, com ✅ nas habilitadas
/cotacao -a usd      → passa a mostrar o dólar
/cotacao -d eur      → deixa de mostrar o euro
```

```
💱 COTAÇÕES (em reais)

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
💡 % ao lado do valor: variação desde o fechamento anterior.
```

## Alertas de preço

O `/cotacao` e o `/crypto` avisam no **seu privado** quando um preço passa de
um valor. Cada alerta dispara uma vez e é removido. Só o dono do bot cria,
lista e remove.

```
/cotacao -alerta USD > 5.30    → quando o dólar passar de R$ 5,30
/cotacao -alerta eur < 5,50    → quando o euro ficar abaixo de R$ 5,50
/crypto -alerta BTC < 90000    → quando o BTC ficar abaixo de $90.000
/cotacao -alerta               → lista os alertas do /cotacao, numerados
/cotacao -alerta -rm 2         → remove o nº 2 da lista
/crypto -alerta -rm all        → remove todos os do /crypto
```

- A regra é `<MOEDA> > valor` ou `<MOEDA> < valor`. O valor aceita `.` ou `,`
  como decimal, **sem** separador de milhar (`90000`, não `90.000`).
- O `/cotacao` compara em reais; o `/crypto`, em dólares (par `<TOKEN>USDT`).
- Se o preço **já** está do lado pedido, o alerta não é criado (dispararia na
  hora): o bot mostra o valor atual.
- Os preços são consultados a cada 5 minutos (setting `alerta.intervalMin`),
  uma vez por moeda. O limite é de 20 alertas no total (setting `alerta.max`).
- Os alertas ficam na tabela `price_alerts` e sobrevivem a reinícios.

```
🔔 ALERTA DE PREÇO

📈 🇺🇸 USD/BRL ficou acima de R$ 5,3000
💰 Agora: R$ 5,3100 (🟢 +2,12% desde a criação)
📅 Alerta criado em 30/09/2026, 10:12:03
```
