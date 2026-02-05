import { Router, Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin, TABLES } from '../lib/supabase.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { config } from '../config/index.js';
import { extractQuestionsFromContent, isAIConfigured, getAvailableProviders } from '../services/aiService.js';
import { processUploadedFile, validateFile } from '../services/fileProcessor.js';
import type { AIProvider, ExtractedQuestion } from '../../../shared/types/index.js';

const router = Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: config.upload.maxFileSizeMB * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (config.upload.allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  }
});

// GET /api/ai/status - Check AI configuration status
router.get('/status', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const providers = getAvailableProviders();
    
    res.json({
      success: true,
      data: {
        configured: isAIConfigured(),
        available_providers: providers,
        preferred_provider: config.ai.preferredProvider,
        max_file_size_mb: config.upload.maxFileSizeMB,
        allowed_file_types: ['JPG', 'PNG', 'PDF', 'DOC', 'DOCX']
      }
    });
  } catch (error) {
    console.error('AI status check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check AI status'
    });
  }
});

// POST /api/ai/extract - Upload file and extract questions
router.post(
  '/extract',
  authenticate,
  requireAdmin,
  upload.single('file'),
  async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      // Check if AI is configured
      if (!isAIConfigured()) {
        return res.status(503).json({
          success: false,
          error: 'AI services not configured. Please add OpenAI or Gemini API keys.'
        });
      }

      // Validate file upload
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded'
        });
      }

      const { buffer, mimetype, originalname } = req.file;
      const preferredProvider = (req.body.provider as AIProvider) || config.ai.preferredProvider;

      // Validate file
      const validation = validateFile(buffer, mimetype, config.upload.maxFileSizeMB);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: validation.error
        });
      }

      // Create processing job record
      const jobId = uuidv4();
      await supabaseAdmin.from('ai_processing_jobs').insert({
        id: jobId,
        created_by: req.user!.userId,
        status: 'processing',
        file_name: originalname,
        file_type: mimetype
      });

      // Process the file
      const processedFile = await processUploadedFile(buffer, mimetype, originalname);

      // Extract questions using AI
      const result = await extractQuestionsFromContent(processedFile.text, {
        provider: preferredProvider,
        isImage: processedFile.isImage,
        imageBase64: processedFile.imageBase64,
        mimeType: processedFile.mimeType
      });

      const processingTime = Date.now() - startTime;

      // Update job record
      await supabaseAdmin
        .from('ai_processing_jobs')
        .update({
          status: result.success ? 'completed' : 'failed',
          ai_provider: result.provider,
          extracted_questions: result.questions,
          error_message: result.success ? null : 'Failed to extract questions',
          processing_time_ms: processingTime
        })
        .eq('id', jobId);

      if (!result.success) {
        return res.status(422).json({
          success: false,
          error: 'Failed to extract questions from the uploaded file',
          data: {
            job_id: jobId,
            processing_time_ms: processingTime
          }
        });
      }

      res.json({
        success: true,
        data: {
          job_id: jobId,
          provider: result.provider,
          questions: result.questions,
          total_extracted: result.total_extracted,
          processing_time_ms: processingTime,
          file_name: originalname
        }
      });
    } catch (error: any) {
      console.error('AI extraction error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to process file'
      });
    }
  }
);

// GET /api/ai/jobs - List processing jobs for admin
router.get('/jobs', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '10', status } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    let query = supabaseAdmin
      .from('ai_processing_jobs')
      .select('*', { count: 'exact' })
      .eq('created_by', req.user!.userId);

    if (status) {
      query = query.eq('status', status);
    }

    const { data: jobs, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch processing jobs'
      });
    }

    res.json({
      success: true,
      data: {
        jobs,
        page: pageNum,
        limit: limitNum,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / limitNum)
      }
    });
  } catch (error) {
    console.error('Get jobs error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch processing jobs'
    });
  }
});

