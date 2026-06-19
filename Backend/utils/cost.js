import Usage from "../models/Usage.js";

// OpenAI pricing in USD per 1M tokens. Single source of truth — update here when prices change.
// Embeddings are input-only, so outPer1M is 0.
const PRICING = {
    "gpt-4.1-mini":           { inPer1M: 0.40, outPer1M: 1.60 },
    "text-embedding-3-small": { inPer1M: 0.02, outPer1M: 0 },
};

// Cost of a single call from its usage object.
// usage: { prompt_tokens, completion_tokens? } — completion_tokens is absent for embeddings.
const costUsd = (model, usage) => {
    if (!usage) return 0;
    const rates = PRICING[model];
    if (!rates) {
        console.warn(`[cost] No pricing for model "${model}" — recording $0. Add it to PRICING in utils/cost.js.`);
        return 0;
    }
    const promptTokens     = usage.prompt_tokens     || 0;
    const completionTokens = usage.completion_tokens || 0;
    return (promptTokens     * rates.inPer1M  / 1_000_000) +
           (completionTokens * rates.outPer1M / 1_000_000);
};

// Record one OpenAI call. Fire-and-forget so it never blocks or breaks the request.
// `result` is the { usage, model } returned by the openai.js helpers.
const logUsage = (userId, type, { usage, model } = {}) => {
    if (!usage || !model) return; // call failed or usage unavailable — nothing to record
    Usage.create({
        userId,
        type,
        model,
        promptTokens:     usage.prompt_tokens     || 0,
        completionTokens: usage.completion_tokens || 0,
        costUsd:          costUsd(model, usage)
    }).catch(err => console.log("[Usage] Error:", err));
};

export { PRICING, costUsd, logUsage };
