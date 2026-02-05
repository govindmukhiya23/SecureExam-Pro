-- SecureExam Pro Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- COLLEGES/INSTITUTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS colleges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE,
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_colleges_name ON colleges(name);
CREATE INDEX idx_colleges_code ON colleges(code);
CREATE INDEX idx_colleges_active ON colleges(is_active);

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'student')),
    college_id UUID REFERENCES colleges(id) ON DELETE SET NULL,
    department_id UUID,
    year_batch INTEGER CHECK (year_batch >= 2000 AND year_batch <= 2100),
    avatar_url TEXT,
    phone VARCHAR(20),
    roll_number VARCHAR(50),
    account_status VARCHAR(20) DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'inactive')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Roll number is required and unique for students within a college
    CONSTRAINT unique_roll_per_college UNIQUE (college_id, roll_number)
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_college ON users(college_id);
CREATE INDEX idx_users_department ON users(department_id);
CREATE INDEX idx_users_batch ON users(year_batch);
CREATE INDEX idx_users_roll_number ON users(roll_number);

-- ============================================
-- EXAMS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS exams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    instructions TEXT,
    mode VARCHAR(20) NOT NULL CHECK (mode IN ('practice', 'live_standard', 'live_strict')),
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'active', 'completed', 'cancelled')),
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 480),
    total_points INTEGER DEFAULT 0,
    passing_percentage INTEGER DEFAULT 40 CHECK (passing_percentage >= 0 AND passing_percentage <= 100),
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shuffle_questions BOOLEAN DEFAULT FALSE,
    shuffle_options BOOLEAN DEFAULT FALSE,
    show_results_immediately BOOLEAN DEFAULT TRUE,
    allow_review BOOLEAN DEFAULT FALSE,
    max_attempts INTEGER DEFAULT 1 CHECK (max_attempts >= 1),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_exams_created_by ON exams(created_by);
CREATE INDEX idx_exams_status ON exams(status);
CREATE INDEX idx_exams_mode ON exams(mode);

-- ============================================
-- QUESTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('mcq', 'descriptive', 'coding')),
    text TEXT NOT NULL,
    options JSONB, -- Array of options for MCQ
    correct_answer TEXT, -- For MCQ: index or text; For descriptive: model answer
    points INTEGER NOT NULL DEFAULT 1 CHECK (points > 0),
    "order" INTEGER NOT NULL,
    code_template TEXT, -- For coding questions
    code_language VARCHAR(50), -- For coding questions
    test_cases JSONB, -- Array of test cases for coding
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_questions_exam ON questions(exam_id);
CREATE INDEX idx_questions_order ON questions("order");

-- ============================================
-- EXAM SESSIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS exam_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'in_progress', 'submitted', 'terminated', 'expired')),
    start_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    end_time TIMESTAMP WITH TIME ZONE,
    submit_time TIMESTAMP WITH TIME ZONE,
    
    -- Risk scoring
    current_risk_score INTEGER DEFAULT 0,
    highest_risk_score INTEGER DEFAULT 0,
    total_violations INTEGER DEFAULT 0,
    screen_blank_triggered BOOLEAN DEFAULT FALSE,
    
    -- IP tracking
    start_ip VARCHAR(45) NOT NULL,
    current_ip VARCHAR(45) NOT NULL,
    ip_change_count INTEGER DEFAULT 0,
    
    -- Device fingerprinting
    device_fingerprint TEXT NOT NULL,
    device_changed BOOLEAN DEFAULT FALSE,
    user_agent TEXT,
    screen_resolution VARCHAR(20),
    timezone VARCHAR(100),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(exam_id, user_id, start_time)
);

CREATE INDEX idx_sessions_exam ON exam_sessions(exam_id);
CREATE INDEX idx_sessions_user ON exam_sessions(user_id);
CREATE INDEX idx_sessions_status ON exam_sessions(status);
CREATE INDEX idx_sessions_risk ON exam_sessions(current_risk_score);

-- ============================================
-- ANSWERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS answers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    answer TEXT NOT NULL,
    is_correct BOOLEAN,
    points_earned INTEGER DEFAULT 0,
    answered_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    time_spent_seconds INTEGER DEFAULT 0,
    
    UNIQUE(session_id, question_id)
);

CREATE INDEX idx_answers_session ON answers(session_id);
CREATE INDEX idx_answers_question ON answers(question_id);

-- ============================================
-- SUSPICIOUS EVENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS suspicious_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    details JSONB,
    screenshot_url TEXT
);

CREATE INDEX idx_events_session ON suspicious_events(session_id);
CREATE INDEX idx_events_type ON suspicious_events(event_type);
CREATE INDEX idx_events_timestamp ON suspicious_events(timestamp);

-- ============================================
-- KEYBOARD EVENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS keyboard_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
    event_type VARCHAR(30) NOT NULL CHECK (event_type IN ('paste', 'untrusted', 'bot_typing', 'unfocused_typing')),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    is_trusted BOOLEAN NOT NULL,
    timing_pattern JSONB -- Array of timing intervals
);

CREATE INDEX idx_keyboard_session ON keyboard_events(session_id);
CREATE INDEX idx_keyboard_type ON keyboard_events(event_type);

-- ============================================
-- IP LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS ip_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
    ip_address VARCHAR(45) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    is_vpn BOOLEAN,
    country VARCHAR(100),
    city VARCHAR(100)
);

