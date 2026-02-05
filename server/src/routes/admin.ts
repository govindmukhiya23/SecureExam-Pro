import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '../lib/supabase.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

// ============================================
// DEPARTMENTS ROUTES
// ============================================

// GET /api/admin/departments - List all departments
router.get('/departments', authenticate, async (req: Request, res: Response) => {
  try {
    const { active_only = 'true' } = req.query;

    let query = supabaseAdmin
      .from('departments')
      .select('*')
      .order('name', { ascending: true });

    if (active_only === 'true') {
      query = query.eq('is_active', true);
    }

    const { data: departments, error } = await query;

    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch departments'
      });
    }

    res.json({
      success: true,
      data: departments
    });
  } catch (error) {
    console.error('Get departments error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch departments'
    });
  }
});

// POST /api/admin/departments - Create new department (admin only)
router.post('/departments', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      name: z.string().min(2, 'Name must be at least 2 characters'),
      code: z.string().min(2).max(20).toUpperCase(),
      description: z.string().optional()
    });

    const validated = schema.parse(req.body);

    const { data: department, error } = await supabaseAdmin
      .from('departments')
      .insert({
        id: uuidv4(),
        ...validated,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({
          success: false,
          error: 'Department with this code already exists'
        });
      }
      return res.status(500).json({
        success: false,
        error: 'Failed to create department'
      });
    }

    res.status(201).json({
      success: true,
      data: department
    });
  } catch (error: any) {
    console.error('Create department error:', error);
    res.status(400).json({
      success: false,
      error: error.errors?.[0]?.message || 'Invalid input'
    });
  }
});

// PATCH /api/admin/departments/:id - Update department (admin only)
router.patch('/departments/:id', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, code, description, is_active } = req.body;

    const updates: any = {};
    if (name) updates.name = name;
    if (code) updates.code = code.toUpperCase();
    if (description !== undefined) updates.description = description;
    if (is_active !== undefined) updates.is_active = is_active;

    const { data: department, error } = await supabaseAdmin
      .from('departments')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !department) {
      return res.status(404).json({
        success: false,
        error: 'Department not found'
      });
    }

    res.json({
      success: true,
      data: department
    });
  } catch (error) {
    console.error('Update department error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update department'
    });
  }
});

// ============================================
// ACADEMIC BATCHES ROUTES
// ============================================

// GET /api/admin/batches - List all batches
router.get('/batches', authenticate, async (req: Request, res: Response) => {
  try {
    const { active_only = 'true' } = req.query;

    let query = supabaseAdmin
      .from('academic_batches')
      .select('*')
      .order('year', { ascending: false });

    if (active_only === 'true') {
      query = query.eq('is_active', true);
    }

    const { data: batches, error } = await query;

    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch batches'
      });
    }

    res.json({
      success: true,
      data: batches
    });
  } catch (error) {
    console.error('Get batches error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch batches'
    });
  }
});

// POST /api/admin/batches - Create new batch (admin only)
router.post('/batches', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      year: z.number().min(2000).max(2100),
      label: z.string().optional()
    });

    const validated = schema.parse(req.body);
    const label = validated.label || `${validated.year} Batch`;

    const { data: batch, error } = await supabaseAdmin
      .from('academic_batches')
      .insert({
        id: uuidv4(),
        year: validated.year,
        label,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({
          success: false,
          error: 'Batch for this year already exists'
        });
      }
      return res.status(500).json({
        success: false,
        error: 'Failed to create batch'
      });
    }

    res.status(201).json({
      success: true,
      data: batch
    });
  } catch (error: any) {
    console.error('Create batch error:', error);
    res.status(400).json({
      success: false,
      error: error.errors?.[0]?.message || 'Invalid input'
    });
  }
});

// PATCH /api/admin/batches/:id - Update batch (admin only)
router.patch('/batches/:id', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { label, is_active } = req.body;

    const updates: any = {};
    if (label) updates.label = label;
    if (is_active !== undefined) updates.is_active = is_active;

    const { data: batch, error } = await supabaseAdmin
      .from('academic_batches')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !batch) {
      return res.status(404).json({
        success: false,
        error: 'Batch not found'
      });
    }

    res.json({
      success: true,
      data: batch
    });
  } catch (error) {
    console.error('Update batch error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update batch'
    });
  }
});

// ============================================
// STUDENTS DIRECTORY ROUTES
// ============================================

