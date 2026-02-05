import { useEffect, useState, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useExamStore } from '../../stores/examStore';
import antiCheatService from '../../utils/antiCheat';
import toast from 'react-hot-toast';

interface ExamLayoutProps {
  children: ReactNode;
  title?: string;
}

export default function ExamLayout({ children, title }: ExamLayoutProps) {
  const navigate = useNavigate();
  const { session } = useExamStore();

  // Set document title if provided
  useEffect(() => {
    if (title) {
      document.title = `${title} - SecureExam Pro`;
    }
    return () => {
      document.title = 'SecureExam Pro';
    };
  }, [title]);
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockReason, setBlockReason] = useState('');

  useEffect(() => {
    // Only enter fullscreen if session exists - don't navigate away
    // as session may be set asynchronously
    if (!session) {
      return;
    }

    // Enter fullscreen on mount
    const enterFullscreen = async () => {
      const success = await antiCheatService.enterFullscreen();
      if (!success) {
        toast.error('Please allow fullscreen mode to continue');
      }
    };

    enterFullscreen();

    // Cleanup on unmount
    return () => {
      antiCheatService.destroy();
    };
  }, [session, navigate]);

  // Handle screen blank when risk threshold exceeded
  useEffect(() => {
    if (session?.isBlocked) {
      setIsBlocked(true);
      setBlockReason(session.blockReason || 'Exam terminated due to suspicious activity');
    }
  }, [session?.isBlocked, session?.blockReason]);

  // Screen blank overlay
  if (isBlocked) {
    return (
      <div className="screen-blank">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-6 bg-red-500 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-4">Exam Terminated</h1>
          <p className="text-gray-300 mb-8 max-w-md mx-auto">{blockReason}</p>
          <p className="text-sm text-gray-400">Your responses have been auto-submitted.</p>
          <button
            onClick={() => navigate('/student')}
            className="mt-8 px-6 py-2 bg-white text-black rounded-lg font-medium hover:bg-gray-200 transition-colors"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="exam-fullscreen no-select">
      {children}
    </div>
  );
}