CREATE INDEX idx_iplogs_session ON ip_logs(session_id);
CREATE INDEX idx_iplogs_ip ON ip_logs(ip_address);

-- ============================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to relevant tables
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_exams_updated_at
    BEFORE UPDATE ON exams
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_questions_updated_at
    BEFORE UPDATE ON questions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at
    BEFORE UPDATE ON exam_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE suspicious_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE keyboard_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ip_logs ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (auth.uid()::text = id::text);

CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid()::text = id::text);

-- Exams policies
CREATE POLICY "Admins can manage own exams" ON exams
    FOR ALL USING (auth.uid()::text = created_by::text);

CREATE POLICY "Students can view active exams" ON exams
    FOR SELECT USING (status = 'active');

-- Sessions policies
CREATE POLICY "Users can view own sessions" ON exam_sessions
    FOR SELECT USING (auth.uid()::text = user_id::text);

CREATE POLICY "Admins can view exam sessions" ON exam_sessions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM exams 
            WHERE exams.id = exam_sessions.exam_id 
            AND exams.created_by::text = auth.uid()::text
        )
    );

-- Note: Service role key bypasses RLS for server operations
-- ============================================
-- DEPARTMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    code VARCHAR(20) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_departments_code ON departments(code);
CREATE INDEX idx_departments_active ON departments(is_active);

-- Insert default departments
INSERT INTO departments (name, code, description) VALUES
    ('Computer Science Engineering', 'CSE', 'Department of Computer Science and Engineering'),
    ('Electronics and Communication Engineering', 'ECE', 'Department of Electronics and Communication'),
    ('Information Technology', 'IT', 'Department of Information Technology'),
    ('Mechanical Engineering', 'MECH', 'Department of Mechanical Engineering'),
    ('Civil Engineering', 'CIVIL', 'Department of Civil Engineering'),
    ('Electrical Engineering', 'EE', 'Department of Electrical Engineering'),
    ('Chemical Engineering', 'CHEM', 'Department of Chemical Engineering')
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- ACADEMIC BATCHES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS academic_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    year INTEGER NOT NULL UNIQUE CHECK (year >= 2000 AND year <= 2100),
    label VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_batches_year ON academic_batches(year);
CREATE INDEX idx_batches_active ON academic_batches(is_active);

-- Insert default batches
INSERT INTO academic_batches (year, label) VALUES
    (2022, '2022 Batch'),
    (2023, '2023 Batch'),
    (2024, '2024 Batch'),
    (2025, '2025 Batch'),
    (2026, '2026 Batch')
ON CONFLICT (year) DO NOTHING;

-- ============================================
-- EXAM TARGET BATCHES (Many-to-Many)
-- ============================================
CREATE TABLE IF NOT EXISTS exam_target_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES academic_batches(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(exam_id, batch_id)
);

CREATE INDEX idx_exam_batches_exam ON exam_target_batches(exam_id);
CREATE INDEX idx_exam_batches_batch ON exam_target_batches(batch_id);

-- ============================================
-- EXAM TARGET DEPARTMENTS (Many-to-Many)
-- ============================================
CREATE TABLE IF NOT EXISTS exam_target_departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(exam_id, department_id)
);

CREATE INDEX idx_exam_depts_exam ON exam_target_departments(exam_id);
CREATE INDEX idx_exam_depts_dept ON exam_target_departments(department_id);

-- ============================================
-- AI PROCESSING JOBS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS ai_processing_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    file_url TEXT,
    ai_provider VARCHAR(20) CHECK (ai_provider IN ('openai', 'gemini')),
    extracted_questions JSONB,
    error_message TEXT,
    processing_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_ai_jobs_created_by ON ai_processing_jobs(created_by);
CREATE INDEX idx_ai_jobs_status ON ai_processing_jobs(status);

-- ============================================
-- ADD MISSING COLUMNS TO USERS TABLE
-- ============================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS year_batch INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status VARCHAR(20) DEFAULT 'active' CHECK (account_status IN ('active', 'disabled', 'suspended'));

CREATE INDEX IF NOT EXISTS idx_users_year_batch ON users(year_batch);
CREATE INDEX IF NOT EXISTS idx_users_department_id ON users(department_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(account_status);

-- Add triggers for new tables
CREATE TRIGGER update_departments_updated_at
    BEFORE UPDATE ON departments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_batches_updated_at
    BEFORE UPDATE ON academic_batches
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_jobs_updated_at
    BEFORE UPDATE ON ai_processing_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS on new tables
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_target_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_target_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_processing_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for new tables
CREATE POLICY "Anyone can view departments" ON departments FOR SELECT USING (true);
CREATE POLICY "Anyone can view batches" ON academic_batches FOR SELECT USING (true);
CREATE POLICY "Admins can manage exam targets" ON exam_target_batches FOR ALL USING (
    EXISTS (SELECT 1 FROM exams WHERE exams.id = exam_target_batches.exam_id AND exams.created_by::text = auth.uid()::text)
);
CREATE POLICY "Admins can manage exam department targets" ON exam_target_departments FOR ALL USING (
    EXISTS (SELECT 1 FROM exams WHERE exams.id = exam_target_departments.exam_id AND exams.created_by::text = auth.uid()::text)
);
CREATE POLICY "Admins can manage AI jobs" ON ai_processing_jobs FOR ALL USING (auth.uid()::text = created_by::text);