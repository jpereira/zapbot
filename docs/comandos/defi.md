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
/defi                          → o Position Details de todos
/defi -help                    → a ajuda de todos (/defi orca -help: só a da Orca)
/defi -mask                    → o mesmo, com os números da carteira escondidos ($**,***.**)
/defi -l                       → a lista dos cadastros
/defi -rm 2                    → remove o nº 2
/defi -rm 1 3                  → remove o 1 e o 3 (ou -rm 1,3; -rm all remove todos)
/defi -taxas                   → o resumo das taxas a coletar, com o total
/defi -taxas -alerta           → o mesmo, com o alerta de cada cadastro
/defi -alerta <nº|all> [-to <destino>]... [-taxas <valor>]
```

For Orca:

```text
/defi orca                     → só as posições da Orca
/defi orca -address <endereço> -pool <endereço> -nft <mint>
/defi orca -address <endereço> -alerta 2000   → cadastra e já liga o alerta (no seu privado)
/defi orca -address <endereço> -n "Posição TAL"   → com um nome
```

For Project X:

```text
/defi prjx                     → só as do Project X
/defi prjx -wallet <0x...>     → cadastra a carteira
/defi prjx -wallet <0x...> -n Carteira Hare   → com um nome (de novo, com outro: troca o nome)
/defi prjx -wallet <0x...> -alerta    → cadastra e já liga o alerta (no seu privado)
```

For Liquidswap (`liquidswap` or `liqswp`):

```text
/defi liquidswap               → só as da Liquidswap (o mesmo que /defi liqswp)
/defi liquidswap -wallet <0x...>   → cadastra a carteira da Aptos
/defi liqswp -wallet <0x...> -n Carteira Aptos   → com um nome
```

For Morpho:

```text
/defi morpho                   → as carteiras cadastradas (sem nenhuma: a do MORPHO_WALLET_ADDRESS)
/defi morpho -wallet <0x...>   → cadastra a carteira
/defi morpho -wallet <0x...> -n Carteira Empre   → com um nome
```

For Aave:

```text
/defi aave                     → as carteiras cadastradas (sem nenhuma: a do AAVE_WALLET_ADDRESS)
/defi aave -full               → os detalhes (risco, APY, colateral, eMode, isolation mode)
/defi aave -wallet <0x...> -n CarteiraX   → cadastra a carteira (e já mostra a posição)
```

| Option | Value | Description |
|---|---|---|
| *(protocol)* | `orca`, `prjx`, `liquidswap` (ou `liqswp`), `morpho` ou `aave` | Alone, shows the Position Details for that protocol only; with `-address` (`orca`) or `-wallet` (`prjx`, `liquidswap`, `morpho` and `aave`), registers; with `-help`, shows help for that protocol only. Without a protocol, `/defi` shows everything registered |
| `-list`, `-l` | | Lists the registrations, with 🔔 on the ones that have an alert (and the fee threshold: `🔔 ≥ $2,000.00`). In your private chat, with full addresses; elsewhere, abbreviated (`Hz15…RaPZ`) |
| `-rm` | `<nº...\|all>` | Removes registration no. N, several (`-rm 1 3` or `-rm 1,3`) or all of them; if any number doesn't exist, none is removed. Together with `-alerta`: only turns off the alert for no. N (or for all) |
| `-alerta`, `-a` | `[nº\|all\|valor]` | Without a number: lists the alerts. With a number (or `all`): warns when the position leaves the range and when it comes back. Orca and Project X only (Liquidswap, Morpho and Aave have no range). On registration (with `-address` or `-wallet`), turns on the alert for the new position, in your private chat (or at `-to`); the value is the fee threshold, same as `-taxas` (`-alerta 2000`). See [Out-of-range alert](#out-of-range-alert) |
| `-taxas` | `[valor\|off]` | Alone: the summary of fees to collect (see [Fee summary](#fee-summary)). Together with `-alerta <nº\|all>`: also warns when the fees to collect go over the value, in dollars (e.g., `-taxas 50`). Warns once, and again after you collect; `off` removes it |
| `-to` | `<destino>` | Together with `-alerta`: where the warning goes. A contact (`/Jorge Pereira/`), a mention (`@Fulano Da Silva`), a group (`/Grupo L200/`), a number (`+5521999999999`) or email (`email` is `QRCODE_EMAIL_SMTP_TO`) ([Destinations](index.md#destinations-contact-group-number-or-email)). Repeat it for several: the warning goes to all of them. Without it, your private chat |
| `-address` | `<endereço>` | With `orca`: registers the Orca position by its address |
| `-pool` | `<endereço>` | With `orca -address`: the pool. Optional; if given, the bot checks that it matches |
| `-nft` | `<mint>` | With `orca -address`: the position's NFT. Optional; if given, the bot checks that it matches |
| `-wallet`, `-w` | `<0x...>` | With `prjx`, `morpho` or `aave`: registers the wallet (`0x` and 40 hexadecimal characters); with `liquidswap`, the Aptos wallet (`0x` and up to 64). The bot reads all of its open positions |
| `-mask`, `-m` | | Hides the wallet numbers with `*`, keeping the format (`$**,***.**`): balances, amounts, values and yield. Fees to collect stay visible. Position (-address) and wallet (-wallet) addresses are hidden too, even in private chat. Price, range, pool, Health Factor, LTV and APY stay. Works with any protocol (`/defi -m`, `/defi aave -mask`) |
| `-name`, `-n` | `<nome>` | With `-address` or `-wallet`: a name for the position or wallet (optional, up to 40 characters), shown next to the address (`Orca · Posição TAL (Hz15…RaPZ)`, `Project X · Carteira Hare (0x92…0444)`). With spaces, quoted or not. On one that's already registered, changes the name |
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
🌊 Posições DeFi (2)

1. Orca · Hz15…RaPZ · pool CeaZ…QpbN (desde 02/10/2026) 🔔 ≥ $2,000.00
2. Project X · carteira 0x92…0444 (desde 02/10/2026) 🔔

💡 /defi mostra os detalhes; /defi -rm <nº> remove; 🔔 = com alerta (/defi -alerta), ≥ $ é o limite das taxas.
```

