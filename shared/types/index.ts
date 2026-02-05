// User Types
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'student';
  college_id?: string;
  department_id?: string;
  year_batch?: number;
  account_status?: 'active' | 'suspended' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface UserProfile extends User {
  avatar_url?: string;
  phone?: string;
  roll_number?: string;
  college?: College;
  department?: Department;
}

// College/Institution Types
export interface College {
  id: string;
  name: string;
  code?: string;
  address?: string;
  city?: string;
  state?: string;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

// Authentication Types
export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
  role: 'admin' | 'student';
  college_id?: string;
  college_name?: string; // For admin registration (creates new college)
  department_id?: string;
  year_batch?: number;
  roll_number?: string;
}

// Exam Types
export type QuestionType = 'mcq' | 'descriptive' | 'coding';
export type ExamMode = 'practice' | 'live_standard' | 'live_strict';
export type ExamStatus = 'draft' | 'scheduled' | 'active' | 'completed' | 'cancelled';

export interface Question {
  id: string;
  exam_id: string;
  type: QuestionType;
  text: string;
  options?: string[];
  correct_answer?: string | number;
  points: number;
  order: number;
  code_template?: string;
  code_language?: string;
  test_cases?: TestCase[];
}

export interface TestCase {
  input: string;
  expected_output: string;
  is_hidden: boolean;
}

export interface Exam {
  id: string;
  title: string;
  description?: string;
  instructions?: string;
  mode: ExamMode;
  status: ExamStatus;
  duration_minutes: number;
  total_points: number;
  passing_percentage: number;
  start_time?: string;
  end_time?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  questions?: Question[];
  shuffle_questions: boolean;
  shuffle_options: boolean;
  show_results_immediately: boolean;
  allow_review: boolean;
  max_attempts: number;
}

export interface CreateExamDTO {
  title: string;
  description?: string;
  instructions?: string;
  mode: ExamMode;
  duration_minutes: number;
  passing_percentage: number;
  start_time?: string;
  end_time?: string;
  shuffle_questions?: boolean;
  shuffle_options?: boolean;
  show_results_immediately?: boolean;
  allow_review?: boolean;
  max_attempts?: number;
}

// Exam Session Types
export type SessionStatus = 'started' | 'in_progress' | 'submitted' | 'terminated' | 'expired';

export interface ExamSession {
  id: string;
  exam_id: string;
  user_id: string;
  status: SessionStatus;
  start_time: string;
  end_time?: string;
  submit_time?: string;
  current_risk_score: number;
  highest_risk_score: number;
  total_violations: number;
  screen_blank_triggered: boolean;
  start_ip: string;
  current_ip: string;
  ip_change_count: number;
  device_fingerprint: string;
  device_changed: boolean;
  user_agent: string;
  screen_resolution: string;
  timezone: string;
}

// Answer Types
export interface Answer {
  id: string;
  session_id: string;
  question_id: string;
  answer: string | number;
  is_correct?: boolean;
  points_earned?: number;
  answered_at: string;
  time_spent_seconds: number;
}

export interface SubmitAnswerDTO {
  question_id: string;
  answer: string | number;
  time_spent_seconds: number;
}

// Suspicious Event Types
export type SuspiciousEventType =
  | 'look_away'
  | 'head_missing'
  | 'multiple_faces'
  | 'face_occlusion'
  | 'brightness_change'
  | 'tab_switch'
  | 'fullscreen_exit'
  | 'devtools_open'
  | 'copy_attempt'
  | 'paste_detected'
  | 'right_click'
  | 'print_screen'
  | 'untrusted_key_event'
  | 'bot_typing'
  | 'typing_unfocused'
  | 'device_change'
  | 'ip_change';

export interface SuspiciousEvent {
  id: string;
  session_id: string;
  event_type: SuspiciousEventType;
  points: number;
  timestamp: string;
  details?: Record<string, unknown>;
  screenshot_url?: string;
}

