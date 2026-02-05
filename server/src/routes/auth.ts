import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';
import { supabaseAdmin, TABLES } from '../lib/supabase.js';
import { authenticate, JWTPayload } from '../middleware/auth.js';
import { createError } from '../middleware/errorHandler.js';

const router = Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: {
    success: false,
    error: 'Too many login/register attempts. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Password validation helper
const validatePasswordStrength = (password: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (password.length < 12) {
    errors.push('Password must be at least 12 characters long');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
};

// Validation schemas
const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(12, 'Password must be at least 12 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  role: z.enum(['admin', 'student']),
  college_id: z.string().uuid().optional(),
  college_name: z.string().optional(),
  roll_number: z.string().min(1, 'Roll number is required for students').optional(),
  year_batch: z.number().min(2000).max(2100).optional(),
  department_id: z.string().uuid().optional(),
}).refine((data) => {
  // Roll number is required for students
  if (data.role === 'student' && !data.roll_number) {
    return false;
  }
  return true;
}, {
  message: 'Roll number is required for students',
  path: ['roll_number'],
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// Generate JWT token
const generateToken = (payload: JWTPayload): string => {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
};

// POST /api/auth/register
router.post('/register', authLimiter, async (req: Request, res: Response) => {
  try {
    const validation = registerSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: validation.error.errors[0].message,
      });
    }

    const { email, password, name, role, college_id, college_name, roll_number, year_batch, department_id } = validation.data;

    // Check if user already exists
    const { data: existingUser } = await supabaseAdmin
      .from(TABLES.USERS)
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'User with this email already exists',
      });
    }

    // For students, check if roll number already exists in the same college
    if (role === 'student' && roll_number && college_id) {
      const { data: existingRollNumber } = await supabaseAdmin
        .from(TABLES.USERS)
        .select('id')
        .eq('college_id', college_id)
        .eq('roll_number', roll_number)
        .single();

      if (existingRollNumber) {
        return res.status(409).json({
          success: false,
          error: 'A student with this roll number already exists in this college',
        });
      }
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Determine college_id for the user
    let userCollegeId = college_id;

    // For admin registration, create a new college if college_name is provided
    if (role === 'admin' && college_name) {
      // Generate a unique code from the college name
      const collegeCode = college_name
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, '')
        .split(' ')
        .map(word => word.charAt(0))
        .join('')
        .slice(0, 10) + '_' + Date.now().toString().slice(-4);

      const { data: newCollege, error: collegeError } = await supabaseAdmin
        .from('colleges')
        .insert({
          name: college_name,
          code: collegeCode,
          is_active: true,
        })
        .select('id')
        .single();

      if (collegeError) {
        console.error('Error creating college:', collegeError);
        return res.status(500).json({
          success: false,
          error: 'Failed to create institution',
        });
      }

      userCollegeId = newCollege.id;
    }

    // Create user
    const { data: newUser, error } = await supabaseAdmin
      .from(TABLES.USERS)
      .insert({
        email,
        password_hash: hashedPassword,
        name,
        role,
        college_id: userCollegeId,
        roll_number: role === 'student' ? roll_number : undefined,
        year_batch: role === 'student' ? year_batch : undefined,
        department_id: role === 'student' ? department_id : undefined,
        account_status: 'active',
      })
      .select('id, email, name, role, created_at')
      .single();

    if (error) {
      console.error('Error creating user:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to create user',
      });
    }

    // If admin created a new college, update the college with created_by
    if (role === 'admin' && userCollegeId && newUser) {
      await supabaseAdmin
        .from('colleges')
        .update({ created_by: newUser.id })
        .eq('id', userCollegeId);
    }

    // Generate token
    const token = generateToken({
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role,
    });

    res.status(201).json({
      success: true,
      data: {
        user: newUser,
        token,
      },
      message: 'Registration successful',
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed',
    });
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req: Request, res: Response) => {
  try {
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: validation.error.errors[0].message,
      });
    }

    const { email, password } = validation.data;

    // Get user
    const { data: user, error } = await supabaseAdmin
      .from(TABLES.USERS)
      .select('id, email, name, role, password_hash')
      .eq('email', email)
      .single();

    if (error || !user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password',
      });
    }

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Remove password_hash from response
    const { password_hash, ...userWithoutPassword } = user;

    res.json({
      success: true,
      data: {
        user: userWithoutPassword,
        token,
      },
      message: 'Login successful',
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed',
    });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const { data: user, error } = await supabaseAdmin
      .from(TABLES.USERS)
      .select('id, email, name, role, college_id, department_id, year_batch, roll_number, account_status, created_at, updated_at')
      .eq('id', req.user!.userId)
      .single();

    if (error || !user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    res.json({
      success: true,
      data: user,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user',
    });
  }
});

// POST /api/auth/refresh
router.post('/refresh', authenticate, async (req: Request, res: Response) => {
  try {
    const token = generateToken({
      userId: req.user!.userId,
      email: req.user!.email,
      role: req.user!.role,
    });

    res.json({
      success: true,
      data: { token },
      message: 'Token refreshed',
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to refresh token',
    });
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, (req: Request, res: Response) => {
  // JWT tokens are stateless, so we just acknowledge the logout
  // In production, you might want to implement a token blacklist
  res.json({
    success: true,
    message: 'Logout successful',
  });
});

// ============================================
// PUBLIC ENDPOINTS FOR REGISTRATION
// ============================================

// GET /api/auth/colleges - Get list of colleges for registration
router.get('/colleges', async (req: Request, res: Response) => {
  try {
    const { data: colleges, error } = await supabaseAdmin
      .from('colleges')
      .select('id, name, code')
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Error fetching colleges:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch colleges',
      });
    }

    res.json(colleges || []);
  } catch (error) {
    console.error('Error fetching colleges:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch colleges',
    });
  }
});

// GET /api/auth/departments - Get list of departments for registration
router.get('/departments', async (req: Request, res: Response) => {
  try {
    const { data: departments, error } = await supabaseAdmin
      .from('departments')
      .select('id, name, code')
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Error fetching departments:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch departments',
      });
    }

    res.json(departments || []);
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch departments',
    });
  }
});

// GET /api/auth/batches - Get list of academic batches for registration
router.get('/batches', async (req: Request, res: Response) => {
  try {
    const { data: batches, error } = await supabaseAdmin
      .from('academic_batches')
      .select('id, year, label')
      .eq('is_active', true)
      .order('year', { ascending: false });

    if (error) {
      console.error('Error fetching batches:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch batches',
      });
    }

    res.json(batches || []);
  } catch (error) {
    console.error('Error fetching batches:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch batches',
    });
  }
});

export default router;
