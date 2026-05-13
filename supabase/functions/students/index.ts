import { corsHeaders } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabase-client.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseAdmin();
    const url = new URL(req.url);

    // ─── GET ALL STUDENTS (with optional role filter) ───
    if (req.method === "GET") {
      const role = url.searchParams.get("role") || "student";
      const searchQuery = url.searchParams.get("q");

      let query = supabase
        .from("users")
        .select("id, full_name, email, role, student_id, created_at")
        .eq("role", role)
        .order("full_name", { ascending: true });

      if (searchQuery) {
        query = query.or(`full_name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,student_id.ilike.%${searchQuery}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      return new Response(
        JSON.stringify({ data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── GET STUDENT PERFORMANCE SUMMARY ───
    if (req.method === "POST") {
      const body = await req.json();
      const action = body.action;

      if (action === "performance") {
        const { student_id } = body;
        if (!student_id) {
          return new Response(
            JSON.stringify({ error: "student_id is required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get student info
        const { data: student, error: studentErr } = await supabase
          .from("users")
          .select("id, full_name, email, student_id")
          .eq("id", student_id)
          .single();

        if (studentErr) throw studentErr;

        // Get all marks for this student
        const { data: marks, error: marksErr } = await supabase
          .from("marks")
          .select("*")
          .eq("student_id", student_id)
          .order("created_at", { ascending: true });

        if (marksErr) throw marksErr;

        // Calculate aggregated performance
        const subjectMap: Record<string, { total: number; count: number; scores: number[] }> = {};
        marks?.forEach((m: any) => {
          if (!subjectMap[m.subject]) {
            subjectMap[m.subject] = { total: 0, count: 0, scores: [] };
          }
          subjectMap[m.subject].total += m.percentage;
          subjectMap[m.subject].count += 1;
          subjectMap[m.subject].scores.push(m.percentage);
        });

        const subjectAverages = Object.entries(subjectMap).map(([subject, data]) => ({
          subject,
          average: Math.round((data.total / data.count) * 10) / 10,
          trend: data.scores,
          exams_taken: data.count,
        }));

        const overallAvg = marks && marks.length > 0
          ? Math.round((marks.reduce((sum: number, m: any) => sum + m.percentage, 0) / marks.length) * 10) / 10
          : 0;

        return new Response(
          JSON.stringify({
            student,
            overall_average: overallAvg,
            overall_grade: getGrade(overallAvg),
            total_exams: marks?.length || 0,
            subjects: subjectAverages,
            marks,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ─── CLASS ANALYTICS ───
      if (action === "class-analytics") {
        const { data: allMarks, error } = await supabase
          .from("marks")
          .select("*, users!marks_student_id_fkey(full_name, student_id)")
          .order("created_at", { ascending: false });

        if (error) throw error;

        // Class average
        const classAvg = allMarks && allMarks.length > 0
          ? Math.round((allMarks.reduce((sum: number, m: any) => sum + m.percentage, 0) / allMarks.length) * 10) / 10
          : 0;

        // Per-subject averages
        const subjectMap: Record<string, number[]> = {};
        allMarks?.forEach((m: any) => {
          if (!subjectMap[m.subject]) subjectMap[m.subject] = [];
          subjectMap[m.subject].push(m.percentage);
        });

        const subjectStats = Object.entries(subjectMap).map(([subject, scores]) => ({
          subject,
          average: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
          highest: Math.max(...scores),
          lowest: Math.min(...scores),
          count: scores.length,
        }));

        // Grade distribution
        const gradeDistribution: Record<string, number> = { "A+": 0, "A": 0, "B+": 0, "B": 0, "C": 0, "F": 0 };
        allMarks?.forEach((m: any) => {
          if (gradeDistribution[m.grade] !== undefined) gradeDistribution[m.grade]++;
        });

        // Top performers
        const studentPerf: Record<string, { name: string; total: number; count: number }> = {};
        allMarks?.forEach((m: any) => {
          const name = m.users?.full_name || "Unknown";
          if (!studentPerf[m.student_id]) {
            studentPerf[m.student_id] = { name, total: 0, count: 0 };
          }
          studentPerf[m.student_id].total += m.percentage;
          studentPerf[m.student_id].count += 1;
        });

        const topPerformers = Object.entries(studentPerf)
          .map(([id, data]) => ({
            student_id: id,
            name: data.name,
            average: Math.round((data.total / data.count) * 10) / 10,
          }))
          .sort((a, b) => b.average - a.average)
          .slice(0, 5);

        return new Response(
          JSON.stringify({
            class_average: classAvg,
            total_records: allMarks?.length || 0,
            subject_stats: subjectStats,
            grade_distribution: gradeDistribution,
            top_performers: topPerformers,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Unknown action. Use 'performance' or 'class-analytics'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Students Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function getGrade(percentage: number): string {
  if (percentage >= 90) return "A+";
  if (percentage >= 80) return "A";
  if (percentage >= 70) return "B+";
  if (percentage >= 60) return "B";
  if (percentage >= 50) return "C";
  return "F";
}
