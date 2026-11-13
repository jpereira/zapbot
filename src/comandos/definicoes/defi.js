/*
 * /defi: Posições DeFi (Orca, Project X, Liquidswap, Morpho e Aave)
 */

const { ADMIN } = require('../../roles').ROLES;

module.exports = {
    cmd: '/defi',
    usage: '/defi [protocol] [-mask]  or  /defi -l  or  /defi -rm <#...|all>  or  /defi [protocol] -taxas [-alerta]  or  /defi <protocol> <options>',
    summary: 'DeFi positions (Orca, Project X, Liquidswap, Morpho, and Aave)',
    help: 'Positions on Orca (Solana), Project X (HyperEVM), Liquidswap (Aptos), Morpho, and Aave V3, read on the spot: balance, range, and fees to collect for the liquidity ones; collateral, debt, and risk for the lending ones. With nothing, shows all; with the protocol, only its own. Each protocol has its own help.',
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
            values: ['<address>'],
            desc: 'Registers the Orca position by its address.',
            cron: false,
            protocolos: ['orca']
        },
        {
            opts: ['alerta', 'a'],
            values: ['[#|all|value]'],
            desc: 'Without #: lists the alerts. With # (or all): notifies when the position leaves the range and when it comes back, in your private chat or at the -to destinations (checked every defi.alerta.intervalMin minutes). With -rm: turns it off. When registering (with -address or -wallet), turns on the alert for the new position; the value is the fee limit in dollars (like -taxas).',
            ex: ['/defi -alerta 1', '/defi orca -address <address> -alerta 2000'],
            cron: false,
            protocolos: ['orca', 'prjx']
        },
        {
            opts: ['full', 'f'],
            values: [],
            desc: 'With aave: the position details (LTV, liquidation threshold, available borrows, APY of each asset, what is collateral, eMode, and isolation mode).',
            ex: ['/defi aave -full'],
            protocolos: ['aave']
        },
        {
            opts: ['list', 'l'],
            values: [],
            desc: 'Lists the registrations, with 🔔 on the ones that have an alert (and the fee limit). In your private chat, with full addresses; elsewhere, abbreviated.'
        },
        {
            opts: ['mask', 'm'],
            values: [],
            desc: 'Hides the wallet numbers with * ($**,***.**): balances, amounts, values, and yield. The fees to collect stay visible. The position (-address) and wallet (-wallet) addresses are also hidden, even in your private chat. Price, range, pool, Health Factor, LTV, and APY remain.',
            ex: ['/defi -mask', '/defi aave -m']
        },
        {
            opts: ['name', 'n'],
            values: ['<name>'],
            desc: 'With -address or -wallet: a name for the position or the wallet (optional, up to 40 characters), shown next to the address. Spaces allowed, with or without quotes. On one already registered, renames it.',
            ex: [
                '/defi orca -address <address> -n "Position X"',
                '/defi prjx -wallet <0x...> -n Hare Wallet'
            ],
            cron: false
        },
        {
            opts: ['nft'],
            values: ['<mint>'],
            desc: 'With orca -address: the position NFT (optional; the bot checks that it matches).',
            cron: false,
            protocolos: ['orca']
        },
        {
            opts: ['pool'],
            values: ['<address>'],
            desc: 'With orca -address: the pool (optional; the bot checks that it matches).',
            cron: false,
            protocolos: ['orca']
        },
        {
            opts: ['rm'],
            values: ['<#...|all>'],
            desc: 'Removes registration #N, several (-rm 1 3 or 1,3), or all; if any # does not exist, none is removed. Only turns off the alert of #N (or of all) (with -alerta).',
            cron: false
        },
        {
            opts: ['taxas'],
            values: ['[value|off]'],
            desc: 'Alone: the summary of fees to collect, in one message, with the range and price of each Orca and Project X position and the total in dollars (Liquidswap is included, but has nothing to collect; what is not registered shows up as such). With -alerta (without value), also shows the alert of each registration and how far it is from the fee limit. Together with -alerta <#|all>: also notifies when the fees to collect go over the value, in dollars (e.g.: -taxas 50); notifies once and again after you collect; off removes it.',
            ex: ['/defi -taxas', '/defi prjx -taxas', '/defi -taxas -alerta'],
            protocolos: ['orca', 'prjx']
        },
        {
            opts: ['to'],
            values: ['<destination>'],
            desc: 'Notifies a contact, a group, a number, or an email instead of your private chat (several with the name: you pick from the list) (with -alerta). Repeat to notify several.',
            ex: [
                '-to /Jorge Pereira/',
                '-to @Fulano (mention)',
                '-to /Grupo L200/ -to /Família/',
                '-to +5521999999999',
                '-to email (the QRCODE_EMAIL_SMTP_TO)',
                '-to you@example.com'
            ],
            cron: false,
            protocolos: ['orca', 'prjx']
        },
        {
            opts: ['wallet', 'w'],
            values: ['<0x...>'],
            desc: 'Registers the wallet (EVM: 0x and 40 hexadecimal characters; Aptos, on Liquidswap: 0x and up to 64): the bot reads all its open positions.',
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
            desc: 'The protocol: orca (Orca, on Solana), prjx (Project X, on HyperEVM), liquidswap or liqswp (Liquidswap, on Aptos), morpho (Morpho), or aave (Aave V3). Alone, shows only its positions.',
            ex: ['/defi', '/defi orca', '/defi liqswp', '/defi aave']
        }
    ],
    role: ADMIN, // carteiras e posições do dono
    cron: true,
    protocolos: {
        orca: {
            nome: 'Orca',
            usage: '/defi orca [-mask]  or  /defi orca -address <address> [-pool <address>] [-nft <mint>] [-name <name>] [-alerta [value]]',
            help: 'Liquidity positions on Orca (Whirlpools, on Solana): balance, range, price, and fees to collect, read on-chain. Each position is registered by its address (-address).',
            ex: ['/defi orca', '/defi orca -address <address> -alerta 2000']
        },
        prjx: {
            nome: 'Project X',
            usage: '/defi prjx [-mask]  or  /defi prjx -wallet <0x...> [-name <name>] [-alerta [value]]',
            help: 'Liquidity positions on Project X (on HyperEVM): balance, range, price, and fees to collect, read on-chain. Register the wallet (-wallet): the bot reads all its open positions.',
            ex: ['/defi prjx', '/defi prjx -wallet <0x...> -alerta']
        },
        liquidswap: {
            nome: 'Liquidswap',
            aliases: ['liqswp'],
            usage: '/defi liquidswap|liqswp [-mask]  or  /defi liquidswap -wallet <0x...> [-name <name>]',
            help: 'Liquidity positions on Liquidswap (the Pontem DEX, on Aptos, versions v0 and v0.5): the pool share, the balance of each token, and the price, read on-chain. Register the wallet (-wallet): the bot reads all its positions. Swap fees go into the pool and are already in the balance, so there is no range, no fees to collect, and no -alerta.',
            ex: ['/defi liquidswap', '/defi liqswp -wallet <0x...> -n Aptos Wallet']
        },
        morpho: {
            nome: 'Morpho',
            usage: '/defi morpho [-mask]  or  /defi morpho -wallet <0x...> [-name <name>]',
            help: 'Position, loans, and risk on Morpho (on Base and the networks in the setting defi.morpho.chains): collateral, debt, Health Rate, LTV, LLTV, and liquidation price of each market, and the vaults. Register the wallet (-wallet); without a registration, the one in MORPHO_WALLET_ADDRESS (or the setting defi.morpho.wallet) is used.',
            ex: ['/defi morpho', '/defi morpho -wallet <0x...>']
        },
        aave: {
            nome: 'Aave',
            usage: '/defi aave [-full] [-mask]  or  /defi aave -wallet <0x...> [-name <name>] [-full]',
            help: 'Position and risk on Aave V3, read on-chain from the official contracts (Ethereum and Base, setting defi.aave.chains): what was supplied and borrowed, the Health Factor of each network, and the net position. With -full, the details: LTV, liquidation threshold, available borrows, APY, what is collateral, eMode, and isolation mode. Register the wallet (-wallet); without a registration, the one in AAVE_WALLET_ADDRESS (or the setting defi.aave.wallet) is used.',
            ex: ['/defi aave', '/defi aave -full', '/defi aave -wallet <0x...> -n Wallet X']
        }
    }
};
