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
    ultimaQueda: null       // motivo do último 'disconnected' (null depois do 'ready')
};

module.exports = {
    estado
};
