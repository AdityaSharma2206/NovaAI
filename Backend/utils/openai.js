import "dotenv/config";

const getOpenAIAPIResponse = async (messages) => {
    const options = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model: process.env.OPENAI_MODEL || "gpt-4o-mini",
            messages: messages
        })
    };
    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", options);
        const data = await response.json();
        if(data.error) throw new Error(data.error.message);
        return data.choices[0].message.content;
    } catch(err) {
        console.log("OPENAI ERROR:", err.message);
        return null; // signal failure so callers skip persisting a bogus value
    }
}

// Vector Embedding Generator for Semantic Search
const getOpenAIEmbedding = async (text) => {
    const options = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model: "text-embedding-3-small",
            input: text
        })
    };
    try {
        const response = await fetch("https://api.openai.com/v1/embeddings", options);
        const data = await response.json();
        if(data.error) throw new Error(data.error.message);
        
        return data.data[0].embedding; // Returns array of 1536 numbers
    } catch(err) {
        console.log("EMBEDDING ERROR:", err.message);
        return [];
    }
}

const getOpenAIStreamingResponse = async (messages, onChunk, onDone, signal) => {
    const options = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model: process.env.OPENAI_MODEL || "gpt-4o-mini",
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
                    onDone(assembled, usage);
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
        onDone(assembled, usage);
    } catch (err) {
        if (err.name !== "AbortError") console.log("OPENAI STREAMING ERROR:", err.message);
        onDone("", null);
    }
};

export { getOpenAIAPIResponse, getOpenAIEmbedding, getOpenAIStreamingResponse };