In your private chat, addresses show in full.

To get the Position Details every day, in a chat or together with other commands, use
[`/cron`](cron.md#commands-in-the-text) (it accepts the five protocols, `-l`, `-taxas`, `-mask` and
`aave -full`; the registration and alert options are rejected):

```text
/cron 06:00 -r diario -to /Grupo da Faculdade/ ⏰ Status da DeFi! {/defi} Preço do BTC! {/crypto BTC}
```

```text
/defi orca
🌊 Orca · SOL/cbBTC · taxa 0.16%
📍 7xKp…3mQa · ✅ dentro da faixa

💰 Saldo: $2,476.30
   • 12.4521 SOL ($1,470.55)
   • 0.012 cbBTC ($1,005.75)

📏 Faixa: 0.00140324 – 0.0014605 cbBTC por SOL
🎯 Preço atual: 0.00140381 cbBTC por SOL
   ▕●──────────▏ 1% da faixa
   (1 cbBTC = 712.349 SOL)

💸 Taxas a coletar: $18.42
   • 0.0812 SOL ($9.59)
   • 0.0001054 cbBTC ($8.83)
📊 Rende ~$6.71/dia (estimativa: 0.0648% da liquidez ativa × as taxas 24h dos LPs)

🏊 Pool: TVL $9.62M · volume 24h $7.44M · taxas 24h $11.9K
```

## Project X

