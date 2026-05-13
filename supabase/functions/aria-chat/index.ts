const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { message, fileContent, mode } = await req.json();

    // Validate input
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Message is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Different system prompts based on mode
    let systemPrompt = "";

    if (mode === "data-extraction") {
      systemPrompt = `You are Aria, a Data Extraction & Conversion specialist for the Scholarly Monograph faculty portal.

Your primary role is to extract structured data from raw text, CSV content, or unstructured notes provided by teachers.

When extracting student marks data:
- Always output data in a structured JSON array format
- Each record should have: student_id, full_name, subject, marks_obtained, total_marks, exam_type, grade
- Calculate grades automatically: A+ (90-100%), A (80-89%), B+ (70-79%), B (60-69%), C (50-59%), F (<50%)
- If data is ambiguous, ask clarifying questions

Response format for extracted data:
{
  "type": "extracted_data",
  "message": "Brief description of what was extracted",
  "headers": ["Student ID", "Full Name", "Subject", "Score", "Exam Type", "Grade"],
  "rows": [["ID", "Name", "Subject", "45/50", "IAT 1", "A+"]]
}

For conversational responses:
{
  "type": "message",
  "message": "Your response text here"
}`;
    } else {
      systemPrompt = `You are Aria, an intelligent faculty assistant for the Scholarly Monograph platform.

Your capabilities:
- Extract and structure student marks data from raw text/CSV/uploaded content
- Analyze class performance trends and identify at-risk students
- Generate reports and summaries for faculty review
- Help with scheduling and academic planning
- Answer questions about student performance patterns

Always be professional, precise, and data-driven in your responses.
Use markdown formatting for structured output.

${fileContent ? `\nFile Content Provided:\n${fileContent}` : ""}`;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message },
        ],
        max_tokens: 2048,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content;

    if (!reply) {
      throw new Error("Invalid response from OpenAI API");
    }

    // Try to parse structured response, otherwise return as plain message
    let parsedReply;
    try {
      parsedReply = JSON.parse(reply);
    } catch {
      parsedReply = { type: "message", message: reply };
    }

    return new Response(
      JSON.stringify({ reply: parsedReply }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Aria Chat Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message || "Aria service unavailable" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
