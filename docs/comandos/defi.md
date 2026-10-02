# `/defi` · admin

Acompanha posições de liquidez em DeFi, de dois protocolos:

- [Orca](https://www.orca.so/) (Whirlpools, na Solana): você cadastra cada posição.
- [Project X](https://www.prjx.com/portfolio) (na HyperEVM, da Hyperliquid): você
  cadastra a carteira, e o bot lê as posições abertas dela
  ([Project X](#project-x)).

O `/defi -show` lê tudo on-chain na hora e mostra o equivalente ao "Position
Details" de cada posição. Com o `-alerta`, o bot avisa quando uma posição sai
da faixa, quando volta e, com o `-taxas`, quando as taxas a coletar passam de
um valor ([Alerta de saída da faixa](#alerta-de-saída-da-faixa)).

| Opção | Valor | Descrição |
|---|---|---|
| `-alerta`, `-a` | `[nº\|all]` | Sem nº: lista os alertas. Com nº (ou `all`): avisa quando a posição sair da faixa e quando voltar. Veja [Alerta de saída da faixa](#alerta-de-saída-da-faixa) |
| `-orca` | | Protocolo da posição a cadastrar: a Orca, na Solana (com `-position`) |
| `-position`, `-p` | `<endereço>` | Cadastra a posição da Orca (com `-orca`) |
| `-nft` | `<mint>` | Com `-position`: o NFT da posição. Opcional; se vier, o bot confere se bate |
| `-pool` | `<endereço>` | Com `-position`: a pool. Opcional; se vier, o bot confere se bate |
| `-project-x`, `-prjx` | | Protocolo a cadastrar: o Project X, na HyperEVM (com `-wallet`). O bot lê todas as posições abertas da carteira |
| `-wallet`, `-w` | `<0x...>` | Com `-project-x`: a carteira (`0x` e 40 caracteres hexadecimais) |
| `-show`, `-s` | `[nº]` | Position Details de todas as posições (ou da nº N) |
| `-list`, `-l` | | Lista as posições cadastradas (o mesmo que `/defi` sem nada) |
| `-rm` | `<nº\|all>` | Remove a posição nº N (ou todas). Junto com `-alerta`: só desliga o alerta da nº N (ou de todas) |
| `-taxas` | `<valor\|off>` | Junto com `-alerta`: avisa também quando as taxas a coletar passarem do valor, em dólar (ex.: `-taxas 50`). Avisa uma vez e de novo depois de você coletar; `off` tira. Veja [Alerta de saída da faixa](#alerta-de-saída-da-faixa) |
| `-to` | `<destino>` | Junto com `-alerta`: para onde vai o aviso. Um contato (`/Jorge Pereira/`), uma menção (`@Fulano Da Silva`), um grupo (`/Grupo L200/`), um número (`+5521999999999`) ou e-mail (`email` é o `QRCODE_EMAIL_SMTP_TO`) ([Destinos](index.md#destinos-contato-grupo-número-ou-e-mail)). Sem ele, o seu privado |

```
/defi -orca -position Hz15TavvC8p9S7EihCbWa694kWFJGXFzs7AVpvWKRaPZ -nft C1MEDy3xt3gxiDtFkHt7HBWxxUVSarKZgt22FUzsKoji -pool CeaZcxBNLpJWtxzt58qQmfMBtJY8pQLvursXTJYGQpbN
/defi -project-x -wallet 0x926024824BAEAf3ee0b7A2EEFA5A216743230444
/defi -prjx -w 0x926024824BAEAf3ee0b7A2EEFA5A216743230444   → o mesmo, pelos atalhos
/defi -show            → todas as posições
/defi -s 2             → só a nº 2
/defi                  → a lista
/defi -rm 1            → remove a nº 1
/defi -alerta 1        → avisa no seu privado quando a nº 1 sair da faixa (e voltar)
/defi -a 1 -taxas 50   → e quando as taxas a coletar da nº 1 passarem de $50
```

Para receber o `-show` todo dia, num chat ou junto com outros comandos, use o
[`/cron`](cron.md#comandos-no-texto) (só o `-show` e o `-list` rodam lá):

```
/cron 06:00 -r diario -to /Grupo da Faculdade/ ⏰ Status da DeFi! {/defi -s} Preço do BTC! {/crypto BTC}
```

```
/defi -show
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
`/defi -show` mostra cada posição aberta dela, da mais nova para a mais velha:

```
/defi -project-x -wallet 0x926024824BAEAf3ee0b7A2EEFA5A216743230444
✅ Carteira do Project X cadastrada: 0x92…0444
📍 2 posições abertas.

/defi -show
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
- Cadastrar uma carteira sem posição aberta vale (o bot avisa): o `/defi -show`
  mostra as posições quando houver.

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
/defi -a 1 -taxas 50             → e quando as taxas a coletar passarem de $50
/defi -a 1 -taxas off            → tira o aviso das taxas (o da faixa continua)
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

Ligar de novo uma posição troca o destino (e mantém o `-taxas`, se você não
mandar outro). Ao ligar, o bot já lê a posição: se ela estiver fora da faixa
nesse momento, a resposta mostra, e o próximo aviso é o da volta. Se o RPC não
responder, a posição fica `❔ ainda não lida`, e a primeira leitura fora da faixa
já avisa.

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

Na lista do `/defi -l`, as posições com alerta aparecem com 🔔. Cada leitura
gasta consultas no RPC: com os públicos, prefira um intervalo maior (ou um RPC
próprio: [Solana](#rpc-da-solana), [HyperEVM](#rpc-da-hyperevm)).

## Onde achar os endereços

Na Orca, abra a posição (em **Portfolio** ou na página da pool,
`www.orca.com/pools/<pool>`): o endereço da pool está na URL, e o da posição e o
do NFT aparecem nos detalhes da posição (ou no explorador, como o
[Solscan](https://solscan.io/)). Basta o `-position`: a pool vem da própria
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
`/defi -show` responder que não conseguiu ler a posição, tente de novo em
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
Se o `/defi -show` não conseguir ler a carteira, tente de novo em instantes ou
use um RPC próprio:

```
/set defi.hyperevm.rpc https://<seu-rpc-da-hyperevm>
```
