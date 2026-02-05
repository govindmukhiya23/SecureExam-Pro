import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // Sanitize error messages in production
  if (config.isProduction && statusCode === 500) {
    message = 'An internal server error occurred. Please try again later.';
  }

  console.error(`[ERROR] ${statusCode} - ${err.message}`, {
    path: req.path,
    method: req.method,
    stack: err.stack,
    timestamp: new Date().toISOString(),
  });

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(config.nodeEnv === 'development' && { stack: err.stack }),
    timestamp: new Date().toISOString(),
  });
};

export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.path} not found`,
  });
};

export const createError = (message: string, statusCode: number): AppError => {
  const error: AppError = new Error(message);
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
};
