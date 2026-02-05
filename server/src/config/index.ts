import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

export const config = {
  // Server
  port: parseInt(process.env.PORT || '5000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',

  // Supabase
  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceKey: process.env.SUPABASE_SERVICE_KEY || '',
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || '',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  // CORS
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  // AI Providers
  ai: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.OPENAI_MODEL || 'gpt-4o',
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || '',
      model: process.env.GEMINI_MODEL || 'gemini-1.5-pro',
    },
    preferredProvider: (process.env.AI_PREFERRED_PROVIDER || 'openai') as 'openai' | 'gemini',
    maxFileSizeMB: parseInt(process.env.AI_MAX_FILE_SIZE_MB || '10', 10),
  },

  // File Upload
  upload: {
    maxFileSizeMB: parseInt(process.env.UPLOAD_MAX_FILE_SIZE_MB || '10', 10),
    allowedMimeTypes: [
      'image/jpeg',
      'image/png',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
  },};

// Validate required environment variables
export function validateConfig(): void {
  const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'JWT_SECRET'];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Validate JWT secret strength
  if (config.jwt.secret && config.jwt.secret.length < 32) {
    console.warn('⚠️  WARNING: JWT_SECRET is less than 32 characters. This is not recommended for production.');
    if (config.isProduction) {
      throw new Error('JWT_SECRET must be at least 32 characters in production');
    }
  }

  // Validate CORS origin
  if (config.cors.origin === '*') {
    console.warn('⚠️  WARNING: CORS origin is set to "*". This is not recommended for production.');
    if (config.isProduction) {
      throw new Error('CORS_ORIGIN cannot be "*" in production');
    }
  }
}