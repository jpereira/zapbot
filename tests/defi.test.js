/*
 * /defi: a Solana (base58, PDA), as contas da Orca e o "Position Details".
 *
 * As fixtures em tests/fixtures/orca são contas reais (posição, pool e os dois
 * tick arrays dos limites da faixa) e as respostas da API da Orca, capturadas
 * juntas. Os valores esperados das taxas e das quantidades foram conferidos
 * com o SDK oficial (@orca-so/whirlpools-core: collectFeesQuote e
 * decreaseLiquidityQuote).
 */
const bot = require('./helpers/bot');

const path = require('path');
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { DONO, OUTRO, emails, nodemailer, rede } = bot;
const solana = bot.src('defi/solana');
const orca = bot.src('defi/orca');
const { barraDaFaixa } = bot.src('comandos/defi');
const { verificarAlertasDefi } = bot.src('defi/alertas');

const FIXTURES = path.join(__dirname, 'fixtures', 'orca');
const CONTAS = require(path.join(FIXTURES, 'contas.json'));
const API = {
    pool: require(path.join(FIXTURES, 'pool.json')),
    sol: require(path.join(FIXTURES, 'sol.json')),
    cbbtc: require(path.join(FIXTURES, 'cbbtc.json'))
};

const POSICAO = 'Hz15TavvC8p9S7EihCbWa694kWFJGXFzs7AVpvWKRaPZ';
const NFT = 'C1MEDy3xt3gxiDtFkHt7HBWxxUVSarKZgt22FUzsKoji';
const POOL = 'CeaZcxBNLpJWtxzt58qQmfMBtJY8pQLvursXTJYGQpbN';
const SOL = 'So11111111111111111111111111111111111111112';
const CBBTC = 'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij';
const CADASTRO = `/defi -orca -position ${POSICAO} -nft ${NFT} -pool ${POOL}`;

const conta = (endereco) => Buffer.from(CONTAS[endereco], 'base64');

// RPC da Solana simulado: devolve as contas das fixtures (as outras não existem)
function simularSolana({ dono = orca.WHIRLPOOL_PROGRAMA, contas = CONTAS } = {}) {
    rede.responder('post', 'api.mainnet-beta.solana.com', (url, cfg) => {
        assert.equal(cfg.body.method, 'getMultipleAccounts');
        assert.equal(cfg.body.jsonrpc, '2.0', 'a versão do protocolo JSON-RPC (não a do bot)');
        return { result: { value: cfg.body.params[0].map(e => (contas[e] ? { data: [contas[e], 'base64'], owner: dono } : null)) } };
    });
}

function simularOrcaApi() {
    rede.responder('get', `api.orca.so/v2/solana/pools/${POOL}`, API.pool);
    rede.responder('get', `api.orca.so/v2/solana/tokens/${SOL}`, API.sol);
    rede.responder('get', `api.orca.so/v2/solana/tokens/${CBBTC}`, API.cbbtc);
    rede.responder('get', 'api.orca.so/v2/solana/tokens/orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE', new Error('não deveria buscar: recompensa zerada'));
}

beforeEach(async () => {
    await bot.reiniciar();
    simularSolana();
    simularOrcaApi();
});

describe('Solana (defi/solana.js)', () => {
    test('base58 ida e volta, com zeros à esquerda', () => {
        for (const e of [POSICAO, NFT, '11111111111111111111111111111111']) {
            assert.equal(solana.base58Codificar(solana.base58Decodificar(e)), e);
        }
        assert.equal(solana.base58Decodificar('11111111111111111111111111111111').length, 32);
        assert.throws(() => solana.base58Decodificar('0OIl'), /caractere inválido/);
    });

    test('isEnderecoSolana', () => {
        assert.ok(solana.isEnderecoSolana(POSICAO));
        assert.ok(!solana.isEnderecoSolana('abc'));
        assert.ok(!solana.isEnderecoSolana(`${POSICAO}0`));
    });

    test('PDA: a posição sai do NFT, e os tick arrays da pool; PDAs ficam fora da curva', () => {
        assert.equal(orca.enderecoDaPosicao(NFT), POSICAO);
        assert.equal(orca.enderecoTickArray(POOL, -90112), '9Sett7DnPWe4o1gRewuKh7epWxmSo4DC1dBBatcbQSrL');
        assert.equal(orca.enderecoTickArray(POOL, -88704), '7YYrbu4pV1AYhda4UE1uUqFmiMkuNjMeLunSxJ48ZMny');
        assert.equal(solana.naCurva(solana.base58Decodificar(POSICAO)), false);
        assert.equal(solana.naCurva(solana.base58Decodificar(NFT)), true, 'o mint do NFT é uma chave comum');
    });
});

