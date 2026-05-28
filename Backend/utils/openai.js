import "dotenv/config";

const getOpenAIAPIResponse = async(messages) => {

    const options = {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model: process.env.OPENAI_MODEL,
            messages: messages
        })
    };

    try {

        const response = await fetch(
            "https://api.openai.com/v1/chat/completions",
            options
        );

        const data = await response.json();

        console.log(data);

        if(data.error) {
            throw new Error(data.error.message);
        }

        return data.choices[0].message.content;

    } catch(err) {

        console.log("OPENAI ERROR:", err.message);

        return "Sorry, something went wrong.";
    }
}

export default getOpenAIAPIResponse;