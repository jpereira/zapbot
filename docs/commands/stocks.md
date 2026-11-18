# `/stocks` `/stock` `/rates`

Market quotes in one place: the **dollar, euro, pound and USDT against the real**, and **stocks, ETFs and
indexes** (MSTR, NVDA, PETR4.SA, the S&P 500...). It shows the enabled symbols (default: `USD`, `EUR`, `USDT` and
`MSTR`), or only the requested ones. `/rates` is the same command (the old name). For **crypto**, use
[`/crypto`](crypto.md) (BTC, ETH, **XAUT**, the gold token...).

| Option | Value | Description |
|---|---|---|
| *(none)* | `[SYMBOL...]` | The enabled ones, or only the given symbols (enabled or not), in the order requested: `USD`, `EUR`, `GBP`, `USDT` or a ticker from Yahoo Finance |
| `-list`, `-l` | | Lists everything it supports: the enabled symbols, the currencies (✅ the enabled ones) and the kinds of ticker, with examples |
| `-add`, `-a` | `<SYMBOL>` | Enables a currency (`USD`, `EUR`, `GBP`, `USDT`) or a ticker that exists on Yahoo Finance (bot owner or an [admin](bot.md#extra-admins) only) |
| `-del`, `-d` | `<SYMBOL>` | Disables a symbol (bot owner or an [admin](bot.md#extra-admins) only) |
| `-alert` | `[rule]` | Without a rule, lists the alerts; with a rule (e.g. `USD > 5.30` or `MSTR < 90`), creates one (bot owner or an [admin](bot.md#extra-admins) only). The symbol can also come first: `/stocks MSTR -alert < 90`. See [Price alerts](#price-alerts) |
| `-msg` | `<text>` | Together with `-alert`: the text goes at the start of the notice. Runs to the end of the command. See [Message in the notice](#message-in-the-notice) |
| `-rm` | `<no...\|all>` | Together with `-alert`: removes the alerts with those numbers (`-rm 2`, `-rm 1 2 3` or `-rm 1,2,3`), or all of them (`all`). If any number doesn't exist, none is removed |
| `-to` | `<destination>` | Together with `-alert`: notifies a contact (`/Jorge Pereira/`), a mention (`@Fulano Da Silva`), a group (`/L200 Group/`), a number (`+5521999999999`) or by email (`email`) instead of your private chat. Repeat for several: a single alert that notifies all of them. See [Notify another chat or by email](#notify-another-chat-or-by-email) |

```text
/stocks                       → the enabled ones (default: USD, EUR, USDT and MSTR)
/stocks usd                   → the dollar only
/stocks usd eur gbp           → dollar, euro and pound
/stocks MSTR NVDA             → two stocks at once
/stocks usd MSTR              → a currency and a stock in the same reply
/stocks PETR4.SA VALE3.SA     → B3 stocks (the ticker ends in .SA), in reais
/stocks ^GSPC ^BVSP           → the S&P 500 and the Ibovespa
/stocks IBIT                  → an ETF (BlackRock's bitcoin ETF)
/stocks -l                    → the enabled symbols, and the supported currencies
/stocks -a gbp                → starts showing the pound
/stocks -a NVDA               → enables NVDA (it has to exist on Yahoo Finance)
/stocks -d eur                → stops showing the euro
```

What `/stocks -l` brings (everything it supports, at a glance):

```text
📈 Enabled symbols

• 🇺🇸 USD — Dollar
• 🇪🇺 EUR — Euro
• 🪙 USDT — Tether
• 🏢 MSTR

💱 Currencies against the real (✅ enabled)
🇺🇸 USD — Dollar ✅
🇪🇺 EUR — Euro ✅
🇬🇧 GBP — Pound
🪙 USDT — Tether ✅

🏢 Stocks, ETFs and indexes (any Yahoo Finance ticker)
• US: MSTR, NVDA, AAPL, IBIT, SPY
• Brazil (B3, ends in .SA): PETR4.SA, VALE3.SA, BOVA11.SA
• Indexes (start with ^): ^GSPC, ^IXIC, ^BVSP
• Others: BRK-B, EURUSD=X

💡 /stocks -a <SYMBOL> enables, /stocks -d <SYMBOL> disables, /stocks <SYMBOL>... asks for a one-off quote.
Crypto is in /crypto -l.
```

Which command for what: `/stocks` is currencies against the real and everything that trades on a stock
exchange; [`/crypto`](crypto.md) is crypto from Binance (BTC, ETH, **XAUT**...).

## Currencies

The currencies are quoted **against the real**: current value, open and previous close, day high and low, and
change (🟢 up, 🔴 down). Supported: `USD`, `EUR`, `GBP` and `USDT`.

- **USD, EUR, GBP**: Yahoo Finance. If it fails, AwesomeAPI (which doesn't report the open: `—`
  shows up).
- **USDT**: Binance daily candles. The Binance "day" rolls over at 9 PM Brasília time (00:00 UTC),
  so the open is the one from that time.

```text
📈 MARKETS

🇪🇺 EUR/BRL (Euro)
   💰 R$ 5.8569  🔴 -0.67%
   🔔 Open: R$ 5.8811 (🔴 -0.41% since the open)
   🏁 Previous close: R$ 5.8962
   📈 High: R$ 5.9117  📉 Low: R$ 5.8531

🪙 USDT/BRL (Tether)
   💰 R$ 5.1816  🔴 -0.70%
   🔔 Open: R$ 5.2181 (🔴 -0.70% since the open)
   🏁 Previous close: R$ 5.2181
   📈 High: R$ 5.2259  📉 Low: R$ 5.1725

🕐 9/30/26, 4:57 PM · Yahoo Finance, Binance
💡 % next to the value: change since the previous close. Stock quotes can be delayed.
```

## Stocks, ETFs and indexes

Price in the **currency of the asset** (`$` for dollars, `R$` for the B3; in the Portuguese bot, the dollar comes
as `US$`), change since the previous close, open, high, low, volume and the 52-week range, from Yahoo Finance:

```text
/stocks MSTR
📈 MARKETS

🏢 MSTR (Strategy Inc · NasdaqGS)
   💰 $97.11  🔴 -5.75%
   🔔 Open: $101.20 (🔴 -4.04% since the open)
   🏁 Previous close: $103.03
   📈 High: $103.76  📉 Low: $96.85
   📊 Volume: 14.79M
   🗓️ 52 weeks: $81.81 – $213.83

🕐 11/17/26, 4:50 PM · Yahoo Finance
💡 % next to the value: change since the previous close. Stock quotes can be delayed.
```

The ticker is the one from [Yahoo Finance](https://finance.yahoo.com/): case doesn't matter, and it accepts
letters, digits, `.`, `-`, `^` and `=` (up to 15 characters).

| What | Ticker | Example |
|---|---|---|
| US stocks and ETFs | the symbol | `MSTR`, `NVDA`, `AAPL`, `IBIT`, `SPY` |
| Brazil (B3) | the symbol + `.SA`, in reais | `PETR4.SA`, `VALE3.SA`, `BOVA11.SA` |
| Share classes | with a hyphen | `BRK-B` |
| Indexes | with `^` | `^GSPC` (S&P 500), `^IXIC` (Nasdaq), `^BVSP` (Ibovespa) |
| Other currency pairs | the Yahoo pair | `EURUSD=X` |

A ticker that Yahoo doesn't know gets `❌ Ticker not found on Yahoo Finance: XXXX`; among others, it is only a
warning in its own line. `USD`, `EUR`, `GBP` and `USDT` are always the currencies against the real, not tickers.
The quotes can be delayed by a few minutes (Yahoo's public data), and outside the exchange hours they show the last
close.

## Price alerts

`/stocks` (or `/rates`) and `/crypto` notify you in your **private chat** (or, with
[`-to`](#notify-another-chat-or-by-email), in contacts, groups, numbers or by email) when a price
goes past a value, with a text of yours at the start, if you want ([`-msg`](#message-in-the-notice)).
Each alert fires once and is removed. Only the bot owner (and the
[extra admins](bot.md#extra-admins)) create, list and remove them.

```text
/stocks -alert USD > 5.30    → when the dollar goes above R$ 5.30
/stocks -alert eur < 5,50    → when the euro drops below R$ 5.50
/crypto -alert BTC < 90000    → when BTC drops below $90,000
/crypto BTC -alert > 120000   → the currency can also come before -alert
/stocks MSTR -alert < 90      → when MSTR drops below $90 (a stock, in the currency of the asset)
/stocks -alert               → lists the /stocks alerts, numbered
/stocks -alert -rm 2         → removes no. 2 from the list
/crypto -alert -rm 1 2 3      → removes nos. 1, 2 and 3 (also -rm 1,2,3)
/crypto -alert -rm all        → removes all the /crypto ones
```

- The rule is `<SYMBOL> > value` or `<SYMBOL> < value`. The value accepts `.` or `,` as the decimal
  separator, **without** a thousands separator (`90000`, not `90.000`).
- `/stocks` compares currencies (`USD`, `EUR`...) in reais and stocks in the currency of the asset (dollars;
  reais for the B3, tickers ending in `.SA`); `/crypto`, in dollars (`<TOKEN>USDT` pair).
- If the price is **already** on the requested side, the alert isn't created (it would fire right
  away): the bot shows the current value.
- Prices are checked every 5 minutes (setting `stocks.alert.intervalMin`, 1 to 60), once per currency. The
  limit is 20 alerts (setting `stocks.alert.max`, 1 to 100). `/crypto` has its own: `crypto.alert.intervalMin`
  and `crypto.alert.max`.
- With `-rm` and several numbers, if any doesn't exist, none is removed (the bot says which ones are
  missing). The numbers are the ones from the list before removing.
- Alerts are kept in the `price_alerts` table and survive restarts.

### Message in the notice

With `-msg <text>`, the text goes at the start of the notice, before the `🔔 PRICE ALERT`. It
runs to the end of the command, so it can have spaces and punctuation; `-to` can come before or
after it.

```text
/crypto BTC -alert > 90000 -to /Jorge Pereira/ -msg This message goes at the start!
/stocks USD -alert > 6 -msg Dollar through the roof! -to /Family/
```

```text
This message goes at the start!

🔔 PRICE ALERT

📈 ₿ BTC/USDT went above $90,000.00
💰 Now: $90,512.30 (🟢 +0.57% since creation)
📅 Alert created on 10/2/2026, 18:40:12
```

- The list (`-alert`) shows the text under the alert: `💬 This message goes...`.
- The text just can't have a loose ` -to ` in the middle: it's read as a destination.

### Notify another chat or by email

With `-to <destination>`, the notice goes to another chat (or by email) instead of your private
chat; repeat `-to` to notify several. On WhatsApp, it goes out from your account, like any bot
message. The destination is a contact, group, number or email. Exact names take priority, as in
[Destinations: contact, group, number or email](index.md#destinations-contact-group-number-or-email).

```text
/crypto -alert BTC < 90000 -to /L200 Group/      → in the group "L200 Group"
/stocks -alert USD > 5.30 -to /Jorge Pereira/   → in the contact's private chat
/stocks -alert USD > 5.30 -to +5521999999999    → in the number's private chat
/stocks -alert EUR < 5,50 -to @Fulano Da Silva  → in a group, mentioning the person
/crypto -alert SOL > 200 -to email               → by email (QRCODE_EMAIL_SMTP_TO)
/crypto -alert BTC < 90000 -to /L200 Group/ -to email  → in the group and by email
/stocks -alert -to familia EUR < 5,50           → -to can come before the rule
```

- With several `-to`, it's a single alert (counts as 1 in `stocks.alert.max`): it fires once and notifies
  all the destinations. If sending fails on one, the others still get it. The same destination
  repeated counts once.
- If the name matches more than one contact (or group), the bot lists them and you reply with the
  number; the alert is only created after the choice.
- The group has to be one your account is in; the number, a WhatsApp account (the bot checks).
- The list (`-alert`) shows each alert's destination: `→ 👥 L200 Group` or
  `→ 📧 you@example.com` (several: `→ 👥 L200 Group, 📧 you@example.com`).

```text
🔔 PRICE ALERT

📈 🇺🇸 USD/BRL went above R$ 5.3000
💰 Now: R$ 5.3100 (🟢 +2.12% since creation)
📅 Alert created on 9/30/2026, 10:12:03
```

## Shortcut for the quotes you check

For the quote you look at every day, an alias saves the typing: `/alias -q /mstr /stocks MSTR` and from then on `/mstr`
brings only the quote (`/dolar`, `/euro`, `/usdt`...). More in
[Shortcuts for quotes](alias.md#shortcuts-for-quotes).

```text
/alias -q /mstr /stocks MSTR
/alias -q /dolar /stocks USD
/mstr                          → MicroStrategy
/dolar                         → the dollar against the real
```

## The enabled list

The enabled symbols are in the `stocks.symbols` setting (default: `USD`, `EUR`, `USDT` and `MSTR`) and survive
restarts. You can also change it with [`/set`](set.md): `/set stocks.symbols USD EUR MSTR NVDA PETR4.SA`.
