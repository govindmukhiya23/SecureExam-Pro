import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin, TABLES } from '../lib/supabase.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

// Validation schemas
const createExamSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  description: z.string().optional(),
  instructions: z.string().optional(),
  mode: z.enum(['practice', 'live_standard', 'live_strict']),
  duration_minutes: z.number().min(1).max(480),
  passing_percentage: z.number().min(0).max(100).default(40),
  start_time: z.string().datetime().optional(),
  end_time: z.string().datetime().optional(),
  shuffle_questions: z.boolean().default(false),
  shuffle_options: z.boolean().default(false),
  show_results_immediately: z.boolean().default(true),
  allow_review: z.boolean().default(false),
  max_attempts: z.number().min(1).default(1),
});

const createQuestionSchema = z.object({
  type: z.enum(['mcq', 'descriptive', 'coding']),
  text: z.string().min(1, 'Question text is required'),
  options: z.array(z.string()).optional(),
  correct_answer: z.union([z.string(), z.number()]).optional(),
  points: z.number().min(1).default(1),
  order: z.number().optional(),
  code_template: z.string().optional(),
  code_language: z.string().optional(),
  test_cases: z.array(z.object({
    input: z.string(),
    expected_output: z.string(),
    is_hidden: z.boolean().default(false),
  })).optional(),
});

// GET /api/exams - List all exams (admin) or assigned exams (student)
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    console.log('GET /api/exams request:', {
      user: req.user?.email,
      role: req.user?.role,
      query: req.query,
    });
    
    const { status, mode, page = '1', limit = '10' } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    let query = supabaseAdmin
      .from(TABLES.EXAMS)
      .select('*', { count: 'exact' });

    // Admin sees all their exams, students see only active exams matching their batch/department
    if (req.user!.role === 'admin') {
      query = query.eq('created_by', req.user!.userId);
    } else {
      // Student view - only show active exams that match their batch/department
      query = query.eq('status', 'active');
    }

    if (status) {
      query = query.eq('status', status);
    }
    if (mode) {
      query = query.eq('mode', mode);
    }

    let { data: exams, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch exams',
      });
    }

    // For students, filter exams based on batch and department restrictions
    // This is wrapped in try-catch to gracefully handle missing tables
    if (req.user!.role === 'student' && exams && exams.length > 0) {
      try {
        // Get student's batch and department
        const { data: student } = await supabaseAdmin
          .from(TABLES.USERS)
          .select('year_batch, department_id')
          .eq('id', req.user!.userId)
          .single();

        // Get all exam IDs for batch/department checking
        const examIds = exams.map(e => e.id);

        // Get batch restrictions for these exams (may not exist yet)
        let batchRestrictions: any[] = [];
        let deptRestrictions: any[] = [];
        
        try {
          const { data: batchData } = await supabaseAdmin
            .from('exam_target_batches')
            .select('exam_id, academic_batches(year)')
            .in('exam_id', examIds);
          batchRestrictions = batchData || [];
        } catch {
          // Table doesn't exist yet, skip batch filtering
        }

        try {
          const { data: deptData } = await supabaseAdmin
            .from('exam_target_departments')
            .select('exam_id, department_id')
            .in('exam_id', examIds);
          deptRestrictions = deptData || [];
        } catch {
          // Table doesn't exist yet, skip department filtering
        }

        // Only apply filtering if restrictions exist
        if (batchRestrictions.length > 0 || deptRestrictions.length > 0) {
          // Create maps for quick lookup
          const examBatchMap = new Map<string, number[]>();
          const examDeptMap = new Map<string, string[]>();

          batchRestrictions.forEach((br: any) => {
            const year = br.academic_batches?.year;
            if (year) {
              if (!examBatchMap.has(br.exam_id)) {
                examBatchMap.set(br.exam_id, []);
              }
              examBatchMap.get(br.exam_id)!.push(year);
            }
          });

          deptRestrictions.forEach((dr: any) => {
            if (!examDeptMap.has(dr.exam_id)) {
              examDeptMap.set(dr.exam_id, []);
            }
            examDeptMap.get(dr.exam_id)!.push(dr.department_id);
          });

          // Filter exams based on restrictions
          exams = exams.filter(exam => {
            // Check batch restriction
            const allowedBatches = examBatchMap.get(exam.id);
            if (allowedBatches && allowedBatches.length > 0) {
              if (!student?.year_batch || !allowedBatches.includes(student.year_batch)) {
                return false; // Student's batch not allowed
              }
            }

            // Check department restriction
            const allowedDepts = examDeptMap.get(exam.id);
            if (allowedDepts && allowedDepts.length > 0) {
              if (!student?.department_id || !allowedDepts.includes(student.department_id)) {
                return false; // Student's department not allowed
              }
            }

            return true; // No restrictions or student matches
          });
        }
      } catch (filterError) {
        // If filtering fails, show all active exams to student
        console.warn('Batch/department filtering skipped:', filterError);
      }
    }

    res.json({
      success: true,
      data: {
        exams,
        page: pageNum,
        limit: limitNum,
        total: exams?.length || 0,
        total_pages: Math.ceil((exams?.length || 0) / limitNum),
      },
    });
  } catch (error) {
    console.error('Get exams error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch exams',
    });
  }
});

