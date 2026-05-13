const express = require("express");
const router = express.Router();
const axios = require("axios");


// Use OpenAI API instead of Gemini
router.post("/chat", async (req, res) => {
  try {
    const { message } = req.body;

    // Validate input
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ error: "Message is required and must be a non-empty string" });
    }

    // Check OpenAI API key exists
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OpenAI API key not configured" });
    }

    const url = "https://api.openai.com/v1/chat/completions";

    const response = await axios.post(
      url,
      {
        model: "gpt-3.5-turbo", // You can change to "gpt-4" if you have access
        messages: [
          {
            role: "system",
            content: "You are J.A.R.V.I.S, a smart academic assistant for students."
          },
          {
            role: "user",
            content: message
          }
        ],
        max_tokens: 512,
        temperature: 0.7
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        timeout: 10000 // 10 second timeout
      }
    );


    // Safely extract reply with null checks
    const reply = response.data?.choices?.[0]?.message?.content;
    if (!reply) {
      throw new Error("Invalid response structure from OpenAI API");
    }

    res.json({ reply });

  } catch (error) {
    console.error("Chat Error:", error.message);
    
    // Don't expose full error details to client
    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.error?.message || error.message || "Chat service unavailable";
    
    res.status(statusCode).json({
      error: errorMessage
    });
  }
});

module.exports = router;