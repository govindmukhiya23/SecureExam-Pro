import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { examAPI } from '../../services/api';
import {
  PlusIcon,
  EyeIcon,
  PencilIcon,
  TrashIcon,
  PlayIcon,
  ChartBarIcon,
  ComputerDesktopIcon,
} from '@heroicons/react/24/outline';
import clsx from 'clsx';
import toast from 'react-hot-toast';

export default function ExamList() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('');

  const { data, isLoading } = useQuery({
    queryKey: ['exams', statusFilter],
    queryFn: async () => {
      const response = await examAPI.list({ status: statusFilter || undefined });
      return response.data.data;
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      examAPI.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      toast.success('Exam status updated');
    },
    onError: () => {
      toast.error('Failed to update status');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => examAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      toast.success('Exam deleted');
    },
    onError: () => {
      toast.error('Failed to delete exam');
    },
  });

  const handleDelete = (id: string, title: string) => {
    if (window.confirm(`Are you sure you want to delete "${title}"?`)) {
      deleteMutation.mutate(id);
    }
  };

  const handleActivate = (id: string) => {
    updateStatusMutation.mutate({ id, status: 'active' });
  };

  const handleComplete = (id: string) => {
    updateStatusMutation.mutate({ id, status: 'completed' });
  };

  const statusOptions = [
    { value: '', label: 'All Status' },
    { value: 'draft', label: 'Draft' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'active', label: 'Active' },
    { value: 'completed', label: 'Completed' },
  ];

  const modeLabels: Record<string, string> = {
    practice: 'Practice',
    live_standard: 'Live (Standard)',
    live_strict: 'Live (Strict)',
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Exams</h1>
          <p className="text-gray-600 mt-1">Manage your examinations</p>
        </div>
        <Link to="/admin/exams/create" className="btn-primary">
          <PlusIcon className="w-5 h-5 mr-2" />
          Create Exam
        </Link>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex items-center gap-4">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="input w-48"
          >
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Exam List */}
      {data?.exams && data.exams.length > 0 ? (
        <div className="grid gap-4">
          {data.exams.map((exam: any) => (
            <div key={exam.id} className="card-hover">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">{exam.title}</h3>
                    <span
                      className={clsx('badge', {
                        'badge-primary': exam.status === 'draft',
                        'badge-warning': exam.status === 'scheduled',
                        'badge-success': exam.status === 'active',
                        'bg-gray-100 text-gray-600': exam.status === 'completed',
                      })}
                    >
                      {exam.status}
                    </span>
                    <span className="badge bg-gray-100 text-gray-600">
                      {modeLabels[exam.mode]}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">
                    {exam.description || 'No description'}
                  </p>
                  <div className="flex items-center gap-6 text-sm text-gray-500">
                    <span>⏱️ {exam.duration_minutes} min</span>
                    <span>📝 {exam.total_points} points</span>
                    <span>✅ {exam.passing_percentage}% to pass</span>
                    <span>🔄 {exam.max_attempts} attempt(s)</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {exam.status === 'draft' && (
                    <>
                      <button
                        onClick={() => handleActivate(exam.id)}
                        className="btn-success px-3 py-1.5 text-sm"
                        title="Activate Exam"
                      >
                        <PlayIcon className="w-4 h-4 mr-1" />
                        Activate
                      </button>
                      <Link
                        to={`/admin/exams/${exam.id}/edit`}
                        className="btn-secondary px-3 py-1.5 text-sm"
                        title="Edit"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => handleDelete(exam.id, exam.title)}
                        className="btn-danger px-3 py-1.5 text-sm"
                        title="Delete"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </>
                  )}

                  {exam.status === 'active' && (
                    <>
                      <Link
                        to={`/admin/exams/${exam.id}/monitor`}
                        className="btn-primary px-3 py-1.5 text-sm"
                        title="Monitor"
                      >
                        <ComputerDesktopIcon className="w-4 h-4 mr-1" />
                        Monitor
                      </Link>
                      <button
                        onClick={() => handleComplete(exam.id)}
                        className="btn-secondary px-3 py-1.5 text-sm"
                        title="End Exam"
                      >
                        End
                      </button>
                    </>
                  )}

                  {exam.status === 'completed' && (
                    <Link
                      to={`/admin/exams/${exam.id}/report`}
                      className="btn-primary px-3 py-1.5 text-sm"
                      title="View Report"
                    >
                      <ChartBarIcon className="w-4 h-4 mr-1" />
                      Report
                    </Link>
                  )}

                  <Link
                    to={`/admin/exams/${exam.id}/edit`}
                    className="btn-secondary px-3 py-1.5 text-sm"
                    title="View Details"
                  >
                    <EyeIcon className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card text-center py-12">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <PlusIcon className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No exams yet</h3>
          <p className="text-gray-500 mb-4">Create your first exam to get started</p>
          <Link to="/admin/exams/create" className="btn-primary">
            Create Exam
          </Link>
        </div>
      )}

      {/* Pagination */}
      {data && data.total_pages > 1 && (
        <div className="mt-6 flex justify-center">
          <p className="text-sm text-gray-500">
            Page {data.page} of {data.total_pages} ({data.total} exams)
          </p>
        </div>
      )}
    </div>
  );
}
