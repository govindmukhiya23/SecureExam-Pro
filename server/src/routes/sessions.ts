import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin, TABLES } from '../lib/supabase.js';
import { authenticate, requireStudent } from '../middleware/auth.js';

const router = Router();

// Validation schemas
const startSessionSchema = z.object({
  exam_id: z.string().uuid(),
  device_fingerprint: z.string().min(1),
  user_agent: z.string(),
  screen_resolution: z.string(),
  timezone: z.string(),
});

const submitAnswerSchema = z.object({
  question_id: z.string().uuid(),
  answer: z.union([z.string(), z.number()]),
  time_spent_seconds: z.number().min(0),
});

// Helper to get client IP
const getClientIP = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
};

// POST /api/sessions/start - Start an exam session
router.post('/start', authenticate, requireStudent, async (req: Request, res: Response) => {
  try {
    console.log('Session start request:', {
      body: req.body,
      userId: req.user?.userId,
    });
    
    const validation = startSessionSchema.safeParse(req.body);
    if (!validation.success) {
      console.error('Session start validation error:', validation.error.errors);
      return res.status(400).json({
        success: false,
        error: validation.error.errors[0].message,
        message: validation.error.errors[0].message,
        details: validation.error.errors,
      });
    }

    const { exam_id, device_fingerprint, user_agent, screen_resolution, timezone } = validation.data;
    const clientIP = getClientIP(req);

    // Check if exam exists and is active
    console.log('Looking up exam:', exam_id);
    const { data: exam, error: examError } = await supabaseAdmin
      .from(TABLES.EXAMS)
      .select('*')
      .eq('id', exam_id)
      .eq('status', 'active')
      .single();

    console.log('Exam lookup result:', { exam: exam?.id, error: examError?.message });

    if (examError || !exam) {
      console.error('Exam lookup error:', examError);
      return res.status(404).json({
        success: false,
        error: 'Exam not found or not active',
        message: 'Exam not found or not active. Please check if the exam exists and is currently active.',
      });
    }

    // Check if within exam time window
    const now = new Date();
    console.log('Time check:', { now, start_time: exam.start_time, end_time: exam.end_time });
    if (exam.start_time && new Date(exam.start_time) > now) {
      console.log('400: Exam has not started yet');
      return res.status(400).json({
        success: false,
        error: 'Exam has not started yet',
        message: `This exam starts at ${new Date(exam.start_time).toLocaleString()}`,
      });
    }
    if (exam.end_time && new Date(exam.end_time) < now) {
      console.log('400: Exam has ended');
      return res.status(400).json({
        success: false,
        error: 'Exam has ended',
        message: `This exam ended at ${new Date(exam.end_time).toLocaleString()}`,
      });
    }

    // ============================================
    // CHECK BATCH AND DEPARTMENT RESTRICTIONS
    // (Wrapped in try-catch in case tables don't exist)
    // ============================================
    
    try {
      // Get student's batch and department information
      const { data: student } = await supabaseAdmin
        .from(TABLES.USERS)
        .select('year_batch, department_id')
        .eq('id', req.user!.userId)
        .single();

      if (student) {
        // Check if exam has batch restrictions
        try {
          const { data: targetBatches } = await supabaseAdmin
            .from('exam_target_batches')
            .select('batch_id, academic_batches(year)')
            .eq('exam_id', exam_id);

          if (targetBatches && targetBatches.length > 0) {
            // Exam has batch restrictions - check if student's batch is allowed
            const allowedYears = targetBatches
              .map((tb: any) => tb.academic_batches?.year)
              .filter(Boolean);
            
            if (!student.year_batch || !allowedYears.includes(student.year_batch)) {
              return res.status(403).json({
                success: false,
                error: 'This exam is not available for your academic batch. Please contact your instructor.',
              });
            }
          }
        } catch {
          // Table doesn't exist, skip batch check
        }

        // Check if exam has department restrictions
        try {
          const { data: targetDepartments } = await supabaseAdmin
            .from('exam_target_departments')
            .select('department_id')
            .eq('exam_id', exam_id);

          if (targetDepartments && targetDepartments.length > 0) {
            // Exam has department restrictions - check if student's department is allowed
            const allowedDeptIds = targetDepartments.map((td: any) => td.department_id);
            
            if (!student.department_id || !allowedDeptIds.includes(student.department_id)) {
              return res.status(403).json({
                success: false,
                error: 'This exam is not available for your department. Please contact your instructor.',
              });
            }
          }
        } catch {
          // Table doesn't exist, skip department check
        }
      }
    } catch (restrictionError) {
      // If restriction check fails, allow student to proceed
      console.warn('Batch/department check skipped:', restrictionError);
    }

    // ============================================
    // END OF BATCH/DEPARTMENT RESTRICTIONS
    // ============================================

    // Check for existing active session
    console.log('Checking for existing session...');
    const { data: existingSession } = await supabaseAdmin
      .from(TABLES.EXAM_SESSIONS)
      .select('*')
      .eq('exam_id', exam_id)
      .eq('user_id', req.user!.userId)
      .in('status', ['started', 'in_progress'])
      .single();
    console.log('Existing session:', existingSession?.id || 'none');

    if (existingSession) {
      // Check for device change
      if (existingSession.device_fingerprint !== device_fingerprint) {
        // Log device change event
        await supabaseAdmin
          .from(TABLES.SUSPICIOUS_EVENTS)
          .insert({
            id: uuidv4(),
            session_id: existingSession.id,
            event_type: 'device_change',
            points: 40,
            details: {
              old_fingerprint: existingSession.device_fingerprint,
              new_fingerprint: device_fingerprint,
            },
          });

        // Update session with device change flag
        await supabaseAdmin
          .from(TABLES.EXAM_SESSIONS)
          .update({
            device_fingerprint,
            device_changed: true,
            current_risk_score: existingSession.current_risk_score + 40,
            highest_risk_score: Math.max(existingSession.highest_risk_score, existingSession.current_risk_score + 40),
            total_violations: existingSession.total_violations + 1,
          })
          .eq('id', existingSession.id);
      }

      // Check for IP change
      if (existingSession.current_ip !== clientIP) {
        await supabaseAdmin
          .from(TABLES.IP_LOGS)
          .insert({
            id: uuidv4(),
            session_id: existingSession.id,
            ip_address: clientIP,
          });

        await supabaseAdmin
          .from(TABLES.EXAM_SESSIONS)
          .update({
            current_ip: clientIP,
            ip_change_count: existingSession.ip_change_count + 1,
          })
          .eq('id', existingSession.id);
      }

      // Return existing session
      return res.json({
        success: true,
        data: {
          session: existingSession,
          exam,
          resumed: true,
        },
        message: 'Session resumed',
      });
    }

    // Check attempt count
    const { count: attemptCount } = await supabaseAdmin
      .from(TABLES.EXAM_SESSIONS)
      .select('*', { count: 'exact', head: true })
      .eq('exam_id', exam_id)
      .eq('user_id', req.user!.userId);
    console.log('Attempt count:', { attemptCount, maxAttempts: exam.max_attempts });

    if (attemptCount && attemptCount >= exam.max_attempts) {
      console.log('400: Maximum attempts exceeded');
      return res.status(400).json({
        success: false,
        error: 'Maximum attempts exceeded',
      });
    }

    // Create new session
    const sessionData = {
      id: uuidv4(),
      exam_id,
      user_id: req.user!.userId,
      status: 'started',
      start_time: new Date().toISOString(),
      current_risk_score: 0,
      highest_risk_score: 0,
      total_violations: 0,
      screen_blank_triggered: false,
      start_ip: clientIP,
      current_ip: clientIP,
      ip_change_count: 0,
      device_fingerprint,
      device_changed: false,
      user_agent,
      screen_resolution,
      timezone,
    };

    console.log('Creating new session with data:', JSON.stringify(sessionData, null, 2));
    const { data: session, error: sessionError } = await supabaseAdmin
      .from(TABLES.EXAM_SESSIONS)
      .insert(sessionData)
      .select()
      .single();

    if (sessionError) {
      console.error('Create session error:', sessionError);
      return res.status(500).json({
        success: false,
        error: 'Failed to start exam session',
        details: sessionError.message,
      });
    }
    console.log('Session created:', session.id);

    // Log initial IP
    await supabaseAdmin
      .from(TABLES.IP_LOGS)
      .insert({
        id: uuidv4(),
        session_id: session.id,
        ip_address: clientIP,
      });

    // Get questions
    let questions = await supabaseAdmin
      .from(TABLES.QUESTIONS)
      .select('id, type, text, options, points, order, code_template, code_language')
      .eq('exam_id', exam_id)
      .order('order', { ascending: true });

    // Shuffle questions if enabled
    if (exam.shuffle_questions && questions.data) {
      questions.data = questions.data.sort(() => Math.random() - 0.5);
    }

    // Shuffle options if enabled
    if (exam.shuffle_options && questions.data) {
      questions.data = questions.data.map(q => ({
        ...q,
        options: q.options ? q.options.sort(() => Math.random() - 0.5) : q.options,
      }));
    }

    res.status(201).json({
      success: true,
      data: {
        session,
        exam: {
          ...exam,
          questions: questions.data,
        },
        resumed: false,
      },
      message: 'Exam session started',
    });
  } catch (error) {
    console.error('Start session error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start exam session',
    });
  }
});

