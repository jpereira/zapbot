# `/rates` (`/cotacao`, `/cambio`)

Exchange rate against the real for the enabled currencies (setting `cotacao.coins`, default: EUR and
USDT), or only the requested ones: current value, open and previous close, day high and low, and
change (🟢 up, 🔴 down). Supported: `USD`, `EUR`, `GBP` and `USDT`.

| Option | Value | Description |
|---|---|---|
| *(none)* | `[CURRENCY...]` | Rate for the enabled currencies, or only the given ones (enabled or not). An unsupported one: warns and lists the supported ones |
| `-list`, `-l` | | Lists the supported ones; the enabled ones come with ✅ |
| `-add`, `-a` | `<CURRENCY>` | Enables a supported currency (bot owner or an [admin](bot.md#extra-admins) only) |
| `-del`, `-d` | `<CURRENCY>` | Disables a currency (bot owner or an [admin](bot.md#extra-admins) only) |
| `-alerta` | `[regra]` | Without a rule, lists the alerts; with a rule (e.g., `USD > 5.30`), creates one (bot owner or an [admin](bot.md#extra-admins) only). The currency can also come first: `/rates USD -alerta > 5.30`. See [Price alerts](#price-alerts) |
| `-msg` | `<text>` | Together with `-alerta`: the text goes at the start of the notice. Runs to the end of the command. See [Message in the notice](#message-in-the-notice) |
| `-rm` | `<nº...\|all>` | Together with `-alerta`: removes the alerts with those numbers (`-rm 2`, `-rm 1 2 3` or `-rm 1,2,3`), or all of them (`all`). If any number doesn't exist, none is removed |
| `-to` | `<destination>` | Together with `-alerta`: notifies a contact (`/Jorge Pereira/`), a mention (`@Fulano Da Silva`), a group (`/Grupo L200/`), a number (`+5521999999999`) or by email (`email`) instead of your private chat. Repeat for several: a single alert that notifies all of them. See [Notify another chat or by email](#notify-another-chat-or-by-email) |

- **USD, EUR, GBP**: Yahoo Finance. If it fails, AwesomeAPI (which doesn't report the open: `—`
  shows up).
- **USDT**: Binance daily candles. The Binance "day" rolls over at 9 PM Brasília time (00:00 UTC),
  so the open is the one from that time.

```text
/rates             → the enabled ones (default: EUR and USDT)
/rates usd         → the dollar only
/cambio usd eur gbp  → dollar, euro and pound
/rates -l          → supported ones, with ✅ on the enabled ones
/rates -a usd      → starts showing the dollar
/rates -d eur      → stops showing the euro
```

```text
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

## Price alerts

`/rates` and `/crypto` notify you in your **private chat** (or, with
[`-to`](#notify-another-chat-or-by-email), in contacts, groups, numbers or by email) when a price
goes past a value, with a text of yours at the start, if you want ([`-msg`](#message-in-the-notice)).
Each alert fires once and is removed. Only the bot owner (and the
[extra admins](bot.md#extra-admins)) create, list and remove them.

```text
/rates -alerta USD > 5.30    → when the dollar goes above R$ 5.30
/rates -alerta eur < 5,50    → when the euro drops below R$ 5.50
/crypto -alerta BTC < 90000    → when BTC drops below $90,000
/crypto BTC -alerta > 120000   → the currency can also come before -alerta
/rates -alerta               → lists the /rates alerts, numbered
/rates -alerta -rm 2         → removes no. 2 from the list
/crypto -alerta -rm 1 2 3      → removes nos. 1, 2 and 3 (also -rm 1,2,3)
/crypto -alerta -rm all        → removes all the /crypto ones
```

- The rule is `<CURRENCY> > value` or `<CURRENCY> < value`. The value accepts `.` or `,` as the decimal
  separator, **without** a thousands separator (`90000`, not `90.000`).
- `/rates` compares in reais; `/crypto`, in dollars (`<TOKEN>USDT` pair).
- If the price is **already** on the requested side, the alert isn't created (it would fire right
  away): the bot shows the current value.
- Prices are checked every 5 minutes (setting `alerta.intervalMin`, 1 to 60), once per currency. The
  limit is 20 alerts in total (setting `alerta.max`, 1 to 100), `/rates` and `/crypto` together.
- With `-rm` and several numbers, if any doesn't exist, none is removed (the bot says which ones are
  missing). The numbers are the ones from the list before removing.
- Alerts are kept in the `price_alerts` table and survive restarts.

### Message in the notice

With `-msg <text>`, the text goes at the start of the notice, before the `🔔 ALERTA DE PREÇO`. It
runs to the end of the command, so it can have spaces and punctuation; `-to` can come before or
after it.

```text
/crypto BTC -alerta > 90000 -to /Jorge Pereira/ -msg Isso é uma mensagem que vai no início!
/rates USD -alerta > 6 -msg Dólar nas alturas! -to /Família/
```

```text
Isso é uma mensagem que vai no início!

🔔 ALERTA DE PREÇO

📈 ₿ BTC/USDT ficou acima de $90,000.00
💰 Agora: $90,512.30 (🟢 +0,57% desde a criação)
📅 Alerta criado em 02/10/2026, 18:40:12
```

- The list (`-alerta`) shows the text under the alert: `💬 Isso é uma mensagem...`.
- The text just can't have a loose ` -to ` in the middle: it's read as a destination.

### Notify another chat or by email

With `-to <destination>`, the notice goes to another chat (or by email) instead of your private
chat; repeat `-to` to notify several. On WhatsApp, it goes out from your account, like any bot
message. The destination is a contact, group, number or email. Exact names take priority, as in
[Destinations: contact, group, number or email](index.md#destinations-contact-group-number-or-email).

```text
/crypto -alerta BTC < 90000 -to /Grupo L200/      → in the group "Grupo sobre L200"
/rates -alerta USD > 5.30 -to /Jorge Pereira/   → in the contact's private chat
/rates -alerta USD > 5.30 -to +5521999999999    → in the number's private chat
/rates -alerta EUR < 5,50 -to @Fulano Da Silva  → in a group, mentioning the person
/crypto -alerta SOL > 200 -to email               → by email (QRCODE_EMAIL_SMTP_TO)
/crypto -alerta BTC < 90000 -to /Grupo L200/ -to email  → in the group and by email
/rates -alerta -to familia EUR < 5,50           → -to can come before the rule
```

- With several `-to`, it's a single alert (counts as 1 in `alerta.max`): it fires once and notifies
  all the destinations. If sending fails on one, the others still get it. The same destination
  repeated counts once.
- If the name matches more than one contact (or group), the bot lists them and you reply with the
  number; the alert is only created after the choice.
- The group has to be one your account is in; the number, a WhatsApp account (the bot checks).
- The list (`-alerta`) shows each alert's destination: `→ 👥 Grupo sobre L200` or
  `→ 📧 voce@exemplo.com` (several: `→ 👥 Grupo sobre L200, 📧 voce@exemplo.com`).

```text
🔔 ALERTA DE PREÇO

📈 🇺🇸 USD/BRL ficou acima de R$ 5,3000
💰 Agora: R$ 5,3100 (🟢 +2,12% desde a criação)
📅 Alerta criado em 30/09/2026, 10:12:03
```
