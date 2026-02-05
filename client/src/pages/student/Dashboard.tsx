import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { examAPI, sessionAPI } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import {
  AcademicCapIcon,
  ClockIcon,
  CheckCircleIcon,
  PlayIcon,
} from '@heroicons/react/24/outline';

interface SessionData {
  id: string;
  status: string;
  score: number | null;
  exam_id: string;
  exam_title?: string;
  start_time: string;
}

export default function StudentDashboard() {
  const { user } = useAuthStore();

  const { data: exams } = useQuery({
    queryKey: ['available-exams'],
    queryFn: async () => {
      const response = await examAPI.list({ status: 'active' });
      return response.data.data?.exams || [];
    },
  });

  const { data: mySessions } = useQuery({
    queryKey: ['my-sessions'],
    queryFn: async () => {
      const response = await sessionAPI.getMySessions();
      return response.data.data as SessionData[];
    },
  });

  const completedCount = mySessions?.filter((s: SessionData) => s.status === 'completed' || s.status === 'submitted').length || 0;
  const inProgressCount = mySessions?.filter((s: SessionData) => s.status === 'in_progress').length || 0;
  const averageScore = mySessions && mySessions.length > 0
    ? mySessions
        .filter((s: SessionData) => s.score !== null)
        .reduce((acc: number, s: SessionData) => acc + (s.score || 0), 0) / 
        (mySessions.filter((s: SessionData) => s.score !== null).length || 1)
    : 0;

  const recentSessions = mySessions?.slice(0, 5) || [];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Welcome back, {user?.name}!</h1>
        <p className="text-gray-600">Here's your exam dashboard</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="card">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-primary-100">
              <AcademicCapIcon className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{exams?.length || 0}</p>
              <p className="text-sm text-gray-500">Available Exams</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-blue-100">
              <PlayIcon className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{inProgressCount}</p>
              <p className="text-sm text-gray-500">In Progress</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-green-100">
              <CheckCircleIcon className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{completedCount}</p>
              <p className="text-sm text-gray-500">Completed</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-lg bg-purple-100">
              <ClockIcon className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{averageScore.toFixed(1)}</p>
              <p className="text-sm text-gray-500">Avg Score</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Available Exams */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Available Exams</h2>
            <Link to="/student/exams" className="text-primary-600 hover:text-primary-700 text-sm">
              View All
            </Link>
          </div>

          {exams && exams.length > 0 ? (
            <div className="space-y-3">
              {exams.slice(0, 5).map((exam: any) => (
                <div
                  key={exam.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-900">{exam.title}</p>
                    <p className="text-sm text-gray-500">
                      {exam.duration_minutes} min • {exam.total_points} points
                    </p>
                  </div>
                  <Link
                    to={`/student/exam/${exam.id}`}
                    className="btn btn-primary btn-sm"
                  >
                    Start
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <AcademicCapIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500">No exams available</p>
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>

          {recentSessions.length > 0 ? (
            <div className="space-y-3">
              {recentSessions.map((session: any) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-900">{session.exam_title}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(session.started_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`badge ${
                      session.status === 'completed' ? 'badge-success' :
                      session.status === 'in_progress' ? 'badge-primary' :
                      'badge-danger'
                    }`}>
                      {session.status}
                    </span>
                    {session.score !== null && (
                      <p className="text-sm font-medium text-gray-900 mt-1">
                        Score: {session.score}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <ClockIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500">No recent activity</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