// POST /api/sessions/:id/answer - Submit an answer
router.post('/:id/answer', authenticate, requireStudent, async (req: Request, res: Response) => {
  try {
    const { id: sessionId } = req.params;
    const validation = submitAnswerSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: validation.error.errors[0].message,
      });
    }

    const { question_id, answer, time_spent_seconds } = validation.data;

    // Verify session ownership and status
    const { data: session } = await supabaseAdmin
      .from(TABLES.EXAM_SESSIONS)
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', req.user!.userId)
      .single();

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    if (!['started', 'in_progress'].includes(session.status)) {
      return res.status(400).json({
        success: false,
        error: 'Session is not active',
      });
    }

    // Get question to validate and check answer
    const { data: question } = await supabaseAdmin
      .from(TABLES.QUESTIONS)
      .select('*')
      .eq('id', question_id)
      .eq('exam_id', session.exam_id)
      .single();

    if (!question) {
      return res.status(404).json({
        success: false,
        error: 'Question not found',
      });
    }

    // Check if answer already exists (upsert)
    const { data: existingAnswer } = await supabaseAdmin
      .from(TABLES.ANSWERS)
      .select('id')
      .eq('session_id', sessionId)
      .eq('question_id', question_id)
      .single();

    const answerData = {
      session_id: sessionId,
      question_id,
      answer: String(answer),
      answered_at: new Date().toISOString(),
      time_spent_seconds,
    };

    let savedAnswer;
    if (existingAnswer) {
      const { data, error } = await supabaseAdmin
        .from(TABLES.ANSWERS)
        .update(answerData)
        .eq('id', existingAnswer.id)
        .select()
        .single();
      savedAnswer = data;
    } else {
      const { data, error } = await supabaseAdmin
        .from(TABLES.ANSWERS)
        .insert({ id: uuidv4(), ...answerData })
        .select()
        .single();
      savedAnswer = data;
    }

    // Update session status to in_progress if started
    if (session.status === 'started') {
      await supabaseAdmin
        .from(TABLES.EXAM_SESSIONS)
        .update({ status: 'in_progress' })
        .eq('id', sessionId);
    }

    res.json({
      success: true,
      data: savedAnswer,
      message: 'Answer saved',
    });
  } catch (error) {
    console.error('Submit answer error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save answer',
    });
  }
});

