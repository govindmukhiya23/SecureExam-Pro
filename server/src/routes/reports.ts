import { Router, Request, Response } from 'express';
import * as XLSX from 'xlsx';
import { supabaseAdmin, TABLES } from '../lib/supabase.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

// GET /api/reports/exam/:id - Get exam report
router.get('/exam/:id', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id: examId } = req.params;

    // Get exam details
    const { data: exam, error: examError } = await supabaseAdmin
      .from(TABLES.EXAMS)
      .select('*')
      .eq('id', examId)
      .eq('created_by', req.user!.userId)
      .single();

    if (examError || !exam) {
      return res.status(404).json({
        success: false,
        error: 'Exam not found',
      });
    }

    // Get all sessions for this exam
    const { data: sessions } = await supabaseAdmin
      .from(TABLES.EXAM_SESSIONS)
      .select('*, users(id, name, email, roll_number)')
      .eq('exam_id', examId);

    if (!sessions || sessions.length === 0) {
      return res.json({
        success: true,
        data: {
          exam_id: examId,
          exam_title: exam.title,
          total_students: 0,
          completed_students: 0,
          average_score: 0,
          highest_score: 0,
          lowest_score: 0,
          pass_rate: 0,
          total_violations: 0,
          screen_blanks_triggered: 0,
          students: [],
        },
      });
    }

    // Get questions for scoring
    const { data: questions } = await supabaseAdmin
      .from(TABLES.QUESTIONS)
      .select('id, points')
      .eq('exam_id', examId);

    const totalPoints = questions?.reduce((sum, q) => sum + q.points, 0) || 0;

    // Build student reports
    const studentReports = [];
    let totalScoreSum = 0;
    let passedCount = 0;
    let totalViolations = 0;
    let screenBlanksTriggered = 0;

    for (const session of sessions) {
      // Get answers for this session
      const { data: answers } = await supabaseAdmin
        .from(TABLES.ANSWERS)
        .select('*')
        .eq('session_id', session.id);

      const earnedPoints = answers?.reduce((sum, a) => sum + (a.points_earned || 0), 0) || 0;
      const percentage = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;
      const passed = percentage >= exam.passing_percentage;

      // Calculate time taken
      const startTime = new Date(session.start_time);
      const endTime = session.end_time ? new Date(session.end_time) : new Date();
      const timeTakenMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

      const studentReport = {
        user_id: session.user_id,
        name: session.users?.name || 'Unknown',
        email: session.users?.email || 'Unknown',
        roll_number: session.users?.roll_number,
        score: earnedPoints,
        percentage: Math.round(percentage * 100) / 100,
        passed,
        time_taken_minutes: timeTakenMinutes,
        violations_count: session.total_violations,
        highest_risk_score: session.highest_risk_score,
        screen_blank_triggered: session.screen_blank_triggered,
        start_ip: session.start_ip,
        end_ip: session.current_ip,
        device_changed: session.device_changed,
        submitted_at: session.submit_time,
        status: session.status,
      };

      studentReports.push(studentReport);

      if (session.status === 'submitted' || session.status === 'terminated') {
        totalScoreSum += percentage;
        if (passed) passedCount++;
      }
      totalViolations += session.total_violations;
      if (session.screen_blank_triggered) screenBlanksTriggered++;
    }

    const completedStudents = sessions.filter(s => 
      s.status === 'submitted' || s.status === 'terminated'
    ).length;

    const scores = studentReports.map(s => s.percentage);

    const report = {
      exam_id: examId,
      exam_title: exam.title,
      total_students: sessions.length,
      completed_students: completedStudents,
      average_score: completedStudents > 0 ? Math.round((totalScoreSum / completedStudents) * 100) / 100 : 0,
      highest_score: scores.length > 0 ? Math.max(...scores) : 0,
      lowest_score: scores.length > 0 ? Math.min(...scores) : 0,
      pass_rate: completedStudents > 0 ? Math.round((passedCount / completedStudents) * 10000) / 100 : 0,
      total_violations: totalViolations,
      screen_blanks_triggered: screenBlanksTriggered,
      students: studentReports,
    };

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error('Get report error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate report',
    });
  }
});

