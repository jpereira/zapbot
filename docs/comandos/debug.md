# `/debug` (`/d`, `/dbg`) · admin

Controla os logs de diagnóstico no console, com níveis cumulativos, filtro por regex
e cópia para um chat do WhatsApp. As configurações ficam salvas nos settings e sobrevivem
a reinícios. No primeiro boot, o debug começa ligado só com `APP_ENV=dev`, no nível `0`.

| Opção | Descrição |
|---|---|
| `-on` | Ativa o debug |
| `-off` | Desativa o debug e limpa o filtro e a cópia; mantém o nível |
| `-level`, `-lvl` | Define o nível `N` de `0` a `3`; exige debug ligado ou `-on` no mesmo comando |
| `-filter`, `-f` | Exibe e copia somente os logs que casam com `/regex/flags` (até 100 caracteres). Sem valor, limpa o filtro |
| `-copy-to` | Copia os logs para contato, grupo, número ou menção. Sem valor, usa o chat do comando. Não aceita e-mail |

| Nível | Label | Diagnóstico |
|---|---|---|
| `0` | `DEBUG0` | Mensagens básicas de diagnóstico; nível padrão |
| `1` | `DEBUG1` | Comandos recebidos, parser, entrada e saída das funções exportadas, profundidade e duração das chamadas, contexto do chat |
| `2` | `DEBUG2` | Chamadas externas: Axios com URL e parâmetros, WhatsApp, SMTP e processos externos |
| `3` | `DEBUG3` | Resultados das funções, consultas ao banco, dados das mensagens e execução no Chromium |

Cada nível inclui os anteriores. Credenciais são ocultadas e objetos grandes, mídia e estruturas
circulares são resumidos. O filtro também vale para logs de informação e erro enquanto o debug
está ligado. Flags como `i`, `g`, `m`, `s`, `u` e `y` seguem a sintaxe de regex do JavaScript;
cada linha é avaliada independentemente. O contexto inclui `chatName` e `chatId` a partir do nível
`1`, permitindo filtrar pelo nome ou ID do chat.
No console com cores habilitadas, os trechos que casam com o filtro aparecem em vermelho e negrito,
como no `grep --color`. As cópias enviadas ao WhatsApp contêm texto sem os códigos de cor.

Os logs de inicialização, autenticação e o aviso por e-mail de bot iniciado aparecem sem filtro.
O filtro salvo passa a valer quando o WhatsApp está pronto e o aviso inicial foi disparado;
ele também vale quando o envio desse e-mail ainda está em andamento.

```
/debug -off
/debug -on
/debug -level 2 -filter /chatName.*Jorge/
/debug -on -level 2 -filter /sapato/i -copy-to @Jorge
/debug -on -level 3 -filter -copy-to
/debug -off
/debug -on -lvl 3 -filter /@newsletter/
/debug
```

Sem opções, mostra o estado, o nível, o filtro e o destino ativos. Destinos com espaços podem
ser escritos como `/Nome do Grupo/` ou entre aspas. Nomes ambíguos abrem uma lista para escolher,
como no `-to` dos outros comandos.

A cópia envia os logs em lotes, com o prefixo `🪲 [ZapBot log]`. O próprio envio da cópia não
gera logs adicionais. A fila é limitada e descarta os blocos mais antigos quando fica cheia.
Os logs aguardam na fila enquanto a conexão com o WhatsApp não está pronta.
Se o envio falhar, a cópia pausa e registra o erro no console; configure novamente pelo `/debug`
para retomar. O console continua funcionando.

Um comando desconhecido ou desativado aparece no log: o do dono sempre; o dos outros somente
com o debug ligado, sujeito ao filtro configurado:

```
[!] ⚠️ 'Jorge' executed unknown command: '/tapioca'
[DEBUG0] ⚠️ 'Fulano' executed unknown command: '/tapioca'
```
