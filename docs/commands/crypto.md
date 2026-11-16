# `/crypto`

Current price and 24 h change for the enabled coins (via the Binance API, `<TOKEN>USDT` pair), or
only the requested ones. Default: BTC, ETH, SOL and HYPE.

| Option | Value | Description |
|---|---|---|
| *(none)* | `[TOKEN...]` | Quotes for the enabled coins, or only the given coins (enabled or not), in the order requested. An unsupported one: warns and lists the supported ones |
| `-list`, `-l` | | Lists the supported coins; the enabled ones are marked with `*` |
| `-add`, `-a` | `<TOKEN>` | Enables a supported coin (bot owner or an [admin](bot.md#extra-admins) only) |
| `-del`, `-d` | `<TOKEN>` | Disables a coin (bot owner or an [admin](bot.md#extra-admins) only) |
| `-alert` | `[rule]` | Without a rule, lists the alerts; with a rule (e.g. `BTC < 90000`), creates one (bot owner or an [admin](bot.md#extra-admins) only). The coin can also come first: `/crypto BTC -alert < 90000`. See [Price alerts](rates.md#price-alerts) |
| `-msg` | `<text>` | Together with `-alert`: the text goes at the start of the notification. It runs to the end of the command. See [Message in the notice](rates.md#message-in-the-notice) |
| `-rm` | `<#...\|all>` | Together with `-alert`: removes the alerts with those numbers (`-rm 2`, `-rm 1 2 3` or `-rm 1,2,3`), or all of them (`all`). If any number doesn't exist, none is removed |
| `-to` | `<destination>` | Together with `-alert`: notifies a contact (`/Jorge Pereira/`), a mention (`@Fulano Da Silva`), a group (`/Grupo L200/`), a number (`+5521999999999`) or by email (`email`) instead of your private chat. Repeat for several: a single alert that notifies all of them. See [Notify another chat or by email](rates.md#notify-another-chat-or-by-email) |

Supported: BTC, ETH, SOL, HYPE, BNB, XRP, DOGE, ADA, TRX, AVAX, LINK, DOT, LTC, TON, SUI, PEPE,
SHIB, XLM, NEAR and UNI (`CRYPTO_SUPPORTED` list in `src/currencies.js`).

The enabled coins are stored in the `settings` table, key `crypto.coins`, and survive restarts.

![Demonstração do /crypto](../assets/demo/07-crypto.gif)

Example reply (`/crypto`): price, 24 h change, high, low and volume of each coin, in a monospaced block, and the
one that rose the most:

```text
🚀 CRYPTO MARKET
₿ BTC
    💰 $64,820.55  🟢 +1.04%
    📈 $65,870.10
    📉 $63,512.00
    📊 $1.52B

Ξ ETH
    💰 $1,812.40   🟢 +1.42%
    📈 $1,838.20
    📉 $1,765.95
    📊 $648.10M

◎ SOL
    💰 $71.95      🟢 +2.15%
    📈 $73.00
    📉 $69.10
    📊 $281.45M

Ⓗ HYPE
    💰 $66.20      🔴 -0.85%
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
/crypto FOO          → ❌ Unsupported coin: FOO, with the list of supported ones
/crypto
/crypto -l
/crypto -a doge
/crypto -d hype
/crypto -alert ETH > 4000
/crypto -alert BTC < 90000 -to /Grupo L200/
/crypto -alert SOL > 200 -to /Jorge Pereira/
/crypto -alert ETH < 3000 -to @Fulano Da Silva
/crypto -alert HYPE > 50 -to +5521999999999
/crypto -alert BTC > 120000 -to email
/crypto -alert BTC < 90000 -to /Grupo L200/ -to /Jorge Pereira/
/crypto BTC -alert > 90000 -to /Jorge Pereira/ -msg Hora de vender!
/crypto -alert -rm 1 2 3
```
