-- Fix for student who exceeded maximum attempts
-- This cleans up old exam sessions to allow retaking

-- Option 1: Delete all sessions for a specific student and exam (most common fix)
-- Replace the exam_id and user_id with actual values

-- Delete incomplete/terminated sessions for the student
DELETE FROM exam_sessions 
WHERE user_id = 'c4c4f3b1-af5b-4ebf-ba42-8cd57f375be5' 
  AND exam_id = '1966bcd4-feef-4836-b2b4-92de37242d8c'
  AND status IN ('started', 'terminated', 'in_progress');

-- Option 2: Increase max_attempts for all exams to allow more retries
UPDATE exams 
SET max_attempts = 5 
WHERE max_attempts = 1;

-- Option 3: Increase max_attempts for a specific exam
UPDATE exams 
SET max_attempts = 5 
WHERE id = '1966bcd4-feef-4836-b2b4-92de37242d8c';

-- Verify the changes
SELECT id, title, max_attempts FROM exams WHERE id = '1966bcd4-feef-4836-b2b4-92de37242d8c';

SELECT id, status, start_time FROM exam_sessions 
WHERE user_id = 'c4c4f3b1-af5b-4ebf-ba42-8cd57f375be5' 
  AND exam_id = '1966bcd4-feef-4836-b2b4-92de37242d8c';
