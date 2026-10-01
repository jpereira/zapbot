/*
 * OpenAI models accepted by /gpt (v1/chat/completions endpoint).
 * List checked on 30/09/2026 at developers.openai.com/api/docs/models: these stay
 * leaves out the "pro"/"codex" ones (Responses API only), the o* family (discontinued) and
 * the audio, image and embeddings ones.
 */
const OPENAI_MODELS = [
    'gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-sol', 'gpt-6-luna',
    'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna',
    'gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5.2', 'gpt-5.1',
    'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini'
];

module.exports = {
    OPENAI_MODELS
};
