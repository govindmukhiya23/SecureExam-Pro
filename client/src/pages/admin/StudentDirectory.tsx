import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminAPI } from '../../services/api';
import {
  MagnifyingGlassIcon,
  UserGroupIcon,
  FunnelIcon,
  EyeIcon,
  XMarkIcon,
  UserIcon,
  AcademicCapIcon,
  BuildingOfficeIcon,
  CalendarIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import clsx from 'clsx';
import toast from 'react-hot-toast';

interface Student {
  id: string;
  name: string;
  email: string;
  roll_number?: string;
  department_code?: string;
  department_name?: string;
  year_batch?: number;
  account_status: 'active' | 'disabled' | 'suspended';
  created_at: string;
  exams_taken: number;
  last_exam_date?: string;
}

interface StudentExamHistory {
  session_id: string;
  exam_id: string;
  exam_title: string;
  mode: string;
  status: string;
  score?: number;
  percentage?: number;
  passed?: boolean;
  start_time: string;
  submit_time?: string;
  violations_count: number;
  highest_risk_score: number;
}

export default function StudentDirectory() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedBatch, setSelectedBatch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [page, setPage] = useState(1);
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const limit = 20;

  // Fetch departments
  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const response = await adminAPI.getDepartments();
      return response.data.data;
    },
  });

  // Fetch batches
  const { data: batches } = useQuery({
    queryKey: ['batches'],
    queryFn: async () => {
      const response = await adminAPI.getBatches();
      return response.data.data;
    },
  });

  // Fetch students with filters
  const { data: studentsData, isLoading: studentsLoading } = useQuery({
    queryKey: ['students', search, selectedDepartment, selectedBatch, selectedStatus, page],
    queryFn: async () => {
      const response = await adminAPI.getStudents({
        search: search || undefined,
        department_id: selectedDepartment || undefined,
        year_batch: selectedBatch ? parseInt(selectedBatch) : undefined,
        account_status: selectedStatus || undefined,
        page,
        limit,
      });
      return response.data.data;
    },
    placeholderData: (previousData) => previousData,
  });

  // Fetch student stats
  const { data: stats } = useQuery({
    queryKey: ['student-stats'],
    queryFn: async () => {
      const response = await adminAPI.getStudentStats();
      return response.data.data;
    },
  });

  // Fetch selected student details
  const { data: studentDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ['student', selectedStudent],
    queryFn: async () => {
      if (!selectedStudent) return null;
      const response = await adminAPI.getStudent(selectedStudent);
      return response.data.data;
    },
    enabled: !!selectedStudent,
  });

  // Update student status mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'disabled' | 'suspended' }) =>
      adminAPI.updateStudentStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['students'] });
      queryClient.invalidateQueries({ queryKey: ['student'] });
      queryClient.invalidateQueries({ queryKey: ['student-stats'] });
      toast.success('Student status updated');
    },
    onError: () => {
      toast.error('Failed to update status');
    },
  });

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: 'bg-green-100 text-green-700',
      disabled: 'bg-gray-100 text-gray-700',
      suspended: 'bg-red-100 text-red-700',
    };
    return styles[status] || 'bg-gray-100 text-gray-700';
  };

  const clearFilters = () => {
    setSearch('');
    setSelectedDepartment('');
    setSelectedBatch('');
    setSelectedStatus('');
    setPage(1);
  };

  const hasActiveFilters = search || selectedDepartment || selectedBatch || selectedStatus;

  return (
    <div className="flex h-full">
      {/* Main Content */}
      <div className={clsx('flex-1 transition-all', selectedStudent ? 'mr-96' : '')}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Student Directory</h1>
            <p className="text-gray-600 mt-1">
              Manage and view all registered students
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="card">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <UserGroupIcon className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Total Students</p>
                <p className="text-xl font-bold text-gray-900">
                  {stats?.total_students || 0}
                </p>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircleIcon className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Active</p>
                <p className="text-xl font-bold text-gray-900">
                  {stats?.by_status?.active || 0}
                </p>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <XCircleIcon className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Disabled</p>
                <p className="text-xl font-bold text-gray-900">
                  {stats?.by_status?.disabled || 0}
                </p>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <ExclamationTriangleIcon className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">Suspended</p>
                <p className="text-xl font-bold text-gray-900">
                  {stats?.by_status?.suspended || 0}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="card mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by name, email, or roll number..."
                className="input pl-10 w-full"
              />
            </div>

            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={clsx(
                'btn-secondary flex items-center gap-2',
                hasActiveFilters && 'ring-2 ring-primary-500'
              )}
            >
              <FunnelIcon className="w-4 h-4" />
              Filters
              {hasActiveFilters && (
                <span className="bg-primary-600 text-white text-xs px-1.5 rounded-full">
                  {[search, selectedDepartment, selectedBatch, selectedStatus].filter(Boolean).length}
                </span>
              )}
            </button>
          </div>

          {/* Filter Options */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="label">Department</label>
                  <select
                    value={selectedDepartment}
                    onChange={(e) => {
                      setSelectedDepartment(e.target.value);
                      setPage(1);
                    }}
                    className="input"
                  >
                    <option value="">All Departments</option>
                    {departments?.map((dept: any) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.code} - {dept.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label">Year Batch</label>
                  <select
                    value={selectedBatch}
                    onChange={(e) => {
                      setSelectedBatch(e.target.value);
                      setPage(1);
                    }}
                    className="input"
                  >
                    <option value="">All Batches</option>
                    {batches?.map((batch: any) => (
                      <option key={batch.id} value={batch.year}>
                        {batch.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label">Account Status</label>
                  <select
                    value={selectedStatus}
                    onChange={(e) => {
                      setSelectedStatus(e.target.value);
                      setPage(1);
                    }}
                    className="input"
                  >
                    <option value="">All Statuses</option>
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>

              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="mt-4 text-sm text-primary-600 hover:text-primary-700"
                >
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </div>

        {/* Students Table */}
        <div className="card overflow-hidden">
          {studentsLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : studentsData?.students?.length === 0 ? (
            <div className="text-center py-12">
              <UserGroupIcon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No students found</p>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="mt-2 text-primary-600 hover:text-primary-700 text-sm"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                        Student
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                        Roll Number
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                        Department
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                        Batch
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                        Status
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">
                        Exams
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {studentsData?.students?.map((student: Student) => (
                      <tr
                        key={student.id}
                        className={clsx(
                          'hover:bg-gray-50 transition-colors',
                          selectedStudent === student.id && 'bg-primary-50'
                        )}
                      >
                        <td className="py-3 px-4">
                          <div>
                            <p className="font-medium text-gray-900">{student.name}</p>
                            <p className="text-sm text-gray-500">{student.email}</p>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-gray-600">
                          {student.roll_number || '-'}
                        </td>
                        <td className="py-3 px-4">
                          {student.department_code ? (
                            <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-sm">
                              {student.department_code}
                            </span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-gray-600">
                          {student.year_batch || '-'}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={clsx(
                              'px-2 py-1 rounded text-sm font-medium',
                              getStatusBadge(student.account_status)
                            )}
                          >
                            {student.account_status}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-gray-600">{student.exams_taken}</span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => setSelectedStudent(student.id)}
                            className="text-primary-600 hover:text-primary-700"
                          >
                            <EyeIcon className="w-5 h-5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {studentsData && studentsData.total_pages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
                  <p className="text-sm text-gray-600">
                    Showing {(page - 1) * limit + 1} to{' '}
                    {Math.min(page * limit, studentsData.total)} of {studentsData.total} students
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage(page - 1)}
                      disabled={page === 1}
                      className="btn-secondary text-sm disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setPage(page + 1)}
                      disabled={page >= studentsData.total_pages}
                      className="btn-secondary text-sm disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Student Details Sidebar */}
      {selectedStudent && (
        <div className="fixed right-0 top-0 h-full w-96 bg-white border-l border-gray-200 shadow-lg overflow-y-auto z-40">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-900">Student Details</h2>
              <button
                onClick={() => setSelectedStudent(null)}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {detailsLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              </div>
            ) : studentDetails ? (
              <>
                {/* Student Info */}
                <div className="mb-6">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center">
                      <UserIcon className="w-8 h-8 text-primary-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {studentDetails.student.name}
                      </h3>
                      <p className="text-gray-500">{studentDetails.student.email}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <AcademicCapIcon className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-600">Roll Number:</span>
                      <span className="font-medium">
                        {studentDetails.student.roll_number || 'Not set'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <BuildingOfficeIcon className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-600">Department:</span>
                      <span className="font-medium">
                        {studentDetails.student.department_code || 'Not assigned'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <CalendarIcon className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-600">Batch:</span>
                      <span className="font-medium">
                        {studentDetails.student.year_batch || 'Not set'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <DocumentTextIcon className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-600">Registered:</span>
                      <span className="font-medium">
                        {new Date(studentDetails.student.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Status Management */}
                <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                  <label className="label">Account Status</label>
                  <select
                    value={studentDetails.student.account_status}
                    onChange={(e) =>
                      updateStatusMutation.mutate({
                        id: studentDetails.student.id,
                        status: e.target.value as 'active' | 'disabled' | 'suspended',
                      })
                    }
                    className="input"
                    disabled={updateStatusMutation.isPending}
                  >
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>

                {/* Exam History */}
                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">
                    Exam History ({studentDetails.exam_history?.length || 0})
                  </h4>

                  {studentDetails.exam_history?.length === 0 ? (
                    <p className="text-gray-500 text-sm">No exams taken yet</p>
                  ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {studentDetails.exam_history?.map((exam: StudentExamHistory) => (
                        <div
                          key={exam.session_id}
                          className="p-3 border border-gray-200 rounded-lg"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <h5 className="font-medium text-gray-900 text-sm">
                              {exam.exam_title}
                            </h5>
                            <span
                              className={clsx(
                                'text-xs px-2 py-0.5 rounded',
                                exam.passed
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-red-100 text-red-700'
                              )}
                            >
                              {exam.passed ? 'Passed' : 'Failed'}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                            <div>Score: {exam.percentage}%</div>
                            <div>Violations: {exam.violations_count}</div>
                            <div>Risk: {exam.highest_risk_score}</div>
                            <div>
                              {new Date(exam.start_time).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-gray-500">Failed to load student details</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
