import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { reportAPI, examAPI } from '../../services/api';
import {
  ClipboardDocumentListIcon,
  UserGroupIcon,
  ExclamationTriangleIcon,
  PlayCircleIcon,
  PlusIcon,
  PlayIcon,
} from '@heroicons/react/24/outline';
import clsx from 'clsx';
import toast from 'react-hot-toast';

export default function AdminDashboard() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const response = await reportAPI.getDashboard();
      return response.data.data;
    },
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => examAPI.updateStatus(id, 'active'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Exam activated! Students can now see it.');
    },
    onError: () => {
      toast.error('Failed to activate exam');
    },
  });

  const stats = [
    {
      name: 'Total Exams',
      value: data?.total_exams || 0,
      icon: ClipboardDocumentListIcon,
      color: 'bg-blue-500',
    },
    {
      name: 'Active Exams',
      value: data?.active_exams || 0,
      icon: PlayCircleIcon,
      color: 'bg-green-500',
    },
    {
      name: 'Total Sessions',
      value: data?.total_sessions || 0,
      icon: UserGroupIcon,
      color: 'bg-purple-500',
    },
    {
      name: 'Total Violations',
      value: data?.total_violations || 0,
      icon: ExclamationTriangleIcon,
      color: 'bg-red-500',
    },
  ];

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
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">Overview of your examination platform</p>
        </div>
        <Link to="/admin/exams/create" className="btn-primary">
          <PlusIcon className="w-5 h-5 mr-2" />
          Create Exam
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat) => (
          <div key={stat.name} className="card">
            <div className="flex items-center gap-4">
              <div className={clsx('p-3 rounded-lg', stat.color)}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-gray-600">{stat.name}</p>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Active Sessions */}
      {data?.active_sessions > 0 && (
        <div className="card mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Active Sessions</h2>
            <span className="badge-success">
              {data.active_sessions} Live
            </span>
          </div>
          <p className="text-gray-600">
            Students are currently taking exams. Visit the exam monitor to view real-time activity.
          </p>
        </div>
      )}

      {/* Recent Exams */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Recent Exams</h2>
          <Link to="/admin/exams" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
            View all →
          </Link>
        </div>

        {data?.recent_exams && data.recent_exams.length > 0 ? (
          <div className="space-y-4">
            {data.recent_exams.map((exam: any) => (
              <div
                key={exam.id}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div>
                  <h3 className="font-medium text-gray-900">{exam.title}</h3>
                  <p className="text-sm text-gray-500">
                    Created {new Date(exam.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
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
                  {exam.status === 'draft' && (
                    <button
                      onClick={() => activateMutation.mutate(exam.id)}
                      className="flex items-center gap-1 px-2 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                      disabled={activateMutation.isPending}
                    >
                      <PlayIcon className="w-3 h-3" />
                      Activate
                    </button>
                  )}
                  <Link
                    to={`/admin/exams/${exam.id}/edit`}
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                  >
                    Edit
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <ClipboardDocumentListIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No exams yet</p>
            <Link to="/admin/exams/create" className="text-primary-600 hover:text-primary-700 text-sm font-medium">
              Create your first exam →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
