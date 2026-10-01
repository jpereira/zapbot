/*
 * /defi: Solana (base58, PDA), the Orca accounts and the "Position Details".
 *
 * The fixtures in tests/fixtures/orca are real accounts (position, pool and the two
 * tick arrays of the range limits) and the Orca API replies, captured
 * together. The expected values of the fees and the amounts were checked
 * with the official SDK (@orca-so/whirlpools-core: collectFeesQuote and
 * decreaseLiquidityQuote).
 */
const bot = require('./helpers/bot');

const path = require('path');
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { OWNER, OTHERAlt, emails, nodemailer, network } = bot;
const solana = bot.src('defi/solana');
const orca = bot.src('defi/orca');
const { rangeBar } = bot.src('commands/defi');
const { checkAlertsDefi } = bot.src('defi/alerts');

const FIXTURES = path.join(__dirname, 'fixtures', 'orca');
const ACCOUNTS = require(path.join(FIXTURES, 'accounts.json'));
const API = {
    pool: require(path.join(FIXTURES, 'pool.json')),
    sol: require(path.join(FIXTURES, 'sol.json')),
    cbbtc: require(path.join(FIXTURES, 'cbbtc.json'))
};

const POSITION = 'ime16qBVbQBfByHQPME5gdCMhX9e2NqpL8UB5sJVPcg';
const NFT = '9UkHH3evduHjCojFxGGabCvRyRLsimbUY8iiNSaCoQqv';
const POOL = 'J7HzHnKDshpc5Dvc1zW6SvA8Ltkkwn1tpwtBUrnCbHCh';
const SOL = 'So11111111111111111111111111111111111111112';
const CBBTC = 'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij';
const REGISTRATION = `/defi -orca -position ${POSITION} -nft ${NFT} -pool ${POOL}`;

const account = (address) => Buffer.from(ACCOUNTS[address], 'base64');

// Simulated Solana RPC: returns the fixture accounts (the others do not exist)
function simulateSolana({ dono: owner = orca.WHIRLPOOL_PROGRAM, contas: accounts = ACCOUNTS } = {}) {
    network.responder('post', 'api.mainnet-beta.solana.com', (url, cfg) => {
        assert.equal(cfg.body.method, 'getMultipleAccounts');
        return { result: { value: cfg.body.params[0].map(e => (accounts[e] ? { data: [accounts[e], 'base64'], owner: owner } : null)) } };
    });
}

function simulateOrcaApi() {
    network.responder('get', `api.orca.so/v2/solana/pools/${POOL}`, API.pool);
    network.responder('get', `api.orca.so/v2/solana/tokens/${SOL}`, API.sol);
    network.responder('get', `api.orca.so/v2/solana/tokens/${CBBTC}`, API.cbbtc);
    network.responder('get', 'api.orca.so/v2/solana/tokens/orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE', new Error('não deveria buscar: recompensa zerada'));
}

beforeEach(async () => {
    await bot.restart();
    simulateSolana();
    simulateOrcaApi();
});

describe('Solana (defi/solana.js)', () => {
    test('base58 ida e volta, com zeros à esquerda', () => {
        for (const e of [POSITION, NFT, '11111111111111111111111111111111']) {
            assert.equal(solana.base58Encode(solana.base58Decode(e)), e);
        }
        assert.equal(solana.base58Decode('11111111111111111111111111111111').length, 32);
        assert.throws(() => solana.base58Decode('0OIl'), /caractere inválido/);
    });

    test('isEnderecoSolana', () => {
        assert.ok(solana.isEnderecoSolana(POSITION));
        assert.ok(!solana.isEnderecoSolana('abc'));
        assert.ok(!solana.isEnderecoSolana(`${POSITION}0`));
    });

    test('PDA: a posição sai do NFT, e os tick arrays da pool; PDAs ficam fora da curva', () => {
        assert.equal(orca.positionAddress(NFT), POSITION);
        assert.equal(orca.addressTickArray(POOL, -90112), 'DBXWJ7pvgGt3F4LJ3Q47BBPQYMUX58nTpQv8G6YzwdPX');
        assert.equal(orca.addressTickArray(POOL, -88704), '6uMwpdwsubtzQpJp4jhPYdGUHZxk74uCEK9zxfGTBGYE');
        assert.equal(solana.inCurve(solana.base58Decode(POSITION)), false);
        assert.equal(solana.inCurve(solana.base58Decode(NFT)), true, 'o mint do NFT é uma chave comum');
    });
});

