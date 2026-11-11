import { Request, Response } from 'express';
import pool from '../lib/db';
import { format, subDays } from 'date-fns';

// ─── GET /api/reports/attendance-trend ────────────────────────────────
export async function getAttendanceTrend(req: Request, res: Response): Promise<void> {
  try {
    const days = parseInt(req.query.days as string) || 7;
    
    // Get attendance percentage for last N days
    const results = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = format(subDays(new Date(), i), 'yyyy-MM-dd');
      
      // Count total students
      const [totalStudents] = await pool.execute(
        'SELECT COUNT(*) as total FROM students WHERE is_active = 1'
      ) as any[];
      const total = (totalStudents as any[])[0]?.total || 0;
      
      // Count students who attended (Time-In or Late) — only verified records
      const [attended] = await pool.execute(
        `SELECT COUNT(DISTINCT student_id) as count 
         FROM attendance 
         WHERE date = ? 
         AND status IN ('Time-In', 'Late')`,
        [date]
      ) as any[];
      const present = (attended as any[])[0]?.count || 0;
      
      // Calculate percentage
      const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
      
      results.push({
        date: format(new Date(date + 'T00:00:00'), 'MMM dd'),
        attendance: percentage,
        present,
        total,
      });
    }
    
    // Calculate summary statistics
    const percentages = results.map(r => r.attendance);
    const summary = {
      average: percentages.length > 0 
        ? Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length) 
        : 0,
      highest: percentages.length > 0 ? Math.max(...percentages) : 0,
      lowest: percentages.length > 0 ? Math.min(...percentages) : 0,
    };
    
    res.json({
      trend: results,
      summary,
    });
  } catch (err) {
    console.error('getAttendanceTrend error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── GET /api/reports/daily-summary ───────────────────────────────────
export async function getDailySummary(req: Request, res: Response): Promise<void> {
  try {
    const date = (req.query.date as string) || format(new Date(), 'yyyy-MM-dd');
    
    // Total students
    const [totalStudents] = await pool.execute(
      'SELECT COUNT(*) as total FROM students WHERE is_active = 1'
    ) as any[];
    const total = (totalStudents as any[])[0]?.total || 0;
    
    // Present students (Time-In or Late)
    const [presentStudents] = await pool.execute(
      `SELECT COUNT(DISTINCT student_id) as count 
       FROM attendance 
       WHERE date = ? 
       AND status IN ('Time-In', 'Late')`,
      [date]
    ) as any[];
    const present = (presentStudents as any[])[0]?.count || 0;
    
    // Late students
    const [lateStudents] = await pool.execute(
      `SELECT COUNT(DISTINCT student_id) as count 
       FROM attendance 
       WHERE date = ? 
       AND status = 'Late'`,
      [date]
    ) as any[];
    const late = (lateStudents as any[])[0]?.count || 0;
    
    // Absent students
    const absent = total - present;
    
    // Attendance percentage
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
    
    res.json({
      date,
      total,
      present,
      late,
      absent,
      percentage,
    });
  } catch (err) {
    console.error('getDailySummary error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