[Project X](https://www.prjx.com/portfolio) is a HyperEVM DEX (Hyperliquid's EVM network), a Uniswap
V3 fork: each position is an NFT from the positions contract, held in the wallet of whoever opened
it. That's why what you register is the **wallet**, and `/defi prjx` shows each open position in it,
from newest to oldest:

```text
/defi prjx -wallet 0x926024824BAEAf3ee0b7A2EEFA5A216743230444
✅ Carteira do Project X cadastrada: 0x92…0444
📍 2 posições abertas.
💡 Veja com /defi prjx

/defi prjx
🌊 Project X · UBTC/USD₮0 · taxa 0.05%
📍 #558492 · ✅ dentro da faixa

💰 Saldo: $10.09
   • 0.00005428 UBTC ($4.67)
   • 5.4195 USD₮0 ($5.42)

📏 Faixa: 83,686.6 – 88,241.4 USD₮0 por UBTC
🎯 Preço atual: 86,104.4 USD₮0 por UBTC
   ▕─────●─────▏ 53% da faixa

💸 Taxas a coletar: <$0.01
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
✅ Carteira da Liquidswap cadastrada: 0x8f…6d5c
📍 2 posições abertas.
💡 Veja com /defi liquidswap

/defi liqswp
🌊 Liquidswap · USDC/APT · taxa 0.3% · v0 não correlacionada
📍 0.5% da pool

💰 Saldo: $439.83
   • 219.9144 USDC ($219.91)
   • 294.4688 APT ($219.91)

🎯 Preço atual: 1.33902 APT por USDC
   (1 APT = 0.746817 USDC)

🏊 Pool: TVL $87.97K · 43,982.87 USDC + 58,893.75 APT
💸 As taxas dos swaps entram na pool: já estão no saldo.
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

💰 Posição líquida
$11,236.16

❤️ Health Rate
2.73

━━━━━━━━━━━━━━━━━━

📥 SUPPLIED / COLLATERAL

₿ cbBTC
Quantidade: 0.19324183 cbBTC
Valor: $16,407.88

━━━━━━━━━━━━━━━━━━

📤 BORROWED

💵 USDC
Quantidade: 5,171.79 USDC
Valor: $5,171.72

━━━━━━━━━━━━━━━━━━

📊 RISCO

LTV atual: 31.52%
LLTV: 86.00%
Preço cbBTC (oráculo): 84,909.56 USDC
Preço de liquidação: 31,120.13 USDC
Utilização do mercado: 90.04%

━━━━━━━━━━━━━━━━━━

👛 Carteira: 0x74…97C4
🌐 Rede: Base
🕐 Atualizado: 03:15:42
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

💰 Posição líquida
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

👛 Carteira: 0x12…abcd
🌐 Rede: Ethereum
🕐 Atualizado: 03:15:42
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
balance: there's nothing to collect. A protocol that isn't registered shows as `➖ não cadastrado`.
With the protocol, only that one (`/defi prjx -taxas`); Morpho and Aave have no fees to collect.

With `-alerta` (no value), it also shows each registration's alert: where it warns, the fee threshold
and how far it is from reaching it. On Project X, the threshold applies to the whole wallet (the sum
of the positions), as in the alert check.

```text
/defi -taxas                   → o resumo de todos
/defi prjx -taxas              → só do Project X
/defi -taxas -alerta           → com o alerta de cada cadastro
/cron 8h -r diario {/defi -taxas}   → o resumo todo dia às 8h
```

```text
💸 Resumo das taxas a coletar · 07/10/2026 às 20:55

🌊 Orca · SOL/cbBTC · 📍 Hz15…RaPZ
📏 Faixa: 0.00140324 – 0.0014605 cbBTC por SOL
🎯 Preço atual: 0.00140382 cbBTC por SOL
   ▕●──────────▏ 1% da faixa
   (1 cbBTC = 712.344 SOL)
💸 Taxas a coletar: $1,426.35
   • 6.2494 SOL ($738.04)
   • 0.008212 cbBTC ($688.31)
🔕 Sem alerta (ligue com /defi -alerta 1)

🌊 Project X · UBTC/USD₮0 · 📍 #7
📏 Faixa: 81,213.4 – 91,567.3 USD₮0 por UBTC
🎯 Preço atual: 86,000 USD₮0 por UBTC
   ▕─────●─────▏ 46% da faixa
   (1 USD₮0 = 0.0000116279 UBTC)
💸 Taxas a coletar: $98.50
   • 0.001 UBTC ($86.00)
   • 12.5 USD₮0 ($12.50)
🔔 Alerta: faixa e taxas ≥ $200.00 → seu privado
   faltam $101.50 (49% do limite)

🌊 Liquidswap · ➖ não cadastrado

━━━━━━━━━━━━━━━━━━
💰 Total a coletar: $1,524.85
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
/defi -alerta 1                  → no seu privado
/defi -a all -to email           → todas, por e-mail (QRCODE_EMAIL_SMTP_TO)
/defi -a 2 -to voce@exemplo.com  → por e-mail, para esse endereço
/defi -a 1 -to /Jorge Pereira/   → no privado do contato
/defi -a 1 -to /Grupo L200/      → no grupo
/defi -a 1 -to +5521999999999    → no privado do número
/defi -a 1 -to @Fulano Da Silva  → num grupo, mencionando a pessoa
/defi -a 1 -to /Grupo L200/ -to email  → no grupo e por e-mail
/defi -a 1 -taxas 50             → e quando as taxas a coletar passarem de $50
/defi -a 1 -taxas off            → tira o aviso das taxas (o da faixa continua)
/defi orca -address <endereço> -alerta 2000   → no cadastro: liga já, com o limite de $2000
/defi -alerta                    → a lista dos alertas
/defi -alerta -rm 1              → desliga o da nº 1 (a posição continua cadastrada)
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
`❔ ainda não lida`, and the first reading out of the range already warns.

```text
/defi -alerta 1 -to email
🔔 Alerta do /defi ligado (1)

1. Orca · Hz15…RaPZ · ✅ na faixa

📣 Aviso: 📧 voce@exemplo.com, quando a posição sair da faixa e quando voltar (verificada a cada 10 minutos).
💡 Veja com /defi -alerta; desligue com /defi -alerta -rm <nº|all>.
```

The warning carries the position's "Position Details". On a Project X wallet, it's "in range" when
all the open positions are, and the warning carries only the ones that left:

```text
🚨 DeFi: Orca · Hz15…RaPZ saiu da faixa

🌊 Orca · SOL/cbBTC · taxa 0.16%
📍 Hz15…RaPZ · ⚠️ fora da faixa (preço abaixo: a posição não rende taxas)
...

💡 Desligue com /defi -alerta -rm 1.
```

And the other warnings, with the same "Position Details":

```text
✅ DeFi: Orca · Hz15…RaPZ voltou para a faixa
💸 DeFi: Project X · carteira 0x92…0444 tem $98.50 em taxas a coletar (passou de $50.00)
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
/set defi.solana.rpc https://mainnet.helius-rpc.com/?api-key=<sua-chave>
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
/set defi.hyperevm.rpc https://<seu-rpc-da-hyperevm>
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
APTOS_API_KEY=<sua-chave>
/set defi.aptos.apikey <sua-chave>
```
