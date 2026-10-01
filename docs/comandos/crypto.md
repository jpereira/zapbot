# `/crypto` (`/bitcoio`, `/creptomoeda`)

Preço atual e variação de 24 h das moedas ativadas (via API da Binance, par
`<TOKEN>USDT`). Por padrão: BTC, ETH, SOL e HYPE.

| Opção | Valor | Descrição |
|---|---|---|
| *(nenhuma)* | | Exibe as cotações |
| `-list`, `-l` | | Lista as moedas suportadas; as ativadas vêm marcadas com `*` |
| `-add`, `-a` | `<TOKEN>` | Ativa uma moeda suportada (só o dono do bot) |
| `-del`, `-d` | `<TOKEN>` | Desativa uma moeda (só o dono do bot) |
| `-alerta` | `[regra]` | Sem regra, lista os alertas; com regra (ex.: `BTC < 90000`), cria um. Veja [Alertas de preço](cotacao.md#alertas-de-preço) |
| `-rm` | `<nº\|all>` | Junto com `-alerta`: remove o alerta nº N (ou todos) |
| `-to` | `<destino>` | Junto com `-alerta`: avisa num contato (`/Jorge Pereira/`), num grupo (`/Grupo L200/`) ou num número (`+5521999999999`) em vez do seu privado. Veja [Avisar outra pessoa ou um grupo](cotacao.md#avisar-outra-pessoa-ou-um-grupo) |

Suportadas: BTC, ETH, SOL, HYPE, BNB, XRP, DOGE, ADA, TRX, AVAX, LINK, DOT, LTC,
TON, SUI, PEPE, SHIB, XLM, NEAR e UNI (lista `CRYPTO_SUPPORTED` em `src/moedas.js`).

As moedas ativadas ficam na tabela `settings`, chave `crypto.coins`, e
sobrevivem a reinícios.

```
/creptomoeda
/crypto -l
/crypto -a doge
/crypto -d hype
/crypto -alerta ETH > 4000
/crypto -alerta BTC < 90000 -to /Grupo L200/
```
