/*
 * /draw: Desenha uma imagem ou um GIF animado com o GPT Image
 */

const { ADMIN } = require('../../roles').ROLES;
const { opcaoStatus } = require('./_opcoes');

module.exports = {
    cmd: '/draw',
    usage: '/draw [pedido]  ou  /draw -gif [-frames N] [-ms N] [pedido]  ou  /draw [-gif] -model [modelo]',
    aliases: ['/desenhe', '/desenha', '/img'],
    summary: 'Desenha uma imagem com o GPT Image (OpenAI)',
    help: 'Desenha uma imagem com o GPT Image (OpenAI); com -gif, um GIF animado (GPT Image 2.6), e numa foto (legenda ou resposta) edita a foto ou a anima. Respondendo uma mensagem, o texto dela entra no pedido. Precisa de OPENAI_API_KEY no config/.env ou do setting openai.api.key.',
    cmd_opts: [
        {
            opts: ['gif', 'g'],
            values: [],
            desc: 'GIF animado (modelo openai.image.gifModel; só os gpt-image-2.6-*). Numa foto, ou respondendo uma, anima a foto. Os quadros e o tempo de cada um são os settings openai.gif.frames e openai.gif.frameMs.',
            ex: ['/img -gif um gato dançando', '/img -gif a bandeira ao vento (respondendo uma foto)'],
            cron: false
        },
        {
            opts: ['frames', 'f'],
            values: ['<n>'],
            desc: 'Quadros do GIF, de 2 a 16 (padrão: o setting openai.gif.frames, 9). Vale como -gif; quanto mais quadros, mais caro.',
            ex: ['/img -f 6 uma bandeira ao vento'],
            cron: false
        },
        {
            opts: ['ms'],
            values: ['<ms>'],
            desc: 'Duração de cada quadro do GIF, de 20 a 2000 ms (padrão: o setting openai.gif.frameMs, 200). Vale como -gif.',
            ex: ['/img -gif -f 6 -ms 300 uma bandeira ao vento'],
            cron: false
        },
        {
            opts: ['model', 'm'],
            values: ['[modelo]'],
            desc: 'Troca o modelo da imagem (setting openai.image.model) ou, com -gif, o do GIF (openai.image.gifModel). Sem modelo, lista o atual e os que a sua chave vê.',
            ex: ['/draw -m', '/draw -m gpt-image-2', '/draw -gif -m gpt-image-2.6-flare'],
            role: ADMIN
        },
        opcaoStatus('/draw -s um gato astronauta em aquarela'),
        {
            argv: ['<pedido>'],
            desc: 'O que desenhar ou animar. Respondendo uma mensagem, o texto dela entra antes do pedido; numa foto (a da própria mensagem, na legenda, ou a respondida), o pedido edita a foto (ou, no -gif, a anima; sem pedido, com um movimento sutil).',
            ex: ['/draw um gato astronauta em aquarela', '/draw coloque um chapéu nele (respondendo uma foto)']
        }
    ],
    estrito: 'primeira',
    delegavel: true,
    role: ADMIN // delegável: gasta a conta da OpenAI do dono (o -model é só do dono e dos admins)
};
