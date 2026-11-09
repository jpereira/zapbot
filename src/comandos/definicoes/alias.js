/*
 * /alias: Salva atalhos para comandos com argumentos
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/alias',
    usage: '/alias <nome> [-quiet|-q] [-desc|-d "Descrição"] </comando argumentos>  ou  /alias <nome> [-quiet|-q] [-desc|-d "Descrição"] <texto com {/comando}>  ou  /alias [-list|-l]  ou  /alias -move|-m <nome atual> <novo nome>  ou  /alias -rm <nome...|all>',
    aliases: [],
    summary: 'Salva atalhos para comandos com argumentos',
    help: 'Salva atalhos para comandos com argumentos ou para um texto com vários {/comando}, como no /cron: cada um roda e a resposta entra no lugar, numa mensagem só. No texto, \\n vira quebra de linha. Sem opção, lista os aliases cadastrados. No atalho de comando, $1, $2... pegam os argumentos digitados (ex: /alias /rec /sticker -ss $1 -es $2; /rec 10 20 url); a sintaxe com chaves e :- define um valor padrão (veja a documentação do /alias).  Ao executar o atalho, o bot imprime o comando chamado, acrescenta os argumentos adicionais e respeita as permissões dos comandos de destino. O nome aceita letras, números, _, - e ., com ou sem barra no cadastro. Cadastrar o mesmo nome substitui o comando e a descrição. O destino deve ser um comando ativo do bot, inclusive seus aliases fixos; não pode ser /alias nem outro atalho cadastrado. Nomes de comandos e all são reservados. Use /help alias para listar os atalhos disponíveis para você.',
    ex: [
        '/alias /dolar /crypto USD',
        '/alias orca Verificando Orca {/defi orca}\\n Verificando Prjx {/defi prjx}'
    ],
    cmd_opts: [
        {
            opts: ['quiet', 'q'],
            values: [],
            desc: 'Ao executar o atalho, não imprime o cabeçalho "🔗 Alias /nome -> comando".',
            ex: ['/alias -q /haha /me Hahaha!']
        },
        {
            opts: ['desc', 'd'],
            values: ['<texto>'],
            desc: 'Descrição opcional entre aspas retas ou curvas, inclusive misturadas, antes do comando ou do texto. Sem comando, atualiza só a descrição de um alias que já existe.',
            ex: ['/alias /eita -desc "Dólar" /cotacao USD', '/alias /eita -d "Novo texto"']
        },
        { opts: ['list', 'l'], values: [], desc: 'Lista os atalhos cadastrados.' },
        {
            opts: ['move', 'm'],
            values: ['<nome atual>', '<novo nome>'],
            desc: 'Renomeia um alias, mantendo o comando, a descrição e o quiet; o novo nome não pode existir.',
            ex: ['/alias -move /dolar /usd']
        },
        {
            opts: ['rm'],
            values: ['<nome...|all>'],
            desc: 'Remove um ou mais aliases (separados por espaço ou vírgula), com ou sem a barra; all remove todos.',
            ex: ['/alias -rm /eita', '/alias -rm eita eita2 /dolar', '/alias -rm all']
        }
    ],
    argumentosLivres: true,
    digitando: false, // responde na hora: sem o "digitando..."
    role: ADMIN // cria atalhos para qualquer comando
};