describe('Orca (defi/orca.js)', () => {
    const posicao = orca.decodificarPosicao(conta(POSICAO));
    const pool = orca.decodificarPool(conta(POOL));
    const arrays = ['9Sett7DnPWe4o1gRewuKh7epWxmSo4DC1dBBatcbQSrL', '7YYrbu4pV1AYhda4UE1uUqFmiMkuNjMeLunSxJ48ZMny']
        .map(e => orca.decodificarTickArray(conta(e)));
    const tickDe = (t) => {
        const a = arrays.find(x => x.inicio === orca.inicioDoTickArray(t, pool.tickSpacing));
        return a.ticks[(t - a.inicio) / pool.tickSpacing];
    };

    test('decodifica a posição e a pool', () => {
        assert.deepEqual([posicao.whirlpool, posicao.mint, posicao.liquidez, posicao.tickInferior, posicao.tickSuperior],
            [POOL, NFT, 470425599913n, -88720, -88320]);
        assert.deepEqual([pool.tickSpacing, pool.feeRate, pool.taxaProtocolo, pool.mintA, pool.mintB], [16, 1600, 1300, SOL, CBBTC]);
        assert.deepEqual(arrays.map(a => a.inicio), [-90112, -88704]);
    });

    test('taxas a coletar iguais às do SDK; quantidades iguais até o arredondamento', () => {
        const c = orca.calcularPosicao({ posicao, pool, tickInf: tickDe(posicao.tickInferior), tickSup: tickDe(posicao.tickSuperior) });

        assert.equal(c.taxaA, 6249429909n);   // collectFeesQuote: feeOwedA
        assert.equal(c.taxaB, 821247n);       // collectFeesQuote: feeOwedB
        assert.ok(Math.abs(c.qtdA - 778160344025) / 778160344025 < 1e-9, `qtdA ${c.qtdA}`);   // decreaseLiquidityQuote
        assert.ok(Math.abs(c.qtdB - 1144829) / 1144829 < 1e-6, `qtdB ${c.qtdB}`);
        assert.equal(c.naFaixa, true);
        assert.deepEqual(c.recompensas.map(r => r.quantidade), [0n]);
    });

    test('fora da faixa: tudo num token só', () => {
        const abaixo = { ...pool, sqrtPrice: pool.sqrtPrice / 2n, tickAtual: -100000 };
        const c = orca.calcularPosicao({ posicao, pool: abaixo, tickInf: tickDe(posicao.tickInferior), tickSup: tickDe(posicao.tickSuperior) });
        assert.equal(c.naFaixa, false);
        assert.ok(c.qtdA > 0);
        assert.equal(c.qtdB, 0);
    });

    test('tick array dinâmico: ticks vazios ocupam 1 byte', () => {
        const disc = require('crypto').createHash('sha256').update('account:DynamicTickArray').digest().subarray(0, 8);
        const tick = Buffer.alloc(112);
        tick.writeBigUInt64LE(77n, 32);   // fee_growth_outside_a
        const partes = [disc, Buffer.alloc(4), Buffer.alloc(32), Buffer.alloc(16)];
        partes[1].writeInt32LE(-1408);
        for (let i = 0; i < 88; i++) partes.push(i === 2 ? Buffer.concat([Buffer.from([1]), tick]) : Buffer.from([0]));

        const a = orca.decodificarTickArray(Buffer.concat(partes));
        assert.equal(a.inicio, -1408);
        assert.equal(a.ticks[2].foraTaxaA, 77n);
        assert.equal(a.ticks[3].foraTaxaA, 0n);
        assert.throws(() => orca.decodificarTickArray(Buffer.alloc(100)), /não é um tick array/);
    });

    test('barra da faixa', () => {
        assert.equal(barraDaFaixa(5, 0, 10), '▕─────●─────▏ 50% da faixa');
        assert.equal(barraDaFaixa(-1, 0, 10), '● ▕──────────▏');
        assert.equal(barraDaFaixa(10, 0, 10), '▕──────────▏ ●');
    });
});

