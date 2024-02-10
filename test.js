import {SSE} from "./out/sse.js";
//import {SSE} from "./ogsse.js";
console.log("Checking...");

const API_URL = "https://api.openai.com/v1/chat/completions";
const API_KEY = "INSERT_API_KEY_HERE";

const promptInput = document.getElementById("promptInput");
const generateBtn = document.getElementById("generateBtn");
const stopBtn = document.getElementById("stopBtn");
const resultText = document.getElementById("resultText");


const generate = async () => {
    // Alert the user if no prompt value
    if (!promptInput.value) {
      alert("Please enter a prompt.");
      return;
    }

    try {
    const sse = new SSE(API_URL, 
        {headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`, 
        },
        method: "POST",
        payload: JSON.stringify({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: promptInput.value }],
            max_tokens: 100,
            stream: true, // For streaming responses
        }),

    });

    sse.addEventListener("message", (event) => {
        if (event.data !== "[DONE]") {
            let payload = JSON.parse(event.data);
            let {delta} = payload.choices[0]
            const { content } = delta;
            console.log(content);
            if (content !== "\n") {
                console.log('text:', content)
                resultText.innerText += content;
            }
        }
        //resultText.innerText = event.data;
    });


    } catch(error) {
        console.error("Error:", error);
        resultText.innerText = "Error occurred while generating.";
    }

}

promptInput.addEventListener("keyup", (event) => {
    if (event.key === "Enter") {
      generate();
    }
  });
  generateBtn.addEventListener("click", generate);
