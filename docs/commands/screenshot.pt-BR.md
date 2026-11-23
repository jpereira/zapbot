# `/screenshot` `/ss` · admin

Role `admin`: só você e os admins extras. O dono libera a uma pessoa ou grupo com
`/bot +u +cmd /screenshot` ([Delegando](index.md#delegando-um-comando-admin)). Ele abre páginas a partir do
**seu servidor**, então não é para todo mundo por padrão.

Abre uma página no navegador do próprio bot (o Chromium que já roda o WhatsApp Web) e manda uma **imagem
dela**, com o título da página e o endereço final (depois dos redirecionamentos) na legenda. Como no
`/contacts` e no `/draw`, um aviso `⏳` sai primeiro e vira `🖼️ Captura abaixo.` quando a imagem fica pronta.

```text
/screenshot [-full] [-mobile] [-wait <segundos>] [-pdf] <url>
```

| Opção | Valor | Descrição |
|---|---|---|
| *(nenhuma)* | `[<url>]` | O endereço da página, com ou sem `http(s)://` (sem ele, o primeiro link da mensagem respondida) |
| `-full`, `-f` | | A página inteira em vez da primeira tela (até 16000 px de altura) |
| `-mobile`, `-m` | | Tela do tamanho de um celular (390 x 844), para o site mostrar a versão mobile |
| `-wait`, `-w` | `<segundos>` | Espera N segundos depois que a página carrega (0 a 30), para animações e conteúdo que chega tarde |
| `-pdf`, `-p` | | Manda um PDF da página em vez de uma imagem |

```text
/screenshot https://example.com
/ss -full -mobile example.com
/ss -pdf -wait 5 https://example.com/relatorio
/screenshot                          → respondendo uma mensagem com um link
```

## Segurança

- Só páginas **públicas** `http` e `https`. Endereços da rede local (`localhost`, `192.168.x.x`,
  `169.254.x.x`...) são recusados, e também **tudo que a página pedir** de lá (imagens, scripts, frames,
  redirecionamentos): uma página não consegue usar o bot para alcançar o seu homelab.
- Cada captura roda num **contexto de navegador isolado**: sem cookies, cache ou armazenamento
  compartilhados com o WhatsApp Web ou com outras capturas.
- Uma captura por vez; se passar do `screenshot.timeout`, termina com erro.

## User-Agent

O navegador mantém o User-Agent do Chromium **sem o "Headless"** e adiciona
`zapbot.client.userAgent`, a identificação compartilhada com as outras chamadas externas do bot. A espera
pela página é o `screenshot.timeout` (30 segundos por padrão).
