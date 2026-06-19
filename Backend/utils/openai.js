import "dotenv/config";

const getOpenAIAPIResponse = async (messages) => {
    const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
    const options = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({ model, messages })
    };
    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", options);
        const data = await response.json();
        if(data.error) throw new Error(data.error.message);
        return { content: data.choices[0].message.content, usage: data.usage, model };
    } catch(err) {
        console.log("OPENAI ERROR:", err.message);
        return { content: null, usage: null, model }; // content:null signals failure to callers
    }
}

// Vector Embedding Generator for Semantic Search
const getOpenAIEmbedding = async (text) => {
    const model = "text-embedding-3-small";
    const options = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({ model, input: text })
    };
    try {
        const response = await fetch("https://api.openai.com/v1/embeddings", options);
        const data = await response.json();
        if(data.error) throw new Error(data.error.message);

        return { embedding: data.data[0].embedding, usage: data.usage, model };
    } catch(err) {
        console.log("EMBEDDING ERROR:", err.message);
        return { embedding: [], usage: null, model };
    }
}

const getOpenAIStreamingResponse = async (messages, onChunk, onDone, signal) => {
    const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
    const options = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model,
            messages,
            stream: true,
            stream_options: { include_usage: true }  // asks OpenAI to send real token counts
        }),
        signal  // aborts the upstream request if the client disconnects
    };
    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", options);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let assembled = "";
        let usage = null; // populated by the extra usage chunk OpenAI sends before [DONE]

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop(); // keep any partial line for the next iteration

            for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                const payload = line.slice(6).trim();
                if (payload === "[DONE]") {
                    onDone(assembled, usage, model);
                    return;
                }
                try {
                    const parsed = JSON.parse(payload);
                    // Capture the usage chunk (choices is empty, usage is populated)
                    if (parsed.usage) usage = parsed.usage;
                    const token = parsed.choices[0]?.delta?.content || "";
                    if (token) {
                        assembled += token;
                        onChunk(token);
                    }
                } catch { /* malformed chunk, skip */ }
            }
        }
        onDone(assembled, usage, model);
    } catch (err) {
        if (err.name !== "AbortError") console.log("OPENAI STREAMING ERROR:", err.message);
        onDone("", null, model);
    }
};

export { getOpenAIAPIResponse, getOpenAIEmbedding, getOpenAIStreamingResponse };