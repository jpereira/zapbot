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

        await erro(`/defi -position ${POSICAO}`, /❌ Informe o protocolo: por enquanto só a Orca/);
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
        await erro(CADASTRO, /ℹ️ A posição Hz15…RaPZ já está cadastrada/);
    });

    test('RPC com limite ou posição fechada: avisa e sugere o defi.solana.rpc', async () => {
        await bot.responder(CADASTRO);

        rede.responder('post', 'api.mainnet-beta.solana.com', { error: { code: 429, message: 'Too many requests' } });
        const [r] = await bot.responder('/defi -show', { erroEsperado: true });
        assert.match(r, /⚠️ Não consegui ler a posição Hz15…RaPZ agora: RPC da Solana: Too many requests\.\n💡 _O RPC público da Solana limita as consultas; um RPC próprio vai no setting defi\.solana\.rpc\._/);

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

    test('liga no seu privado; avisa ao sair da faixa, uma vez; volta e sai: avisa de novo', async () => {
        const [r] = await bot.responder('/defi -alerta 1');
        assert.match(r, /^🔔 \*Alerta do \/defi ligado\* \(1\)\n\n1\. Orca · Hz15…RaPZ · ✅ na faixa\n\n📣 Aviso: seu privado, sempre que a posição sair da faixa \(verificada a cada 10 minutos\)\./);
        assert.deepEqual(await verificar(), [], 'na faixa: nada');

        foraDaFaixa();
        const [aviso] = await verificar();
        assert.equal(aviso.chatId, DONO.jid);
        assert.match(aviso.content, /^🚨 \*DeFi: a posição Hz15…RaPZ saiu da faixa\*\n\n🌊 \*Orca · SOL\/cbBTC\*[\s\S]*⚠️ \*fora da faixa\* \(preço abaixo/);
        assert.match(aviso.content, /💡 _Desligue com \/defi -alerta -rm 1\._$/);
        assert.deepEqual(await verificar(), [], 'continua fora: não repete');

        naFaixa();
        assert.deepEqual(await verificar(), []);
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

    test('ligado já fora da faixa: só avisa depois de voltar e sair de novo', async () => {
        foraDaFaixa();
        assert.match((await bot.responder('/defi -a 1'))[0], /1\. Orca · Hz15…RaPZ · ⚠️ fora da faixa _\(avisa quando voltar para a faixa e sair de novo\)_/);
        assert.deepEqual(await verificar(), []);
    });

    test('RPC fora: liga sem o estado e avisa na primeira leitura fora da faixa', async () => {
        rede.responder('post', 'api.mainnet-beta.solana.com', { error: { code: 429, message: 'Too many requests' } });
        assert.match((await bot.responder('/defi -a 1', { erroEsperado: true }))[0], /· ❔ ainda não lida/);
        assert.deepEqual(await verificar(), []);

        foraDaFaixa();
        assert.equal((await verificar()).length, 1);
    });

    test('-send: contato, grupo (com escolha) ou número', async () => {
        await bot.responder('/defi -alerta 1 -send /Fulano/');
        foraDaFaixa();
        assert.equal((await verificar())[0].chatId, OUTRO.jid);

        bot.criarGrupo('120363000000000300@g.us', 'Cripto Rio', [DONO.jid]);
        bot.criarGrupo('120363000000000301@g.us', 'Cripto SP', [DONO.jid]);
        const r = await bot.responderEscolhendo('/defi -a 1 -send cripto', 2);
        assert.match(r[0], /^🔎 "cripto" corresponde a 2 grupos:\n\n1\. 👥 Cripto Rio\n2\. 👥 Cripto SP/);
        assert.match(r.at(-1), /📣 Aviso: 👥 Cripto SP, sempre que/);

        assert.match((await bot.responder('/defi -a 1 -send +5521911111111'))[0], /📣 Aviso: 👤 Fulano,/);
        assert.match((await bot.responder('/defi -a 1 -send xyz'))[0], /❌ Nenhum contato ou grupo com "xyz" no nome/);
        assert.match((await bot.responder('/defi -a 1 -send'))[0], /❌ Informe o destino do -send/);
        assert.match((await bot.responder('/defi -send email'))[0], /❌ O -send é do -alerta/);
        assert.match((await bot.responder('/defi -a 7'))[0], /❌ Posição nº 7 não existe/);
    });

    test('-send email: pelo SMTP do bot, sem a formatação do WhatsApp', async () => {
        assert.match((await bot.responder('/defi -a 1 -send email'))[0], /❌ O "email" do -send usa o QRCODE_EMAIL_SMTP_TO/);
        assert.match((await bot.responder('/defi -a 1 -send eu@exemplo.com'))[0], /❌ SMTP não configurado/);

        const env = { QRCODE_EMAIL_SMTP_HOST: 'smtp.exemplo.com', QRCODE_EMAIL_SMTP_USER: 'bot@exemplo.com', QRCODE_EMAIL_SMTP_TO: 'eu@exemplo.com' };
        Object.assign(process.env, env);
        try {
            assert.match((await bot.responder('/defi -a 1 -send "email, outro@exemplo.com"'))[0], /📣 Aviso: 📧 eu@exemplo\.com, outro@exemplo\.com,/);

            foraDaFaixa();
            assert.deepEqual(await verificar(), [], 'nada no WhatsApp');
            const [m] = emails;
            assert.equal(m.to, 'eu@exemplo.com, outro@exemplo.com');
            assert.equal(m.subject, '[ZapBot] DeFi: a posição Hz15…RaPZ saiu da faixa');
            assert.match(m.text, /^🚨 DeFi: a posição Hz15…RaPZ saiu da faixa\n\n🌊 Orca · SOL\/cbBTC/);
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
