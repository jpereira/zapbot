/*
 * Catálogo pt_BR das respostas dos comandos de IA e de mídia (/gpt, /tldr, /draw, /translate, /pixelart,
 * /ascii, /meme, /giphy, /sticker) e do src/openaiChat.js. O en_US/ai.js tem as mesmas chaves.
 */
module.exports = {
    // src/openaiChat.js
    'openai.noKey': '⚠️ API key da OpenAI não encontrada: o {cmd} está desativado.\n' +
        '💡 _Defina OPENAI_API_KEY no config/.env ou use /set openai.api.key <chave>_',
    'openai.timeout': '⏱️ A OpenAI não respondeu em {s}s. Tente de novo ou aumente o openai.timeout.ms.',
    'openai.badKey': '🔑 API key da OpenAI inválida. Confira o OPENAI_API_KEY ou o openai.api.key.',
    'openai.quota': '💸 Limite ou créditos da OpenAI esgotados. Tente mais tarde.',
    'openai.error': '❌ Erro no {cmd}: {erro}',
    'openai.pricesNotFound': 'não achei a tabela de preços na página da OpenAI (o formato dela mudou?)',
    'openai.noImage': 'a OpenAI não devolveu a imagem',
    'openai.calls': ' · 🔁 {n} chamadas',
    'openai.noPrice': 'custo n/d (rode /gpt -prices)',
    'openai.balance': ' · 🏦 saldo ~{restante} de {total}',
    'openai.oldPrices': '⚠️ preços de {dias} dias: /gpt -prices',

    // src/comandos/openaiComum.js
    'openai.processing': '⏳ Processando o {cmd}, aguarde.',
    'openai.ownerOnly': '⛔ Apenas o dono do bot (ou um admin) pode {acao}.',
    'openai.kindAudio': 'transcrição',
    'openai.kindVoice': 'voz',
    'openai.kindImage': 'imagem',
    'openai.kindGif': 'GIF',
    'openai.modelMissing': '❌ O modelo {modelo} não existe na sua conta da OpenAI ({nome}).\n',
    'openai.modelCandidates': '💡 _A sua chave vê: {lista}_\n',
    'openai.modelNoCandidates': '💡 _Não achei na lista da sua chave nenhum modelo parecido._\n',
    'openai.modelSwitch': '💡 _Troque com /set {setting} <modelo>_',
    'openai.useDefault': 'Padrão',
    'openai.detailQuestions': 'perguntas',
    'openai.detailImages': 'imagens',
    'openai.detailGif': 'GIF',
    'openai.detailAudio': 'transcrição de áudio',
    'openai.detailVoice': 'voz',
    'openai.keyCantSeeTag': ' ⚠️ a sua chave não vê',
    'openai.envOrigin': ' _(o atual vem do OPENAI_MODEL no .env)_',
    'openai.modelBlock': '*{nome}* ({detalhe}) — {exemplo}{origem}\n{linhas}',
    'openai.modelsTitle': '{icone} *Modelos do {cmd}*',
    'openai.listFromKey': '💡 _A lista é a da sua chave (GET /v1/models)._',
    'openai.listDefaults': '💡 _Sem a lista da sua chave (sem chave ou sem resposta da OpenAI): só os padrões._',
    'openai.keyCantSee': '❌ A sua chave não vê o modelo {modelo} ({detalhe}).',
    'openai.keySees': '\n💡 _Os que ela vê: {lista}_',
    'openai.modelError': '❌ Modelo {erro}',
    'openai.modelSetFor': '✅ Modelo de {detalhe} do {cmd}: *{modelo}*',
    'openai.modelSet': '✅ Modelo do {cmd}: *{modelo}*',
    'openai.envPriority': '\n⚠️ _O OPENAI_MODEL do .env ({env}) tem prioridade enquanto estiver definido._',
    'openai.photoDownload': '❌ Não consegui baixar a imagem (ela pode ter expirado no WhatsApp).',
    'openai.photoType': '❌ A OpenAI não lê imagem {tipo}: só {tipos}.',
    'openai.photoSize': '❌ A imagem tem mais de {mb} MB: é grande demais para o {cmd}.',

    // src/comandos/gpt.js
    'gpt.instructions': 'Você é um assistente no WhatsApp. Responda de forma direta, em português, salvo se pedirem outro idioma. ' +
        'Formate para o WhatsApp, que não é Markdown: *negrito* com um asterisco só, _itálico_, ~tachado~, ' +
        'listas com "- " ou "1. ", código entre crases (``` para blocos). Não use títulos com #, tabelas, ' +
        'linhas "---" nem **dois asteriscos**.',
    'gpt.describePhoto': 'Descreva esta imagem.',
    'gpt.docName': 'documento',
    'gpt.docPrompt': 'Documento "{nome}":\n{texto}',
    'gpt.docDownload': '❌ Não consegui baixar o documento (ele pode ter expirado no WhatsApp).',
    'gpt.docTooBig': '❌ O documento tem mais de {mb} MB: é grande demais para o /gpt.',
    'gpt.pdfRead': '❌ Não consegui ler o PDF (o pdftotext, do poppler-utils, precisa estar instalado).',
    'gpt.docType': '❌ O /gpt lê documento de texto e PDF, não {tipo}.',
    'gpt.docEmpty': '❌ Não achei texto nesse documento (um PDF escaneado, talvez).',
    'gpt.audioDownload': '❌ Não consegui baixar o áudio (ele pode ter expirado no WhatsApp).',
    'gpt.audioFormat': '❌ A OpenAI não transcreve áudio {tipo}: só {formatos}.',
    'gpt.audioTooBig': '❌ O áudio tem mais de {mb} MB: é grande demais para transcrever.',
    'gpt.noSpeech': '🤖 Não ouvi fala nenhuma nesse áudio.',
    'gpt.transcription': '🤖 *Transcrição:*\n{texto}',
    'gpt.audioPrompt': '{pergunta}\n\nTranscrição do áudio:\n{transcricao}',
    'gpt.voiceUsage': '❌ Use: /gpt -voz <texto> (ou responda uma mensagem de texto)',
    'gpt.voiceTooLong': '❌ O texto tem {n} caracteres: a voz aceita até {max}.',
    'gpt.imgUsage': '❌ Use: /gpt -img <o que criar> (respondendo uma foto, ela é editada)',
    'gpt.gifUsage': '❌ Use: /gpt -gif <o que animar> (respondendo uma foto, ela é animada)',
    'gpt.actionGif': 'gerar GIF',
    'gpt.noModel': '(sem modelo)',
    'gpt.otherItem': '(outros)',
    'gpt.svcImages': '🖼️ Imagens',
    'gpt.svcVoice': '🔊 Voz',
    'gpt.svcTranscription': '🎙️ Transcrição',
    'gpt.unitImages': 'imagens',
    'gpt.unitChars': 'caracteres',
    'gpt.unitAudio': 's de áudio',
    'gpt.usageTitleToday': '📊 *Consumo da OpenAI* — hoje',
    'gpt.usageTitleDays': '📊 *Consumo da OpenAI* — últimos {dias} dias',
    'gpt.spent': '💵 Gasto: *{valor}*',
    'gpt.tokensLine': '🔢 {total} tokens · entrada {entrada} (cache {cache}) · saída {saida}',
    'gpt.requests': '🔁 {n} requisições',
    'gpt.byDay': '📅 *Por dia* _(UTC)_',
    'gpt.byModel': '🧠 *Por modelo*',
    'gpt.otherCosts': '🧾 *Outros custos*',
    'gpt.otherUses': '🧰 *Outros usos*',
    'gpt.noUsage': 'ℹ️ Nenhum uso nesse período.',
    'gpt.balance': '💰 *Créditos:* {usado}/{total} · {resta} _({periodo})_',
    'gpt.balanceLeft': 'restam *{valor}*',
    'gpt.balanceOver': '*{valor} acima do total*',
    'gpt.balanceSince': 'gasto desde {data}',
    'gpt.balance180': 'gasto nos últimos 180 dias',
    'gpt.limitsTitle': '⏱️ *Limites agora* — {modelo}',
    'gpt.limitsNone': '• A OpenAI não informou os limites.',
    'gpt.limitRequests': 'requisições',
    'gpt.limitLine': '• {nome}: {restante} de {limite}',
    'gpt.limitReset': ' · reseta em {reseta}',
    'gpt.usageUsage': '❌ Use: /gpt -usage [dias] (de 1 a {max}; padrão {padrao})',
    'gpt.adminKeyHint': '💡 _Para o consumo, a chave de admin: OPENAI_ADMIN_KEY ou /set openai.admin.key_',
    'gpt.creditHint': '💡 _Para ver $usado/$total: /set openai.credit.total <dólares comprados> e ' +
        '/set openai.credit.since AAAA-MM-DD (a API da OpenAI não informa o saldo)._',
    'gpt.adminRefusedScope': '🔑 A chave de admin foi recusada: ela não tem o escopo api.usage.read.',
    'gpt.adminRefused': '🔑 A chave de admin foi recusada.',
    'gpt.adminRefusedHint': '💡 _A Usage API pede uma Admin key (sk-admin-..., em platform.openai.com › Organization › ' +
        'Admin keys) ou uma chave com o escopo Usage em Read. Uma chave de projeto (sk-proj-...) comum não serve._',
    'gpt.adminMissing': '💡 _Para ver o consumo, defina a chave de admin: OPENAI_ADMIN_KEY no config/.env ou /set openai.admin.key <chave>_',
    'gpt.priceChangedOne': '{n} alterado',
    'gpt.priceChangedMany': '{n} alterados',
    'gpt.priceNewOne': '{n} novo',
    'gpt.priceNewMany': '{n} novos',
    'gpt.pricesUpdated': '✅ *Preços atualizados* ({mudados}, {novos}, {iguais} sem mudança)\n{linhas}',
    'gpt.pricesMore': '\n_…e mais {n}_',
    'gpt.pricesUpToDate': '✅ Os {iguais} preços já estão em dia.',
    'gpt.pricesFooter': '💡 _Dólares por 1M de tokens, entrada/saída (openai.pricing)._',
    'gpt.pricesFail': '❌ Não consegui atualizar os preços: {erro}',

    // src/comandos/tldr.js
    'tldr.instructions': 'Você resume conversas de WhatsApp em português do Brasil. Escreva um resumo curto, em tópicos ' +
        'começados por "• ", com os assuntos principais, as decisões, os combinados e as pendências, ' +
        'citando quem disse quando for relevante. No máximo 15 tópicos. Não invente nada que não esteja ' +
        'nas mensagens e não use títulos nem markdown além de *negrito*. As linhas "{tag}" são ' +
        'transcrições de áudios: resuma cada um (ou os de um mesmo assunto) num tópico no formato ' +
        '"🎤 *Fulano* enviou áudio DD/MM HH:mm falando sobre ...", com quem enviou e quando.',
    'tldr.audioTag': '[ÁUDIO]',
    'tldr.and': ' e ',
    'tldr.days': { one: '{n} dia', other: '{n} dias' },
    'tldr.hours': { one: '{n} hora', other: '{n} horas' },
    'tldr.minutes': { one: '{n} minuto', other: '{n} minutos' },
    'tldr.messages': { one: '{n} mensagem', other: '{n} mensagens' },
    'tldr.sinceReply': 'a partir da mensagem respondida',
    'tldr.limited': 'limitado a {max} mensagens (setting tldr.maxMsgs)',
    'tldr.retention': 'as mensagens comuns ficam só {tempo} ({horas} h) no banco (setting cache.messageRetentionHours)',
    'tldr.latest': 'só as {max} mais recentes (setting tldr.maxMsgs)',
    'tldr.few': '📝 Poucas mensagens para resumir ({total}) em {nome}.\n' +
        '💡 _O resumo usa o texto guardado no banco: as mensagens comuns ficam {horas} h (setting cache.messageRetentionHours), e comandos e mídias sem legenda não entram._',
    'tldr.me': 'Você',
    'tldr.unknown': 'Desconhecido',
    'tldr.scopeReply': 'das {mensagens} de {nome} desde a mensagem respondida (há {tempo})',
    'tldr.scopePeriod': 'das {mensagens} de {nome} do período de {tempo}',
    'tldr.scopeLast': 'das últimas {mensagens} de {nome}',
    'tldr.processing': '⏳ Processando o /tldr {escopo}, aguarde.',
    'tldr.prompt': 'Conversa "{nome}" ({total} mensagens):\n\n{linhas}',
    'tldr.header': '🤖 *Resumo de {nome}*\n_{mensagens} · {inicio} a {fim}_',
    'tldr.sentPrivate': '🤖 Resumo enviado no seu privado.',

    // src/comandos/draw.js
    'draw.animatePrompt': 'Anime esta imagem em um GIF. {texto}',
    'draw.animateDefault': 'Com um movimento sutil e natural.',
    'draw.gifDenied': '🔒 A sua conta/modelo não faz GIF animado: {mensagem}\n' +
        '💡 _Só os gpt-image-2.6-* fazem GIF, e pedem acesso à prévia. Troque com /set openai.image.gifModel <modelo>_',
    'draw.intRange': '{nome} precisa ser um inteiro de {min} a {max}.',

    // src/comandos/translate.js
    'translate.timeout': '⏱️ O Google Translate não respondeu. Tente de novo.',
    'translate.limited': '💸 O Google Translate limitou os pedidos deste servidor (acesso gratuito, sem chave). Tente mais tarde.',
    'translate.refused': '⛔ O Google recusou o pedido deste servidor. Tente mais tarde.',
    'translate.error': '❌ Erro no /translate: {erro}',
    'translate.languages': '🌐 *Idiomas do /translate* ({n})\n\n```{lista}```\n\n' +
        '💡 _Use o código: /translate -para en bom dia. Padrão: {padrao} (setting traduzir.lang)._',
    'translate.invalid': '❌ Idioma inválido: {pedido}. Use o código (en, es, pt, zh-CN...). Veja os aceitos com /translate -l',
    'translate.tooLong': '❌ Texto grande demais: {n} caracteres (máx. {max}).',
    'translate.result': '🌐 *Tradução* _({origem} → {alvo})_\n\n{texto}',
    'translate.sameLang': '\n\n💡 _O texto já estava em {alvo}. Para outro idioma: /translate -para en_',

    // src/comandos/pixelart.js
    'pixelart.invalidYear': '❌ Ano inválido. Ex.: /pixelart -y 1996',
    'pixelart.invalidPack': '❌ Nome de pack inválido. Ex.: /pixelart chuck-norris-lvl',
    'pixelart.noPack': '❌ Nenhum pack encontrado.',
    'pixelart.packNotFound': '❌ Pack não encontrado: {pack}\n💡 _Veja os packs em {url}_',
    'pixelart.noArt': '❌ O pack {pack} não tem artes ANSI/ASCII.',
    'pixelart.part1': '\n🧩 Parte 1/{total}',
    'pixelart.cropped': ' _(arte cortada: veja inteira no link)_',
    'pixelart.partN': '🧩 Parte {i}/{total}',
    'pixelart.fail': '❌ Não consegui buscar a arte no 16colo.rs agora.',

    // src/comandos/ascii.js
    'ascii.usage': '❌ Use: /ascii [-width|-w <colunas>] [-char|-c <caractere>] <texto (\\n quebra a linha)>',
    'ascii.tooLong': '❌ O texto tem no máximo {max} caracteres.',
    'ascii.width': '❌ -width precisa de um número de {min} a {max}',
    'ascii.char': '❌ -char precisa de um único caractere, ex: -char @',
    'ascii.nothing': '❌ Nada para desenhar: use letras, números ou ! ? . , : - + _ /',

    // src/comandos/meme.js
    'meme.none': '❌ Nenhum meme com "{busca}".',
    'meme.fail': '❌ Não consegui buscar um meme agora.',

    // src/comandos/giphy.js
    'giphy.noKey': '⚠️ Chave do GIPHY não configurada: defina GIPHY_API_KEY no config/.env ou use /set giphy.api.key <chave>.',
    'giphy.none': '❌ Nenhum GIF encontrado.',
    'giphy.fail': '❌ Não consegui buscar esse GIF.',

    // src/comandos/sticker.js
    'sticker.needText': '❌ Informe o texto: /sticker -txt "Bom dia!"',
    'sticker.tooLong': '❌ Texto longo demais: até {max} caracteres.',
    'sticker.badBg': '❌ -bg: "{cor}" não é uma cor. Use #RRGGBB (ex.: #FFFFFF).',
    'sticker.badFg': '❌ -fg: "{cor}" não é uma cor. Use #RRGGBB (ex.: #000000).',
    'sticker.sameColor': '❌ O -bg e o -fg são a mesma cor: o texto não apareceria.',
    'sticker.fail': '❌ Não consegui gerar a figurinha: {erro}',
    'sticker.colorsNeedTxt': '❌ O -bg e o -fg são do -txt: /sticker -txt "Bom dia!" -bg "#FFFFFF" -fg "#000000"',
    'sticker.txtConflict': '❌ O -txt não combina com -ss, -es, -v nem com uma URL: ele faz a figurinha só do texto.',
    'sticker.posConflict': '❌ O -pos é do recorte de imagem e vídeo: não vale com -txt.',

    // /ocr
    'ocr.usage': '❌ Responda uma foto com /ocr (ou envie a foto com /ocr na legenda).',
    'ocr.instructions': 'Você é um OCR. Responda só com o texto que aparece na imagem, mantendo as quebras de linha e o idioma original. Não descreva a imagem nem acrescente comentários. Se não houver texto legível, responda exatamente {vazio}.',
    'ocr.prompt': 'Extraia o texto desta imagem.',
    'ocr.noText': '🔎 Nenhum texto encontrado na imagem.',

    // /tts
    'tts.usage': '❌ Use: /tts <texto> (ou responda uma mensagem de texto)',


};
