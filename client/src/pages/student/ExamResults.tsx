import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { sessionAPI } from '../../services/api';
import {
  CheckCircleIcon,
  XCircleIcon,
  ArrowLeftIcon,
  TrophyIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

export default function ExamResults() {
  const { sessionId } = useParams<{ sessionId: string }>();

  const { data: result, isLoading } = useQuery({
    queryKey: ['session-result', sessionId],
    queryFn: async () => {
      const response = await sessionAPI.getResult(sessionId!);
      return response.data.data;
    },
    enabled: !!sessionId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Result not found</p>
        <Link to="/student/exams" className="btn btn-primary mt-4">
          Back to Exams
        </Link>
      </div>
    );
  }

  const passed = result.passed;
  const percentage = Math.round((result.score / result.totalPoints) * 100);

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
        {/* Result Card */}
        <div className={`card mb-6 text-center ${
          passed ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
        }`}>
          <div className="mb-4">
            {passed ? (
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100">
                <TrophyIcon className="w-10 h-10 text-green-600" />
              </div>
            ) : (
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-100">
                <XCircleIcon className="w-10 h-10 text-red-600" />
              </div>
            )}
          </div>

          <h1 className={`text-2xl font-bold mb-2 ${passed ? 'text-green-800' : 'text-red-800'}`}>
            {passed ? 'Congratulations!' : 'Better Luck Next Time'}
          </h1>
          <p className={`text-lg ${passed ? 'text-green-700' : 'text-red-700'}`}>
            {passed ? 'You passed the exam!' : 'You did not pass the exam'}
          </p>

          <div className="mt-6 flex items-center justify-center gap-8">
            <div className="text-center">
              <p className="text-4xl font-bold text-gray-900">{result.score}</p>
              <p className="text-sm text-gray-500">out of {result.totalPoints}</p>
            </div>
            <div className="w-px h-16 bg-gray-300"></div>
            <div className="text-center">
              <p className={`text-4xl font-bold ${passed ? 'text-green-600' : 'text-red-600'}`}>
                {percentage}%
              </p>
              <p className="text-sm text-gray-500">Score</p>
            </div>
          </div>
        </div>

        {/* Exam Info */}
        <div className="card mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">{result.examTitle}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">Duration</p>
              <p className="font-semibold">{result.duration} min</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">Passing</p>
              <p className="font-semibold">{result.passingPercentage}%</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">Completed</p>
              <p className="font-semibold">
                {new Date(result.completedAt).toLocaleDateString()}
              </p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">Time Taken</p>
              <p className="font-semibold">{result.timeTaken} min</p>
            </div>
          </div>
        </div>

        {/* Risk Summary */}
        {result.riskLevel !== 'low' && (
          <div className={`card mb-6 ${
            result.riskLevel === 'critical' ? 'bg-red-50 border-red-200' :
            result.riskLevel === 'high' ? 'bg-orange-50 border-orange-200' :
            'bg-yellow-50 border-yellow-200'
          }`}>
            <div className="flex items-start gap-4">
              <ExclamationTriangleIcon className={`w-6 h-6 ${
                result.riskLevel === 'critical' ? 'text-red-600' :
                result.riskLevel === 'high' ? 'text-orange-600' :
                'text-yellow-600'
              }`} />
              <div>
                <h3 className={`font-semibold ${
                  result.riskLevel === 'critical' ? 'text-red-800' :
                  result.riskLevel === 'high' ? 'text-orange-800' :
                  'text-yellow-800'
                }`}>
                  Integrity Notice
                </h3>
                <p className={`text-sm ${
                  result.riskLevel === 'critical' ? 'text-red-700' :
                  result.riskLevel === 'high' ? 'text-orange-700' :
                  'text-yellow-700'
                }`}>
                  Your exam session was flagged with a {result.riskLevel} risk level.
                  This may affect your final score pending review.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Question Review */}
        {result.allowReview && result.answers && (
          <div className="card">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Question Review</h2>
            <div className="space-y-4">
              {result.answers.map((answer: any, index: number) => (
                <div
                  key={answer.questionId}
                  className={`p-4 rounded-lg border ${
                    answer.isCorrect ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-sm font-medium text-gray-500">
                      Question {index + 1}
                    </span>
                    <div className="flex items-center gap-2">
                      {answer.isCorrect ? (
                        <CheckCircleIcon className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircleIcon className="w-5 h-5 text-red-600" />
                      )}
                      <span className={`text-sm font-medium ${
                        answer.isCorrect ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {answer.points} / {answer.maxPoints} pts
                      </span>
                    </div>
                  </div>
                  <p className="text-gray-900 mb-3">{answer.questionText}</p>

                  {answer.type === 'mcq' && (
                    <div className="space-y-2">
                      {answer.options?.map((option: string, optIndex: number) => (
                        <div
                          key={optIndex}
                          className={`flex items-center gap-2 p-2 rounded ${
                            optIndex === answer.correctAnswer
                              ? 'bg-green-100 text-green-800'
                              : optIndex === answer.userAnswer
                              ? 'bg-red-100 text-red-800'
                              : 'bg-white'
                          }`}
                        >
                          <span className="w-5 h-5 flex items-center justify-center text-xs font-medium rounded-full bg-gray-200">
                            {String.fromCharCode(65 + optIndex)}
                          </span>
                          <span>{option}</span>
                          {optIndex === answer.correctAnswer && (
                            <span className="text-xs font-medium ml-auto">✓ Correct</span>
                          )}
                          {optIndex === answer.userAnswer && optIndex !== answer.correctAnswer && (
                            <span className="text-xs font-medium ml-auto">Your answer</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {(answer.type === 'descriptive' || answer.type === 'coding') && (
                    <div className="bg-white p-3 rounded border">
                      <p className="text-sm text-gray-500 mb-1">Your Answer:</p>
                      <p className={`${answer.type === 'coding' ? 'font-mono text-sm' : ''} whitespace-pre-wrap`}>
                        {answer.userAnswer || 'No answer provided'}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 text-center">
          <Link to="/student/exams" className="btn btn-primary">
            Back to Exams
          </Link>
        </div>
      </div>
    </div>
  );
}
