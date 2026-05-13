-- ============================================================
-- Scholarly Monograph — Supabase Database Schema (v2)
-- Uses Supabase Native Auth (auth.users)
-- Run this SQL in Supabase SQL Editor to set up all tables
-- ============================================================

-- STEP 0: Clean slate — drop old tables if they exist
DROP TABLE IF EXISTS uploads CASCADE;
DROP TABLE IF EXISTS chat_history CASCADE;
DROP TABLE IF EXISTS subject_config CASCADE;
DROP TABLE IF EXISTS marks CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- ============================================================
-- 1. Profiles table (linked to Supabase Auth)
-- Auto-populated by a trigger when a user signs up
-- ============================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT 'User',
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher')),
  student_id TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger function: auto-create a profile row on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, student_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'student'),
    NEW.raw_user_meta_data->>'student_id'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 2. Marks / Performance records
-- ============================================================
CREATE TABLE marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  exam_type TEXT NOT NULL CHECK (exam_type IN ('IAT 1', 'IAT 2', 'VTU Exam')),
  marks_obtained NUMERIC NOT NULL,
  total_marks NUMERIC NOT NULL,
  percentage NUMERIC GENERATED ALWAYS AS (
    CASE WHEN total_marks > 0 THEN ROUND((marks_obtained / total_marks) * 100, 2) ELSE 0 END
  ) STORED,
  grade TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 3. Subject weightage configuration
-- ============================================================
CREATE TABLE subject_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT UNIQUE NOT NULL,
  iat1_weightage NUMERIC NOT NULL DEFAULT 20,
  iat2_weightage NUMERIC NOT NULL DEFAULT 30,
  vtu_weightage NUMERIC NOT NULL DEFAULT 50,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT weightage_total CHECK (iat1_weightage + iat2_weightage + vtu_weightage = 100)
);

-- ============================================================
-- 4. AI Chat history
-- ============================================================
CREATE TABLE chat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bot_type TEXT NOT NULL CHECK (bot_type IN ('jarvis', 'aria')),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 5. Study materials / uploads metadata
-- ============================================================
CREATE TABLE uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_url TEXT,
  analysis_status TEXT DEFAULT 'pending' CHECK (analysis_status IN ('pending', 'processing', 'complete', 'failed')),
  analysis_result JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_marks_student_id ON marks(student_id);
CREATE INDEX IF NOT EXISTS idx_marks_subject ON marks(subject);
CREATE INDEX IF NOT EXISTS idx_marks_exam_type ON marks(exam_type);
CREATE INDEX IF NOT EXISTS idx_chat_history_user ON chat_history(user_id, bot_type);

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

-- Profiles: users can read all profiles, but only update their own
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view profiles"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Marks: students see their own, teachers see all
ALTER TABLE marks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view their own marks"
  ON marks FOR SELECT
  USING (
    student_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'teacher')
  );

CREATE POLICY "Teachers can insert marks"
  ON marks FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'teacher')
  );

CREATE POLICY "Teachers can update marks"
  ON marks FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'teacher')
  );

-- Subject config: anyone can read, teachers can modify
ALTER TABLE subject_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view subject config"
  ON subject_config FOR SELECT
  USING (true);

CREATE POLICY "Teachers can manage subject config"
  ON subject_config FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'teacher')
  );

-- Chat history: users see their own only
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own chat history"
  ON chat_history FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own chat history"
  ON chat_history FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Uploads: users see their own only
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own uploads"
  ON uploads FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own uploads"
  ON uploads FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- Seed data: subject configs only
-- (Users are created via Supabase Auth Dashboard or signup)
-- ============================================================
INSERT INTO subject_config (subject, iat1_weightage, iat2_weightage, vtu_weightage)
VALUES
  ('Mathematics', 20, 30, 50),
  ('Science', 20, 30, 50),
  ('English', 20, 30, 50),
  ('History', 20, 30, 50),
  ('Computer Science', 20, 30, 50)
ON CONFLICT (subject) DO NOTHING;
