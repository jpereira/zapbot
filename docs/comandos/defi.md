# `/defi` · admin

Tracks DeFi positions from five protocols:

- [Orca](https://www.orca.so/) (Whirlpools, on Solana): you register each position.
- [Project X](https://www.prjx.com/portfolio) (on HyperEVM, Hyperliquid's chain): you register the
  wallet, and the bot reads its open positions ([Project X](#project-x)).
- [Liquidswap](https://liquidswap.com/) (Pontem's DEX, on Aptos): you register the wallet, and the
  bot reads its liquidity positions ([Liquidswap](#liquidswap)).
- [Morpho](https://morpho.org/) (lending, on Base and other networks): you register the wallet, and
  the bot reads its collateral, debt and risk ([Morpho](#morpho)).
- [Aave V3](https://aave.com/) (lending, on Ethereum and Base): you register the wallet, and the bot
  reads what was supplied, what was borrowed and the Health Factor from Aave's contracts
  ([Aave V3](#aave-v3)).

Orca registers the **position** (`-address`); Project X, Liquidswap, Morpho and Aave register the
**wallet** (`-wallet`). All of them accept an optional name (`-name`). `/defi` reads everything on
the spot and shows the equivalent of "Position Details" for each position; with `orca`, `prjx`,
`liquidswap` (or `liqswp`), `morpho` or `aave`, only the ones from that protocol. In your private
chat, addresses and wallets show in full; elsewhere, abbreviated (`0x92…0444`). With `-alerta`, the
bot warns when a position leaves the range, when it comes back and, with `-taxas`, when the fees to
collect go over a value ([Out-of-range alert](#out-of-range-alert)).

For all protocols:

```text
/defi                          → the Position Details of all
/defi -help                    → the help for all (/defi orca -help: just Orca's)
/defi -mask                    → the same, with the wallet numbers hidden ($**,***.**)
/defi -l                       → the list of registrations
/defi -rm 2                    → removes no. 2
/defi -rm 1 3                  → removes 1 and 3 (or -rm 1,3; -rm all removes all)
/defi -taxas                   → the summary of fees to collect, with the total
/defi -taxas -alerta           → the same, with each registration's alert
/defi -alerta <n|all> [-to <destination>]... [-taxas <value>]
```

For Orca:

```text
/defi orca                     → just the Orca positions
/defi orca -address <address> -pool <address> -nft <mint>
/defi orca -address <address> -alerta 2000   → registers and turns on the alert (in your private chat)
/defi orca -address <address> -n "Position X"   → with a name
```

For Project X:

```text
/defi prjx                     → just the Project X ones
/defi prjx -wallet <0x...>     → registers the wallet
/defi prjx -wallet <0x...> -n Hare Wallet   → with a name (again, with another: changes the name)
/defi prjx -wallet <0x...> -alerta    → registers and turns on the alert (in your private chat)
```

For Liquidswap (`liquidswap` or `liqswp`):

```text
/defi liquidswap               → just the Liquidswap ones (same as /defi liqswp)
/defi liquidswap -wallet <0x...>   → registers the Aptos wallet
/defi liqswp -wallet <0x...> -n Aptos Wallet   → with a name
```

For Morpho:

```text
/defi morpho                   → the registered wallets (with none: MORPHO_WALLET_ADDRESS's)
/defi morpho -wallet <0x...>   → registers the wallet
/defi morpho -wallet <0x...> -n Loan Wallet   → with a name
```

For Aave:

```text
/defi aave                     → the registered wallets (with none: AAVE_WALLET_ADDRESS's)
/defi aave -full               → the details (risk, APY, collateral, eMode, isolation mode)
/defi aave -wallet <0x...> -n WalletX   → registers the wallet (and shows the position)
```

| Option | Value | Description |
|---|---|---|
| *(protocol)* | `orca`, `prjx`, `liquidswap` (or `liqswp`), `morpho` or `aave` | Alone, shows the Position Details for that protocol only; with `-address` (`orca`) or `-wallet` (`prjx`, `liquidswap`, `morpho` and `aave`), registers; with `-help`, shows help for that protocol only. Without a protocol, `/defi` shows everything registered |
| `-list`, `-l` | | Lists the registrations, with 🔔 on the ones that have an alert (and the fee threshold: `🔔 ≥ $2,000.00`). In your private chat, with full addresses; elsewhere, abbreviated (`Hz15…RaPZ`) |
| `-rm` | `<#...\|all>` | Removes registration no. N, several (`-rm 1 3` or `-rm 1,3`) or all of them; if any number doesn't exist, none is removed. Together with `-alerta`: only turns off the alert for no. N (or for all) |
| `-alerta`, `-a` | `[#\|all\|value]` | Without a number: lists the alerts. With a number (or `all`): warns when the position leaves the range and when it comes back. Orca and Project X only (Liquidswap, Morpho and Aave have no range). On registration (with `-address` or `-wallet`), turns on the alert for the new position, in your private chat (or at `-to`); the value is the fee threshold, same as `-taxas` (`-alerta 2000`). See [Out-of-range alert](#out-of-range-alert) |
| `-taxas` | `[value\|off]` | Alone: the summary of fees to collect (see [Fee summary](#fee-summary)). Together with `-alerta <#\|all>`: also warns when the fees to collect go over the value, in dollars (e.g., `-taxas 50`). Warns once, and again after you collect; `off` removes it |
| `-to` | `<destination>` | Together with `-alerta`: where the warning goes. A contact (`/Jorge Pereira/`), a mention (`@Fulano Da Silva`), a group (`/Grupo L200/`), a number (`+5521999999999`) or email (`email` is `QRCODE_EMAIL_SMTP_TO`) ([Destinations](index.md#destinations-contact-group-number-or-email)). Repeat it for several: the warning goes to all of them. Without it, your private chat |
| `-address` | `<address>` | With `orca`: registers the Orca position by its address |
| `-pool` | `<address>` | With `orca -address`: the pool. Optional; if given, the bot checks that it matches |
| `-nft` | `<mint>` | With `orca -address`: the position's NFT. Optional; if given, the bot checks that it matches |
| `-wallet`, `-w` | `<0x...>` | With `prjx`, `morpho` or `aave`: registers the wallet (`0x` and 40 hexadecimal characters); with `liquidswap`, the Aptos wallet (`0x` and up to 64). The bot reads all of its open positions |
| `-mask`, `-m` | | Hides the wallet numbers with `*`, keeping the format (`$**,***.**`): balances, amounts, values and yield. Fees to collect stay visible. Position (-address) and wallet (-wallet) addresses are hidden too, even in private chat. Price, range, pool, Health Factor, LTV and APY stay. Works with any protocol (`/defi -m`, `/defi aave -mask`) |
| `-name`, `-n` | `<name>` | With `-address` or `-wallet`: a name for the position or wallet (optional, up to 40 characters), shown next to the address (`Orca · Position X (Hz15…RaPZ)`, `Project X · Hare Wallet (0x92…0444)`). With spaces, quoted or not. On one that's already registered, changes the name |
| `-full`, `-f` | | With `aave`: the position details: LTV, liquidation threshold, available borrows, each asset's APY, what is collateral, eMode and isolation mode. See [Aave V3](#aave-v3) |

```text
/defi orca -address Hz15TavvC8p9S7EihCbWa694kWFJGXFzs7AVpvWKRaPZ -pool CeaZcxBNLpJWtxzt58qQmfMBtJY8pQLvursXTJYGQpbN -nft C1MEDy3xt3gxiDtFkHt7HBWxxUVSarKZgt22FUzsKoji
/defi prjx -wallet 0x926024824BAEAf3ee0b7A2EEFA5A216743230444
/defi liquidswap -wallet 0x8f3c4d2a1b9e7f6a5c4b3a29180f7e6d5c4b3a2918f7e6d5c4b3a2918f7e6d5c
/defi morpho -wallet 0x74459EA7df673CFd90afbe39F635AcE08Ccb97C4
/defi -alerta 1        → warns in your private chat when no. 1 leaves the range (and comes back)
/defi -a 1 -taxas 50   → and when no. 1's fees to collect go over $50
```

The list shows 🔔 for the ones with an alert and, with `-taxas` (or `-alerta <valor>` on
registration), the fee threshold:

```text
/defi -l
🌊 DeFi positions (2)

1. Orca · Hz15…RaPZ · pool CeaZ…QpbN (since 10/2/2026) 🔔 ≥ $2,000.00
2. Project X · carteira 0x92…0444 (since 10/2/2026) 🔔

💡 /defi shows the details; /defi -rm <num> removes; 🔔 = with alert (/defi -alerta), ≥ $ is the fees limit.
```

In your private chat, addresses show in full.

To get the Position Details every day, in a chat or together with other commands, use
[`/cron`](cron.md#commands-in-the-text) (it accepts the five protocols, `-l`, `-taxas`, `-mask` and
`aave -full`; the registration and alert options are rejected):

```text
/cron 06:00 -r diario -to /Grupo da Faculdade/ ⏰ DeFi status! {/defi} BTC price! {/crypto BTC}
```

```text
/defi orca
🌊 Orca · SOL/cbBTC · fee 0.16%
📍 7xKp…3mQa · ✅ in range

💰 Balance: $2,476.30
   • 12.4521 SOL ($1,470.55)
   • 0.012 cbBTC ($1,005.75)

📏 Range: 0.00140324 – 0.0014605 cbBTC per SOL
🎯 Current price: 0.00140381 cbBTC per SOL
   ▕●──────────▏ 1% of the range
   (1 cbBTC = 712.349 SOL)

💸 Fees to collect: $18.42
   • 0.0812 SOL ($9.59)
   • 0.0001054 cbBTC ($8.83)
📊 Earns ~$6.71/day (estimate: 0.0648% of the active liquidity × the LPs' 24h fees)

🏊 Pool: TVL $9.62M · 24h volume $7.44M · 24h fees $11.9K
```

## Project X

[Project X](https://www.prjx.com/portfolio) is a HyperEVM DEX (Hyperliquid's EVM network), a Uniswap
V3 fork: each position is an NFT from the positions contract, held in the wallet of whoever opened
it. That's why what you register is the **wallet**, and `/defi prjx` shows each open position in it,
from newest to oldest:

```text
/defi prjx -wallet 0x926024824BAEAf3ee0b7A2EEFA5A216743230444
✅ Project X wallet registered: 0x92…0444
📍 2 open positions.
💡 See it with /defi prjx

/defi prjx
🌊 Project X · UBTC/USD₮0 · fee 0.05%
📍 #558492 · ✅ in range

💰 Balance: $10.09
   • 0.00005428 UBTC ($4.67)
   • 5.4195 USD₮0 ($5.42)

📏 Range: 83,686.6 – 88,241.4 USD₮0 per UBTC
🎯 Current price: 86,104.4 USD₮0 per UBTC
   ▕─────●─────▏ 53% of the range

💸 Fees to collect: <$0.01
   • 0 UBTC ($0.00)
   • 0.004384 USD₮0 (<$0.01)
```

- Closed positions (no liquidity) are left out: the NFT is still in the wallet, but there's nothing
  to show. The bot reads the 100 newest NFTs and shows up to 20 open positions.
- **Fees to collect**: the bot simulates the contract's `collect`, as if the wallet called it; it's
  the exact amount the "Collect" button would collect.
- **Dollar**: comes from the stable side of the pair (USD₮0, USDC, USDe, USDH...). On a pair with no
  stablecoin, only the amounts show.
- Registering a wallet with no open position is allowed (the bot warns you): `/defi prjx` shows the
  positions once there are any.

## Liquidswap

[Liquidswap](https://liquidswap.com/) is Pontem's DEX on Aptos. The pools are classic AMM: `x·y = k`
on the uncorrelated ones and `x³y + xy³ = k` on the stable ones, in versions v0 and v0.5. The
position is the pool's LP coin, held in the wallet of whoever provided the liquidity. That's why what
you register is the Aptos **wallet**, and `/defi liquidswap` (or `/defi liqswp`) shows each pool
where it has LP, from largest to smallest in dollars:

```text
/defi liquidswap -wallet 0x8f3c4d2a1b9e7f6a5c4b3a29180f7e6d5c4b3a2918f7e6d5c4b3a2918f7e6d5c
✅ Liquidswap wallet registered: 0x8f…6d5c
📍 2 open positions.
💡 See it with /defi liquidswap

/defi liqswp
🌊 Liquidswap · USDC/APT · fee 0.3% · v0 uncorrelated
📍 0.5% of the pool

💰 Balance: $439.83
   • 219.9144 USDC ($219.91)
   • 294.4688 APT ($219.91)

🎯 Current price: 1.33902 APT per USDC
   (1 APT = 0.746817 USDC)

🏊 Pool: TVL $87.97K · 43,982.87 USDC + 58,893.75 APT
💸 Swap fees go into the pool: they are already in the balance.
```

- **Pool share**: your LP divided by the total issued. The balance of each token is that share of the
  pool's reserves.
- **Price**: on uncorrelated pools, the ratio between the reserves; on stable ones, the price of the
  `x³y + xy³` curve at the current point.
- **Dollar**: comes from the stable side of the pair (USDC, USDT...). On a pair with no stablecoin,
  only the amounts show.
- **No range and no fees to collect**: in a classic AMM, the liquidity covers all prices and the swap
  fees go into the reserves. They're already in the balance, which is why Liquidswap has no
  `-alerta`.
- The wallet address accepts Aptos's short form (`0x1` is `0x000…001`) and is stored in full. The bot
  shows up to 20 pools per wallet.
- Registering a wallet with no LP is allowed (the bot warns you): `/defi liquidswap` shows the
  positions once there are any.

## Morpho

`/defi morpho` shows the wallet's positions on [Morpho](https://morpho.org/): the collateral, the
debt, what was supplied (in a market or a vault) and the risk of each market. The data comes from
Morpho's official API (GraphQL at `https://api.morpho.org/graphql`, setting `defi.morpho.api`), in a
single query for all the networks in the `defi.morpho.chains` setting (default: `8453`, Base; to
include Ethereum, `/set defi.morpho.chains 8453 1`). The query is read-only: the bot neither asks for
nor uses a private key.

Register the wallet with `/defi morpho -wallet <0x...>` (the bot checks the API before saving): it
shows up in `/defi`, `-l` and `-rm`, along with the others. `-alerta` doesn't apply to Morpho, which
has no range. With no registered wallet, `/defi morpho` queries the one in `MORPHO_WALLET_ADDRESS` in
`config/.env` (or the one in the `defi.morpho.wallet` setting, which applies when the variable is
empty). The response is kept in memory for 30 seconds: repeating the command in that interval doesn't
query the API again.

```text
🦋 MORPHO · cbBTC/USDC · Base

💰 Net position
$11,236.16

❤️ Health Rate
2.73

━━━━━━━━━━━━━━━━━━

📥 SUPPLIED / COLLATERAL

₿ cbBTC
Amount: 0.19324183 cbBTC
Value: $16,407.88

━━━━━━━━━━━━━━━━━━

📤 BORROWED

💵 USDC
Amount: 5,171.79 USDC
Value: $5,171.72

━━━━━━━━━━━━━━━━━━

📊 RISK

Current LTV: 31.52%
LLTV: 86.00%
cbBTC price (oracle): 84,909.56 USDC
Liquidation price: 31,120.13 USDC
Market utilization: 90.04%

━━━━━━━━━━━━━━━━━━

👛 Wallet: 0x74…97C4
🌐 Network: Base
🕐 Updated: 3:15:42 AM
```

With more than one position (several markets, vaults or networks), the net total comes first, then
the total supplied (collateral + supplied) and the total borrowed, and then each position, with its
own Health Rate: one market's doesn't apply to another.

The calculations follow [Morpho's documentation](https://docs.morpho.org/learn/concepts/liquidation/),
using the market's raw values (in BigInt, without rounding along the way):

- **Collateral value** (in loan token) = collateral × oracle price / 10³⁶.
- **Health Rate** = collateral value × LLTV / borrowed. Below 1, the position can be liquidated;
  with no debt, `∞`.
- **Current LTV** = borrowed / collateral value. Liquidation happens when it goes over the market's
  **LLTV**.
- **Liquidation price**: the oracle price at which the Health Rate reaches 1 (borrowed × 10³⁶ /
  (collateral × LLTV)), in loan token per collateral token, like the oracle.

The dollar values are the ones from Morpho's API. A token with no price there is left without a
dollar value and out of the totals (the message says which); nothing is estimated.

## Aave V3

`/defi aave` shows the wallet's position on [Aave V3](https://aave.com/): what was supplied, what was
borrowed, the Health Factor and the net position, on each network in the `defi.aave.chains` setting
(default: `1 8453`, Ethereum and Base). Everything is read on-chain, from Aave's official contracts
([documentation](https://aave.com/docs/aave-v3/smart-contracts)), through each network's RPC:
`ETHEREUM_RPC_URL` and `BASE_RPC_URL` in `config/.env` or, when empty, the `defi.ethereum.rpc` and
`defi.base.rpc` settings (the defaults are public and limit queries). Read-only: the bot neither asks
for nor uses a private key.

The wallet comes from the registration (`/defi aave -wallet <0x...>`, which already shows the
position) or, with none, from `AAVE_WALLET_ADDRESS` (or the `defi.aave.wallet` setting). Each
network's response is kept in memory for 30 seconds.

```text
🟣 AAVE V3 · Ethereum

💰 Net position
$364,079.92

❤️ Health Factor
1.68

━━━━━━━━━━━━━━━━━━

📥 SUPPLIED

Ξ WETH
233.728594 WETH
$629,619.06

₿ cbBTC
1.00006503 cbBTC
$85,043.86

━━━━━━━━━━━━━━━━━━

📤 BORROWED

💵 USDC
350,593.69 USDC
$350,583.00

━━━━━━━━━━━━━━━━━━

👛 Wallet: 0x12…abcd
🌐 Network: Ethereum
🕐 Updated: 3:15:42 AM
```

With `-full`, you also get the risk (current and max LTV, liquidation threshold, available borrows
and the collateral considered), the APY and the `Collateral: Yes/No` of each asset, the debt mode
(`Variable` or `Stable`), the eMode and the isolation mode. With positions on more than one network,
the net total comes first and then each network, with its own Health Factor: one network's doesn't
apply to the other. A network that doesn't respond shows up with a warning, and the others come as
usual.

Where each number comes from:

- **Health Factor, collateral, debt, available borrows, liquidation threshold and max LTV**: from
  `Pool.getUserAccountData`, the protocol's own value (the same as in the Aave app). It already
  accounts for each asset's liquidation threshold, the eMode, the isolation mode and what was
  supplied without being collateral. With no debt, the Health Factor is `∞`.
- **Each asset**: the balance comes from the `PoolDataProvider` (the aToken and the variable and
  stable debts), and the price from the `AaveOracle` (the oracle the protocol uses). The dollar value
  is the amount × the price.
- **Net position**: everything supplied (collateral or not) − the debt.
- **Current LTV**: the debt / the collateral.
- **APY**: the rate from the `PoolDataProvider`, compounded per second, as in Aave's documentation.
- **Liquidation price**: only with `-full` and only with a single collateral that isn't also the
  debt: the current price / the Health Factor. With several collaterals, it depends on what the
  others do, and the bot warns instead of calculating.

## Fee summary

`-taxas` alone puts together, in a single message, the fees to collect from all liquidity positions:
the range, the price and the fees of each Orca and Project X position, and the dollar total at the
end (with each protocol's). Liquidswap is included, but in an AMM the fees are already in the
balance: there's nothing to collect. A protocol that isn't registered shows as `➖ not registered`.
With the protocol, only that one (`/defi prjx -taxas`); Morpho and Aave have no fees to collect.

With `-alerta` (no value), it also shows each registration's alert: where it warns, the fee threshold
and how far it is from reaching it. On Project X, the threshold applies to the whole wallet (the sum
of the positions), as in the alert check.

```text
/defi -taxas                   → the summary of all
/defi prjx -taxas              → just Project X's
/defi -taxas -alerta           → with each registration's alert
/cron 8h -r diario {/defi -taxas}   → the summary every day at 8h
```

```text
💸 Fees to collect summary · 10/7/2026 at 20:55

🌊 Orca · SOL/cbBTC · 📍 Hz15…RaPZ
📏 Range: 0.00140324 – 0.0014605 cbBTC per SOL
🎯 Current price: 0.00140382 cbBTC per SOL
   ▕●──────────▏ 1% of the range
   (1 cbBTC = 712.344 SOL)
💸 Fees to collect: $1,426.35
   • 6.2494 SOL ($738.04)
   • 0.008212 cbBTC ($688.31)
🔕 No alert (turn on with /defi -alerta 1)

🌊 Project X · UBTC/USD₮0 · 📍 #7
📏 Range: 81,213.4 – 91,567.3 USD₮0 per UBTC
🎯 Current price: 86,000 USD₮0 per UBTC
   ▕─────●─────▏ 46% of the range
   (1 USD₮0 = 0.0000116279 UBTC)
💸 Fees to collect: $98.50
   • 0.001 UBTC ($86.00)
   • 12.5 USD₮0 ($12.50)
🔔 Alert: range and fees ≥ $200.00 → your private chat
   $101.50 to go (49% of the limit)

🌊 Liquidswap · ➖ not registered

━━━━━━━━━━━━━━━━━━
💰 Total to collect: $1,524.85
   • Orca: $1,426.35
   • Project X: $98.50
```

A position with no dollar price (on a pair with no stablecoin) or that couldn't be read is left out of
the total, with a warning at the end.

## Out-of-range alert

Out of range, the position sits entirely in a single token and stops earning fees. With `-alerta`,
the bot reads the position (on Project X, the wallet's positions) every 10 minutes (setting
`defi.alerta.intervalMin`, from 1 to 1440 minutes) and warns:

- **🚨 when it leaves the range**: once per exit. While it stays out, it doesn't repeat.
- **✅ when it comes back into the range**: also once.
- **💸 when the fees to collect go over the `-taxas` value** (in dollars, optional): once. After you
  collect and they drop below the value, the warning re-arms. On a pair with no stablecoin (Project
  X only), with no dollar price, it doesn't warn.

```text
/defi -alerta 1                  → in your private chat
/defi -a all -to email           → all, by email (QRCODE_EMAIL_SMTP_TO)
/defi -a 2 -to you@example.com   → by email, to that address
/defi -a 1 -to /Jorge Pereira/   → in the contact's private chat
/defi -a 1 -to /Grupo L200/      → in the group
/defi -a 1 -to +5521999999999    → in the number's private chat
/defi -a 1 -to @Fulano Da Silva  → in a group, mentioning the person
/defi -a 1 -to /Grupo L200/ -to email  → in the group and by email
/defi -a 1 -taxas 50             → and when the fees to collect go over $50
/defi -a 1 -taxas off            → removes the fees notice (the range one stays)
/defi orca -address <address> -alerta 2000   → on registration: turns it on, with a $2000 limit
/defi -alerta                    → the list of alerts
/defi -alerta -rm 1              → turns off no. 1's (the position stays registered)
```

`-to` accepts:

- `email` (the `QRCODE_EMAIL_SMTP_TO` from `config/.env`) or one or more emails (comma-separated,
  quoted). It goes out through the bot's SMTP, without WhatsApp formatting; it needs
  `QRCODE_EMAIL_SMTP_HOST` and `QRCODE_EMAIL_SMTP_USER`.
- A contact, a group or a number, as in the other commands: exact names take priority; if the name
  fits more than one, the bot lists them and you reply with the number
  ([Destinations](index.md#destinations-contact-group-number-or-email)).
- Several `-to`, to warn all of them (the same one repeated counts once). If sending fails for one,
  the others still receive it.

Turning on a position again replaces the destinations with the ones from the new `-to` (without
`-to`, back to your private chat) and keeps the `-taxas`, if you don't send another. When turning it
on, the bot already reads the position: if it's out of the range at that moment, the response shows
it, and the next warning is the comeback one. If the RPC doesn't respond, the position stays
`❔ not read yet`, and the first reading out of the range already warns.

```text
/defi -alerta 1 -to email
🔔 /defi alert on (1)

1. Orca · Hz15…RaPZ · ✅ in range

📣 Notice: 📧 you@example.com, when the position leaves the range and when it comes back (checked every 10 minutes).
💡 See it with /defi -alerta; turn off with /defi -alerta -rm <num|all>.
```

The warning carries the position's "Position Details". On a Project X wallet, it's "in range" when
all the open positions are, and the warning carries only the ones that left:

```text
🚨 DeFi: Orca · Hz15…RaPZ left the range

🌊 Orca · SOL/cbBTC · fee 0.16%
📍 Hz15…RaPZ · ⚠️ out of range (price below the range: the position earns no fees)
...

💡 Turn off with /defi -alerta -rm 1.
```

And the other warnings, with the same "Position Details":

```text
✅ DeFi: Orca · Hz15…RaPZ is back in range
💸 DeFi: Project X · wallet 0x92…0444 has $98.50 in fees to collect (over $50.00)
```

In the `/defi -l` list, positions with an alert show with 🔔 (and the fee threshold, if any:
`🔔 ≥ $2,000.00`). Each reading spends RPC queries: with the public ones, prefer a longer interval
(or your own RPC: [Solana](#solana-rpc), [HyperEVM](#hyperevm-rpc)).

## Where to find the addresses

On Orca, open the position (under **Portfolio** or on the pool page, `www.orca.com/pools/<pool>`):
the pool address is in the URL, and the position's and the NFT's show in the position details (or in
an explorer, like [Solscan](https://solscan.io/)). `-address` is enough: the pool comes from the
position itself, and the NFT, if given, is checked (the position is derived from it).

## What is shown

- **Status**: in or out of the range. Out of it, the position sits entirely in a single token and
  earns no fees.
- **Balance**: how much of each token your liquidity is worth now, and in dollars.
- **Range** and **current price**: in token B per token A (as in the pool), with the price's position
  within the range and the inverted price.
- **Fees to collect**: the accumulated, not yet collected fees, using the same calculation as Orca's
  program (they're the ones the "Collect" button would collect).
- **Rewards to collect**: only show up when the pool has incentives and there's something to collect.
- **Earns ~/day**: an estimate. It's your liquidity's share of the pool's active liquidity times the
  last 24 h of fees that go to the liquidity providers (the protocol takes a cut). Only shows up
  within the range.
- **Pool**: TVL, volume and fees for the last 24 h.

The dollar values use prices from Orca's public API. The position's profit or loss (PnL) doesn't
show: it depends on the deposits and withdrawals made, which aren't in the position's account.

## Solana RPC

The accounts are read through the RPC in the `defi.solana.rpc` setting (default: the public one,
`https://api.mainnet-beta.solana.com`). It limits queries: if `/defi` says it couldn't read the
position, try again in a moment or use your own RPC (Helius, QuickNode, Alchemy... have free plans):

```text
/set defi.solana.rpc https://mainnet.helius-rpc.com/?api-key=<your-key>
```

The value is displayed masked in `/set`, since the URL usually carries the key. The registered
positions (and each one's alert) are kept in the `defi_positions` table (up to 20, adding up Orca
positions and Project X, Liquidswap, Morpho and Aave wallets).

## HyperEVM RPC

Project X is read through the RPC in the `defi.hyperevm.rpc` setting (default: Hyperliquid's public
one, `https://rpc.hyperliquid.xyz/evm`, chain 999). It also limits queries and rejects large
batches: the bot sends the calls in batches of 10. If `/defi prjx` can't read the wallet, try again
in a moment or use your own RPC:

```text
/set defi.hyperevm.rpc https://<your-hyperevm-rpc>
```

## Aptos API

Liquidswap is read from two parts of Aptos Labs's public API:

- the **indexer** (setting `defi.aptos.indexer`), which finds the wallet's LPs, both those stored as
  coin and those already migrated to fungible asset;
- the **fullnode REST API** (setting `defi.aptos.rpc`), which reads the pools' reserves, the total LP
  issued and the tokens' symbol and decimals.

Without a key, both are subject to the anonymous per-IP limit, which is enough for the bot's use. If
`/defi liquidswap` says it hit the query limit, try again in a few minutes or create a free key at
[Geomi](https://geomi.dev/docs/start) and put it in `config/.env` (or in the setting):

```text
APTOS_API_KEY=<your-key>
/set defi.aptos.apikey <your-key>
```
