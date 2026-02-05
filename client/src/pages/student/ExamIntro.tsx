import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { examAPI } from '../../services/api';
import {
  ArrowLeftIcon,
  ClockIcon,
  DocumentTextIcon,
  ShieldCheckIcon,
  VideoCameraIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';

export default function ExamIntro() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [agreed, setAgreed] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [checkingCamera, setCheckingCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const { data: exam, isLoading } = useQuery({
    queryKey: ['exam', id],
    queryFn: async () => {
      const response = await examAPI.get(id!);
      return response.data.data;
    },
    enabled: !!id,
  });

  // Cleanup camera stream when component unmounts (but NOT when starting exam)
  useEffect(() => {
    return () => {
      // Only stop if not navigating to exam
      if (cameraStream && !sessionStorage.getItem('examStarting')) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

  const checkCamera = async () => {
    setCheckingCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        } 
      });
      
      setCameraStream(stream);
      setCameraReady(true);
      
      // Attach stream to video element for preview
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(console.error);
      }
    } catch (error) {
      alert('Camera access denied. Please allow camera access to take this exam.');
    } finally {
      setCheckingCamera(false);
    }
  };

  const handleStartExam = () => {
    // Mark that we're starting the exam so stream isn't stopped
    sessionStorage.setItem('examStarting', 'true');
    // Stop the preview stream - TakeExam will create its own
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
    }
    navigate(`/student/exam/${id}/take`);
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
        <Link to="/student/exams" className="btn btn-primary mt-4">
          Back to Exams
        </Link>
      </div>
    );
  }

  // Camera is ALWAYS required for all exams
  const requiresCamera = true;
  const canStart = agreed && cameraReady;

  return (
    <div>
      <Link
        to="/student/exams"
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        Back to Exams
      </Link>

      <div className="max-w-3xl mx-auto">
        <div className="card mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{exam.title}</h1>
          <p className="text-gray-600">{exam.description || 'No description'}</p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
              <ClockIcon className="w-6 h-6 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500">Duration</p>
                <p className="font-semibold">{exam.duration_minutes} min</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
              <DocumentTextIcon className="w-6 h-6 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500">Questions</p>
                <p className="font-semibold">{exam.question_count || 'Multiple'}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
              <ShieldCheckIcon className="w-6 h-6 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500">Passing</p>
                <p className="font-semibold">{exam.passing_percentage}%</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
              <span className="text-lg">🏆</span>
              <div>
                <p className="text-sm text-gray-500">Total Points</p>
                <p className="font-semibold">{exam.total_points}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="card mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Instructions</h2>
          <div className="prose prose-sm text-gray-600">
            {exam.instructions ? (
              <p className="whitespace-pre-wrap">{exam.instructions}</p>
            ) : (
              <ul className="space-y-2">
                <li>Read each question carefully before answering.</li>
                <li>You cannot pause or restart the exam once started.</li>
                <li>All answers are auto-saved as you progress.</li>
                <li>You can flag questions for review and navigate between them.</li>
                <li>Submit your exam before the timer runs out.</li>
              </ul>
            )}
          </div>
        </div>

        {/* Exam Rules */}
        <div className="card mb-6 border-orange-200 bg-orange-50">
          <div className="flex items-start gap-4">
            <ExclamationTriangleIcon className="w-6 h-6 text-orange-600 flex-shrink-0" />
            <div>
              <h2 className="text-lg font-semibold text-orange-800 mb-3">Exam Rules</h2>
              <ul className="space-y-2 text-sm text-orange-700">
                <li className="flex items-start gap-2">
                  <span className="text-orange-500">•</span>
                  <span>Do not switch tabs or windows during the exam.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-orange-500">•</span>
                  <span>Do not use copy, paste, or right-click functions.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-orange-500">•</span>
                  <span>Do not take screenshots or use screen recording.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-orange-500">•</span>
                  <span>The exam will run in fullscreen mode.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-orange-500">•</span>
                  <span>Keep your face visible to the camera at all times.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-orange-500">•</span>
                  <span>Ensure you are alone and in a well-lit environment.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-orange-500">•</span>
                  <span>Violations will be recorded and may result in exam termination.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Camera Check - Always Required */}
        <div className="card mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-lg ${cameraReady ? 'bg-green-100' : 'bg-gray-100'}`}>
                <VideoCameraIcon className={`w-6 h-6 ${cameraReady ? 'text-green-600' : 'text-gray-400'}`} />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Camera Check Required</h3>
                <p className="text-sm text-gray-500">
                  {cameraReady
                    ? 'Camera access granted - Preview is live'
                    : 'Camera access is required for this exam. Click "Enable Camera" to start.'}
                </p>
              </div>
            </div>
            {cameraReady ? (
              <span className="badge badge-success flex items-center gap-1">
                <CheckCircleIcon className="w-4 h-4" />
                Ready
              </span>
            ) : (
              <button
                onClick={checkCamera}
                disabled={checkingCamera}
                className="btn btn-primary"
              >
                {checkingCamera ? 'Enabling...' : 'Enable Camera'}
              </button>
            )}
          </div>
          
          {/* Camera Preview */}
          <div className={`relative rounded-lg overflow-hidden bg-gray-900 aspect-video ${cameraReady ? '' : 'hidden'}`}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover transform scale-x-[-1]"
            />
            <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-green-600 text-white text-xs px-2 py-1 rounded">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
              LIVE
            </div>
          </div>
          
          {!cameraReady && (
            <div className="mt-4 p-4 bg-gray-100 rounded-lg text-center">
              <VideoCameraIcon className="w-12 h-12 text-gray-400 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">Camera preview will appear here</p>
            </div>
          )}
        </div>

        {/* Agreement */}
        <div className="card mb-6">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 w-4 h-4 text-primary-600 rounded"
            />
            <span className="text-gray-700">
              I have read and understood the exam instructions and rules. I agree to take this exam
              honestly and understand that any violations may result in exam termination and score
              invalidation.
            </span>
          </label>
        </div>

        {/* Start Button */}
        <div className="flex justify-center">
          <button
            onClick={handleStartExam}
            disabled={!canStart}
            className="btn btn-primary btn-lg px-12"
          >
            Start Exam
          </button>
        </div>
      </div>
    </div>
  );
}