// POST /api/sessions/:id/submit - Submit the exam
router.post('/:id/submit', authenticate, requireStudent, async (req: Request, res: Response) => {
  try {
    const { id: sessionId } = req.params;
    const { auto_submitted } = req.body;

    // Verify session ownership
    const { data: session } = await supabaseAdmin
      .from(TABLES.EXAM_SESSIONS)
      .select('*, exams(*)')
      .eq('id', sessionId)
      .eq('user_id', req.user!.userId)
      .single();

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    if (session.status === 'submitted') {
      return res.status(400).json({
        success: false,
        error: 'Exam already submitted',
      });
    }

    // Get all questions and answers
    const { data: questions } = await supabaseAdmin
      .from(TABLES.QUESTIONS)
      .select('*')
      .eq('exam_id', session.exam_id);

    const { data: answers } = await supabaseAdmin
      .from(TABLES.ANSWERS)
      .select('*')
      .eq('session_id', sessionId);

    // Calculate score
    let totalScore = 0;
    let earnedScore = 0;

    if (questions && answers) {
      for (const question of questions) {
        totalScore += question.points;
        const answer = answers.find(a => a.question_id === question.id);
        
        if (answer && question.type === 'mcq') {
          const isCorrect = String(answer.answer) === String(question.correct_answer);
          if (isCorrect) {
            earnedScore += question.points;
          }
          
          // Update answer with correctness
          await supabaseAdmin
            .from(TABLES.ANSWERS)
            .update({
              is_correct: isCorrect,
              points_earned: isCorrect ? question.points : 0,
            })
            .eq('id', answer.id);
        }
      }
    }

    // Update session
    const { data: updatedSession, error } = await supabaseAdmin
      .from(TABLES.EXAM_SESSIONS)
      .update({
        status: 'submitted',
        submit_time: new Date().toISOString(),
        end_time: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to submit exam',
      });
    }

    const percentage = totalScore > 0 ? (earnedScore / totalScore) * 100 : 0;
    const passed = percentage >= (session.exams?.passing_percentage || 40);

    res.json({
      success: true,
      data: {
        session: updatedSession,
        score: earnedScore,
        total: totalScore,
        percentage: Math.round(percentage * 100) / 100,
        passed,
        auto_submitted: auto_submitted || false,
      },
      message: 'Exam submitted successfully',
    });
  } catch (error) {
    console.error('Submit exam error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit exam',
    });
  }
});

