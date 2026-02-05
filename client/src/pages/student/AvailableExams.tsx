import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { examAPI, sessionAPI } from '../../services/api';
import {
  AcademicCapIcon,
  ClockIcon,
  VideoCameraIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';

export default function AvailableExams() {
  const { data: exams, isLoading } = useQuery({
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
      return response.data.data;
    },
  });

  const getSessionForExam = (examId: string) => {
    return mySessions?.find((s: any) => s.exam_id === examId);
  };

  const getModeInfo = (mode: string) => {
    switch (mode) {
      case 'practice':
        return { label: 'Practice', color: 'bg-blue-100 text-blue-600', icon: AcademicCapIcon };
      case 'live_standard':
        return { label: 'Standard', color: 'bg-green-100 text-green-600', icon: ShieldCheckIcon };
      case 'live_strict':
        return { label: 'Strict + Camera', color: 'bg-red-100 text-red-600', icon: VideoCameraIcon };
      default:
        return { label: mode, color: 'bg-gray-100 text-gray-600', icon: AcademicCapIcon };
    }
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
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Available Exams</h1>
        <p className="text-gray-600">Browse and take available examinations</p>
      </div>

      {exams && exams.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {exams.map((exam: any) => {
            const session = getSessionForExam(exam.id);
            const modeInfo = getModeInfo(exam.mode);
            const ModeIcon = modeInfo.icon;

            return (
              <div key={exam.id} className="card hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className={`p-2 rounded-lg ${modeInfo.color}`}>
                    <ModeIcon className="w-5 h-5" />
                  </div>
                  <span className={`badge ${modeInfo.color}`}>
                    {modeInfo.label}
                  </span>
                </div>

                <h3 className="text-lg font-semibold text-gray-900 mb-2">{exam.title}</h3>
                <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                  {exam.description || 'No description available'}
                </p>

                <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                  <span className="flex items-center gap-1">
                    <ClockIcon className="w-4 h-4" />
                    {exam.duration_minutes} min
                  </span>
                  <span>{exam.total_points} points</span>
                  <span>{exam.passing_percentage}% to pass</span>
                </div>

                {exam.mode === 'live_strict' && (
                  <div className="flex items-center gap-2 text-xs text-orange-600 bg-orange-50 p-2 rounded mb-4">
                    <VideoCameraIcon className="w-4 h-4" />
                    Requires webcam access
                  </div>
                )}

                {session ? (
                  session.status === 'completed' || session.status === 'terminated' ? (
                    <div className="flex items-center justify-between">
                      <span className={`badge ${
                        session.status === 'completed' ? 'badge-success' : 'badge-danger'
                      }`}>
                        {session.status === 'completed' ? 'Completed' : 'Terminated'}
                      </span>
                      <Link
                        to={`/student/results/${session.id}`}
                        className="btn btn-secondary btn-sm"
                      >
                        View Results
                      </Link>
                    </div>
                  ) : (
                    <Link
                      to={`/student/exam/${exam.id}/take`}
                      className="btn btn-primary w-full"
                    >
                      Continue Exam
                    </Link>
                  )
                ) : (
                  <Link
                    to={`/student/exam/${exam.id}`}
                    className="btn btn-primary w-full"
                  >
                    Start Exam
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card text-center py-12">
          <AcademicCapIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Exams Available</h3>
          <p className="text-gray-500">Check back later for new examinations</p>
        </div>
      )}
    </div>
  );
}
