import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { examAPI, sessionAPI } from '../../services/api';
import { socketService } from '../../services/socket';
import { useAuthStore } from '../../stores/authStore';
import {
  ArrowLeftIcon,
  ExclamationTriangleIcon,
  VideoCameraIcon,
  ComputerDesktopIcon,
  UserCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import type { ExamSession, SuspiciousEvent } from '../../../../shared/types';

interface LiveSession extends ExamSession {
  user_name?: string;
  user_email?: string;
}

export default function MonitorExam() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = useAuthStore();

  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const [recentAlerts, setRecentAlerts] = useState<(SuspiciousEvent & { student_name?: string })[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  const { data: exam, isLoading } = useQuery({
    queryKey: ['exam', id],
    queryFn: async () => {
      const response = await examAPI.get(id!);
      return response.data.data;
    },
    enabled: !!id,
  });

  const { data: sessions, refetch: refetchSessions } = useQuery({
    queryKey: ['exam-sessions', id],
    queryFn: async () => {
      const response = await sessionAPI.getExamSessions(id!);
      return response.data.data as LiveSession[];
    },
    enabled: !!id,
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (sessions) {
      setLiveSessions(sessions.filter(s => s.status === 'in_progress'));
    }
  }, [sessions]);

  useEffect(() => {
    if (token && id) {
      socketService.connect(token);
      socketService.joinAdminMonitor(id);

      socketService.onSuspiciousEvent((data) => {
        setRecentAlerts(prev => [{
          ...data.event,
          student_name: data.studentName,
        }, ...prev].slice(0, 20));

        // Update session risk score
        setLiveSessions(prev => prev.map(s => 
          s.id === data.event.session_id
            ? { ...s, risk_score: data.riskScore, risk_level: data.riskLevel }
            : s
        ));
      });

      socketService.onSessionUpdate((data) => {
        if (data.status === 'completed' || data.status === 'terminated') {
          setLiveSessions(prev => prev.filter(s => s.id !== data.sessionId));
        }
        refetchSessions();
      });

      return () => {
        socketService.leaveAdminMonitor(id);
        socketService.disconnect();
      };
    }
  }, [token, id, refetchSessions]);

  const handleTerminateSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to terminate this session? The student will be forced to submit.')) {
      return;
    }

    try {
      await sessionAPI.terminate(sessionId, 'Terminated by admin');
      refetchSessions();
    } catch (error) {
      console.error('Failed to terminate session:', error);
    }
  };

  const getRiskBadgeClass = (level: string) => {
    switch (level) {
      case 'low': return 'bg-green-100 text-green-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'critical': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'tab_switch':
      case 'window_blur':
        return <ComputerDesktopIcon className="w-5 h-5" />;
      case 'face_not_visible':
      case 'multiple_faces':
        return <VideoCameraIcon className="w-5 h-5" />;
      default:
        return <ExclamationTriangleIcon className="w-5 h-5" />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!exam) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Exam not found</p>
      </div>
    );
  }

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
          <h1 className="text-2xl font-bold text-gray-900">{exam.title}</h1>
          <p className="text-gray-600">Live Monitoring Dashboard</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-green-100 text-green-800">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            {liveSessions.length} Active
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Sessions */}
        <div className="lg:col-span-2">
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Active Sessions</h2>
            
            {liveSessions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Student</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Progress</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Risk</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Time</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liveSessions.map((session) => {
                      const startTime = new Date(session.started_at!).getTime();
                      const elapsed = Math.floor((Date.now() - startTime) / 60000);
                      const remaining = Math.max(0, exam.duration_minutes - elapsed);

                      return (
                        <tr
                          key={session.id}
                          className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${
                            selectedSession === session.id ? 'bg-primary-50' : ''
                          }`}
                          onClick={() => setSelectedSession(session.id)}
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <UserCircleIcon className="w-8 h-8 text-gray-400" />
                              <div>
                                <p className="font-medium text-gray-900">
                                  {session.user_name || 'Student'}
                                </p>
                                <p className="text-xs text-gray-500">{session.user_email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-primary-600 h-2 rounded-full"
                                style={{ width: `${Math.min(100, (elapsed / exam.duration_minutes) * 100)}%` }}
                              ></div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className={`badge ${getRiskBadgeClass(session.risk_level)}`}>
                              {session.risk_level} ({session.risk_score})
                            </span>
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-600">
                            {remaining} min left
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTerminateSession(session.id);
                              }}
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
                              title="Terminate Session"
                            >
                              <XCircleIcon className="w-5 h-5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <ComputerDesktopIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-500">No active sessions</p>
                <p className="text-sm text-gray-400">Sessions will appear here when students start the exam</p>
              </div>
            )}
          </div>
        </div>

        {/* Recent Alerts */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Recent Alerts
            {recentAlerts.length > 0 && (
              <span className="ml-2 badge badge-danger">{recentAlerts.length}</span>
            )}
          </h2>

          {recentAlerts.length > 0 ? (
            <div className="space-y-3 max-h-[500px] overflow-y-auto">
              {recentAlerts.map((alert, index) => (
                <div
                  key={`${alert.id}-${index}`}
                  className={`p-3 rounded-lg border ${
                    alert.severity === 'critical' ? 'border-red-200 bg-red-50' :
                    alert.severity === 'high' ? 'border-orange-200 bg-orange-50' :
                    alert.severity === 'medium' ? 'border-yellow-200 bg-yellow-50' :
                    'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-1 rounded ${
                      alert.severity === 'critical' ? 'text-red-600' :
                      alert.severity === 'high' ? 'text-orange-600' :
                      alert.severity === 'medium' ? 'text-yellow-600' :
                      'text-gray-600'
                    }`}>
                      {getEventIcon(alert.event_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {alert.student_name || 'Unknown Student'}
                      </p>
                      <p className="text-xs text-gray-600">
                        {alert.event_type.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(alert.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                      alert.severity === 'critical' ? 'bg-red-200 text-red-800' :
                      alert.severity === 'high' ? 'bg-orange-200 text-orange-800' :
                      alert.severity === 'medium' ? 'bg-yellow-200 text-yellow-800' :
                      'bg-gray-200 text-gray-800'
                    }`}>
                      +{alert.risk_points}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <ExclamationTriangleIcon className="w-10 h-10 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">No alerts yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Completed Sessions */}
      {sessions && sessions.filter(s => s.status !== 'in_progress').length > 0 && (
        <div className="card mt-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Completed Sessions</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Student</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Score</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Risk Level</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Completed</th>
                </tr>
              </thead>
              <tbody>
                {sessions.filter(s => s.status !== 'in_progress').map((session) => (
                  <tr key={session.id} className="border-b border-gray-100">
                    <td className="py-3 px-4">
                      <p className="font-medium text-gray-900">{session.user_name || 'Student'}</p>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`badge ${
                        session.status === 'completed' ? 'badge-success' : 'badge-danger'
                      }`}>
                        {session.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-900">
                      {session.score !== null ? `${session.score}/${exam.total_points}` : '-'}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`badge ${getRiskBadgeClass(session.risk_level)}`}>
                        {session.risk_level}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500">
                      {session.completed_at
                        ? new Date(session.completed_at).toLocaleString()
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
