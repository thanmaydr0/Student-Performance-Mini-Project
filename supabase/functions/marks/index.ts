import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabase-client.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseAdmin();
    const url = new URL(req.url);
    const path = url.pathname.split("/").filter(Boolean);
    const action = path[path.length - 1]; // last segment

    // ─── GET ALL MARKS (with optional filters) ───
    if (req.method === "GET") {
      const studentId = url.searchParams.get("student_id");
      const subject = url.searchParams.get("subject");
      const examType = url.searchParams.get("exam_type");

      let query = supabase
        .from("marks")
        .select("*, users!marks_student_id_fkey(full_name, student_id)")
        .order("created_at", { ascending: false });

      if (studentId) query = query.eq("student_id", studentId);
      if (subject) query = query.eq("subject", subject);
      if (examType) query = query.eq("exam_type", examType);

      const { data, error } = await query;

      if (error) throw error;

      return new Response(
        JSON.stringify({ data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── ADD SINGLE MARK ───
    if (req.method === "POST" && action !== "bulk") {
      const { student_id, subject, exam_type, marks_obtained, total_marks } = await req.json();

      if (!student_id || !subject || !exam_type || marks_obtained === undefined || !total_marks) {
        return new Response(
          JSON.stringify({ error: "student_id, subject, exam_type, marks_obtained, and total_marks are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Calculate percentage and grade
      const percentage = (marks_obtained / total_marks) * 100;
      const grade = calculateGrade(percentage);

      const { data, error } = await supabase.from("marks").insert([
        { student_id, subject, exam_type, marks_obtained, total_marks, percentage, grade },
      ]).select();

      if (error) throw error;

      return new Response(
        JSON.stringify({ message: "Mark recorded successfully", data }),
        { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── BULK INSERT MARKS ───
    if (req.method === "POST" && action === "bulk") {
      const { records } = await req.json();

      if (!records || !Array.isArray(records) || records.length === 0) {
        return new Response(
          JSON.stringify({ error: "records array is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const enrichedRecords = records.map((r: any) => {
        const percentage = (r.marks_obtained / r.total_marks) * 100;
        return { ...r, percentage, grade: calculateGrade(percentage) };
      });

      const { data, error } = await supabase
        .from("marks")
        .insert(enrichedRecords)
        .select();

      if (error) throw error;

      return new Response(
        JSON.stringify({ message: `${data.length} records inserted`, data }),
        { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── UPDATE MARK ───
    if (req.method === "PUT") {
      const { id, marks_obtained, total_marks } = await req.json();

      if (!id) {
        return new Response(
          JSON.stringify({ error: "Mark id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const updates: Record<string, unknown> = {};
      if (marks_obtained !== undefined) updates.marks_obtained = marks_obtained;
      if (total_marks !== undefined) updates.total_marks = total_marks;

      // Recalculate percentage and grade if marks changed
      if (marks_obtained !== undefined || total_marks !== undefined) {
        const { data: existing } = await supabase
          .from("marks")
          .select("marks_obtained, total_marks")
          .eq("id", id)
          .single();

        const mo = marks_obtained ?? existing?.marks_obtained;
        const tm = total_marks ?? existing?.total_marks;
        const percentage = (mo / tm) * 100;
        updates.percentage = percentage;
        updates.grade = calculateGrade(percentage);
      }

      const { data, error } = await supabase
        .from("marks")
        .update(updates)
        .eq("id", id)
        .select();

      if (error) throw error;

      return new Response(
        JSON.stringify({ message: "Mark updated", data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── DELETE MARK ───
    if (req.method === "DELETE") {
      const id = url.searchParams.get("id");
      if (!id) {
        return new Response(
          JSON.stringify({ error: "Mark id is required as query param" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error } = await supabase.from("marks").delete().eq("id", id);
      if (error) throw error;

      return new Response(
        JSON.stringify({ message: "Mark deleted" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Marks Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function calculateGrade(percentage: number): string {
  if (percentage >= 90) return "A+";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B+";
  if (percentage >= 60) return "B";
  if (percentage >= 50) return "C";
  return "F";
}
