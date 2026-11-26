/* ZapBot web: the history of the database in the style of WhatsApp Web. No framework, no innerHTML with data. */
'use strict';

const TEXTS = {
    en: {
        contact: {
            title: 'Contact details', phone: 'Phone', about: 'About', profileName: 'Profile name',
            businessName: 'Business name', business: 'Business account', description: 'Business description',
            saved: 'Saved in contacts', blocked: 'Blocked', verified: 'Verification badge',
            yes: 'Yes', no: 'No', unknown: 'Unavailable', close: 'Close',
            lastStatus: 'Latest saved Status', lastSeen: 'Last seen by the monitor',
            failed: 'Could not load contact details.'
        },
        user: 'Login', password: 'Password', enter: 'Sign in', wrong: 'Wrong login or password.', blocked: (m) => `Too many attempts: try again in ${m} min.`,
        chats: 'Chats', search: 'Search a chat or a number', logout: 'Sign out', pick: 'Pick a chat on the left to see its history.',
        deleted: 'deleted', edited: 'edited', deletedAt: (d) => `deleted at ${d}`, editedAt: (d) => `edited at ${d}`,
        before: 'before', after: 'after', noMessages: 'No messages in this period.', loading: 'Loading…',
        history: (name, from, to) => `History of ${name}: ${from} → ${to}`,
        counts: (n, d, e) => `${n} messages · ${d} deleted · ${e} edited`,
        period: 'Period', from: 'From', to: 'To', apply: 'Apply', all: 'All', today: 'Today', days7: '7 days', days30: '30 days',
        order: 'Order', newestBottom: 'Newest at the bottom', oldestFirst: 'Oldest first', searchMsgs: 'Search the messages',
        download: 'Download', missing: 'media no longer in the cache', location: 'Location', you: 'You', status: 'Status',
        unknownStatusAuthor: 'Unknown author',
        showing: (a, b) => `Showing ${a} → ${b}`, more: 'Load more', end: 'No more messages.', back: 'Back', messages: 'messages',
        newestFirst: 'Newest first', select: 'Select', exportSelected: (n) => `Export selected (${n})`, theme: 'Theme', language: 'Language', themeAuto: 'Theme: automatic', themeLight: 'Theme: light', themeDark: 'Theme: dark',
        add: 'Add', edit: 'Edit', remove: 'Delete', reset: 'Reset to default', save: 'Save', cancel: 'Cancel', confirmDelete: 'Delete it?', confirmReset: 'Back to the default value?', saved: 'Saved.', actions: 'Actions', protectedSetting: 'change it with /set in WhatsApp', secretHint: 'secret: the current value is never shown',
        statsTitle: 'Statistics', kMessages: 'Messages', kMedia: 'With media', kDeleted: 'Deleted', kEdited: 'Edits', kActive: 'Active days', kAverage: 'Average per day', kBusiest: 'Busiest day', kPeak: 'Peak hour',
        vsPrevious: 'vs the previous period', noData: 'No data in this period yet.', cPerDay: 'Messages per day', cDeletedEdited: 'Deleted and edited per day', cHours: 'Messages by hour of the day',
        cHeat: 'When the chat is busy (weekday x hour)', cTypes: 'What the messages are', cChats: 'Chats with the most messages', cPeople: 'People who talk the most',
        text: 'text', mediaWord: 'media', weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], msgsWord: 'messages', share: 'of the total',
        cannotShow: 'this message could not be shown', phTag: 'travel', phTagDesc: 'places to visit', phNoteTag: 'ideas', envForced: (env) => `Decided by the ${env} variable (config/.env), which has priority over this setting`, noticeOn: 'Off: click to turn it on', noticeOff: 'On: click to turn it off', flag: { quiet: ['Quiet (-q): click to answer normally', 'Answers normally: click to make it quiet (-q)'], ownerOnly: ['Only you (-p): click to open it to everyone', 'Everyone can use it: click to make it only yours (-p)'] }, runOn: 'Running: click to pause', runOff: 'Paused: click to resume', clearHistory: 'Clear the history of this chat', clearBtn: 'Clear', clearTitle: (name) => `Clear the history · ${name}`, clearInfo: (r) => `${r.removed} messages will be deleted (with their media). ${r.kept} stay: the deleted, the edited and the ones with reactions, with what they had before.`, clearNothing: 'Nothing to delete: every message here is a deleted, edited or reacted one.', clearEmpty: 'This chat has no messages in the database.', cacheBtn: 'Clean', deleteNote: 'Delete the note', notice: 'Notice', spy: { nav: 'Show', subtitle: 'What /show keeps: the deleted, the edited, the reactions, the statuses and the channels', kinds: { deleted: 'Deleted', edited: 'Edited', reactions: 'Reactions', status: 'Statuses', channels: 'Channels' }, alerts: 'Notices in your private chat', alertOn: 'On: click to turn it off', alertOff: 'Off: click to turn it on', people: 'Who deletes, edits and reacts the most', nobody: 'Nobody yet.', search: 'Search the text, the chat or the person', empty: 'Nothing here.', mute: 'Mute this person (/mute)', unmute: 'Unmute (/unmute)', muted: 'muted', removeTitle: 'Take it out of the cache', removeText: 'The bot forgets this item (and its media); WhatsApp is not touched.', removed: 'removed', media: 'Open the media', openChat: 'Open the chat at this message', mutedCount: (n) => `${n} muted`, selectAll: 'All', selectOne: 'Select', selectHint: 'Click the items to select them (Shift+click: a range)', selected: (n) => `${n} selected`, removeSelected: (n) => `Take ${n} item${n === 1 ? '' : 's'} out of the cache` }, cacheClean: 'Clean the cache (/cache)', cacheRetention: 'What is past the retention windows (/cache -clean)', cachePick: 'Pick at least one.', cacheAll: 'Everything (/cache -all): every message (deleted, edited and reacted included), media, temporary files and backups', cacheAllWarning: '⚠️ Everything takes the whole history of every chat and the backups too: there is no undo. The notes always stay.', flushAll: 'Clear the history of every chat', flushBtn: 'Clear every chat', flushEmpty: 'There are no messages in the database.', flushWarning: (n) => `⚠️ This clears the history of all the ${n} chats at once, not only this one. There is no undo (only a /backup).`, clearAll: (n) => `Delete everything (${n}), including the deleted, the edited and the reacted ones, with their media`, webPanel: 'Web interface', webAt: 'Open at', webAccess: 'Access', webLogin: 'Login and session', webScreen: 'Screen', webAlerts: 'Warnings', notSet: 'not set', needsRestart: 'Takes effect when the bot restarts', restSettings: 'All the other settings', protectedHere: 'Change it with /set in WhatsApp',  meBtn: 'Me (my private chat)', watchedBy: '/watch', openInHistory: 'Open in the history, at this message', presenceSource: 'WhatsApp presence · time not confirmed', newTag: 'New tag', newNote: 'New note', editTagBtn: 'Edit the tag', copyTag: 'Duplicate the tag', copyTagInfo: (n) => `Its ${n} note${n === 1 ? '' : 's'} (and files) go as copies to the new tag, without the alerts.`, moveNote: 'Move to another tag', copyNote: 'Copy to another tag', duplicateNote: 'Duplicate the note', moveTag: 'Move every note to another tag', moveTagInfo: (n) => `The ${n} note${n === 1 ? '' : 's'} go to the tag you pick (if it has notes, the two merge).`, copyNoteInfo: 'The copy keeps the text and the file, without the alert.', pickTag: 'Tag', orNewTag: 'or a new tag', removeTag: 'Remove the tag', confirmRemoveTag: 'Remove this tag (it has no notes)?', removeTagWithNotes: 'Remove the tag and everything in it', removeTagInfo: (n) => `${n} note${n === 1 ? '' : 's'} (and their media) will be deleted, along with the tag's description and lock, if any.`, historyBtn: 'History', loadingHistory: 'Loading the history…', searchContact: 'Search a contact or group (name or number) or type an email', pickContact: 'Search the contact (name or number)', noMatches: 'No contact found', privateChat: 'Empty: it goes to your private chat', useEmail: (email) => `✉️ Use ${email}`, updatedAt: (time) => `updated at ${time}`, noHistory: 'Nothing recorded yet.', removeReading: 'Remove this reading', historyOf: (name, total) => `${name} · ${total}`, securityChanged: (who) => `🔒 ${who ? `${who}'s` : 'a participant\'s'} security code changed`, systemNotice: (text) => `ℹ️ ${text ?? 'WhatsApp notice'}`, loadMore: 'Load more', noMore: 'No more messages.', loadingFor: (name) => `Loading ${name}…`, loadingStats: 'Loading the statistics…', loadingHome: 'Loading…', statsOverview: 'Statistics', last30: 'last 30 days', seeAllStats: 'See all the statistics',
        code: '6-digit code', quotedGone: 'message not in the database', searchAll: 'Search all the messages', searchResults: (n) => `${n} results`, exportChat: 'Export PDF', reacted: 'reaction', removedReaction: 'removed', reactionHistory: 'Reaction history',
        reactionChanged: 'Changed reaction', reactionRemoved: 'Removed reaction', autoRefresh: 'New messages',
        home: 'Home', navHistory: 'History', notes: 'Notes', alerts: 'Alerts', aliases: 'Shortcuts', schedule: 'Schedule', stats: 'Stats', settings: 'Settings',
        filter: 'Filter', rows: (n) => `${n} ${n === 1 ? 'row' : 'rows'}`, empty: 'Nothing here.', readOnly: 'Changes here use the same checks as the commands.', periodLabel: 'Period',
        sec: { price: 'Price alerts (/stocks, /crypto)', watch: 'Watch rules (/watch)', monitor: 'Monitored contacts (/monitor)', aliases: 'Shortcuts (/alias)', schedule: 'Scheduled (/cron)', days: 'Messages per day', hours: 'Messages per hour', chats: 'Chats with the most messages', people: 'People who talk the most', settings: 'Settings (/set)' },
        col: { when: 'when', chat: 'chat', who: 'who', 'read at': 'read at', source: 'source', name: 'name', contact: 'contact' }, refresh: 'Refresh',
        storage: 'Storage', total: 'Total', database: 'Database', media: 'Media', notesFiles: 'Notes', contacts: 'Contact photos', backups: 'Backups', temporary: 'Temporary',
        files: (n) => `${n} file${n === 1 ? '' : 's'}`, backupsCount: (n) => `${n} backup${n === 1 ? '' : 's'}`,
        counts2: 'What the bot keeps', chatsCount: 'Chats', messagesCount: 'Messages', deletedCount: 'Deleted', editedCount: 'Edits', reactionsCount: 'Reaction changes', withMedia: 'With media', notesCount: 'Notes', tagsCount: 'Tags', protectedCount: 'Protected tags',
        span: 'History span', retention: 'Retention', retText: 'Text of common messages', retMedia: 'Media of common messages', retDeleted: 'Deleted', retEdited: 'Edited', retReactions: 'Reactions',
        days: (n) => `${n} days`, topChats: 'Chats with the most messages',
        notesTitle: 'Notes', allNotes: 'All notes', noTag: '(no tag)', searchNotes: 'Search the notes', exportPdf: 'Export PDF', exportAll: 'Export all (PDF)',
        locked: 'Protected tag (encrypted)', lockedHint: 'Type the password of this tag to read it here. The key stays only in this login, and it locks again after a while without use.',
        unlock: 'Unlock', lockNow: 'Lock now', wrongTag: 'Wrong password.', tagBlocked: (m) => `Too many attempts: try again in ${m} min.`,
        noNotes: 'No notes here.', alertAt: 'alert', openImage: 'Open', lockedNote: 'locked', tagsCount2: (n) => `${n} notes`, pdfSkipped: (list) => `Not included (locked): ${list}`, pdfNone: 'Nothing to export (the tag is locked or empty).'
    },
    pt: {
        contact: {
            title: 'Dados do contato', phone: 'Telefone', about: 'Recado', profileName: 'Nome de perfil',
            businessName: 'Nome comercial', business: 'Conta comercial', description: 'Descrição comercial',
            saved: 'Salvo nos contatos', blocked: 'Bloqueado', verified: 'Selo de verificação',
            yes: 'Sim', no: 'Não', unknown: 'Indisponível', close: 'Fechar',
            lastStatus: 'Último Status salvo', lastSeen: 'Visto por último pelo monitor',
            failed: 'Não foi possível carregar os dados do contato.'
        },
        user: 'Login', password: 'Senha', enter: 'Entrar', wrong: 'Login ou senha incorretos.', blocked: (m) => `Tentativas demais: tente de novo em ${m} min.`,
        chats: 'Conversas', search: 'Buscar uma conversa ou número', logout: 'Sair', pick: 'Escolha uma conversa à esquerda para ver o histórico.',
        deleted: 'apagada', edited: 'editada', deletedAt: (d) => `apagada em ${d}`, editedAt: (d) => `editada em ${d}`,
        before: 'antes', after: 'depois', noMessages: 'Nenhuma mensagem neste período.', loading: 'Carregando…',
        history: (name, from, to) => `Histórico de ${name}: ${from} → ${to}`,
        counts: (n, d, e) => `${n} mensagens · ${d} apagadas · ${e} editadas`,
        period: 'Período', from: 'De', to: 'Até', apply: 'Aplicar', all: 'Tudo', today: 'Hoje', days7: '7 dias', days30: '30 dias',
        order: 'Ordem', newestBottom: 'Mais nova embaixo', oldestFirst: 'Mais antiga primeiro', searchMsgs: 'Buscar nas mensagens',
        download: 'Baixar', missing: 'mídia que já saiu do cache', location: 'Localização', you: 'Você', status: 'Status',
        unknownStatusAuthor: 'Autor desconhecido',
        showing: (a, b) => `Mostrando ${a} → ${b}`, more: 'Carregar mais', end: 'Não há mais mensagens.', back: 'Voltar', messages: 'mensagens',
        newestFirst: 'Mais nova primeiro', select: 'Selecionar', exportSelected: (n) => `Exportar selecionadas (${n})`, theme: 'Tema', language: 'Idioma', themeAuto: 'Tema: automático', themeLight: 'Tema: claro', themeDark: 'Tema: escuro',
        add: 'Adicionar', edit: 'Editar', remove: 'Apagar', reset: 'Voltar ao padrão', save: 'Salvar', cancel: 'Cancelar', confirmDelete: 'Apagar?', confirmReset: 'Voltar ao valor padrão?', saved: 'Salvo.', actions: 'Ações', protectedSetting: 'mude pelo /set no WhatsApp', secretHint: 'secreto: o valor atual nunca é mostrado',
        statsTitle: 'Estatísticas', kMessages: 'Mensagens', kMedia: 'Com mídia', kDeleted: 'Apagadas', kEdited: 'Edições', kActive: 'Dias com conversa', kAverage: 'Média por dia', kBusiest: 'Dia mais movimentado', kPeak: 'Hora de pico',
        vsPrevious: 'em relação ao período anterior', noData: 'Ainda não há dados neste período.', cPerDay: 'Mensagens por dia', cDeletedEdited: 'Apagadas e editadas por dia', cHours: 'Mensagens por hora do dia',
        cHeat: 'Quando o movimento é maior (dia da semana x hora)', cTypes: 'O que são as mensagens', cChats: 'Conversas com mais mensagens', cPeople: 'Quem mais fala',
        text: 'texto', mediaWord: 'mídia', weekdays: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'], msgsWord: 'mensagens', share: 'do total',
        cannotShow: 'não foi possível mostrar esta mensagem', phTag: 'viagens', phTagDesc: 'lugares para conhecer', phNoteTag: 'ideias', envForced: (env) => `Decidido pela variável ${env} (config/.env), que tem prioridade sobre este setting`, noticeOn: 'Desligado: clique para ligar', noticeOff: 'Ligado: clique para desligar', flag: { quiet: ['Silencioso (-q): clique para responder normalmente', 'Responde normalmente: clique para silenciar (-q)'], ownerOnly: ['Só você (-p): clique para liberar a todos', 'Todos podem usar: clique para deixar só para você (-p)'] }, runOn: 'Ativo: clique para pausar', runOff: 'Pausado: clique para retomar', clearHistory: 'Limpar o histórico desta conversa', clearBtn: 'Limpar', clearTitle: (name) => `Limpar o histórico · ${name}`, clearInfo: (r) => `${r.removed} mensagens serão apagadas (com a mídia). ${r.kept} ficam: as apagadas, as editadas e as com reações, com o que tinham antes.`, clearNothing: 'Nada a apagar: toda mensagem daqui é apagada, editada ou tem reação.', clearEmpty: 'Esta conversa não tem mensagens no banco.', cacheBtn: 'Limpar', deleteNote: 'Apagar a nota', notice: 'Aviso', spy: { nav: 'Show', subtitle: 'O que o /show guarda: as apagadas, as editadas, as reações, os status e os canais', kinds: { deleted: 'Apagadas', edited: 'Editadas', reactions: 'Reações', status: 'Status', channels: 'Canais' }, alerts: 'Avisos no seu privado', alertOn: 'Ligado: clique para desligar', alertOff: 'Desligado: clique para ligar', people: 'Quem mais apaga, edita e reage', nobody: 'Ninguém ainda.', search: 'Busque no texto, na conversa ou na pessoa', empty: 'Nada aqui.', mute: 'Silenciar esta pessoa (/mute)', unmute: 'Tirar o silêncio (/unmute)', muted: 'silenciada', removeTitle: 'Tirar do cache', removeText: 'O bot esquece este item (e a mídia dele); o WhatsApp não é tocado.', removed: 'tirou', media: 'Abrir a mídia', openChat: 'Abrir a conversa nesta mensagem', mutedCount: (n) => `${n} silenciadas`, selectAll: 'Todas', selectOne: 'Selecionar', selectHint: 'Clique nos itens para selecioná-los (Shift+clique: um intervalo)', selected: (n) => `${n} selecionado${n === 1 ? '' : 's'}`, removeSelected: (n) => `Tirar ${n} ${n === 1 ? 'item' : 'itens'} do cache` }, cacheClean: 'Limpar o cache (/cache)', cacheRetention: 'O que passou da retenção (/cache -clean)', cachePick: 'Marque pelo menos um.', cacheAll: 'Tudo (/cache -all): todas as mensagens (inclusive apagadas, editadas e com reações), mídias, temporários e backups', cacheAllWarning: '⚠️ Tudo leva o histórico inteiro de todas as conversas e os backups também: não tem como desfazer. As notas ficam sempre.', flushAll: 'Limpar o histórico de todas as conversas', flushBtn: 'Limpar todas as conversas', flushEmpty: 'Não há mensagens no banco.', flushWarning: (n) => `⚠️ Isto limpa o histórico de todas as ${n} conversas de uma vez, não só de uma. Não tem como desfazer (só por um /backup).`, clearAll: (n) => `Apagar tudo (${n}), inclusive as apagadas, as editadas e as com reações, com a mídia delas`, webPanel: 'Interface web', webAt: 'Abra em', webAccess: 'Acesso', webLogin: 'Login e sessão', webScreen: 'Tela', webAlerts: 'Avisos', notSet: 'não definido', needsRestart: 'Vale quando o bot reiniciar', restSettings: 'Todos os outros settings', protectedHere: 'Mude com o /set no WhatsApp',  meBtn: 'Eu (meu privado)', watchedBy: '/watch', openInHistory: 'Abrir no histórico, nesta mensagem', presenceSource: 'presença do WhatsApp · horário não confirmado', newTag: 'Nova tag', newNote: 'Nova nota', editTagBtn: 'Editar a tag', copyTag: 'Duplicar a tag', copyTagInfo: (n) => `As ${n} nota${n === 1 ? '' : 's'} (e os arquivos) vão como cópia para a nova tag, sem os alertas.`, moveNote: 'Mover para outra tag', copyNote: 'Copiar para outra tag', duplicateNote: 'Duplicar a nota', moveTag: 'Mover todas as notas para outra tag', moveTagInfo: (n) => `As ${n} nota${n === 1 ? '' : 's'} vão para a tag que você escolher (se ela já tem notas, as duas se juntam).`, copyNoteInfo: 'A cópia leva o texto e o arquivo, sem o alerta.', pickTag: 'Tag', orNewTag: 'ou uma tag nova', removeTag: 'Remover a tag', confirmRemoveTag: 'Remover esta tag (ela não tem notas)?', removeTagWithNotes: 'Remover a tag e tudo dentro dela', removeTagInfo: (n) => `${n} nota${n === 1 ? '' : 's'} (e a mídia delas) serão apagadas, junto com a descrição e o cadeado da tag, se houver.`, historyBtn: 'Histórico', loadingHistory: 'Carregando o histórico…', searchContact: 'Busque um contato ou grupo (nome ou número) ou digite um e-mail', pickContact: 'Busque o contato (nome ou número)', noMatches: 'Nenhum contato encontrado', privateChat: 'Vazio: vai para o seu privado', useEmail: (email) => `✉️ Usar ${email}`, updatedAt: (time) => `atualizado às ${time}`, noHistory: 'Nada registrado ainda.', removeReading: 'Remover esta leitura', historyOf: (name, total) => `${name} · ${total}`, securityChanged: (who) => `🔒 o código de segurança de ${who ?? 'um participante'} mudou`, systemNotice: (text) => `ℹ️ ${text ?? 'aviso do WhatsApp'}`, loadMore: 'Carregar mais', noMore: 'Não há mais mensagens.', loadingFor: (name) => `Carregando ${name}…`, loadingStats: 'Carregando as estatísticas…', loadingHome: 'Carregando…', statsOverview: 'Estatísticas', last30: 'últimos 30 dias', seeAllStats: 'Ver todas as estatísticas',
        code: 'Código de 6 dígitos', quotedGone: 'mensagem fora do banco', searchAll: 'Buscar em todas as mensagens', searchResults: (n) => `${n} resultados`, exportChat: 'Exportar PDF', reacted: 'reação', removedReaction: 'removida', reactionHistory: 'Histórico de reações',
        reactionChanged: 'Alterou a reação', reactionRemoved: 'Removeu a reação', autoRefresh: 'Mensagens novas',
        home: 'Início', navHistory: 'Histórico', notes: 'Notas', alerts: 'Alertas', aliases: 'Atalhos', schedule: 'Agenda', stats: 'Estatísticas', settings: 'Settings',
        filter: 'Filtrar', rows: (n) => `${n} ${n === 1 ? 'linha' : 'linhas'}`, empty: 'Nada aqui.', readOnly: 'As mudanças aqui passam pelas mesmas checagens dos comandos.', periodLabel: 'Período',
        sec: { price: 'Alertas de preço (/stocks, /crypto)', watch: 'Regras do /watch', monitor: 'Contatos monitorados (/monitor)', aliases: 'Atalhos (/alias)', schedule: 'Agendados (/cron)', days: 'Mensagens por dia', hours: 'Mensagens por hora', chats: 'Conversas com mais mensagens', people: 'Quem mais fala', settings: 'Settings (/set)' },
        col: { who: 'quem', 'read at': 'lido em', source: 'origem', name: 'nome', '🔔 alert when it comes online': '🔔 avisar quando ficar online', kind: 'tipo', symbol: 'símbolo', rule: 'regra', created: 'criado', notifies: 'avisa', message: 'mensagem', hits: 'ocorrências', 'last hit': 'última', contact: 'contato', status: 'situação', 'last seen': 'visto por último', 'last checked': 'última checagem', alert: 'alerta', error: 'erro', shortcut: 'atalho', command: 'comando', description: 'descrição', flags: 'marcas', when: 'quando', repeat: 'repete', chat: 'conversa', text: 'texto', state: 'estado', 'alert at': 'alerta', day: 'dia', messages: 'mensagens', media: 'mídia', deleted: 'apagadas', edited: 'editadas', hour: 'hora', person: 'pessoa', setting: 'setting', value: 'valor', default: 'padrão', 'what it does': 'o que faz' }, refresh: 'Atualizar',
        storage: 'Armazenamento', total: 'Total', database: 'Banco de dados', media: 'Mídias', notesFiles: 'Notas', contacts: 'Fotos de contatos', backups: 'Backups', temporary: 'Temporários',
        files: (n) => `${n} arquivo${n === 1 ? '' : 's'}`, backupsCount: (n) => `${n} backup${n === 1 ? '' : 's'}`,
        counts2: 'O que o bot guarda', chatsCount: 'Conversas', messagesCount: 'Mensagens', deletedCount: 'Apagadas', editedCount: 'Edições', reactionsCount: 'Mudanças de reação', withMedia: 'Com mídia', notesCount: 'Notas', tagsCount: 'Tags', protectedCount: 'Tags protegidas',
        span: 'Período do histórico', retention: 'Retenção', retText: 'Texto das mensagens comuns', retMedia: 'Mídia das mensagens comuns', retDeleted: 'Apagadas', retEdited: 'Editadas', retReactions: 'Reações',
        days: (n) => `${n} dias`, topChats: 'Conversas com mais mensagens',
        notesTitle: 'Notas', allNotes: 'Todas as notas', noTag: '(sem tag)', searchNotes: 'Buscar nas notas', exportPdf: 'Exportar PDF', exportAll: 'Exportar tudo (PDF)',
        locked: 'Tag protegida (criptografada)', lockedHint: 'Digite a senha desta tag para ler aqui. A chave fica só neste login e a tag trava de novo depois de um tempo sem uso.',
        unlock: 'Destravar', lockNow: 'Travar agora', wrongTag: 'Senha incorreta.', tagBlocked: (m) => `Tentativas demais: tente de novo em ${m} min.`,
        noNotes: 'Nenhuma nota aqui.', alertAt: 'alerta', openImage: 'Abrir', lockedNote: 'travada', tagsCount2: (n) => `${n} notas`, pdfSkipped: (list) => `Fora do PDF (travadas): ${list}`, pdfNone: 'Nada para exportar (a tag está travada ou vazia).'
    }
};

const state = { version: '', needsCode: false, refreshSeconds: 15, view: 'home', notesTag: '', notesQuery: '', lang: 'en', pageSize: 100, chats: [], chat: null, info: null, mode: localStorage.getItem('zb_order') || 'newest', selecting: false, selected: new Set(), from: null, to: null, q: '', next: null, loading: false, atEnd: false };
let T = TEXTS.en;
let locale = 'en-US';

/* theme (auto follows the system) and language, kept in this browser */
const THEMES = ['auto', 'light', 'dark'];
let theme = localStorage.getItem('zb_theme') || 'auto';
function applyTheme() {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
}
applyTheme();
const themeIcon = () => ({ auto: '🌓', light: '☀️', dark: '🌙' }[theme]);
const themeLabel = () => T[{ auto: 'themeAuto', light: 'themeLight', dark: 'themeDark' }[theme]];

function setLanguage(lang, remember = false) {
    state.lang = lang;
    if (remember) localStorage.setItem('zb_lang', lang);
    T = TEXTS[lang];
    locale = lang === 'pt' ? 'pt-BR' : 'en-US';
    document.documentElement.lang = lang;
}
const root = document.getElementById('root');

const el = (tag, props = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (key === 'class') node.className = value;
        else if (key === 'style') {
            // style="..." is blocked by the CSP (no inline style): the properties are set through the DOM
            for (const declaration of String(value).split(';')) {
                const [name, ...rest] = declaration.split(':');
                if (name?.trim() && rest.length) node.style.setProperty(name.trim(), rest.join(':').trim());
            }
        }
        else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
        else if (value !== false && value != null) node.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children.flat()) if (child != null && child !== false) node.append(child);
    return node;
};

async function api(path, options = {}) {
    // A request that hangs (the browser holds only 6 connections per server) must not freeze the page
    const response = await fetch(path, { credentials: 'same-origin', signal: AbortSignal.timeout(60_000), ...options });
    if (response.status === 401 && !path.startsWith('/api/login')) {
        showLogin();
        throw new Error('login');
    }
    return response;
}

// Every time the API gives is in milliseconds (as the database keeps them)
const fmtDate = (ms) => new Date(ms).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
const fmtTime = (ms) => new Date(ms).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
const fmtFull = (ms) => `${fmtDate(ms)} ${fmtTime(ms)}`;
const dayKey = (ms) => new Date(ms).toDateString();

function initials(name) {
    const words = String(name).replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/).filter(Boolean);
    return ((words[0]?.[0] ?? '#') + (words[1]?.[0] ?? '')).toUpperCase();
}

// The chats with no photo: the list is drawn again on every click, and a 404 is not cached by the browser
const noPhoto = new Set();
function avatar(chat, onClick = () => showContact(chat)) {
    const box = el('div', { class: 'avatar' }, initials(chat.name));
    if (!noPhoto.has(chat.id)) {
        const img = el('img', { src: `/api/photo?chat=${encodeURIComponent(chat.id)}`, alt: chat.name, loading: 'lazy' });
        img.addEventListener('load', () => box.replaceChildren(img));
        img.addEventListener('error', () => noPhoto.add(chat.id));
    }
    if (onClick) {
        box.tabIndex = 0;
        box.setAttribute('role', 'button');
        box.setAttribute('aria-label', chat.name);
        box.addEventListener('click', event => {
            event.stopPropagation();
            onClick();
        });
    }
    return box;
}

/* a centered progress bar (0 to 100%) while a screen loads */
// One bar at a time: a screen that loads and the requests it makes share the same one
let activeBar = null;
function progressBar(label) {
    if (activeBar) {
        const shared = activeBar;
        shared.refs++;
        return { set: shared.set, creep() {}, done: () => shared.release() };
    }
    const fill = el('span', { class: 'progress-fill' });
    const percent = el('div', { class: 'progress-percent' }, '0%');
    const overlay = el('div', { class: 'progress-overlay' }, el('div', { class: 'progress-box' }, el('div', { class: 'progress-label' }, label), el('div', { class: 'progress-track' }, fill), percent));
    document.body.append(overlay);
    let timer = null;
    let current = 0;
    const bar = {
        refs: 1,
        // it only goes forward
        set(value) {
            current = Math.max(current, Math.min(100, Math.round(value)));
            fill.style.width = `${current}%`;
            percent.textContent = `${current}%`;
        },
        release() {
            if (--bar.refs > 0) return;
            clearInterval(timer);
            if (activeBar === bar) activeBar = null;
            bar.set(100);
            setTimeout(() => overlay.remove(), 180);
        }
    };
    activeBar = bar;
    return {
        set: bar.set,
        // without a size to measure, it creeps up to 90%
        creep() { let n = 5; timer = setInterval(() => bar.set(n += (90 - n) * 0.12), 120); },
        done: () => bar.release()
    };
}

// GET a JSON showing the progress of the download (by the Content-Length of the answer). With `shared`
// ({ bar, from, to }) it only moves the bar of a bigger job inside that range
async function apiProgress(path, label, shared = null) {
    const bar = shared?.bar ?? progressBar(label);
    const [from, to] = [shared?.from ?? 0, shared?.to ?? 90];
    const at = (fraction) => bar.set(from + (to - from) * fraction);
    at(0.02);
    try {
        const response = await api(path);
        const total = Number(response.headers.get('content-length')) || 0;
        if (!response.body || !total) {
            if (!shared) bar.creep();
            return await response.json();
        }
        const reader = response.body.getReader();
        const chunks = [];
        let received = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.length;
            at(received / total * 0.95);
        }
        at(1);
        return JSON.parse(await new Blob(chunks).text());
    } finally {
        if (!shared) bar.done();
    }
}

/* login */
function showLogin(message = '') {
    document.querySelector('.contact-dialog')?.close();
    clearInterval(sessionTimer);
    sessionTimer = null;
    clearInterval(refreshTimer);
    const userInput = el('input', { type: 'text', placeholder: T.user, autocomplete: 'username', autofocus: true });
    const input = el('input', { type: 'password', placeholder: T.password, autocomplete: 'current-password' });
    const codeInput = el('input', { type: 'text', inputmode: 'numeric', maxlength: '7', placeholder: T.code, autocomplete: 'one-time-code', class: state.needsCode ? '' : 'hidden' });
    const error = el('div', { class: 'error' }, message);
    const form = el('form', { onsubmit: async (event) => {
        event.preventDefault();
        const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: userInput.value, password: input.value, code: codeInput.value }) });
        if (response.ok) return start();
        const body = await response.json().catch(() => ({}));
        error.textContent = response.status === 429 ? T.blocked(body.minutes ?? 15) : T.wrong;
        if (body.needsCode) { state.needsCode = true; codeInput.classList.remove('hidden'); }
        input.select();
    } }, el('div', { class: 'brand' }, el('h1', {}, 'ZapBot'), state.version ? el('div', { class: 'version' }, state.version) : null), userInput, input, codeInput, el('button', { type: 'submit' }, T.enter), error);
    root.replaceChildren(el('div', { class: 'login' }, form));
    userInput.focus();
}

/* the diff of an edit (words) */
function diffWords(before, after) {
    const a = before.split(/(\s+)/).filter(Boolean);
    const b = after.split(/(\s+)/).filter(Boolean);
    if (a.length * b.length > 4_000_000) return [{ op: 'del', text: before }, { op: 'add', text: after }];
    const table = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
    for (let i = a.length - 1; i >= 0; i--) {
        for (let j = b.length - 1; j >= 0; j--) table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
    const out = [];
    const push = (op, text) => (out.at(-1)?.op === op ? (out.at(-1).text += text) : out.push({ op, text }));
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) { push('eq', a[i]); i++; j++; } else if (table[i + 1][j] >= table[i][j + 1]) push('del', a[i++]); else push('add', b[j++]);
    }
    while (i < a.length) push('del', a[i++]);
    while (j < b.length) push('add', b[j++]);
    return out;
}

function diffBlock(edit) {
    const parts = diffWords(edit.old, edit.new);
    const before = el('div', { class: 'line' }, parts.filter(p => p.op !== 'add').map(p => (p.op === 'del' ? el('del', {}, p.text) : p.text)));
    const after = el('div', { class: 'line' }, parts.filter(p => p.op !== 'del').map(p => (p.op === 'add' ? el('ins', {}, p.text) : p.text)));
    return el('div', { class: 'diff' }, el('div', { class: 'cap' }, `${T.editedAt(fmtFull(edit.at))}`),
        el('div', { class: 'cap' }, T.before), before, el('div', { class: 'cap' }, T.after), after);
}

/* a body with its links */
function linkify(text) {
    const out = [];
    let last = 0;
    for (const m of text.matchAll(/https?:\/\/[^\s<>"']+/g)) {
        if (m.index > last) out.push(text.slice(last, m.index));
        out.push(el('a', { href: m[0], target: '_blank', rel: 'noopener noreferrer' }, m[0]));
        last = m.index + m[0].length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
}

const onlyEmoji = (text) => text.length <= 24 && /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\s)+$/u.test(text) && /\p{Extended_Pictographic}/u.test(text);

function mediaNode(message) {
    const media = message.media;
    if (!media) return null;
    if (media.missing) return el('div', { class: 'media' }, el('div', { class: 'missing' }, `📎 ${T.missing}`));
    const download = el('a', { class: 'dl', href: `${media.url}&download=1` }, `⬇ ${T.download}`);
    let view;
    if (message.type === 'sticker' || media.mime === 'image/webp') view = el('img', { class: message.type === 'sticker' ? 'sticker' : '', src: media.url, alt: '', loading: 'lazy' });
    else if (media.mime.startsWith('image/')) view = el('a', { href: media.url, target: '_blank', rel: 'noopener' }, el('img', { src: media.url, alt: '', loading: 'lazy' }));
    else if (media.mime.startsWith('video/')) view = el('video', { src: media.url, controls: true, preload: 'none', playsinline: true });
    else if (media.mime.startsWith('audio/')) view = el('audio', { src: media.url, controls: true, preload: 'none' });
    else view = el('div', { class: 'file' }, `📄 ${media.name}`);
    return el('div', { class: 'media' }, view, el('div', {}, download));
}

function renderReactions(panel, { reactions = [], reactionChanges = [] }) {
    const signature = JSON.stringify([reactions, reactionChanges]);
    if (panel.dataset.signature === signature) return;
    panel.dataset.signature = signature;
    const history = reactionChanges.length ? el('div', { class: 'rchanges' },
        el('strong', {}, T.reactionHistory),
        ...reactionChanges.map(change => el('div', { class: 'reaction-change' },
            el('span', {}, [
                change.by ? `${change.by} · ` : '',
                change.new ? T.reactionChanged : T.reactionRemoved,
                ` ${change.old}${change.new ? ` → ${change.new}` : ''}`
            ]),
            change.at ? el('time', {}, fmtFull(change.at)) : null))) : null;
    panel.replaceChildren(...[
        reactions.length ? el('div', { class: 'reactions' }, reactions.join(' ')) : null,
        history
    ].filter(Boolean));
}

function messageNode(message) {
    try {
        return messageNodeUnsafe(message);
    } catch (err) {
        console.error('message', message?.id, err);
        return el('div', { class: 'msg in', 'data-at': message?.at ?? 0, 'data-id': message?.id ?? '' }, el('div', { class: 'bubble' }, el('i', {}, `⚠ ${T.cannotShow}`)));
    }
}

function messageNodeUnsafe(message) {
    // "X's security code changed": a centered notice, not a bubble
    if (message.notice) {
        return el('div', { class: 'msg sys', 'data-at': message.at, 'data-id': message.id },
            el('div', { class: 'notice' }, message.notice.kind === 'security' ? T.securityChanged(message.notice.who) : T.systemNotice(message.notice.text), ` · ${fmtTime(message.at)}`));
    }
    const isSticker = message.type === 'sticker';
    const isStatus = state.chat === 'status@broadcast';
    const author = isStatus ? (message.fromMe ? T.you : message.sender || T.unknownStatusAuthor) : null;
    const text = message.body ?? '';
    const watched = message.watch?.length ? message.watch : null;
    const mark = watched?.find(h => h.start != null);
    const bubble = el('div', { class: `bubble${watched ? ' watched' : ''}` },
        isStatus ? el('header', { class: 'status-meta' },
            el('strong', { class: 'status-author' }, author),
            el('time', { datetime: new Date(message.at).toISOString() }, fmtFull(message.at)))
            : state.info?.isGroup && !message.fromMe && message.sender
                ? el('div', { class: 'sender' }, message.sender) : null,
        message.quoted ? el('div', { class: 'quote' }, message.quoted.missing
            ? el('i', {}, T.quotedGone)
            : [el('div', { class: 'qwho' }, message.quoted.fromMe ? T.you : (message.quoted.sender ?? '')), el('div', { class: 'qtext' }, `${message.quoted.deleted ? '🗑️ ' : ''}${message.quoted.body || `[${message.quoted.type}]`}`)]) : null,
        mediaNode(message),
        message.location ? el('div', { class: 'text' }, `📍 ${T.location}: `, el('a', { href: `https://www.openstreetmap.org/?mlat=${message.location.lat}&mlon=${message.location.lng}`, target: '_blank', rel: 'noopener noreferrer' }, `${message.location.lat}, ${message.location.lng}`)) : null,
        text && message.type !== 'location' ? el('div', { class: `text${onlyEmoji(text) ? ' big' : ''}` }, mark
            ? [...linkify(text.slice(0, mark.start)), el('mark', { class: 'watch-mark', title: `${T.watchedBy}: ${mark.rule}` }, text.slice(mark.start, mark.end)), ...linkify(text.slice(mark.end))]
            : linkify(text)) : null,
        watched ? el('div', { class: 'watch-label' }, `🔎 ${T.watchedBy}: ${watched.map(h => h.rule).join(', ')}`) : null,
        message.transcription ? el('div', { class: 'transcription' }, `📝 ${message.transcription}`) : null,
        isStatus ? null : el('div', { class: 'meta' }, fmtTime(message.at)));

    const flagged = message.deleted || message.edits.length;
    const labels = [];
    if (message.deleted) labels.push(el('span', { class: 'deleted' }, `🗑️ ${message.deletedAt ? T.deletedAt(fmtFull(message.deletedAt)) : T.deleted}`));
    if (message.edits.length) labels.push(el('span', { class: 'edited' }, `✏️ ${T.edited}${message.edits.length > 1 ? ` ×${message.edits.length}` : ''}`));
    const inner = flagged
        ? el('div', { class: `flag ${message.deleted ? 'deleted' : ''} ${message.edits.length ? 'edited' : ''}` },
            bubble, el('div', { class: 'label' }, labels), message.edits.map(diffBlock))
        : bubble;
    const selected = state.selected.has(message.id);
    const presentation = isStatus ? 'status-post' : (message.fromMe ? 'out' : 'in');
    const classes = ['msg', presentation, isSticker && 'sticker',
        state.selecting && 'selectable', selected && 'selected'].filter(Boolean).join(' ');
    const reactions = el('div', { class: 'message-reactions' });
    renderReactions(reactions, message);
    const node = el(isStatus ? 'article' : 'div', {
        class: classes, 'data-at': message.at, 'data-id': message.id
    }, inner, reactions);
    if (state.selecting) {
        node.addEventListener('click', (event) => {
            if (event.target.closest('a, video, audio')) return;
            if (state.selected.has(message.id)) state.selected.delete(message.id); else state.selected.add(message.id);
            node.classList.toggle('selected', state.selected.has(message.id));
            const button = document.getElementById('export-selected');
            if (button) { button.disabled = !state.selected.size; button.textContent = `⬇ ${T.exportSelected(state.selected.size)}`; }
        });
    }
    return node;
}