// GET /api/reports/exam/:id/excel - Download Excel report
router.get('/exam/:id/excel', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id: examId } = req.params;

    // Get exam details
    const { data: exam } = await supabaseAdmin
      .from(TABLES.EXAMS)
      .select('*')
      .eq('id', examId)
      .eq('created_by', req.user!.userId)
      .single();

    if (!exam) {
      return res.status(404).json({
        success: false,
        error: 'Exam not found',
      });
    }

    // Get all sessions with user data
    const { data: sessions } = await supabaseAdmin
      .from(TABLES.EXAM_SESSIONS)
      .select('*, users(id, name, email, roll_number)')
      .eq('exam_id', examId);

    // Get questions for total points
    const { data: questions } = await supabaseAdmin
      .from(TABLES.QUESTIONS)
      .select('id, points')
      .eq('exam_id', examId);

    const totalPoints = questions?.reduce((sum, q) => sum + q.points, 0) || 0;

    // Build Excel data
    const excelData = [];

    for (const session of sessions || []) {
      // Get answers
      const { data: answers } = await supabaseAdmin
        .from(TABLES.ANSWERS)
        .select('*')
        .eq('session_id', session.id);

      const earnedPoints = answers?.reduce((sum, a) => sum + (a.points_earned || 0), 0) || 0;
      const percentage = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;

      // Calculate time
      const startTime = new Date(session.start_time);
      const endTime = session.end_time ? new Date(session.end_time) : new Date();
      const timeTakenMinutes = Math.round((endTime.getTime() - startTime.getTime()) / 60000);

      excelData.push({
        'Student Name': session.users?.name || 'Unknown',
        'Email': session.users?.email || 'Unknown',
        'Roll Number': session.users?.roll_number || 'N/A',
        'Score': earnedPoints,
        'Total Marks': totalPoints,
        'Percentage': `${Math.round(percentage * 100) / 100}%`,
        'Status': percentage >= exam.passing_percentage ? 'PASS' : 'FAIL',
        'Time Taken (mins)': timeTakenMinutes,
        'Violations Count': session.total_violations,
        'Highest Risk Score': session.highest_risk_score,
        'Screen Blank Triggered': session.screen_blank_triggered ? 'Yes' : 'No',
        'Start IP': session.start_ip,
        'End IP': session.current_ip,
        'IP Changes': session.ip_change_count,
        'Device Changed': session.device_changed ? 'Yes' : 'No',
        'Submitted At': session.submit_time || 'Not Submitted',
        'Session Status': session.status,
      });
    }

    // Create workbook
    const workbook = XLSX.utils.book_new();
    
    // Summary sheet
    const summaryData = [
      { 'Metric': 'Exam Title', 'Value': exam.title },
      { 'Metric': 'Total Students', 'Value': sessions?.length || 0 },
      { 'Metric': 'Completed', 'Value': sessions?.filter(s => s.status === 'submitted').length || 0 },
      { 'Metric': 'Terminated', 'Value': sessions?.filter(s => s.status === 'terminated').length || 0 },
      { 'Metric': 'Total Violations', 'Value': sessions?.reduce((sum, s) => sum + s.total_violations, 0) || 0 },
      { 'Metric': 'Screen Blanks', 'Value': sessions?.filter(s => s.screen_blank_triggered).length || 0 },
      { 'Metric': 'Generated At', 'Value': new Date().toISOString() },
    ];

    const summarySheet = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

    // Students sheet
    const studentsSheet = XLSX.utils.json_to_sheet(excelData);
    XLSX.utils.book_append_sheet(workbook, studentsSheet, 'Students');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Set headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${exam.title.replace(/[^a-z0-9]/gi, '_')}_Report.xlsx"`);

    res.send(buffer);
  } catch (error) {
    console.error('Excel export error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate Excel report',
    });
  }
});

// GET /api/reports/dashboard - Admin dashboard stats
router.get('/dashboard', authenticate, requireAdmin, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    // Get exam counts
    const { count: totalExams } = await supabaseAdmin
      .from(TABLES.EXAMS)
      .select('*', { count: 'exact', head: true })
      .eq('created_by', userId);

    const { count: activeExams } = await supabaseAdmin
      .from(TABLES.EXAMS)
      .select('*', { count: 'exact', head: true })
      .eq('created_by', userId)
      .eq('status', 'active');

    // Get session counts
    const { data: adminExams } = await supabaseAdmin
      .from(TABLES.EXAMS)
      .select('id')
      .eq('created_by', userId);

    const examIds = adminExams?.map(e => e.id) || [];

    let totalSessions = 0;
    let activeSessions = 0;
    let totalViolations = 0;

    if (examIds.length > 0) {
      const { count: sessionsCount } = await supabaseAdmin
        .from(TABLES.EXAM_SESSIONS)
        .select('*', { count: 'exact', head: true })
        .in('exam_id', examIds);
      totalSessions = sessionsCount || 0;

      const { count: activeCount } = await supabaseAdmin
        .from(TABLES.EXAM_SESSIONS)
        .select('*', { count: 'exact', head: true })
        .in('exam_id', examIds)
        .in('status', ['started', 'in_progress']);
      activeSessions = activeCount || 0;

      const { data: sessionData } = await supabaseAdmin
        .from(TABLES.EXAM_SESSIONS)
        .select('total_violations')
        .in('exam_id', examIds);
      totalViolations = sessionData?.reduce((sum, s) => sum + s.total_violations, 0) || 0;
    }

    // Get recent exams
    const { data: recentExams } = await supabaseAdmin
      .from(TABLES.EXAMS)
      .select('id, title, status, created_at')
      .eq('created_by', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    res.json({
      success: true,
      data: {
        total_exams: totalExams || 0,
        active_exams: activeExams || 0,
        total_sessions: totalSessions,
        active_sessions: activeSessions,
        total_violations: totalViolations,
        recent_exams: recentExams || [],
      },
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard data',
    });
  }
});

export default router;