describe('Orca (defi/orca.js)', () => {
    const position = orca.decodePosition(account(POSITION));
    const pool = orca.decodePool(account(POOL));
    const arrays = ['DBXWJ7pvgGt3F4LJ3Q47BBPQYMUX58nTpQv8G6YzwdPX', '6uMwpdwsubtzQpJp4jhPYdGUHZxk74uCEK9zxfGTBGYE']
        .map(e => orca.decodeTickArray(account(e)));
    const tickDe = (t) => {
        const a = arrays.find(x => x.inicio === orca.tickArrayStart(t, pool.tickSpacing));
        return a.ticks[(t - a.inicio) / pool.tickSpacing];
    };

    test('decodifica a posição e a pool', () => {
        assert.deepEqual([position.whirlpool, position.mint, position.liquidez, position.tickInferior, position.tickSuperior],
            [POOL, NFT, 470425599913n, -88720, -88320]);
        assert.deepEqual([pool.tickSpacing, pool.feeRate, pool.taxaProtocolo, pool.mintA, pool.mintB], [16, 1600, 1300, SOL, CBBTC]);
        assert.deepEqual(arrays.map(a => a.inicio), [-90112, -88704]);
    });

    test('taxas a coletar iguais às do SDK; quantidades iguais até o arredondamento', () => {
        const c = orca.calculatePosition({ posicao: position, pool, tickInf: tickDe(position.tickInferior), tickSup: tickDe(position.tickSuperior) });

        assert.equal(c.taxaA, 6249429909n);   // collectFeesQuote: feeOwedA
        assert.equal(c.taxaB, 821247n);       // collectFeesQuote: feeOwedB
        assert.ok(Math.abs(c.qtdA - 778160344025) / 778160344025 < 1e-9, `qtdA ${c.qtdA}`);   // decreaseLiquidityQuote
        assert.ok(Math.abs(c.qtdB - 1144829) / 1144829 < 1e-6, `qtdB ${c.qtdB}`);
        assert.equal(c.naFaixa, true);
        assert.deepEqual(c.recompensas.map(r => r.quantidade), [0n]);
    });

    test('fora da faixa: tudo num token só', () => {
        const below = { ...pool, sqrtPrice: pool.sqrtPrice / 2n, tickAtual: -100000 };
        const c = orca.calculatePosition({ posicao: position, pool: below, tickInf: tickDe(position.tickInferior), tickSup: tickDe(position.tickSuperior) });
        assert.equal(c.naFaixa, false);
        assert.ok(c.qtdA > 0);
        assert.equal(c.qtdB, 0);
    });

    test('tick array dinâmico: ticks vazios ocupam 1 byte', () => {
        const disc = require('crypto').createHash('sha256').update('account:DynamicTickArray').digest().subarray(0, 8);
        const tick = Buffer.alloc(112);
        tick.writeBigUInt64LE(77n, 32);   // fee_growth_outside_a
        const partsAlt = [disc, Buffer.alloc(4), Buffer.alloc(32), Buffer.alloc(16)];
        partsAlt[1].writeInt32LE(-1408);
        for (let i = 0; i < 88; i++) partsAlt.push(i === 2 ? Buffer.concat([Buffer.from([1]), tick]) : Buffer.from([0]));

        const a = orca.decodeTickArray(Buffer.concat(partsAlt));
        assert.equal(a.inicio, -1408);
        assert.equal(a.ticks[2].foraTaxaA, 77n);
        assert.equal(a.ticks[3].foraTaxaA, 0n);
        assert.throws(() => orca.decodeTickArray(Buffer.alloc(100)), /não é um tick array/);
    });

    test('barra da faixa', () => {
        assert.equal(rangeBar(5, 0, 10), '▕─────●─────▏ 50% da faixa');
        assert.equal(rangeBar(-1, 0, 10), '● ▕──────────▏');
        assert.equal(rangeBar(10, 0, 10), '▕──────────▏ ●');
    });
});

