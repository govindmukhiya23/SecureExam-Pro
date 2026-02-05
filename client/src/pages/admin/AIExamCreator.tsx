import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import { aiAPI, adminAPI } from '../../services/api';
import {
  ArrowLeftIcon,
  DocumentArrowUpIcon,
  SparklesIcon,
  CheckCircleIcon,
  PencilIcon,
  TrashIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import clsx from 'clsx';

interface ExtractedQuestion {
  question_number?: number;
  type: 'mcq' | 'descriptive' | 'true_false' | 'short_answer';
  text: string;
  options?: string[];
  correct_answer?: string | number;
  marks?: number;
  confidence_score: number;
}

interface ExamFormData {
  title: string;
  description: string;
  instructions: string;
  mode: 'practice' | 'live_standard' | 'live_strict';
  duration_minutes: number;
  passing_percentage: number;
  target_batch_ids: string[];
  target_department_ids: string[];
  shuffle_questions: boolean;
  shuffle_options: boolean;
  show_results_immediately: boolean;
  allow_review: boolean;
  max_attempts: number;
}

export default function AIExamCreator() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'upload' | 'review' | 'configure' | 'success'>('upload');
  const [extractedQuestions, setExtractedQuestions] = useState<ExtractedQuestion[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [processingTime, setProcessingTime] = useState<number>(0);
  const [provider, setProvider] = useState<string>('');

  const [examForm, setExamForm] = useState<ExamFormData>({
    title: '',
    description: '',
    instructions: '',
    mode: 'live_standard',
    duration_minutes: 60,
    passing_percentage: 40,
    target_batch_ids: [],
    target_department_ids: [],
    shuffle_questions: false,
    shuffle_options: false,
    show_results_immediately: true,
    allow_review: false,
    max_attempts: 1,
  });

  // Fetch AI status
  const { data: aiStatus } = useQuery({
    queryKey: ['ai-status'],
    queryFn: async () => {
      const response = await aiAPI.getStatus();
      return response.data.data;
    },
  });

  // Fetch departments and batches
  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const response = await adminAPI.getDepartments();
      return response.data.data;
    },
  });

  const { data: batches } = useQuery({
    queryKey: ['batches'],
    queryFn: async () => {
      const response = await adminAPI.getBatches();
      return response.data.data;
    },
  });

  // File upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return aiAPI.extractQuestions(formData);
    },
    onSuccess: (response) => {
      const data = response.data.data;
      setExtractedQuestions(data.questions);
      setProcessingTime(data.processing_time_ms);
      setProvider(data.provider);
      setStep('review');
      toast.success(`Extracted ${data.total_extracted} questions in ${(data.processing_time_ms / 1000).toFixed(1)}s`);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to process file');
    },
  });

  // Create exam mutation
  const createExamMutation = useMutation({
    mutationFn: async () => {
      const questions = extractedQuestions.map((q) => ({
        ...q,
        marks: q.marks || 1,
      }));
      return aiAPI.createExamFromQuestions({
        ...examForm,
        questions,
      });
    },
    onSuccess: () => {
      setStep('success');
      toast.success('Exam created successfully!');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to create exam');
    },
  });

  // Dropzone setup
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      uploadMutation.mutate(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    },
    maxSize: (aiStatus?.max_file_size_mb || 10) * 1024 * 1024,
    multiple: false,
    disabled: uploadMutation.isPending,
  });

  // Question editing
  const updateQuestion = (index: number, updates: Partial<ExtractedQuestion>) => {
    setExtractedQuestions((prev) =>
      prev.map((q, i) => (i === index ? { ...q, ...updates } : q))
    );
  };

  const deleteQuestion = (index: number) => {
    setExtractedQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const getQuestionTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      mcq: 'Multiple Choice',
      descriptive: 'Descriptive',
      true_false: 'True/False',
      short_answer: 'Short Answer',
    };
    return labels[type] || type;
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600';
    if (score >= 0.5) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div>
      <button
        onClick={() => navigate('/admin/exams')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        Back to Exams
      </button>

      <div className="max-w-4xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-primary-100 rounded-lg">
            <SparklesIcon className="w-6 h-6 text-primary-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Exam Creator</h1>
            <p className="text-gray-600">Upload a question paper and let AI extract the questions</p>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center mb-8">
          {['upload', 'review', 'configure', 'success'].map((s, i) => (
            <div key={s} className="flex items-center">
              <div
                className={clsx(
                  'flex items-center justify-center w-10 h-10 rounded-full font-medium',
                  step === s || ['upload', 'review', 'configure', 'success'].indexOf(step) > i
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-200 text-gray-600'
                )}
              >
                {i + 1}
              </div>
              {i < 3 && (
                <div
                  className={clsx(
                    'w-16 h-1 mx-2',
                    ['upload', 'review', 'configure', 'success'].indexOf(step) > i
                      ? 'bg-primary-600'
                      : 'bg-gray-200'
                  )}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div className="card">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">
              Upload Question Paper
            </h2>

            {!aiStatus?.configured && (
              <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
                <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600 mt-0.5" />
                <div>
                  <p className="text-yellow-800 font-medium">AI Services Not Configured</p>
                  <p className="text-yellow-700 text-sm">
                    Please add OpenAI or Gemini API keys in the server configuration.
                  </p>
                </div>
              </div>
            )}

            <div
              {...getRootProps()}
              className={clsx(
                'border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors',
                isDragActive
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-300 hover:border-primary-400',
                uploadMutation.isPending && 'opacity-50 cursor-not-allowed'
              )}
            >
              <input {...getInputProps()} />
              
              {uploadMutation.isPending ? (
                <div className="flex flex-col items-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mb-4"></div>
                  <p className="text-gray-600">Processing with AI...</p>
                  <p className="text-sm text-gray-500">This may take up to 30 seconds</p>
                </div>
              ) : (
                <>
                  <DocumentArrowUpIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-2">
                    {isDragActive
                      ? 'Drop the file here...'
                      : 'Drag and drop a question paper, or click to browse'}
                  </p>
                  <p className="text-sm text-gray-500">
                    Supported formats: JPG, PNG, PDF, DOC, DOCX (max {aiStatus?.max_file_size_mb || 10}MB)
                  </p>
                </>
              )}
            </div>

            {aiStatus?.available_providers && (
              <p className="mt-4 text-sm text-gray-500">
                AI Providers: {aiStatus.available_providers.join(', ')}
              </p>
            )}
          </div>
        )}

        {/* Step 2: Review Questions */}
        {step === 'review' && (
          <div className="space-y-6">
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">
                  Review Extracted Questions ({extractedQuestions.length})
                </h2>
                <div className="text-sm text-gray-500">
                  Processed in {(processingTime / 1000).toFixed(1)}s using {provider}
                </div>
              </div>

              <p className="text-gray-600 mb-6">
                Review and edit the extracted questions before creating the exam.
              </p>

              <div className="space-y-4">
                {extractedQuestions.map((question, index) => (
                  <div
                    key={index}
                    className="border border-gray-200 rounded-lg p-4 hover:border-primary-300 transition-colors"
                  >
                    {editingIndex === index ? (
                      // Edit mode
                      <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="label">Type</label>
                            <select
                              value={question.type}
                              onChange={(e) =>
                                updateQuestion(index, {
                                  type: e.target.value as ExtractedQuestion['type'],
                                })
                              }
                              className="input"
                            >
                              <option value="mcq">Multiple Choice</option>
                              <option value="descriptive">Descriptive</option>
                              <option value="true_false">True/False</option>
                              <option value="short_answer">Short Answer</option>
                            </select>
                          </div>
                          <div>
                            <label className="label">Marks</label>
                            <input
                              type="number"
                              value={question.marks || 1}
                              onChange={(e) =>
                                updateQuestion(index, { marks: parseInt(e.target.value) || 1 })
                              }
                              className="input"
                              min={1}
                            />
                          </div>
                        </div>

                        <div>
                          <label className="label">Question Text</label>
                          <textarea
                            value={question.text}
                            onChange={(e) => updateQuestion(index, { text: e.target.value })}
                            className="input"
                            rows={3}
                          />
                        </div>

                        {(question.type === 'mcq' || question.type === 'true_false') && (
                          <div>
                            <label className="label">Options</label>
                            <div className="space-y-2">
                              {question.options?.map((option, optIndex) => (
                                <div key={optIndex} className="flex items-center gap-2">
                                  <input
                                    type="radio"
                                    checked={question.correct_answer === optIndex}
                                    onChange={() =>
                                      updateQuestion(index, { correct_answer: optIndex })
                                    }
                                    className="w-4 h-4 text-primary-600"
                                  />
                                  <input
                                    type="text"
                                    value={option}
                                    onChange={(e) => {
                                      const newOptions = [...(question.options || [])];
                                      newOptions[optIndex] = e.target.value;
                                      updateQuestion(index, { options: newOptions });
                                    }}
                                    className="input flex-1"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setEditingIndex(null)}
                            className="btn-primary"
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    ) : (
                      // View mode
                      <div>
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-gray-500">
                              Q{question.question_number || index + 1}
                            </span>
                            <span className="px-2 py-0.5 bg-gray-100 rounded text-xs font-medium text-gray-600">
                              {getQuestionTypeLabel(question.type)}
                            </span>
                            <span className="text-xs text-gray-500">
                              {question.marks || 1} marks
                            </span>
                            <span
                              className={clsx(
                                'text-xs',
                                getConfidenceColor(question.confidence_score)
                              )}
                            >
                              {Math.round(question.confidence_score * 100)}% confidence
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setEditingIndex(index)}
                              className="p-1 text-gray-400 hover:text-primary-600"
                            >
                              <PencilIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteQuestion(index)}
                              className="p-1 text-gray-400 hover:text-red-600"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <p className="text-gray-800">{question.text}</p>
                        {question.options && question.options.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {question.options.map((opt, i) => (
                              <div
                                key={i}
                                className={clsx(
                                  'text-sm pl-4',
                                  question.correct_answer === i
                                    ? 'text-green-600 font-medium'
                                    : 'text-gray-600'
                                )}
                              >
                                {String.fromCharCode(65 + i)}. {opt}
                                {question.correct_answer === i && ' ✓'}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between">
              <button onClick={() => setStep('upload')} className="btn-secondary">
                Upload Different File
              </button>
              <button
                onClick={() => setStep('configure')}
                disabled={extractedQuestions.length === 0}
                className="btn-primary"
              >
                Continue to Configure
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Configure Exam */}
        {step === 'configure' && (
          <div className="space-y-6">
            <div className="card">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">
                Configure Exam Settings
              </h2>

              <div className="space-y-6">
                <div>
                  <label className="label">Exam Title *</label>
                  <input
                    type="text"
                    value={examForm.title}
                    onChange={(e) => setExamForm({ ...examForm, title: e.target.value })}
                    className="input"
                    placeholder="e.g., Mid-term Examination 2024"
                  />
                </div>

                <div>
                  <label className="label">Description</label>
                  <textarea
                    value={examForm.description}
                    onChange={(e) => setExamForm({ ...examForm, description: e.target.value })}
                    className="input"
                    rows={2}
                    placeholder="Brief description of the exam"
                  />
                </div>

                <div>
                  <label className="label">Instructions</label>
                  <textarea
                    value={examForm.instructions}
                    onChange={(e) => setExamForm({ ...examForm, instructions: e.target.value })}
                    className="input"
                    rows={3}
                    placeholder="Instructions for students"
                  />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="label">Exam Mode *</label>
                    <select
                      value={examForm.mode}
                      onChange={(e) =>
                        setExamForm({
                          ...examForm,
                          mode: e.target.value as ExamFormData['mode'],
                        })
                      }
                      className="input"
                    >
                      <option value="practice">Practice (No lockdown)</option>
                      <option value="live_standard">Live Standard (Lockdown, no camera)</option>
                      <option value="live_strict">Live Strict (Lockdown + Camera)</option>
                    </select>
                  </div>

                  <div>
                    <label className="label">Duration (minutes) *</label>
                    <input
                      type="number"
                      value={examForm.duration_minutes}
                      onChange={(e) =>
                        setExamForm({
                          ...examForm,
                          duration_minutes: parseInt(e.target.value) || 60,
                        })
                      }
                      className="input"
                      min={1}
                      max={480}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="label">Passing Percentage</label>
                    <input
                      type="number"
                      value={examForm.passing_percentage}
                      onChange={(e) =>
                        setExamForm({
                          ...examForm,
                          passing_percentage: parseInt(e.target.value) || 40,
                        })
                      }
                      className="input"
                      min={0}
                      max={100}
                    />
                  </div>

                  <div>
                    <label className="label">Max Attempts</label>
                    <input
                      type="number"
                      value={examForm.max_attempts}
                      onChange={(e) =>
                        setExamForm({
                          ...examForm,
                          max_attempts: parseInt(e.target.value) || 1,
                        })
                      }
                      className="input"
                      min={1}
                    />
                  </div>
                </div>

                {/* Target Batches */}
                <div>
                  <label className="label">Target Batches (Optional)</label>
                  <p className="text-sm text-gray-500 mb-2">
                    Select which year batches can access this exam. Leave empty for all.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {batches?.map((batch: any) => (
                      <label
                        key={batch.id}
                        className={clsx(
                          'px-3 py-2 rounded-lg border cursor-pointer transition-colors',
                          examForm.target_batch_ids.includes(batch.id)
                            ? 'bg-primary-100 border-primary-500 text-primary-700'
                            : 'bg-gray-50 border-gray-200 text-gray-700 hover:border-primary-300'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={examForm.target_batch_ids.includes(batch.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setExamForm({
                                ...examForm,
                                target_batch_ids: [...examForm.target_batch_ids, batch.id],
                              });
                            } else {
                              setExamForm({
                                ...examForm,
                                target_batch_ids: examForm.target_batch_ids.filter(
                                  (id) => id !== batch.id
                                ),
                              });
                            }
                          }}
                          className="sr-only"
                        />
                        {batch.label}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Target Departments */}
                <div>
                  <label className="label">Target Departments (Optional)</label>
                  <p className="text-sm text-gray-500 mb-2">
                    Select which departments can access this exam. Leave empty for all.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {departments?.map((dept: any) => (
                      <label
                        key={dept.id}
                        className={clsx(
                          'px-3 py-2 rounded-lg border cursor-pointer transition-colors',
                          examForm.target_department_ids.includes(dept.id)
                            ? 'bg-primary-100 border-primary-500 text-primary-700'
                            : 'bg-gray-50 border-gray-200 text-gray-700 hover:border-primary-300'
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={examForm.target_department_ids.includes(dept.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setExamForm({
                                ...examForm,
                                target_department_ids: [
                                  ...examForm.target_department_ids,
                                  dept.id,
                                ],
                              });
                            } else {
                              setExamForm({
                                ...examForm,
                                target_department_ids: examForm.target_department_ids.filter(
                                  (id) => id !== dept.id
                                ),
                              });
                            }
                          }}
                          className="sr-only"
                        />
                        {dept.code}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Options */}
                <div className="space-y-3">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={examForm.shuffle_questions}
                      onChange={(e) =>
                        setExamForm({ ...examForm, shuffle_questions: e.target.checked })
                      }
                      className="w-4 h-4 rounded border-gray-300 text-primary-600"
                    />
                    <span className="text-sm text-gray-700">Shuffle questions</span>
                  </label>

                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={examForm.shuffle_options}
                      onChange={(e) =>
                        setExamForm({ ...examForm, shuffle_options: e.target.checked })
                      }
                      className="w-4 h-4 rounded border-gray-300 text-primary-600"
                    />
                    <span className="text-sm text-gray-700">Shuffle options (for MCQs)</span>
                  </label>

                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={examForm.show_results_immediately}
                      onChange={(e) =>
                        setExamForm({ ...examForm, show_results_immediately: e.target.checked })
                      }
                      className="w-4 h-4 rounded border-gray-300 text-primary-600"
                    />
                    <span className="text-sm text-gray-700">
                      Show results immediately after submission
                    </span>
                  </label>

                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={examForm.allow_review}
                      onChange={(e) =>
                        setExamForm({ ...examForm, allow_review: e.target.checked })
                      }
                      className="w-4 h-4 rounded border-gray-300 text-primary-600"
                    />
                    <span className="text-sm text-gray-700">Allow students to review answers</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <button onClick={() => setStep('review')} className="btn-secondary">
                Back to Review
              </button>
              <button
                onClick={() => createExamMutation.mutate()}
                disabled={!examForm.title || createExamMutation.isPending}
                className="btn-primary"
              >
                {createExamMutation.isPending ? 'Creating...' : 'Create Exam'}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Success */}
        {step === 'success' && (
          <div className="card text-center py-12">
            <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Exam Created Successfully!</h2>
            <p className="text-gray-600 mb-6">
              Your exam with {extractedQuestions.length} questions has been created.
            </p>
            <div className="flex justify-center gap-4">
              <button onClick={() => navigate('/admin/exams')} className="btn-secondary">
                View All Exams
              </button>
              <button
                onClick={() => {
                  setStep('upload');
                  setExtractedQuestions([]);
                  setExamForm({
                    title: '',
                    description: '',
                    instructions: '',
                    mode: 'live_standard',
                    duration_minutes: 60,
                    passing_percentage: 40,
                    target_batch_ids: [],
                    target_department_ids: [],
                    shuffle_questions: false,
                    shuffle_options: false,
                    show_results_immediately: true,
                    allow_review: false,
                    max_attempts: 1,
                  });
                }}
                className="btn-primary"
              >
                Create Another Exam
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
