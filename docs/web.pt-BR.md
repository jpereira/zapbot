# Interface web

O bot pode servir uma **interface web** (desligada por padrão) para ver, e também administrar, o que ele guarda: o
histórico de todas as conversas no estilo do WhatsApp Web (com as mensagens **apagadas** e **editadas** em destaque),
as notas, os alertas, os atalhos, a agenda, gráficos das suas conversas e os settings.

!!! danger "Ela mostra todas as mensagens da sua conta"
    Quem entra lê tudo o que o bot guardou. Use uma senha longa, mantenha a interface em `127.0.0.1` (o padrão) e,
    para abri-la na rede, configure um **proxy reverso com HTTPS** na frente.

Todas as imagens desta página foram feitas com **dados inventados** (os nomes, os números e as mensagens não
existem), no tema escuro, salvo quando disser o contrário. A interface segue o setting `zapbot.lang` (inglês ou
português) e o botão embaixo da barra da esquerda troca o idioma; a página em inglês deste manual tem as mesmas imagens
em inglês.

Use [`/web`](commands/web.md) no seu privado para gerenciar o acesso, as sessões e o 2FA.

## Início rápido

```text
/set zapbot.web.login jorge.admin
/set zapbot.web.password uma-senha-bem-longa-aqui
/set zapbot.web.enabled on
```

Reinicie o bot: a interface sobe junto com ele, em `http://127.0.0.1:3200`. O **login** é o nome que você escolhe (3 a
40 caracteres: letras, dígitos, `.`, `-`, `_` ou `@`) e a **senha** tem no mínimo 8 caracteres; o bot guarda só o
**hash** da senha (scrypt), e o `/set` a mostra escondida. Sem login ou sem senha a interface não sobe (o log diz o
que falta).

![A tela de login: o nome, a senha e, embaixo do "ZapBot", a versão que está rodando](assets/web/pt-BR/login.png)

