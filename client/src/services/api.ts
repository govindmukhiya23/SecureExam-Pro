import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid
      useAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

// API helper functions
export const authAPI = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (data: { 
    email: string; 
    password: string; 
    name: string; 
    role: string;
    college_id?: string;
    college_name?: string;
    department_id?: string;
    year_batch?: number;
    roll_number?: string;
  }) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
  // Public endpoints for registration
  getColleges: () => api.get('/auth/colleges'),
  getDepartments: () => api.get('/auth/departments'),
  getBatches: () => api.get('/auth/batches'),
};

export const examAPI = {
  list: (params?: { status?: string; mode?: string; page?: number; limit?: number }) =>
    api.get('/exams', { params }),
  get: (id: string, includeQuestions = false) =>
    api.get(`/exams/${id}`, { params: { questions: includeQuestions } }),
  create: (data: any) => api.post('/exams', data),
  update: (id: string, data: any) => api.put(`/exams/${id}`, data),
  delete: (id: string) => api.delete(`/exams/${id}`),
  updateStatus: (id: string, status: string) =>
    api.put(`/exams/${id}/status`, { status }),
  addQuestion: (examId: string, data: any) =>
    api.post(`/exams/${examId}/questions`, data),
  updateQuestion: (examId: string, questionId: string, data: any) =>
    api.put(`/exams/${examId}/questions/${questionId}`, data),
  deleteQuestion: (examId: string, questionId: string) =>
    api.delete(`/exams/${examId}/questions/${questionId}`),
};

export const sessionAPI = {
  start: (examId: string, fingerprint: any) =>
    api.post('/sessions/start', { exam_id: examId, ...fingerprint }),
  submitAnswer: (sessionId: string, questionId: string, answer: any) =>
    api.post(`/sessions/${sessionId}/answer`, { question_id: questionId, answer }),
  submit: (sessionId: string, answers: any[]) =>
    api.post(`/sessions/${sessionId}/submit`, { answers }),
  get: (sessionId: string) => api.get(`/sessions/${sessionId}`),
  getExamSessions: (examId: string) => api.get(`/sessions/exam/${examId}`),
  getMySessions: () => api.get('/sessions/my'),
  getResult: (sessionId: string) => api.get(`/sessions/${sessionId}/result`),
  terminate: (sessionId: string, reason: string) =>
    api.post(`/sessions/${sessionId}/terminate`, { reason }),
};

export const proctoringAPI = {
  logEvent: (sessionId: string, data: { eventType: string; severity: string; metadata?: any }) =>
    api.post('/proctoring/event', { session_id: sessionId, ...data }),
  logKeyboard: (sessionId: string, events: any[]) =>
    api.post('/proctoring/keyboard', { session_id: sessionId, events }),
  heartbeat: (sessionId: string) =>
    api.post('/proctoring/heartbeat', { session_id: sessionId }),
  terminate: (sessionId: string, reason: string) =>
    api.post('/proctoring/terminate', { session_id: sessionId, reason }),
  getViolations: (sessionId: string) =>
    api.get(`/proctoring/session/${sessionId}/violations`),
};

export const reportAPI = {
  getExamReport: (examId: string) => api.get(`/reports/exam/${examId}`),
  exportExcel: (examId: string) =>
    api.get(`/reports/exam/${examId}/excel`, { responseType: 'blob' }),
  getDashboard: () => api.get('/reports/dashboard'),
};
// AI Processing API
export const aiAPI = {
  getStatus: () => api.get('/ai/status'),
  extractQuestions: (formData: FormData) =>
    api.post('/ai/extract', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000 // 60 second timeout for AI processing
    }),
  getJobs: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get('/ai/jobs', { params }),
  getJob: (jobId: string) => api.get(`/ai/jobs/${jobId}`),
  createExamFromQuestions: (data: {
    title: string;
    description?: string;
    instructions?: string;
    mode: string;
    duration_minutes: number;
    passing_percentage?: number;
    questions: any[];
    target_batch_ids?: string[];
    target_department_ids?: string[];
    shuffle_questions?: boolean;
    shuffle_options?: boolean;
    show_results_immediately?: boolean;
    allow_review?: boolean;
    max_attempts?: number;
  }) => api.post('/ai/create-exam', data),
};

// Admin API
export const adminAPI = {
  // Departments
  getDepartments: (activeOnly = true) =>
    api.get('/admin/departments', { params: { active_only: activeOnly } }),
  createDepartment: (data: { name: string; code: string; description?: string }) =>
    api.post('/admin/departments', data),
  updateDepartment: (id: string, data: { name?: string; code?: string; description?: string; is_active?: boolean }) =>
    api.patch(`/admin/departments/${id}`, data),
  
  // Batches
  getBatches: (activeOnly = true) =>
    api.get('/admin/batches', { params: { active_only: activeOnly } }),
  createBatch: (data: { year: number; label?: string }) =>
    api.post('/admin/batches', data),
  updateBatch: (id: string, data: { label?: string; is_active?: boolean }) =>
    api.patch(`/admin/batches/${id}`, data),
  
  // Students
  getStudents: (params?: {
    search?: string;
    department_id?: string;
    year_batch?: number;
    account_status?: string;
    page?: number;
    limit?: number;
  }) => api.get('/admin/students', { params }),
  getStudent: (id: string) => api.get(`/admin/students/${id}`),
  updateStudentStatus: (id: string, status: 'active' | 'disabled' | 'suspended') =>
    api.patch(`/admin/students/${id}/status`, { account_status: status }),
  getStudentStats: () => api.get('/admin/students-stats'),
};