# `/crypto`

Current price and 24 h change for the enabled coins (via the Binance API, `<TOKEN>USDT` pair), or
only the requested ones. Default: BTC, ETH, SOL and HYPE.

| Option | Value | Description |
| `-tts` | | Speaks the reply as a voice note, with the default voice of [`/tts`](tts.md) (same as `/tts -q {/crypto -q ...}`). Settings `tts.*` apply |
|---|---|---|
| *(none)* | `[TOKEN...]` | Quotes for the enabled coins, or only the given coins (enabled or not), in the order requested. An unsupported one: warns and lists the supported ones |
| `-list`, `-l` | | Lists the supported coins; the enabled ones are marked with `*` |
| `-quiet`, `-q` | | Only the prices, one line per coin, with no header, no details and no footer. Handy for a text (`{/crypto -q}`) or for the [`/tts`](tts.md#commands-in-the-text) |
| `-add`, `-a` | `<TOKEN>` | Enables a supported coin (bot owner or an [admin](bot.md#extra-admins) only) |
| `-del`, `-d` | `<TOKEN>` | Disables a coin (bot owner or an [admin](bot.md#extra-admins) only) |
| `-alert` | `[rule]` | Without a rule, lists the alerts; with a rule (e.g. `BTC < 90000`), creates one (bot owner or an [admin](bot.md#extra-admins) only). The coin can also come first: `/crypto BTC -alert < 90000`. See [Price alerts](stocks.md#price-alerts) |
| `-msg`, `-m` | `<text>` | Together with `-alert`: the text goes at the start of the notification. It runs to the end of the command. See [Message in the notice](stocks.md#message-in-the-notice) |
| `-rm` | `<#...\|all>` | Together with `-alert`: removes the alerts with those numbers (`-rm 2`, `-rm 1 2 3` or `-rm 1,2,3`), or all of them (`all`). If any number doesn't exist, none is removed |
| `-to` | `<destination>` | Together with `-alert`: notifies a contact (`/Jorge Pereira/`), a mention (`@Fulano Da Silva`), a group (`/L200 Group/`), a number (`+5521999999999`) or by email (`email`) instead of your private chat. Repeat for several: a single alert that notifies all of them. See [Notify another chat or by email](stocks.md#notify-another-chat-or-by-email) |

Supported: BTC, ETH, SOL, HYPE, BNB, XRP, DOGE, ADA, TRX, AVAX, LINK, DOT, LTC, TON, SUI, PEPE,
SHIB, XLM, NEAR, UNI and **XAUT** (Tether Gold: a token that follows the price of gold; `CRYPTO_SUPPORTED` list in
`src/currencies.js`). For **stocks** (MSTR, NVDA...) use [`/stocks`](stocks.md).

The enabled coins are stored in the `settings` table, key `crypto.coins`, and survive restarts.

![Demo of /crypto](../assets/demo/07-crypto.gif)

Only the prices (`-q`):

```text
/crypto -q
BTC $90,123.45
ETH $3,100.20
SOL $145.10
```

## Shortcut for the coins you check

For the coin you look at every day, an alias saves the typing: `/alias -q /btc /crypto BTC` and from then on `/btc`
brings only the quote (`/eth`, `/sol`, `/xaut` for gold...). More in
[Shortcuts for quotes](alias.md#shortcuts-for-quotes).

```text
/alias -q /btc /crypto BTC
/alias -q /xaut /crypto XAUT
/btc                           → bitcoin, in dollars and in reais
/xaut                          → gold
```

## In reais

Besides the dollar, each coin comes with its price **in reais** (the 🇧🇷 line). For the coins that Binance trades
directly against the real (BTC, ETH, SOL, BNB, XRP, DOGE, ADA, AVAX, LINK, LTC, SUI, PEPE, SHIB and NEAR) it
is the `<TOKEN>BRL` pair; for the others (HYPE, TRX, DOT, TON, XLM, UNI and XAUT) it is the dollar price times the
`USDTBRL`. The bot checks on Binance (every 6 hours) which pairs are actually trading: a paused pair, like
`DOTBRL`, keeps returning a frozen price, so it comes out through the dollar too. If the reais can't be fetched, the dollar still comes alone. To turn it off: `/set crypto.brl off`.

```text
/crypto BTC          → bitcoin in dollars and in reais
/crypto BTC ETH XAUT → bitcoin, ether and gold, each in dollars and in reais
/set crypto.brl off  → back to dollars only
```

Example reply (`/crypto`): price in dollars, 24 h change, **price in reais** (🇧🇷), high, low and volume of each coin, in a
monospaced block, and the one that rose the most:

```text
🚀 CRYPTO MARKET
₿ BTC
    💰 $64,820.55  🟢 +1.04%
    🇧🇷 R$ 374,675.80
    📈 $65,870.10
    📉 $63,512.00
    📊 $1.52B

Ξ ETH
    💰 $1,812.40   🟢 +1.42%
    🇧🇷 R$ 10,475.90
    📈 $1,838.20
    📉 $1,765.95
    📊 $648.10M

◎ SOL
    💰 $71.95      🟢 +2.15%
    🇧🇷 R$ 415.87
    📈 $73.00
    📉 $69.10
    📊 $281.45M

Ⓗ HYPE
    💰 $66.20      🔴 -0.85%
    🇧🇷 R$ 382.64
    📈 $68.90
    📉 $64.30
    📊 $35.02M

🔥 Top: ◎ SOL
🟡 Binance
⚡ Live Market Data
```

```text
/crypto              → the enabled ones (default: BTC, ETH, SOL and HYPE)
/crypto BTC          → bitcoin only
/crypto btc eth      → bitcoin and ether (also "BTC,ETH")
/crypto doge         → a supported one, even if not enabled
/crypto XAUT         → gold (Tether Gold, in dollars per troy ounce)
/crypto -a XAUT      → enables it in the plain /crypto
/crypto -alert XAUT > 4000   → warns when gold passes $4,000
/crypto FOO          → ❌ Unsupported coin: FOO, with the list of supported ones
/crypto
/crypto -l
/crypto -a doge
/crypto -d hype
/crypto -alert ETH > 4000
/crypto -alert BTC < 90000 -to /L200 Group/
/crypto -alert SOL > 200 -to /Jorge Pereira/
/crypto -alert ETH < 3000 -to @Fulano Da Silva
/crypto -alert HYPE > 50 -to +5521999999999
/crypto -alert BTC > 120000 -to email
/crypto -alert BTC < 90000 -to /L200 Group/ -to /Jorge Pereira/
/crypto BTC -alert > 90000 -to /Jorge Pereira/ -msg Hora de vender!
/crypto -alert -rm 1 2 3
```
