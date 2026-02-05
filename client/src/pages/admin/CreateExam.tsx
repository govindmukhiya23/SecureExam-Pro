import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { examAPI, adminAPI } from '../../services/api';
import { ArrowLeftIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import clsx from 'clsx';

interface ExamForm {
  title: string;
  description: string;
  instructions: string;
  mode: 'practice' | 'live_standard' | 'live_strict';
  duration_minutes: number;
  passing_percentage: number;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  show_results_immediately: boolean;
  allow_review: boolean;
  max_attempts: number;
}

interface Department {
  id: string;
  name: string;
  code: string;
}

interface Batch {
  id: string;
  year: number;
  label: string;
}

interface Question {
  type: 'mcq' | 'descriptive' | 'coding';
  text: string;
  options: string[];
  correct_answer: string;
  points: number;
}

export default function CreateExam() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [examId, setExamId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);

  // Fetch departments and batches
  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: async () => {
      const response = await adminAPI.getDepartments();
      return response.data.data || [];
    },
  });

  const { data: batches = [] } = useQuery<Batch[]>({
    queryKey: ['batches'],
    queryFn: async () => {
      const response = await adminAPI.getBatches();
      return response.data.data || [];
    },
  });
  const [currentQuestion, setCurrentQuestion] = useState<Question>({
    type: 'mcq',
    text: '',
    options: ['', '', '', ''],
    correct_answer: '0',
    points: 1,
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ExamForm>({
    defaultValues: {
      mode: 'live_standard',
      duration_minutes: 60,
      passing_percentage: 40,
      shuffle_questions: false,
      shuffle_options: false,
      show_results_immediately: true,
      allow_review: false,
      max_attempts: 3,
    },
  });

  const createExamMutation = useMutation({
    mutationFn: (data: ExamForm) => examAPI.create({
      ...data,
      target_batch_ids: selectedBatches,
      target_department_ids: selectedDepartments,
    }),
    onSuccess: (response) => {
      setExamId(response.data.data.id);
      setStep(2);
      toast.success('Exam created! Now add questions.');
    },
    onError: () => {
      toast.error('Failed to create exam');
    },
  });

  const toggleBatch = (batchId: string) => {
    setSelectedBatches(prev => 
      prev.includes(batchId) 
        ? prev.filter(id => id !== batchId)
        : [...prev, batchId]
    );
  };

  const toggleDepartment = (deptId: string) => {
    setSelectedDepartments(prev => 
      prev.includes(deptId) 
        ? prev.filter(id => id !== deptId)
        : [...prev, deptId]
    );
  };

  const addQuestionMutation = useMutation({
    mutationFn: ({ examId, question }: { examId: string; question: Question }) =>
      examAPI.addQuestion(examId, question),
    onSuccess: () => {
      setQuestions([...questions, currentQuestion]);
      setCurrentQuestion({
        type: 'mcq',
        text: '',
        options: ['', '', '', ''],
        correct_answer: '0',
        points: 1,
      });
      toast.success('Question added!');
    },
    onError: () => {
      toast.error('Failed to add question');
    },
  });

  const onSubmitExam = (data: ExamForm) => {
    createExamMutation.mutate(data);
  };

  const handleAddQuestion = () => {
    if (!examId || !currentQuestion.text) {
      toast.error('Please enter question text');
      return;
    }

    if (currentQuestion.type === 'mcq') {
      const filledOptions = currentQuestion.options.filter(opt => opt.trim());
      if (filledOptions.length < 2) {
        toast.error('Please add at least 2 options');
        return;
      }
    }

    addQuestionMutation.mutate({
      examId,
      question: currentQuestion,
    });
  };

  const handleFinish = () => {
    if (questions.length === 0) {
      toast.error('Please add at least one question');
      return;
    }
    navigate('/admin/exams');
    toast.success('Exam created successfully!');
  };

  const updateOption = (index: number, value: string) => {
    const newOptions = [...currentQuestion.options];
    newOptions[index] = value;
    setCurrentQuestion({ ...currentQuestion, options: newOptions });
  };

  const addOption = () => {
    setCurrentQuestion({
      ...currentQuestion,
      options: [...currentQuestion.options, ''],
    });
  };

  const removeOption = (index: number) => {
    if (currentQuestion.options.length <= 2) return;
    const newOptions = currentQuestion.options.filter((_, i) => i !== index);
    setCurrentQuestion({ ...currentQuestion, options: newOptions });
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

      <div className="max-w-3xl">
        {/* Progress Steps */}
        <div className="flex items-center mb-8">
          <div className={clsx(
            'flex items-center justify-center w-10 h-10 rounded-full font-medium',
            step >= 1 ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-600'
          )}>
            1
          </div>
          <div className={clsx(
            'flex-1 h-1 mx-4',
            step >= 2 ? 'bg-primary-600' : 'bg-gray-200'
          )} />
          <div className={clsx(
            'flex items-center justify-center w-10 h-10 rounded-full font-medium',
            step >= 2 ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-600'
          )}>
            2
          </div>
        </div>

        {/* Step 1: Exam Details */}
        {step === 1 && (
          <div className="card">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Create New Exam</h2>

            <form onSubmit={handleSubmit(onSubmitExam)} className="space-y-6">
              <div>
                <label className="label">Exam Title *</label>
                <input
                  type="text"
                  {...register('title', { required: 'Title is required' })}
                  className={errors.title ? 'input-error' : 'input'}
                  placeholder="e.g., Mid-term Examination 2024"
                />
                {errors.title && (
                  <p className="mt-1 text-sm text-danger-600">{errors.title.message}</p>
                )}
              </div>

              <div>
                <label className="label">Description</label>
                <textarea
                  {...register('description')}
                  className="input"
                  rows={3}
                  placeholder="Brief description of the exam"
                />
              </div>

              <div>
                <label className="label">Instructions</label>
                <textarea
                  {...register('instructions')}
                  className="input"
                  rows={4}
                  placeholder="Instructions for students taking the exam"
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="label">Exam Mode *</label>
                  <select {...register('mode')} className="input">
                    <option value="practice">Practice (No lockdown)</option>
                    <option value="live_standard">Live Standard (Lockdown, no camera)</option>
                    <option value="live_strict">Live Strict (Lockdown + Camera)</option>
                  </select>
                </div>

                <div>
                  <label className="label">Duration (minutes) *</label>
                  <input
                    type="number"
                    {...register('duration_minutes', {
                      required: 'Duration is required',
                      min: { value: 1, message: 'Minimum 1 minute' },
                      max: { value: 480, message: 'Maximum 480 minutes' },
                    })}
                    className={errors.duration_minutes ? 'input-error' : 'input'}
                  />
                  {errors.duration_minutes && (
                    <p className="mt-1 text-sm text-danger-600">
                      {errors.duration_minutes.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="label">Passing Percentage</label>
                  <input
                    type="number"
                    {...register('passing_percentage', {
                      min: 0,
                      max: 100,
                    })}
                    className="input"
                  />
                </div>

                <div>
                  <label className="label">Max Attempts</label>
                  <input
                    type="number"
                    {...register('max_attempts', { min: 1 })}
                    className="input"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    {...register('shuffle_questions')}
                    className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">Shuffle questions</span>
                </label>

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    {...register('shuffle_options')}
                    className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">Shuffle options (for MCQs)</span>
                </label>

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    {...register('show_results_immediately')}
                    className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">Show results immediately after submission</span>
                </label>

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    {...register('allow_review')}
                    className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">Allow students to review answers</span>
                </label>
              </div>

              {/* Target Batches Selection */}
              <div className="border-t pt-6">
                <label className="label">Target Batches *</label>
                <p className="text-sm text-gray-500 mb-3">
                  Select which batches can access this exam. Only students from selected batches will see the exam.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {batches.map((batch) => (
                    <label 
                      key={batch.id}
                      className={clsx(
                        'flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-colors',
                        selectedBatches.includes(batch.id)
                          ? 'border-primary-600 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selectedBatches.includes(batch.id)}
                        onChange={() => toggleBatch(batch.id)}
                        className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm font-medium">{batch.label}</span>
                    </label>
                  ))}
                </div>
                {batches.length === 0 && (
                  <p className="text-sm text-amber-600">No batches configured. All students will have access.</p>
                )}
                {selectedBatches.length === 0 && batches.length > 0 && (
                  <p className="text-sm text-amber-600 mt-2">Please select at least one batch.</p>
                )}
              </div>

              {/* Target Departments Selection */}
              <div>
                <label className="label">Target Departments *</label>
                <p className="text-sm text-gray-500 mb-3">
                  Select which departments can access this exam.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {departments.map((dept) => (
                    <label 
                      key={dept.id}
                      className={clsx(
                        'flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-colors',
                        selectedDepartments.includes(dept.id)
                          ? 'border-primary-600 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selectedDepartments.includes(dept.id)}
                        onChange={() => toggleDepartment(dept.id)}
                        className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm font-medium">{dept.code}</span>
                    </label>
                  ))}
                </div>
                {departments.length === 0 && (
                  <p className="text-sm text-amber-600">No departments configured. All students will have access.</p>
                )}
                {selectedDepartments.length === 0 && departments.length > 0 && (
                  <p className="text-sm text-amber-600 mt-2">Please select at least one department.</p>
                )}
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => navigate('/admin/exams')}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createExamMutation.isPending || (batches.length > 0 && selectedBatches.length === 0) || (departments.length > 0 && selectedDepartments.length === 0)}
                  className="btn-primary"
                >
                  {createExamMutation.isPending ? 'Creating...' : 'Create & Add Questions'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Step 2: Add Questions */}
        {step === 2 && (
          <div className="space-y-6">
            {/* Added Questions Summary */}
            {questions.length > 0 && (
              <div className="card">
                <h3 className="font-semibold text-gray-900 mb-4">
                  Added Questions ({questions.length})
                </h3>
                <div className="space-y-2">
                  {questions.map((q, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="text-sm text-gray-700 truncate flex-1">
                        {i + 1}. {q.text}
                      </span>
                      <span className="text-sm text-gray-500">{q.points} pts</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add Question Form */}
            <div className="card">
              <h3 className="font-semibold text-gray-900 mb-4">Add Question</h3>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Question Type</label>
                    <select
                      value={currentQuestion.type}
                      onChange={(e) => setCurrentQuestion({
                        ...currentQuestion,
                        type: e.target.value as 'mcq' | 'descriptive' | 'coding',
                      })}
                      className="input"
                    >
                      <option value="mcq">Multiple Choice</option>
                      <option value="descriptive">Descriptive</option>
                      <option value="coding">Coding</option>
                    </select>
                  </div>

                  <div>
                    <label className="label">Points</label>
                    <input
                      type="number"
                      value={currentQuestion.points}
                      onChange={(e) => setCurrentQuestion({
                        ...currentQuestion,
                        points: parseInt(e.target.value) || 1,
                      })}
                      className="input"
                      min={1}
                    />
                  </div>
                </div>

                <div>
                  <label className="label">Question Text *</label>
                  <textarea
                    value={currentQuestion.text}
                    onChange={(e) => setCurrentQuestion({
                      ...currentQuestion,
                      text: e.target.value,
                    })}
                    className="input"
                    rows={3}
                    placeholder="Enter your question here"
                  />
                </div>

                {currentQuestion.type === 'mcq' && (
                  <div>
                    <label className="label">Options</label>
                    <div className="space-y-2">
                      {currentQuestion.options.map((option, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="correct_answer"
                            checked={currentQuestion.correct_answer === String(index)}
                            onChange={() => setCurrentQuestion({
                              ...currentQuestion,
                              correct_answer: String(index),
                            })}
                            className="w-4 h-4 text-primary-600"
                          />
                          <input
                            type="text"
                            value={option}
                            onChange={(e) => updateOption(index, e.target.value)}
                            className="input flex-1"
                            placeholder={`Option ${index + 1}`}
                          />
                          {currentQuestion.options.length > 2 && (
                            <button
                              type="button"
                              onClick={() => removeOption(index)}
                              className="p-2 text-gray-400 hover:text-danger-600"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={addOption}
                      className="mt-2 text-sm text-primary-600 hover:text-primary-700"
                    >
                      + Add Option
                    </button>
                    <p className="mt-1 text-xs text-gray-500">
                      Select the radio button to mark correct answer
                    </p>
                  </div>
                )}

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleAddQuestion}
                    disabled={addQuestionMutation.isPending}
                    className="btn-secondary"
                  >
                    <PlusIcon className="w-4 h-4 mr-1" />
                    {addQuestionMutation.isPending ? 'Adding...' : 'Add Question'}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={handleFinish}
                className="btn-primary"
              >
                Finish & Save Exam
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
