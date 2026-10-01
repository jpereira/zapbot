# `/defi` · admin

Acompanha posições de liquidez em DeFi. Por enquanto só da
[Orca](https://www.orca.so/) (Whirlpools, na Solana). Você cadastra a posição
uma vez; o `/defi -show` lê tudo on-chain na hora e mostra o equivalente ao
"Position Details" da página da pool na Orca. Com o `-alerta`, o bot avisa
sempre que uma posição sair da faixa ([Alerta de saída da faixa](#alerta-de-saída-da-faixa)).

| Opção | Valor | Descrição |
|---|---|---|
| `-alerta`, `-a` | `[nº\|all]` | Sem nº: lista os alertas. Com nº (ou `all`): avisa sempre que a posição sair da faixa. Veja [Alerta de saída da faixa](#alerta-de-saída-da-faixa) |
| `-orca` | | Protocolo da posição a cadastrar (por enquanto, o único) |
| `-position`, `-p` | `<endereço>` | Cadastra a posição (com `-orca`) |
| `-nft` | `<mint>` | Com `-position`: o NFT da posição. Opcional; se vier, o bot confere se bate |
| `-pool` | `<endereço>` | Com `-position`: a pool. Opcional; se vier, o bot confere se bate |
| `-show`, `-s` | `[nº]` | Position Details de todas as posições (ou da nº N) |
| `-list`, `-l` | | Lista as posições cadastradas (o mesmo que `/defi` sem nada) |
| `-rm` | `<nº\|all>` | Remove a posição nº N (ou todas). Junto com `-alerta`: só desliga o alerta da nº N (ou de todas) |
| `-send` | `<destino>` | Junto com `-alerta`: para onde vai o aviso. `email` (o `QRCODE_EMAIL_SMTP_TO`) ou e-mails; senão, um contato, um grupo ou um número ([Destinos](index.md#destinos-contato-grupo-ou-número)). Sem ele, o seu privado |

```
/defi -orca -position <endereço da posição> -nft <mint do NFT> -pool <endereço da pool>
/defi -show            → todas as posições
/defi -s 2             → só a nº 2
/defi                  → a lista
/defi -rm 1            → remove a nº 1
/defi -alerta 1        → avisa no seu privado quando a nº 1 sair da faixa
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

## Alerta de saída da faixa

Fora da faixa, a posição fica toda num token só e para de render taxas. Com o
`-alerta`, o bot lê a posição a cada 10 minutos (setting
`defi.alerta.intervalMin`) e avisa **sempre que ela sair da faixa**: uma vez
por saída. Enquanto continua fora, não repete; se voltar para a faixa e sair
de novo, avisa de novo.

```
/defi -alerta 1                        → no seu privado
/defi -a all -send email               → todas, por e-mail (QRCODE_EMAIL_SMTP_TO)
/defi -a 2 -send voce@exemplo.com      → por e-mail, para esse endereço
/defi -a 1 -send /Jorge Pereira/       → no privado do contato
/defi -a 1 -send /Grupo L200/          → no grupo
/defi -a 1 -send +5521999999999        → no privado do número
/defi -alerta                          → a lista dos alertas
/defi -alerta -rm 1                    → desliga o da nº 1 (a posição continua cadastrada)
```

O `-send` aceita:

- `email` (o `QRCODE_EMAIL_SMTP_TO` do `config/.env`) ou um ou mais e-mails
  (separados por vírgula, entre aspas). Sai pelo SMTP do bot, sem a formatação do
  WhatsApp; precisa do `QRCODE_EMAIL_SMTP_HOST` e do `QRCODE_EMAIL_SMTP_USER`.
- Um contato, um grupo ou um número, como no `-to`: o contato é buscado
  primeiro; se o nome servir para mais de um, o bot lista e você responde com
  o nº ([Destinos](index.md#destinos-contato-grupo-ou-número)).

Ligar de novo uma posição troca o destino. Ao ligar, o bot já lê a posição: se
ela estiver fora da faixa nesse momento, a resposta mostra, e o aviso fica para
a próxima saída. Se o RPC não responder, a posição fica `❔ ainda não lida`, e a
primeira leitura fora da faixa já avisa.

```
/defi -alerta 1 -send email
🔔 Alerta do /defi ligado (1)

1. Orca · Hz15…RaPZ · ✅ na faixa

📣 Aviso: 📧 voce@exemplo.com, sempre que a posição sair da faixa (verificada a cada 10 minutos).
💡 Veja com /defi -alerta; desligue com /defi -alerta -rm <nº|all>.
```

O aviso traz o "Position Details" da posição:

```
🚨 DeFi: a posição Hz15…RaPZ saiu da faixa

🌊 Orca · SOL/cbBTC · taxa 0.16%
📍 Hz15…RaPZ · ⚠️ fora da faixa (preço abaixo: a posição não rende taxas)
...

💡 Desligue com /defi -alerta -rm 1.
```

Na lista do `/defi -l`, as posições com alerta aparecem com 🔔. Cada leitura
gasta consultas no RPC da Solana: com o público, prefira um intervalo maior (ou
um [RPC próprio](#rpc-da-solana)).

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
(até 20).
