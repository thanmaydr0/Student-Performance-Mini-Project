require("dotenv").config({ override: true });
const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// Routes
// Auth is now handled client-side via Supabase SDK (no Express auth routes needed)
app.use("/api/jarvis",require("./routes/jarvis.routes"));
app.use("/api/uploads", require("./routes/uploads.routes"));

// Test route
app.get("/", (req, res) => {
  res.send("Backend running 🚀");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});