// GET /api/exams/:id - Get exam details
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const includeQuestions = req.query.questions === 'true';

    const { data: exam, error } = await supabaseAdmin
      .from(TABLES.EXAMS)
      .select('*')
      .eq('id', id)
      .single();

    if (error || !exam) {
      return res.status(404).json({
        success: false,
        error: 'Exam not found',
      });
    }

    // Check access
    if (req.user!.role === 'student' && exam.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: 'Exam is not available',
      });
    }

    let questions = null;
    if (includeQuestions) {
      const { data: questionsData } = await supabaseAdmin
        .from(TABLES.QUESTIONS)
        .select('*')
        .eq('exam_id', id)
        .order('order', { ascending: true });

      // For students, hide correct answers
      if (req.user!.role === 'student') {
        questions = questionsData?.map(q => ({
          ...q,
          correct_answer: undefined,
          test_cases: q.test_cases?.filter((tc: any) => !tc.is_hidden),
        }));
      } else {
        questions = questionsData;
      }
    }

    // For admins, also fetch target batches and departments (if tables exist)
    let target_batches: string[] = [];
    let target_departments: string[] = [];
    
    if (req.user!.role === 'admin') {
      try {
        const { data: batchTargets } = await supabaseAdmin
          .from('exam_target_batches')
          .select('batch_id')
          .eq('exam_id', id);
        target_batches = batchTargets?.map(bt => bt.batch_id) || [];
      } catch {
        // Table may not exist yet
      }
      
      try {
        const { data: deptTargets } = await supabaseAdmin
          .from('exam_target_departments')
          .select('department_id')
          .eq('exam_id', id);
        target_departments = deptTargets?.map(dt => dt.department_id) || [];
      } catch {
        // Table may not exist yet
      }
    }

    res.json({
      success: true,
      data: {
        ...exam,
        questions,
        target_batch_ids: target_batches,
        target_department_ids: target_departments,
      },
    });
  } catch (error) {
    console.error('Get exam error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch exam',
    });
  }
});

// POST /api/exams - Create new exam (admin only)
router.post('/', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { target_batch_ids, target_department_ids, ...examBody } = req.body;
    
    const validation = createExamSchema.safeParse(examBody);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: validation.error.errors[0].message,
      });
    }

    const examId = uuidv4();
    const examData = {
      id: examId,
      ...validation.data,
      status: 'draft',
      total_points: 0,
      created_by: req.user!.userId,
    };

    const { data: exam, error } = await supabaseAdmin
      .from(TABLES.EXAMS)
      .insert(examData)
      .select()
      .single();

    if (error) {
      console.error('Create exam error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to create exam',
      });
    }

    // Add target batches (skipped if tables don't exist yet)
    if (target_batch_ids && Array.isArray(target_batch_ids) && target_batch_ids.length > 0) {
      try {
        const batchRecords = target_batch_ids.map((batchId: string) => ({
          id: uuidv4(),
          exam_id: examId,
          batch_id: batchId
        }));
        await supabaseAdmin.from('exam_target_batches').insert(batchRecords);
      } catch (e) {
        console.warn('Skipping batch targets - table may not exist:', e);
      }
    }

    // Add target departments (skipped if tables don't exist yet)
    if (target_department_ids && Array.isArray(target_department_ids) && target_department_ids.length > 0) {
      try {
        const deptRecords = target_department_ids.map((deptId: string) => ({
          id: uuidv4(),
          exam_id: examId,
          department_id: deptId
        }));
        await supabaseAdmin.from('exam_target_departments').insert(deptRecords);
      } catch (e) {
        console.warn('Skipping department targets - table may not exist:', e);
      }
    }

    res.status(201).json({
      success: true,
      data: exam,
      message: 'Exam created successfully',
    });
  } catch (error) {
    console.error('Create exam error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create exam',
    });
  }
});

