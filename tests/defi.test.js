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
const CADASTRO = `/defi orca -address ${POSICAO} -pool ${POOL} -nft ${NFT}`;

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
        assert.deepEqual(await bot.responder(CADASTRO), [`✅ *Posição da Orca cadastrada:* Hz15…RaPZ\n💡 _Veja com /defi orca_`]);
        assert.deepEqual(await bot.dbGet('SELECT protocol, address, wallet, nft, pool FROM defi_positions'),
            { protocol: 'orca', address: POSICAO, wallet: null, nft: NFT, pool: POOL });

        assert.match((await bot.responder('/defi -l'))[0], /^🌊 \*Posições DeFi\* \(1\)\n\n1\. Orca · Hz15…RaPZ · pool CeaZ…QpbN _\(desde \d\d\/\d\d\/\d{4}\)_\n\n💡 /);

        // /defi sem nada: o Position Details de todos
        const [r] = await bot.responder('/defi');
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

    test('/defi orca, palavra desconhecida, -rm e as mensagens de lista vazia', async () => {
        await bot.responder(CADASTRO);
        assert.match((await bot.responder('/defi orca'))[0], /Orca · SOL\/cbBTC/);
        assert.match((await bot.responder('/defi xyz'))[0], /^❌ "xyz" não é um protocolo: use orca, prjx ou morpho\.\n\n```Usage: \/defi \[orca\|prjx\|morpho\]/);

        assert.deepEqual(await bot.responder('/defi -rm 1'), ['🗑️ Removido: Orca · Hz15…RaPZ']);
        assert.match((await bot.responder('/defi'))[0], /🌊 Nenhuma posição cadastrada/);
        assert.match((await bot.responder('/defi orca'))[0], /🌊 Nada cadastrado da Orca/);
        assert.match((await bot.responder('/defi -l'))[0], /🌊 Nenhuma posição cadastrada/);
    });

    test('cadastro: só -address basta; erros de protocolo, endereço, conta, NFT, pool e repetida', async () => {
        const erro = async (linha, esperado) => assert.match((await bot.responder(linha))[0], esperado, linha);

        await erro(`/defi -address ${POSICAO}`, /❌ Informe o protocolo antes do -address ou do -wallet: orca, prjx ou morpho/);
        await erro('/defi orca -address', /❌ Informe o endereço da posição/);
        await erro('/defi orca -address xyz', /❌ -address: "xyz" não é um endereço da Solana/);
        await erro(`/defi orca -address ${POSICAO} -nft ${POOL}`, /❌ O NFT .* não é o desta posição \(o dela é C1ME/);
        await erro(`/defi orca -address ${POSICAO} -pool ${NFT}`, /❌ A posição é da pool CeaZ.*, não da C1ME/);
        await erro(`/defi orca -address ${POOL}`, /não é uma posição da Orca/);
        await erro(`/defi orca -address ${'1'.repeat(32)}`, /❌ A conta 1{32} não existe na Solana/);

        simularSolana({ dono: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' });
        await erro(`/defi orca -address ${POSICAO}`, /não é uma posição da Orca/);

        simularSolana();
        await erro(`/defi orca -address ${POSICAO}`, /✅ \*Posição da Orca cadastrada/);
        await erro(CADASTRO, /ℹ️ Hz15…RaPZ já está cadastrada/);
    });

    test('RPC com limite ou posição fechada: avisa e sugere o defi.solana.rpc', async () => {
        await bot.responder(CADASTRO);

        rede.responder('post', 'api.mainnet-beta.solana.com', { error: { code: 429, message: 'Too many requests' } });
        const [r] = await bot.responder('/defi', { erroEsperado: true });
        assert.match(r, /⚠️ Não consegui ler Orca · Hz15…RaPZ agora: RPC da Solana: Too many requests\.\n💡 _O RPC público da Solana limita as consultas; um RPC próprio vai no setting defi\.solana\.rpc\._/);

        simularSolana({ contas: { [POOL]: CONTAS[POOL] } });
        assert.match((await bot.responder('/defi', { erroEsperado: true }))[0], /a posição não existe mais \(foi fechada\?\)/);
    });

    test('defi.solana.rpc: troca o RPC e só aceita URL', async () => {
        await bot.setSetting('defi.solana.rpc', 'https://meu-rpc.exemplo.com/?api-key=x');
        rede.responder('post', 'meu-rpc.exemplo.com', { result: { value: [null] } });
        await bot.responder(`/defi orca -address ${POSICAO}`);
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

    test('no cadastro: -alerta [valor] liga o alerta da posição nova, no seu privado; o valor é o -taxas', async () => {
        await bot.responder('/defi -rm all');
        const [cadastrada, ligado] = await bot.responder(`${CADASTRO} -alerta 2000`);
        assert.match(cadastrada, /^✅ \*Posição da Orca cadastrada:\* Hz15…RaPZ/);
        assert.match(ligado, /^🔔 \*Alerta do \/defi ligado\* \(1\)\n\n1\. Orca · Hz15…RaPZ · ✅ na faixa · 💸 ≥ \$2,000\.00\n\n📣 Aviso: seu privado,/);
        assert.equal((await bot.dbGet('SELECT alert, alert_fees, alert_dest_id FROM defi_positions')).alert_fees, 2000);
        assert.match((await bot.responder('/defi -l'))[0], /1\. Orca · Hz15…RaPZ · pool CeaZ…QpbN _\(desde [\d/]+\)_ 🔔 ≥ \$2,000\.00\n/);

        await bot.responder('/defi -rm all');
        const [, semValor] = await bot.responder(`${CADASTRO} -alerta -to /Fulano/`);
        assert.match(semValor, /1\. Orca · Hz15…RaPZ · ✅ na faixa\n\n📣 Aviso: 👤 Fulano, quando a posição sair/);

        await bot.responder('/defi -rm all');
        assert.deepEqual(await bot.responder(`${CADASTRO} -alerta abc`), ['❌ No cadastro, o -alerta leva o limite das taxas em dólar (ex.: -alerta 2000) ou nada.']);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM defi_positions')).n, 0, 'erro: nem cadastra');
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

    test('vários -to: avisa em todos; -rm desliga e limpa os destinos', async () => {
        const L200 = '120363000000000200@g.us';
        bot.criarGrupo(L200, 'Grupo sobre L200', [DONO.jid]);

        assert.match((await bot.responder('/defi -a 1 -to /Fulano/ -to /Grupo L200/ -to /Fulano/'))[0],
            /📣 Aviso: 👤 Fulano, 👥 Grupo sobre L200, quando a posição sair/);
        assert.match((await bot.responder('/defi -alerta'))[0], /→ 👤 Fulano, 👥 Grupo sobre L200/);

        foraDaFaixa();
        assert.deepEqual((await verificar()).map(e => e.chatId), [OUTRO.jid, L200]);

        // Sem -to, volta ao seu privado; -rm limpa tudo
        await bot.responder('/defi -a 1');
        assert.equal((await bot.dbGet('SELECT alert_recipients FROM defi_positions')).alert_recipients, null);
        await bot.responder('/defi -a 1 -to /Fulano/ -to /Grupo L200/');
        await bot.responder('/defi -a -rm 1');
        assert.deepEqual(await bot.dbGet('SELECT alert, alert_dest_id, alert_recipients FROM defi_positions'),
            { alert: 0, alert_dest_id: null, alert_recipients: null });
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

    test('prjx -wallet: cadastra a carteira; erros de endereço, repetida, sem -wallet e com -address', async () => {
        const erro = async (linha, esperadoRe) => assert.match((await bot.responder(linha))[0], esperadoRe, linha);

        await erro('/defi prjx -wallet', /❌ Informe a carteira: -wallet <0x\.\.\.>/);
        await erro('/defi prjx -wallet xyz', /❌ -wallet: "xyz" não é uma carteira EVM/);
        await erro(`/defi prjx -address ${CARTEIRA}`, /❌ No Project X, a carteira vai no -wallet: \/defi prjx -wallet <0x\.\.\.>/);
        await erro(`/defi orca -wallet ${CARTEIRA}`, /❌ Na Orca, a posição vai no -address/);
        await erro(`/defi prjx -wallet <${CARTEIRA}>`, /^✅ \*Carteira do Project X cadastrada:\* 0x92…0444\n📍 2 posições abertas\./);
        await erro(`/defi prjx -wallet ${CARTEIRA.toLowerCase()}`, /ℹ️ 0x92…0444 já está cadastrada no Project X/);

        const [lista] = await bot.responder('/defi -l');
        assert.match(lista, /^🌊 \*Posições DeFi\* \(1\)\n\n1\. Project X · carteira 0x92…0444 _\(desde /);
        assert.deepEqual(await bot.dbGet('SELECT protocol, address, wallet FROM defi_positions'),
            { protocol: 'prjx', address: null, wallet: CARTEIRA.toLowerCase() });
    });

    test('/defi prjx: uma resposta por posição aberta, da mais nova para a mais velha (a fechada fica de fora)', async () => {
        await bot.responder(`/defi prjx -wallet ${CARTEIRA}`);
        const [hype, btc, ...resto] = await bot.responder('/defi prjx');
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

    test('/defi orca e /defi prjx filtram, -rm de vários e a lista: inteira só no seu privado', async () => {
        await bot.responder(CADASTRO);
        await bot.responder(`/defi prjx -wallet ${CARTEIRA}`);

        const soOrca = await bot.responder('/defi orca');
        assert.deepEqual(soOrca.map(t => t.split('\n')[0].split(' ·')[0]), ['🌊 *Orca']);
        assert.deepEqual((await bot.responder('/defi prjx')).map(t => t.split(' ·')[0]), ['🌊 *Project X', '🌊 *Project X']);
        assert.deepEqual((await bot.responder('/defi')).map(t => t.split(' ·')[0]), ['🌊 *Orca', '🌊 *Project X', '🌊 *Project X']);
        assert.match((await bot.responder('/defi projectx'))[0], /❌ "projectx" não é um protocolo/);

        const [noGrupo] = await bot.responder('/defi -l');
        assert.match(noGrupo, /1\. Orca · Hz15…RaPZ · pool CeaZ…QpbN _\(desde [\d/]+\)_\n2\. Project X · carteira 0x92…0444 _/);
        const [noPrivado] = await bot.responder('/defi -l', { chat: DONO.jid });
        assert.ok(noPrivado.includes(`1. Orca · ${POSICAO} · pool ${POOL} _`));
        assert.ok(noPrivado.includes(`2. Project X · carteira ${CARTEIRA.toLowerCase()} _`));

        assert.match((await bot.responder('/defi -rm 1 3'))[0], /^❌ Nº 3 não existe\. Nada foi removido/);
        assert.equal((await bot.responder('/defi -rm 2,1'))[0], '🗑️ *Removidos* (2)\n• Orca · Hz15…RaPZ\n• Project X · carteira 0x92…0444');
        assert.match((await bot.responder('/defi prjx'))[0], /🌊 Nada cadastrado do Project X/);
    });

    test('no seu privado, o /defi mostra os endereços inteiros', async () => {
        await bot.responder(CADASTRO);
        await bot.responder(`/defi prjx -wallet ${VAZIA}`);
        const r = await bot.responder('/defi', { chat: DONO.jid });
        assert.match(r[0], new RegExp(`^🌊 \\*Orca · SOL/cbBTC\\* · taxa [\\d.]+%\n📍 ${POSICAO} · `));
        assert.equal(r[1], `🌊 Project X · carteira ${VAZIA}: nenhuma posição aberta.`);
        assert.equal((await bot.responder('/defi -rm 2', { chat: DONO.jid }))[0], `🗑️ Removido: Project X · carteira ${VAZIA}`);
    });

    test('carteira sem posição aberta: cadastra e avisa; o /defi diz que não há nenhuma', async () => {
        assert.match((await bot.responder(`/defi prjx -wallet ${VAZIA}`))[0], /ℹ️ Nenhuma posição aberta agora/);
        assert.deepEqual(await bot.responder('/defi'), ['🌊 Project X · carteira 0x11…1111: nenhuma posição aberta.']);
    });

    test('RPC com limite: não cadastra; no /defi, avisa e sugere o defi.hyperevm.rpc', async () => {
        rede.responder('post', 'rpc.hyperliquid.xyz/evm', { jsonrpc: '2.0', id: null, error: { code: -32005, message: 'rate limited' } });
        assert.match((await bot.responder(`/defi prjx -wallet ${CARTEIRA}`, { erroEsperado: true }))[0],
            /⚠️ Não consegui ler a carteira agora: RPC da HyperEVM: rate limited\.\n💡 _.*defi\.hyperevm\.rpc/);
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM defi_positions')).n, 0);

        simularHyperEvm();
        await bot.responder(`/defi prjx -wallet ${CARTEIRA}`);
        rede.responder('post', 'rpc.hyperliquid.xyz/evm', { jsonrpc: '2.0', id: null, error: { code: -32005, message: 'rate limited' } });
        assert.match((await bot.responder('/defi', { erroEsperado: true }))[0],
            /^⚠️ Não consegui ler Project X · carteira 0x92…0444 agora: RPC da HyperEVM: rate limited\.\n💡 _O RPC público da HyperEVM/);
    });

    test('-alerta -taxas: avisa uma vez quando as taxas passam do valor; depois de coletar, de novo', async () => {
        const verificarAgora = async () => {
            const antes = bot.client.enviadas.length;
            bot.estado.pronto = true;
            await verificarAlertasDefi({ forcar: true });
            return bot.client.enviadas.slice(antes).map(e => e.content);
        };
        await bot.responder(`/defi prjx -wallet ${CARTEIRA}`);

        assert.match((await bot.responder('/defi -a 1 -taxas abc'))[0], /❌ -taxas: informe o valor em dólar/);
        const [ligado] = await bot.responder('/defi -a 1 -taxas $50');
        assert.match(ligado, /1\. Project X · carteira 0x92…0444 · ⚠️ fora da faixa · 💸 ≥ \$50\.00/);
        assert.match(ligado, /e quando as taxas a coletar passarem de \$50\.00 \(verificada/);
        assert.match((await bot.responder('/defi -alerta'))[0], /· 💸 ≥ \$50\.00 → seu privado/);
        assert.match((await bot.responder('/defi -l'))[0], /1\. Project X · carteira 0x92…0444 _\(desde [\d/]+\)_ 🔔 ≥ \$50\.00\n/);

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
        await bot.responder(`/defi prjx -wallet ${CARTEIRA}`);
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
        await bot.responder(`/defi prjx -wallet ${CARTEIRA}`);
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

/*
 * Morpho: a API GraphQL simulada. Os números do mercado cbBTC/USDC (Base) são
 * de uma posição real, capturada da API junto com o healthFactor e o
 * priceVariationToLiquidationPrice que ela calcula: as contas daqui (em
 * BigInt) têm que bater com os dela.
 */
describe('/defi morpho', () => {
    const morpho = bot.src('defi/morpho');
    const { erroHttp } = bot;
    const CARTEIRA = '0x74459EA7df673CFd90afbe39F635AcE08Ccb97C4';
    const OUTRA = '0x1111111111111111111111111111111111111234';
    const BASE = { id: 8453, network: 'Base' };

    const asset = (symbol, decimals, usd, chain = BASE) => ({
        address: `0x${symbol.length.toString(16).padStart(40, '0')}`, symbol, decimals, price: usd === null ? null : { usd }, chain
    });
    const CBBTC = asset('cbBTC', 8, 84908.54472240375);
    const USDC = asset('USDC', 6, 0.9999863948051431);

    // A posição real: 193.24 cbBTC de colateral, 5.17 mi de USDC emprestados
    const MERCADO_BTC = {
        healthFactor: 2.728444901801219,
        market: {
            marketId: '0x9103c3b4e834476c9a62ea009ba2c884ee42e94e6e314a26f04d312434191836',
            lltv: '860000000000000000',
            chain: BASE,
            collateralAsset: CBBTC,
            loanAsset: USDC,
            state: { price: '849095615471500000000000000000000000000', utilization: 0.9004279643323737 }
        },
        state: {
            collateral: 19324183428, collateralUsd: 16407882.928202711,
            borrowAssets: 5171791555324, borrowAssetsUsd: 5171721.192092131,
            supplyAssets: 0, supplyAssetsUsd: 0
        }
    };

    const VAULT = {
        vault: { name: 'Steakhouse USDC', symbol: 'steakUSDC', chain: BASE, asset: USDC },
        state: { assets: '2500000000', assetsUsd: 2499.97 }
    };

    let porRede;
    const responderApi = (resposta) => rede.responder('post', 'api.morpho.org/graphql', resposta);
    const usuario = (x = {}) => ({ address: CARTEIRA, marketPositions: [], vaultPositions: [], vaultV2Positions: [], ...x });

    beforeEach(() => {
        morpho.limparCacheMorpho();
        process.env.MORPHO_WALLET_ADDRESS = CARTEIRA;   // sem cadastro, vale a do .env
        porRede = { 8453: usuario({ marketPositions: [MERCADO_BTC] }) };
        responderApi((url, cfg) => ({
            data: Object.fromEntries(Object.entries(porRede)
                .filter(([id]) => cfg.body.query.includes(`c${id}:`))
                .map(([id, u]) => [`c${id}`, u]))
        }));
    });

    test('as contas batem com as da API: HF, LTV e preço de liquidação (em BigInt)', () => {
        const r = morpho.riscoDoMercado({
            colateral: 19324183428n, emprestado: 5171791555324n, lltv: 860000000000000000n,
            preco: 849095615471500000000000000000000000000n
        });
        assert.ok(Math.abs(r.hf - MERCADO_BTC.healthFactor) < 1e-6, `HF ${r.hf}`);
        assert.equal(r.ltv, 0.315197);

        // A API diz quanto o preço precisa cair até a liquidação (-63.35%)
        const oraculo = 84909.56154715;
        const liquidacao = Number(r.precoLiquidacaoBruto) / 10 ** (36 - 8 + 6);
        assert.ok(Math.abs(liquidacao - oraculo * (1 - 0.633490857982935)) < 0.01, `liquidação ${liquidacao}`);

        // Números maiores que 2^53 (18 decimais): sem perder precisão no caminho
        const grande = morpho.riscoDoMercado({
            colateral: 9497294999999976205989826n, emprestado: 1121922582611364335090401280n,
            lltv: 770000000000000000n, preco: 50000000000000000000000000000000000000000n
        });
        assert.ok(Math.abs(grande.hf - 325.9100611460455) < 1e-5, `HF ${grande.hf}`);

        // Sem dívida: ∞; dívida sem preço do oráculo: sem como calcular
        assert.equal(morpho.riscoDoMercado({ colateral: 1n, emprestado: 0n, preco: 1n, lltv: 1n }).hf, Infinity);
        assert.equal(morpho.riscoDoMercado({ colateral: 1n, emprestado: 1n, preco: null, lltv: 1n }).hf, null);
        assert.equal(morpho.emTokens(123456789012345678901234567890n, 18), 123456789012.34568);
        assert.equal(morpho.emTokens(1n, 99), null, 'decimals inválidos');
    });

    test('uma posição: líquido, Health Rate, colateral, dívida e risco', async () => {
        const [r] = await bot.responder('/defi morpho');
        const SEP = '\n\n━━━━━━━━━━━━━━━━━━\n\n';
        assert.equal(r.split(SEP).slice(0, -1).join(SEP), [
            '🦋 *MORPHO* · cbBTC/USDC · Base\n\n💰 *Posição líquida*\n`$11,236,161.74`\n\n❤️ *Health Rate*\n`2.73`',
            '📥 *SUPPLIED / COLLATERAL*\n\n₿ *cbBTC*\nQuantidade: `193.24183428 cbBTC`\nValor: `$16,407,882.93`',
            '📤 *BORROWED*\n\n💵 *USDC*\nQuantidade: `5,171,791.56 USDC`\nValor: `$5,171,721.19`',
            '📊 *RISCO*\n\nLTV atual: `31.52%`\nLLTV: `86.00%`\nPreço cbBTC (oráculo): `84,909.56 USDC`\n' +
                'Preço de liquidação: `31,120.13 USDC`\nUtilização do mercado: `90.04%`'
        ].join(SEP));
        assert.match(r.split(SEP).at(-1), /^👛 Carteira: `0x74…97C4`\n🌐 Rede: `Base`\n🕐 Atualizado: `\d\d:\d\d:\d\d`$/);

        // Só leitura: um POST com a consulta, a carteira e o timeout
        const [chamada] = rede.chamadas;
        assert.equal(chamada.url, 'https://api.morpho.org/graphql');
        assert.equal(chamada.cfg.body.variables.carteira, CARTEIRA);
        assert.match(chamada.cfg.body.query, /c8453: userByAddress\(address: \$carteira, chainId: 8453\)/);
        assert.equal(chamada.cfg.timeout, 15000);
        assert.ok(bot.logs.some(l => l.includes('[MORPHO] Consultando carteira 0x7445...97C4')));
        assert.ok(bot.logs.some(l => l.includes('[MORPHO] Total borrowed: $5,171,721.19')));
    });

    test('sem dívida: Health Rate ∞, sem LTV nem preço de liquidação', async () => {
        porRede[8453].marketPositions = [{
            ...MERCADO_BTC,
            healthFactor: null,
            state: { ...MERCADO_BTC.state, borrowAssets: 0, borrowAssetsUsd: 0 }
        }];
        const [r] = await bot.responder('/defi morpho');
        assert.match(r, /💰 \*Posição líquida\*\n`\$16,407,882\.93`\n\n❤️ \*Health Rate\*\n`∞`/);
        assert.doesNotMatch(r, /BORROWED|LTV atual|liquidação/);
        assert.match(r, /LLTV: `86\.00%`/);
    });

    test('só fornecido num mercado (sem colateral nem dívida): sem Health Rate nem risco', async () => {
        porRede[8453].marketPositions = [{
            ...MERCADO_BTC,
            healthFactor: null,
            state: { collateral: 0, collateralUsd: 0, borrowAssets: 0, borrowAssetsUsd: 0, supplyAssets: 1000000, supplyAssetsUsd: 0.99 }
        }];
        const [r] = await bot.responder('/defi morpho');
        assert.match(r, /💰 \*Posição líquida\*\n`\$0\.99`\n\n━+\n\n📥 \*SUPPLIED \/ COLLATERAL\*\n\n💵 \*USDC\*\nQuantidade: `1\.00 USDC`/);
        assert.doesNotMatch(r, /Health Rate|RISCO|BORROWED/);

        // Dívida sem colateral: sem dividir por zero
        assert.deepEqual(morpho.riscoDoMercado({ colateral: 0n, emprestado: 5n, preco: 10n ** 36n, lltv: 10n ** 17n }),
            { hf: null, ltv: null, precoLiquidacaoBruto: null });
    });

    test('várias posições (mercado e vault, duas redes): totais e o Health Rate de cada uma', async () => {
        await bot.setSetting('defi.morpho.chains', '8453 1');
        const ETH = { id: 1, network: 'Ethereum' };
        porRede[8453].vaultV2Positions = [{ vault: VAULT.vault, assets: VAULT.state.assets, assetsUsd: VAULT.state.assetsUsd }];
        porRede[1] = usuario({
            marketPositions: [{
                healthFactor: 1.4787878787878787,
                market: {
                    marketId: '0xeth', lltv: '915000000000000000', chain: ETH,
                    collateralAsset: asset('wstETH', 18, 4000, ETH), loanAsset: asset('WETH', 18, 3300, ETH),
                    state: { price: '1212121212121212121212121212121212121', utilization: 0.5 }
                },
                state: {
                    collateral: '2000000000000000000', collateralUsd: 8000,
                    borrowAssets: '1500000000000000000', borrowAssetsUsd: 4950,
                    supplyAssets: 0, supplyAssetsUsd: 0
                }
            }]
        });

        const [r] = await bot.responder('/defi morpho');
        // Fornecido: 16,407,882.93 + 2,499.97 + 8,000; emprestado: 5,171,721.19 + 4,950
        assert.match(r, /💰 \*Total líquido\*\n`\$11,241,711\.71`\n\n📥 \*Total supplied\/collateral\*\n`\$16,418,382\.90`\n\n📤 \*Total borrowed\*\n`\$5,176,671\.19`/);
        assert.match(r, /\*POSIÇÃO 1\* · cbBTC\/USDC · Base[\s\S]*Health Rate: `2\.73`/);
        assert.match(r, /\*POSIÇÃO 2\* · Vault Steakhouse USDC · Base\n\n📥 \*SUPPLIED\*\n\n💵 \*USDC\* _\(vault Steakhouse USDC\)_\nQuantidade: `2,500\.00 USDC`/);
        assert.match(r, /\*POSIÇÃO 3\* · wstETH\/WETH · Ethereum[\s\S]*Ξ \*wstETH\*\nQuantidade: `2\.00 wstETH`[\s\S]*Health Rate: `1\.48`/);
        assert.doesNotMatch(r, /❤️/, 'com várias, o HF fica em cada posição');
        assert.match(r, /🌐 Redes: `Base, Ethereum`/);
    });

    test('token sem preço: sem valor em dólar e fora dos totais', async () => {
        const RSS = asset('RSS', 18, null);
        const EUSD = asset('eUSD', 18, null);
        porRede[8453].marketPositions = [{
            healthFactor: 325.9100611460455,
            market: {
                marketId: '0xrss', lltv: '770000000000000000', chain: BASE, collateralAsset: RSS, loanAsset: EUSD,
                state: { price: '50000000000000000000000000000000000000000', utilization: 0.88 }
            },
            state: {
                collateral: '9497294999999976205989826', collateralUsd: null,
                borrowAssets: '1121922582611364335090401280', borrowAssetsUsd: null,
                supplyAssets: 0, supplyAssetsUsd: null
            }
        }];

        const [r] = await bot.responder('/defi morpho');
        assert.match(r, /^🦋 \*MORPHO\* · RSS\/eUSD · Base\n\n_Sem preço em USD \(fora dos totais\): RSS, eUSD_\n\n❤️ \*Health Rate\*\n`325\.91`/);
        assert.doesNotMatch(r, /Valor:|Posição líquida/);
        assert.match(r, /Quantidade: `9,497,294\.99999998 RSS`/);
        assert.match(r, /Preço de liquidação: `153\.42 eUSD`/);
    });

    test('sem cadastro: o MORPHO_WALLET_ADDRESS, o setting ou o aviso de não configurado', async () => {
        delete process.env.MORPHO_WALLET_ADDRESS;
        assert.deepEqual(await bot.responder('/defi morpho'), [
            '❌ Endereço da carteira Morpho não configurado.\n\n' +
            'Configure MORPHO_WALLET_ADDRESS no arquivo .env (ou /set defi.morpho.wallet <0x...>), ou cadastre a carteira: /defi morpho -wallet <0x...>']);

        await bot.setSetting('defi.morpho.wallet', OUTRA);
        await bot.responder('/defi morpho');
        assert.equal(rede.chamadas.at(-1).cfg.body.variables.carteira, OUTRA);

        process.env.MORPHO_WALLET_ADDRESS = CARTEIRA;   // o .env tem prioridade
        await bot.responder('/defi morpho');
        assert.equal(rede.chamadas.at(-1).cfg.body.variables.carteira, CARTEIRA);
        await assert.rejects(bot.setSetting('defi.morpho.wallet', 'xyz'), /0x e 40 caracteres/);
    });

    test('-wallet cadastra: /defi e /defi morpho mostram, -l e -rm valem, o -alerta não', async () => {
        delete process.env.MORPHO_WALLET_ADDRESS;
        assert.equal((await bot.responder(`/defi morpho -w ${CARTEIRA}`))[0],
            '✅ *Carteira do Morpho cadastrada:* 0x74…97C4\n📍 1 posição aberta.\n💡 _Veja com /defi morpho_');
        assert.match((await bot.responder(`/defi morpho -wallet ${CARTEIRA}`))[0], /ℹ️ 0x74…97C4 já está cadastrada no Morpho/);
        assert.match((await bot.responder('/defi morpho -w 0x123'))[0], /❌ -wallet: "0x123" não é uma carteira EVM/);
        assert.match((await bot.responder(`/defi morpho -address ${CARTEIRA}`))[0], /❌ No Morpho, a carteira vai no -wallet/);
        assert.match((await bot.responder(`/defi morpho -w ${OUTRA} -alerta`))[0], /❌ O alerta do \/defi é de faixa, só da Orca e do Project X: o Morpho não tem/);

        assert.match((await bot.responder('/defi morpho'))[0], /^🦋 \*MORPHO\* · cbBTC\/USDC · Base[\s\S]*👛 Carteira: `0x74…97c4`/);
        assert.match((await bot.responder('/defi'))[0], /^🦋 \*MORPHO\*/);
        assert.match((await bot.responder('/defi morpho', { chat: DONO.jid }))[0], new RegExp(`👛 Carteira: \`${CARTEIRA.toLowerCase()}\``));

        assert.match((await bot.responder('/defi -l'))[0], /1\. Morpho · carteira 0x74…97c4 _/);
        assert.match((await bot.responder('/defi -alerta 1'))[0], /❌ O alerta do \/defi é de faixa, só da Orca e do Project X: a nº 1 é do Morpho/);
        assert.match((await bot.responder('/defi -alerta all'))[0], /🌊 Nenhuma posição da Orca ou do Project X cadastrada/);
        assert.equal((await bot.responder('/defi -rm 1'))[0], '🗑️ Removido: Morpho · carteira 0x74…97c4');

        // A mesma carteira no Morpho e no Project X: dois cadastros
        await bot.dbRun("INSERT INTO defi_positions (protocol, wallet, created_at) VALUES ('prjx', ?, 0)", [CARTEIRA.toLowerCase()]);
        assert.match((await bot.responder(`/defi morpho -w ${CARTEIRA}`))[0], /✅ \*Carteira do Morpho cadastrada/);
    });

    test('cadastrada com a API fora do ar: não cadastra; depois, o /defi avisa', async () => {
        rede.limpar();
        responderApi(erroHttp(503));
        assert.equal((await bot.responder(`/defi morpho -w ${CARTEIRA}`, { erroEsperado: true }))[0],
            '⚠️ Não consegui ler a carteira agora: A API do Morpho está fora do ar.\n💡 _Tente de novo em alguns instantes._');
        assert.equal((await bot.dbGet('SELECT COUNT(*) AS n FROM defi_positions')).n, 0);

        await bot.dbRun("INSERT INTO defi_positions (protocol, wallet, created_at) VALUES ('morpho', ?, 0)", [CARTEIRA.toLowerCase()]);
        assert.deepEqual(await bot.responder('/defi', { erroEsperado: true }),
            ['⚠️ Não consegui ler Morpho · carteira 0x74…97c4 agora: A API do Morpho está fora do ar.\n💡 _Tente de novo em alguns instantes._']);
    });

    test('nenhuma posição aberta (as zeradas não contam)', async () => {
        porRede[8453] = usuario({ vaultPositions: [{ ...VAULT, state: { assets: 0, assetsUsd: 0 } }] });
        assert.deepEqual(await bot.responder('/defi morpho'),
            ['🦋 *MORPHO*\n\nNenhuma posição aberta na carteira `0x74…97C4` (chain 8453).']);
    });

    test('erros: fora do ar, timeout, rate limit, rede não suportada e resposta inesperada', async () => {
        const erroDe = async (resposta) => {
            morpho.limparCacheMorpho();
            rede.limpar();
            responderApi(resposta);
            const [r] = await bot.responder('/defi morpho', { erroEsperado: true });
            assert.match(r, /^❌ \*Erro ao consultar Morpho\*\n\n.*\n\nTente novamente em alguns instantes\.$/);
            return r.split('\n')[2];
        };

        assert.equal(await erroDe(erroHttp(503)), 'A API do Morpho está fora do ar.');
        assert.equal(await erroDe(erroHttp(429)), 'Muitas consultas seguidas: a API do Morpho pediu um tempo.');
        assert.equal(await erroDe(Object.assign(new Error('timeout of 15000ms exceeded'), { code: 'ECONNABORTED' })),
            'A API do Morpho não respondeu em 15 segundos.');
        assert.equal(await erroDe(new Error('getaddrinfo ENOTFOUND api.morpho.org')), 'Não consegui falar com a API do Morpho.');
        assert.equal(await erroDe(erroHttp(400, 'HTTP 400', { data: { errors: [{ message: 'unsupported chainId "5"' }] } })),
            'Rede não suportada pelo Morpho (5): confira o setting defi.morpho.chains.');
        assert.equal(await erroDe({ errors: [{ message: 'Internal error' }], data: null }), 'A API do Morpho recusou a consulta.');
        assert.equal(await erroDe({ data: null }), 'A API do Morpho mandou uma resposta inesperada.');
        assert.equal(await erroDe(''), 'A API do Morpho mandou uma resposta inesperada.');
        assert.equal(await erroDe({ data: { c8453: usuario({ marketPositions: [{ market: MERCADO_BTC.market }] }) } }),
            'A API do Morpho mandou uma posição incompleta.');
        assert.equal(await erroDe({ data: { c8453: usuario({ marketPositions: [{ ...MERCADO_BTC, state: { ...MERCADO_BTC.state, collateral: 1.5 } }] }) } }),
            'A API do Morpho mandou números que não consegui ler.');

        // O detalhe técnico fica no log, não no WhatsApp
        assert.ok(bot.logs.some(l => l.includes('[MORPHO] Erro na API: HTTP 503')));
    });

    test('cache de 30 s: a mesma carteira não consulta a API de novo', async () => {
        await bot.responder('/defi morpho');
        await bot.responder('/defi morpho');
        assert.equal(rede.chamadas.length, 1);

        // O cadastro (em minúsculas) é a mesma carteira; outra consulta
        await bot.responder(`/defi morpho -w ${CARTEIRA}`);
        assert.equal(rede.chamadas.length, 1);
        await bot.responder(`/defi morpho -w ${OUTRA}`);
        assert.equal(rede.chamadas.length, 2, 'outra carteira consulta');
    });
});
