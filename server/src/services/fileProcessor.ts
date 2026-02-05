import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
// @ts-ignore
pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/build/pdf.worker.mjs';

export interface ProcessedFile {
  text: string;
  isImage: boolean;
  imageBase64?: string;
  mimeType?: string;
  pageCount?: number;
}

/**
 * Extract text from a PDF file
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<ProcessedFile> {
  const uint8Array = new Uint8Array(buffer);
  const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise;
  
  let fullText = '';
  const numPages = pdf.numPages;

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');
    fullText += pageText + '\n\n';
  }

  return {
    text: fullText.trim(),
    isImage: false,
    pageCount: numPages
  };
}

/**
 * Extract text from a Word document (.docx)
 */
export async function extractTextFromDocx(buffer: Buffer): Promise<ProcessedFile> {
  const result = await mammoth.extractRawText({ buffer });
  
  return {
    text: result.value.trim(),
    isImage: false
  };
}

/**
 * Process an image file - return base64 for AI vision processing
 */
export async function processImageFile(
  buffer: Buffer,
  mimeType: string
): Promise<ProcessedFile> {
  const base64 = buffer.toString('base64');
  
  return {
    text: '', // No text extraction for images - AI will read directly
    isImage: true,
    imageBase64: base64,
    mimeType
  };
}

/**
 * Main file processor - determines type and extracts content
 */
export async function processUploadedFile(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<ProcessedFile> {
  const extension = path.extname(fileName).toLowerCase();

  // PDF files
  if (mimeType === 'application/pdf' || extension === '.pdf') {
    return extractTextFromPDF(buffer);
  }

  // Word documents
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    extension === '.docx'
  ) {
    return extractTextFromDocx(buffer);
  }

  // Older Word format (.doc) - attempt with mammoth
  if (mimeType === 'application/msword' || extension === '.doc') {
    try {
      return extractTextFromDocx(buffer);
    } catch (e) {
      console.error('Failed to process .doc file:', e);
      throw new Error('Unable to process .doc file. Please convert to .docx format.');
    }
  }

  // Images
  if (mimeType.startsWith('image/')) {
    return processImageFile(buffer, mimeType);
  }

  throw new Error(`Unsupported file type: ${mimeType}`);
}

/**
 * Validate file before processing
 */
export function validateFile(
  buffer: Buffer,
  mimeType: string,
  maxSizeMB: number = 10
): { valid: boolean; error?: string } {
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  if (!allowedTypes.includes(mimeType)) {
    return {
      valid: false,
      error: `Unsupported file type: ${mimeType}. Allowed types: JPG, PNG, PDF, DOC, DOCX`
    };
  }

  const sizeMB = buffer.length / (1024 * 1024);
  if (sizeMB > maxSizeMB) {
    return {
      valid: false,
      error: `File size (${sizeMB.toFixed(2)} MB) exceeds maximum allowed size (${maxSizeMB} MB)`
    };
  }

  return { valid: true };
}

/**
 * Get file type category
 */
export function getFileTypeCategory(mimeType: string): 'image' | 'pdf' | 'document' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  return 'document';
}
