# `/crypto`

Preço atual e variação de 24 h das moedas ativadas (via API da Binance, par `<TOKEN>USDT`), ou só
das pedidas. Por padrão: BTC, ETH, SOL e HYPE.

| Opção | Valor | Descrição |
| `-tts` | | Fala a resposta em um áudio, com a voz padrão do [`/tts`](tts.md) (o mesmo que `/tts -q {/crypto -q ...}`). Valem os settings `tts.*` |
|---|---|---|
| *(nenhuma)* | `[TOKEN...]` | Cotação das ativadas, ou só das moedas informadas (ativadas ou não), na ordem pedida. Uma que não é suportada: avisa e lista as suportadas |
| `-list`, `-l` | | Lista as moedas suportadas; as ativadas vêm marcadas com `*` |
| `-quiet`, `-q` | | Só os preços, uma linha por moeda, sem cabeçalho, sem detalhes e sem rodapé. Bom para um texto (`{/crypto -q}`) ou para o [`/tts`](tts.md#comandos-no-texto) |
| `-add`, `-a` | `<TOKEN>` | Ativa uma moeda suportada (só o dono do bot ou um [admin](bot.md#admins-extras)) |
| `-del`, `-d` | `<TOKEN>` | Desativa uma moeda (só o dono do bot ou um [admin](bot.md#admins-extras)) |
| `-alert` | `[regra]` | Sem regra, lista os alertas; com regra (ex.: `BTC < 90000`), cria um (só o dono do bot ou um [admin](bot.md#admins-extras)). A moeda também pode vir antes: `/crypto BTC -alert < 90000`. Veja [Alertas de preço](stocks.md#alertas-de-preço) |
| `-msg`, `-m` | `<texto>` | Junto com `-alert`: o texto vai no início do aviso. Vai até o fim do comando. Veja [Mensagem no aviso](stocks.md#mensagem-no-aviso) |
| `-rm` | `<nº...\|all>` | Junto com `-alert`: remove os alertas com esses nºs (`-rm 2`, `-rm 1 2 3` ou `-rm 1,2,3`), ou todos (`all`). Se algum nº não existe, nenhum sai |
| `-to` | `<destino>` | Junto com `-alert`: avisa num contato (`/Jorge Pereira/`), numa menção (`@Fulano Da Silva`), num grupo (`/Grupo L200/`), num número (`+5521999999999`) ou por e-mail (`email`) em vez do seu privado. Repita para vários: um alerta só, que avisa em todos. Veja [Avisar em outro chat ou por e-mail](stocks.md#avisar-em-outro-chat-ou-por-e-mail) |

Suportadas: BTC, ETH, SOL, HYPE, BNB, XRP, DOGE, ADA, TRX, AVAX, LINK, DOT, LTC, TON, SUI, PEPE,
SHIB, XLM, NEAR, UNI e **XAUT** (Tether Gold: um token que acompanha o preço do ouro; lista `CRYPTO_SUPPORTED` em
`src/currencies.js`). Para **ações** (MSTR, NVDA...) use o [`/stocks`](stocks.md).

As moedas ativadas ficam na tabela `settings`, chave `crypto.coins`, e sobrevivem a reinícios.

![Demonstração do /crypto](../assets/demo/07-crypto.gif)

Só os preços (`-q`):

```text
/crypto -q
BTC $90,123.45
ETH $3,100.20
SOL $145.10
```

## Atalho para as moedas que você confere

Para a moeda que você olha todo dia, um alias poupa a digitação: `/alias -q /btc /crypto BTC` e daí em diante o `/btc`
traz só a cotação (`/eth`, `/sol`, `/xaut` para o ouro...). Mais em
[Atalhos para cotações](alias.md#atalhos-para-cotações).

```text
/alias -q /btc /crypto BTC
/alias -q /xaut /crypto XAUT
/btc                           → o bitcoin, em dólar e em reais
/xaut                          → o ouro
```

## Em reais

Além do dólar, cada moeda vem com o preço **em reais** (a linha 🇧🇷). Para as que a Binance negocia direto contra o
real (BTC, ETH, SOL, BNB, XRP, DOGE, ADA, AVAX, LINK, LTC, SUI, PEPE, SHIB e NEAR) é o par `<TOKEN>BRL`; para as
outras (HYPE, TRX, DOT, TON, XLM, UNI e XAUT) é o preço em dólar vezes o `USDTBRL`. O bot confere na Binance (a cada
6 horas) quais pares estão mesmo negociando: um par pausado, como o `DOTBRL`, continua devolvendo um preço congelado,
então ele também sai pelo dólar. Se não der para buscar os reais, o
dólar sai sozinho. Para desligar: `/set crypto.brl off`.

```text
/crypto BTC          → o bitcoin em dólar e em reais
/crypto BTC ETH XAUT → bitcoin, ether e ouro, cada um em dólar e em reais
/set crypto.brl off  → volta a só dólar
```

Exemplo de resposta (`/crypto`): preço em dólar, variação em 24 h, **preço em reais** (🇧🇷), máxima, mínima e volume de
cada moeda, num bloco monoespaçado, e a que mais subiu:

```text
🚀 CRYPTO MARKET
₿ BTC
    💰 $64,820.55  🟢 +1.04%
    🇧🇷 R$ 374.675,80
    📈 $65,870.10
    📉 $63,512.00
    📊 $1.52B

Ξ ETH
    💰 $1,812.40   🟢 +1.42%
    🇧🇷 R$ 10.475,90
    📈 $1,838.20
    📉 $1,765.95
    📊 $648.10M

◎ SOL
    💰 $71.95      🟢 +2.15%
    🇧🇷 R$ 415,87
    📈 $73.00
    📉 $69.10
    📊 $281.45M

Ⓗ HYPE
    💰 $66.20      🔴 -0.85%
    🇧🇷 R$ 382,64
    📈 $68.90
    📉 $64.30
    📊 $35.02M

🔥 Top: ◎ SOL
🟡 Binance
⚡ Live Market Data
```

```text
/crypto              → as ativadas (padrão: BTC, ETH, SOL e HYPE)
/crypto BTC          → só o bitcoin
/crypto btc eth      → bitcoin e ether (também "BTC,ETH")
/crypto doge         → uma suportada, mesmo sem estar ativada
/crypto XAUT         → o ouro (Tether Gold, em dólar por onça troy)
/crypto -a XAUT      → ativa no /crypto puro
/crypto -alert XAUT > 4000   → avisa quando o ouro passar de US$ 4.000
/crypto FOO          → ❌ Moeda não suportada: FOO, com a lista das suportadas
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
/crypto -alert BTC > 120000 -to eu -to /Grupo L200/
/crypto BTC -alert > 90000 -to /Jorge Pereira/ -msg Hora de vender!
/crypto -alert -rm 1 2 3
```

Cada `-to` é um destino. Sem `-to` o aviso vai para o seu privado; para ter o seu privado **e** outros, acrescente
`-to eu` (ou `-to me`): é a sua própria conta, então não precisa digitar o seu contato. Vale igual em todo comando
com `-to` (`/stocks`, `/watch`, `/cron`, `/notes`...) e no seletor de contatos da interface web (`👤 Eu`). Um contato
com exatamente esse nome se alcança pelo número.
