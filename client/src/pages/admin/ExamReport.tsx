import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { reportAPI } from '../../services/api';
import {
  ArrowLeftIcon,
  ArrowDownTrayIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

export default function ExamReport() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: report, isLoading } = useQuery({
    queryKey: ['exam-report', id],
    queryFn: async () => {
      const response = await reportAPI.getExamReport(id!);
      return response.data.data;
    },
    enabled: !!id,
  });

  const exportMutation = useMutation({
    mutationFn: () => reportAPI.exportExcel(id!),
    onSuccess: (response) => {
      // Create blob and download
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `exam-report-${id}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('Report downloaded successfully');
    },
    onError: () => {
      toast.error('Failed to export report');
    },
  });

  const getRiskBadgeClass = (level: string) => {
    switch (level) {
      case 'low': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'critical': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Report not found</p>
      </div>
    );
  }

  const passRate = report.summary.totalSessions > 0
    ? Math.round((report.summary.passed / report.summary.totalSessions) * 100)
    : 0;

  return (
    <div>
      <button
        onClick={() => navigate('/admin/exams')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        Back to Exams
      </button>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{report.exam.title}</h1>
          <p className="text-gray-600">Exam Report & Analytics</p>
        </div>
        <button
          onClick={() => exportMutation.mutate()}
          disabled={exportMutation.isPending}
          className="btn btn-primary flex items-center gap-2"
        >
          <ArrowDownTrayIcon className="w-5 h-5" />
          {exportMutation.isPending ? 'Exporting...' : 'Export to Excel'}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card text-center">
          <p className="text-3xl font-bold text-primary-600">{report.summary.totalSessions}</p>
          <p className="text-sm text-gray-500">Total Attempts</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-green-600">{report.summary.passed}</p>
          <p className="text-sm text-gray-500">Passed ({passRate}%)</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-gray-900">
            {report.summary.averageScore?.toFixed(1) || '0'}
          </p>
          <p className="text-sm text-gray-500">Average Score</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold text-orange-600">{report.summary.flagged}</p>
          <p className="text-sm text-gray-500">Flagged (High+ Risk)</p>
        </div>
      </div>

      {/* Risk Distribution */}
      <div className="card mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Risk Distribution</h2>
        <div className="grid grid-cols-4 gap-4">
          {['low', 'medium', 'high', 'critical'].map((level) => {
            const count = report.sessions.filter((s: any) => s.risk_level === level).length;
            const percentage = report.summary.totalSessions > 0
              ? Math.round((count / report.summary.totalSessions) * 100)
              : 0;

            return (
              <div key={level} className="text-center">
                <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-2 ${
                  level === 'low' ? 'bg-green-100' :
                  level === 'medium' ? 'bg-yellow-100' :
                  level === 'high' ? 'bg-orange-100' :
                  'bg-red-100'
                }`}>
                  <span className={`text-xl font-bold ${
                    level === 'low' ? 'text-green-600' :
                    level === 'medium' ? 'text-yellow-600' :
                    level === 'high' ? 'text-orange-600' :
                    'text-red-600'
                  }`}>
                    {count}
                  </span>
                </div>
                <p className="text-sm font-medium text-gray-900 capitalize">{level}</p>
                <p className="text-xs text-gray-500">{percentage}%</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sessions Table */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">All Sessions</h2>

        {report.sessions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Student</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Score</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Result</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Risk</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Violations</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Started</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Duration</th>
                </tr>
              </thead>
              <tbody>
                {report.sessions.map((session: any) => {
                  const duration = session.started_at && session.completed_at
                    ? Math.round(
                        (new Date(session.completed_at).getTime() - new Date(session.started_at).getTime()) / 60000
                      )
                    : null;

                  const passed = session.score !== null && 
                    (session.score / report.exam.total_points) * 100 >= report.exam.passing_percentage;

                  return (
                    <tr key={session.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <p className="font-medium text-gray-900">{session.user_name}</p>
                        <p className="text-xs text-gray-500">{session.user_email}</p>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`badge ${
                          session.status === 'completed' ? 'badge-success' :
                          session.status === 'terminated' ? 'badge-danger' :
                          session.status === 'in_progress' ? 'badge-primary' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {session.status}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {session.score !== null ? (
                          <span className="font-medium">
                            {session.score} / {report.exam.total_points}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {session.score !== null && (
                          <span className={`inline-flex items-center gap-1 ${
                            passed ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {passed ? (
                              <>
                                <CheckCircleIcon className="w-4 h-4" />
                                Passed
                              </>
                            ) : (
                              <>
                                <XCircleIcon className="w-4 h-4" />
                                Failed
                              </>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`badge ${getRiskBadgeClass(session.risk_level)}`}>
                          {session.risk_level} ({session.risk_score})
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {session.violation_count > 0 ? (
                          <span className="inline-flex items-center gap-1 text-orange-600">
                            <ExclamationTriangleIcon className="w-4 h-4" />
                            {session.violation_count}
                          </span>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-500">
                        {new Date(session.started_at).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-500">
                        {duration !== null ? `${duration} min` : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500">No sessions found for this exam</p>
          </div>
        )}
      </div>
    </div>
  );
}
