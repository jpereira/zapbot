/*
 * Estado da conexão com o WhatsApp, compartilhado entre os módulos.
 *
 * Um objeto (e não variáveis soltas) porque vários módulos alteram estes
 * valores: quem importa recebe a mesma referência e vê as mudanças.
 *
 * O reinício tem trava (reiniciando): antes, watchdog, 'disconnected' e
 * iniciarBot() podiam reiniciar o cliente ao mesmo tempo, corrompendo a sessão
 * e gerando QR Codes após a autenticação.
 */
const estado = {
    autenticadoEm: 0,       // quando autenticou (0 = não autenticado); usado pelo /uptime
    pronto: false,          // evento 'ready' recebido e sem queda desde então
    reiniciando: false,     // restartClient() em andamento
    ultimaQueda: null,      // motivo do último 'disconnected' (null depois do 'ready')
    tentativas: 0,          // falhas seguidas ao conectar (initialize); 0 depois do 'ready'
    foraDesde: null,        // desde quando não consegue conectar (null depois do 'ready')
    aguardandoQr: false     // o WhatsApp mostrou o QR Code e ninguém leu ainda
};

module.exports = {
    estado
};