/* the list of chats */
// The whole list once; the search box filters it here (it used to ask the server again on every key)
async function loadChats() {
    const response = await api('/api/chats');
    state.chats = (await response.json()).chats;
    renderChats();
}

function chatMatches(chat, q) {
    if (!q) return true;
    const number = q.replace(/\D/g, '');
    return chat.name.toLowerCase().includes(q) || (number !== '' && chat.id.split('@')[0].replace(/\D/g, '').includes(number));
}

function renderChats() {
    const list = document.getElementById('chats');
    if (!list) return;
    const q = (document.getElementById('chat-search')?.value ?? '').trim().toLowerCase();
    list.replaceChildren(...state.chats.filter(chat => chatMatches(chat, q)).slice(0, 300).map(chat => el('button', { class: `chat${chat.id === 'status@broadcast' ? ' status-chat' : ''}${state.chat === chat.id ? ' active' : ''}`, onclick: () => openChat(chat.id) },
        avatar(chat),
        el('div', { class: 'info' },
            el('div', { class: 'row' }, el('span', { class: 'name' }, chat.name), el('span', { class: 'when' }, chat.lastAt ? fmtDate(chat.lastAt) : '')),
            el('div', { class: 'row' },
                el('span', { class: 'last' }, chat.last ? `${chat.last.fromMe ? `${T.you}: ` : ''}${chat.last.deleted ? '🗑️ ' : ''}${chat.last.media && !chat.last.body ? '📎' : chat.last.body}` : ''),
                chat.deleted ? el('span', { class: 'badge', title: T.deleted }, chat.deleted) : null)))));
}

