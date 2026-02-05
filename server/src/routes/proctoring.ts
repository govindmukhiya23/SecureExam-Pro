import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin, TABLES } from '../lib/supabase.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

// Risk points configuration
const RISK_POINTS: Record<string, number> = {
  look_away: 10,
  head_missing: 15,
  multiple_faces: 40,
  face_occlusion: 20,
  brightness_change: 5,
  tab_switch: 20,
  fullscreen_exit: 25,
  devtools_open: 30,
  copy_attempt: 15,
  paste_detected: 25,
  right_click: 5,
  print_screen: 20,
  untrusted_key_event: 30,
  bot_typing: 25,
  typing_unfocused: 15,
  device_change: 40,
  ip_change: 10,
};

const RISK_THRESHOLDS = {
  WARNING: 40,
  FLAG: 70,
  TERMINATE: 100,
};

// Validation schemas
const suspiciousEventSchema = z.object({
  session_id: z.string().uuid(),
  event_type: z.string(),
  details: z.record(z.unknown()).optional(),
});

const keyboardEventSchema = z.object({
  session_id: z.string().uuid(),
  event_type: z.enum(['paste', 'untrusted', 'bot_typing', 'unfocused_typing']),
  is_trusted: z.boolean(),
  timing_pattern: z.array(z.number()).optional(),
});

// POST /api/proctoring/event - Log a suspicious event
router.post('/event', authenticate, async (req: Request, res: Response) => {
  try {
    const validation = suspiciousEventSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: validation.error.errors[0].message,
      });
    }

    const { session_id, event_type, details } = validation.data;

    // Verify session ownership
    const { data: session } = await supabaseAdmin
      .from(TABLES.EXAM_SESSIONS)
      .select('*')
      .eq('id', session_id)
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

    const points = RISK_POINTS[event_type] || 10;

    // Create suspicious event
    const { data: event, error: eventError } = await supabaseAdmin
      .from(TABLES.SUSPICIOUS_EVENTS)
      .insert({
        id: uuidv4(),
        session_id,
        event_type,
        points,
        timestamp: new Date().toISOString(),
        details,
      })
      .select()
      .single();

    if (eventError) {
      console.error('Create event error:', eventError);
      return res.status(500).json({
        success: false,
        error: 'Failed to log event',
      });
    }

    // Update session risk score
    const newRiskScore = session.current_risk_score + points;
    const highestRiskScore = Math.max(session.highest_risk_score, newRiskScore);

    const updateData: Record<string, unknown> = {
      current_risk_score: newRiskScore,
      highest_risk_score: highestRiskScore,
      total_violations: session.total_violations + 1,
    };

    // Determine action based on risk score
    let action: 'none' | 'warning' | 'flag' | 'terminate' = 'none';

    if (newRiskScore >= RISK_THRESHOLDS.TERMINATE) {
      action = 'terminate';
      updateData.screen_blank_triggered = true;
      updateData.status = 'terminated';
      updateData.end_time = new Date().toISOString();
    } else if (newRiskScore >= RISK_THRESHOLDS.FLAG) {
      action = 'flag';
    } else if (newRiskScore >= RISK_THRESHOLDS.WARNING) {
      action = 'warning';
    }

    await supabaseAdmin
      .from(TABLES.EXAM_SESSIONS)
      .update(updateData)
      .eq('id', session_id);

    res.json({
      success: true,
      data: {
        event,
        current_risk_score: newRiskScore,
        action,
        threshold_reached: action !== 'none',
      },
    });
  } catch (error) {
    console.error('Log event error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to log event',
    });
  }
});

// POST /api/proctoring/keyboard - Log keyboard event
router.post('/keyboard', authenticate, async (req: Request, res: Response) => {
  try {
    const validation = keyboardEventSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: validation.error.errors[0].message,
      });
    }

    const { session_id, event_type, is_trusted, timing_pattern } = validation.data;

    // Verify session ownership
    const { data: session } = await supabaseAdmin
      .from(TABLES.EXAM_SESSIONS)
      .select('id, user_id, status')
      .eq('id', session_id)
      .eq('user_id', req.user!.userId)
      .single();

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    // Log keyboard event
    const { data: keyboardEvent, error } = await supabaseAdmin
      .from(TABLES.KEYBOARD_EVENTS)
      .insert({
        id: uuidv4(),
        session_id,
        event_type,
        is_trusted,
        timing_pattern,
        timestamp: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('Log keyboard event error:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to log keyboard event',
      });
    }

    // Also create a suspicious event for untrusted or paste events
    if (!is_trusted || event_type === 'paste' || event_type === 'bot_typing') {
      const suspiciousEventType = event_type === 'paste' ? 'paste_detected' : 
                                   event_type === 'bot_typing' ? 'bot_typing' : 'untrusted_key_event';
      
      await supabaseAdmin
        .from(TABLES.SUSPICIOUS_EVENTS)
        .insert({
          id: uuidv4(),
          session_id,
          event_type: suspiciousEventType,
          points: RISK_POINTS[suspiciousEventType] || 20,
          timestamp: new Date().toISOString(),
          details: { keyboard_event_id: keyboardEvent.id },
        });
    }

    res.json({
      success: true,
      data: keyboardEvent,
    });
  } catch (error) {
    console.error('Log keyboard event error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to log keyboard event',
    });
  }
});

