import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { examAPI, adminAPI } from '../../services/api';
import { ArrowLeftIcon, PencilIcon, CheckIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import clsx from 'clsx';

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

export default function EditExam() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isEditingTargets, setIsEditingTargets] = useState(false);
  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ['exam', id],
    queryFn: async () => {
      const response = await examAPI.get(id!, true);
      return response.data.data;
    },
    enabled: !!id,
  });

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

  // Initialize selected batches and departments when data loads
  useEffect(() => {
    if (data) {
      setSelectedBatches(data.target_batch_ids || []);
      setSelectedDepartments(data.target_department_ids || []);
    }
  }, [data]);

  const updateTargetsMutation = useMutation({
    mutationFn: () => examAPI.update(id!, {
      target_batch_ids: selectedBatches,
      target_department_ids: selectedDepartments,
    }),
    onSuccess: () => {
      toast.success('Target batches and departments updated!');
      setIsEditingTargets(false);
      queryClient.invalidateQueries({ queryKey: ['exam', id] });
    },
    onError: () => {
      toast.error('Failed to update targets');
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Exam not found</p>
      </div>
    );
  }

  const modeLabels: Record<string, string> = {
    practice: 'Practice',
    live_standard: 'Live (Standard)',
    live_strict: 'Live (Strict + Camera)',
  };

  // Get labels for selected batches and departments
  const selectedBatchLabels = batches.filter(b => selectedBatches.includes(b.id)).map(b => b.label);
  const selectedDeptLabels = departments.filter(d => selectedDepartments.includes(d.id)).map(d => d.code);

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
        <div className="card mb-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{data.title}</h1>
              <p className="text-gray-600 mt-1">{data.description || 'No description'}</p>
            </div>
            <span className={`badge ${
              data.status === 'draft' ? 'badge-primary' :
              data.status === 'active' ? 'badge-success' :
              'bg-gray-100 text-gray-600'
            }`}>
              {data.status}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">Mode</p>
              <p className="font-semibold">{modeLabels[data.mode]}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">Duration</p>
              <p className="font-semibold">{data.duration_minutes} minutes</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">Total Points</p>
              <p className="font-semibold">{data.total_points}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">Passing %</p>
              <p className="font-semibold">{data.passing_percentage}%</p>
            </div>
          </div>

          {data.instructions && (
            <div className="mt-6">
              <h3 className="font-semibold text-gray-900 mb-2">Instructions</h3>
              <p className="text-gray-600 whitespace-pre-wrap">{data.instructions}</p>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-4 text-sm">
            {data.shuffle_questions && (
              <span className="badge bg-blue-100 text-blue-600">Shuffle Questions</span>
            )}
            {data.shuffle_options && (
              <span className="badge bg-blue-100 text-blue-600">Shuffle Options</span>
            )}
            {data.show_results_immediately && (
              <span className="badge bg-green-100 text-green-600">Show Results</span>
            )}
            {data.allow_review && (
              <span className="badge bg-purple-100 text-purple-600">Allow Review</span>
            )}
          </div>
        </div>

        {/* Target Batches and Departments */}
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Target Students</h2>
            {data.status === 'draft' && !isEditingTargets && (
              <button
                onClick={() => setIsEditingTargets(true)}
                className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
              >
                <PencilIcon className="w-4 h-4" />
                Edit
              </button>
            )}
            {isEditingTargets && (
              <button
                onClick={() => updateTargetsMutation.mutate()}
                disabled={updateTargetsMutation.isPending}
                className="flex items-center gap-1 text-sm btn-primary py-1 px-3"
              >
                <CheckIcon className="w-4 h-4" />
                {updateTargetsMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
            )}
          </div>

          {!isEditingTargets ? (
            // View mode
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-500 mb-2">Target Batches</p>
                <div className="flex flex-wrap gap-2">
                  {selectedBatchLabels.length > 0 ? (
                    selectedBatchLabels.map(label => (
                      <span key={label} className="badge bg-blue-100 text-blue-800">{label}</span>
                    ))
                  ) : (
                    <span className="text-sm text-gray-400">All batches (no restriction)</span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-2">Target Departments</p>
                <div className="flex flex-wrap gap-2">
                  {selectedDeptLabels.length > 0 ? (
                    selectedDeptLabels.map(code => (
                      <span key={code} className="badge bg-green-100 text-green-800">{code}</span>
                    ))
                  ) : (
                    <span className="text-sm text-gray-400">All departments (no restriction)</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            // Edit mode
            <div className="space-y-6">
              <div>
                <label className="label">Target Batches</label>
                <p className="text-sm text-gray-500 mb-3">
                  Select which batches can access this exam.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
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
              </div>

              <div>
                <label className="label">Target Departments</label>
                <p className="text-sm text-gray-500 mb-3">
                  Select which departments can access this exam.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
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
              </div>

              <button
                onClick={() => {
                  setSelectedBatches(data.target_batch_ids || []);
                  setSelectedDepartments(data.target_department_ids || []);
                  setIsEditingTargets(false);
                }}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Questions */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Questions ({data.questions?.length || 0})
          </h2>

          {data.questions && data.questions.length > 0 ? (
            <div className="space-y-4">
              {data.questions.map((question: any, index: number) => (
                <div key={question.id} className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-sm font-medium text-gray-500">
                      Question {index + 1} • {question.type.toUpperCase()}
                    </span>
                    <span className="text-sm text-gray-500">{question.points} pts</span>
                  </div>
                  <p className="text-gray-900 mb-3">{question.text}</p>

                  {question.type === 'mcq' && question.options && (
                    <div className="space-y-1">
                      {question.options.map((option: string, optIndex: number) => (
                        <div
                          key={optIndex}
                          className={`flex items-center gap-2 p-2 rounded ${
                            String(optIndex) === String(question.correct_answer)
                              ? 'bg-green-100 text-green-800'
                              : 'bg-white'
                          }`}
                        >
                          <span className="w-5 h-5 flex items-center justify-center text-xs font-medium rounded-full bg-gray-200">
                            {String.fromCharCode(65 + optIndex)}
                          </span>
                          <span>{option}</span>
                          {String(optIndex) === String(question.correct_answer) && (
                            <span className="text-xs font-medium">(Correct)</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">No questions added yet</p>
          )}
        </div>
      </div>
    </div>
  );
}
