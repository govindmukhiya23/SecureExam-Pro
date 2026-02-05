import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { examAPI, sessionAPI, proctoringAPI } from '../../services/api';
import socketService from '../../services/socket';
import { useAuthStore } from '../../stores/authStore';
import { useExamStore } from '../../stores/examStore';
import antiCheatService from '../../utils/antiCheat';
import { generateDeviceFingerprint, getScreenResolution, getTimezone } from '../../utils/fingerprint';
import webcamProctoring from '../../utils/webcamProctoring';
import toast from 'react-hot-toast';
import {
  ClockIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FlagIcon,
  PaperAirplaneIcon,
  ExclamationTriangleIcon,
  VideoCameraIcon,
} from '@heroicons/react/24/outline';

interface Answer {
  questionId: string;
  answer: string | number;
}

export default function TakeExam() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = useAuthStore();
  const { setSession, setScreenBlank, isScreenBlank } = useExamStore();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [webcamActive, setWebcamActive] = useState(false);
  const [webcamError, setWebcamError] = useState(false);

  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const keyEventsRef = useRef<any[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Fetch exam details
  const { data: exam, isLoading: examLoading } = useQuery({
    queryKey: ['exam', id],
    queryFn: async () => {
      const response = await examAPI.get(id!, true);
      return response.data.data;
    },
    enabled: !!id,
  });

  // Start session mutation
  const startSessionMutation = useMutation({
    mutationFn: async () => {
      const fingerprint = await generateDeviceFingerprint();
      const response = await sessionAPI.start(id!, {
        device_fingerprint: fingerprint,
        user_agent: navigator.userAgent,
        screen_resolution: getScreenResolution(),
        timezone: getTimezone(),
      });
      return response.data.data;
    },
    onSuccess: (data) => {
      setSessionId(data.session?.id || data.id);
      setSession(data.session || data);
      setTimeRemaining(exam!.duration_minutes * 60);

      // Connect to socket
      if (token) {
        socketService.connect(token);
        socketService.joinSession(data.session?.id || data.id);
      }
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.message || error.response?.data?.error || 'Failed to start exam';
      console.error('Start exam error:', error.response?.data);
      toast.error(errorMessage);
      navigate('/student/exams');
    },
  });

  // Submit exam mutation
  const submitMutation = useMutation({
    mutationFn: async () => {
      const answerPayload = answers.map(a => ({
        questionId: a.questionId,
        answer: a.answer,
      }));
      return sessionAPI.submit(sessionId!, answerPayload);
    },
    onSuccess: (response) => {
      toast.success('Exam submitted successfully');
      cleanup();
      navigate(`/student/results/${sessionId}`);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to submit exam');
      setIsSubmitting(false);
    },
  });

  // Cleanup function
  const cleanup = useCallback(() => {
    antiCheatService.destroy();
    webcamProctoring.destroy();
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
    }
    if (sessionId) {
      socketService.leaveSession(sessionId);
    }
    socketService.disconnect();
    setSession(null);
    document.exitFullscreen?.().catch(() => {});
  }, [sessionId, setSession]);

  // Handle suspicious event
  const handleSuspiciousEvent = useCallback(async (eventType: string, severity: string, metadata?: any) => {
    if (!sessionId) return;

    try {
      const response = await proctoringAPI.logEvent(sessionId, {
        eventType,
        severity,
        metadata,
      });

      // Check if screen should be blanked
      if (response.data.data.riskLevel === 'critical' || response.data.data.riskLevel === 'high') {
        setScreenBlank(true);
        setTimeout(() => setScreenBlank(false), 3000);
      }
    } catch (error) {
      console.error('Failed to log suspicious event:', error);
    }
  }, [sessionId, setScreenBlank]);

  // Initialize exam
  useEffect(() => {
    if (exam && !sessionId) {
      startSessionMutation.mutate();
    }
  }, [exam]);

  // Setup anti-cheat and proctoring
  useEffect(() => {
    if (!sessionId || !exam) return;

    // Clear exam starting flag
    sessionStorage.removeItem('examStarting');

    // Enable anti-cheat
    antiCheatService.initialize(sessionId, {
      onViolation: (eventType, points) => handleSuspiciousEvent(eventType, points >= 25 ? 'high' : 'medium'),
      onRiskThreshold: (score, action) => {
        if (action === 'terminate') {
          toast.error('Session terminated due to suspicious activity');
          cleanup();
          navigate('/student/exams');
        } else if (action === 'flag') {
          setScreenBlank(true);
          setTimeout(() => setScreenBlank(false), 3000);
        }
      },
    });

    // Setup keyboard monitoring
    const handleKeyDown = (e: KeyboardEvent) => {
      keyEventsRef.current.push({
        key: e.key,
        timestamp: Date.now(),
        type: 'keydown',
      });

      // Send batch every 30 events
      if (keyEventsRef.current.length >= 30) {
        proctoringAPI.logKeyboard(sessionId, keyEventsRef.current);
        keyEventsRef.current = [];
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Setup heartbeat
    heartbeatRef.current = setInterval(() => {
      proctoringAPI.heartbeat(sessionId).catch(console.error);
    }, 30000);

    // Request fullscreen
    antiCheatService.enterFullscreen().catch(() => {
      handleSuspiciousEvent('fullscreen_exit', 'medium');
    });

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      cleanup();
    };
  }, [sessionId, exam, handleSuspiciousEvent, cleanup, navigate, setScreenBlank]);

  // Separate effect for webcam - ensure video element is available
  useEffect(() => {
    if (!sessionId || !exam) return;
    
    // Small delay to ensure video element is in DOM
    const initWebcam = async () => {
      // Wait a bit for DOM to be ready
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const videoElement = videoRef.current;
      if (!videoElement) {
        console.error('Video element not available');
        setWebcamError(true);
        return;
      }

      try {
        // Request webcam access directly and attach to video element
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user',
          },
          audio: false,
        });

        videoElement.srcObject = stream;
        await videoElement.play();
        setWebcamActive(true);
        setWebcamError(false);

        // Initialize webcam proctoring with the stream and video element
        const success = await webcamProctoring.initialize(sessionId, videoElement, {
          onViolation: (eventType, points) => handleSuspiciousEvent(eventType, points >= 25 ? 'high' : 'medium'),
          onStatusChange: (status) => {
            if (status === 'error') {
              setWebcamError(true);
              toast.error('Webcam error. Please ensure camera access is allowed.');
            } else if (status === 'active') {
              setWebcamActive(true);
              setWebcamError(false);
            }
          },
        });

        if (success) {
          await webcamProctoring.start();
        }
      } catch (error) {
        console.error('Webcam initialization error:', error);
        setWebcamError(true);
        toast.error('Camera access is required for this exam.');
      }
    };

    initWebcam();
  }, [sessionId, exam, handleSuspiciousEvent]);

  // Timer countdown
  useEffect(() => {
    if (timeRemaining <= 0) return;

    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          // Auto-submit when time runs out
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeRemaining]);

  const handleAnswerChange = (questionId: string, answer: string | number) => {
    setAnswers(prev => {
      const existing = prev.findIndex(a => a.questionId === questionId);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = { questionId, answer };
        return updated;
      }
      return [...prev, { questionId, answer }];
    });
  };

  const toggleFlag = (questionId: string) => {
    setFlagged(prev => {
      const updated = new Set(prev);
      if (updated.has(questionId)) {
        updated.delete(questionId);
      } else {
        updated.add(questionId);
      }
      return updated;
    });
  };

  const handleSubmit = () => {
    setIsSubmitting(true);
    submitMutation.mutate();
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return h > 0
      ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
      : `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (examLoading || startSessionMutation.isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading exam...</p>
        </div>
      </div>
    );
  }

  if (!exam || !sessionId) {
    return null;
  }

  const currentQuestion = exam.questions[currentQuestionIndex];
  const currentAnswer = answers.find(a => a.questionId === currentQuestion.id)?.answer;
  const answeredCount = answers.length;
  const isLowTime = timeRemaining < 300; // Less than 5 minutes

  return (
    <ExamLayout title={exam.title}>
      <div className="min-h-screen bg-gray-100 flex flex-col">
        {/* Header */}
        <div className="bg-white shadow-sm border-b sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="font-semibold text-gray-900">{exam.title}</h1>
              <span className="text-sm text-gray-500">
                Question {currentQuestionIndex + 1} of {exam.questions.length}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                isLowTime ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
              }`}>
                <ClockIcon className="w-5 h-5" />
                <span className={`font-mono font-medium ${isLowTime ? 'animate-pulse' : ''}`}>
                  {formatTime(timeRemaining)}
                </span>
              </div>
              <button
                onClick={() => setShowConfirmSubmit(true)}
                className="btn btn-primary"
              >
                Submit Exam
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 flex">
          {/* Question Panel */}
          <div className="flex-1 p-6">
            <div className="max-w-3xl mx-auto">
              <div className="card">
                <div className="flex items-start justify-between mb-4">
                  <span className="badge badge-primary">
                    {currentQuestion.type.toUpperCase()} • {currentQuestion.points} pts
                  </span>
                  <button
                    onClick={() => toggleFlag(currentQuestion.id)}
                    className={`p-2 rounded-lg transition-colors ${
                      flagged.has(currentQuestion.id)
                        ? 'bg-orange-100 text-orange-600'
                        : 'bg-gray-100 text-gray-400 hover:text-orange-600'
                    }`}
                    title={flagged.has(currentQuestion.id) ? 'Remove flag' : 'Flag for review'}
                  >
                    <FlagIcon className="w-5 h-5" />
                  </button>
                </div>

                <p className="text-lg text-gray-900 mb-6">{currentQuestion.text}</p>

                {/* MCQ Options */}
                {currentQuestion.type === 'mcq' && currentQuestion.options && (
                  <div className="space-y-3">
                    {currentQuestion.options.map((option: string, index: number) => (
                      <label
                        key={index}
                        className={`flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                          currentAnswer === index
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`question-${currentQuestion.id}`}
                          checked={currentAnswer === index}
                          onChange={() => handleAnswerChange(currentQuestion.id, index)}
                          className="w-4 h-4 text-primary-600"
                        />
                        <span className="w-6 h-6 flex items-center justify-center text-sm font-medium bg-gray-100 rounded">
                          {String.fromCharCode(65 + index)}
                        </span>
                        <span className="text-gray-900">{option}</span>
                      </label>
                    ))}
                  </div>
                )}

                {/* Descriptive Answer */}
                {currentQuestion.type === 'descriptive' && (
                  <textarea
                    value={(currentAnswer as string) || ''}
                    onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                    placeholder="Type your answer here..."
                    className="input min-h-[200px] resize-y"
                  />
                )}

                {/* Coding Answer */}
                {currentQuestion.type === 'coding' && (
                  <div>
                    <textarea
                      value={(currentAnswer as string) || ''}
                      onChange={(e) => handleAnswerChange(currentQuestion.id, e.target.value)}
                      placeholder="Write your code here..."
                      className="input min-h-[300px] resize-y font-mono text-sm"
                      spellCheck={false}
                    />
                  </div>
                )}

                {/* Navigation */}
                <div className="flex items-center justify-between mt-6 pt-6 border-t">
                  <button
                    onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                    disabled={currentQuestionIndex === 0}
                    className="btn btn-secondary flex items-center gap-2"
                  >
                    <ChevronLeftIcon className="w-4 h-4" />
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentQuestionIndex(prev => Math.min(exam.questions.length - 1, prev + 1))}
                    disabled={currentQuestionIndex === exam.questions.length - 1}
                    className="btn btn-secondary flex items-center gap-2"
                  >
                    Next
                    <ChevronRightIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Question Navigator */}
          <div className="w-64 bg-white border-l p-4">
            <h3 className="font-semibold text-gray-900 mb-4">Questions</h3>
            <div className="grid grid-cols-5 gap-2">
              {exam.questions.map((q: any, index: number) => {
                const isAnswered = answers.some(a => a.questionId === q.id);
                const isFlagged = flagged.has(q.id);
                const isCurrent = index === currentQuestionIndex;

                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentQuestionIndex(index)}
                    className={`w-10 h-10 rounded-lg text-sm font-medium relative ${
                      isCurrent
                        ? 'bg-primary-600 text-white'
                        : isAnswered
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {index + 1}
                    {isFlagged && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full"></span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 pt-4 border-t">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-gray-500">Answered</span>
                <span className="font-medium text-gray-900">
                  {answeredCount} / {exam.questions.length}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all"
                  style={{ width: `${(answeredCount / exam.questions.length) * 100}%` }}
                ></div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-green-100"></span>
                Answered
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-gray-100"></span>
                Unanswered
              </span>
            </div>

            {/* Webcam Preview */}
            <div className="mt-6 pt-4 border-t">
              <div className="flex items-center gap-2 mb-2">
                <VideoCameraIcon className={`w-4 h-4 ${webcamActive ? 'text-green-600' : webcamError ? 'text-red-600' : 'text-gray-400'}`} />
                <span className={`text-xs font-medium ${webcamActive ? 'text-green-600' : webcamError ? 'text-red-600' : 'text-gray-500'}`}>
                  {webcamActive ? 'Camera Active' : webcamError ? 'Camera Error' : 'Connecting...'}
                </span>
              </div>
              <div className="relative rounded-lg overflow-hidden bg-gray-900 aspect-video">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover transform scale-x-[-1]"
                />
                {webcamActive && (
                  <div className="absolute top-1 left-1 flex items-center gap-1 bg-green-600 text-white text-[10px] px-1.5 py-0.5 rounded">
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></span>
                    LIVE
                  </div>
                )}
                {!webcamActive && !webcamError && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                  </div>
                )}
                {webcamError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-red-900/80">
                    <div className="text-center text-white p-2">
                      <ExclamationTriangleIcon className="w-6 h-6 mx-auto mb-1" />
                      <p className="text-xs">Camera Required</p>
                    </div>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-gray-400 mt-1 text-center">
                Your webcam is being recorded
              </p>
            </div>
          </div>
        </div>

        {/* Screen Blank Overlay */}
        {isScreenBlank && (
          <div className="fixed inset-0 bg-black z-50 flex items-center justify-center">
            <div className="text-center text-white">
              <ExclamationTriangleIcon className="w-16 h-16 mx-auto mb-4 text-red-500" />
              <h2 className="text-2xl font-bold mb-2">Suspicious Activity Detected</h2>
              <p className="text-gray-400">Please focus on the exam</p>
            </div>
          </div>
        )}

        {/* Confirm Submit Modal */}
        {showConfirmSubmit && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
            <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Submit Exam?</h3>
              <p className="text-gray-600 mb-4">
                You have answered {answeredCount} out of {exam.questions.length} questions.
                {answeredCount < exam.questions.length && (
                  <span className="text-orange-600 block mt-2">
                    Warning: You have {exam.questions.length - answeredCount} unanswered questions.
                  </span>
                )}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirmSubmit(false)}
                  className="btn btn-secondary flex-1"
                >
                  Continue Exam
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="btn btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <>
                      <PaperAirplaneIcon className="w-4 h-4" />
                      Submit
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ExamLayout>
  );
}