// POST /api/proctoring/heartbeat - Session heartbeat with IP check
router.post('/heartbeat', authenticate, async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body;

    if (!session_id) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required',
      });
    }

    // Get client IP
    const forwarded = req.headers['x-forwarded-for'];
    const clientIP = typeof forwarded === 'string' 
      ? forwarded.split(',')[0].trim() 
      : req.socket.remoteAddress || 'unknown';

    // Verify session
    const { data: session } = await supabaseAdmin
      .from(TABLES.EXAM_SESSIONS)
      .select('*')
      .eq('id', session_id)
      .eq('user_id', req.user!.userId)
      .single();

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    const updates: Record<string, unknown> = {};

    // Check for IP change
    if (session.current_ip !== clientIP) {
      // Log IP change
      await supabaseAdmin
        .from(TABLES.IP_LOGS)
        .insert({
          id: uuidv4(),
          session_id,
          ip_address: clientIP,
        });

      updates.current_ip = clientIP;
      updates.ip_change_count = session.ip_change_count + 1;

      // Add suspicious event for IP change
      await supabaseAdmin
        .from(TABLES.SUSPICIOUS_EVENTS)
        .insert({
          id: uuidv4(),
          session_id,
          event_type: 'ip_change',
          points: RISK_POINTS.ip_change,
          timestamp: new Date().toISOString(),
          details: {
            old_ip: session.current_ip,
            new_ip: clientIP,
          },
        });

      updates.current_risk_score = session.current_risk_score + RISK_POINTS.ip_change;
      updates.total_violations = session.total_violations + 1;
    }

    if (Object.keys(updates).length > 0) {
      await supabaseAdmin
        .from(TABLES.EXAM_SESSIONS)
        .update(updates)
        .eq('id', session_id);
    }

    res.json({
      success: true,
      data: {
        session_id,
        ip_changed: session.current_ip !== clientIP,
        current_ip: clientIP,
      },
    });
  } catch (error) {
    console.error('Heartbeat error:', error);
    res.status(500).json({
      success: false,
      error: 'Heartbeat failed',
    });
  }
});

// GET /api/proctoring/session/:id/violations - Get session violations (admin)
router.get('/session/:id/violations', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id: sessionId } = req.params;

    const { data: violations, error } = await supabaseAdmin
      .from(TABLES.SUSPICIOUS_EVENTS)
      .select('*')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: false });

    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch violations',
      });
    }

    const { data: keyboardEvents } = await supabaseAdmin
      .from(TABLES.KEYBOARD_EVENTS)
      .select('*')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: false });

    const { data: ipLogs } = await supabaseAdmin
      .from(TABLES.IP_LOGS)
      .select('*')
      .eq('session_id', sessionId)
      .order('timestamp', { ascending: false });

    res.json({
      success: true,
      data: {
        violations,
        keyboard_events: keyboardEvents,
        ip_logs: ipLogs,
      },
    });
  } catch (error) {
    console.error('Get violations error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch violations',
    });
  }
});

// POST /api/proctoring/terminate - Terminate a session (admin or auto)
router.post('/terminate', authenticate, async (req: Request, res: Response) => {
  try {
    const { session_id, reason } = req.body;

    if (!session_id) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required',
      });
    }

    // Get session
    const { data: session } = await supabaseAdmin
      .from(TABLES.EXAM_SESSIONS)
      .select('*')
      .eq('id', session_id)
      .single();

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    // Check authorization - student can only terminate own session
    if (req.user!.role === 'student' && session.user_id !== req.user!.userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    // Terminate session
    const { data: updatedSession, error } = await supabaseAdmin
      .from(TABLES.EXAM_SESSIONS)
      .update({
        status: 'terminated',
        screen_blank_triggered: true,
        end_time: new Date().toISOString(),
      })
      .eq('id', session_id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        error: 'Failed to terminate session',
      });
    }

    // Log termination event
    await supabaseAdmin
      .from(TABLES.SUSPICIOUS_EVENTS)
      .insert({
        id: uuidv4(),
        session_id,
        event_type: 'session_terminated',
        points: 0,
        timestamp: new Date().toISOString(),
        details: { reason: reason || 'Risk threshold exceeded' },
      });

    res.json({
      success: true,
      data: updatedSession,
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

export default router;