// GET /api/admin/students - List all students with filters
router.get('/students', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const {
      search,
      department_id,
      year_batch,
      account_status,
      page = '1',
      limit = '20'
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const offset = (pageNum - 1) * limitNum;

    // Build query
    let query = supabaseAdmin
      .from('users')
      .select(`
        id,
        name,
        email,
        roll_number,
        year_batch,
        account_status,
        created_at,
        department_id,
        departments!left(id, name, code)
      `, { count: 'exact' })
      .eq('role', 'student');

    // Apply filters
    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,roll_number.ilike.%${search}%`);
    }

    if (department_id) {
      query = query.eq('department_id', department_id);
    }

    if (year_batch) {
      query = query.eq('year_batch', parseInt(year_batch as string, 10));
    }

    if (account_status) {
      query = query.eq('account_status', account_status);
    }

    const { data: students, error, count } = await query
      .order('name', { ascending: true })
      .range(offset, offset + limitNum - 1);

    if (error) {
      console.error('Get students error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch students'
      });
    }

    // Get exam counts for each student
    const studentIds = students?.map((s: any) => s.id) || [];
    let examCounts: Record<string, { count: number; last_date?: string }> = {};

    if (studentIds.length > 0) {
      const { data: sessions } = await supabaseAdmin
        .from('exam_sessions')
        .select('user_id, submit_time')
        .in('user_id', studentIds);

      if (sessions) {
        sessions.forEach((s: any) => {
          if (!examCounts[s.user_id]) {
            examCounts[s.user_id] = { count: 0 };
          }
          examCounts[s.user_id].count++;
          if (!examCounts[s.user_id].last_date || s.submit_time > examCounts[s.user_id].last_date) {
            examCounts[s.user_id].last_date = s.submit_time;
          }
        });
      }
    }

    // Transform response
    const formattedStudents = students?.map((s: any) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      roll_number: s.roll_number,
      department_code: s.departments?.code,
      department_name: s.departments?.name,
      year_batch: s.year_batch,
      account_status: s.account_status || 'active',
      created_at: s.created_at,
      exams_taken: examCounts[s.id]?.count || 0,
      last_exam_date: examCounts[s.id]?.last_date
    }));

    res.json({
      success: true,
      data: {
        students: formattedStudents,
        page: pageNum,
        limit: limitNum,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / limitNum)
      }
    });
  } catch (error) {
    console.error('Get students error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch students'
    });
  }
});

// GET /api/admin/students/:id - Get student details with exam history
router.get('/students/:id', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get student details
    const { data: student, error: studentError } = await supabaseAdmin
      .from('users')
      .select(`
        *,
        departments!left(id, name, code)
      `)
      .eq('id', id)
      .eq('role', 'student')
      .single();

    if (studentError || !student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found'
      });
    }

    // Get exam history
    const { data: sessions } = await supabaseAdmin
      .from('exam_sessions')
      .select(`
        id,
        exam_id,
        status,
        start_time,
        submit_time,
        current_risk_score,
        highest_risk_score,
        total_violations,
        exams!inner(id, title, mode, total_points, passing_percentage)
      `)
      .eq('user_id', id)
      .order('start_time', { ascending: false });

    // Calculate scores for each session
    const examHistory = await Promise.all((sessions || []).map(async (s: any) => {
      // Get answers and calculate score
      const { data: answers } = await supabaseAdmin
        .from('answers')
        .select('points_earned')
        .eq('session_id', s.id);

      const totalEarned = answers?.reduce((sum: number, a: any) => sum + (a.points_earned || 0), 0) || 0;
      const percentage = s.exams?.total_points > 0
        ? Math.round((totalEarned / s.exams.total_points) * 100)
        : 0;
      const passed = percentage >= (s.exams?.passing_percentage || 40);

      return {
        session_id: s.id,
        exam_id: s.exam_id,
        exam_title: s.exams?.title,
        mode: s.exams?.mode,
        status: s.status,
        score: totalEarned,
        percentage,
        passed,
        start_time: s.start_time,
        submit_time: s.submit_time,
        violations_count: s.total_violations,
        highest_risk_score: s.highest_risk_score
      };
    }));

    res.json({
      success: true,
      data: {
        student: {
          id: student.id,
          name: student.name,
          email: student.email,
          roll_number: student.roll_number,
          phone: student.phone,
          department_id: student.department_id,
          department_code: student.departments?.code,
          department_name: student.departments?.name,
          year_batch: student.year_batch,
          account_status: student.account_status || 'active',
          created_at: student.created_at
        },
        exam_history: examHistory
      }
    });
  } catch (error) {
    console.error('Get student details error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch student details'
    });
  }
});

// PATCH /api/admin/students/:id/status - Update student account status
router.patch('/students/:id/status', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { account_status } = req.body;

    if (!['active', 'disabled', 'suspended'].includes(account_status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid account status. Must be: active, disabled, or suspended'
      });
    }

    const { data: student, error } = await supabaseAdmin
      .from('users')
      .update({ account_status })
      .eq('id', id)
      .eq('role', 'student')
      .select()
      .single();

    if (error || !student) {
      return res.status(404).json({
        success: false,
        error: 'Student not found'
      });
    }

    res.json({
      success: true,
      data: student
    });
  } catch (error) {
    console.error('Update student status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update student status'
    });
  }
});

// GET /api/admin/students/stats - Get student statistics
router.get('/students-stats', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    // Get total students count
    const { count: totalStudents } = await supabaseAdmin
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'student');

    // Get students by status
    const { data: statusCounts } = await supabaseAdmin
      .from('users')
      .select('account_status')
      .eq('role', 'student');

    const byStatus = {
      active: 0,
      disabled: 0,
      suspended: 0
    };

    statusCounts?.forEach((s: any) => {
      const status = s.account_status || 'active';
      byStatus[status as keyof typeof byStatus]++;
    });

    // Get students by department
    const { data: deptData } = await supabaseAdmin
      .from('users')
      .select(`
        department_id,
        departments!left(code, name)
      `)
      .eq('role', 'student');

    const byDepartment: Record<string, number> = {};
    deptData?.forEach((s: any) => {
      const dept = s.departments?.code || 'Unassigned';
      byDepartment[dept] = (byDepartment[dept] || 0) + 1;
    });

    // Get students by batch
    const { data: batchData } = await supabaseAdmin
      .from('users')
      .select('year_batch')
      .eq('role', 'student');

    const byBatch: Record<number, number> = {};
    batchData?.forEach((s: any) => {
      if (s.year_batch) {
        byBatch[s.year_batch] = (byBatch[s.year_batch] || 0) + 1;
      }
    });

    res.json({
      success: true,
      data: {
        total_students: totalStudents || 0,
        by_status: byStatus,
        by_department: byDepartment,
        by_batch: byBatch
      }
    });
  } catch (error) {
    console.error('Get student stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch student statistics'
    });
  }
});

export default router;
