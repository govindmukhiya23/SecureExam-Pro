import { create } from 'zustand';

interface ExamSession {
  id: string;
  examId: string;
  startTime: Date;
  duration: number;
  currentQuestionIndex: number;
  answers: Record<string, string | number>;
  riskScore: number;
  violations: string[];
  isFullscreen: boolean;
  isBlocked: boolean;
  blockReason?: string;
}

interface ExamStore {
  session: ExamSession | null;
  timeRemaining: number;
  isSubmitting: boolean;
  
  // Actions
  startSession: (data: Omit<ExamSession, 'answers' | 'violations' | 'riskScore' | 'isFullscreen' | 'isBlocked'>) => void;
  setAnswer: (questionId: string, answer: string | number) => void;
  setCurrentQuestion: (index: number) => void;
  updateRiskScore: (score: number) => void;
  addViolation: (violation: string) => void;
  setTimeRemaining: (time: number) => void;
  setFullscreen: (isFullscreen: boolean) => void;
  blockExam: (reason: string) => void;
  clearSession: () => void;
  setSubmitting: (isSubmitting: boolean) => void;
}

export const useExamStore = create<ExamStore>((set, get) => ({
  session: null,
  timeRemaining: 0,
  isSubmitting: false,

  startSession: (data) => {
    set({
      session: {
        ...data,
        answers: {},
        violations: [],
        riskScore: 0,
        isFullscreen: false,
        isBlocked: false,
      },
      timeRemaining: data.duration * 60,
    });
  },

  setAnswer: (questionId, answer) => {
    const { session } = get();
    if (!session) return;

    set({
      session: {
        ...session,
        answers: {
          ...session.answers,
          [questionId]: answer,
        },
      },
    });
  },

  setCurrentQuestion: (index) => {
    const { session } = get();
    if (!session) return;

    set({
      session: {
        ...session,
        currentQuestionIndex: index,
      },
    });
  },

  updateRiskScore: (score) => {
    const { session } = get();
    if (!session) return;

    set({
      session: {
        ...session,
        riskScore: score,
      },
    });
  },

  addViolation: (violation) => {
    const { session } = get();
    if (!session) return;

    set({
      session: {
        ...session,
        violations: [...session.violations, violation],
      },
    });
  },

  setTimeRemaining: (time) => {
    set({ timeRemaining: time });
  },

  setFullscreen: (isFullscreen) => {
    const { session } = get();
    if (!session) return;

    set({
      session: {
        ...session,
        isFullscreen,
      },
    });
  },

  blockExam: (reason) => {
    const { session } = get();
    if (!session) return;

    set({
      session: {
        ...session,
        isBlocked: true,
        blockReason: reason,
      },
    });
  },

  clearSession: () => {
    set({
      session: null,
      timeRemaining: 0,
      isSubmitting: false,
    });
  },

  setSubmitting: (isSubmitting) => {
    set({ isSubmitting });
  },
}));
