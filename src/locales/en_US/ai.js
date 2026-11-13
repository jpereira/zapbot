/*
 * en_US catalog of the AI and media command replies (/gpt, /tldr, /draw, /translate, /pixelart, /ascii,
 * /meme, /giphy, /sticker) and of src/openaiChat.js. pt_BR/ai.js has the same keys.
 */
module.exports = {
    // src/openaiChat.js
    'openai.noKey': '⚠️ OpenAI API key not found: {cmd} is disabled.\n' +
        '💡 _Set OPENAI_API_KEY in config/.env or use /set openai.api.key <key>_',
    'openai.timeout': '⏱️ OpenAI did not answer in {s}s. Try again or increase openai.timeout.ms.',
    'openai.badKey': '🔑 Invalid OpenAI API key. Check OPENAI_API_KEY or openai.api.key.',
    'openai.quota': '💸 OpenAI limit or credits exhausted. Try again later.',
    'openai.error': '❌ Error in {cmd}: {erro}',
    'openai.pricesNotFound': 'could not find the price table on the OpenAI page (did its format change?)',
    'openai.noImage': 'OpenAI did not return the image',
    'openai.calls': ' · 🔁 {n} calls',
    'openai.noPrice': 'cost n/a (run /gpt -prices)',
    'openai.balance': ' · 🏦 balance ~{restante} of {total}',
    'openai.oldPrices': '⚠️ prices are {dias} days old: /gpt -prices',

    // src/comandos/openaiComum.js
    'openai.processing': '⏳ Processing {cmd}, hold on.',
    'openai.ownerOnly': '⛔ Only the bot owner (or an admin) can {acao}.',
    'openai.kindAudio': 'transcription',
    'openai.kindVoice': 'voice',
    'openai.kindImage': 'image',
    'openai.kindGif': 'GIF',
    'openai.modelMissing': '❌ The model {modelo} does not exist in your OpenAI account ({nome}).\n',
    'openai.modelCandidates': '💡 _Your key sees: {lista}_\n',
    'openai.modelNoCandidates': '💡 _I could not find any similar model in your key\'s list._\n',
    'openai.modelSwitch': '💡 _Change it with /set {setting} <model>_',
    'openai.useDefault': 'Default',
    'openai.detailQuestions': 'questions',
    'openai.detailImages': 'images',
    'openai.detailGif': 'GIF',
    'openai.detailAudio': 'audio transcription',
    'openai.detailVoice': 'voice',
    'openai.keyCantSeeTag': ' ⚠️ your key cannot see it',
    'openai.envOrigin': ' _(the current one comes from OPENAI_MODEL in .env)_',
    'openai.modelBlock': '*{nome}* ({detalhe}) — {exemplo}{origem}\n{linhas}',
    'openai.modelsTitle': '{icone} *{cmd} models*',
    'openai.listFromKey': '💡 _The list is the one from your key (GET /v1/models)._',
    'openai.listDefaults': '💡 _No list from your key (no key or no answer from OpenAI): only the defaults._',
    'openai.keyCantSee': '❌ Your key cannot see the model {modelo} ({detalhe}).',
    'openai.keySees': '\n💡 _The ones it sees: {lista}_',
    'openai.modelError': '❌ Model {erro}',
    'openai.modelSetFor': '✅ {cmd} {detalhe} model: *{modelo}*',
    'openai.modelSet': '✅ {cmd} model: *{modelo}*',
    'openai.envPriority': '\n⚠️ _OPENAI_MODEL in .env ({env}) takes priority while it is set._',
    'openai.photoDownload': '❌ Could not download the image (it may have expired on WhatsApp).',
    'openai.photoType': '❌ OpenAI cannot read {tipo} images: only {tipos}.',
    'openai.photoSize': '❌ The image is larger than {mb} MB: too big for {cmd}.',

    // src/comandos/gpt.js
    'gpt.instructions': 'You are an assistant on WhatsApp. Answer directly, in English, unless asked for another language. ' +
        'Format for WhatsApp, which is not Markdown: *bold* with a single asterisk, _italic_, ~strikethrough~, ' +
        'lists with "- " or "1. ", code between backticks (``` for blocks). Do not use # headings, tables, ' +
        '"---" lines or **double asterisks**.',
    'gpt.describePhoto': 'Describe this image.',
    'gpt.docName': 'document',
    'gpt.docPrompt': 'Document "{nome}":\n{texto}',
    'gpt.docDownload': '❌ Could not download the document (it may have expired on WhatsApp).',
    'gpt.docTooBig': '❌ The document is larger than {mb} MB: too big for /gpt.',
    'gpt.pdfRead': '❌ Could not read the PDF (pdftotext, from poppler-utils, must be installed).',
    'gpt.docType': '❌ /gpt reads text documents and PDFs, not {tipo}.',
    'gpt.docEmpty': '❌ Could not find text in this document (a scanned PDF, maybe).',
    'gpt.audioDownload': '❌ Could not download the audio (it may have expired on WhatsApp).',
    'gpt.audioFormat': '❌ OpenAI does not transcribe {tipo} audio: only {formatos}.',
    'gpt.audioTooBig': '❌ The audio is larger than {mb} MB: too big to transcribe.',
    'gpt.noSpeech': '🤖 I heard no speech in this audio.',
    'gpt.transcription': '🤖 *Transcription:*\n{texto}',
    'gpt.audioPrompt': '{pergunta}\n\nAudio transcription:\n{transcricao}',
    'gpt.voiceUsage': '❌ Use: /gpt -voz <text> (or reply to a text message)',
    'gpt.voiceTooLong': '❌ The text has {n} characters: the voice accepts up to {max}.',
    'gpt.imgUsage': '❌ Use: /gpt -img <what to create> (replying to a photo, it gets edited)',
    'gpt.gifUsage': '❌ Use: /gpt -gif <what to animate> (replying to a photo, it gets animated)',
    'gpt.actionGif': 'generate GIFs',
    'gpt.noModel': '(no model)',
    'gpt.otherItem': '(others)',
    'gpt.svcImages': '🖼️ Images',
    'gpt.svcVoice': '🔊 Voice',
    'gpt.svcTranscription': '🎙️ Transcription',
    'gpt.unitImages': 'images',
    'gpt.unitChars': 'characters',
    'gpt.unitAudio': 's of audio',
    'gpt.usageTitleToday': '📊 *OpenAI usage* — today',
    'gpt.usageTitleDays': '📊 *OpenAI usage* — last {dias} days',
    'gpt.spent': '💵 Spent: *{valor}*',
    'gpt.tokensLine': '🔢 {total} tokens · input {entrada} (cache {cache}) · output {saida}',
    'gpt.requests': '🔁 {n} requests',
    'gpt.byDay': '📅 *By day* _(UTC)_',
    'gpt.byModel': '🧠 *By model*',
    'gpt.otherCosts': '🧾 *Other costs*',
    'gpt.otherUses': '🧰 *Other uses*',
    'gpt.noUsage': 'ℹ️ No usage in this period.',
    'gpt.balance': '💰 *Credits:* {usado}/{total} · {resta} _({periodo})_',
    'gpt.balanceLeft': '*{valor}* left',
    'gpt.balanceOver': '*{valor} over the total*',
    'gpt.balanceSince': 'spent since {data}',
    'gpt.balance180': 'spent in the last 180 days',
    'gpt.limitsTitle': '⏱️ *Limits now* — {modelo}',
    'gpt.limitsNone': '• OpenAI did not report the limits.',
    'gpt.limitRequests': 'requests',
    'gpt.limitLine': '• {nome}: {restante} of {limite}',
    'gpt.limitReset': ' · resets in {reseta}',
    'gpt.usageUsage': '❌ Use: /gpt -usage [days] (from 1 to {max}; default {padrao})',
    'gpt.adminKeyHint': '💡 _For the usage, the admin key: OPENAI_ADMIN_KEY or /set openai.admin.key_',
    'gpt.creditHint': '💡 _To see $used/$total: /set openai.credit.total <dollars purchased> and ' +
        '/set openai.credit.since YYYY-MM-DD (the OpenAI API does not report the balance)._',
    'gpt.adminRefusedScope': '🔑 The admin key was refused: it does not have the api.usage.read scope.',
    'gpt.adminRefused': '🔑 The admin key was refused.',
    'gpt.adminRefusedHint': '💡 _The Usage API requires an Admin key (sk-admin-..., at platform.openai.com › Organization › ' +
        'Admin keys) or a key with the Usage scope set to Read. A regular project key (sk-proj-...) does not work._',
    'gpt.adminMissing': '💡 _To see the usage, set the admin key: OPENAI_ADMIN_KEY in config/.env or /set openai.admin.key <key>_',
    'gpt.priceChangedOne': '{n} changed',
    'gpt.priceChangedMany': '{n} changed',
    'gpt.priceNewOne': '{n} new',
    'gpt.priceNewMany': '{n} new',
    'gpt.pricesUpdated': '✅ *Prices updated* ({mudados}, {novos}, {iguais} unchanged)\n{linhas}',
    'gpt.pricesMore': '\n_…and {n} more_',
    'gpt.pricesUpToDate': '✅ All {iguais} prices are already up to date.',
    'gpt.pricesFooter': '💡 _Dollars per 1M tokens, input/output (openai.pricing)._',
    'gpt.pricesFail': '❌ Could not update the prices: {erro}',

    // src/comandos/tldr.js
    'tldr.instructions': 'You summarize WhatsApp conversations in English. Write a short summary, in topics ' +
        'starting with "• ", with the main subjects, decisions, agreements and pending items, ' +
        'quoting who said what when relevant. At most 15 topics. Do not invent anything that is not in ' +
        'the messages and do not use headings or markdown other than *bold*. The "{tag}" lines are ' +
        'audio transcriptions: summarize each one (or the ones about the same subject) in a topic in the format ' +
        '"🎤 *Someone* sent an audio DD/MM HH:mm talking about ...", with who sent it and when.',
    'tldr.audioTag': '[AUDIO]',
    'tldr.and': ' and ',
    'tldr.days': { one: '{n} day', other: '{n} days' },
    'tldr.hours': { one: '{n} hour', other: '{n} hours' },
    'tldr.minutes': { one: '{n} minute', other: '{n} minutes' },
    'tldr.messages': { one: '{n} message', other: '{n} messages' },
    'tldr.sinceReply': 'from the replied message',
    'tldr.limited': 'limited to {max} messages (setting tldr.maxMsgs)',
    'tldr.retention': 'regular messages are kept only {tempo} ({horas} h) in the database (setting cache.messageRetentionHours)',
    'tldr.latest': 'only the {max} most recent (setting tldr.maxMsgs)',
    'tldr.few': '📝 Too few messages to summarize ({total}) in {nome}.\n' +
        '💡 _The summary uses the text stored in the database: regular messages are kept for {horas} h (setting cache.messageRetentionHours), and commands and media without a caption are not included._',
    'tldr.me': 'You',
    'tldr.unknown': 'Unknown',
    'tldr.scopeReply': 'for the {mensagens} in {nome} since the replied message ({tempo} ago)',
    'tldr.scopePeriod': 'for the {mensagens} in {nome} over the last {tempo}',
    'tldr.scopeLast': 'for the latest {mensagens} in {nome}',
    'tldr.processing': '⏳ Processing /tldr {escopo}, hold on.',
    'tldr.prompt': 'Conversation "{nome}" ({total} messages):\n\n{linhas}',
    'tldr.header': '🤖 *Summary of {nome}*\n_{mensagens} · {inicio} to {fim}_',
    'tldr.sentPrivate': '🤖 Summary sent to your private chat.',

    // src/comandos/draw.js
    'draw.animatePrompt': 'Animate this image into a GIF. {texto}',
    'draw.animateDefault': 'With subtle, natural movement.',
    'draw.gifDenied': '🔒 Your account/model cannot make animated GIFs: {mensagem}\n' +
        '💡 _Only the gpt-image-2.6-* ones make GIFs, and they require preview access. Change it with /set openai.image.gifModel <model>_',
    'draw.intRange': '{nome} must be an integer from {min} to {max}.',

    // src/comandos/translate.js
    'translate.timeout': '⏱️ Google Translate did not answer. Try again.',
    'translate.limited': '💸 Google Translate rate-limited this server (free access, no key). Try again later.',
    'translate.refused': '⛔ Google refused this server\'s request. Try again later.',
    'translate.error': '❌ Error in /translate: {erro}',
    'translate.languages': '🌐 */translate languages* ({n})\n\n```{lista}```\n\n' +
        '💡 _Use the code: /translate -para en good morning. Default: {padrao} (setting traduzir.lang)._',
    'translate.invalid': '❌ Invalid language: {pedido}. Use the code (en, es, pt, zh-CN...). See the accepted ones with /translate -l',
    'translate.tooLong': '❌ Text too long: {n} characters (max. {max}).',
    'translate.result': '🌐 *Translation* _({origem} → {alvo})_\n\n{texto}',
    'translate.sameLang': '\n\n💡 _The text was already in {alvo}. For another language: /translate -para en_',

    // src/comandos/pixelart.js
    'pixelart.invalidYear': '❌ Invalid year. E.g.: /pixelart -y 1996',
    'pixelart.invalidPack': '❌ Invalid pack name. E.g.: /pixelart chuck-norris-lvl',
    'pixelart.noPack': '❌ No pack found.',
    'pixelart.packNotFound': '❌ Pack not found: {pack}\n💡 _See the packs at {url}_',
    'pixelart.noArt': '❌ The pack {pack} has no ANSI/ASCII art.',
    'pixelart.part1': '\n🧩 Part 1/{total}',
    'pixelart.cropped': ' _(art cropped: see it whole at the link)_',
    'pixelart.partN': '🧩 Part {i}/{total}',
    'pixelart.fail': '❌ Could not fetch the art from 16colo.rs right now.',

    // src/comandos/ascii.js
    'ascii.usage': '❌ Use: /ascii [-width|-w <columns>] [-char|-c <character>] <text (\\n breaks the line)>',
    'ascii.tooLong': '❌ The text has at most {max} characters.',
    'ascii.width': '❌ -width needs a number from {min} to {max}',
    'ascii.char': '❌ -char needs a single character, e.g.: -char @',
    'ascii.nothing': '❌ Nothing to draw: use letters, numbers or ! ? . , : - + _ /',

    // src/comandos/meme.js
    'meme.none': '❌ No meme with "{busca}".',
    'meme.fail': '❌ Could not fetch a meme right now.',

    // src/comandos/giphy.js
    'giphy.noKey': '⚠️ GIPHY key not set: define GIPHY_API_KEY in config/.env or use /set giphy.api.key <key>.',
    'giphy.none': '❌ No GIF found.',
    'giphy.fail': '❌ Could not fetch that GIF.',

    // src/comandos/sticker.js
    'sticker.needText': '❌ Provide the text: /sticker -txt "Good morning!"',
    'sticker.tooLong': '❌ Text too long: up to {max} characters.',
    'sticker.badBg': '❌ -bg: "{cor}" is not a color. Use #RRGGBB (e.g.: #FFFFFF).',
    'sticker.badFg': '❌ -fg: "{cor}" is not a color. Use #RRGGBB (e.g.: #000000).',
    'sticker.sameColor': '❌ -bg and -fg are the same color: the text would not show.',
    'sticker.fail': '❌ Could not generate the sticker: {erro}',
    'sticker.colorsNeedTxt': '❌ -bg and -fg belong to -txt: /sticker -txt "Good morning!" -bg "#FFFFFF" -fg "#000000"',
    'sticker.txtConflict': '❌ -txt does not combine with -ss, -es, -v or a URL: it makes the sticker from the text only.',
    'sticker.posConflict': '❌ -pos is for cropping images and videos: it does not apply with -txt.',

    // /ocr
    'ocr.usage': '❌ Reply to a photo with /ocr (or send the photo with /ocr as the caption).',
    'ocr.instructions': 'You are an OCR. Reply only with the text that appears in the image, keeping the line breaks and the original language. Do not describe the image or add comments. If there is no readable text, reply exactly {vazio}.',
    'ocr.prompt': 'Extract the text of this image.',
    'ocr.noText': '🔎 No text found in the image.',

    // /tts
    'tts.usage': '❌ Use: /tts <text> (or reply to a text message)',

    // /qr, /decodeqr
    'qr.usage': '❌ Use: /qr <text> (or reply to a text message). To read a QR Code: /qr -d on a photo.',
    'qr.decodeUsage': '❌ Reply to a photo of a QR Code with /decodeqr (or send the photo with /decodeqr as the caption).',
    'qr.tooLong': '❌ The text has {n} characters: a QR Code takes up to {max}.',
    'qr.download': '❌ I could not download the image.',
    'qr.notFound': '🔎 No QR Code found in the image.',

};