describe('/defi', () => {
    test('cadastra (conferindo NFT e pool), lista e mostra o Position Details', async () => {
        assert.deepEqual(await bot.replyAlt(REGISTRATION), [`✅ *Posição da Orca cadastrada:* ime1…VPcg\n💡 _Veja com /defi -show_`]);
        assert.deepEqual(await bot.dbGet('SELECT protocol, position, nft, pool FROM defi_positions'),
            { protocol: 'orca', position: POSITION, nft: NFT, pool: POOL });

        assert.match((await bot.replyAlt('/defi'))[0], /^🌊 \*Posições DeFi\* \(1\)\n\n1\. Orca · ime1…VPcg · pool J7Hz…bHCh _\(desde \d\d\/\d\d\/\d{4}\)_\n\n💡 /);

        const [r] = await bot.replyAlt('/defi -show');
        assert.match(r, /^🌊 \*Orca · SOL\/cbBTC\* · taxa 0\.16%\n📍 ime1…VPcg · ✅ dentro da faixa\n\n/);
        assert.match(r, /💰 \*Saldo:\* \$[\d,]+\.\d\d\n   • 778\.16\d* SOL \(\$[\d,.]+\)\n   • 0\.01145 cbBTC \(\$[\d,.]+\)/);
        assert.match(r, /📏 \*Faixa:\* 0\.00140324 – 0\.0014605 cbBTC por SOL\n🎯 \*Preço atual:\* 0\.00140382 cbBTC por SOL\n   ▕●──────────▏ 1% da faixa\n   _\(1 cbBTC = 712\.\d+ SOL\)_/);
        assert.match(r, /💸 \*Taxas a coletar:\* \$[\d,.]+\n   • 6\.2494 SOL \(\$[\d,.]+\)\n   • 0\.008212 cbBTC \(\$[\d,.]+\)/);
        assert.match(r, /📊 \*Rende ~\$[\d,.]+\/dia\* _\(estimativa: 2\.4\d% da liquidez ativa × as taxas 24h dos LPs\)_/);
        assert.match(r, /🏊 \*Pool:\* TVL \$9\.\d+M · volume 24h \$[\d.]+M · taxas 24h \$[\d.]+K$/);
        assert.doesNotMatch(r, /Recompensas/, 'recompensa zerada não aparece');

        // The dollar value uses Orca's price: 778.16 SOL × priceUsdc
        const usdSol = Number(API.sol.data.priceUsdc);
        assert.match(r, new RegExp(`778\\.16\\d* SOL \\(\\$${Math.round(778.16 * usdSol).toLocaleString('en-US').slice(0, 4)}`));
    });

    test('-show nº, -rm e as mensagens de lista vazia', async () => {
        await bot.replyAlt(REGISTRATION);
        assert.match((await bot.replyAlt('/defi -s 1'))[0], /Orca · SOL\/cbBTC/);
        assert.match((await bot.replyAlt('/defi -s 5'))[0], /❌ Posição nº 5 não existe/);

        assert.deepEqual(await bot.replyAlt('/defi -rm 1'), ['🗑️ Posição removida: ime1…VPcg']);
        assert.match((await bot.replyAlt('/defi -show'))[0], /🌊 Nenhuma posição cadastrada/);
        assert.match((await bot.replyAlt('/defi -l'))[0], /🌊 Nenhuma posição cadastrada/);
    });

    test('cadastro: só -position basta; erros de protocolo, endereço, conta, NFT, pool e repetida', async () => {
        const errorAlt = async (line, expected) => assert.match((await bot.replyAlt(line))[0], expected, line);

        await errorAlt(`/defi -position ${POSITION}`, /❌ Informe o protocolo: por enquanto só a Orca/);
        await errorAlt('/defi -orca', /❌ Informe o endereço da posição/);
        await errorAlt('/defi -orca -position xyz', /❌ -position: "xyz" não é um endereço da Solana/);
        await errorAlt(`/defi -orca -position ${POSITION} -nft ${POOL}`, /❌ O NFT .* não é o desta posição \(o dela é 9UkH/);
        await errorAlt(`/defi -orca -position ${POSITION} -pool ${NFT}`, /❌ A posição é da pool J7Hz.*, não da 9UkH/);
        await errorAlt(`/defi -orca -position ${POOL}`, /não é uma posição da Orca/);
        await errorAlt(`/defi -orca -position ${'1'.repeat(32)}`, /❌ A conta 1{32} não existe na Solana/);

        simulateSolana({ dono: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' });
        await errorAlt(`/defi -orca -position ${POSITION}`, /não é uma posição da Orca/);

        simulateSolana();
        await errorAlt(`/defi -orca -p ${POSITION}`, /✅ \*Posição da Orca cadastrada/);
        await errorAlt(REGISTRATION, /ℹ️ A posição ime1…VPcg já está cadastrada/);
    });

    test('RPC com limite ou posição fechada: avisa e sugere o defi.solana.rpc', async () => {
        await bot.replyAlt(REGISTRATION);

        network.responder('post', 'api.mainnet-beta.solana.com', { error: { code: 429, message: 'Too many requests' } });
        const [r] = await bot.replyAlt('/defi -show', { erroEsperado: true });
        assert.match(r, /⚠️ Não consegui ler a posição ime1…VPcg agora: RPC da Solana: Too many requests\.\n💡 _O RPC público da Solana limita as consultas; um RPC próprio vai no setting defi\.solana\.rpc\._/);

        simulateSolana({ contas: { [POOL]: ACCOUNTS[POOL] } });
        assert.match((await bot.replyAlt('/defi -show', { erroEsperado: true }))[0], /a posição não existe mais \(foi fechada\?\)/);
    });

    test('defi.solana.rpc: troca o RPC e só aceita URL', async () => {
        await bot.setSetting('defi.solana.rpc', 'https://meu-rpc.exemplo.com/?api-key=x');
        network.responder('post', 'meu-rpc.exemplo.com', { result: { value: [null] } });
        await bot.replyAlt(`/defi -orca -position ${POSITION}`);
        assert.match(network.chamadas.at(-1).url, /meu-rpc\.exemplo\.com/);

        await assert.rejects(bot.setSetting('defi.solana.rpc', 'não é url'), /URL inválida/);
    });

    test('só o dono', async () => {
        assert.deepEqual(await bot.replyAlt(REGISTRATION, { de: OTHERAlt.jid }), []);
    });
});

/*
 * The pool with the price way down (half the sqrtPrice), as in the "out of the
 * range" of calculatePosition: sqrtPrice is u128 at offset 65 and the current tick, i32 at 81.
 */
function rangePoolOutside() {
    const b = account(POOL);
    const half = solana.u128(b, 65) / 2n;
    b.writeBigUInt64LE(half & 0xffffffffffffffffn, 65);
    b.writeBigUInt64LE(half >> 64n, 73);
    b.writeInt32LE(-100000, 81);
    return b.toString('base64');
}

const rangeOutside = () => simulateSolana({ contas: { ...ACCOUNTS, [POOL]: rangePoolOutside() } });
const inRange = () => simulateSolana();

// A -alerta check; returns what the bot sent
async function check() {
    const beforeAlt = bot.client.enviadas.length;
    await checkAlertsDefi({ forcar: true });
    return bot.client.enviadas.slice(beforeAlt);
}

describe('/defi -alerta (-a)', () => {
    beforeEach(() => bot.replyAlt(REGISTRATION));

    test('liga no seu privado; avisa ao sair da faixa, uma vez; volta e sai: avisa de novo', async () => {
        const [r] = await bot.replyAlt('/defi -alerta 1');
        assert.match(r, /^🔔 \*Alerta do \/defi ligado\* \(1\)\n\n1\. Orca · ime1…VPcg · ✅ na faixa\n\n📣 Aviso: seu privado, sempre que a posição sair da faixa \(verificada a cada 10 minutos\)\./);
        assert.deepEqual(await check(), [], 'na faixa: nada');

        rangeOutside();
        const [notice] = await check();
        assert.equal(notice.chatId, OWNER.jid);
        assert.match(notice.content, /^🚨 \*DeFi: a posição ime1…VPcg saiu da faixa\*\n\n🌊 \*Orca · SOL\/cbBTC\*[\s\S]*⚠️ \*fora da faixa\* \(preço abaixo/);
        assert.match(notice.content, /💡 _Desligue com \/defi -alerta -rm 1\._$/);
        assert.deepEqual(await check(), [], 'continua fora: não repete');

        inRange();
        assert.deepEqual(await check(), []);
        rangeOutside();
        assert.equal((await check()).length, 1, 'saiu de novo: avisa');
    });

    test('a lista, o 🔔 no /defi -l e o -rm desliga', async () => {
        assert.match((await bot.replyAlt('/defi -a'))[0], /^🔕 Nenhum alerta no \/defi\./);
        await bot.replyAlt('/defi -a all');

        assert.match((await bot.replyAlt('/defi -alerta'))[0], /^🔔 \*Alertas do \/defi\* \(1\)\n\n1\. Orca · ime1…VPcg · ✅ na faixa → seu privado\n\n💡 _Verificados a cada 10 minutos\./);
        assert.match((await bot.replyAlt('/defi -l'))[0], /1\. Orca · ime1…VPcg · pool J7Hz…bHCh _\(desde [\d/]+\)_ 🔔\n/);

        assert.deepEqual(await bot.replyAlt('/defi -alerta -rm 1'), ['🔕 Alerta desligado: Orca · ime1…VPcg']);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM defi_positions')).n, 1, 'a posição fica');
        rangeOutside();
        assert.deepEqual(await check(), []);
        assert.deepEqual(await bot.replyAlt('/defi -a -rm all'), ['🔕 0 alertas desligados.']);
    });

    test('ligado já fora da faixa: só avisa depois de voltar e sair de novo', async () => {
        rangeOutside();
        assert.match((await bot.replyAlt('/defi -a 1'))[0], /1\. Orca · ime1…VPcg · ⚠️ fora da faixa _\(avisa quando voltar para a faixa e sair de novo\)_/);
        assert.deepEqual(await check(), []);
    });

    test('RPC fora: liga sem o estado e avisa na primeira leitura fora da faixa', async () => {
        network.responder('post', 'api.mainnet-beta.solana.com', { error: { code: 429, message: 'Too many requests' } });
        assert.match((await bot.replyAlt('/defi -a 1', { erroEsperado: true }))[0], /· ❔ ainda não lida/);
        assert.deepEqual(await check(), []);

        rangeOutside();
        assert.equal((await check()).length, 1);
    });

    test('-to: contato, grupo (com escolha) ou número', async () => {
        await bot.replyAlt('/defi -alerta 1 -to /Fulano/');
        rangeOutside();
        assert.equal((await check())[0].chatId, OTHERAlt.jid);

        bot.createGroup('120363000000000300@g.us', 'Cripto Rio', [OWNER.jid]);
        bot.createGroup('120363000000000301@g.us', 'Cripto SP', [OWNER.jid]);
        const r = await bot.replyChoosing('/defi -a 1 -to cripto', 2);
        assert.match(r[0], /^🔎 "cripto" corresponde a 2 grupos:\n\n1\. 👥 Cripto Rio\n2\. 👥 Cripto SP/);
        assert.match(r.at(-1), /📣 Aviso: 👥 Cripto SP, sempre que/);

        assert.match((await bot.replyAlt('/defi -a 1 -to +5521911111111'))[0], /📣 Aviso: 👤 Fulano,/);
        assert.match((await bot.replyAlt('/defi -a 1 -to xyz'))[0], /❌ Nenhum contato ou grupo com "xyz" no nome/);
        assert.match((await bot.replyAlt('/defi -a 1 -to'))[0], /❌ Informe o destino do -to/);
        assert.match((await bot.replyAlt('/defi -to email'))[0], /❌ O -to é do -alerta/);
        assert.match((await bot.replyAlt('/defi -a 7'))[0], /❌ Posição nº 7 não existe/);
    });

    test('-to email: pelo SMTP do bot, sem a formatação do WhatsApp', async () => {
        assert.match((await bot.replyAlt('/defi -a 1 -to email'))[0], /❌ O "email" usa o QRCODE_EMAIL_SMTP_TO/);
        assert.match((await bot.replyAlt('/defi -a 1 -to eu@exemplo.com'))[0], /❌ SMTP não configurado/);

        const env = { QRCODE_EMAIL_SMTP_HOST: 'smtp.exemplo.com', QRCODE_EMAIL_SMTP_USER: 'bot@exemplo.com', QRCODE_EMAIL_SMTP_TO: 'eu@exemplo.com' };
        Object.assign(process.env, env);
        try {
            assert.match((await bot.replyAlt('/defi -a 1 -to "email, outro@exemplo.com"'))[0], /📣 Aviso: 📧 eu@exemplo\.com, outro@exemplo\.com,/);

            rangeOutside();
            assert.deepEqual(await check(), [], 'nada no WhatsApp');
            const [m] = emails;
            assert.equal(m.to, 'eu@exemplo.com, outro@exemplo.com');
            assert.equal(m.subject, '[ZapBot] DeFi: a posição ime1…VPcg saiu da faixa');
            assert.match(m.text, /^🚨 DeFi: a posição ime1…VPcg saiu da faixa\n\n🌊 Orca · SOL\/cbBTC/);
            assert.doesNotMatch(m.text, /[*_]/);

            // An email that fails does not repeat on every check
            nodemailer.falhar = true;
            inRange();
            await check();
            rangeOutside();
            await checkAlertsDefi({ forcar: true });
            nodemailer.falhar = false;
            assert.equal(emails.length, 1);
            assert.equal((await bot.dbGet('SELECT in_range FROM defi_positions')).in_range, 0);
        } finally {
            for (const v of Object.keys(env)) delete process.env[v];
        }
    });
});
