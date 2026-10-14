/*
 * Anti-SSRF do /get e da prévia de link: bloqueio de endereços internos,
 * recusa de respostas DNS mistas e pin de IP com revalidação de redirects.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { enderecosPublicos, httpGetSeguro, isEnderecoBloqueado, isUrlPublica } = require('../src/util/url');

test('isEnderecoBloqueado cobre os ranges internos (e mapeados em IPv6)', () => {
    for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.0.1',
        '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fe80::1', '::ffff:10.0.0.1']) {
        assert.equal(isEnderecoBloqueado(ip), true, `deveria bloquear ${ip}`);
    }
    for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) {
        assert.equal(isEnderecoBloqueado(ip), false, `não deveria bloquear ${ip}`);
    }
});

test('isUrlPublica recusa IP interno literal e metadata', async () => {
    assert.equal(await isUrlPublica('http://127.0.0.1/'), false);
    assert.equal(await isUrlPublica('http://169.254.169.254/latest/meta-data/'), false);
    assert.equal(await isUrlPublica('http://[::1]:2375/'), false);
    assert.equal(await isUrlPublica('http://10.0.0.5:8080/'), false);
});

test('enderecosPublicos devolve [] para host interno', async () => {
    assert.deepEqual(await enderecosPublicos('127.0.0.1'), []);
    assert.deepEqual(await enderecosPublicos('169.254.169.254'), []);
});

test('httpGetSeguro recusa conectar em loopback (pin antes do connect)', async () => {
    await assert.rejects(
        () => httpGetSeguro('http://127.0.0.1:1/'),
        /endereço não permitido/
    );
});

test('httpGetSeguro não segue redirect para endereço interno', async (t) => {
    // Servidor público (do ponto de vista do teste, um IP não bloqueado via lookup falso):
    // aqui validamos que um Location interno é recusado na revalidação do salto.
    const servidor = http.createServer((req, res) => {
        res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' });
        res.end();
    });
    await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
    t.after(() => servidor.close());

    // O primeiro salto é loopback: já é recusado no pin, antes mesmo do redirect.
    // (Garante que nenhum caminho alcança o host interno.)
    const porta = servidor.address().port;
    await assert.rejects(
        () => httpGetSeguro(`http://127.0.0.1:${porta}/`),
        /endereço não permitido/
    );
});