/* a chat */
// From a /watch match: the chat opens (oldest first) a little before the message, which is brought to the screen and flashes
async function jumpToMessage({ chat, id, at }) {
    document.querySelectorAll('.overlay').forEach(node => node.remove());
    await show('history');
    await openChat(chat, '', { id, at });
}

async function openChat(id, q = '', focus = null) {
    state.chat = id;
    state.from = focus ? Math.max(0, focus.at - 3600_000) : null;
    if (focus) state.mode = 'start';
    state.to = null;
    state.q = q;
    state.next = null;
    state.atEnd = false;
    document.querySelector('.app')?.classList.add('chat-open');
    renderChats();
    // Without the chat (a network failure on the phone), back to the list instead of an empty panel
    const info = await api(`/api/chat?chat=${encodeURIComponent(id)}`).then(r => r.json()).catch(() => null);
    if (!info?.id) { state.chat = null; state.info = null; closeChat(); renderChats(); return; }
    state.info = info;
    renderMain();
    await loadMessages(true);
    if (focus) {
        const find = () => [...document.querySelectorAll('.msg')].find(node => node.dataset.id === focus.id);
        for (let i = 0; i < 10 && !find() && state.next; i++) await loadMessages(false);
        const node = find();
        node?.scrollIntoView({ block: 'center' });
        node?.classList.add('flash');
    }
}

