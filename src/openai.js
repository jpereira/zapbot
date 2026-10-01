/*
 * Modelos da OpenAI aceitos pelo /gpt (endpoint v1/chat/completions).
 * Lista conferida em 30/09/2026 em developers.openai.com/api/docs/models: ficam
 * de fora os "pro"/"codex" (só Responses API), a família o* (descontinuada) e
 * os de áudio, imagem e embeddings.
 */
const OPENAI_MODELOS = [
    'gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-sol', 'gpt-6-luna',
    'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna',
    'gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5.2', 'gpt-5.1',
    'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini'
];

module.exports = {
    OPENAI_MODELOS
};
