import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

class SocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<Function>> = new Map();

  connect(): Socket {
    if (this.socket?.connected) {
      return this.socket;
    }

    const token = useAuthStore.getState().token;

    this.socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log('Socket connected:', this.socket?.id);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
    });

    return this.socket;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.listeners.clear();
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  // Session management
  joinSession(sessionId: string): void {
    this.socket?.emit('session:join', sessionId);
  }

  leaveSession(sessionId: string): void {
    this.socket?.emit('session:leave', sessionId);
  }

  sendHeartbeat(sessionId: string): void {
    this.socket?.emit('session:heartbeat', {
      session_id: sessionId,
      timestamp: Date.now(),
    });
  }

  // Suspicious events
  reportSuspiciousEvent(data: {
    session_id: string;
    event_type: string;
    points: number;
    details?: Record<string, unknown>;
  }): void {
    this.socket?.emit('event:suspicious', data);
  }

  // Admin monitoring
  startMonitoring(examId: string): void {
    this.socket?.emit('admin:monitor', examId);
  }

  stopMonitoring(examId: string): void {
    this.socket?.emit('admin:stop-monitor', examId);
  }

  terminateSession(sessionId: string, reason: string): void {
    this.socket?.emit('admin:terminate-session', { session_id: sessionId, reason });
  }

  // Event listeners
  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    this.socket?.on(event, callback as any);
  }

  off(event: string, callback: Function): void {
    this.listeners.get(event)?.delete(callback);
    this.socket?.off(event, callback as any);
  }

  // Convenience methods for common events
  onSessionUpdate(callback: (data: any) => void): void {
    this.on('session:update', callback);
  }

  onSessionAlert(callback: (data: any) => void): void {
    this.on('session:alert', callback);
  }

  onSessionTerminated(callback: (data: any) => void): void {
    this.on('session:terminated', callback);
  }

  onRiskWarning(callback: (data: any) => void): void {
    this.on('risk:warning', callback);
  }

  onRiskCritical(callback: (data: any) => void): void {
    this.on('risk:critical', callback);
  }

  onMonitorInit(callback: (data: any) => void): void {
    this.on('monitor:init', callback);
  }
}

export const socketService = new SocketService();
export default socketService;