// Risk Score Configuration
export const RISK_POINTS: Record<SuspiciousEventType, number> = {
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

export const RISK_THRESHOLDS = {
  WARNING: 40,
  FLAG: 70,
  TERMINATE: 100,
} as const;

// Keyboard Event Types
export interface KeyboardEvent {
  id: string;
  session_id: string;
  event_type: 'paste' | 'untrusted' | 'bot_typing' | 'unfocused_typing';
  timestamp: string;
  is_trusted: boolean;
  timing_pattern?: number[];
}

// IP Log Types
export interface IPLog {
  id: string;
  session_id: string;
  ip_address: string;
  timestamp: string;
  is_vpn?: boolean;
  country?: string;
  city?: string;
}

// Real-time Monitoring Types
export interface LiveSessionData {
  session_id: string;
  user_id: string;
  user_name: string;
  exam_id: string;
  exam_title: string;
  status: SessionStatus;
  risk_score: number;
  violations_count: number;
  last_activity: string;
  current_question?: number;
  total_questions?: number;
  progress_percentage: number;
  alerts: SessionAlert[];
}

export interface SessionAlert {
  id: string;
  type: SuspiciousEventType;
  message: string;
  timestamp: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// Report Types
export interface ExamReport {
  exam_id: string;
  exam_title: string;
  total_students: number;
  completed_students: number;
  average_score: number;
  highest_score: number;
  lowest_score: number;
  pass_rate: number;
  total_violations: number;
  screen_blanks_triggered: number;
  students: StudentReport[];
}

export interface StudentReport {
  user_id: string;
  name: string;
  email: string;
  roll_number?: string;
  score: number;
  percentage: number;
  passed: boolean;
  time_taken_minutes: number;
  violations_count: number;
  highest_risk_score: number;
  screen_blank_triggered: boolean;
  start_ip: string;
  end_ip: string;
  device_changed: boolean;
  submitted_at?: string;
  status: SessionStatus;
}

// API Response Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

// Socket Events
export interface ServerToClientEvents {
  'session:update': (data: LiveSessionData) => void;
  'session:alert': (data: SessionAlert) => void;
  'session:terminated': (data: { session_id: string; reason: string }) => void;
  'exam:started': (data: { exam_id: string }) => void;
  'exam:ended': (data: { exam_id: string }) => void;
  'risk:warning': (data: { message: string; score: number }) => void;
  'risk:critical': (data: { message: string; action: 'blank' | 'terminate' }) => void;
}

export interface ClientToServerEvents {
  'session:join': (session_id: string) => void;
  'session:leave': (session_id: string) => void;
  'session:heartbeat': (data: { session_id: string; timestamp: number }) => void;
  'event:suspicious': (data: Omit<SuspiciousEvent, 'id'>) => void;
  'event:keyboard': (data: Omit<KeyboardEvent, 'id'>) => void;
  'admin:monitor': (exam_id: string) => void;
  'admin:stop-monitor': (exam_id: string) => void;
}
// Department Types
export interface Department {
  id: string;
  name: string;
  code: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Academic Batch Types
export interface AcademicBatch {
  id: string;
  year: number;
  label: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Enhanced User Profile with Batch and Department
export interface EnhancedUserProfile extends UserProfile {
  year_batch?: number;
  department_id?: string;
  department?: Department;
  account_status: 'active' | 'suspended' | 'inactive';
}

// Student Directory Types
export interface StudentListItem {
  id: string;
  name: string;
  email: string;
  roll_number?: string;
  department_code?: string;
  department_name?: string;
  year_batch?: number;
  account_status: 'active' | 'suspended' | 'inactive';
  created_at: string;
  exams_taken: number;
  last_exam_date?: string;
}

export interface StudentFilters {
  search?: string;
  department_id?: string;
  year_batch?: number;
  account_status?: 'active' | 'disabled' | 'suspended';
  page?: number;
  limit?: number;
}

export interface StudentExamHistory {
  session_id: string;
  exam_id: string;
  exam_title: string;
  mode: ExamMode;
  status: SessionStatus;
  score?: number;
  percentage?: number;
  passed?: boolean;
  start_time: string;
  submit_time?: string;
  violations_count: number;
  highest_risk_score: number;
}

// AI Processing Types
export type AIProvider = 'openai' | 'gemini';
export type AIJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface AIProcessingJob {
  id: string;
  created_by: string;
  status: AIJobStatus;
  file_name: string;
  file_type: string;
  file_url?: string;
  ai_provider?: AIProvider;
  extracted_questions?: ExtractedQuestion[];
  error_message?: string;
  processing_time_ms?: number;
  created_at: string;
  updated_at: string;
}

export type ExtractedQuestionType = 'mcq' | 'descriptive' | 'true_false' | 'short_answer';

export interface ExtractedQuestion {
  question_number?: number;
  type: ExtractedQuestionType;
  text: string;
  options?: string[];
  correct_answer?: string | number;
  marks?: number;
  confidence_score: number; // 0-1 confidence in extraction accuracy
}

export interface AIExtractionResult {
  success: boolean;
  provider: AIProvider;
  questions: ExtractedQuestion[];
  total_extracted: number;
  processing_time_ms: number;
  raw_text?: string;
}

export interface UploadFileDTO {
  file: File;
  ai_provider?: AIProvider;
}

// Enhanced Exam Types with Targeting
export interface CreateExamWithTargetsDTO extends CreateExamDTO {
  target_batch_ids?: string[];
  target_department_ids?: string[];
}

export interface ExamWithTargets extends Exam {
  target_batches?: AcademicBatch[];
  target_departments?: Department[];
}

// Student Registration with Enhanced Fields
export interface EnhancedRegisterData extends RegisterData {
  roll_number?: string;
  year_batch?: number;
  department_id?: string;
}