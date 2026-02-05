// Anti-Cheat Detection Utilities
// Handles browser lockdown and suspicious activity detection

import { proctoringAPI } from '../services/api';
import socketService from '../services/socket';

export type SuspiciousEventType =
  | 'tab_switch'
  | 'fullscreen_exit'
  | 'devtools_open'
  | 'copy_attempt'
  | 'paste_detected'
  | 'right_click'
  | 'print_screen'
  | 'untrusted_key_event'
  | 'bot_typing'
  | 'typing_unfocused';

const RISK_POINTS: Record<SuspiciousEventType, number> = {
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
};

interface AntiCheatCallbacks {
  onViolation: (event: SuspiciousEventType, points: number) => void;
  onRiskThreshold: (score: number, action: 'warning' | 'flag' | 'terminate') => void;
}

class AntiCheatService {
  private sessionId: string | null = null;
  private callbacks: AntiCheatCallbacks | null = null;
  private isActive = false;
  private keyTimings: number[] = [];
  private lastKeyTime = 0;
  private devToolsOpen = false;

  initialize(sessionId: string, callbacks: AntiCheatCallbacks): void {
    this.sessionId = sessionId;
    this.callbacks = callbacks;
    this.isActive = true;

    this.setupEventListeners();
    this.startDevToolsDetection();
  }

  destroy(): void {
    this.isActive = false;
    this.removeEventListeners();
    this.sessionId = null;
    this.callbacks = null;
  }

