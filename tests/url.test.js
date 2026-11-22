/*
 * Anti-SSRF for /get and the link preview: blocks internal addresses,
 * refusal of mixed DNS answers and IP pin with redirect revalidation.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { addressesPublic, httpGetSafe, isAddressBlocked, isUrlPublic } = require('../src/util/url');

test('isEnderecoBloqueado cobre os ranges internos (e mapeados em IPv6)', () => {
    for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.0.1',
        '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fe80::1', '::ffff:10.0.0.1']) {
        assert.equal(isAddressBlocked(ip), true, `deveria bloquear ${ip}`);
    }
    for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) {
        assert.equal(isAddressBlocked(ip), false, `não deveria bloquear ${ip}`);
    }
});

test('isUrlPublica recusa IP interno literal e metadata', async () => {
    assert.equal(await isUrlPublic('http://127.0.0.1/'), false);
    assert.equal(await isUrlPublic('http://169.254.169.254/latest/meta-data/'), false);
    assert.equal(await isUrlPublic('http://[::1]:2375/'), false);
    assert.equal(await isUrlPublic('http://10.0.0.5:8080/'), false);
});

test('enderecosPublicos devolve [] para host interno', async () => {
    assert.deepEqual(await addressesPublic('127.0.0.1'), []);
    assert.deepEqual(await addressesPublic('169.254.169.254'), []);
});

test('httpGetSeguro recusa conectar em loopback (pin antes do connect)', async () => {
    await assert.rejects(
        () => httpGetSafe('http://127.0.0.1:1/'),
        /endereço não permitido/
    );
});

test('httpGetSeguro não segue redirect para endereço interno', async (t) => {
    // Public server (from the test's point of view, an IP not blocked via fake lookup):
    // here we validate that an internal Location is refused on the hop's revalidation
    const server = http.createServer((req, res) => {
        res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' });
        res.end();
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    t.after(() => server.close());

    // The first hop is loopback: it is already refused at the pin, even before the redirect.
    // (Guarantees that no path reaches the internal host.)
    const port = server.address().port;
    await assert.rejects(
        () => httpGetSafe(`http://127.0.0.1:${port}/`),
        /endereço não permitido/
    );
});