// PUT /api/exams/:id - Update exam (admin only)
router.put('/:id', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { target_batch_ids, target_department_ids, ...examBody } = req.body;

    // Check ownership
    const { data: existingExam } = await supabaseAdmin
      .from(TABLES.EXAMS)
      .select('created_by, status')
      .eq('id', id)
      .single();

    if (!existingExam) {
      return res.status(404).json({
        success: false,
        error: 'Exam not found',
      });
    }

    if (existingExam.created_by !== req.user!.userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only edit your own exams',
      });
    }

    if (existingExam.status === 'active' || existingExam.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot edit an active or completed exam',
      });
    }

    const validation = createExamSchema.partial().safeParse(examBody);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: validation.error.errors[0].message,
      });
    }

    const { data: exam, error } = await supabaseAdmin
      .from(TABLES.EXAMS)
      .update({ ...validation.data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to update exam',
      });
    }

    // Update target batches if provided (skipped if tables don't exist yet)
    if (target_batch_ids !== undefined && Array.isArray(target_batch_ids)) {
      try {
        // Remove existing batch targets
        await supabaseAdmin.from('exam_target_batches').delete().eq('exam_id', id);
        
        // Add new batch targets
        if (target_batch_ids.length > 0) {
          const batchRecords = target_batch_ids.map((batchId: string) => ({
            id: uuidv4(),
            exam_id: id,
            batch_id: batchId
          }));
          await supabaseAdmin.from('exam_target_batches').insert(batchRecords);
        }
      } catch (e) {
        console.warn('Skipping batch targets update - table may not exist:', e);
      }
    }

    // Update target departments if provided (skipped if tables don't exist yet)
    if (target_department_ids !== undefined && Array.isArray(target_department_ids)) {
      try {
        // Remove existing department targets
        await supabaseAdmin.from('exam_target_departments').delete().eq('exam_id', id);
        
        // Add new department targets
        if (target_department_ids.length > 0) {
          const deptRecords = target_department_ids.map((deptId: string) => ({
            id: uuidv4(),
            exam_id: id,
            department_id: deptId
          }));
          await supabaseAdmin.from('exam_target_departments').insert(deptRecords);
        }
      } catch (e) {
        console.warn('Skipping department targets update - table may not exist:', e);
      }
    }

    res.json({
      success: true,
      data: exam,
      message: 'Exam updated successfully',
    });
  } catch (error) {
    console.error('Update exam error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update exam',
    });
  }
});

// POST /api/exams/:id/questions - Add question to exam
router.post('/:id/questions', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id: examId } = req.params;

    // Check ownership
    const { data: exam } = await supabaseAdmin
      .from(TABLES.EXAMS)
      .select('created_by, total_points')
      .eq('id', examId)
      .single();

    if (!exam) {
      return res.status(404).json({
        success: false,
        error: 'Exam not found',
      });
    }

    if (exam.created_by !== req.user!.userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only add questions to your own exams',
      });
    }

    const validation = createQuestionSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: validation.error.errors[0].message,
      });
    }

    // Get current question count for order
    const { count } = await supabaseAdmin
      .from(TABLES.QUESTIONS)
      .select('*', { count: 'exact', head: true })
      .eq('exam_id', examId);

    const questionData = {
      id: uuidv4(),
      exam_id: examId,
      ...validation.data,
      order: validation.data.order ?? (count || 0) + 1,
    };

    const { data: question, error } = await supabaseAdmin
      .from(TABLES.QUESTIONS)
      .insert(questionData)
      .select()
      .single();

    if (error) {
      console.error('Create question error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to create question',
      });
    }

    // Update total points
    await supabaseAdmin
      .from(TABLES.EXAMS)
      .update({ total_points: exam.total_points + validation.data.points })
      .eq('id', examId);

    res.status(201).json({
      success: true,
      data: question,
      message: 'Question added successfully',
    });
  } catch (error) {
    console.error('Create question error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create question',
    });
  }
});

// PUT /api/exams/:id/status - Update exam status
router.put('/:id/status', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['draft', 'scheduled', 'active', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status',
      });
    }

    // Check ownership
    const { data: exam } = await supabaseAdmin
      .from(TABLES.EXAMS)
      .select('created_by')
      .eq('id', id)
      .single();

    if (!exam || exam.created_by !== req.user!.userId) {
      return res.status(404).json({
        success: false,
        error: 'Exam not found or unauthorized',
      });
    }

    const { data: updatedExam, error } = await supabaseAdmin
      .from(TABLES.EXAMS)
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to update exam status',
      });
    }

    res.json({
      success: true,
      data: updatedExam,
      message: `Exam status updated to ${status}`,
    });
  } catch (error) {
    console.error('Update exam status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update exam status',
    });
  }
});

// DELETE /api/exams/:id - Delete exam
router.delete('/:id', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check ownership
    const { data: exam } = await supabaseAdmin
      .from(TABLES.EXAMS)
      .select('created_by, status')
      .eq('id', id)
      .single();

    if (!exam) {
      return res.status(404).json({
        success: false,
        error: 'Exam not found',
      });
    }

    if (exam.created_by !== req.user!.userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only delete your own exams',
      });
    }

    if (exam.status === 'active') {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete an active exam',
      });
    }

    // Delete questions first
    await supabaseAdmin
      .from(TABLES.QUESTIONS)
      .delete()
      .eq('exam_id', id);

    // Delete exam
    const { error } = await supabaseAdmin
      .from(TABLES.EXAMS)
      .delete()
      .eq('id', id);

    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to delete exam',
      });
    }

    res.json({
      success: true,
      message: 'Exam deleted successfully',
    });
  } catch (error) {
    console.error('Delete exam error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete exam',
    });
  }
});

export default router;
