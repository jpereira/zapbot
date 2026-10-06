# `/defi` · admin

Acompanha posições em DeFi, de quatro protocolos:

- [Orca](https://www.orca.so/) (Whirlpools, na Solana): você cadastra cada posição.
- [Project X](https://www.prjx.com/portfolio) (na HyperEVM, da Hyperliquid): você
  cadastra a carteira, e o bot lê as posições abertas dela
  ([Project X](#project-x)).
- [Morpho](https://morpho.org/) (empréstimos, na Base e em outras redes): você
  cadastra a carteira, e o bot lê o colateral, a dívida e o risco dela
  ([Morpho](#morpho)).
- [Aave V3](https://aave.com/) (empréstimos, na Ethereum e na Base): você
  cadastra a carteira, e o bot lê o fornecido, o emprestado e o Health Factor
  nos contratos do Aave ([Aave V3](#aave-v3)).

A Orca cadastra a **posição** (`-address`); o Project X, o Morpho e o Aave, a
**carteira** (`-wallet`). Todos aceitam um nome opcional (`-name`). O `/defi` lê tudo na hora e mostra o equivalente ao
"Position Details" de cada posição; com `orca`, `prjx` ou `morpho`, só as
daquele protocolo (`orca`, `prjx`, `morpho` ou `aave`). No seu privado, os endereços e as carteiras aparecem
inteiros; fora dele, abreviados (`0x92…0444`). Com o `-alerta`,
o bot avisa quando uma posição sai da faixa, quando volta e, com o `-taxas`,
quando as taxas a coletar passam de um valor
([Alerta de saída da faixa](#alerta-de-saída-da-faixa)).

Para todos os protocolos:

```
/defi                          → o Position Details de todos
/defi -help                    → a ajuda de todos (/defi orca -help: só a da Orca)
/defi -mask                    → o mesmo, com os números da carteira escondidos ($**,***.**)
/defi -l                       → a lista dos cadastros
/defi -rm 2                    → remove o nº 2
/defi -rm 1 3                  → remove o 1 e o 3 (ou -rm 1,3; -rm all remove todos)
/defi -alerta <nº|all> [-to <destino>]... [-taxas <valor>]
```

Para a Orca:

```
/defi orca                     → só as posições da Orca
/defi orca -address <endereço> -pool <endereço> -nft <mint>
/defi orca -address <endereço> -alerta 2000   → cadastra e já liga o alerta (no seu privado)
/defi orca -address <endereço> -n "Posição TAL"   → com um nome
```

Para o Project X:

```
/defi prjx                     → só as do Project X
/defi prjx -wallet <0x...>     → cadastra a carteira
/defi prjx -wallet <0x...> -n Carteira Hare   → com um nome (de novo, com outro: troca o nome)
/defi prjx -wallet <0x...> -alerta    → cadastra e já liga o alerta (no seu privado)
```

Para o Morpho:

```
/defi morpho                   → as carteiras cadastradas (sem nenhuma: a do MORPHO_WALLET_ADDRESS)
/defi morpho -wallet <0x...>   → cadastra a carteira
/defi morpho -wallet <0x...> -n Carteira Empre   → com um nome
```

Para o Aave:

```
/defi aave                     → as carteiras cadastradas (sem nenhuma: a do AAVE_WALLET_ADDRESS)
/defi aave -full               → os detalhes (risco, APY, colateral, eMode, isolation mode)
/defi aave -wallet <0x...> -n CarteiraX   → cadastra a carteira (e já mostra a posição)
```

| Opção | Valor | Descrição |
|---|---|---|
| *(protocolo)* | `orca`, `prjx`, `morpho` ou `aave` | Sozinho, mostra o Position Details só dele; com `-address` (`orca`) ou `-wallet` (`prjx`, `morpho` e `aave`), cadastra; com `-help`, mostra a ajuda só dele. Sem protocolo, o `/defi` mostra todos os cadastrados |
| `-list`, `-l` | | Lista os cadastros, com 🔔 nos que têm alerta (e o limite das taxas: `🔔 ≥ $2,000.00`). No seu privado, com os endereços inteiros; fora dele, abreviados (`Hz15…RaPZ`) |
| `-rm` | `<nº...\|all>` | Remove o cadastro nº N, vários (`-rm 1 3` ou `-rm 1,3`) ou todos; se algum nº não existe, nenhum sai. Junto com `-alerta`: só desliga o alerta da nº N (ou de todas) |
| `-alerta`, `-a` | `[nº\|all\|valor]` | Sem nº: lista os alertas. Com nº (ou `all`): avisa quando a posição sair da faixa e quando voltar. Só da Orca e do Project X (o Morpho e o Aave não têm faixa). No cadastro (com `-address` ou `-wallet`), liga o alerta da posição nova, no seu privado (ou no `-to`); o valor é o limite das taxas, como o `-taxas` (`-alerta 2000`). Veja [Alerta de saída da faixa](#alerta-de-saída-da-faixa) |
| `-taxas` | `<valor\|off>` | Junto com `-alerta`: avisa também quando as taxas a coletar passarem do valor, em dólar (ex.: `-taxas 50`). Avisa uma vez e de novo depois de você coletar; `off` tira |
| `-to` | `<destino>` | Junto com `-alerta`: para onde vai o aviso. Um contato (`/Jorge Pereira/`), uma menção (`@Fulano Da Silva`), um grupo (`/Grupo L200/`), um número (`+5521999999999`) ou e-mail (`email` é o `QRCODE_EMAIL_SMTP_TO`) ([Destinos](index.md#destinos-contato-grupo-número-ou-e-mail)). Repita para vários: o aviso sai em todos. Sem ele, o seu privado |
| `-address` | `<endereço>` | Com `orca`: cadastra a posição da Orca pelo endereço dela |
| `-pool` | `<endereço>` | Com `orca -address`: a pool. Opcional; se vier, o bot confere se bate |
| `-nft` | `<mint>` | Com `orca -address`: o NFT da posição. Opcional; se vier, o bot confere se bate |
| `-wallet`, `-w` | `<0x...>` | Com `prjx`, `morpho` ou `aave`: cadastra a carteira (`0x` e 40 caracteres hexadecimais), e o bot lê todas as posições abertas dela |
| `-mask`, `-m` | | Esconde os números da carteira com `*`, mantendo o formato (`$**,***.**`): saldos, quantidades, valores e o rendimento. As taxas a coletar ficam visíveis. Os endereços da posição (-address) e da carteira (-wallet) também ficam ocultos, inclusive no privado. Preço, faixa, pool, Health Factor, LTV e APY continuam. Vale com qualquer protocolo (`/defi -m`, `/defi aave -mask`) |
| `-name`, `-n` | `<nome>` | Com `-address` ou `-wallet`: um nome para a posição ou a carteira (opcional, até 40 caracteres), mostrado junto do endereço (`Orca · Posição TAL (Hz15…RaPZ)`, `Project X · Carteira Hare (0x92…0444)`). Com espaços, com ou sem aspas. Numa já cadastrada, troca o nome |
| `-full`, `-f` | | Com `aave`: os detalhes da posição: LTV, liquidation threshold, available borrows, o APY de cada ativo, o que é colateral, eMode e isolation mode. Veja [Aave V3](#aave-v3) |

```
/defi orca -address Hz15TavvC8p9S7EihCbWa694kWFJGXFzs7AVpvWKRaPZ -pool CeaZcxBNLpJWtxzt58qQmfMBtJY8pQLvursXTJYGQpbN -nft C1MEDy3xt3gxiDtFkHt7HBWxxUVSarKZgt22FUzsKoji
/defi prjx -wallet 0x926024824BAEAf3ee0b7A2EEFA5A216743230444
/defi morpho -wallet 0x74459EA7df673CFd90afbe39F635AcE08Ccb97C4
/defi -alerta 1        → avisa no seu privado quando a nº 1 sair da faixa (e voltar)
/defi -a 1 -taxas 50   → e quando as taxas a coletar da nº 1 passarem de $50
```

A lista mostra o 🔔 de quem tem alerta e, com o `-taxas` (ou o `-alerta <valor>`
no cadastro), o limite das taxas:

```
/defi -l
🌊 Posições DeFi (2)

1. Orca · Hz15…RaPZ · pool CeaZ…QpbN (desde 02/10/2026) 🔔 ≥ $2,000.00
2. Project X · carteira 0x92…0444 (desde 02/10/2026) 🔔

💡 /defi mostra os detalhes; /defi -rm <nº> remove; 🔔 = com alerta (/defi -alerta), ≥ $ é o limite das taxas.
```

No seu privado, os endereços saem inteiros.

Para receber o Position Details todo dia, num chat ou junto com outros comandos,
use o [`/cron`](cron.md#comandos-no-texto) (lá rodam o `/defi`, o `/defi orca|prjx`
e o `-l`; o cadastro e o `-alerta`, não):

```
/cron 06:00 -r diario -to /Grupo da Faculdade/ ⏰ Status da DeFi! {/defi} Preço do BTC! {/crypto BTC}
```

```
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

O [Project X](https://www.prjx.com/portfolio) é uma DEX da HyperEVM (a rede EVM
da Hyperliquid), um fork do Uniswap V3: cada posição é um NFT do contrato de
posições, na carteira de quem a abriu. Por isso o cadastro é a **carteira**, e o
`/defi prjx` mostra cada posição aberta dela, da mais nova para a mais velha:

```
/defi prjx -wallet 0x926024824BAEAf3ee0b7A2EEFA5A216743230444
✅ Carteira do Project X cadastrada: 0x92…0444
📍 2 posições abertas.

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

- Posições fechadas (sem liquidez) ficam de fora: o NFT continua na carteira,
  mas não há o que mostrar. O bot lê os 100 NFTs mais novos e mostra até 20
  posições abertas.
- **Taxas a coletar**: o bot simula o `collect` do contrato, como se a carteira
  chamasse; é o valor exato que o botão "Collect" coletaria.
- **Dólar**: vem do lado estável do par (USD₮0, USDC, USDe, USDH...). Num par sem
  stablecoin, aparecem só as quantidades.
- Cadastrar uma carteira sem posição aberta vale (o bot avisa): o `/defi prjx`
  mostra as posições quando houver.

## Morpho

O `/defi morpho` mostra as posições da carteira no [Morpho](https://morpho.org/):
o colateral, a dívida, o que foi fornecido (num mercado ou num vault) e o risco
de cada mercado. Os dados vêm da API oficial do Morpho (GraphQL em
`https://api.morpho.org/graphql`, setting `defi.morpho.api`), numa consulta só
por todas as redes do setting `defi.morpho.chains` (padrão: `8453`, a Base;
para incluir a Ethereum, `/set defi.morpho.chains 8453 1`). A consulta é só de
leitura: o bot não pede nem usa chave privada.

Cadastre a carteira com `/defi morpho -wallet <0x...>` (o bot confere na API
antes de guardar): ela entra no `/defi`, no `-l` e no `-rm`, junto com as
outras. O `-alerta` não vale para o Morpho, que não tem faixa. Sem nenhuma
carteira cadastrada, o `/defi morpho` consulta a do `MORPHO_WALLET_ADDRESS` no
`config/.env` (ou a do setting `defi.morpho.wallet`, que vale quando a variável
está vazia). A resposta fica 30 segundos em memória: repetir o comando nesse
intervalo não consulta a API de novo.

```
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

Com mais de uma posição (vários mercados, vaults ou redes), vêm primeiro o
total líquido, o total fornecido (colateral + fornecido) e o total emprestado,
e depois cada posição, com o seu próprio Health Rate: o de um mercado não vale
para outro.

As contas seguem a [documentação do Morpho](https://docs.morpho.org/learn/concepts/liquidation/),
com os valores brutos do mercado (em BigInt, sem arredondar no caminho):

- **Valor do colateral** (em token de empréstimo) = colateral × preço do
  oráculo / 10³⁶.
- **Health Rate** = valor do colateral × LLTV / emprestado. Abaixo de 1, a
  posição pode ser liquidada; sem dívida, `∞`.
- **LTV atual** = emprestado / valor do colateral. A liquidação acontece
  quando ele passa do **LLTV** do mercado.
- **Preço de liquidação**: o preço do oráculo em que o Health Rate chega a 1
  (emprestado × 10³⁶ / (colateral × LLTV)), em token de empréstimo por token de
  colateral, como o oráculo.

Os valores em dólar são os da API do Morpho. Um token sem preço lá fica sem o
valor em dólar e fora dos totais (a mensagem diz quais); nada é estimado.

## Aave V3

O `/defi aave` mostra a posição da carteira no [Aave V3](https://aave.com/):
o que foi fornecido, o que foi emprestado, o Health Factor e a posição
líquida, em cada rede do setting `defi.aave.chains` (padrão: `1 8453`, a
Ethereum e a Base). Tudo é lido on-chain, nos contratos oficiais do Aave
([documentação](https://aave.com/docs/aave-v3/smart-contracts)), pelo RPC de
cada rede: `ETHEREUM_RPC_URL` e `BASE_RPC_URL` no `config/.env` ou, vazios, os
settings `defi.ethereum.rpc` e `defi.base.rpc` (os padrões são públicos e
limitam as consultas). Só leitura: o bot não pede nem usa chave privada.

A carteira vem do cadastro (`/defi aave -wallet <0x...>`, que já mostra a
posição) ou, sem nenhum, do `AAVE_WALLET_ADDRESS` (ou do setting
`defi.aave.wallet`). A resposta de cada rede fica 30 segundos em memória.

```
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

Com o `-full`, vêm também o risco (LTV atual e máximo, liquidation threshold,
available borrows e o colateral considerado), o APY e o `Collateral: Yes/No`
de cada ativo, o modo da dívida (`Variable` ou `Stable`), o eMode e o
isolation mode. Com posições em mais de uma rede, vem primeiro o total
líquido e depois cada rede, com o seu Health Factor: o de uma rede não vale
para a outra. Uma rede que não responde aparece com o aviso, e as outras vêm
normalmente.

De onde vem cada número:

- **Health Factor, colateral, dívida, available borrows, liquidation
  threshold e LTV máximo**: do `Pool.getUserAccountData`, o valor do próprio
  protocolo (o mesmo do app do Aave). Ele já considera o liquidation threshold
  de cada ativo, o eMode, o isolation mode e o que foi fornecido sem ser
  colateral. Sem dívida, o Health Factor é `∞`.
- **Cada ativo**: o saldo vem do `PoolDataProvider` (o aToken e as dívidas
  variável e estável), e o preço, do `AaveOracle` (o oráculo que o protocolo
  usa). O valor em dólar é a quantidade × o preço.
- **Posição líquida**: todo o fornecido (colateral ou não) − a dívida.
- **LTV atual**: a dívida / o colateral.
- **APY**: a taxa do `PoolDataProvider`, composta por segundo, como na
  documentação do Aave.
- **Preço de liquidação**: só no `-full` e só com um colateral, que não seja
  também a dívida: o preço atual / o Health Factor. Com vários colaterais, ele
  depende do que os outros fizerem, e o bot avisa em vez de calcular.

## Alerta de saída da faixa

Fora da faixa, a posição fica toda num token só e para de render taxas. Com o
`-alerta`, o bot lê a posição (no Project X, as posições da carteira) a cada 10
minutos (setting `defi.alerta.intervalMin`) e avisa:

- **🚨 quando ela sai da faixa**: uma vez por saída. Enquanto continua fora, não
  repete.
- **✅ quando ela volta para a faixa**: também uma vez.
- **💸 quando as taxas a coletar passam do valor do `-taxas`** (em dólar, opcional):
  uma vez. Depois que você coleta e elas caem abaixo do valor, o aviso se arma de
  novo. Num par sem stablecoin (só no Project X), sem preço em dólar, não avisa.

```
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

O `-to` aceita:

- `email` (o `QRCODE_EMAIL_SMTP_TO` do `config/.env`) ou um ou mais e-mails
  (separados por vírgula, entre aspas). Sai pelo SMTP do bot, sem a formatação do
  WhatsApp; precisa do `QRCODE_EMAIL_SMTP_HOST` e do `QRCODE_EMAIL_SMTP_USER`.
- Um contato, um grupo ou um número, como nos outros comandos: o contato é
  buscado primeiro; se o nome servir para mais de um, o bot lista e você responde com
  o nº ([Destinos](index.md#destinos-contato-grupo-número-ou-e-mail)).
- Vários `-to`, para avisar em todos (o mesmo repetido conta uma vez). Se o envio
  falhar num, os outros recebem assim mesmo.

Ligar de novo uma posição troca os destinos pelos do novo `-to` (sem `-to`,
volta ao seu privado) e mantém o `-taxas`, se você não mandar outro. Ao ligar,
o bot já lê a posição: se ela estiver fora da faixa nesse momento, a resposta
mostra, e o próximo aviso é o da volta. Se o RPC não responder, a posição fica
`❔ ainda não lida`, e a primeira leitura fora da faixa já avisa.

```
/defi -alerta 1 -to email
🔔 Alerta do /defi ligado (1)

1. Orca · Hz15…RaPZ · ✅ na faixa

📣 Aviso: 📧 voce@exemplo.com, quando a posição sair da faixa e quando voltar (verificada a cada 10 minutos).
💡 Veja com /defi -alerta; desligue com /defi -alerta -rm <nº|all>.
```

O aviso traz o "Position Details" da posição. Numa carteira do Project X, ela
está "na faixa" quando todas as posições abertas estão, e o aviso traz só as
que saíram:

```
🚨 DeFi: Orca · Hz15…RaPZ saiu da faixa

🌊 Orca · SOL/cbBTC · taxa 0.16%
📍 Hz15…RaPZ · ⚠️ fora da faixa (preço abaixo: a posição não rende taxas)
...

💡 Desligue com /defi -alerta -rm 1.
```

E os outros avisos, com o mesmo "Position Details":

```
✅ DeFi: Orca · Hz15…RaPZ voltou para a faixa
💸 DeFi: Project X · carteira 0x92…0444 tem $98.50 em taxas a coletar (passou de $50.00)
```

Na lista do `/defi -l`, as posições com alerta aparecem com 🔔 (e o limite das
taxas, se tiver: `🔔 ≥ $2,000.00`). Cada leitura
gasta consultas no RPC: com os públicos, prefira um intervalo maior (ou um RPC
próprio: [Solana](#rpc-da-solana), [HyperEVM](#rpc-da-hyperevm)).

## Onde achar os endereços

Na Orca, abra a posição (em **Portfolio** ou na página da pool,
`www.orca.com/pools/<pool>`): o endereço da pool está na URL, e o da posição e o
do NFT aparecem nos detalhes da posição (ou no explorador, como o
[Solscan](https://solscan.io/)). Basta o `-address`: a pool vem da própria
posição, e o NFT, se informado, é conferido (a posição é derivada dele).

## O que é mostrado

- **Status**: dentro ou fora da faixa. Fora dela, a posição fica toda num token
  só e não rende taxas.
- **Saldo**: quanto de cada token a sua liquidez vale agora, e em dólar.
- **Faixa** e **preço atual**: em token B por token A (como na pool), com a
  posição do preço dentro da faixa e o preço invertido.
- **Taxas a coletar**: as taxas acumuladas e ainda não coletadas, com a mesma
  conta do programa da Orca (são as que o botão "Collect" coletaria).
- **Recompensas a coletar**: só aparecem quando a pool tem incentivos e há algo
  a coletar.
- **Rende ~/dia**: estimativa. É a fatia da sua liquidez na liquidez ativa da
  pool vezes as taxas das últimas 24 h que ficam com os provedores de liquidez
  (o protocolo leva uma parte). Só aparece dentro da faixa.
- **Pool**: TVL, volume e taxas das últimas 24 h.

Os valores em dólar usam os preços da API pública da Orca. O lucro ou o prejuízo
da posição (PnL) não aparece: depende dos depósitos e saques feitos, que não
estão na conta da posição.

## RPC da Solana

As contas são lidas pelo RPC do setting `defi.solana.rpc` (padrão: o público,
`https://api.mainnet-beta.solana.com`). Ele limita as consultas: se o
`/defi` responder que não conseguiu ler a posição, tente de novo em
instantes ou use um RPC próprio (Helius, QuickNode, Alchemy... têm planos
grátis):

```
/set defi.solana.rpc https://mainnet.helius-rpc.com/?api-key=<sua-chave>
```

O valor é exibido mascarado no `/set`, já que a URL costuma levar a chave. As
posições cadastradas (e o alerta de cada uma) ficam na tabela `defi_positions`
(até 20, somando posições da Orca e carteiras do Project X).

## RPC da HyperEVM

O Project X é lido pelo RPC do setting `defi.hyperevm.rpc` (padrão: o público
da Hyperliquid, `https://rpc.hyperliquid.xyz/evm`, chain 999). Ele também limita
as consultas e recusa lotes grandes: o bot manda as chamadas em lotes de 10.
Se o `/defi prjx` não conseguir ler a carteira, tente de novo em instantes ou
use um RPC próprio:

```
/set defi.hyperevm.rpc https://<seu-rpc-da-hyperevm>
```
