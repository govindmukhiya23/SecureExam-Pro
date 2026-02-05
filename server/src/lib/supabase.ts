import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';

// Check if Supabase is configured
const isSupabaseConfigured = config.supabase.url && 
  config.supabase.url !== 'your_supabase_project_url' &&
  config.supabase.anonKey &&
  config.supabase.anonKey !== 'your_supabase_anon_key';

let supabaseAdmin: SupabaseClient;
let supabase: SupabaseClient;

if (isSupabaseConfigured) {
  // Create Supabase client with service role key for admin operations
  supabaseAdmin = createClient(
    config.supabase.url,
    config.supabase.serviceKey || config.supabase.anonKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

  // Create Supabase client with anon key for regular operations
  supabase = createClient(
    config.supabase.url,
    config.supabase.anonKey
  );
} else {
  console.warn('⚠️  Supabase not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY in .env file.');
  console.warn('⚠️  Running in demo mode with mock data.');
  
  // Create a mock client that will throw helpful errors
  const mockHandler = {
    get: (_target: any, prop: string) => {
      if (prop === 'from') {
        return () => ({
          select: () => Promise.resolve({ data: [], error: null }),
          insert: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }),
          update: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }),
          delete: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }),
        });
      }
      return () => {};
    },
  };
  
  supabaseAdmin = new Proxy({}, mockHandler) as SupabaseClient;
  supabase = new Proxy({}, mockHandler) as SupabaseClient;
}

export { supabaseAdmin, supabase };

// Database table names
export const TABLES = {
  USERS: 'users',
  EXAMS: 'exams',
  QUESTIONS: 'questions',
  EXAM_SESSIONS: 'exam_sessions',
  ANSWERS: 'answers',
  SUSPICIOUS_EVENTS: 'suspicious_events',
  KEYBOARD_EVENTS: 'keyboard_events',
  IP_LOGS: 'ip_logs',
} as const;
