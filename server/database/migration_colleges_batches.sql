-- ============================================
-- MIGRATION: Add Colleges, Departments, Batches, and Related Tables
-- Run this in Supabase SQL Editor
-- ============================================

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. CREATE COLLEGES TABLE
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

CREATE INDEX IF NOT EXISTS idx_colleges_name ON colleges(name);
CREATE INDEX IF NOT EXISTS idx_colleges_code ON colleges(code);
CREATE INDEX IF NOT EXISTS idx_colleges_active ON colleges(is_active);

-- ============================================
-- 2. CREATE DEPARTMENTS TABLE
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

CREATE INDEX IF NOT EXISTS idx_departments_code ON departments(code);
CREATE INDEX IF NOT EXISTS idx_departments_active ON departments(is_active);

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
-- 3. CREATE ACADEMIC BATCHES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS academic_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    year INTEGER NOT NULL UNIQUE CHECK (year >= 2000 AND year <= 2100),
    label VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_batches_year ON academic_batches(year);
CREATE INDEX IF NOT EXISTS idx_batches_active ON academic_batches(is_active);

-- Insert default batches
INSERT INTO academic_batches (year, label) VALUES
    (2022, '2022 Batch'),
    (2023, '2023 Batch'),
    (2024, '2024 Batch'),
    (2025, '2025 Batch'),
    (2026, '2026 Batch')
ON CONFLICT (year) DO NOTHING;

-- ============================================
-- 4. UPDATE USERS TABLE - Add new columns
-- ============================================

-- Add college_id column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'college_id') THEN
        ALTER TABLE users ADD COLUMN college_id UUID REFERENCES colleges(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Add department_id column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'department_id') THEN
        ALTER TABLE users ADD COLUMN department_id UUID REFERENCES departments(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Add year_batch column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'year_batch') THEN
        ALTER TABLE users ADD COLUMN year_batch INTEGER CHECK (year_batch >= 2000 AND year_batch <= 2100);
    END IF;
END $$;

-- Add roll_number column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'roll_number') THEN
        ALTER TABLE users ADD COLUMN roll_number VARCHAR(50);
    END IF;
END $$;

-- Add account_status column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'account_status') THEN
        ALTER TABLE users ADD COLUMN account_status VARCHAR(20) DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'inactive'));
    END IF;
END $$;

-- Drop old institution_id column if it exists (migrating to college_id)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'institution_id') THEN
        ALTER TABLE users DROP COLUMN institution_id;
    END IF;
END $$;

-- Drop old department column (varchar) if it exists (migrating to department_id)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'department' AND data_type = 'character varying') THEN
        ALTER TABLE users DROP COLUMN department;
    END IF;
END $$;

-- Create indexes on new columns
CREATE INDEX IF NOT EXISTS idx_users_college ON users(college_id);
CREATE INDEX IF NOT EXISTS idx_users_department ON users(department_id);
CREATE INDEX IF NOT EXISTS idx_users_batch ON users(year_batch);
CREATE INDEX IF NOT EXISTS idx_users_roll_number ON users(roll_number);

-- Add unique constraint for roll number per college (students only)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unique_roll_per_college') THEN
        ALTER TABLE users ADD CONSTRAINT unique_roll_per_college UNIQUE (college_id, roll_number);
    END IF;
EXCEPTION WHEN others THEN
    -- Constraint may already exist or may fail if duplicates exist
    RAISE NOTICE 'Could not add unique_roll_per_college constraint: %', SQLERRM;
END $$;

-- ============================================
-- 5. CREATE EXAM TARGET BATCHES (Many-to-Many)
-- ============================================
CREATE TABLE IF NOT EXISTS exam_target_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES academic_batches(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(exam_id, batch_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_batches_exam ON exam_target_batches(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_batches_batch ON exam_target_batches(batch_id);

-- ============================================
-- 6. CREATE EXAM TARGET DEPARTMENTS (Many-to-Many)
-- ============================================
CREATE TABLE IF NOT EXISTS exam_target_departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exam_id UUID NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(exam_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_exam_depts_exam ON exam_target_departments(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_depts_dept ON exam_target_departments(department_id);

-- ============================================
-- 7. CREATE AI PROCESSING JOBS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS ai_processing_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    file_name VARCHAR(255),
    file_type VARCHAR(50),
    file_size_bytes INTEGER,
    provider VARCHAR(20), -- 'openai' or 'gemini'
    extracted_questions JSONB,
    error_message TEXT,
    processing_time_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_ai_jobs_created_by ON ai_processing_jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_ai_jobs_status ON ai_processing_jobs(status);

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
SELECT 'Migration completed successfully!' as status;