describe('/defi', () => {
    test('cadastra (conferindo NFT e pool), lista e mostra o Position Details', async () => {
        assert.deepEqual(await bot.responder(CADASTRO), [`✅ *Posição da Orca cadastrada:* Hz15…RaPZ\n💡 _Veja com /defi -show_`]);
        assert.deepEqual(await bot.dbGet('SELECT protocol, position, nft, pool FROM defi_positions'),
            { protocol: 'orca', position: POSICAO, nft: NFT, pool: POOL });

        assert.match((await bot.responder('/defi'))[0], /^🌊 \*Posições DeFi\* \(1\)\n\n1\. Orca · Hz15…RaPZ · pool CeaZ…QpbN _\(desde \d\d\/\d\d\/\d{4}\)_\n\n💡 /);

        const [r] = await bot.responder('/defi -show');
        assert.match(r, /^🌊 \*Orca · SOL\/cbBTC\* · taxa 0\.16%\n📍 Hz15…RaPZ · ✅ dentro da faixa\n\n/);
        assert.match(r, /💰 \*Saldo:\* \$[\d,]+\.\d\d\n   • 778\.16\d* SOL \(\$[\d,.]+\)\n   • 0\.01145 cbBTC \(\$[\d,.]+\)/);
        assert.match(r, /📏 \*Faixa:\* 0\.00140324 – 0\.0014605 cbBTC por SOL\n🎯 \*Preço atual:\* 0\.00140382 cbBTC por SOL\n   ▕●──────────▏ 1% da faixa\n   _\(1 cbBTC = 712\.\d+ SOL\)_/);
        assert.match(r, /💸 \*Taxas a coletar:\* \$[\d,.]+\n   • 6\.2494 SOL \(\$[\d,.]+\)\n   • 0\.008212 cbBTC \(\$[\d,.]+\)/);
        assert.match(r, /📊 \*Rende ~\$[\d,.]+\/dia\* _\(estimativa: 2\.4\d% da liquidez ativa × as taxas 24h dos LPs\)_/);
        assert.match(r, /🏊 \*Pool:\* TVL \$9\.\d+M · volume 24h \$[\d.]+M · taxas 24h \$[\d.]+K$/);
        assert.doesNotMatch(r, /Recompensas/, 'recompensa zerada não aparece');

        // O valor em dólar usa o preço da Orca: 778,16 SOL × priceUsdc
        const usdSol = Number(API.sol.data.priceUsdc);
        assert.match(r, new RegExp(`778\\.16\\d* SOL \\(\\$${Math.round(778.16 * usdSol).toLocaleString('en-US').slice(0, 4)}`));
    });

    test('-show nº, -rm e as mensagens de lista vazia', async () => {
        await bot.responder(CADASTRO);
        assert.match((await bot.responder('/defi -s 1'))[0], /Orca · SOL\/cbBTC/);
        assert.match((await bot.responder('/defi -s 5'))[0], /❌ Posição nº 5 não existe/);

        assert.deepEqual(await bot.responder('/defi -rm 1'), ['🗑️ Posição removida: Hz15…RaPZ']);
        assert.match((await bot.responder('/defi -show'))[0], /🌊 Nenhuma posição cadastrada/);
        assert.match((await bot.responder('/defi -l'))[0], /🌊 Nenhuma posição cadastrada/);
    });

    test('cadastro: só -position basta; erros de protocolo, endereço, conta, NFT, pool e repetida', async () => {
        const erro = async (linha, esperado) => assert.match((await bot.responder(linha))[0], esperado, linha);

        await erro(`/defi -position ${POSICAO}`, /❌ Informe o protocolo: -orca \(com -position\) ou -project-x \(com -wallet\)/);
        await erro('/defi -orca', /❌ Informe o endereço da posição/);
        await erro('/defi -orca -position xyz', /❌ -position: "xyz" não é um endereço da Solana/);
        await erro(`/defi -orca -position ${POSICAO} -nft ${POOL}`, /❌ O NFT .* não é o desta posição \(o dela é C1ME/);
        await erro(`/defi -orca -position ${POSICAO} -pool ${NFT}`, /❌ A posição é da pool CeaZ.*, não da C1ME/);
        await erro(`/defi -orca -position ${POOL}`, /não é uma posição da Orca/);
        await erro(`/defi -orca -position ${'1'.repeat(32)}`, /❌ A conta 1{32} não existe na Solana/);

        simularSolana({ dono: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' });
        await erro(`/defi -orca -position ${POSICAO}`, /não é uma posição da Orca/);

        simularSolana();
        await erro(`/defi -orca -p ${POSICAO}`, /✅ \*Posição da Orca cadastrada/);
        await erro(CADASTRO, /ℹ️ Hz15…RaPZ já está cadastrada/);
    });

    test('RPC com limite ou posição fechada: avisa e sugere o defi.solana.rpc', async () => {
        await bot.responder(CADASTRO);

        rede.responder('post', 'api.mainnet-beta.solana.com', { error: { code: 429, message: 'Too many requests' } });
        const [r] = await bot.responder('/defi -show', { erroEsperado: true });
        assert.match(r, /⚠️ Não consegui ler Orca · Hz15…RaPZ agora: RPC da Solana: Too many requests\.\n💡 _O RPC público da Solana limita as consultas; um RPC próprio vai no setting defi\.solana\.rpc\._/);

        simularSolana({ contas: { [POOL]: CONTAS[POOL] } });
        assert.match((await bot.responder('/defi -show', { erroEsperado: true }))[0], /a posição não existe mais \(foi fechada\?\)/);
    });

    test('defi.solana.rpc: troca o RPC e só aceita URL', async () => {
        await bot.setSetting('defi.solana.rpc', 'https://meu-rpc.exemplo.com/?api-key=x');
        rede.responder('post', 'meu-rpc.exemplo.com', { result: { value: [null] } });
        await bot.responder(`/defi -orca -position ${POSICAO}`);
        assert.match(rede.chamadas.at(-1).url, /meu-rpc\.exemplo\.com/);

        await assert.rejects(bot.setSetting('defi.solana.rpc', 'não é url'), /URL inválida/);
    });

    test('só o dono', async () => {
        assert.deepEqual(await bot.responder(CADASTRO, { de: OUTRO.jid }), []);
    });
});

/*
 * A pool com o preço lá embaixo (metade do sqrtPrice), como no teste "fora da
 * faixa" do calcularPosicao: o sqrtPrice é u128 no offset 65 e o tick atual, i32 no 81.
 */
function poolForaDaFaixa() {
    const b = conta(POOL);
    const metade = solana.u128(b, 65) / 2n;
    b.writeBigUInt64LE(metade & 0xffffffffffffffffn, 65);
    b.writeBigUInt64LE(metade >> 64n, 73);
    b.writeInt32LE(-100000, 81);
    return b.toString('base64');
}

const foraDaFaixa = () => simularSolana({ contas: { ...CONTAS, [POOL]: poolForaDaFaixa() } });
const naFaixa = () => simularSolana();

// Uma verificação do -alerta; devolve o que o bot enviou
async function verificar() {
    const antes = bot.client.enviadas.length;
    await verificarAlertasDefi({ forcar: true });
    return bot.client.enviadas.slice(antes);
}

describe('/defi -alerta (-a)', () => {
    beforeEach(() => bot.responder(CADASTRO));

    test('liga no seu privado; avisa ao sair da faixa, uma vez, e ao voltar', async () => {
        const [r] = await bot.responder('/defi -alerta 1');
        assert.match(r, /^🔔 \*Alerta do \/defi ligado\* \(1\)\n\n1\. Orca · Hz15…RaPZ · ✅ na faixa\n\n📣 Aviso: seu privado, quando a posição sair da faixa e quando voltar \(verificada a cada 10 minutos\)\./);
        assert.deepEqual(await verificar(), [], 'na faixa: nada');

        foraDaFaixa();
        const [aviso] = await verificar();
        assert.equal(aviso.chatId, DONO.jid);
        assert.match(aviso.content, /^🚨 \*DeFi: Orca · Hz15…RaPZ saiu da faixa\*\n\n🌊 \*Orca · SOL\/cbBTC\*[\s\S]*⚠️ \*fora da faixa\* \(preço abaixo/);
        assert.match(aviso.content, /💡 _Desligue com \/defi -alerta -rm 1\._$/);
        assert.deepEqual(await verificar(), [], 'continua fora: não repete');

        naFaixa();
        const [volta] = await verificar();
        assert.match(volta.content, /^✅ \*DeFi: Orca · Hz15…RaPZ voltou para a faixa\*\n\n🌊 \*Orca · SOL\/cbBTC\*[\s\S]*✅ dentro da faixa/);
        assert.deepEqual(await verificar(), [], 'continua na faixa: não repete');
        foraDaFaixa();
        assert.equal((await verificar()).length, 1, 'saiu de novo: avisa');
    });

    test('a lista, o 🔔 no /defi -l e o -rm desliga', async () => {
        assert.match((await bot.responder('/defi -a'))[0], /^🔕 Nenhum alerta no \/defi\./);
        await bot.responder('/defi -a all');

        assert.match((await bot.responder('/defi -alerta'))[0], /^🔔 \*Alertas do \/defi\* \(1\)\n\n1\. Orca · Hz15…RaPZ · ✅ na faixa → seu privado\n\n💡 _Verificados a cada 10 minutos\./);
        assert.match((await bot.responder('/defi -l'))[0], /1\. Orca · Hz15…RaPZ · pool CeaZ…QpbN _\(desde [\d/]+\)_ 🔔\n/);

        assert.deepEqual(await bot.responder('/defi -alerta -rm 1'), ['🔕 Alerta desligado: Orca · Hz15…RaPZ']);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM defi_positions')).n, 1, 'a posição fica');
        foraDaFaixa();
        assert.deepEqual(await verificar(), []);
        assert.deepEqual(await bot.responder('/defi -a -rm all'), ['🔕 0 alertas desligados.']);
    });

    test('ligado já fora da faixa: não avisa a saída; avisa quando voltar', async () => {
        foraDaFaixa();
        assert.match((await bot.responder('/defi -a 1'))[0], /1\. Orca · Hz15…RaPZ · ⚠️ fora da faixa _\(avisa quando voltar para a faixa\)_/);
        assert.deepEqual(await verificar(), []);
        naFaixa();
        assert.match((await verificar())[0].content, /voltou para a faixa/);
    });

    test('RPC fora: liga sem o estado e avisa na primeira leitura fora da faixa', async () => {
        rede.responder('post', 'api.mainnet-beta.solana.com', { error: { code: 429, message: 'Too many requests' } });
        assert.match((await bot.responder('/defi -a 1', { erroEsperado: true }))[0], /· ❔ ainda não lida/);
        assert.deepEqual(await verificar(), []);

        foraDaFaixa();
        assert.equal((await verificar()).length, 1);
    });

    test('-to: contato, grupo (com escolha) ou número', async () => {
        await bot.responder('/defi -alerta 1 -to /Fulano/');
        foraDaFaixa();
        assert.equal((await verificar())[0].chatId, OUTRO.jid);

        bot.criarGrupo('120363000000000300@g.us', 'Cripto Rio', [DONO.jid]);
        bot.criarGrupo('120363000000000301@g.us', 'Cripto SP', [DONO.jid]);
        const r = await bot.responderEscolhendo('/defi -a 1 -to cripto', 2);
        assert.match(r[0], /^🔎 "cripto" corresponde a 2 grupos:\n\n1\. 👥 Cripto Rio\n2\. 👥 Cripto SP/);
        assert.match(r.at(-1), /📣 Aviso: 👥 Cripto SP, quando a posição sair/);

        assert.match((await bot.responder('/defi -a 1 -to +5521911111111'))[0], /📣 Aviso: 👤 Fulano,/);
        assert.match((await bot.responder('/defi -a 1 -to xyz'))[0], /❌ Nenhum contato ou grupo com "xyz" no nome/);
        assert.match((await bot.responder('/defi -a 1 -to'))[0], /❌ Informe o destino do -to/);
        assert.match((await bot.responder('/defi -to email'))[0], /❌ O -to é do -alerta/);
        assert.match((await bot.responder('/defi -a 7'))[0], /❌ Posição nº 7 não existe/);
    });

    test('-to email: pelo SMTP do bot, sem a formatação do WhatsApp', async () => {
        assert.match((await bot.responder('/defi -a 1 -to email'))[0], /❌ O "email" usa o QRCODE_EMAIL_SMTP_TO/);
        assert.match((await bot.responder('/defi -a 1 -to eu@exemplo.com'))[0], /❌ SMTP não configurado/);

        const env = { QRCODE_EMAIL_SMTP_HOST: 'smtp.exemplo.com', QRCODE_EMAIL_SMTP_USER: 'bot@exemplo.com', QRCODE_EMAIL_SMTP_TO: 'eu@exemplo.com' };
        Object.assign(process.env, env);
        try {
            assert.match((await bot.responder('/defi -a 1 -to "email, outro@exemplo.com"'))[0], /📣 Aviso: 📧 eu@exemplo\.com, outro@exemplo\.com,/);

            foraDaFaixa();
            assert.deepEqual(await verificar(), [], 'nada no WhatsApp');
            const [m] = emails;
            assert.equal(m.to, 'eu@exemplo.com, outro@exemplo.com');
            assert.equal(m.subject, '[ZapBot] DeFi: Orca · Hz15…RaPZ saiu da faixa');
            assert.match(m.text, /^🚨 DeFi: Orca · Hz15…RaPZ saiu da faixa\n\n🌊 Orca · SOL\/cbBTC/);
            assert.doesNotMatch(m.text, /[*_]/);

            // E-mail que falha não repete a cada verificação
            nodemailer.falhar = true;
            naFaixa();
            await verificar();
            foraDaFaixa();
            await verificarAlertasDefi({ forcar: true });
            nodemailer.falhar = false;
            assert.equal(emails.length, 1);
            assert.equal((await bot.dbGet('SELECT in_range FROM defi_positions')).in_range, 0);
        } finally {
            for (const v of Object.keys(env)) delete process.env[v];
        }
    });
});

/*
 * Project X: a HyperEVM simulada responde cada eth_call pelo contrato e pelo
 * seletor. A carteira tem 3 NFTs: o 3 fechado (sem liquidez), o 7 na faixa
 * (UBTC/USD₮0) e o 9 abaixo da faixa (WHYPE/USD₮0).
 */
describe('/defi: Project X (HyperEVM)', () => {
    const prjx = bot.src('defi/prjx');
    const CARTEIRA = '0x926024824BAEAf3ee0b7A2EEFA5A216743230444';
    const VAZIA = '0x1111111111111111111111111111111111111111';
    const UBTC = `0x${'a'.repeat(40)}`;
    const USDT0 = `0x${'b'.repeat(40)}`;
    const WHYPE = '0x5555555555555555555555555555555555555555';
    const POOL_BTC = `0x${'c'.repeat(40)}`;
    const POOL_HYPE = `0x${'d'.repeat(40)}`;

    const w = (n) => BigInt.asUintN(256, BigInt(n)).toString(16).padStart(64, '0');
    const a = (e) => e.slice(2).toLowerCase().padStart(64, '0');
    const s = (t) => w(32) + w(Buffer.byteLength(t)) + Buffer.from(t).toString('hex').padEnd(64, '0');   // em bytes: o ₮ ocupa 3
    const tickDe = (preco) => Math.floor(Math.log(preco) / Math.log(1.0001));
    const sqrtX96 = (preco) => BigInt(Math.floor(Math.sqrt(preco) * 2 ** 96));

    // Preços brutos (token1 por token0, nas menores unidades): BTC a $86.000 e HYPE a $30
    const BRUTO_BTC = 86000 * 10 ** (6 - 8);
    const BRUTO_HYPE = 30 * 10 ** (6 - 18);
    let cadeia;

    function novaCadeia() {
        const tickHype = tickDe(BRUTO_HYPE);
        return {
            slot0: { [POOL_BTC]: BRUTO_BTC, [POOL_HYPE]: BRUTO_HYPE },
            posicoes: {
                3: { t0: UBTC, t1: USDT0, taxa: 500, tl: 67000, tu: 68200, L: 0n },
                7: { t0: UBTC, t1: USDT0, taxa: 500, tl: 67000, tu: 68200, L: 10n ** 10n },
                9: { t0: WHYPE, t1: USDT0, taxa: 3000, tl: tickHype + 1000, tu: tickHype + 3000, L: 10n ** 15n }
            },
            coleta: { 7: [100000n, 12500000n], 9: [0n, 0n] },
            tokens: { [UBTC]: ['UBTC', 8], [USDT0]: ['USD₮0', 6], [WHYPE]: ['WHYPE', 18] }
        };
    }

    function responderCall({ to, data, from }) {
        const sel = data.slice(0, 10);
        const args = data.slice(10);
        const arg = (i) => args.slice(i * 64, (i + 1) * 64);
        const alvo = to.toLowerCase();

        if (alvo === prjx.POSICOES.toLowerCase()) {
            const dono = `0x${arg(0).slice(24)}`;
            if (sel === prjx.SEL.balanceOf) return w(dono === CARTEIRA.toLowerCase() ? 3 : 0);
            if (sel === prjx.SEL.tokenOfOwnerByIndex) return w([3, 7, 9][Number(BigInt(`0x${arg(1)}`))]);
            const id = Number(BigInt(`0x${arg(0)}`));
            const p = cadeia.posicoes[id];
            if (sel === prjx.SEL.positions) return w(0) + w(0) + a(p.t0) + a(p.t1) + w(p.taxa) + w(p.tl) + w(p.tu) + w(p.L) + w(0).repeat(4);
            if (sel === prjx.SEL.collect) {
                assert.equal(from, CARTEIRA.toLowerCase(), 'o collect simulado sai da carteira dona do NFT');
                return w(cadeia.coleta[id][0]) + w(cadeia.coleta[id][1]);
            }
        }
        if (alvo === prjx.FACTORY.toLowerCase() && sel === prjx.SEL.getPool) return a(`0x${arg(0).slice(24)}` === UBTC ? POOL_BTC : POOL_HYPE);
        if (cadeia.slot0[alvo] && sel === prjx.SEL.slot0) {
            const preco = cadeia.slot0[alvo];
            return w(sqrtX96(preco)) + w(tickDe(preco)) + w(0).repeat(5);
        }
        if (cadeia.tokens[alvo] && sel === prjx.SEL.symbol) return s(cadeia.tokens[alvo][0]);
        if (cadeia.tokens[alvo] && sel === prjx.SEL.decimals) return w(cadeia.tokens[alvo][1]);
        throw new Error(`eth_call não simulado: ${to} ${sel}`);
    }

    function simularHyperEvm() {
        rede.responder('post', 'rpc.hyperliquid.xyz/evm', (url, cfg) => {
            assert.ok(Array.isArray(cfg.body) && cfg.body.length <= 10, 'em lotes de até 10 (o RPC público recusa maiores)');
            return cfg.body.map(c => ({ jsonrpc: '2.0', id: c.id, result: `0x${responderCall(c.params[0])}` }));
        });
    }

    // Quantidades pelas fórmulas do Uniswap V3, para comparar com o texto
    function esperado(p, preco, dec0, dec1) {
        const sp = Math.sqrt(preco);
        const [sa, sb] = [p.tl, p.tu].map(t => 1.0001 ** (t / 2));
        const L = Number(p.L);
        const q0 = sp <= sa ? L * (1 / sa - 1 / sb) : sp >= sb ? 0 : L * (1 / sp - 1 / sb);
        const q1 = sp <= sa ? 0 : sp >= sb ? L * (sb - sa) : L * (sp - sa);
        return [q0 / 10 ** dec0, q1 / 10 ** dec1];
    }
    const dolares = (texto) => Number(texto.match(/💰 \*Saldo:\* \$([\d,.]+)/)[1].replace(/,/g, ''));

    beforeEach(() => {
        cadeia = novaCadeia();
        simularHyperEvm();
    });

    test('-project-x -wallet: cadastra a carteira; erros de endereço, repetida e sem -wallet', async () => {
        const erro = async (linha, esperadoRe) => assert.match((await bot.responder(linha))[0], esperadoRe, linha);

        await erro('/defi -prjx', /❌ Informe a carteira: -wallet <0x\.\.\.>/);
        await erro('/defi -prjx -w xyz', /❌ -wallet: "xyz" não é um endereço da HyperEVM/);
        await erro(`/defi -project-x -wallet <${CARTEIRA}>`, /^✅ \*Carteira do Project X cadastrada:\* 0x92…0444\n📍 2 posições abertas\./);
        await erro(`/defi -prjx -w ${CARTEIRA.toLowerCase()}`, /ℹ️ 0x92…0444 já está cadastrada/);

        const [lista] = await bot.responder('/defi -l');
        assert.match(lista, /^🌊 \*Posições DeFi\* \(1\)\n\n1\. Project X · carteira 0x92…0444 _\(desde /);
        assert.equal((await bot.dbGet('SELECT protocol, position FROM defi_positions')).position, CARTEIRA.toLowerCase());
    });

    test('-show: uma resposta por posição aberta, da mais nova para a mais velha (a fechada fica de fora)', async () => {
        await bot.responder(`/defi -prjx -w ${CARTEIRA}`);
        const [hype, btc, ...resto] = await bot.responder('/defi -show');
        assert.deepEqual(resto, []);

        assert.match(btc, /^🌊 \*Project X · UBTC\/USD₮0\* · taxa 0\.05%\n📍 #7 · ✅ dentro da faixa\n\n💰 \*Saldo:\* \$/);
        const [q0, q1] = esperado(cadeia.posicoes[7], BRUTO_BTC, 8, 6);
        assert.ok(Math.abs(dolares(btc) - (q0 * 86000 + q1)) < 0.01, `saldo ${dolares(btc)} ≠ ${q0 * 86000 + q1}`);
        assert.match(btc, /📏 \*Faixa:\* [\d,.]+ – [\d,.]+ USD₮0 por UBTC\n🎯 \*Preço atual:\* 86,000 USD₮0 por UBTC\n {3}▕─+●─+▏ \d+% da faixa/);
        assert.match(btc, /💸 \*Taxas a coletar:\* \$98\.50\n {3}• 0\.001 UBTC \(\$86\.00\)\n {3}• 12\.5 USD₮0 \(\$12\.50\)$/);

        assert.match(hype, /^🌊 \*Project X · WHYPE\/USD₮0\* · taxa 0\.3%\n📍 #9 · ⚠️ \*fora da faixa\* \(preço abaixo: a posição não rende taxas\)/);
        const [h0] = esperado(cadeia.posicoes[9], BRUTO_HYPE, 18, 6);
        assert.ok(Math.abs(dolares(hype) - h0 * 30) < 0.01);
        assert.match(hype, /• 0 USD₮0 \(\$0\.00\)\n\n📏/);   // abaixo da faixa: tudo em WHYPE
    });

    test('carteira sem posição aberta: cadastra e avisa; -show diz que não há nenhuma', async () => {
        assert.match((await bot.responder(`/defi -prjx -w ${VAZIA}`))[0], /ℹ️ Nenhuma posição aberta agora/);
        assert.deepEqual(await bot.responder('/defi -show'), ['🌊 Project X · carteira 0x11…1111: nenhuma posição aberta.']);
    });

    test('RPC com limite: não cadastra; no -show, avisa e sugere o defi.hyperevm.rpc', async () => {
        rede.responder('post', 'rpc.hyperliquid.xyz/evm', { jsonrpc: '2.0', id: null, error: { code: -32005, message: 'rate limited' } });
        assert.match((await bot.responder(`/defi -prjx -w ${CARTEIRA}`, { erroEsperado: true }))[0],
            /⚠️ Não consegui ler a carteira agora: RPC da HyperEVM: rate limited\.\n💡 _.*defi\.hyperevm\.rpc/);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM defi_positions')).n, 0);

        simularHyperEvm();
        await bot.responder(`/defi -prjx -w ${CARTEIRA}`);
        rede.responder('post', 'rpc.hyperliquid.xyz/evm', { jsonrpc: '2.0', id: null, error: { code: -32005, message: 'rate limited' } });
        assert.match((await bot.responder('/defi -show', { erroEsperado: true }))[0],
            /^⚠️ Não consegui ler Project X · carteira 0x92…0444 agora: RPC da HyperEVM: rate limited\.\n💡 _O RPC público da HyperEVM/);
    });

    test('-alerta -taxas: avisa uma vez quando as taxas passam do valor; depois de coletar, de novo', async () => {
        const verificarAgora = async () => {
            const antes = bot.client.enviadas.length;
            bot.estado.pronto = true;
            await verificarAlertasDefi({ forcar: true });
            return bot.client.enviadas.slice(antes).map(e => e.content);
        };
        await bot.responder(`/defi -prjx -w ${CARTEIRA}`);

        assert.match((await bot.responder('/defi -a 1 -taxas abc'))[0], /❌ -taxas: informe o valor em dólar/);
        const [ligado] = await bot.responder('/defi -a 1 -taxas $50');
        assert.match(ligado, /1\. Project X · carteira 0x92…0444 · ⚠️ fora da faixa · 💸 ≥ \$50\.00/);
        assert.match(ligado, /e quando as taxas a coletar passarem de \$50\.00 \(verificada/);
        assert.match((await bot.responder('/defi -alerta'))[0], /· 💸 ≥ \$50\.00 → seu privado/);

        // $98.50 na do BTC (a do HYPE não tem taxa)
        const [aviso] = await verificarAgora();
        assert.match(aviso, /^💸 \*DeFi: Project X · carteira 0x92…0444 tem \$98\.50 em taxas a coletar \(passou de \$50\.00\)\*\n\n🌊/);
        assert.deepEqual(await verificarAgora(), [], 'continua acima: não repete');

        cadeia.coleta[7] = [0n, 0n];       // coletou
        assert.deepEqual(await verificarAgora(), []);
        cadeia.coleta[7] = [0n, 60000000n]; // encheu de novo: $60
        assert.match((await verificarAgora())[0], /tem \$60\.00 em taxas a coletar/);

        // Ligar de novo sem -taxas mantém o valor; -taxas off tira
        assert.match((await bot.responder('/defi -a 1'))[0], /💸 ≥ \$50\.00/);
        assert.doesNotMatch((await bot.responder('/defi -a 1 -taxas off'))[0], /💸/);
    });

    test('-alerta: na carteira, avisa ao voltar para a faixa, com todas as posições', async () => {
        await bot.responder(`/defi -prjx -w ${CARTEIRA}`);
        await bot.responder('/defi -a 1');
        cadeia.slot0[POOL_HYPE] = BRUTO_HYPE * 1.0001 ** 2000;
        const antes = bot.client.enviadas.length;
        bot.estado.pronto = true;
        await verificarAlertasDefi({ forcar: true });
        const [volta] = bot.client.enviadas.slice(antes);
        assert.match(volta.content, /^✅ \*DeFi: Project X · carteira 0x92…0444 voltou para a faixa\*\n\n🌊 \*Project X · WHYPE\/USD₮0\*[\s\S]*🌊 \*Project X · UBTC\/USD₮0\*/);
    });

    test('-alerta: na carteira, avisa quando alguma posição sai da faixa, só com as de fora', async () => {
        cadeia.slot0[POOL_HYPE] = BRUTO_HYPE * 1.0001 ** 2000;   // a do HYPE entra na faixa
        await bot.responder(`/defi -prjx -w ${CARTEIRA}`);
        assert.match((await bot.responder('/defi -alerta 1'))[0], /1\. Project X · carteira 0x92…0444 · ✅ na faixa/);

        cadeia.slot0[POOL_HYPE] = BRUTO_HYPE;                     // sai
        const antes = bot.client.enviadas.length;
        bot.estado.pronto = true;
        await verificarAlertasDefi({ forcar: true });
        const [aviso, ...mais] = bot.client.enviadas.slice(antes);
        assert.deepEqual(mais, []);
        assert.equal(aviso.chatId, DONO.jid);
        assert.match(aviso.content, /^🚨 \*DeFi: Project X · carteira 0x92…0444 saiu da faixa\*\n\n🌊 \*Project X · WHYPE\/USD₮0\*/);
        assert.doesNotMatch(aviso.content, /UBTC/);   // a de BTC continua na faixa: fica de fora
    });
});