// GET /api/ai/jobs/:id - Get specific job details
router.get('/jobs/:id', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: job, error } = await supabaseAdmin
      .from('ai_processing_jobs')
      .select('*')
      .eq('id', id)
      .eq('created_by', req.user!.userId)
      .single();

    if (error || !job) {
      return res.status(404).json({
        success: false,
        error: 'Processing job not found'
      });
    }

    res.json({
      success: true,
      data: job
    });
  } catch (error) {
    console.error('Get job error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch processing job'
    });
  }
});

// POST /api/ai/create-exam - Create exam from extracted questions
router.post('/create-exam', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const {
      title,
      description,
      instructions,
      mode,
      duration_minutes,
      passing_percentage,
      questions,
      target_batch_ids,
      target_department_ids,
      shuffle_questions,
      shuffle_options,
      show_results_immediately,
      allow_review,
      max_attempts
    } = req.body;

    if (!title || !mode || !duration_minutes || !questions || questions.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: title, mode, duration_minutes, and questions are required'
      });
    }

    // Calculate total points
    const total_points = questions.reduce((sum: number, q: ExtractedQuestion) => sum + (q.marks || 1), 0);

    // Create the exam
    const examId = uuidv4();
    const { error: examError } = await supabaseAdmin.from(TABLES.EXAMS).insert({
      id: examId,
      title,
      description,
      instructions,
      mode,
      status: 'draft',
      duration_minutes,
      total_points,
      passing_percentage: passing_percentage || 40,
      created_by: req.user!.userId,
      shuffle_questions: shuffle_questions || false,
      shuffle_options: shuffle_options || false,
      show_results_immediately: show_results_immediately ?? true,
      allow_review: allow_review || false,
      max_attempts: max_attempts || 1
    });

    if (examError) {
      console.error('Create exam error:', examError);
      return res.status(500).json({
        success: false,
        error: 'Failed to create exam'
      });
    }

    // Add questions
    const questionRecords = questions.map((q: ExtractedQuestion, index: number) => ({
      id: uuidv4(),
      exam_id: examId,
      type: mapQuestionType(q.type),
      text: q.text,
      options: q.options || null,
      correct_answer: q.correct_answer != null ? String(q.correct_answer) : null,
      points: q.marks || 1,
      order: q.question_number || index + 1
    }));

    const { error: questionsError } = await supabaseAdmin
      .from(TABLES.QUESTIONS)
      .insert(questionRecords);

    if (questionsError) {
      console.error('Add questions error:', questionsError);
      // Rollback exam creation
      await supabaseAdmin.from(TABLES.EXAMS).delete().eq('id', examId);
      return res.status(500).json({
        success: false,
        error: 'Failed to add questions to exam'
      });
    }

    // Add target batches
    if (target_batch_ids && target_batch_ids.length > 0) {
      const batchRecords = target_batch_ids.map((batchId: string) => ({
        id: uuidv4(),
        exam_id: examId,
        batch_id: batchId
      }));

      await supabaseAdmin.from('exam_target_batches').insert(batchRecords);
    }

    // Add target departments
    if (target_department_ids && target_department_ids.length > 0) {
      const deptRecords = target_department_ids.map((deptId: string) => ({
        id: uuidv4(),
        exam_id: examId,
        department_id: deptId
      }));

      await supabaseAdmin.from('exam_target_departments').insert(deptRecords);
    }

    res.status(201).json({
      success: true,
      data: {
        exam_id: examId,
        questions_added: questions.length,
        total_points
      }
    });
  } catch (error) {
    console.error('Create exam from AI error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create exam'
    });
  }
});

/**
 * Map extracted question types to database question types
 */
function mapQuestionType(type: string): string {
  const typeMap: Record<string, string> = {
    'mcq': 'mcq',
    'true_false': 'mcq', // Store as MCQ with True/False options
    'short_answer': 'descriptive',
    'descriptive': 'descriptive'
  };
  return typeMap[type] || 'descriptive';
}

export default router;
