# Gravar a demonstração

Roteiro para gravar o bot funcionando de verdade, com comandos reais, em cenas curtas. Cada cena
tem as mensagens prontas para colar no chat do bot. Os GIFs prontos estão na
[Demonstração](demonstracao.md).

## Antes de gravar

- Use um chat só para a gravação (o seu privado com o bot ou um grupo de teste) e feche as outras
  conversas da lateral do WhatsApp.
- Os comandos são do dono: grave na sua conta (veja o [`/whois`](comandos/whois.md)).
- O `-mask` esconde telefones no `/block`, `/bot`, `/profile`, `/search`, `/show` e `/watch`, e as
  carteiras no `/defi`. Use sempre que o comando aceitar.
- **Sem `-mask`:** `/monitor`, `/join -l`, `/leave -l` e `/stats` mostram nomes de contatos e
  grupos. Grave num chat de teste e borre ou corte essas cenas se houver dado seu.
- Troque os links, nomes e números dos exemplos pelos seus (ou por dados de teste).
- Aumente a fonte da janela do WhatsApp (`Cmd +`) para a legenda ficar legível no GIF.

## Gravando

Grave só a área da janela do WhatsApp. O app não expõe o ID da janela ao AppleScript, então pegue
a posição e o tamanho pelo System Events (o macOS pode pedir permissão de Acessibilidade ao
terminal) e passe ao `screencapture -R`:

```bash
osascript -e 'tell application "System Events" to tell process "WhatsApp" to get {position, size} of window 1'
# 421, 34, 1307, 1083  →  x, y, largura, altura
screencapture -v -R421,34,1307,1083 cena-01.mov   # Ctrl+C encerra
```

Para pegar só a conversa, some a largura da lista de contatos ao `x` e tire o mesmo valor da
largura. Para converter em GIF (ou MP4 leve), use o
[`scripts/gif.sh`](https://github.com/jpereira/zapbot/blob/main/scripts/gif.sh):

```bash
scripts/gif.sh cena-01.mov            # gera cena-01.gif (720 px de largura, 12 fps)
scripts/gif.sh cena-01.mov 560 10     # largura e fps
scripts/gif.sh cena-01.mov 560 10 33  # corta 33% da esquerda (a lista de contatos)
```

O 4º argumento corta a faixa da esquerda para ficar só a conversa com o bot. Ajuste a porcentagem
até a lista sumir (a largura dela varia com o tamanho da janela) e confira o GIF antes de
publicar. O mais seguro é nem gravar a lista: use `-R` só na área da conversa.

Dica: uma cena por arquivo. Espere a resposta chegar antes de mandar o próximo comando.

## Sequência

### 1. Aquecimento

```text
/ping
/version
/help
/help get
```

### 2. Recuperar o que foi apagado: `/show`

Peça para alguém (ou para outra conta sua) mandar uma mensagem e apagar, depois:

```text
/show -mask
/show -3 -mask
/show -2 -e -mask
/show -s -mask
```

### 3. Quem está online: `/monitor`

```text
/monitor
/monitor -add /Fulano/ -alerta
/monitor
```

Sem `-mask`: use um contato de teste.

### 4. Entrar e sair de grupos: `/join` e `/leave`

```text
/join -info https://chat.whatsapp.com/<codigo-de-um-grupo-de-teste>
/join https://chat.whatsapp.com/<codigo-de-um-grupo-de-teste>
/join -l
/leave -l
/leave 1
```

Sem `-mask`: o `-l` lista os seus grupos. Faça a cena com poucos grupos, só os de teste.

### 5. Figurinhas: `/sticker`

```text
/sticker -txt "Bom dia!"
/sticker -txt "Partiu praia?" -bg "#2980B9" -fg "#FFFFFF"
```

Depois, responda uma foto sua com os comandos abaixo (ou mande a foto com o `/sticker` como
legenda):

```text
/sticker
/sticker -pos topo
```

### 6. Baixar vídeos: `/get`

```text
/get https://www.instagram.com/reel/<codigo>/
/get -a https://youtu.be/<id>
/get -sticker -ss 3 -es 6 https://youtu.be/<id>
```

### 7. Cotações: `/crypto`

```text
/crypto
/crypto btc eth
/crypto -l
```

### 8. DeFi: `/defi`

Sempre com `-mask` (esconde saldos e carteiras):

```text
/defi -mask
/defi -taxas -mask
/defi -taxas -alerta -mask
```

### 9. Agendar mensagens: `/cron`

```text
/cron 1m Oi do futuro!
/cron
/cron -r diario 8h Bom dia!
/cron
```

Veja as opções (`-to`, `-repetir`, remover) no [`/cron`](comandos/cron.md).

### 10. Vigiar mensagens: `/watch`

```text
/watch /pix/i -in /Fulano/ -mask
/watch -mask
/watch -10 -mask
```

Mande um "pix" da outra conta e mostre o aviso chegando no privado.

### 11. Estatísticas: `/stats`

```text
/stats
/stats -30
/stats -me
/stats -l
```

Sem `-mask`: numa gravação pública, escolha um grupo de teste.

### 12. Fechando: `/batch` e `/alias`

Um atalho que roda vários comandos de uma vez:

```text
/alias demo -desc "Mostra o bot em ação" /ping
/demo
/batch /uptime
/crypto btc
```

## Refazendo os GIFs

Os GIFs ficam em `docs/assets/demo/`. Os `.mov` não vão para o git (estão no `.gitignore`). Para gerar de novo, a partir da gravação:

```bash
scripts/gif.sh docs/assets/demo/05-sticker.mov 900 15
```

Os GIFs de hoje usam `900 15`. Para um arquivo menor, baixe a largura ou o fps (o `/get`, o maior, é o que mais pesa).