  private setupEventListeners(): void {
    // Visibility change (tab switch)
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    // Fullscreen change
    document.addEventListener('fullscreenchange', this.handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', this.handleFullscreenChange);

    // Keyboard events
    document.addEventListener('keydown', this.handleKeyDown);
    document.addEventListener('keyup', this.handleKeyUp);

    // Copy/Paste
    document.addEventListener('copy', this.handleCopy);
    document.addEventListener('paste', this.handlePaste);
    document.addEventListener('cut', this.handleCopy);

    // Right click
    document.addEventListener('contextmenu', this.handleRightClick);

    // Focus events
    window.addEventListener('blur', this.handleWindowBlur);
    window.addEventListener('focus', this.handleWindowFocus);
  }

  private removeEventListeners(): void {
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    document.removeEventListener('fullscreenchange', this.handleFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', this.handleFullscreenChange);
    document.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('keyup', this.handleKeyUp);
    document.removeEventListener('copy', this.handleCopy);
    document.removeEventListener('paste', this.handlePaste);
    document.removeEventListener('cut', this.handleCopy);
    document.removeEventListener('contextmenu', this.handleRightClick);
    window.removeEventListener('blur', this.handleWindowBlur);
    window.removeEventListener('focus', this.handleWindowFocus);
  }

  private handleVisibilityChange = (): void => {
    if (!this.isActive) return;
    
    if (document.hidden) {
      this.reportEvent('tab_switch');
    }
  };

  private handleFullscreenChange = (): void => {
    if (!this.isActive) return;

    if (!document.fullscreenElement) {
      this.reportEvent('fullscreen_exit');
    }
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (!this.isActive) return;

    // Check for untrusted events
    if (!e.isTrusted) {
      this.reportEvent('untrusted_key_event');
      return;
    }

    // Detect Print Screen
    if (e.key === 'PrintScreen') {
      e.preventDefault();
      this.reportEvent('print_screen');
      return;
    }

    // Block common shortcuts
    if (e.ctrlKey || e.metaKey) {
      const blockedKeys = ['c', 'v', 'p', 's', 'u', 'a', 'f', 'g', 'h'];
      if (blockedKeys.includes(e.key.toLowerCase())) {
        e.preventDefault();
        if (e.key.toLowerCase() === 'c') {
          this.reportEvent('copy_attempt');
        }
        return;
      }
    }

    // Block F12 (DevTools)
    if (e.key === 'F12') {
      e.preventDefault();
      this.reportEvent('devtools_open');
      return;
    }

    // Block Alt+Tab (best effort)
    if (e.altKey && e.key === 'Tab') {
      e.preventDefault();
      return;
    }

    // Track typing patterns for bot detection
    const now = Date.now();
    if (this.lastKeyTime > 0) {
      const interval = now - this.lastKeyTime;
      this.keyTimings.push(interval);
      
      // Keep only last 20 timings
      if (this.keyTimings.length > 20) {
        this.keyTimings.shift();
      }

      // Check for bot-like typing (too consistent)
      if (this.keyTimings.length >= 10) {
        const avg = this.keyTimings.reduce((a, b) => a + b, 0) / this.keyTimings.length;
        const variance = this.keyTimings.reduce((sum, t) => sum + Math.pow(t - avg, 2), 0) / this.keyTimings.length;
        
        // Very low variance with fast typing = suspicious
        if (variance < 100 && avg < 50) {
          this.reportEvent('bot_typing');
          this.keyTimings = [];
        }
      }
    }
    this.lastKeyTime = now;
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    if (!this.isActive) return;

    if (!e.isTrusted) {
      this.reportEvent('untrusted_key_event');
    }
  };

  private handleCopy = (e: ClipboardEvent): void => {
    if (!this.isActive) return;
    
    e.preventDefault();
    this.reportEvent('copy_attempt');
  };

  private handlePaste = (e: ClipboardEvent): void => {
    if (!this.isActive) return;

    e.preventDefault();
    this.reportEvent('paste_detected');

    // Log keyboard event
    if (this.sessionId) {
      proctoringAPI.logKeyboard({
        session_id: this.sessionId,
        event_type: 'paste',
        is_trusted: e.isTrusted,
      });
    }
  };

  private handleRightClick = (e: MouseEvent): void => {
    if (!this.isActive) return;
    
    e.preventDefault();
    this.reportEvent('right_click');
  };

  private handleWindowBlur = (): void => {
    if (!this.isActive) return;
    
    // Short delay to avoid false positives
    setTimeout(() => {
      if (!document.hasFocus() && this.isActive) {
        this.reportEvent('tab_switch');
      }
    }, 100);
  };

  private handleWindowFocus = (): void => {
    // Window regained focus - no action needed
  };

  private startDevToolsDetection(): void {
    // Method 1: Check window size difference
    const checkDevTools = () => {
      if (!this.isActive) return;

      const widthThreshold = window.outerWidth - window.innerWidth > 160;
      const heightThreshold = window.outerHeight - window.innerHeight > 160;
      
      const isOpen = widthThreshold || heightThreshold;
      
      if (isOpen && !this.devToolsOpen) {
        this.devToolsOpen = true;
        this.reportEvent('devtools_open');
      } else if (!isOpen) {
        this.devToolsOpen = false;
      }
    };

    setInterval(checkDevTools, 1000);

    // Method 2: Console detection
    const element = new Image();
    Object.defineProperty(element, 'id', {
      get: () => {
        if (!this.devToolsOpen && this.isActive) {
          this.devToolsOpen = true;
          this.reportEvent('devtools_open');
        }
      },
    });
    setInterval(() => {
      if (this.isActive) {
        console.debug(element);
      }
    }, 1000);
  }

  private async reportEvent(eventType: SuspiciousEventType): Promise<void> {
    if (!this.sessionId || !this.callbacks) return;

    const points = RISK_POINTS[eventType];

    // Notify via callback
    this.callbacks.onViolation(eventType, points);

    // Report to server
    try {
      const response = await proctoringAPI.logEvent({
        session_id: this.sessionId,
        event_type: eventType,
      });

      const { current_risk_score, action } = response.data.data;

      // Also emit via socket for real-time monitoring
      socketService.reportSuspiciousEvent({
        session_id: this.sessionId,
        event_type: eventType,
        points,
      });

      // Check thresholds
      if (action === 'terminate') {
        this.callbacks.onRiskThreshold(current_risk_score, 'terminate');
      } else if (action === 'flag') {
        this.callbacks.onRiskThreshold(current_risk_score, 'flag');
      } else if (action === 'warning') {
        this.callbacks.onRiskThreshold(current_risk_score, 'warning');
      }
    } catch (error) {
      console.error('Failed to report event:', error);
    }
  }

  // Public methods for fullscreen management
  async enterFullscreen(): Promise<boolean> {
    try {
      const element = document.documentElement;
      
      if (element.requestFullscreen) {
        await element.requestFullscreen();
      } else if ((element as any).webkitRequestFullscreen) {
        await (element as any).webkitRequestFullscreen();
      } else if ((element as any).msRequestFullscreen) {
        await (element as any).msRequestFullscreen();
      }
      
      return true;
    } catch (error) {
      console.error('Failed to enter fullscreen:', error);
      return false;
    }
  }

  async exitFullscreen(): Promise<void> {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
  }

  isFullscreen(): boolean {
    return !!document.fullscreenElement;
  }
}

export const antiCheatService = new AntiCheatService();
export default antiCheatService;