const startOfDay = (days) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - days); return d.getTime(); };
const inputToMs = (value) => (value ? new Date(value).getTime() : null);
const msToInput = (ms) => (ms ? new Date(ms - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '');

async function showContact(info) {
    if (document.querySelector('.contact-dialog')) return;
    const labels = T.contact;
    const details = el('div', { 'aria-live': 'polite' }, T.loading);
    const dialog = el('dialog', { class: 'modal contact-dialog', 'aria-label': labels.title },
        el('div', { class: 'contact-heading' },
            el('button', { class: 'contact-photo', type: 'button', title: labels.photo ?? info.name,
                'aria-label': labels.photo ?? info.name, onclick: () => showPhoto(info) }, avatar(info, null)),
            el('h3', {}, info.name)),
        details,
        el('div', { class: 'modal-actions' },
            el('button', { class: 'btn', onclick: () => dialog.close() }, labels.close)));
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    document.body.append(dialog);
    dialog.showModal();

    try {
        const response = await api(`/api/contact?chat=${encodeURIComponent(info.id)}`);
        if (!response.ok) throw new Error('contact');
        const profile = await response.json();
        if (!dialog.open) return;
        dialog.querySelector('h3').textContent = profile.name;
        const yesNo = value => value == null ? labels.unknown : (value ? labels.yes : labels.no);
        const fields = [
            [labels.phone, profile.phone || labels.unknown],
            [labels.profileName, profile.profileName !== profile.name ? profile.profileName : null],
            [labels.about, profile.about || labels.unknown],
            [labels.verified, profile.verified === true ? `🔵 ${labels.yes}` : yesNo(profile.verified)],
            [labels.business, profile.business == null ? null : yesNo(profile.business)],
            [labels.businessName, profile.businessName],
            [labels.description, profile.description],
            [labels.saved, profile.saved == null ? null : yesNo(profile.saved)],
            [labels.blocked, profile.blocked == null ? null : yesNo(profile.blocked)],
            [labels.lastSeen, profile.lastSeen ? fmtFull(profile.lastSeen) : null],
            [labels.lastStatus, profile.lastStatus ? el('button', {
                class: 'btn', onclick: () => { dialog.close(); jumpToMessage(profile.lastStatus); }
            }, fmtFull(profile.lastStatus.at)) : null]
        ];
        details.replaceChildren(el('dl', { class: 'contact-details' },
            fields.filter(([, value]) => value).flatMap(([label, value]) => [
                el('dt', {}, label), el('dd', {}, value)
            ])));
    } catch {
        if (dialog.open) details.textContent = labels.failed;
    }
}

function showPhoto(info) {
    const dialog = el('dialog', { class: 'modal contact-photo-dialog', 'aria-label': info.name },
        el('img', { src: `/api/photo?chat=${encodeURIComponent(info.id)}`, alt: info.name }),
        el('button', { class: 'btn', onclick: () => dialog.close() }, T.contact.close));
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    document.body.append(dialog);
    dialog.showModal();
}

function renderMain() {
    const info = state.info;
    const main = document.getElementById('main');
    const fromInput = el('input', { type: 'datetime-local', id: 'from', value: msToInput(state.from) });
    const toInput = el('input', { type: 'datetime-local', id: 'to', value: msToInput(state.to) });
    const apply = () => { state.from = inputToMs(fromInput.value); state.to = inputToMs(toInput.value); loadMessages(true); };
    const quick = (label, from) => el('button', { class: 'btn', onclick: () => { state.from = from; state.to = null; renderMain(); loadMessages(true); } }, label);
    const search = el('input', { type: 'search', placeholder: T.searchMsgs, value: state.q, onkeydown: (event) => { if (event.key === 'Enter') { state.q = event.target.value.trim(); loadMessages(true); } } });
    main.replaceChildren(
        el('div', { class: 'main-head' },
            el('button', { class: 'btn back', onclick: closeChat }, `← ${T.back}`),
            el('div', { class: 'grow' },
                el('button', { class: 'contact-trigger', title: T.contact.title, onclick: () => showContact(info) },
                    avatar(info), el('span', { class: 'name' }, info.name)),
                el('div', { class: 'sub', id: 'showing' }, '')),
            el('button', { class: 'btn', title: T.clearHistory, onclick: clearHistory }, '🧹')),
        el('div', { class: 'toolbar' },
            el('label', {}, T.from, fromInput), el('label', {}, T.to, toInput),
            el('button', { class: 'btn', onclick: apply }, T.apply),
            quick(T.all, null), quick(T.today, startOfDay(0)), quick(T.days7, startOfDay(7)), quick(T.days30, startOfDay(30)),
            el('span', { class: 'grow' }),
            search,
            el('a', { class: 'btn', href: exportUrl() }, `⬇ ${T.exportChat}`),
            el('label', {}, `↕ ${T.order}`, el('select', { onchange: (event) => { state.mode = event.target.value; localStorage.setItem('zb_order', state.mode); renderMain(); loadMessages(true); } },
                [['newest', T.newestFirst], ['recent', T.newestBottom], ['start', T.oldestFirst]].map(([value, label]) => el('option', { value, selected: state.mode === value }, label)))),
            el('button', { class: `btn${state.selecting ? ' on' : ''}`, onclick: () => { state.selecting = !state.selecting; state.selected = new Set(); renderMain(); loadMessages(true); } }, `☑ ${T.select}`),
            state.selecting ? el('button', { class: 'btn on', disabled: !state.selected.size, id: 'export-selected', onclick: exportSelected }, `⬇ ${T.exportSelected(state.selected.size)}`) : null),
        el('div', { class: 'messages', id: 'messages', onscroll: onScroll }));
}

/* delete the history of the open chat, keeping the deleted, the edited and the reacted messages */
async function clearHistory() {
    const chat = state.chat;
    const preview = await manage({ section: 'chat', op: 'preview', chat });
    if (preview.error) { messageBox(preview.error); return; }
    if (!preview.total) { messageBox(T.clearEmpty); return; }
    // By default the deleted, edited and reacted messages stay; the box deletes everything
    openForm({
        title: T.clearTitle(preview.name),
        fields: [{ type: 'note', name: 'info', text: T.clearInfo(preview) }, { type: 'checkbox', name: 'all', label: T.clearAll(preview.total) }],
        submitLabel: `🧹 ${T.clearBtn}`,
        onSubmit: async (body) => {
            if (!body.all && !preview.removed) return { error: T.clearNothing };
            const result = await manage({ section: 'chat', op: 'clear', chat, confirm: preview.name, all: body.all });
            if (result.error) return result;
            await loadChats();
            const info = await (await api(`/api/chat?chat=${encodeURIComponent(chat)}`)).json().catch(() => null);
            if (info?.id) { state.info = info; renderMain(); await loadMessages(true); }
            else { state.chat = null; showHistory(document.getElementById('content')); }
            return result;
        }
    });
}

// The big flush: the history of every chat, with the same box that also takes the deleted, edited and reacted ones
async function clearEverything() {
    const preview = await manage({ section: 'chat', op: 'previewAll' });
    if (preview.error) { messageBox(preview.error); return; }
    if (!preview.total) { messageBox(T.flushEmpty); return; }
    openForm({
        title: T.flushAll,
        fields: [
            { type: 'note', name: 'warning', text: T.flushWarning(preview.chats), warn: true },
            { type: 'note', name: 'info', text: T.clearInfo(preview) },
            { type: 'checkbox', name: 'all', label: T.clearAll(preview.total) }
        ],
        submitLabel: `🧹 ${T.flushBtn}`,
        onSubmit: async (body) => {
            if (!body.all && !preview.removed) return { error: T.clearNothing };
            const result = await manage({ section: 'chat', op: 'clearAll', confirm: preview.confirm, all: body.all });
            if (result.error) return result;
            state.chat = null;
            showHistory(document.getElementById('content'));
            return result;
        }
    });
}

async function exportSelected() {
    const response = await api('/api/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat: state.chat, ids: [...state.selected] }) });
    if (!response.ok) return;
    const blob = await response.blob();
    const link = el('a', { href: URL.createObjectURL(blob), download: /filename\*=UTF-8''([^;]+)/.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? 'chat.pdf' });
    document.body.append(link);
    link.click();
    link.remove();
}

const exportUrl = () => {
    const params = new URLSearchParams({ chat: state.chat });
    if (state.from) params.set('from', state.from);
    if (state.to) params.set('to', state.to);
    if (state.q) params.set('q', state.q);
    return `/api/export?${params}`;
};

function historyNotice() {
    const info = state.info;
    const from = state.from ?? info.firstAt;
    const to = state.to ?? info.lastAt;
    return el('div', { class: 'notice' },
        el('b', {}, T.history(info.name, fmtFull(from), fmtFull(to))), el('br'),
        T.counts(info.total, info.deleted, info.edited));
}

async function loadMessages(reset) {
    if (state.loading || (!reset && (state.atEnd || !state.next))) return;
    state.loading = true;
    const box = document.getElementById('messages');
    const params = new URLSearchParams({ chat: state.chat, order: state.mode === 'start' ? 'asc' : 'desc', limit: state.pageSize });
    if (state.from) params.set('from', state.from);
    if (state.to) params.set('to', state.to);
    if (state.q) params.set('q', state.q);
    if (!reset && state.next) params.set('cursor', state.next);
    try {
        const data = reset ? await apiProgress(`/api/messages?${params}`, T.loadingFor(state.info?.name ?? '')) : await (await api(`/api/messages?${params}`)).json();
        if (!Array.isArray(data.messages)) throw new Error('bad answer');
        const list = state.mode === 'recent' ? data.messages.slice().reverse() : data.messages;
        state.next = data.next;
        state.atEnd = !data.next;
        if (reset) {
            box.replaceChildren(historyNotice());
            if (!list.length) box.append(el('div', { class: 'empty' }, T.noMessages));
        }
        const nodes = withDays(list);
        if (state.mode === 'recent' && !reset) {
            const before = box.scrollHeight;
            const anchor = box.querySelector('.notice').nextSibling;
            nodes.forEach(node => box.insertBefore(node, anchor));
            box.scrollTop = box.scrollHeight - before;
        } else {
            box.append(...nodes);
            if (reset) box.scrollTop = state.mode === 'recent' ? box.scrollHeight : 0;
        }
        if (reset && state.mode === 'recent') box.scrollTop = box.scrollHeight;
        box.querySelector('.more')?.remove();
        if (state.mode === 'recent') {
            // (older ones come when you scroll up)
        } else if (state.next) {
            box.append(el('button', { class: 'btn more', onclick: () => loadMessages(false) }, T.loadMore));
        } else if (list.length || !reset) {
            box.append(el('div', { class: 'notice more' }, T.noMore));
        }
        const shown = box.querySelectorAll('.msg');
        document.getElementById('showing').textContent = shown.length ? T.showing(fmtFull(Number(shown[0].dataset.at)), fmtFull(Number(shown[shown.length - 1].dataset.at))) : '';
    } catch (err) {
        console.error('messages', err);
        box.querySelector('.more')?.remove();
        box.append(el('button', { class: 'btn more', onclick: () => loadMessages(reset) }, `⚠ ${T.loadMore}`));
    } finally {
        state.loading = false;
    }
}

// A day chip before the first message of each day
function withDays(messages) {
    const nodes = [];
    let day = null;
    for (const message of messages) {
        const key = dayKey(message.at);
        if (key !== day) {
            nodes.push(el('div', { class: 'day' }, fmtDate(message.at)));
            day = key;
        }
        nodes.push(messageNode(message));
    }
    return nodes;
}

function onScroll(event) {
    const box = event.target;
    if (state.mode === 'recent' && box.scrollTop < 120) loadMessages(false);
    if (state.mode !== 'recent' && box.scrollHeight - box.scrollTop - box.clientHeight < 300) loadMessages(false);
}

/* start */
async function start() {
    const session = await (await fetch('/api/session', { credentials: 'same-origin' })).json();
    // The language is the bot's (zapbot.lang). What you pick with the button wins until the bot's language changes
    const botLang = String(session.lang ?? 'en').startsWith('pt') ? 'pt' : 'en';
    if (localStorage.getItem('zb_bot_lang') !== botLang) {
        localStorage.setItem('zb_bot_lang', botLang);
        localStorage.removeItem('zb_lang');
    }
    setLanguage(localStorage.getItem('zb_lang') || botLang);
    state.pageSize = session.pageSize ?? 100;
    state.refreshSeconds = session.refreshSeconds ?? 15;
    state.needsCode = Boolean(session.needsCode);
    state.version = session.version ?? '';
    if (!session.authenticated) return showLogin();
    startSessionChecks();
    startRefresh();

    const rail = el('nav', { class: 'rail' },
        ...[['home', '🏠', T.home], ['history', '💬', T.navHistory], ['notes', '📝', T.notes], ['alerts', '🔔', T.alerts], ['aliases', '⚡', T.aliases], ['schedule', '⏰', T.schedule], ['stats', '📊', T.stats], ['show', '🏴‍☠️', T.spy.nav], ['settings', '⚙️', T.settings]].map(([name, icon, label]) =>
            el('button', { class: `rail-btn${state.view === name ? ' active' : ''}`, 'data-view': name, title: label, 'aria-label': label, onclick: () => show(name) },
                el('span', { class: 'icon' }, icon), el('span', { class: 'cap' }, label))),
        el('span', { class: 'grow' }),
        el('button', { class: 'rail-btn', title: themeLabel(), 'aria-label': T.theme, onclick: () => { theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]; localStorage.setItem('zb_theme', theme); applyTheme(); start(); } },
            el('span', { class: 'icon' }, themeIcon()), el('span', { class: 'cap' }, T.theme)),
        el('button', { class: 'rail-btn', title: T.language, 'aria-label': T.language, onclick: () => { setLanguage(state.lang === 'pt' ? 'en' : 'pt', true); start(); } },
            el('span', { class: 'icon' }, state.lang === 'pt' ? 'PT' : 'EN'), el('span', { class: 'cap' }, T.language)),
        el('button', { class: 'rail-btn', title: T.logout, 'aria-label': T.logout, onclick: async () => { await fetch('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); showLogin(); } },
            el('span', { class: 'icon' }, '⏻'), el('span', { class: 'cap' }, T.logout)));
    root.replaceChildren(el('div', { class: 'shell' }, rail, el('div', { class: 'view', id: 'content' })));
    await show(state.view);
}

/* the sections (the icons on the left) */
async function show(view) {
    state.view = view;
    document.querySelectorAll('.rail-btn[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    const content = document.getElementById('content');
    content.replaceChildren();
    // A screen is never "Loading...": the bar in the middle goes from 0 to 100% while it loads
    const bar = progressBar(T.loading);
    bar.creep();
    try {
        if (view === 'home') await showHome(content);
        else if (view === 'notes') await showNotes(content);
        else if (view === 'stats') await showStats(content);
        else if (view === 'show') await showSpy(content);
        else if (['alerts', 'aliases', 'schedule', 'settings'].includes(view)) await showList(content, view);
        else await showHistory(content);
    } finally {
        bar.done();
    }
}

// A message search in every chat: the results replace the list; a click opens that chat with the same search
async function searchEverywhere(q) {
    if (!q) return loadChats();
    const { results } = await (await api(`/api/search?q=${encodeURIComponent(q)}`)).json();
    const list = document.getElementById('chats');
    list.replaceChildren(el('div', { class: 'notice' }, T.searchResults(results.length)), ...results.map(r => el('button', { class: 'chat', onclick: () => { state.q = q; openChat(r.chat, q); } },
        avatar({ id: r.chat, name: r.chatName }),
        el('div', { class: 'info' }, el('div', { class: 'row' }, el('span', { class: 'name' }, r.chatName), el('span', { class: 'when' }, fmtDate(r.at))),
            el('div', { class: 'last' }, `${r.fromMe ? `${T.you}: ` : (r.sender ? `${r.sender}: ` : '')}${r.deleted ? '🗑️ ' : ''}${r.body}`)))));
}

// The panel with no chat: on the phone it also has ← back, so it never hides the list without a way out
const closeChat = () => document.querySelector('.app')?.classList.remove('chat-open');
const emptyMain = () => [el('div', { class: 'main-head phone-only' }, el('button', { class: 'btn back', onclick: closeChat }, `← ${T.back}`)),
    el('div', { class: 'empty-main' }, T.pick)];

async function showHistory(content) {
    const searchBox = el('input', { id: 'chat-search', type: 'search', placeholder: T.search, oninput: renderChats });
    const globalBox = el('input', { id: 'global-search', type: 'search', placeholder: T.searchAll, onkeydown: (event) => { if (event.key === 'Enter') searchEverywhere(event.target.value.trim()); } });
    content.replaceChildren(el('div', { class: `app${state.chat && state.info ? ' chat-open' : ''}` },
        el('div', { class: 'side' },
            el('div', { class: 'side-head' }, el('span', { class: 'title' }, T.chats), el('button', { class: 'btn', title: T.flushAll, onclick: clearEverything }, '🧹')),
            el('div', { class: 'search' }, searchBox, globalBox),
            el('div', { class: 'chats', id: 'chats' })),
        el('div', { class: 'main', id: 'main' }, ...emptyMain())));
    await loadChats();
    if (state.chat && state.info) { renderMain(); await loadMessages(true); }
    else state.chat = null;
}

/* home: what the bot keeps */
const humanSize = (bytes) => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let n = bytes;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
};

async function showHome(content) {
    const bar = progressBar(T.loadingHome);
    let data;
    let stats;
    try {
        data = await apiProgress('/api/overview', '', { bar, from: 0, to: 40 });
        stats = await apiProgress('/api/stats?days=30', '', { bar, from: 40, to: 95 });
    } finally {
        bar.done();
    }
    const { counts, storage, retention } = data;
    const parts = [
        ['database', T.database, storage.database, humanSize(storage.database)],
        ['media', T.media, storage.media.bytes, `${humanSize(storage.media.bytes)} · ${T.files(storage.media.files)}`],
        ['notes', T.notesFiles, storage.notes.bytes, `${humanSize(storage.notes.bytes)} · ${T.files(storage.notes.files)}`],
        ['contacts', T.contacts, storage.contacts.bytes, `${humanSize(storage.contacts.bytes)} · ${T.files(storage.contacts.files)}`],
        ['backups', T.backups, storage.backups.bytes, `${humanSize(storage.backups.bytes)} · ${T.backupsCount(storage.backups.count)}`],
        ['temporary', T.temporary, storage.temporary.bytes, `${humanSize(storage.temporary.bytes)} · ${T.files(storage.temporary.files)}`]
    ];
    const sum = parts.reduce((n, p) => n + p[2], 0) || 1;
    const card = (label, value) => el('div', { class: 'card' }, el('div', { class: 'card-value' }, String(value)), el('div', { class: 'card-label' }, label));
    // Like the storage screen of a phone: the total, one segmented bar and, below, each kind with its color
    const storageCard = el('div', { class: 'storage' },
        el('div', { class: 'storage-head' }, el('span', { class: 'storage-total' }, humanSize(storage.total)), el('span', { class: 'muted grow' }, T.storage),
            el('button', { class: 'btn', title: T.cacheClean, onclick: () => cleanCache(storage) }, `🧹 ${T.cacheBtn}`)),
        el('div', { class: 'stack' }, parts.filter(([, , bytes]) => bytes > 0).map(([key, label, bytes]) => el('span', { class: `seg seg-${key}`, style: `width:${bytes / sum * 100}%`, title: `${label}: ${humanSize(bytes)}` }))),
        el('div', { class: 'storage-legend' }, parts.map(([key, label, bytes, text]) => el('div', { class: 'storage-item' },
            el('span', { class: `dot seg-${key}` }), el('div', {}, el('div', { class: 'storage-name' }, label), el('div', { class: 'muted' }, `${text} · ${Math.round(bytes / sum * 100)}%`))))));
    content.replaceChildren(el('div', { class: 'page' },
        el('div', { class: 'page-head' }, el('h2', {}, T.home), el('button', { class: 'btn', onclick: () => show('home') }, `↻ ${T.refresh}`)),
        storageCard,
        el('h3', {}, T.counts2),
        el('div', { class: 'cards' },
            card(T.chatsCount, counts.chats), card(T.messagesCount, counts.messages), card(T.deletedCount, counts.deleted), card(T.editedCount, counts.edited),
            card(T.reactionsCount, counts.reactions), card(T.withMedia, counts.withMedia), card(T.notesCount, counts.notes), card(T.tagsCount, counts.tags), card(T.protectedCount, counts.protectedTags)),
        data.span.firstAt ? el('p', { class: 'muted' }, `${T.span}: ${fmtFull(data.span.firstAt)} → ${fmtFull(data.span.lastAt)}`) : null,
        el('h3', {}, T.retention),
        el('div', { class: 'cards' },
            card(T.retText, T.days(retention.messageDays)), card(T.retMedia, T.days(retention.mediaDays)), card(T.retDeleted, T.days(retention.deletedDays)),
            card(T.retEdited, T.days(retention.editedDays)), card(T.retReactions, T.days(retention.reactionDays))),
        el('div', { class: 'section-head' }, el('h3', {}, `${T.statsOverview} · ${T.last30}`), el('button', { class: 'btn', onclick: () => show('stats') }, T.seeAllStats)),
        stats.totals.msgs ? statsBody(stats, { compact: true }) : el('div', { class: 'empty' }, T.noData)));
}

// The /cache of the home: each part with its size, or everything (with the warning); the notes are never in it
function cleanCache(storage) {
    const sized = (label, bytes) => `${label} · ${humanSize(bytes)}`;
    openForm({
        title: T.cacheClean,
        fields: [
            { type: 'checkbox', name: 'retention', label: T.cacheRetention },
            { type: 'checkbox', name: 'media', label: sized(T.media, storage.media.bytes) },
            { type: 'checkbox', name: 'temporary', label: sized(T.temporary, storage.temporary.bytes) },
            { type: 'checkbox', name: 'contacts', label: sized(T.contacts, storage.contacts.bytes) },
            { type: 'checkbox', name: 'backups', label: `${sized(T.backups, storage.backups.bytes)} · ${T.backupsCount(storage.backups.count)}` },
            { type: 'note', name: 'warning', text: T.cacheAllWarning, warn: true },
            { type: 'checkbox', name: 'all', label: T.cacheAll }
        ],
        submitLabel: `🧹 ${T.cacheBtn}`,
        onSubmit: async (body) => {
            if (!Object.values(body).some(Boolean)) return { error: T.cachePick };
            const result = await manage({ section: 'cache', op: 'clean', ...body, confirm: body.all ? 'everything' : undefined });
            if (result.error) return result;
            show('home');
            return result;
        }
    });
}

/* Show: what /show keeps (the deleted, the edited, the reactions, the statuses, the channels) and who is muted */
const SPY_KINDS = { deleted: '🗑️', edited: '✏️', reactions: '😀', status: '📸', channels: '📰' };
const SPY_ALERTS = [['show.alert.deleted', 'deleted'], ['show.alert.edited', 'edited'], ['show.alert.reaction', 'reactions'], ['show.alert.status', 'status']];

function showImage(src, alt) {
    const dialog = el('dialog', { class: 'modal contact-photo-dialog', 'aria-label': alt },
        el('img', { src, alt }), el('button', { class: 'btn', onclick: () => dialog.close() }, T.contact.close));
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    document.body.append(dialog);
    dialog.showModal();
}

async function showSpy(content) {
    const S = T.spy;
    state.spy ??= { kind: 'deleted', q: '', person: null };
    const summary = await (await api('/api/show')).json();
    const feed = el('div', { class: 'spy-feed' });
    const more = el('button', { class: 'btn' }, T.loadMore);
    const tabs = el('div', { class: 'spy-tabs' });
    const people = el('div', { class: 'spy-people' });
    // The selection: the cards picked (by click) to take out of the cache at once
    const picked = new Map();
    const pickAll = el('input', { type: 'checkbox', title: S.selectAll, onchange: (event) => {
        // Read once: each setPicked redraws the bar, which recomputes this checkbox
        const on = event.target.checked;
        for (const box of feed.querySelectorAll('.spy-card')) setPicked(box, on);
    } });
    const pickInfo = el('span', { class: 'muted grow' });
    const sweep = el('button', { class: 'btn', onclick: () => sweepPicked() }, '🧹');
    const bar = el('div', { class: 'spy-bar' }, el('label', { class: 'spy-all' }, pickAll, S.selectAll), pickInfo, sweep);
    let next = null;

    function setPicked(box, on) {
        box.classList.toggle('picked', on);
        box.querySelector('.spy-pick').checked = on;
        if (on) picked.set(box.dataset.id, box); else picked.delete(box.dataset.id);
        renderBar();
    }
    // Shift+click: from the last card clicked to this one, all take the state of this one
    let anchor = null;
    function clickCard(box, range) {
        const on = !box.classList.contains('picked');
        const cards = [...feed.querySelectorAll('.spy-card')];
        if (range && anchor?.isConnected) {
            window.getSelection()?.removeAllRanges();
            const [from, to] = [cards.indexOf(anchor), cards.indexOf(box)].sort((a, b) => a - b);
            for (const one of cards.slice(from, to + 1)) setPicked(one, on);
        } else setPicked(box, on);
        anchor = box;
    }
    function renderBar() {
        const total = feed.querySelectorAll('.spy-card').length;
        pickInfo.textContent = picked.size ? S.selected(picked.size) : S.selectHint;
        sweep.disabled = !picked.size;
        sweep.title = S.removeSelected(picked.size);
        pickAll.checked = Boolean(total) && picked.size === total;
        pickAll.indeterminate = picked.size > 0 && picked.size < total;
        bar.hidden = !total;
    }
    function sweepPicked() {
        if (!picked.size) return;
        const ids = [...picked.keys()];
        confirmBox({
            title: S.removeSelected(ids.length), text: S.removeText, submitLabel: `🧹 ${T.remove}`,
            action: async () => { const result = await manage({ section: 'show', op: 'delete', kind: state.spy.kind, ids }); if (!result.error) show('show'); return result; }
        });
    }

    const toggleMute = async (who) => {
        const result = await manage({ section: 'show', op: 'mute', number: who.number, name: who.name });
        if (result.error) messageBox(result.error); else show('show');
    };
    const pickPerson = (who) => { state.spy.person = who.number ? { number: who.number, name: who.name } : null; renderTabs(); renderPeople(); load(true); };

    function card(item) {
        const who = item.person;
        const body = item.kind === 'edited'
            ? [el('div', { class: 'spy-before' }, item.before ?? ''), el('div', { class: 'muted' }, '↓'), el('div', {}, item.after ?? '')]
            : item.kind === 'reactions'
                ? [el('div', { class: 'spy-reaction' }, `${item.reaction.from || '∅'} → ${item.reaction.to || S.removed}`), item.text ? el('div', { class: 'muted' }, item.text) : null]
                : [item.text ? el('div', {}, item.text) : null, item.media ? media(item) : null];
        const box = el('div', { class: 'spy-card', 'data-id': String(item.id), onclick: (event) => {
            // A click on the card (the checkbox included) picks it; the buttons, links and media keep their own
            if (event.target.closest('button, a, img')) return;
            clickCard(box, event.shiftKey);
        } },
            el('input', { type: 'checkbox', class: 'spy-pick', tabindex: '-1', title: S.selectOne }),
            avatar({ id: who.id ?? item.chat, name: who.name }),
            el('div', { class: 'spy-body' },
                el('div', { class: 'spy-head' },
                    el('button', { class: 'link', onclick: () => pickPerson(who) }, who.name),
                    who.muted ? el('span', { title: S.muted }, '🔇') : null,
                    el('span', { class: 'muted' }, fmtFull(item.at))),
                el('button', { class: 'link muted', title: S.openChat, onclick: () => jumpToMessage({ chat: item.chat, id: item.messageId, at: item.sentAt ?? item.at }) }, `💬 ${item.chatName}`),
                el('div', { class: 'spy-text' }, body)),
            el('div', { class: 'row-actions' },
                who.number ? el('button', { class: 'icon-btn', title: who.muted ? S.unmute : S.mute, onclick: () => toggleMute(who) }, who.muted ? '🔊' : '🔇') : null,
                el('button', { class: 'icon-btn', title: S.removeTitle, onclick: () => confirmBox({
                    title: S.removeTitle, text: S.removeText,
                    action: async () => { const result = await manage({ section: 'show', op: 'delete', kind: item.kind, id: item.id }); if (!result.error) show('show'); return result; }
                }) }, '🗑️')));
        return box;
    }

    function media(item) {
        const src = `/api/media?id=${encodeURIComponent(item.messageId)}`;
        return ['image', 'sticker'].includes(item.type)
            ? el('img', { class: 'spy-media', src, alt: S.media, loading: 'lazy', onclick: () => showImage(src, S.media) })
            : el('a', { class: 'btn', href: src, target: '_blank', rel: 'noopener' }, `📎 ${S.media}`);
    }

    async function load(reset) {
        const s = state.spy;
        const params = new URLSearchParams({ kind: s.kind, q: s.q });
        if (s.person) params.set('person', s.person.number);
        if (!reset && next) params.set('before', String(next));
        const page = await (await api(`/api/show/items?${params}`)).json();
        next = page.next;
        if (reset) { feed.replaceChildren(); picked.clear(); anchor = null; }
        if (reset && !page.items.length) feed.append(el('div', { class: 'empty' }, S.empty));
        feed.append(...page.items.map(card));
        more.hidden = !next;
        renderBar();
    }
    more.addEventListener('click', () => load(false));

    function renderTabs() {
        tabs.replaceChildren(...Object.entries(SPY_KINDS).map(([kind, icon]) => el('button', {
            class: `btn${state.spy.kind === kind ? ' on' : ''}`, onclick: () => { state.spy.kind = kind; renderTabs(); load(true); }
        }, `${icon} ${S.kinds[kind]} · ${summary.counts[kind]}`)),
        state.spy.person ? el('button', { class: 'btn chip', onclick: () => pickPerson({}) }, `👤 ${state.spy.person.name} ✕`) : el('span'));
    }

    const search = el('input', { type: 'search', placeholder: S.search, value: state.spy.q,
        onkeydown: (event) => { if (event.key === 'Enter') { state.spy.q = event.target.value.trim(); load(true); } } });
    const alerts = el('div', { class: 'spy-alerts' }, el('span', { class: 'muted' }, S.alerts),
        SPY_ALERTS.map(([key, kind]) => {
            const on = summary.alerts[key];
            return el('button', { class: `btn${on ? ' on' : ''}`, title: on ? S.alertOn : S.alertOff, onclick: async () => {
                const result = await manage({ section: 'setting', op: 'edit', id: key, value: on ? 'off' : 'on' });
                if (result.error) messageBox(result.error); else show('show');
            } }, `${on ? '🔔' : '🔕'} ${S.kinds[kind]}`);
        }));
    // The person picked gets the highlight; a click on it again (or on the ✕ of the chip) shows everyone
    function renderPeople() {
        people.replaceChildren(el('h3', {}, S.people),
            ...(summary.people.length ? summary.people.map(p => {
                const active = state.spy.person?.number === p.number;
                return el('div', { class: `spy-person${active ? ' active' : ''}`, onclick: (event) => {
                    if (!event.target.closest('.icon-btn')) pickPerson(active ? {} : p);
                } },
                avatar({ id: p.id, name: p.name }),
                el('div', { class: 'grow' }, el('span', { class: 'spy-name' }, p.name), p.muted ? el('span', { title: S.muted }, ' 🔇') : null,
                    el('div', { class: 'muted' }, `🗑️ ${p.deleted} · ✏️ ${p.edited} · 😀 ${p.reactions}`)),
                el('button', { class: 'icon-btn', title: p.muted ? S.unmute : S.mute, onclick: () => toggleMute(p) }, p.muted ? '🔊' : '🔇'));
            }) : [el('div', { class: 'muted' }, S.nobody)]));
    }

    renderTabs();
    renderPeople();
    content.replaceChildren(el('div', { class: 'page' },
        el('div', { class: 'page-head' }, el('h2', {}, `🏴‍☠️ ${S.nav}`), el('span', { class: 'muted grow' }, `${S.subtitle} · ${S.mutedCount(summary.mutedCount)}`),
            el('button', { class: 'btn', onclick: () => show('show') }, `↻ ${T.refresh}`)),
        alerts, tabs, el('div', { class: 'search spy-search' }, search),
        el('div', { class: 'spy-layout' }, el('div', {}, bar, feed, more), people)));
    await load(true);
}

/* statistics: charts drawn as SVG (no library: the page has a strict CSP) */
const SVG = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...children) => {
    const node = document.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    for (const child of children.flat()) if (child != null && child !== false) node.append(child);
    return node;
};
const tip = (text) => svg('title', {}, document.createTextNode(text));
const num = (n) => Number(n).toLocaleString(locale);
const niceMax = (max) => { if (max <= 5) return Math.max(1, max); const p = 10 ** Math.floor(Math.log10(max)); return Math.ceil(max / p) * p; };
const shortDay = (day) => { const [, m, d] = day.split('-'); return `${d}/${m}`; };

/* bars (optionally stacked): series = [{ values, class, label }], labels = the x axis */
function barChart({ labels, series, height = 190, tipText, width = 560 }) {
    const W = width;
    const pad = { left: 38, right: 8, top: 10, bottom: 22 };
    const stacked = labels.map((_, i) => series.reduce((n, s) => n + s.values[i], 0));
    const max = niceMax(Math.max(0, ...stacked));
    const innerW = W - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const step = innerW / labels.length;
    const barW = Math.max(1, step * 0.72);
    const node = svg('svg', { viewBox: `0 0 ${W} ${height}`, class: 'chart', role: 'img' });
    for (const f of [0, 0.5, 1]) {
        const y = pad.top + innerH - innerH * f;
        node.append(svg('line', { x1: pad.left, x2: W - pad.right, y1: y, y2: y, class: 'grid' }), svg('text', { x: pad.left - 6, y: y + 4, class: 'axis', 'text-anchor': 'end' }, document.createTextNode(num(Math.round(max * f)))));
    }
    labels.forEach((label, i) => {
        let y = pad.top + innerH;
        const x = pad.left + step * i + (step - barW) / 2;
        const group = svg('g', {}, tip(tipText(i)));
        for (const s of series) {
            const h = max ? innerH * s.values[i] / max : 0;
            y -= h;
            if (h > 0) group.append(svg('rect', { x, y, width: barW, height: h, class: s.class, rx: barW > 6 ? 2 : 0 }));
        }
        group.append(svg('rect', { x: pad.left + step * i, y: pad.top, width: step, height: innerH, class: 'hit' }));
        node.append(group);
        const every = Math.ceil(labels.length / 8);
        if ((i % every === 0 && labels.length - 1 - i >= Math.ceil(every / 2)) || i === labels.length - 1) node.append(svg('text', { x: x + barW / 2, y: height - 6, class: 'axis', 'text-anchor': 'middle' }, document.createTextNode(label)));
    });
    return node;
}

/* lines: series = [{ values, class, label }] */
function lineChart({ labels, series, height = 150, tipText, width = 560 }) {
    const W = width;
    const pad = { left: 38, right: 8, top: 10, bottom: 22 };
    const max = niceMax(Math.max(0, ...series.flatMap(s => s.values)));
    const innerW = W - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;
    const x = (i) => pad.left + (labels.length === 1 ? innerW / 2 : innerW * i / (labels.length - 1));
    const y = (v) => pad.top + innerH - (max ? innerH * v / max : 0);
    const node = svg('svg', { viewBox: `0 0 ${W} ${height}`, class: 'chart', role: 'img' });
    for (const f of [0, 0.5, 1]) {
        const gy = pad.top + innerH - innerH * f;
        node.append(svg('line', { x1: pad.left, x2: W - pad.right, y1: gy, y2: gy, class: 'grid' }), svg('text', { x: pad.left - 6, y: gy + 4, class: 'axis', 'text-anchor': 'end' }, document.createTextNode(num(Math.round(max * f)))));
    }
    for (const s of series) node.append(svg('polyline', { points: s.values.map((v, i) => `${x(i)},${y(v)}`).join(' '), class: `line ${s.class}` }));
    labels.forEach((label, i) => {
        node.append(svg('rect', { x: x(i) - innerW / labels.length / 2, y: pad.top, width: innerW / labels.length, height: innerH, class: 'hit' }, tip(tipText(i))));
        const every = Math.ceil(labels.length / 8);
        if ((i % every === 0 && labels.length - 1 - i >= Math.ceil(every / 2)) || i === labels.length - 1) node.append(svg('text', { x: x(i), y: height - 6, class: 'axis', 'text-anchor': 'middle' }, document.createTextNode(label)));
    });
    return node;
}

function donut(parts) {
    const total = parts.reduce((n, p) => n + p.value, 0);
    const node = svg('svg', { viewBox: '0 0 120 120', class: 'donut', role: 'img' });
    const radius = 46;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    node.append(svg('circle', { cx: 60, cy: 60, r: radius, class: 'donut-bg' }));
    for (const part of parts) {
        const length = total ? circumference * part.value / total : 0;
        node.append(svg('circle', { cx: 60, cy: 60, r: radius, class: `donut-part ${part.class}`, 'stroke-dasharray': `${length} ${circumference - length}`, 'stroke-dashoffset': -offset, transform: 'rotate(-90 60 60)' }, tip(`${part.label}: ${num(part.value)}`)));
        offset += length;
    }
    node.append(svg('text', { x: 60, y: 64, 'text-anchor': 'middle', class: 'donut-num' }, document.createTextNode(num(total))));
    return node;
}

function heatmap(grid) {
    const max = Math.max(1, ...grid.flat());
    const cells = [el('span', { class: 'hm-corner' })];
    for (let h = 0; h < 24; h++) cells.push(el('span', { class: 'hm-hour' }, h % 3 === 0 ? String(h) : ''));
    grid.forEach((row, day) => {
        cells.push(el('span', { class: 'hm-day' }, T.weekdays[day]));
        row.forEach((value, hour) => cells.push(el('span', { class: 'hm-cell', style: `opacity:${value ? 0.12 + 0.88 * value / max : 0.05}`, title: `${T.weekdays[day]} ${String(hour).padStart(2, '0')}h: ${num(value)} ${T.msgsWord}` })));
    });
    return el('div', { class: 'heatmap' }, cells);
}

function rankList(items, total, { onClick, kind }) {
    const max = Math.max(1, ...items.map(i => i.msgs));
    return el('div', { class: 'ranking' }, items.map((item, i) => el(onClick ? 'button' : 'div', { class: 'rank', onclick: onClick ? () => onClick(item) : null },
        el('span', { class: 'rank-n' }, String(i + 1)),
        el('div', { class: 'rank-body' },
            el('div', { class: 'rank-line' }, el('span', { class: 'rank-name' }, item.name), el('span', { class: 'rank-val' }, `${num(item.msgs)} · ${total ? Math.round(item.msgs / total * 100) : 0}%`)),
            el('div', { class: 'rank-track', title: `${num(item.msgs)} ${T.msgsWord}, ${num(item.media)} ${T.mediaWord}` },
                el('span', { class: 'rank-text', style: `width:${(item.msgs - item.media) / max * 100}%` }), el('span', { class: 'rank-media', style: `width:${item.media / max * 100}%` }))),
        kind === 'chat' && (item.deleted || item.edited) ? el('span', { class: 'rank-flags', title: `${T.kDeleted}: ${item.deleted} · ${T.kEdited}: ${item.edited}` }, `${item.deleted ? `🗑️${item.deleted}` : ''}${item.edited ? ` ✏️${item.edited}` : ''}`) : null)));
}

function kpi(label, value, current, previous, extra = '') {
    let delta = null;
    if (typeof current === 'number' && typeof previous === 'number') {
        if (previous === 0 && current === 0) delta = null;
        else if (previous === 0) delta = { text: '▲ new', up: true };
        else {
            const pct = Math.round((current - previous) / previous * 100);
            delta = { text: `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)}%`, up: pct >= 0 };
        }
    }
    return el('div', { class: 'card kpi' }, el('div', { class: 'card-label' }, label), el('div', { class: 'card-value' }, value),
        delta ? el('div', { class: `delta ${delta.up ? 'up' : 'down'}`, title: T.vsPrevious }, delta.text) : el('div', { class: 'delta' }, extra));
}

/* the cards and the charts of a period (the page of the statistics and the home share them) */
function statsBody(data, { compact = false } = {}) {
    const { totals: now, previous } = data;
    const labels = data.perDay.map(d => shortDay(d.day));
    const dayTip = (i) => { const d = data.perDay[i]; return `${shortDay(d.day)}: ${num(d.msgs)} ${T.msgsWord} (${num(d.media)} ${T.mediaWord}) · 🗑️ ${d.deleted} · ✏️ ${d.edited}`; };
    const card = (title, body, wide = false) => el('div', { class: `chartcard${wide ? ' wide' : ''}` }, el('h3', {}, title), body);
    const busiest = now.busiestDay ? `${shortDay(now.busiestDay.day)} · ${num(now.busiestDay.msgs)}` : '—';

    return el('div', {},
        el('div', { class: 'cards kpis' },
            kpi(T.kMessages, num(now.msgs), now.msgs, previous.msgs), kpi(T.kMedia, num(now.media), now.media, previous.media),
            kpi(T.kDeleted, num(now.deleted), now.deleted, previous.deleted), kpi(T.kEdited, num(now.edited), now.edited, previous.edited),
            kpi(T.kActive, `${now.activeDays}/${data.days}`, now.activeDays, previous.activeDays), kpi(T.kAverage, num(now.perDay), now.perDay, previous.perDay),
            kpi(T.kBusiest, busiest, null, null), kpi(T.kPeak, now.peakHour == null ? '—' : `${String(now.peakHour).padStart(2, '0')}h`, null, null)),
        el('div', { class: 'charts' },
            card(T.cPerDay, el('div', {}, barChart({ labels, tipText: dayTip, width: 1120, height: 220, series: [{ values: data.perDay.map(d => d.msgs - d.media), class: 'bar-text' }, { values: data.perDay.map(d => d.media), class: 'bar-media' }] }),
                el('div', { class: 'legend' }, el('span', {}, el('i', { class: 'swatch bar-text' }), T.text), el('span', {}, el('i', { class: 'swatch bar-media' }), T.mediaWord))), true),
            card(T.cDeletedEdited, el('div', {}, lineChart({ labels, tipText: dayTip, series: [{ values: data.perDay.map(d => d.deleted), class: 'line-deleted' }, { values: data.perDay.map(d => d.edited), class: 'line-edited' }] }),
                el('div', { class: 'legend' }, el('span', {}, el('i', { class: 'swatch line-deleted' }), T.kDeleted), el('span', {}, el('i', { class: 'swatch line-edited' }), T.kEdited)))),
            card(T.cTypes, el('div', { class: 'donut-wrap' }, donut([{ value: now.msgs - now.media, class: 'bar-text', label: T.text }, { value: now.media, class: 'bar-media', label: T.mediaWord }]),
                el('div', { class: 'legend column' }, el('span', {}, el('i', { class: 'swatch bar-text' }), `${T.text}: ${num(now.msgs - now.media)}`), el('span', {}, el('i', { class: 'swatch bar-media' }), `${T.mediaWord}: ${num(now.media)}`)))),
            card(T.cHours, barChart({ labels: data.perHour.map((_, h) => `${String(h).padStart(2, '0')}h`), height: 160, tipText: (i) => `${String(i).padStart(2, '0')}h: ${num(data.perHour[i])} ${T.msgsWord}`, series: [{ values: data.perHour, class: 'bar-text' }] })),
            card(T.cHeat, heatmap(data.heatmap)),
            ...(compact ? [] : [card(T.cChats, rankList(data.chats, now.msgs, { kind: 'chat', onClick: (chat) => { state.chat = chat.id; show('history').then(() => openChat(chat.id)); } }), true),
            card(T.cPeople, rankList(data.people, now.msgs, { kind: 'person' }), true)])));
}

async function showStats(content, days = 30) {
    const data = await apiProgress(`/api/stats?days=${days}`, T.loadingStats);
    const { totals: now } = data;
    const period = el('select', { onchange: (event) => showStats(content, Number(event.target.value)) }, [7, 30, 90, 365].map(n => el('option', { value: n, selected: n === days }, T.days(n))));
    const head = el('div', { class: 'page-head' }, el('h2', {}, T.statsTitle), el('div', { class: 'toolbar-inline' }, el('label', {}, T.periodLabel, period), el('button', { class: 'btn', onclick: () => showStats(content, days) }, `↻ ${T.refresh}`)));
    const range = el('p', { class: 'muted' }, `${fmtDate(Date.parse(`${data.since}T12:00:00`))} → ${fmtDate(Date.parse(`${data.until}T12:00:00`))} · ${T.days(data.days)}`);
    content.replaceChildren(el('div', { class: 'page' }, head, range, now.msgs ? statsBody(data) : el('div', { class: 'empty' }, T.noData)));
}

/*
 * The settings of the web interface, on top of the Settings page: switches for the on/off ones, a box for numbers and
 * text, the login ones (only /set in WhatsApp changes them) as read-only, and a mark on the ones that need a restart.
 */
const WEB_GROUPS = [
    ['🔌', 'webAccess', ['zapbot.web.enabled', 'zapbot.web.host', 'zapbot.web.port', 'zapbot.web.url', 'zapbot.web.trustProxy']],
    ['🔐', 'webLogin', ['zapbot.web.login', 'zapbot.web.password', 'zapbot.web.totp', 'zapbot.web.sessionHours', 'zapbot.web.sessionTimeout']],
    ['🖥️', 'webScreen', ['zapbot.web.pageSize', 'zapbot.web.refreshSeconds']],
    ['🔔', 'webAlerts', ['zapbot.web.warnAccess', 'zapbot.web.warnChangedPhone']]
];

function webSettingsPanel(data, refresh) {
    const section = data.sections[0];
    const at = (key) => section.ids.indexOf(key);
    const restart = new Set(data.web?.restartKeys ?? []);

    const row = (key) => {
        const i = at(key);
        if (i < 0) return null;
        const [, current, fallback, desc] = section.rows[i];
        const meta = section.values[i];
        const status = el('span', { class: 'muted wp-status' });
        const save = async (value) => {
            const result = await manage({ section: 'setting', op: 'edit', id: key, value: String(value) });
            if (result.error) { status.textContent = `⚠ ${result.error}`; status.classList.add('error'); return; }
            status.classList.remove('error');
            status.textContent = `✔ ${T.saved}`;
            setTimeout(refresh, 700);
        };
        let control;
        const forced = data.web?.overridden?.[key];
        const env = forced?.env;
        if (env) control = el('span', { class: 'muted', title: T.envForced(env) }, `🔧 ${forced.value} · ${env}`);
        else if (meta.protected) control = el('span', { class: 'muted', title: T.protectedHere }, `🔒 ${meta.secret ? (current ? '••••••••' : T.notSet) : (current || T.notSet)}`);
        else if (meta.type === 'boolean') control = el('input', { type: 'checkbox', class: 'switch', checked: meta.value === 'true', onchange: (event) => save(event.target.checked) });
        else if (meta.type === 'number') control = el('input', { type: 'number', value: meta.value, onchange: (event) => save(event.target.value) });
        else control = el('input', { type: 'text', value: meta.value, onchange: (event) => save(event.target.value) });
        const changed = !meta.protected && String(meta.value) !== String(fallback);
        return el('div', { class: 'wp-row' },
            el('div', { class: 'wp-name' }, el('code', {}, key.replace('zapbot.web.', '')), restart.has(key) ? el('span', { class: 'badge', title: T.needsRestart }, '⟳') : null),
            el('div', { class: 'wp-control' }, control,
                changed && !env ? el('button', { type: 'button', class: 'icon-btn', title: T.reset, onclick: async () => { await manage({ section: 'setting', op: 'delete', id: key }); refresh(); } }, '↺') : null, status),
            el('div', { class: 'wp-desc muted' }, desc));
    };

    return el('div', { class: 'section webpanel' },
        el('div', { class: 'section-head' }, el('h3', {}, `🌐 ${T.webPanel}`), data.web?.url ? el('span', { class: 'muted' }, `${T.webAt} `, el('a', { class: 'link', href: data.web.url, target: '_blank', rel: 'noopener' }, data.web.url)) : null),
        el('div', { class: 'wp-groups' }, WEB_GROUPS.map(([icon, name, keys]) => el('div', { class: 'wp-group' }, el('h4', {}, `${icon} ${T[name]}`), keys.map(row)))));
}

/* the read-only lists: alerts, shortcuts, schedule, stats and settings */
function cellNode(cell, row = {}) {
    if (cell && typeof cell === 'object' && 'bell' in cell) {
        const title = cell.play ? (cell.bell ? T.runOn : T.runOff) : (cell.bell ? T.noticeOff : T.noticeOn);
        return el('button', { class: 'bell', title, onclick: row.toggle }, cell.icon ?? (cell.bell ? '🔔' : '🔕'));
    }
    if (cell && typeof cell === 'object' && 'flags' in cell) {
        return el('span', { class: 'flagcell' }, cell.flags.map(flag => el('button', {
            class: `bell${flag.on ? '' : ' flag-off'}`, title: T.flag[flag.name][flag.on ? 0 : 1], onclick: () => row.toggle?.({ flag: flag.name })
        }, flag.on ? flag.icons[0] : flag.icons[1])));
    }
    if (cell && typeof cell === 'object' && 'bar' in cell) {
        return el('span', { class: 'barcell' }, el('span', { class: 'fill', style: `width:${Math.round(cell.bar * 100)}%` }), el('span', { class: 'num' }, cell.text));
    }
    if (cell && typeof cell === 'object' && 'date' in cell) return document.createTextNode(fmtFull(cell.date));
    if (cell && typeof cell === 'object' && 'link' in cell) return el('a', { href: '#', class: 'link', title: T.openInHistory, onclick: (event) => { event.preventDefault(); jumpToMessage(cell.link); } }, cell.text);
    if (cell && typeof cell === 'object' && 'title' in cell) return el('span', { class: 'hint', title: cell.title }, cell.text === 'presence' ? T.presenceSource : cell.text);
    return document.createTextNode(cell == null ? '' : String(cell));
}

// A short cell (a number, a date, a symbol) is never broken into pieces; a long text wraps
const isShort = (cell) => (cell && typeof cell === 'object' ? ('date' in cell || 'bar' in cell) : String(cell ?? '').length <= 28);

const cellText = (cell) => (cell && typeof cell === 'object' ? (cell.text ?? '') : String(cell ?? '')).toLowerCase();

/*
 * A contact picker: it searches the address book (and the groups) while you type and keeps the picked ones as chips.
 * field.single: only one. The value (pickerValue) is [{ id, name, group } | { email }], or the one (null: none).
 */
function peoplePicker(field, initial) {
    let chosen = Array.isArray(initial) ? [...initial] : [];
    const chips = el('div', { class: 'chips' });
    const results = el('div', { class: 'results' });
    const label = (p) => p.email ?? p.name ?? p.id;
    const draw = () => chips.replaceChildren(...chosen.map((p, i) => el('span', { class: 'chip', title: p.id ?? p.email }, `${p.email ? '✉️' : p.group ? '👥' : '👤'} ${label(p)}`,
        el('button', { type: 'button', class: 'chip-x', onclick: () => { chosen.splice(i, 1); draw(); } }, '×'))));
    const pick = (p) => {
        if (field.single) chosen = [p];
        else if (!chosen.some(c => (c.id && c.id === p.id) || (c.email && c.email === p.email))) chosen.push(p);
        input.value = '';
        results.replaceChildren();
        draw();
    };
    const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
    let found = [];
    const search = debounce(async () => {
        const q = input.value.trim();
        results.replaceChildren();
        found = [];
        if (q.length < 2) return;
        if (!field.single && EMAIL.test(q)) found.push({ email: q });
        try {
            found.push(...(await (await api(`/api/contacts?q=${encodeURIComponent(q)}`)).json()).people);
        } catch { /* the list stays with what it has */ }
        if (input.value.trim() !== q) return;
        results.replaceChildren(...(found.length ? found.map(p => el('button', { type: 'button', class: 'result', onclick: () => pick(p) },
            p.email ? T.useEmail(p.email) : `${p.group ? '👥' : '👤'} ${p.name}`, p.number ? el('span', { class: 'muted' }, ` +${p.number}`) : null))
            : [el('div', { class: 'muted' }, T.noMatches)]));
    }, 300);
    const input = el('input', { type: 'text', placeholder: field.single ? T.pickContact : T.searchContact, autocomplete: 'off',
        oninput: search,
        onkeydown: (event) => { if (event.key === 'Enter') { event.preventDefault(); if (found[0]) pick(found[0]); } } });
    const me = field.single ? null : el('button', { type: 'button', class: 'btn', onclick: async () => {
        try {
            const [self] = (await (await api('/api/contacts?q=eu')).json()).people;
            if (self) pick(self);
        } catch { /* not connected yet */ }
    } }, `👤 ${T.meBtn}`);
    const node = el('div', { class: 'people' }, chips, me, input, results, field.single ? null : el('div', { class: 'muted' }, T.privateChat));
    draw();
    node.pickerValue = () => (field.single ? (chosen[0] ?? null) : chosen);
    return node;
}

/* a table in a window (the history of a /watch rule or of a monitored contact) */
async function openHistory(kind, id) {
    const path = `/api/history/${kind}?${kind === 'watch' ? 'rule' : 'id'}=${encodeURIComponent(id)}`;
    let data;
    try {
        data = await apiProgress(path, T.loadingHistory);
    } catch (err) {
        messageBox(String(err.message ?? err));
        return;
    }
    const close = () => overlay.remove();
    const body = data.rows.length
        ? el('div', { class: 'tablewrap' }, el('table', {}, el('thead', {}, el('tr', {}, data.columns.map(c => el('th', {}, T.col[c] ?? c)), kind === 'monitor' ? el('th', {}) : null)),
            el('tbody', {}, data.rows.map((row, i) => el('tr', {}, row.map(cell => el('td', { class: isShort(cell) ? 'nowrap' : '' }, cellNode(cell))),
                kind === 'monitor' ? el('td', { class: 'row-actions' }, el('button', { class: 'icon-btn', title: T.removeReading, onclick: async () => {
                    const result = await manage({ section: 'monitorReading', op: 'delete', id: data.ids[i] });
                    if (result.error) { messageBox(result.error); return; }
                    close();
                    openHistory(kind, id);
                } }, '🗑️')) : null)))))
        : el('div', { class: 'empty' }, T.noHistory);
    const overlay = el('div', { class: 'overlay', onclick: (event) => { if (event.target === overlay) close(); } },
        el('div', { class: 'modal wide' }, el('h3', {}, `📜 ${T.historyOf(data.title, data.total)}`), body,
            el('div', { class: 'modal-actions' }, el('button', { type: 'button', class: 'btn', onclick: close }, T.cancel))));
    document.body.append(overlay);
}

/* a form in a window, from the field definitions of the section */
function openForm({ title, fields, values = {}, onSubmit, submitLabel = null, noCancel = false }) {
    const inputs = fields.map((field) => {
        const value = values[field.name] ?? '';
        let input;
        if (field.type === 'textarea') input = el('textarea', { rows: '4', placeholder: field.placeholder ?? '' }, String(value));
        else if (field.type === 'select') input = el('select', {}, field.options.map(([v, label]) => el('option', { value: v, selected: String(value) === String(v) }, label)));
        else if (field.type === 'checkbox') input = el('input', { type: 'checkbox', checked: Boolean(value) });
        else if (field.type === 'people') input = peoplePicker(field, value);
        else if (field.type === 'note') input = el('p', { class: field.warn ? 'warning' : 'muted' }, field.text);
        else if (field.type === 'datetime') input = el('input', { type: 'datetime-local', value: msToInput(Number(value) || (field.optional ? 0 : Date.now() + 3600_000)) });
        else input = el('input', { type: 'text', value: String(value), placeholder: field.placeholder ?? '' });
        return [field, input];
    });
    const error = el('div', { class: 'error' });
    const close = () => overlay.remove();
    const form = el('form', { class: 'modal', onsubmit: async (event) => {
        event.preventDefault();
        const body = {};
        for (const [field, input] of inputs) {
            if (field.type === 'note') continue;
            body[field.name] = field.type === 'checkbox' ? input.checked : field.type === 'datetime' ? inputToMs(input.value) : field.type === 'people' ? input.pickerValue() : input.value;
        }
        const result = await onSubmit(body);
        if (result?.error) { error.textContent = result.error; return; }
        close();
    } },
    el('h3', {}, title),
    inputs.map(([field, input]) => field.type === 'note' ? input : el(field.type === 'people' ? 'div' : 'label', { class: field.type === 'checkbox' ? 'check' : 'field' }, el('span', {}, T.col[field.label] ?? field.label), input)),
    error,
    el('div', { class: 'modal-actions' }, noCancel ? null : el('button', { type: 'button', class: 'btn', onclick: close }, T.cancel), el('button', { type: 'submit', class: 'btn on' }, submitLabel ?? T.save)));
    const overlay = el('div', { class: 'overlay', onclick: (event) => { if (event.target === overlay) close(); } }, form);
    document.body.append(overlay);
    (form.querySelector('input:not([type=checkbox]), textarea') ?? form).focus();
}

// The page's own popups, never the browser's confirm() and alert(): a question whose action runs on the confirm (its
// error shows in the window), and a notice with only OK
function confirmBox({ title, text, submitLabel = `🗑️ ${T.remove}`, action }) {
    openForm({ title, fields: [{ type: 'note', name: 'info', text }], submitLabel, onSubmit: action });
}
function messageBox(text, title = T.notice) {
    openForm({ title, fields: [{ type: 'note', name: 'info', text }], submitLabel: 'OK', noCancel: true, onSubmit: async () => null });
}

async function manage(body) {
    const response = await api('/api/manage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    return response.ok ? data : { error: data.error ?? 'error' };
}

async function showList(content, view, days = 30) {
    const path = `/api/lists/${view}`;
    const data = await (await api(path)).json();
    const filter = el('input', { type: 'search', placeholder: T.filter });
    const sections = el('div', { class: 'sections' });

    const draw = () => {
        const q = filter.value.trim().toLowerCase();
        sections.replaceChildren(...data.sections.map(section => {
            const rest = (i) => view !== 'settings' || !String(section.ids[i]).startsWith('zapbot.web.'); // the web ones are in the panel above
            const indexes = section.rows.map((row, i) => i).filter(i => rest(i) && (!q || section.rows[i].some(cell => cellText(cell).includes(q))));
            const m = section.manage;
            const refresh = () => showList(content, view, days);
            const run = async (body) => { const result = await manage({ section: m.kind, ...body }); if (!result.error) refresh(); return result; };
            const buttons = (i) => el('td', { class: 'row-actions' },
                m.history ? el('button', { class: 'icon-btn', title: T.historyBtn, onclick: () => openHistory(m.history, section.ids[i]) }, '📜') : null,
                m.canEdit && !section.values[i].protected ? el('button', { class: 'icon-btn', title: T.edit, onclick: () => openForm({
                    title: `${T.edit} · ${section.ids[i]}`, fields: (m.editFields ? m.fields.filter(f => m.editFields.includes(f.name)) : m.fields).filter(f => !f.addOnly), values: section.values[i],
                    onSubmit: (body) => run({ op: 'edit', ...(m.idField ? { [m.idField]: section.ids[i] } : { id: section.ids[i] }), ...body })
                }) }, '✏️') : null,
                m.canDelete && !section.values[i].protected ? el('button', { class: 'icon-btn', title: m.deleteLabel ? T.reset : T.remove, onclick: async () => {
                    confirmBox({
                        title: m.deleteLabel ? T.reset : T.remove,
                        text: `${m.deleteLabel ? T.confirmReset : T.confirmDelete} ${section.rows[i].map(cell => (cell && typeof cell === 'object' ? cell.text ?? '' : String(cell ?? ''))).filter(Boolean).slice(0, 3).join(' · ')}`,
                        submitLabel: m.deleteLabel ? `↺ ${T.reset}` : `🗑️ ${T.remove}`,
                        action: () => run({ op: 'delete', id: section.ids[i] })
                    });
                } }, m.deleteLabel ? '↺' : '🗑️') : (section.values[i].protected ? el('span', { class: 'muted', title: T.protectedSetting }, '🔒') : null));
            const hasActions = m.canEdit || m.canDelete || m.history;
            const table = indexes.length
                ? el('table', {}, el('thead', {}, el('tr', {}, section.columns.map(c => el('th', {}, T.col[c] ?? c)), hasActions ? el('th', {}, T.actions) : null)),
                    el('tbody', {}, indexes.map((i) => {
                        // The same "off" look for every row that can be paused/muted (the one cell with a bell/play state)
                        const stateCell = section.rows[i].find(cell => cell && typeof cell === 'object' && 'bell' in cell);
                        return el('tr', { class: stateCell && !stateCell.bell ? 'row-off' : '' }, section.rows[i].map(cell => el('td', { class: isShort(cell) ? 'nowrap' : '' }, cellNode(cell, { toggle: (extra = {}) => run({ op: 'toggle', id: section.ids[i], ...extra }) }))), hasActions ? buttons(i) : null);
                    })))
                : el('div', { class: 'empty' }, T.empty);
            const add = m.canAdd ? el('button', { class: 'btn on', onclick: () => openForm({ title: `${T.add} · ${T.sec[section.title] ?? section.title}`, fields: m.fields, values: {}, onSubmit: (body) => run({ op: 'add', ...body }) }) }, `＋ ${T.add}`) : null;
            return el('div', { class: 'section' }, el('div', { class: 'section-head' }, el('h3', {}, `${view === 'settings' ? T.restSettings : (T.sec[section.title] ?? section.title)} · ${T.rows(indexes.length)}`), add), el('div', { class: 'tablewrap' }, table));
        }));
        if (view === 'settings') sections.prepend(webSettingsPanel(data, () => showList(content, view, days)));
    };
    filter.addEventListener('input', debounce(draw, 150));
    draw();

    content.replaceChildren(el('div', { class: 'page' },
        el('div', { class: 'page-head' }, el('h2', {}, T[view]), el('div', { class: 'toolbar-inline' }, filter, el('span', { class: 'muted' }, T.updatedAt(fmtTime(Date.now()))), el('button', { class: 'btn', onclick: () => show(view) }, `↻ ${T.refresh}`))),
        view === 'settings' ? el('p', { class: 'muted' }, T.readOnly) : null,
        sections));
}

/* notes */
async function showNotes(content) {
    const { tags } = await (await api('/api/notes/tags')).json();
    const list = el('div', { class: 'chats' });
    const total = tags.reduce((n, x) => n + x.total, 0);
    const item = (id, icon, name, count, description) => el('button', { class: `chat${state.notesTag === id ? ' active' : ''}`, onclick: () => { state.notesTag = id; showNotes(content); } },
        el('div', { class: 'avatar tag' }, icon),
        el('div', { class: 'info' }, el('div', { class: 'row' }, el('span', { class: 'name' }, name), el('span', { class: 'when' }, count)), description ? el('div', { class: 'last' }, description) : null));
    list.append(item('', '📚', T.allNotes, total, ''));
    for (const x of tags) list.append(item(x.id, x.protected ? (x.unlocked ? '🔓' : '🔒') : '🏷️', x.tag ? `#${x.tag}` : T.noTag, x.total, x.description));

    const side = el('div', { class: 'side' },
        el('div', { class: 'side-head' }, el('span', { class: 'title' }, T.notesTitle), el('span', { class: 'toolbar-inline' }, el('button', { class: 'btn on', title: T.newTag, onclick: () => openForm({
            title: T.newTag, fields: [{ name: 'tag', label: 'tag', type: 'text', placeholder: T.phTag, required: true }, { name: 'description', label: 'description', type: 'text', placeholder: T.phTagDesc, required: true }], values: {},
            onSubmit: async (body) => { const result = await manage({ section: 'tag', op: 'add', ...body }); if (!result.error) { state.notesTag = result.tag ?? body.tag.replace(/^#/, '').toLowerCase(); showNotes(content); } return result; }
        }) }, `＋ ${T.newTag}`), el('a', { class: 'btn', href: '/api/notes/pdf', title: T.exportAll }, `⬇ PDF`))),
        el('div', { class: 'search' }, el('input', { type: 'search', placeholder: T.searchNotes, value: state.notesQuery, onkeydown: (event) => { if (event.key === 'Enter') { state.notesQuery = event.target.value.trim(); showNotes(content); } } })),
        list);
    const main = el('div', { class: 'main' });
    content.replaceChildren(el('div', { class: `app${state.notesTag !== null ? ' chat-open' : ''}` }, side, main));
    await renderNotes(main, tags, content);
}

async function renderNotes(main, tags, content) {
    const current = tags.find(x => x.id === state.notesTag);
    const tag = current?.tag ?? '';
    const params = new URLSearchParams({ tag: state.notesTag });
    if (state.notesQuery) params.set('q', state.notesQuery);
    const { notes } = await (await api(`/api/notes?${params}`)).json();

    const head = el('div', { class: 'main-head' },
        el('button', { class: 'btn back', onclick: () => document.querySelector('.app').classList.remove('chat-open') }, `← ${T.back}`),
        el('div', { class: 'grow' }, el('div', { class: 'name' }, current ? (current.tag ? `#${current.tag}` : T.noTag) : T.allNotes), el('div', { class: 'sub' }, `${current?.description ? `${current.description} · ` : ''}${T.tagsCount2(current ? current.total : notes.length)}`)),
        current?.protected && !current.unlocked ? null : el('button', { class: 'btn on', onclick: () => openForm({
            title: `${T.newNote}${tag ? ` · #${tag}` : ''}`,
            fields: [{ name: 'text', label: 'text', type: 'textarea', required: true }, { name: 'tag', label: 'tag', type: 'text', placeholder: T.phNoteTag }, { name: 'alertAt', label: 'alert at', type: 'datetime', optional: true }],
            values: { tag, alertAt: 0 },
            onSubmit: async (body) => { const result = await manage({ section: 'note', op: 'add', ...body }); if (!result.error) { if (body.tag) state.notesTag = body.tag.replace(/^#/, '').toLowerCase(); showNotes(content); } return result; }
        }) }, `＋ ${T.newNote}`),
        tag ? el('button', { class: 'btn', title: T.editTagBtn, onclick: () => openForm({
            title: `${T.editTagBtn} · #${tag}`,
            fields: [{ name: 'tag', label: 'tag', type: 'text', required: true }, { name: 'description', label: 'description', type: 'text' }],
            values: { tag, description: current.description },
            onSubmit: async (body) => { const result = await manage({ section: 'tag', op: 'edit', id: tag, ...body }); if (!result.error) { state.notesTag = result.tag ?? tag; showNotes(content); } return result; }
        }) }, '✏️') : null,
        tag && current && !current.protected ? el('button', { class: 'btn', title: T.copyTag, onclick: () => openForm({
            title: `${T.copyTag} · #${tag}`,
            fields: [{ type: 'note', name: 'info', text: T.copyTagInfo(current.total) }, { name: 'tag', label: 'tag', type: 'text', required: true, placeholder: `${tag}-2` }],
            values: {},
            submitLabel: `📋 ${T.copyTag}`,
            onSubmit: async (body) => { const result = await manage({ section: 'tag', op: 'copy', id: tag, tag: body.tag }); if (!result.error) { state.notesTag = result.tag ?? tag; showNotes(content); } return result; }
        }) }, '📋') : null,
        tag && current && current.total && !current.protected ? el('button', { class: 'btn', title: T.moveTag, onclick: () => openForm({
            title: `${T.moveTag} · #${tag}`,
            fields: [{ type: 'note', name: 'info', text: T.moveTagInfo(current.total) }, ...tagPicker(tags, { except: tag, noTag: false })],
            values: {},
            submitLabel: `↪️ ${T.moveTag}`,
            onSubmit: async (body) => { const result = await manage({ section: 'tag', op: 'move', id: tag, tag: pickedTag(body) }); if (!result.error) { state.notesTag = result.tag ?? tag; showNotes(content); } return result; }
        }) }, '↪️') : null,
        tag && current ? el('button', { class: 'btn', title: current.total ? T.removeTagWithNotes : T.removeTag, onclick: async () => {
            if (!current.total) {
                confirmBox({
                    title: `${T.removeTag} · #${tag}`,
                    text: T.confirmRemoveTag,
                    submitLabel: `🗑️ ${T.removeTag}`,
                    action: async () => {
                        const result = await manage({ section: 'tag', op: 'delete', id: tag });
                        if (!result.error) { state.notesTag = ''; showNotes(content); }
                        return result;
                    }
                });
                return;
            }
            openForm({
                title: `${T.removeTagWithNotes} · #${tag}`,
                fields: [{ type: 'note', name: 'info', text: T.removeTagInfo(current.total) }],
                submitLabel: `🗑️ ${T.removeTag}`,
                onSubmit: async () => {
                    const result = await manage({ section: 'tag', op: 'delete', id: tag, confirm: tag });
                    if (result.error) return result;
                    state.notesTag = '';
                    showNotes(content);
                    return result;
                }
            });
        } }, '🗑️') : null,
        el('a', { class: 'btn', href: `/api/notes/pdf?tag=${encodeURIComponent(state.notesTag)}` }, `⬇ ${T.exportPdf}`),
        current?.protected && current.unlocked ? el('button', { class: 'btn', onclick: async () => { await postJson('/api/notes/lock', { tag }); showNotes(content); } }, `🔒 ${T.lockNow}`) : null);

    const body = el('div', { class: 'messages notes' });
    if (current?.protected && !current.unlocked) body.append(lockPanel(tag, content));
    else if (!notes.length) body.append(el('div', { class: 'empty' }, T.noNotes));
    else for (const note of notes) body.append(noteCard(note, !state.notesTag, content, tags));
    main.replaceChildren(head, body);
}

const postJson = (path, body) => fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function lockPanel(tag, content) {
    const input = el('input', { type: 'password', placeholder: T.password, autocomplete: 'off' });
    const error = el('div', { class: 'error' });
    const submit = async (event) => {
        event.preventDefault();
        const response = await postJson('/api/notes/unlock', { tag, password: input.value });
        input.value = '';
        if (response.ok) return showNotes(content);
        const body = await response.json().catch(() => ({}));
        error.textContent = response.status === 429 ? T.tagBlocked(body.minutes ?? 15) : T.wrongTag;
    };
    return el('form', { class: 'lockpanel', onsubmit: submit }, el('div', { class: 'lock-icon' }, '🔒'), el('h3', {}, `#${tag} · ${T.locked}`), el('p', { class: 'muted' }, T.lockedHint), input, el('button', { class: 'btn on', type: 'submit' }, T.unlock), error);
}

// Fields that pick a tag from the list (the protected ones and `except` stay out) or take a new name
function tagPicker(tags, { except = null, noTag = true } = {}) {
    const options = tags.filter(x => !x.protected && x.tag && x.tag !== except).map(x => [x.tag, `#${x.tag}`]);
    if (noTag && except !== '') options.unshift(['', T.noTag]);
    return [{ name: 'tag', label: T.pickTag, type: 'select', options }, { name: 'newTag', label: T.orNewTag, type: 'text', placeholder: T.phNoteTag }];
}
const pickedTag = (body) => (body.newTag ?? '').trim() || body.tag;

function noteCard(note, showTag, content, tags = []) {
    if (note.locked) {
        return el('div', { class: 'note locked' }, el('div', { class: 'note-head' }, `#${note.id} · 🔒 #${note.tag} · ${T.lockedNote}`),
            el('button', { class: 'btn', onclick: () => { state.notesTag = note.tag; showNotes(content); } }, T.unlock));
    }
    const [title, ...rest] = note.text.split('\n');
    // Pictures open big, videos and audio play right here (the download link is below); the rest is a file
    const media = note.media
        ? (note.media.mime.startsWith('image/')
            ? el('a', { href: note.media.url, target: '_blank', rel: 'noopener' }, el('img', { class: 'note-img', src: note.media.url, alt: note.media.name, loading: 'lazy' }))
            : note.media.mime.startsWith('video/')
                ? el('video', { class: 'note-video', src: note.media.url, controls: true, preload: 'metadata', playsinline: true })
                : note.media.mime.startsWith('audio/')
                    ? el('audio', { src: note.media.url, controls: true, preload: 'none' })
                    : el('div', { class: 'file' }, `📄 ${note.media.name}`))
        : null;
    const edit = () => openForm({
        title: `${T.edit} · #${note.id}`,
        fields: [{ name: 'text', label: 'text', type: 'textarea', required: true }, { name: 'tag', label: 'tag', type: 'text', placeholder: T.phNoteTag }, { name: 'alertAt', label: 'alert at', type: 'datetime', optional: true }],
        values: { text: note.text, tag: note.tag, alertAt: note.alertAt },
        onSubmit: async (body) => { const result = await manage({ section: 'note', op: 'edit', id: note.id, ...body }); if (!result.error) showNotes(content); return result; }
    });
    const move = () => openForm({
        title: `${T.moveNote} · #${note.id}`,
        fields: tagPicker(tags, { except: note.tag ?? '' }),
        values: {},
        submitLabel: `↪️ ${T.moveNote}`,
        onSubmit: async (body) => { const result = await manage({ section: 'note', op: 'move', id: note.id, tag: pickedTag(body) }); if (!result.error) showNotes(content); return result; }
    });
    const copy = () => openForm({
        title: `${T.copyNote} · #${note.id}`,
        fields: [{ type: 'note', name: 'info', text: T.copyNoteInfo }, ...tagPicker(tags)],
        values: { tag: note.tag ?? '' },
        submitLabel: `📋 ${T.copyNote}`,
        onSubmit: async (body) => { const result = await manage({ section: 'note', op: 'copy', id: note.id, tag: pickedTag(body) }); if (!result.error) showNotes(content); return result; }
    });
    const duplicate = async () => { const result = await manage({ section: 'note', op: 'copy', id: note.id }); if (!result.error) showNotes(content); };
    const remove = () => confirmBox({
        title: T.deleteNote,
        text: note.text ? (note.text.length > 160 ? `${note.text.slice(0, 160)}…` : note.text) : T.confirmDelete,
        action: async () => {
            const result = await manage({ section: 'note', op: 'delete', id: note.id });
            if (!result.error) showNotes(content);
            return result;
        }
    });
    return el('div', { class: `note${note.protected ? ' protected' : ''}` },
        el('div', { class: 'note-head' },
            el('span', {}, `#${note.id} · ${fmtFull(note.createdAt)}`),
            showTag && note.tag ? el('span', { class: 'tagchip' }, `#${note.tag}${note.protected ? ' 🔓' : ''}`) : null,
            note.alertAt ? el('span', { class: 'alertchip' }, `⏰ ${T.alertAt}: ${fmtFull(note.alertAt)}`) : null,
            el('span', { class: 'grow' }),
            el('button', { class: 'icon-btn', title: T.edit, onclick: edit }, '✏️'), ...(note.protected ? [] : [el('button', { class: 'icon-btn', title: T.duplicateNote, onclick: duplicate }, '📑'), el('button', { class: 'icon-btn', title: T.copyNote, onclick: copy }, '📋'), el('button', { class: 'icon-btn', title: T.moveNote, onclick: move }, '↪️')]), el('button', { class: 'icon-btn', title: T.remove, onclick: remove }, '🗑️')),
        media,
        el('div', { class: 'note-title' }, linkify(title)),
        rest.length ? el('div', { class: 'text' }, linkify(rest.join('\n'))) : null,
        note.media ? el('a', { class: 'dl', href: `${note.media.url}&download=1` }, `⬇ ${T.download}`) : null);
}

/* Session checks never count as activity. Only input from the user renews the idle deadline. */
let sessionTimer = null;
let lastActivity = 0;

function startSessionChecks() {
    if (sessionTimer) return;
    lastActivity = 0;
    sessionTimer = setInterval(() => api('/api/activity').catch(() => {}), 15_000);
}

function reportActivity(event) {
    const now = Date.now();
    if (!sessionTimer || !event.isTrusted || document.hidden || now - lastActivity < 5000) return;
    lastActivity = now;
    api('/api/activity', { method: 'POST', headers: { 'X-Zapbot-Activity': '1' } }).catch(() => {});
}

for (const event of ['pointerdown', 'keydown', 'wheel', 'touchmove']) {
    document.addEventListener(event, reportActivity, { capture: true, passive: true });
}

async function refreshReactions(box, chat) {
    const { top, bottom } = box.getBoundingClientRect();
    const visible = new Map();
    for (const node of box.querySelectorAll('.msg[data-id]')) {
        const position = node.getBoundingClientRect();
        if (position.bottom < top || position.top > bottom) continue;
        const panel = node.querySelector('.message-reactions');
        if (panel) visible.set(node.dataset.id, panel);
        if (visible.size === 200) break;
    }
    if (!visible.size) return;
    const data = await api('/api/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat, ids: [...visible.keys()] })
    }).then(response => response.json()).catch(() => null);
    if (state.chat !== chat || !box.isConnected) return;
    for (const message of data?.messages ?? []) {
        const panel = visible.get(message.id);
        if (panel?.isConnected) renderReactions(panel, message);
    }
}

/* new messages of the open chat (newest at the bottom, scrolled to the end): every zapbot.web.refreshSeconds */
let refreshTimer = null;
let refreshingHistory = false;
function startRefresh() {
    clearInterval(refreshTimer);
    if (!state.refreshSeconds) return;
    refreshTimer = setInterval(async () => {
        const box = document.getElementById('messages');
        // A tab in the background (the phone in the pocket) does not poll: on return the next tick catches up
        if (document.hidden || state.view !== 'history' || !state.chat || !box || state.loading || refreshingHistory) return;
        refreshingHistory = true;
        try {
            await refreshReactions(box, state.chat);
            if (!box.isConnected || state.mode === 'start' || state.q || state.selecting) return;
            const atEdge = state.mode === 'recent' ? box.scrollHeight - box.scrollTop - box.clientHeight <= 200 : box.scrollTop <= 200;
            if (!atEdge) return; // reading older ones: do not move the page
            const all = [...box.querySelectorAll('.msg')];
            const newest = state.mode === 'recent' ? all.at(-1) : all[0];
            const since = newest ? Number(newest.dataset.at) : state.info?.lastAt;
            if (!since) return;
            const params = new URLSearchParams({ chat: state.chat, order: 'asc', from: since, limit: 100 });
            if (state.to) return; // a closed period does not grow
            const data = await api(`/api/messages?${params}`).then(response => response.json()).catch(() => null);
            const seen = new Set([...box.querySelectorAll('.msg')].map(n => n.dataset.id));
            const fresh = (data?.messages ?? []).filter(m => !seen.has(m.id));
            if (!fresh.length) return;
            if (state.mode === 'recent') {
                box.append(...withDays(fresh));
                box.scrollTop = box.scrollHeight;
            } else {
                box.querySelector('.notice').after(...withDays(fresh.slice().reverse()));
            }
        } finally {
            refreshingHistory = false;
        }
    }, state.refreshSeconds * 1000);
}

function debounce(fn, ms) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

start().catch(() => showLogin());
