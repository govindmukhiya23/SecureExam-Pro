import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';

// Layouts
import MainLayout from './components/layouts/MainLayout';

// Auth Pages
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';

// Admin Pages
import AdminDashboard from './pages/admin/Dashboard';
import ExamList from './pages/admin/ExamList';
import CreateExam from './pages/admin/CreateExam';
import EditExam from './pages/admin/EditExam';
import MonitorExam from './pages/admin/MonitorExam';
import ExamReport from './pages/admin/ExamReport';
import AIExamCreator from './pages/admin/AIExamCreator';
import StudentDirectory from './pages/admin/StudentDirectory';

// Student Pages
import StudentDashboard from './pages/student/Dashboard';
import AvailableExams from './pages/student/AvailableExams';
import ExamIntro from './pages/student/ExamIntro';
import TakeExam from './pages/student/TakeExam';
import ExamResults from './pages/student/ExamResults';

// Protected Route Component
function ProtectedRoute({
  children,
  requiredRole,
}: {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'student';
}) {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

// Public Route (redirect if authenticated)
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore();

  if (isAuthenticated) {
    return <Navigate to={user?.role === 'admin' ? '/admin' : '/student'} replace />;
  }

  return <>{children}</>;
}

function App() {
  const { isAuthenticated, user } = useAuthStore();

  return (
    <Routes>
      {/* Public Routes */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <RegisterPage />
          </PublicRoute>
        }
      />

      {/* Admin Routes */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute requiredRole="admin">
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminDashboard />} />
        <Route path="exams" element={<ExamList />} />
        <Route path="exams/create" element={<CreateExam />} />
        <Route path="exams/create-ai" element={<AIExamCreator />} />
        <Route path="exams/:id/edit" element={<EditExam />} />
        <Route path="exams/:id/monitor" element={<MonitorExam />} />
        <Route path="exams/:id/report" element={<ExamReport />} />
        <Route path="students" element={<StudentDirectory />} />
      </Route>

      {/* Student Routes */}
      <Route
        path="/student"
        element={
          <ProtectedRoute requiredRole="student">
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<StudentDashboard />} />
        <Route path="exams" element={<AvailableExams />} />
        <Route path="exam/:id" element={<ExamIntro />} />
        <Route path="results/:sessionId" element={<ExamResults />} />
      </Route>

      {/* Exam Taking Route (Separate Layout for Lockdown) */}
      <Route
        path="/student/exam/:id/take"
        element={
          <ProtectedRoute requiredRole="student">
            <TakeExam />
          </ProtectedRoute>
        }
      />

      {/* Root redirect */}
      <Route
        path="/"
        element={
          isAuthenticated ? (
            <Navigate to={user?.role === 'admin' ? '/admin' : '/student'} replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      {/* 404 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
