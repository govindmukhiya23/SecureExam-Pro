import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '../../stores/authStore';
import { authAPI } from '../../services/api';
import { AcademicCapIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

interface RegisterForm {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: 'admin' | 'student';
  college_id: string;
  college_name: string;
  department_id: string;
  year_batch: string;
  roll_number: string;
}

interface College {
  id: string;
  name: string;
  code?: string;
}

interface Department {
  id: string;
  name: string;
  code: string;
}

interface Batch {
  id: string;
  year: number;
  label: string;
}

export default function RegisterPage() {
  const { register: registerUser, isLoading, error, clearError } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [colleges, setColleges] = useState<College[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterForm>({
    defaultValues: {
      role: 'student',
      college_id: '',
      college_name: '',
      department_id: '',
      year_batch: '',
      roll_number: '',
    },
  });

  const password = watch('password');
  const selectedRole = watch('role');

  // Fetch colleges, departments, and batches for registration
  useEffect(() => {
    const fetchRegistrationData = async () => {
      try {
        setLoadingData(true);
        const [collegesRes, departmentsRes, batchesRes] = await Promise.all([
          authAPI.getColleges(),
          authAPI.getDepartments(),
          authAPI.getBatches(),
        ]);
        setColleges(collegesRes.data || []);
        setDepartments(departmentsRes.data || []);
        setBatches(batchesRes.data || []);
      } catch (err) {
        console.error('Failed to fetch registration data:', err);
      } finally {
        setLoadingData(false);
      }
    };
    fetchRegistrationData();
  }, []);

  const onSubmit = async (data: RegisterForm) => {
    clearError();
    try {
      const registrationData: any = {
        name: data.name,
        email: data.email,
        password: data.password,
        role: data.role,
      };

      if (data.role === 'student') {
        // Student registration - requires college, department, batch
        if (!data.college_id) {
          toast.error('Please select a college');
          return;
        }
        if (!data.department_id) {
          toast.error('Please select a department');
          return;
        }
        if (!data.year_batch) {
          toast.error('Please select your year batch');
          return;
        }
        if (!data.roll_number?.trim()) {
          toast.error('Roll number is required for students');
          return;
        }
        registrationData.college_id = data.college_id;
        registrationData.department_id = data.department_id;
        registrationData.year_batch = parseInt(data.year_batch, 10);
        registrationData.roll_number = data.roll_number.trim();
      } else {
        // Admin registration - requires college name
        if (!data.college_name.trim()) {
          toast.error('Please enter your college/institution name');
          return;
        }
        registrationData.college_name = data.college_name.trim();
      }

      await registerUser(registrationData);
      toast.success('Registration successful!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Registration failed');
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Illustration */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-primary-600 to-primary-800 items-center justify-center p-12">
        <div className="max-w-lg text-white">
          <h2 className="text-3xl font-bold mb-4">
            Join SecureExam Pro Today
          </h2>
          <p className="text-lg text-primary-100 mb-8">
            Create your account to start conducting or taking secure online examinations 
            with industry-leading proctoring technology.
          </p>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <span>Create exams in minutes</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <span>Monitor exams in real-time</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span>Generate detailed reports</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="flex items-center justify-center w-12 h-12 bg-primary-600 rounded-xl">
              <AcademicCapIcon className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">SecureExam Pro</h1>
              <p className="text-sm text-gray-500">Secure Online Examination</p>
            </div>
          </div>

          {/* Form */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Create an account</h2>
            <p className="text-gray-600">Get started with SecureExam Pro</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="label">Full Name</label>
              <input
                type="text"
                {...register('name', {
                  required: 'Name is required',
                  minLength: {
                    value: 2,
                    message: 'Name must be at least 2 characters',
                  },
                })}
                className={errors.name ? 'input-error' : 'input'}
                placeholder="John Doe"
              />
              {errors.name && (
                <p className="mt-1 text-sm text-danger-600">{errors.name.message}</p>
              )}
            </div>

            <div>
              <label className="label">Email Address</label>
              <input
                type="email"
                {...register('email', {
                  required: 'Email is required',
                  pattern: {
                    value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                    message: 'Invalid email address',
                  },
                })}
                className={errors.email ? 'input-error' : 'input'}
                placeholder="you@example.com"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-danger-600">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="label">Account Type</label>
              <div className="grid grid-cols-2 gap-3">
                <label className={`relative flex items-center justify-center p-4 border-2 rounded-lg cursor-pointer transition-colors hover:bg-gray-50 ${selectedRole === 'student' ? 'border-primary-600 bg-primary-50' : 'border-gray-200'}`}>
                  <input
                    type="radio"
                    value="student"
                    {...register('role')}
                    className="sr-only"
                  />
                  <div className="text-center">
                    <span className="text-2xl mb-1 block">🎓</span>
                    <span className="text-sm font-medium">Student</span>
                  </div>
                </label>
                <label className={`relative flex items-center justify-center p-4 border-2 rounded-lg cursor-pointer transition-colors hover:bg-gray-50 ${selectedRole === 'admin' ? 'border-primary-600 bg-primary-50' : 'border-gray-200'}`}>
                  <input
                    type="radio"
                    value="admin"
                    {...register('role')}
                    className="sr-only"
                  />
                  <div className="text-center">
                    <span className="text-2xl mb-1 block">👨‍🏫</span>
                    <span className="text-sm font-medium">Admin/Faculty</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Conditional Fields based on Role */}
            {selectedRole === 'student' ? (
              <>
                {/* Student Fields */}
                <div>
                  <label className="label">College/Institution *</label>
                  <select
                    {...register('college_id')}
                    className="input"
                    disabled={loadingData}
                  >
                    <option value="">Select your college</option>
                    {colleges.map((college) => (
                      <option key={college.id} value={college.id}>
                        {college.name} {college.code && `(${college.code})`}
                      </option>
                    ))}
                  </select>
                  {colleges.length === 0 && !loadingData && (
                    <p className="mt-1 text-sm text-amber-600">
                      No colleges registered yet. Please contact your institution admin.
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Department *</label>
                    <select
                      {...register('department_id')}
                      className="input"
                      disabled={loadingData}
                    >
                      <option value="">Select department</option>
                      {departments.map((dept) => (
                        <option key={dept.id} value={dept.id}>
                          {dept.code} - {dept.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Year Batch *</label>
                    <select
                      {...register('year_batch')}
                      className="input"
                      disabled={loadingData}
                    >
                      <option value="">Select batch</option>
                      {batches.map((batch) => (
                        <option key={batch.id} value={batch.year}>
                          {batch.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="label">Roll Number *</label>
                  <input
                    type="text"
                    {...register('roll_number', {
                      required: selectedRole === 'student' ? 'Roll number is required' : false,
                      minLength: {
                        value: 2,
                        message: 'Roll number must be at least 2 characters',
                      },
                    })}
                    className={errors.roll_number ? 'input-error' : 'input'}
                    placeholder="e.g., 21CSE001"
                  />
                  {errors.roll_number && (
                    <p className="mt-1 text-sm text-danger-600">{errors.roll_number.message}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">
                    This will be your primary identifier for exams
                  </p>
                </div>
              </>
            ) : (
              <>
                {/* Admin Fields */}
                <div>
                  <label className="label">College/Institution Name *</label>
                  <input
                    type="text"
                    {...register('college_name', {
                      required: selectedRole === 'admin' ? 'College name is required' : false,
                    })}
                    className={errors.college_name ? 'input-error' : 'input'}
                    placeholder="Enter your college or institution name"
                  />
                  {errors.college_name && (
                    <p className="mt-1 text-sm text-danger-600">{errors.college_name.message}</p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">
                    A new institution will be created and you will be assigned as admin.
                  </p>
                </div>
              </>
            )}

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  {...register('password', {
                    required: 'Password is required',
                    minLength: {
                      value: 8,
                      message: 'Password must be at least 8 characters',
                    },
                  })}
                  className={errors.password ? 'input-error' : 'input'}
                  placeholder="At least 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? (
                    <EyeSlashIcon className="w-5 h-5" />
                  ) : (
                    <EyeIcon className="w-5 h-5" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-sm text-danger-600">{errors.password.message}</p>
              )}
            </div>

            <div>
              <label className="label">Confirm Password</label>
              <input
                type="password"
                {...register('confirmPassword', {
                  required: 'Please confirm your password',
                  validate: (value) => value === password || 'Passwords do not match',
                })}
                className={errors.confirmPassword ? 'input-error' : 'input'}
                placeholder="Confirm your password"
              />
              {errors.confirmPassword && (
                <p className="mt-1 text-sm text-danger-600">{errors.confirmPassword.message}</p>
              )}
            </div>

            {error && (
              <div className="p-3 bg-danger-50 border border-danger-200 rounded-lg">
                <p className="text-sm text-danger-600">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full py-3"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating account...
                </span>
              ) : (
                'Create account'
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-600">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-primary-600 hover:text-primary-500">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
