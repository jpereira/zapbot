/*
 * /defi: Posições DeFi (Orca, Project X, Liquidswap, Morpho e Aave)
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/defi',
    usage: '/defi [orca|prjx|liquidswap|morpho|aave] [-mask]  ou  /defi -l  ou  /defi -rm <nº...|all>  ou  /defi [protocolo] -taxas [-alerta]  ou  /defi -alerta <nº|all> [-to <destino>]... [-taxas <valor>]  ou  /defi <protocolo> <opções>',
    summary: 'Posições DeFi (Orca, Project X, Liquidswap, Morpho e Aave)',
    help: 'Posições da Orca (Solana), do Project X (HyperEVM), da Liquidswap (Aptos), do Morpho e do Aave V3, lidas na hora: saldo, faixa e taxas a coletar das de liquidez; colateral, dívida e risco das de empréstimo. Sem nada, mostra todas; com o protocolo, só as dele. Cada protocolo tem a sua ajuda.',
    ex: [
        '/defi orca -help',
        '/defi prjx -help',
        '/defi liquidswap -help',
        '/defi morpho -help',
        '/defi aave -help'
    ],
    cmd_opts: [
        {
            opts: ['address'],
            values: ['<endereço>'],
            desc: 'Cadastra a posição da Orca pelo endereço dela.',
            cron: false,
            protocolos: ['orca']
        },
        {
            opts: ['alerta', 'a'],
            values: ['[nº|all|valor]'],
            desc: 'Sem nº: lista os alertas. Com nº (ou all): avisa quando a posição sair da faixa e quando voltar, no seu privado ou nos destinos do -to (verificada a cada defi.alerta.intervalMin minutos). Com -rm: desliga. No cadastro (com -address ou -wallet), liga o alerta da posição nova; o valor é o limite das taxas em dólar (como o -taxas).',
            ex: ['/defi -alerta 1', '/defi orca -address <endereço> -alerta 2000'],
            cron: false,
            protocolos: ['orca', 'prjx']
        },
        {
            opts: ['full', 'f'],
            values: [],
            desc: 'Com aave: os detalhes da posição (LTV, liquidation threshold, available borrows, APY de cada ativo, o que é colateral, eMode e isolation mode).',
            ex: ['/defi aave -full'],
            protocolos: ['aave']
        },
        {
            opts: ['list', 'l'],
            values: [],
            desc: 'Lista os cadastros, com 🔔 nos que têm alerta (e o limite das taxas). No seu privado, com os endereços inteiros; fora dele, abreviados.'
        },
        {
            opts: ['mask', 'm'],
            values: [],
            desc: 'Esconde os números da carteira com * ($**,***.**): saldos, quantidades, valores e o rendimento. As taxas a coletar ficam visíveis. Os endereços da posição (-address) e da carteira (-wallet) também ficam ocultos, inclusive no privado. Preço, faixa, pool, Health Factor, LTV e APY continuam.',
            ex: ['/defi -mask', '/defi aave -m']
        },
        {
            opts: ['name', 'n'],
            values: ['<nome>'],
            desc: 'Com -address ou -wallet: um nome para a posição ou a carteira (opcional, até 40 caracteres), mostrado junto do endereço. Com espaços, com ou sem aspas. Numa já cadastrada, troca o nome.',
            ex: [
                '/defi orca -address <endereço> -n "Posição TAL"',
                '/defi prjx -wallet <0x...> -n Carteira Hare'
            ],
            cron: false
        },
        {
            opts: ['nft'],
            values: ['<mint>'],
            desc: 'Com orca -address: o NFT da posição (opcional; o bot confere se bate).',
            cron: false,
            protocolos: ['orca']
        },
        {
            opts: ['pool'],
            values: ['<endereço>'],
            desc: 'Com orca -address: a pool (opcional; o bot confere se bate).',
            cron: false,
            protocolos: ['orca']
        },
        {
            opts: ['rm'],
            values: ['<nº...|all>'],
            desc: 'Remove o cadastro nº N, vários (-rm 1 3 ou 1,3) ou todos; se algum nº não existe, nenhum sai. Junto com -alerta: só desliga o alerta da nº N (ou de todas).',
            cron: false
        },
        {
            opts: ['taxas'],
            values: ['[valor|off]'],
            desc: 'Sozinho: o resumo das taxas a coletar, numa mensagem, com a faixa e o preço de cada posição da Orca e do Project X e o total em dólar (a Liquidswap entra, mas não tem o que coletar; o que não está cadastrado aparece como tal). Com -alerta (sem valor), mostra também o alerta de cada cadastro e quanto falta para o limite das taxas. Junto com -alerta <nº|all>: avisa também quando as taxas a coletar passarem do valor, em dólar (ex.: -taxas 50); avisa uma vez e de novo depois de você coletar; off tira.',
            ex: ['/defi -taxas', '/defi prjx -taxas', '/defi -taxas -alerta'],
            protocolos: ['orca', 'prjx']
        },
        {
            opts: ['to'],
            values: ['<destino>'],
            desc: 'Junto com -alerta: avisa num contato, num grupo, num número ou por e-mail em vez do seu privado (vários com o nome: você escolhe na lista). Repita para avisar em vários.',
            ex: [
                '-to /Jorge Pereira/',
                '-to @Fulano (menção)',
                '-to /Grupo L200/ -to /Família/',
                '-to +5521999999999',
                '-to email (o QRCODE_EMAIL_SMTP_TO)',
                '-to voce@exemplo.com'
            ],
            cron: false,
            protocolos: ['orca', 'prjx']
        },
        {
            opts: ['wallet', 'w'],
            values: ['<0x...>'],
            desc: 'Cadastra a carteira (EVM: 0x e 40 caracteres hexadecimais; Aptos, na Liquidswap: 0x e até 64): o bot lê todas as posições abertas dela.',
            ex: [
                '/defi prjx -wallet <0x...>',
                '/defi liquidswap -wallet <0x...>',
                '/defi morpho -w <0x...>'
            ],
            protocolos: ['prjx', 'liquidswap', 'morpho', 'aave'],
            cron: false
        },
        {
            argv: ['[orca|prjx|liquidswap|morpho|aave]'],
            desc: 'O protocolo: orca (Orca, na Solana), prjx (Project X, na HyperEVM), liquidswap ou liqswp (Liquidswap, na Aptos), morpho (Morpho) ou aave (Aave V3). Sozinho, mostra só as posições dele.',
            ex: ['/defi', '/defi orca', '/defi liqswp', '/defi aave']
        }
    ],
    role: ADMIN, // carteiras e posições do dono
    cron: true,
    protocolos: {
        orca: {
            nome: 'Orca',
            usage: '/defi orca [-mask]  ou  /defi orca -address <endereço> [-pool <endereço>] [-nft <mint>] [-name <nome>] [-alerta [valor]]',
            help: 'Posições de liquidez da Orca (Whirlpools, na Solana): saldo, faixa, preço e taxas a coletar, lidos on-chain. Cada posição é cadastrada pelo endereço dela (-address).',
            ex: ['/defi orca', '/defi orca -address <endereço> -alerta 2000']
        },
        prjx: {
            nome: 'Project X',
            usage: '/defi prjx [-mask]  ou  /defi prjx -wallet <0x...> [-name <nome>] [-alerta [valor]]',
            help: 'Posições de liquidez do Project X (na HyperEVM): saldo, faixa, preço e taxas a coletar, lidos on-chain. Cadastre a carteira (-wallet): o bot lê todas as posições abertas dela.',
            ex: ['/defi prjx', '/defi prjx -wallet <0x...> -alerta']
        },
        liquidswap: {
            nome: 'Liquidswap',
            aliases: ['liqswp'],
            usage: '/defi liquidswap|liqswp [-mask]  ou  /defi liquidswap -wallet <0x...> [-name <nome>]',
            help: 'Posições de liquidez da Liquidswap (a DEX da Pontem, na Aptos, versões v0 e v0.5): a fatia da pool, o saldo de cada token e o preço, lidos on-chain. Cadastre a carteira (-wallet): o bot lê todas as posições dela. As taxas dos swaps entram na pool e já estão no saldo, então não há faixa, taxas a coletar nem -alerta.',
            ex: ['/defi liquidswap', '/defi liqswp -wallet <0x...> -n Carteira Aptos']
        },
        morpho: {
            nome: 'Morpho',
            usage: '/defi morpho [-mask]  ou  /defi morpho -wallet <0x...> [-name <nome>]',
            help: 'Posição, empréstimos e risco no Morpho (na Base e nas redes do setting defi.morpho.chains): colateral, dívida, Health Rate, LTV, LLTV e preço de liquidação de cada mercado, e os vaults. Cadastre a carteira (-wallet); sem cadastro, vale a do MORPHO_WALLET_ADDRESS (ou do setting defi.morpho.wallet).',
            ex: ['/defi morpho', '/defi morpho -wallet <0x...>']
        },
        aave: {
            nome: 'Aave',
            usage: '/defi aave [-full] [-mask]  ou  /defi aave -wallet <0x...> [-name <nome>] [-full]',
            help: 'Posição e risco no Aave V3, lidos on-chain nos contratos oficiais (Ethereum e Base, setting defi.aave.chains): o fornecido e o emprestado, o Health Factor de cada rede e a posição líquida. Com -full, os detalhes: LTV, liquidation threshold, available borrows, APY, o que é colateral, eMode e isolation mode. Cadastre a carteira (-wallet); sem cadastro, vale a do AAVE_WALLET_ADDRESS (ou do setting defi.aave.wallet).',
            ex: ['/defi aave', '/defi aave -full', '/defi aave -wallet <0x...> -n Carteira X']
        }
    }
};
