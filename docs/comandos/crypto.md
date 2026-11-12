# `/crypto` (`/bitcoio`, `/creptomoeda`)

Current price and 24 h change for the enabled coins (via the Binance API, `<TOKEN>USDT` pair), or
only the requested ones. Default: BTC, ETH, SOL and HYPE.

| Option | Value | Description |
|---|---|---|
| *(none)* | `[TOKEN...]` | Quotes for the enabled coins, or only the given coins (enabled or not), in the order requested. An unsupported one: warns and lists the supported ones |
| `-list`, `-l` | | Lists the supported coins; the enabled ones are marked with `*` |
| `-add`, `-a` | `<TOKEN>` | Enables a supported coin (bot owner or an [admin](bot.md#extra-admins) only) |
| `-del`, `-d` | `<TOKEN>` | Disables a coin (bot owner or an [admin](bot.md#extra-admins) only) |
| `-alerta` | `[regra]` | Without a rule, lists the alerts; with a rule (e.g. `BTC < 90000`), creates one. The coin can also come first: `/crypto BTC -alerta < 90000`. See [Price alerts](rates.md#price-alerts) |
| `-msg` | `<texto>` | Together with `-alerta`: the text goes at the start of the notification. It runs to the end of the command. See [Message in the notification](rates.md#message-in-the-notice) |
| `-rm` | `<nº...\|all>` | Together with `-alerta`: removes the alerts with those numbers (`-rm 2`, `-rm 1 2 3` or `-rm 1,2,3`), or all of them (`all`). If any number doesn't exist, none is removed |
| `-to` | `<destino>` | Together with `-alerta`: notifies a contact (`/Jorge Pereira/`), a mention (`@Fulano Da Silva`), a group (`/Grupo L200/`), a number (`+5521999999999`) or by email (`email`) instead of your private chat. Repeat for several: a single alert that notifies all of them. See [Notify another chat or by email](rates.md#notify-another-chat-or-by-email) |

Supported: BTC, ETH, SOL, HYPE, BNB, XRP, DOGE, ADA, TRX, AVAX, LINK, DOT, LTC, TON, SUI, PEPE,
SHIB, XLM, NEAR and UNI (`CRYPTO_SUPPORTED` list in `src/moedas.js`).

The enabled coins are stored in the `settings` table, key `crypto.coins`, and survive restarts.

![Demonstração do /crypto](../assets/demo/07-crypto.gif)

```text
/crypto              → the enabled ones (default: BTC, ETH, SOL and HYPE)
/crypto BTC          → bitcoin only
/crypto btc eth      → bitcoin and ether (also "BTC,ETH")
/crypto doge         → a supported one, even if not enabled
/crypto FOO          → ❌ Moeda não suportada: FOO, with the list of supported ones
/creptomoeda
/crypto -l
/crypto -a doge
/crypto -d hype
/crypto -alerta ETH > 4000
/crypto -alerta BTC < 90000 -to /Grupo L200/
/crypto -alerta SOL > 200 -to /Jorge Pereira/
/crypto -alerta ETH < 3000 -to @Fulano Da Silva
/crypto -alerta HYPE > 50 -to +5521999999999
/crypto -alerta BTC > 120000 -to email
/crypto -alerta BTC < 90000 -to /Grupo L200/ -to /Jorge Pereira/
/crypto BTC -alerta > 90000 -to /Jorge Pereira/ -msg Hora de vender!
/crypto -alerta -rm 1 2 3
```
