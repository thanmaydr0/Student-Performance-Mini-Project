const express = require("express");
const router = express.Router();
const multer = require("multer");
const { PDFParse } = require("pdf-parse");
const axios = require("axios");
const supabase = require("../config/supabase");

// Configure multer for memory storage (no disk writes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowed = ["application/pdf", "text/plain"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and TXT files are allowed"), false);
    }
  },
});

// POST /api/uploads/analyze — Upload a file and get AI analysis
router.post("/analyze", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const userId = req.headers["x-user-id"]; // passed from frontend
    const fileName = req.file.originalname;
    const fileType = req.file.mimetype;

    // 1. Extract text from the file
    let extractedText = "";

    if (fileType === "application/pdf") {
      const parser = new PDFParse(new Uint8Array(req.file.buffer));
      const result = await parser.getText();
      extractedText = result.text || "";
    } else {
      // Plain text file
      extractedText = req.file.buffer.toString("utf-8");
    }

    if (!extractedText || extractedText.trim().length < 20) {
      return res.status(400).json({ error: "Could not extract enough text from the file. Please upload a text-based PDF." });
    }

    // Truncate to first 3000 chars to stay within token limits
    const truncatedText = extractedText.substring(0, 3000);

    // 2. Send to OpenAI for analysis
    const analysisPrompt = `You are an academic study assistant. Analyze the following study material and provide:
1. **Summary** (2-3 sentences)
2. **Key Concepts** (bullet list of 5-8 important topics/terms)
3. **Quiz** (3 multiple-choice questions with 4 options each, mark the correct answer)

Study Material:
---
${truncatedText}
---

Respond in clean markdown format.`;

    const openaiResponse = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are an expert academic tutor." },
          { role: "user", content: analysisPrompt },
        ],
        max_tokens: 1024,
        temperature: 0.5,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        timeout: 30000,
      }
    );

    const analysisResult = openaiResponse.data?.choices?.[0]?.message?.content;

    if (!analysisResult) {
      throw new Error("Failed to get analysis from AI");
    }

    // 3. Save metadata to Supabase
    const record = {
      file_name: fileName,
      file_type: fileType,
      analysis_status: "complete",
      analysis_result: {
        text_length: extractedText.length,
        analysis: analysisResult,
        analyzed_at: new Date().toISOString(),
      },
    };

    // Only add user_id if provided
    if (userId) {
      record.user_id = userId;
    }

    const { data: insertedRow, error: dbError } = await supabase
      .from("uploads")
      .insert([record])
      .select()
      .single();

    if (dbError) {
      console.error("DB Error:", dbError.message);
      // Still return the analysis even if DB save fails
    }

    res.json({
      id: insertedRow?.id || null,
      file_name: fileName,
      analysis: analysisResult,
      status: "complete",
    });
  } catch (error) {
    console.error("Upload/Analysis Error:", error.message);
    const statusCode = error.response?.status || 500;
    res.status(statusCode).json({
      error: error.message || "Analysis failed",
    });
  }
});

// GET /api/uploads/recent — Fetch recent uploads for a user
router.get("/recent", async (req, res) => {
  try {
    const userId = req.query.userId;

    let query = supabase
      .from("uploads")
      .select("id, file_name, file_type, analysis_status, analysis_result, created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({ uploads: data || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/uploads/:id — Get a specific upload's analysis
router.get("/:id", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("uploads")
      .select("*")
      .eq("id", req.params.id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: "Upload not found" });
    }

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
