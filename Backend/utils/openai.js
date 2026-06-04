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
        return "Sorry, something went wrong.";
    }
}

const getOpenAIJSONResponse = async (messages) => {
    const options = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model: process.env.OPENAI_MODEL || "gpt-4o-mini",
            response_format: { type: "json_object" }, 
            messages: messages
        })
    };
    try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", options);
        const data = await response.json();
        if(data.error) throw new Error(data.error.message);
        return JSON.parse(data.choices[0].message.content);
    } catch(err) {
        console.log("OPENAI JSON ERROR:", err.message);
        return null;
    }
}

// NEW: Vector Embedding Generator for Semantic Search
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

export { getOpenAIAPIResponse, getOpenAIJSONResponse, getOpenAIEmbedding };