// GET /api/sessions/my - Get my sessions (student)
// IMPORTANT: This must be before /:id route to avoid being caught as an id parameter
router.get('/my', authenticate, requireStudent, async (req: Request, res: Response) => {
  try {
    const { data: sessions, error } = await supabaseAdmin
      .from(TABLES.EXAM_SESSIONS)
      .select('*, exams(id, title, total_points, passing_percentage)')
      .eq('user_id', req.user!.userId)
      .order('start_time', { ascending: false });

    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch sessions',
      });
    }

    const sessionsWithExamInfo = sessions?.map((s: any) => ({
      ...s,
      exam_title: s.exams?.title,
      exam_id: s.exams?.id,
    }));

    res.json({
      success: true,
      data: sessionsWithExamInfo,
    });
  } catch (error) {
    console.error('Get my sessions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sessions',
    });
  }
});

// GET /api/sessions/:id - Get session details
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id: sessionId } = req.params;

    let query = supabaseAdmin
      .from(TABLES.EXAM_SESSIONS)
      .select('*, exams(*), users(id, name, email)')
      .eq('id', sessionId);

    // Students can only see their own sessions
    if (req.user!.role === 'student') {
      query = query.eq('user_id', req.user!.userId);
    }

    const { data: session, error } = await query.single();

    if (error || !session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    // Get answers if submitted and review is allowed
    let answers = null;
    if (session.status === 'submitted' && session.exams?.allow_review) {
      const { data } = await supabaseAdmin
        .from(TABLES.ANSWERS)
        .select('*, questions(*)')
        .eq('session_id', sessionId);
      answers = data;
    }

    // Get violations for admin
    let violations = null;
    if (req.user!.role === 'admin') {
      const { data } = await supabaseAdmin
        .from(TABLES.SUSPICIOUS_EVENTS)
        .select('*')
        .eq('session_id', sessionId)
        .order('timestamp', { ascending: false });
      violations = data;
    }

    res.json({
      success: true,
      data: {
        ...session,
        answers,
        violations,
      },
    });
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch session',
    });
  }
});