No `config/.env`, `ZAPBOT_WEB_ENABLED=true` (ou `false`) decide por cima do setting `zapbot.web.enabled`, e
`ZAPBOT_WEB_PORT` e `ZAPBOT_WEB_HOST` por cima da porta e do endereço
([as variáveis](configuration.md#interface-web-opcional)).

No Compose, a porta é publicada no loopback **do servidor Docker**. Para acessar de outro
computador sem abrir a porta na rede, crie um túnel SSH e abra `http://127.0.0.1:3200` no navegador.

```bash
ssh -N -L 3200:127.0.0.1:3200 user@docker-host
```

Depois de editar os arquivos de ambiente, aplique a configuração com
`docker compose -f docker/docker-compose.yml up -d zapbot` na raiz do projeto.

## Login em duas etapas (2FA)

Com o 2FA ligado, o login pede o **código de 6 dígitos** de um app autenticador (Google Authenticator, Authy,
1Password...) além do nome e da senha. O bot cria o segredo, mostra o **QR code** no chat e só liga o 2FA depois que você
**prova que o app funciona** com um código, então um scan que falhou nunca deixa você de fora:

```text
/set zapbot.web.totp new
/set zapbot.web.totp 123456
```

1. Digite `/set zapbot.web.totp new` no **seu privado** (as mensagens com você mesmo). O bot manda uma imagem com o
   **QR code** e, na legenda, o mesmo segredo como texto, em grupos de quatro (`ABCD EFGH ...`). Nada é ligado ainda.
2. No app, **escaneie o QR code**, ou escolha *inserir chave de configuração* e digite esse código.
3. **Confirme**: digite `/set zapbot.web.totp` seguido do código de 6 dígitos que o app mostra agora (`123456` acima).
   Se estiver certo, o bot responde `✅ 2FA ativado`, guarda o segredo e apaga a mensagem do QR code. Se estiver errado,
   ele avisa e você tenta de novo; depois de 5 códigos errados, ou de 10 minutos, o QR code é descartado e tudo
   continua como estava.
4. Abra a interface: o login agora pede o nome, a senha e o código do app. Um código errado conta como senha errada.

![O QR code que o bot manda no chat (este é um exemplo: o segredo dele é inventado)](assets/web/pt-BR/2fa-qr.png)

- Só funciona no **seu próprio privado** e só por você; em qualquer outro lugar o bot recusa e nada é criado. A
  mensagem com o código que você digitou é apagada e fica mascarada no histórico.
- O que o bot envia **nunca é guardado**: nem na tabela de mensagens, nem na pasta de mídia. Ele também **apaga a
  mensagem do QR code depois de 3 minutos** (o WhatsApp a mantém até lá): escaneie logo.
- Com o 2FA já ligado, `/set zapbot.web.totp 123456` só diz se o código está certo, o que serve para testar o app a
  qualquer hora. `/set zapbot.web.totp qr` mostra o QR code e o código de novo; `new` de novo cria outro segredo (o antigo
  continua valendo até o novo ser confirmado); `/set -reset zapbot.web.totp` desliga o 2FA.
- O código depende do relógio do servidor e do celular: uma hora errada faz todo código falhar.

## A mensagem de inicialização

Com a interface ligada, a mensagem que o bot manda para você ao iniciar (`🤖 ZapBot ... iniciado.`) termina com
`🌐 Interface web ativa em http://192.168.1.253:3200`. O endereço é o setting `zapbot.web.url`, ou a variável
`ZAPBOT_WEB_URL`, ou o IP da máquina com a porta. No Docker preencha um dos dois primeiros: o container não sabe o IP
do servidor.

O título da aba do navegador e a tela de login mostram a versão que está rodando
(`ZapBot 1.0.27 (devel) (git+abc1234/HEAD)`), o que ajuda a saber se um deploy chegou ao servidor.

## As seções de relance

Os ícones da esquerda abrem cada parte (no celular eles viram uma barra embaixo):

| Ícone | Seção | Para que serve |
|---|---|---|
| 🏠 | Início | O que o bot guarda: armazenamento, contadores, retenção e os últimos 30 dias |
| 💬 | Histórico | As conversas e suas mensagens, com as apagadas e as editadas marcadas |
| 📝 | Notas | Tudo do [`/notes`](commands/notes.md): tags, notas, imagens, tags protegidas |
| 🔔 | Alertas | Alertas de preço e regras do [`/watch`](commands/watch.md), com seus históricos |
| 👀 | Monitor | Os contatos do [`/monitor`](commands/monitor.md): presença, tempo online, quem ficou online junto e hábitos |
| ⚡ | Atalhos | A lista do [`/alias`](commands/alias.md) |
| ⏰ | Agenda | O que o [`/cron`](commands/cron.md) tem agendado |
| 📊 | Estatísticas | Gráficos dos contadores do [`/stats`](commands/stats.md) |
| 🏴‍☠️ | Show | O que o [`/show`](commands/show.md) guarda (apagadas, editadas, reações, status, canais) e quem está silenciado |
| 🖼️ | Mídias | Toda foto, vídeo, áudio, figurinha e documento guardado, por conversa, tipo e período, com o espaço |
| 🩺 | Saúde | WhatsApp, memória, o event loop, as checagens periódicas, a fila de regex e os últimos erros |
| ⚙️ | Settings | Um painel dos settings da interface web e, depois, todos os outros settings |

Embaixo da barra, os botões trocam o **tema** (automático, claro, escuro) e o **idioma** (inglês ou português; ele
segue o `zapbot.lang` do bot até você escolher outro), e o último sai. O navegador lembra o tema, o idioma e a ordem
das mensagens. Toda lista tem uma caixa **Filtrar** (ela busca nas linhas da tela) e um botão **Atualizar**, com a hora
da última atualização, que recarrega a lista com uma barra de progresso.

## Login e sessão

A página pede o nome e a senha (e, com o `zapbot.web.totp`, o código de 6 dígitos); errar qualquer um dá a mesma
resposta, então ela não diz qual foi. A sessão é um token aleatório num cookie `HttpOnly` + `SameSite=Strict`, guardado
na memória: reiniciar o bot desloga todo mundo. Ela dura `zapbot.web.sessionHours` (12 por padrão). Mais em
[Segurança](#segurança).

Após 30 minutos sem interação, a sessão expira. A busca automática de mensagens não renova o
prazo. Altere com `/web -timeout 15` ou `/set zapbot.web.sessionTimeout 15`. Use `0` para
desativar o limite de inatividade. O limite total de `zapbot.web.sessionHours` continua valendo.

## Início

O que o bot guarda, os mesmos números do [`/cache`](commands/cache.md) e do `/status`: o **armazenamento** (uma barra
colorida e a legenda, com tamanho e número de arquivos: banco, mídia, notas, fotos dos contatos, backups e arquivos
temporários), quantas conversas, mensagens, apagadas, editadas, mudanças de reação, notas, tags e tags protegidas
existem, o intervalo do histórico, a retenção de cada tipo e as conversas com mais mensagens (clique em uma para abri-la).
As mensagens dos contadores são as de verdade: os avisos do WhatsApp não contam.

![Início: o armazenamento como o de um celular, os contadores e as estatísticas dos últimos 30 dias](assets/web/pt-BR/home.png)

O **🧹 Limpar** do armazenamento é o [`/cache`](commands/cache.md) com caixas de marcar: o que passou da retenção
(`-clean`), as mídias (`-media`), os temporários, as fotos dos contatos e os backups (`-backup`), cada um com o seu
tamanho; marque os que quiser. **Tudo** é o `/cache -all` (todas as mensagens, mídias, temporários e backups), com um
aviso em vermelho. As notas nunca entram.

![O 🧹 do armazenamento: cada parte com o seu tamanho, e o tudo com o aviso](assets/web/pt-BR/home-clean.png)

![Início no tema claro](assets/web/pt-BR/home-light.png)

## Histórico

### As conversas

A lista da esquerda vai da conversa mais recente para trás, com a foto, a última mensagem e, num selo vermelho,
quantas mensagens foram apagadas. O nome é o da sua agenda; sem ele, o nome do perfil (pushname); sem ele, o número
(`+5521...`); um grupo mostra o nome dele. A primeira caixa busca um nome ou um número; a segunda busca um texto em
**todas** as conversas, e um clique num resultado abre aquela conversa com a mesma busca.

![A lista de conversas, com as caixas de busca](assets/web/pt-BR/history-chats.png)

A conversa **Status** fica fixada no topo da lista, com uma cor própria.
Em **Status**, cada publicação aparece em um cartão com autor, data e hora no cabeçalho. A mídia
e a legenda ficam abaixo. O histórico usa os dados disponíveis no cache. O bot registra a hora de publicação dos novos status quando
o WhatsApp fornece essa informação.

Em uma conversa individual, clique no nome ou na foto do cabeçalho para abrir os dados do
contato. O painel mostra o telefone, o recado, o selo de verificação e os dados comerciais
disponíveis. Também dá acesso ao último Status salvo do contato, quando houver.

### As mensagens

Todo o histórico que o bot tem no banco: texto, fotos, vídeos, áudios, mensagens de voz, **figurinhas**, documentos,
localizações, emojis e reações. As transcrições que o bot fez dos áudios aparecem embaixo da mensagem.

- **Apagada**: a mensagem fica dentro de um **retângulo vermelho tracejado**, com `🗑️ apagada em <data>` embaixo (a
  mídia, se ainda estiver no cache, também aparece).
- **Editada**: dentro de um **retângulo âmbar** com `✏️ editada` e, embaixo, o **diff** de cada edição: o texto
  *antes* (o que saiu, riscado em vermelho) e *depois* (o que entrou, em verde).
- **Respostas** mostram a mensagem citada acima do texto (a citação é guardada daqui para a frente: as mais antigas não
  têm). **Menções** (`@5521...`) mostram o nome do contato. Uma mensagem cuja **reação** foi trocada ou tirada mostra
  cada mudança embaixo.
- **Mídia**: imagens, vídeos e áudios tocam na página, cada um com um link **Baixar**; um documento é sempre um download.
  Uma mídia que já saiu do cache (`cache.messageMediaRetentionDays`) vem marcada.
- **Mensagens novas** chegam sozinhas a cada `zapbot.web.refreshSeconds` (15 s) quando você está no fim da conversa, e as
  mensagens carregam `zapbot.web.pageSize` por vez.

![Uma conversa: uma resposta, uma reação, uma foto, uma figurinha, uma mensagem apagada e uma editada, com o botão 🧹 no alto](assets/web/pt-BR/history.png)

![A mesma conversa no tema claro](assets/web/pt-BR/history-light.png)

Ao abrir uma conversa, um aviso começa o histórico: `Histórico de Fulano: <primeira mensagem> → <última mensagem>`,
com quantas mensagens, apagadas e editadas há.

A seção **Histórico de reações**, abaixo da mensagem original, mostra quem trocou ou removeu
a reação, os emojis e o horário. Com a atualização automática ligada, as reações das mensagens
visíveis também são atualizadas enquanto você lê mensagens antigas.

### Lendo o histórico

- **Ordem** (a lista da barra de ferramentas): *mais recente primeiro* (o padrão: a mais recente no alto, as mais antigas
  conforme você rola), *mais recente embaixo*, como o WhatsApp (as mais antigas carregam quando você rola para cima), ou
  *mais antiga primeiro*, do começo ao fim.
- **Período**: escolha `De` e `Até` (data e hora) e clique em *Aplicar*, ou use *Hoje*, *7 dias*, *30 dias* e *Tudo*. O
  aviso e o contador embaixo do nome mostram o período que está sendo lido.
- **Buscar nas mensagens**: digite um texto e aperte Enter (ele busca no texto e nas transcrições).
- **Carregar mais**: nas ordens *mais recente primeiro* e *mais antiga primeiro* o fim da página tem um botão *Carregar
  mais*, além da rolagem.

### Selecionar, exportar e limpar

- **Exportar PDF**: o botão da barra de ferramentas faz um PDF da conversa no período da tela (até 5000 mensagens):
  quem disse o quê e quando, as apagadas e as editadas marcadas, com o texto antes e depois de cada edição.
- **Selecionar mensagens**: *Selecionar* deixa você clicar nas mensagens que quer (elas ganham uma marca ●) e *Exportar
  selecionadas* faz um PDF só com elas.
- **Limpar o histórico de uma conversa**: o 🧹 no cabeçalho da conversa apaga as mensagens dela (e a mídia) do cache,
  **menos** as apagadas, as editadas (com o texto de antes) e as que têm reações. A janela diz quantas saem e quantas
  ficam; marcando **Apagar tudo**, essas saem também, com a mídia, as edições e as reações (as ocorrências do `/watch`
  ficam). Nada é apagado antes de você confirmar.
- **Limpar todas as conversas de uma vez**: o 🧹 ao lado de *Conversas*, no alto da lista, é a mesma janela para o
  histórico inteiro, com um aviso em vermelho de que leva todas as conversas (só um [`/backup`](commands/backup.md)
  traz de volta).

![Selecionar ligado: três mensagens marcadas, prontas para exportar](assets/web/pt-BR/history-select.png)

![A janela do 🧹: quantas mensagens saem, quantas ficam, e a opção de apagar tudo](assets/web/pt-BR/history-clear.png)

![O 🧹 de Conversas: a mesma janela para todas as conversas, com o aviso](assets/web/pt-BR/history-flush.png)

### Avisos do WhatsApp

Quando alguém troca de aparelho, o WhatsApp mostra um aviso no chat. O histórico o exibe como uma linha centralizada
(`🔒 o código de segurança de Maria mudou`, com o nome quando o bot sabe quem é; senão `de um participante`), e os
outros avisos do sistema (um evento de grupo, uma chamada) como `ℹ️ ...`. Eles nunca fazem uma conversa aparecer na
lista (um contato só com um código de segurança que mudou não é listado), nunca sobem uma conversa e nunca entram nos
totais. Com `zapbot.web.warnChangedPhone off` as linhas de código de segurança também ficam escondidas dentro das
conversas.

### No celular

A mesma página cabe numa tela estreita: a barra da esquerda vira uma barra embaixo, a lista de conversas e a conversa
se revezam (o botão *Voltar* volta para a lista) e a barra de ferramentas quebra em linhas.

![No celular: a lista de conversas](assets/web/pt-BR/mobile-chats.png)

![No celular: uma conversa](assets/web/pt-BR/mobile-chat.png)

As outras páginas funcionam do mesmo jeito no celular: o Monitor empilha os cards e as linhas do tempo cabem na
largura, e as Mídias mostram três por linha, com **☑️ Selecionar** no lugar do Shift.

![No celular: o Monitor](assets/web/pt-BR/mobile-monitor.png)

![No celular: as Mídias](assets/web/pt-BR/mobile-gallery.png)

Só aparece o que o bot tem no banco: o texto das mensagens comuns fica por `cache.messageRetentionDays` (3 dias por
padrão; até 90), e as apagadas, editadas e com reação pela retenção própria de cada uma
([`/cache`](commands/cache.md), [`/show`](commands/show.md)). Para guardar mais histórico, aumente esses settings.

## Notas

Todo o conteúdo do [`/notes`](commands/notes.md). A lista de **tags** da esquerda tem a descrição e quantas notas cada
uma tem (`Todas as notas` e `(sem tag)` também) e uma caixa para buscar o texto das notas. Um clique numa tag mostra as
notas dela como cartões: a data, o alerta, o texto (a primeira linha é o título, os links são clicáveis) e as
**imagens** (clique para abrir em tamanho grande), com um link **Baixar** para a imagem ou o arquivo. **⬇ PDF** exporta
a tag (ou todas) no mesmo PDF do `/notes -pdf`, com as imagens.

![As notas de uma tag, com uma imagem, e os botões de editar e apagar](assets/web/pt-BR/notes.png)

### Novas tags e notas

- **＋ Nova tag** pede um nome e uma descrição, como o `/notes -desc #tag <texto>`, e cria uma tag que aparece na lista
  mesmo sem notas. Dentro de uma tag, ✏️ muda a descrição (vazia remove) ou o nome (as notas vão junto). O **🗑️**
  remove: uma tag vazia some na hora (pergunta antes); uma com notas abre uma janela que diz quantas
  notas saem, do mesmo jeito que o 🧹 do histórico, e, quando você confirma, apaga todas as notas, a mídia delas, a descrição da tag e o
  cadeado, se ela era protegida — o mesmo que o `/notes -rm #tag -yes` no WhatsApp, e um pouco mais (esse comando
  deixa a descrição e o cadeado para trás; aqui não).
- **📋** duplica a tag: pede o nome novo (tem que estar livre) e copia todas as notas para ela, com o arquivo e a
  descrição, mas sem os alertas (as originais já avisam). A tag original fica como estava. Tag protegida não é
  copiada.
- **↪️** move todas as notas da tag para outra, escolhida na lista de tags (ou um nome novo): se ela já tem notas, as
  duas se juntam, como o `/notes -move #tag #tag2`. A descrição vai junto quando a outra tag não tem.
- **＋ Nova nota** adiciona uma nota na tag, com um alerta numa data e hora se você quiser. Em cada cartão, ✏️ edita o
  texto, a tag e o alerta, 📑 duplica a nota na mesma tag, 📋 copia para outra tag e ↪️ move (os dois escolhem a tag
  na lista, ou aceitam um nome novo). As cópias levam o texto e o arquivo, sem o alerta; mover leva tudo. 🗑️ apaga a
  nota (e o arquivo dela). Copiar ou mover para uma tag protegida, ou tirar de uma, não é feito aqui.

![O formulário de uma nova tag](assets/web/pt-BR/notes-new-tag.png)

![O formulário de uma nova nota](assets/web/pt-BR/notes-new-note.png)

![Movendo uma nota: a tag vem da lista](assets/web/pt-BR/notes-move.png)

### Tags protegidas

Uma tag protegida pelo [`/notes -lock`](commands/notes.md#tags-protegidas--lock) vem **travada** 🔒: sem texto e sem
arquivo, só o cadeado. Digite a senha da tag para ler. A chave fica só na memória, ligada a **aquele login**, e trava de
novo depois de `notes.lockMinutes` sem uso (ou com *Travar agora*, ou ao sair). É um destravar só da página: ele não abre
a tag no chat, e vice-versa. O texto e as imagens são decifrados na memória (nada decifrado é escrito no cache), 5
senhas erradas bloqueiam a tag por 15 minutos e o PDF de uma tag travada fica de fora até você destravar. Uma tag
protegida não pode ser renomeada aqui (o `/notes -move` no WhatsApp faz isso).

![Uma tag protegida, travada até você digitar a senha](assets/web/pt-BR/notes-locked.png)

## Alertas

Duas tabelas: os alertas de preço e as regras do `/watch` (os contatos monitorados têm a própria página,
[Monitor](#monitor)). Cada uma tem **＋ Adicionar** e, em cada linha, ✏️ editar e 🗑️ apagar.

![As duas tabelas da página de Alertas](assets/web/pt-BR/alerts.png)

### Alertas de preço

Os alertas do [`/stocks`](commands/stocks.md) e do [`/crypto`](commands/crypto.md): símbolo, regra (`BTC > 90000`), para
quem avisa e a mensagem. Um preço mantém os centavos (`6.20`). Adicionar ou editar passa pelo mesmo código do comando,
então as checagens são as mesmas: um símbolo que não existe, o preço que não dá para ler e a regra "já atendida" são
recusados com o mesmo texto. Uma edição mantém a data em que o alerta foi criado.

![Editando um alerta: a regra, a mensagem e quem é avisado, com a busca de contatos aberta](assets/web/pt-BR/alerts-edit.png)

![O formulário para adicionar um alerta](assets/web/pt-BR/form-add.png)

### Regras do /watch

As regras do [`/watch`](commands/watch.md) (um texto, ou `/regex/flags`; uma regex inválida ou arriscada é recusada), para
quem cada uma avisa, quantas ocorrências já teve e a data da última. O botão **📜** abre o **histórico da regra**: cada
mensagem que casou, com quando, a conversa, quem disse e o texto.

Um clique na conversa ou no texto de uma ocorrência **abre aquela conversa no Histórico, na mensagem**: ela ganha um
**contorno laranja**, a parte que casou fica **destacada**, e uma linha `🔎 /watch: <regra>` diz qual foi a regra (mais
de uma, se várias casaram). Essas marcas aparecem sempre que você lê aquela conversa, não só quando chega por aqui.

![O histórico de uma regra: cada ocorrência, com a conversa que abre na mensagem](assets/web/pt-BR/alerts-watch-history.png)

![A conversa aberta nas ocorrências: com contorno, a regra e a parte que casou](assets/web/pt-BR/history-watch.png)

**Teste antes de salvar.** O formulário de uma regra testa ela, enquanto você digita, nas **últimas 3000 mensagens
recebidas** (as que o `/watch` teria visto: não as suas, não comandos): com quantas casaria, em quais conversas, e cada
ocorrência com a parte que casou destacada (um clique abre no Histórico). Uma regex inválida ou arriscada mostra o
mesmo erro do comando. Acima, botões inserem as peças de sempre: **/…/i** transforma o texto numa regex (escapada),
`\b`, `a|b`, `\d+`, `.*` e `(?:…)`. Ocorrências demais avisam: cada uma é um aviso.

![Uma regra do /watch testada nas últimas mensagens, com a parte que casou](assets/web/pt-BR/alerts-watch-test.png)

### A coluna alerta e quem é avisado

Tudo que pode ser ligado e desligado tem a **mesma célula, na coluna `alerta`**, e **um clique nela alterna**:

- na tabela do `/watch`, 🔔 é o **aviso da regra** ligado e 🔕 desligado. Desligado, as ocorrências continuam sendo
  guardadas (e o histórico da regra continua crescendo), mas ninguém é avisado;
- nos alertas de preço, ▶️ é um alerta sendo verificado e ⏸️ um pausado (o mesmo que `-alert -pause` / `-resume`);
- na agenda, ▶️ é uma mensagem ativa e ⏸️ uma pausada.

Desligado ou pausado, **a linha inteira fica mais opaca, com o texto riscado** (ela continua funcionando; nada fica
escondido, só mais apagado), então uma olhada na tabela já mostra quais regras, alertas e mensagens não estão fazendo
nada no momento. O próprio botão de sino/play, e os botões 🗑️/✏️/📜 da linha, ficam como são.

Os alertas de preço e as regras do `/watch` têm um **seletor de contatos** no campo *avisa*. Digite parte de um nome (ou
um número) e aparecem os contatos e grupos da sua agenda que combinam; clique para adicionar (pode ser mais de um), ou
digite um e-mail. **👤 Eu** adiciona a sua própria conta. Vazio quer dizer o seu privado. O mesmo seletor escolhe o
contato do [Monitor](#monitor).

## Monitor

Os contatos do [`/monitor`](commands/monitor.md), um card cada, **os online primeiro** e depois os vistos mais
recentemente. Acima deles, o loop: 🟢 verificando, ⏸️ pausado (`monitor.enabled` desligado ou o bot pausado), ⏳
esperando o WhatsApp ou 🚫 `/monitor` desativado, o intervalo (`monitor.pool`), quantas das `monitor.max` vagas estão
em uso e **⏸️ Pausar** / **▶️ Retomar**, que desliga e liga o `monitor.enabled` sem apagar nada. **＋ Adicionar**
escolhe um contato da sua agenda (fica desabilitado com a lista cheia).

Cada card tem:

- a foto com um **ponto de presença**: verde é online, cinza offline e tracejado desconhecido (o contato esconde, ou
  ainda não foi lido);
- *online agora* ou *visto há 40 minutos*, a situação que o monitor leu, quando foi checado e **quando é a próxima
  checagem** (os tempos andam com a página aberta, com a data completa ao passar o mouse);
- **quando costuma aparecer**: a uma ou duas horas com mais leituras (*costuma aparecer por volta das 08h e das 19h*);
- os **últimos 7 dias** numa faixa, um traço para cada vez que foi visto;
- **⏱️ Online**: o tempo online hoje, em 7 dias e por visita, e uma **linha do tempo dos últimos 7 dias** (uma linha
  por dia, 24 h de largura, uma barra para cada vez que ficou online, listrada enquanto ainda está, com uma marca
  vermelha no agora);
- **🔥 Quando aparece**, um mapa de calor dia × hora de todas as leituras (ele lembra quais você abriu);
- o erro da última checagem, se houver.

E os botões: **🔔 / 🔕** liga e desliga o alerta de online, **🔄** checa na próxima rodada do loop (uns 10 s, passando a
espera do `monitor.pool`), **📜** abre cada leitura (com um 🗑️ para remover uma), **💬** abre a conversa com o contato
no Histórico, **✏️** edita o nome e o alerta e **🗑️** para de monitorar (com o histórico). O filtro aparece com mais
de três contatos. A página se recarrega a cada minuto enquanto nenhuma janela está aberta e você não está digitando no
filtro.

O mapa de calor só tem o que o monitor guardou: `monitor.maxRecords` leituras por contato (30 por padrão). Aumente para
ver os hábitos com mais nitidez.

### Tempo online e online juntos

Cada checagem que vê um contato **online** abre uma sessão (ou estica a aberta); a checagem que vê ele **offline**
fecha no *visto por último*, quando ele é depois do começo (mais preciso que a checagem). As sessões ficam 30 dias.
Checagens a cada `monitor.pool` segundos veem só parte: uma visita curta entre duas checagens não aparece, e um contato
que esconde o *online* não tem sessões. Sem checagem por duas rodadas (o monitor pausado, o WhatsApp fora), uma sessão
aberta termina na última checagem em vez de crescer sobre o buraco.

**🤝 Online juntos**, acima dos cards, lista os pares de contatos monitorados que ficaram online **ao mesmo tempo** nos
últimos 7 dias, os de mais tempo primeiro: quanto tempo, quantas vezes, a última, e *🟢 juntos agora* quando os dois
estão online. Um clique num par desenha os dois nos mesmos 7 dias, com **onde se sobrepõem em laranja**. É uma
coincidência de horários, não prova de que conversaram.

**📲 Avisar neste aparelho** (quando o navegador consegue, veja [O app instalável](#o-app-instalável-e-os-avisos-no-aparelho))
liga os avisos do bot neste navegador: um alerta de *online* chega como notificação, mesmo com a página fechada.

![A página do Monitor: online juntos, os cards e a linha do tempo de um](assets/web/pt-BR/monitor.png)

![Os hábitos de um contato: a linha do tempo e o mapa de calor dia × hora](assets/web/pt-BR/monitor-habits.png)

![As leituras de um contato monitorado](assets/web/pt-BR/monitor-history.png)

## Atalhos

A lista do [`/alias`](commands/alias.md): o atalho, o comando, a descrição e as flags (🔇 silencioso e 🔒 só você),
cada uma um botão que inverte na própria lista (🔊 responde normalmente, 🔓 todos podem usar).
Adicionar e editar usam as mesmas checagens do `/alias`: um nome que é comando é recusado e, se uma edição for
recusada, o atalho antigo fica.

![Os atalhos](assets/web/pt-BR/aliases.png)

**▶️ Testar** no formulário: enquanto você digita, cada estágio do comando é **checado** (✅ ok, ❌ não existe, as opções
estão erradas ou não lê um pipe, ⚠️ checado mas não roda aqui), e **▶️ Testar** roda como se você digitasse no seu
privado, mostrando **o que ele responderia** (o texto com as marcas do WhatsApp, uma imagem, um áudio para ouvir), com
**nada enviado**. Só roda o que não muda nada: o que o [`/cron`](commands/cron.md) pode rodar, ou um comando que lê um
pipe (`/tts`, `/translate`, `/qr`...), e nunca com uma opção que o `/cron` recusa (`-alert`, `-rm`...).

![Testando um atalho: os estágios checados e o que ele responderia](assets/web/pt-BR/aliases-test.png)

## Agenda

O que o [`/cron`](commands/cron.md) tem agendado: o tipo (mensagem ou lembrete), quando, a repetição, a conversa, o texto
e o estado ▶️ / ⏸️. No formulário (novo ou existente) a **conversa** se escolhe com o seletor de contatos: uma conversa,
várias (a primeira é a conversa e todas recebem) ou nenhuma (o seu próprio chat). E-mails não são aceitos aqui: uma
mensagem agendada vai para o WhatsApp.

![A agenda: uma mensagem ativa e uma pausada](assets/web/pt-BR/schedule.png)

![Editando uma mensagem agendada: o texto, a data, a repetição e a conversa](assets/web/pt-BR/schedule-edit.png)

**🧪 Testar agora** (em cada linha, e **🧪 Testar** no formulário, com o que está digitado e ainda não salvo) monta a
mensagem **como ela vai sair**: os `{/comandos}` rodam de verdade, como na hora agendada e como na primeira conversa
dela (um `/stats` é o do grupo), e a janela mostra para onde vai, quando, o texto com as marcas do WhatsApp, a mídia e
os comandos que falharam. **Nada é enviado** e a agenda não muda (o mesmo que `/cron -test <nº>`). Um texto que começa
com `/` (`/stocks USD`) sai como texto e não roda (o bot nunca executa o que ele mesmo envia): a janela avisa e mostra
as chaves que fariam rodar (`{/stocks USD}`). **↻ Rodar de novo** monta de novo.

![Testando uma mensagem agendada: o que sai, com o {/comando} rodado](assets/web/pt-BR/schedule-test.png)

## Estatísticas

Gráficos dos contadores do [`/stats`](commands/stats.md) para 7, 30, 90 ou 365 dias. Cartões com mensagens, mídia,
apagadas, edições, dias com conversa, a média por dia, o dia mais movimentado e a hora de pico, cada um com a **variação
em relação ao período anterior** (▲ / ▼); mensagens por dia (texto e mídia empilhados); apagadas e editadas por dia
(linhas); a divisão entre texto e mídia (rosca); mensagens por hora; um **mapa de calor dia da semana x hora** de quando
as conversas esquentam; e o ranking das conversas (clique para abrir uma) e das pessoas. Passe o mouse numa barra ou
célula para ver o número.

![As estatísticas dos últimos 30 dias](assets/web/pt-BR/stats.png)

## Show

O que o [`/show`](commands/show.md) guarda, num lugar só. No alto, os quatro avisos do `/show` no seu privado
(apagadas, editadas, reações, status): clique para ligar ou desligar (o mesmo que o `show.alert.*`). Depois uma aba
por tipo, com a contagem: **apagadas**, **editadas** (antes e depois), **reações** (a antiga → a nova), **status**
apagados e posts de **canais** apagados, os mais recentes primeiro, com busca no texto, na conversa e na pessoa.

Cada item tem a foto (clique: a ficha do contato e, nela, a foto grande), o nome (clique: só os itens daquela pessoa),
a conversa (clique: o Histórico abre naquela mensagem), quando aconteceu e o que foi recuperado (o texto e a mídia;
clique numa imagem para ver grande). O 🔇 silencia a pessoa (o mesmo que o [`/mute`](commands/mute.md), todos os
avisos, sem prazo) e o 🔊 tira o silêncio; o 🗑️ tira o item do cache. Para tirar vários de uma vez, clique nos itens
(Shift+clique marca um intervalo; **Todas**, acima da lista, marca todos) e depois no 🧹. Ao lado, quem mais apaga, edita e reage, com as contagens e o 🔇:
clique numa pessoa para ver só os dela (o box fica destacado; clique de novo para ver todos).

![Show: os avisos, as abas, os itens recuperados e quem mais apaga](assets/web/pt-BR/show.png)

## Mídias

Toda foto, vídeo, áudio (inclusive os de voz), figurinha e documento que o bot guardou, **os mais novos primeiro**, com
o tamanho de cada um. Os chips filtram por **tipo** (cada um com quantos há), os seguintes por **período** (7, 30, 90
dias ou sempre), e o painel à direita lista **as conversas que mais ocupam espaço**: um clique mostra só aquela.

Um clique abre o **visualizador**: a foto ou o vídeo (o áudio toca), a conversa, quem mandou, a data, o tamanho e a
legenda, com **←/→** (as setas do teclado também) para as próximas, **💬 Abrir na conversa** (na mensagem),
**⬇️ Baixar** e **🧹 Liberar este arquivo**. Liberar tira o arquivo do disco; a mensagem fica no histórico, com a mídia
faltando. **☑️ Selecionar** (ou Shift/Ctrl+clique) escolhe várias para liberar de uma vez. As mensagens apagadas têm
moldura vermelha tracejada e um 🗑️. Um documento aparece como uma **folha com a extensão** (PDF vermelho, DOC azul, XLS
verde, PPT laranja, ZIP marrom...), e um arquivo que a limpeza tira em menos de um dia tem um ⏳. Um **vídeo mostra um
quadro dele**, com ▶ e a duração, e uma foto uma cópia pequena (360 px) em vez do arquivo inteiro: os dois são feitos
na primeira vez que aparecem (ffmpeg e sharp, dois de cada vez) e ficam em `cache/tmp/thumbs`. A busca encontra pelo
**nome**, pela **legenda** ou pela **conversa**; no visualizador, **Delete** libera o arquivo.

![As mídias: por tipo, período e conversa, com o espaço de cada uma](assets/web/pt-BR/gallery.png)

**☰ Lista** mostra uma linha por arquivo: o nome, o **tamanho**, o **tipo** (MIME), a data, a conversa e **quando a
limpeza tira** (`cache.messageMediaRetentionDays`; uma mensagem apagada, `cache.revokedRetentionDays`; vermelho com
menos de um dia). Um clique no título de uma coluna ordena por ela (de novo: ao contrário), em todas as páginas, então
*Tamanho ▼* traz os maiores primeiro. O navegador lembra grade ou lista.

![As mídias em lista, as maiores primeiro](assets/web/pt-BR/gallery-list.png)

**🧬 Iguais** agrupa os arquivos de **mesmo conteúdo** (a mesma foto encaminhada para três conversas, o mesmo PDF em
dois grupos): só os de mesmo tamanho são lidos, e o SHA-1 decide. Cada grupo mostra as mensagens que têm o arquivo e
quanto unir libera. **🔗 Unir as cópias** transforma cada cópia num **hard link** da mais antiga: o espaço é liberado e
**toda mensagem continua com a mídia**; a limpeza ainda tira cada uma na sua data (apagar um link não leva os outros).
Uma cópia unida tem um 🔗, e o painel das conversas diz o que os arquivos ocupam de verdade no disco.

![Os arquivos iguais, com o espaço que unir libera](assets/web/pt-BR/gallery-same.png)

![O visualizador: ← → para as próximas, abrir na conversa, baixar ou liberar](assets/web/pt-BR/gallery-viewer.png)

## Saúde

Como o bot está **agora**, atualizada a cada 10 segundos, com um veredito no topo (✅ tudo certo, ⚠️ vale uma olhada,
🚨 algo está errado) e o porquê:

- **WhatsApp**: conectado (desde quando), conectando, fora do ar ou reiniciando, a última queda e as tentativas falhas;
- **o processo**: no ar desde, memória (RSS e o heap do JS), o **atraso do event loop** (p99, média e máximo: acima de
  500 ms o bot demora a responder), a carga e a memória livre do servidor, e a versão;
- **as checagens periódicas** (`/cron`, `/monitor`, os alertas de preço, do `/notes` e do `/defi`): parada ou rodando,
  **travada** (vermelha, depois de 10 minutos), quantas rodadas e quanto durou a última;
- **o worker de regex** do `/watch` e das buscas: quantos esperam e quantos foram respondidos "sem match" (fila cheia
  ou fora do prazo);
- **os últimos 50 erros do log**, já mascarados como o log mostra (um clique abre o texto inteiro).

![Saúde: WhatsApp, o processo, as checagens, a fila de regex e os últimos erros](assets/web/pt-BR/health.png)

## O app instalável e os avisos no aparelho

A página pode ser **instalada como app** (Chrome, Edge, Android: **⬇️ Instalar o app** em Settings → 📲 Este aparelho;
iPhone: Safari → Compartilhar → *Adicionar à Tela de Início*): ícone e janela próprios, e atalhos para o Monitor, as
Notas e o Histórico. Instalada ou não, as notas que você abre **ficam disponíveis sem rede** (uma barra 📴 avisa quando
não há rede); as notas de uma **tag protegida nunca** ficam, nem destrancadas, e tudo que foi guardado é esquecido no
logout.

**📲 Este aparelho** também liga os **avisos do bot neste navegador**, mesmo com a página fechada: um contato monitorado
que ficou online, uma ocorrência do `/watch` (um clique abre a mensagem), um alerta de preço e um acesso à página.
Escolha quais; **Mandar um teste** confere. Cada navegador é uma inscrição; o serviço de push do navegador só
transporta, **cifrado de ponta a ponta** (o Web Push padrão, com as chaves do próprio bot, criadas na primeira vez). Um
navegador que sai é removido sozinho.

Os avisos e o service worker precisam da página em **https** (ou em `localhost`): com o
[Tailscale serve](#do-celular-pela-internet-tailscale) ou um proxy com certificado funciona direto; no `http://<ip>:3200`
puro o painel avisa.

## Settings

No topo, um **painel só da interface web** (os settings `zapbot.web.*`), para você ajustá-la sem procurar numa lista
longa. Abaixo, a tabela com **todos os outros settings**.

### O painel da web

Quatro cartões: **Acesso** (`enabled`, `host`, `port`, `url`, `trustProxy`), **Login e sessão** (`login`, `password`,
`totp`, `sessionHours`, `sessionTimeout`), **Tela** (`pageSize`, `refreshSeconds`) e **Avisos** (`warnAccess`, `warnChangedPhone`). Ao lado
do título, o endereço para abrir a interface.

- um **interruptor** para os settings liga/desliga e uma caixa para números e texto: ela salva quando você sai da
  caixa, com um `✔ salvo` (ou o erro das mesmas checagens do `/set`);
- ↺ volta ao padrão de um setting que foi mudado;
- ⟳ marca o que só vale quando o bot reinicia (`enabled`, `host`, `port`);
- 🔒 marca o que só o `/set` no WhatsApp muda: o login, a senha (mostrada como `••••••••`) e o segredo do TOTP;
- 🔧 marca um setting que uma variável do `config/.env` decide (`ZAPBOT_WEB_ENABLED`, `ZAPBOT_WEB_HOST`,
  `ZAPBOT_WEB_PORT`): ele mostra a variável e o valor dela, só para leitura, porque a variável vence o setting.

![O painel da web: interruptores, caixas, os cadeados e o 🔧 do setting decidido por uma variável](assets/web/pt-BR/settings.png)

### Os outros settings

Todo outro setting com o valor, o padrão e o que faz. ✏️ edita (a mesma validação do `/set`: um valor errado é recusado
com o mesmo texto) e ↺ volta ao padrão. Os secretos (chaves, senhas, hashes) aparecem escondidos, e o `bot.login` não
muda aqui.

![A tabela com os outros settings](assets/web/pt-BR/settings-table.png)

## Botões e ícones

| Ícone | Onde | O que faz |
|---|---|---|
| ＋ | o título de uma lista | Adiciona uma linha (abre um formulário) |
| ✏️ | cada linha | Edita, com as mesmas checagens do comando |
| 🗑️ | cada linha | Apaga (pergunta antes); nos Settings, ↺ volta ao padrão |
| 📜 | linhas do `/watch` e cards do Monitor | Abre o histórico da regra ou do contato |
| 🔔 / 🔕 | a coluna `alerta` e os cards do Monitor | Ligado / desligado; um clique alterna |
| 🔄 | os cards do Monitor | Checa o contato na próxima rodada do loop |
| ▶️ Testar | o formulário de atalho | Roda o comando e mostra o que ele responderia, sem enviar |
| 🧪 | a agenda | Monta a mensagem como vai sair, com os {/comandos} rodados, sem enviar |
| ☑️ | as Mídias | Escolhe vários arquivos (no celular, onde não há Shift) |
| 📲 | o Monitor e os Settings | Liga e desliga os avisos neste aparelho |
| ▶️ / ⏸️ | a agenda | Ativo / pausado; um clique alterna |
| 🧹 | o cabeçalho de uma conversa | Limpa o histórico, mantendo as mensagens apagadas, editadas e com reação |
| 👤 | o seletor de contatos | Um contato ou um grupo; *Eu* é a sua própria conta |
| 🔒 | tags e settings | Tag protegida; setting que só o `/set` muda |
| 🔧 | o painel da web | Um setting que uma variável de ambiente decide |
| ⟳ | o painel da web | Só vale quando o bot reinicia |

## Segurança

- **Só com a senha**: toda requisição, menos a página e o login, precisa da sessão. A sessão é um token aleatório num
  cookie `HttpOnly` + `SameSite=Strict`, guardado na memória, e dura `zapbot.web.sessionHours`.
- **5 senhas erradas bloqueiam o endereço por 15 minutos**, e toda falha e todo login ficam no log com o nome de login
  que foi tentado (nunca a senha).
- **Você é avisado no WhatsApp**: uma senha errada (do login ou de uma tag protegida) manda `⚠️ ZapBot-Web: senha errada
  vinda de <endereço> (tentativa 2 de 5)` para o chat com você mesmo, e o bloqueio manda `🚫 ZapBot-Web: ... está
  bloqueado por 15 minutos`. Uma rajada do mesmo endereço em 15 segundos vira um aviso só. A senha digitada nunca vai
  no aviso.
- **Abrir a página também avisa**: quando alguém que não está logado abre o endereço da interface, você recebe
  `⚠️ ZapBot-Web: alguém abriu a página de login a partir de <endereço>` com os primeiros 100 caracteres do nome do
  navegador. Os limites contra enxurrada: **um aviso por endereço a cada 10 minutos** (as outras visitas são contadas e
  ditas no próximo) e **no máximo 5 avisos em 10 minutos** de qualquer endereço (o resto só é contado). Só a página
  conta, não os arquivos nem a API, e um navegador já logado não avisa. Desligue com `zapbot.web.warnAccess off`.
- **As mudanças são só as que você vê**: a página muda atalhos, alertas, regras do `/watch`, contatos monitorados, a
  agenda, notas e settings, e libera arquivos de mídia, sempre pelo mesmo código dos comandos, e **nunca** o login, a senha e o segredo do TOTP
  (só o `/set` no WhatsApp). Ela não manda mensagens para outras pessoas. Toda mudança fica no log, sem os valores. Os
  POSTs só aceitam JSON.
- **Página isolada**: sem script inline (CSP estrita), `nosniff`, sem enquadramento, e a mídia é servida com uma CSP
  `sandbox`: um HTML guardado nunca roda, ele baixa. A mídia só vem da pasta do cache (um caminho fora dela nunca é
  servido).
- **Segundo fator (opcional)**: com o `zapbot.web.totp` preenchido, o login pede também o código de 6 dígitos de um app
  autenticador. O `/set zapbot.web.totp new` cria o segredo e mostra o QR code no seu privado, e o 2FA só liga quando você digita o código do app (veja
  [Login em duas etapas (2FA)](#login-em-duas-etapas-2fa)). Um código errado conta como senha errada.
- **Atrás de um proxy**, ligue `zapbot.web.trustProxy` e configure `ZAPBOT_WEB_TRUSTED_PROXIES`
  com os IPs dos proxies que se conectam diretamente ao ZapBot, separados por vírgula. No Docker,
  use os endereços vistos de dentro do contêiner. Configure o proxy para substituir
  `X-Forwarded-For` ou acrescentar o IP do cliente ao final, e para sobrescrever
  `X-Forwarded-Proto`. O ZapBot usa o último endereço para contar as tentativas de login e
  adiciona `Secure` ao cookie quando o proxy informa `https`.
- **Os avisos push** são cifrados para cada navegador (RFC 8291) e assinados com as chaves do bot (VAPID): o serviço de
  push do navegador não consegue ler. **Sem rede**, só as notas que o servidor marca como seguras ficam no navegador
  (nunca uma tag protegida) e o logout esquece.
- **Os testes não rodam nada que muda alguma coisa**: o ▶️ de um atalho só roda o que o `/cron` poderia (sem `-alert`,
  `-rm`...) e as respostas são guardadas, nunca enviadas; o teste de uma regra do `/watch` só lê as últimas mensagens.
- **Notas protegidas** abrem na página só com a senha da tag, na memória, e o que é decifrado nunca é escrito no cache.
  **O que o bot envia nos chats com uma nota decifrada nunca é guardado** no banco (o `notes.lockPrivateOnly` diz onde
  as notas abrem no WhatsApp).

## Referência dos settings

| Setting | Padrão | O que faz |
|---|---|---|
| `zapbot.web.enabled` | `off` | Liga a interface (vale depois de reiniciar) |
| `zapbot.web.login` | *(vazio)* | O nome de login que você escolhe (3 a 40 caracteres). Vazio: ela não sobe |
| `zapbot.web.password` | *(vazio)* | A senha; o bot guarda o hash dela. Vazia: ela não sobe |
| `zapbot.web.host` | `127.0.0.1` | Endereço em que ela escuta |
| `zapbot.web.port` | `3200` | Porta |
| `zapbot.web.url` | *(vazio)* | O endereço pelo qual você a abre, mostrado na mensagem de inicialização |
| `zapbot.web.sessionHours` | `12` | Quanto tempo um login dura |
| `zapbot.web.pageSize` | `100` | Mensagens carregadas por vez |
| `zapbot.web.refreshSeconds` | `15` | De quanto em quanto tempo busca mensagens novas (`0`: nunca) |
| `zapbot.web.sessionTimeout` | `30` | Minutos de inatividade antes de sair (`0` desliga) |
| `zapbot.web.totp` | *(vazio)* | Segredo em base32 do código de 6 dígitos pedido além da senha |
| `zapbot.web.trustProxy` | `off` | Lê cabeçalhos dos proxies listados em `ZAPBOT_WEB_TRUSTED_PROXIES` |
| `zapbot.web.warnAccess` | `on` | Avisa (⚠️) quando alguém abre a página de login sem estar logado (limites acima) |
| `zapbot.web.warnChangedPhone` | `on` | Mostra, dentro das conversas, os avisos de que o código de segurança de alguém mudou |

## Docker e variáveis de ambiente

No Docker a imagem já expõe a porta `3200` e escuta em todas as interfaces dentro do container
(`ZAPBOT_WEB_HOST=0.0.0.0`); o `docker/docker-compose.yml` a publica só no `127.0.0.1` do **host**
(`127.0.0.1:3200:3200`). Para alcançá-la de outra máquina, use um túnel SSH (`ssh -L 3200:127.0.0.1:3200 host`), um
proxy reverso com HTTPS na frente ou, sabendo do risco, `ZAPBOT_WEB_BIND=0.0.0.0` no `docker/.env` (que não vai para o
git). Sem isso, `http://<ip-do-servidor>:3200` não responde: a porta está só no `127.0.0.1` do próprio servidor.

| Variável | Onde | O que faz |
|---|---|---|
| `ZAPBOT_WEB_ENABLED` | `config/.env` | `true` / `false`: liga ou desliga a interface, por cima do `zapbot.web.enabled` |
| `ZAPBOT_WEB_URL` | `config/.env` ou `docker/.env` | O endereço mostrado na mensagem de inicialização (o setting `zapbot.web.url` vence) |
| `ZAPBOT_WEB_HOST` | `config/.env` | O endereço em que escuta, por cima do `zapbot.web.host` (a imagem define `0.0.0.0`) |
| `ZAPBOT_WEB_PORT` | `docker/.env` | A porta, por cima do `zapbot.web.port`; no Compose a porta publicada acompanha |
| `ZAPBOT_WEB_BIND` | `docker/.env` | Só no Compose: onde o host publica a porta (`127.0.0.1` por padrão) |

Depois de mudar uma delas, rode o deploy de novo: as variáveis são lidas quando o bot inicia.

## Do celular, pela internet (Tailscale)

Você tá na rua, no 4G, e bateu aquela vontade de ver quem apagou mensagem no grupo da família 👀.
Só que o ZapBot tá lá no Docker do servidor de casa, e o web dele só escuta no `127.0.0.1` (de
propósito: ninguém de fora chega nele). E abrir porta no roteador pra internet inteira? Nem pensar.

A saída bacana é o [Tailscale](https://tailscale.com/download): uma VPN que liga os seus aparelhos como se estivessem todos
na mesma rede de casa. É grátis pra uso pessoal, não precisa abrir porta nenhuma, funciona até com
CGNAT da operadora e só os aparelhos logados na **sua** conta enxergam o bot. Em uns 10 minutos tá
pronto:

1. **Instale no servidor** (onde roda o Docker ou o `npm start`). Roda em tudo:
   - 🐧 **Linux:** `curl -fsSL https://tailscale.com/install.sh | sh` e `sudo tailscale up` (ele
     te dá um link pra logar).
   - 🍎 **macOS:** `brew install --cask tailscale-app` (ou pela App Store) e loga pelo ícone da
     barra de menu.
   - 🪟 **Windows:** `winget install Tailscale.Tailscale` (ou o instalador de
     [tailscale.com/download](https://tailscale.com/download)) e loga pelo ícone perto do relógio.
2. **Publique o web só pra VPN, já com HTTPS:**

   ```bash
   sudo tailscale serve --bg 3200    # no Windows, sem sudo, num terminal de administrador
   tailscale serve status            # mostra o endereço: https://<máquina>.<sua-rede>.ts.net
   ```

   O `serve` repassa pro `127.0.0.1:3200` do próprio servidor, então nada de mexer no
   `ZAPBOT_WEB_BIND` nem no compose. Na primeira vez ele pede pra ligar o HTTPS na conta: abre o
   link e confirma. No macOS, se o comando `tailscale` não existir, instale o CLI pelas
   configurações do app.
3. **Instale no celular:** app Tailscale no [iPhone](https://tailscale.com/docs/install/ios) ou no [Android](https://tailscale.com/docs/install/android), loga com a
   mesma conta e liga a VPN. Se preferir ver alguém fazendo, o vídeo oficial
   [How to get started with Tailscale](https://www.youtube.com/watch?v=sPdvyR7bLqI) (em inglês, uns 10 minutos) mostra tudo.
4. **Abra** o `https://...ts.net` no navegador do celular e entre com o login do web. Pra mensagem
   de início já mostrar esse endereço: `/set zapbot.web.url https://<máquina>.<sua-rede>.ts.net`.

Pronto: o bot no bolso, sem expor nada. Uns cuidados:

- **Não use o `tailscale funnel`**: ele abre o web pra internet inteira, justamente o que a gente
  quer evitar.
- O login, a senha e o 2FA do web continuam valendo: o Tailscale só decide quem chega na porta.
- Pelo `serve`, todo acesso chega do endereço do próprio servidor, e é ele que aparece nos avisos e
  no bloqueio de 5 senhas erradas (veja *Atrás de um proxy* em [Segurança](#segurança)).
- Cansou? `sudo tailscale serve --https=443 off` (ou `tailscale serve reset`) desliga.

## Dúvidas e problemas

| O problema | O que conferir |
|---|---|
| A página não abre | O `zapbot.web.enabled`, o login e a senha precisam estar definidos (`/set`) e o bot reiniciado. O log diz o que falta |
| Abre no servidor, mas não de outra máquina | Por padrão ela só escuta em `127.0.0.1`; veja o Docker acima (`ZAPBOT_WEB_BIND`, um túnel ou um proxy); do celular, [Tailscale](#do-celular-pela-internet-tailscale) |
| `ZAPBOT_WEB_ENABLED=true` não fez nada | A variável precisa chegar ao container (o compose lê o `config/.env`) e o bot precisa ser reimplantado; a página de Settings mostra 🔧 quando ela está sendo usada |
| *Bloqueado por 15 minutos* | 5 senhas erradas daquele endereço. Espere, ou reinicie o bot (os bloqueios ficam na memória) |
| O histórico de uma conversa é curto | Só aparece o que está no banco; veja os settings de retenção no [`/cache`](commands/cache.md) |
| Um contato não aparece na lista de conversas | Conversas só com avisos do WhatsApp (um código de segurança que mudou) não são listadas |
| Os números do Início são menores que os avisos que eu vejo | Os contadores contam mensagens de verdade; os avisos do sistema não contam |
| O seletor não acha o contato | Ele busca na agenda e nos grupos do WhatsApp conectado; digite pelo menos 2 letras ou um número completo |
