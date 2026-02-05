import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { supabaseAdmin, TABLES } from '../lib/supabase.js';
import { JWTPayload } from '../middleware/auth.js';

interface AuthenticatedSocket extends Socket {
  user?: JWTPayload;
}

// Store active connections
const activeConnections = new Map<string, Set<string>>(); // examId -> Set of socketIds
const userSessions = new Map<string, string>(); // sessionId -> socketId

export function initializeSocketIO(io: SocketIOServer): void {
  // Authentication middleware
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, config.jwt.secret) as JWTPayload;
      socket.user = decoded;
      next();
    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`Socket connected: ${socket.id}, User: ${socket.user?.email}`);

    // Student joins their exam session
    socket.on('session:join', async (sessionId: string) => {
      if (!socket.user) return;

      try {
        // Verify session ownership
        const { data: session } = await supabaseAdmin
          .from(TABLES.EXAM_SESSIONS)
          .select('id, exam_id, user_id')
          .eq('id', sessionId)
          .single();

        if (!session || (socket.user.role === 'student' && session.user_id !== socket.user.userId)) {
          socket.emit('error', { message: 'Session not found or unauthorized' });
          return;
        }

        socket.join(`session:${sessionId}`);
        socket.join(`exam:${session.exam_id}`);
        userSessions.set(sessionId, socket.id);

        console.log(`User ${socket.user.email} joined session ${sessionId}`);
      } catch (error) {
        console.error('Session join error:', error);
        socket.emit('error', { message: 'Failed to join session' });
      }
    });

    // Student leaves session
    socket.on('session:leave', (sessionId: string) => {
      socket.leave(`session:${sessionId}`);
      userSessions.delete(sessionId);
      console.log(`Socket ${socket.id} left session ${sessionId}`);
    });

    // Session heartbeat
    socket.on('session:heartbeat', async (data: { session_id: string; timestamp: number }) => {
      if (!socket.user) return;

      // Broadcast to admin monitors
      socket.to(`exam:monitor:${data.session_id}`).emit('session:heartbeat', {
        session_id: data.session_id,
        user_id: socket.user.userId,
        timestamp: data.timestamp,
      });
    });

    // Suspicious event from student
    socket.on('event:suspicious', async (data: {
      session_id: string;
      event_type: string;
      points: number;
      details?: Record<string, unknown>;
    }) => {
      if (!socket.user) return;

      console.log(`Suspicious event from ${socket.user.email}:`, data.event_type);

      // Get session details for broadcasting
      const { data: session } = await supabaseAdmin
        .from(TABLES.EXAM_SESSIONS)
        .select('*, users(name, email)')
        .eq('id', data.session_id)
        .single();

      if (!session) return;

      // Broadcast to admin monitors
      io.to(`exam:monitor:${session.exam_id}`).emit('session:alert', {
        id: Date.now().toString(),
        session_id: data.session_id,
        user_id: socket.user.userId,
        user_name: session.users?.name || 'Unknown',
        event_type: data.event_type,
        points: data.points,
        current_risk_score: session.current_risk_score,
        timestamp: new Date().toISOString(),
        severity: data.points >= 30 ? 'critical' : data.points >= 20 ? 'high' : data.points >= 10 ? 'medium' : 'low',
      });
    });

    // Admin starts monitoring an exam
    socket.on('admin:monitor', async (examId: string) => {
      if (!socket.user || socket.user.role !== 'admin') {
        socket.emit('error', { message: 'Admin access required' });
        return;
      }

      // Verify exam ownership
      const { data: exam } = await supabaseAdmin
        .from(TABLES.EXAMS)
        .select('id, created_by')
        .eq('id', examId)
        .single();

      if (!exam || exam.created_by !== socket.user.userId) {
        socket.emit('error', { message: 'Exam not found or unauthorized' });
        return;
      }

      socket.join(`exam:monitor:${examId}`);

      // Track active connections
      if (!activeConnections.has(examId)) {
        activeConnections.set(examId, new Set());
      }
      activeConnections.get(examId)!.add(socket.id);

      // Send current active sessions
      const { data: activeSessions } = await supabaseAdmin
        .from(TABLES.EXAM_SESSIONS)
        .select('*, users(id, name, email)')
        .eq('exam_id', examId)
        .in('status', ['started', 'in_progress']);

      socket.emit('monitor:init', {
        exam_id: examId,
        active_sessions: activeSessions || [],
      });

      console.log(`Admin ${socket.user.email} started monitoring exam ${examId}`);
    });

    // Admin stops monitoring
    socket.on('admin:stop-monitor', (examId: string) => {
      socket.leave(`exam:monitor:${examId}`);

      if (activeConnections.has(examId)) {
        activeConnections.get(examId)!.delete(socket.id);
        if (activeConnections.get(examId)!.size === 0) {
          activeConnections.delete(examId);
        }
      }

      console.log(`Admin ${socket.user?.email} stopped monitoring exam ${examId}`);
    });

    // Admin terminates a session
    socket.on('admin:terminate-session', async (data: { session_id: string; reason: string }) => {
      if (!socket.user || socket.user.role !== 'admin') return;

      // Notify the student
      const studentSocketId = userSessions.get(data.session_id);
      if (studentSocketId) {
        io.to(studentSocketId).emit('session:terminated', {
          session_id: data.session_id,
          reason: data.reason,
        });
      }

      // Update session in database
      await supabaseAdmin
        .from(TABLES.EXAM_SESSIONS)
        .update({
          status: 'terminated',
          screen_blank_triggered: true,
          end_time: new Date().toISOString(),
        })
        .eq('id', data.session_id);

      console.log(`Admin terminated session ${data.session_id}`);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);

      // Clean up session mappings
      for (const [sessionId, socketId] of userSessions.entries()) {
        if (socketId === socket.id) {
          userSessions.delete(sessionId);
        }
      }

      // Clean up monitor connections
      for (const [examId, sockets] of activeConnections.entries()) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          activeConnections.delete(examId);
        }
      }
    });
  });
}

// Helper function to notify about session updates
export function notifySessionUpdate(
  io: SocketIOServer,
  examId: string,
  sessionData: {
    session_id: string;
    user_name: string;
    status: string;
    risk_score: number;
    violations_count: number;
  }
): void {
  io.to(`exam:monitor:${examId}`).emit('session:update', sessionData);
}

// Helper function to send risk warning to student
export function sendRiskWarning(
  io: SocketIOServer,
  sessionId: string,
  data: { message: string; score: number }
): void {
  const socketId = userSessions.get(sessionId);
  if (socketId) {
    io.to(socketId).emit('risk:warning', data);
  }
}

// Helper function to trigger screen blank
export function triggerScreenBlank(
  io: SocketIOServer,
  sessionId: string,
  data: { message: string; action: 'blank' | 'terminate' }
): void {
  const socketId = userSessions.get(sessionId);
  if (socketId) {
    io.to(socketId).emit('risk:critical', data);
  }
}