// GET /api/sessions/exam/:examId - Get all sessions for an exam (admin)
router.get('/exam/:examId', authenticate, async (req: Request, res: Response) => {
  try {
    const { examId } = req.params;

    // For admin, get all sessions; for student, only their own
    let query = supabaseAdmin
      .from(TABLES.EXAM_SESSIONS)
      .select('*, users(id, name, email)')
      .eq('exam_id', examId);

    if (req.user!.role === 'student') {
      query = query.eq('user_id', req.user!.userId);
    }

    const { data: sessions, error } = await query.order('start_time', { ascending: false });

    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch sessions',
      });
    }

    // Add user info to response
    const sessionsWithUsers = sessions?.map((s: any) => ({
      ...s,
      user_name: s.users?.name,
      user_email: s.users?.email,
      risk_level: getRiskLevel(s.current_risk_score),
    }));

    res.json({
      success: true,
      data: sessionsWithUsers,
    });
  } catch (error) {
    console.error('Get exam sessions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sessions',
    });
  }
});

// GET /api/sessions/:id/result - Get session result (student)
router.get('/:id/result', authenticate, async (req: Request, res: Response) => {
  try {
    const { id: sessionId } = req.params;

    // Get session with exam info
    let query = supabaseAdmin
      .from(TABLES.EXAM_SESSIONS)
      .select('*, exams(*)')
      .eq('id', sessionId);

    if (req.user!.role === 'student') {
      query = query.eq('user_id', req.user!.userId);
    }

    const { data: session, error } = await query.single();

    if (error || !session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    // Calculate score from answers
    const { data: answers } = await supabaseAdmin
      .from(TABLES.ANSWERS)
      .select('*, questions(*)')
      .eq('session_id', sessionId);

    let totalScore = 0;
    let earnedScore = 0;
    const answerDetails: any[] = [];

    if (answers) {
      for (const answer of answers) {
        const question = answer.questions;
        if (question) {
          totalScore += question.points;
          const isCorrect = answer.is_correct || 
            (question.type === 'mcq' && String(answer.answer) === String(question.correct_answer));
          const points = isCorrect ? question.points : 0;
          earnedScore += points;

          if (session.exams?.allow_review) {
            answerDetails.push({
              questionId: question.id,
              questionText: question.text,
              type: question.type,
              options: question.options,
              userAnswer: question.type === 'mcq' ? parseInt(answer.answer) : answer.answer,
              correctAnswer: question.correct_answer,
              isCorrect,
              points,
              maxPoints: question.points,
            });
          }
        }
      }
    }

    const totalPoints = session.exams?.total_points || totalScore;
    const passingPercentage = session.exams?.passing_percentage || 40;
    const percentage = totalPoints > 0 ? (earnedScore / totalPoints) * 100 : 0;
    const passed = percentage >= passingPercentage;

    // Calculate time taken
    const startTime = new Date(session.start_time).getTime();
    const endTime = session.end_time ? new Date(session.end_time).getTime() : Date.now();
    const timeTaken = Math.round((endTime - startTime) / 60000);

    res.json({
      success: true,
      data: {
        examTitle: session.exams?.title,
        score: earnedScore,
        totalPoints,
        passed,
        passingPercentage,
        duration: session.exams?.duration_minutes,
        timeTaken,
        completedAt: session.end_time || session.submit_time,
        riskLevel: getRiskLevel(session.current_risk_score),
        allowReview: session.exams?.allow_review,
        answers: session.exams?.allow_review ? answerDetails : null,
      },
    });
  } catch (error) {
    console.error('Get session result error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch result',
    });
  }
});

// POST /api/sessions/:id/terminate - Terminate a session (admin)
router.post('/:id/terminate', authenticate, async (req: Request, res: Response) => {
  try {
    const { id: sessionId } = req.params;
    const { reason } = req.body;

    // Only admin can terminate sessions
    if (req.user!.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Only admins can terminate sessions',
      });
    }

    const { data: session, error } = await supabaseAdmin
      .from(TABLES.EXAM_SESSIONS)
      .update({
        status: 'terminated',
        end_time: new Date().toISOString(),
        termination_reason: reason,
      })
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to terminate session',
      });
    }

    res.json({
      success: true,
      data: session,
      message: 'Session terminated',
    });
  } catch (error) {
    console.error('Terminate session error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to terminate session',
    });
  }
});

// Helper function to get risk level from score
function getRiskLevel(score: number): string {
  if (score >= 100) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

export default router;
