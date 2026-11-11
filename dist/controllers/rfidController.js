"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRfidLog = createRfidLog;
exports.getRfidLogs = getRfidLogs;
exports.getRfidDashboard = getRfidDashboard;
const db_1 = __importDefault(require("../lib/db"));
function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
async function fetchRfidData(uid) {
    const hasFilter = typeof uid === 'string' && uid.length > 0;
    const filterValue = hasFilter ? uid.trim().toUpperCase() : undefined;
    const whereClause = hasFilter ? 'WHERE UPPER(uid) = ?' : '';
    const params = hasFilter ? [filterValue] : [];
    const queryParams = params.length > 0 ? params : [];
    const [allRows] = await db_1.default.execute(`SELECT r.id,
            r.uid,
            r.USTP_CDO,
            r.student_name,
            r.timestamp,
            r.created_at,
            t.name AS tag_name
     FROM RFID_LOGS r
     LEFT JOIN rfid_tags t ON UPPER(r.uid) = UPPER(t.uid)
     ${whereClause}
     ORDER BY r.timestamp DESC
     LIMIT 100`, queryParams.length > 0 ? queryParams : undefined);
    const [uniqueRows] = await db_1.default.execute(`SELECT r.uid,
            r.USTP_CDO,
            r.student_name,
            t.name AS tag_name,
            MAX(r.timestamp) AS last_seen
     FROM RFID_LOGS r
     LEFT JOIN rfid_tags t ON UPPER(r.uid) = UPPER(t.uid)
     ${whereClause}
     GROUP BY r.uid, r.USTP_CDO, r.student_name, t.name
     ORDER BY last_seen DESC`, queryParams.length > 0 ? queryParams : undefined);
    return { allRows, uniqueRows };
}
async function createRfidLog(req, res) {
    try {
        const uid = String(req.body?.uid || req.body?.card_uid || req.body?.cardId || '').trim();
        const location = 'Inside';
        const timestamp = req.body?.timestamp
            ? String(req.body.timestamp).trim()
            : new Date().toISOString().slice(0, 19).replace('T', ' ');
        if (!uid) {
            res.status(400).json({ error: 'uid is required' });
            return;
        }
        // Lookup tag mapping to get a student/tag name
        let studentName = null;
        try {
            const [rows] = await db_1.default.execute(`SELECT name FROM rfid_tags WHERE UPPER(uid) = UPPER(?)`, [uid]);
            if (Array.isArray(rows) && rows.length > 0) {
                studentName = String(rows[0].name);
            }
        }
        catch (e) {
            // ignore lookup errors
        }
        await db_1.default.execute(`INSERT INTO RFID_LOGS (uid, USTP_CDO, timestamp, student_name)
       VALUES (?, ?, ?, ?)`, [uid.toUpperCase(), location, timestamp, studentName]);
        res.status(201).json({ message: 'RFID log saved', uid: uid.toUpperCase(), USTP_CDO: location, student_name: studentName });
    }
    catch (err) {
        console.error('createRfidLog error:', err);
        res.status(500).json({ error: 'Unable to save RFID log' });
    }
}
async function getRfidLogs(req, res) {
    try {
        const uidFilter = typeof req.query.uid === 'string'
            ? req.query.uid.trim()
            : undefined;
        const { allRows, uniqueRows } = await fetchRfidData(uidFilter);
        res.json({
            filterUid: uidFilter || null,
            totalRecords: allRows.length,
            uniqueUids: uniqueRows.length,
            records: allRows,
            latestUids: uniqueRows,
        });
    }
    catch (err) {
        console.error('getRfidLogs error:', err);
        res.status(500).json({ error: 'Unable to load RFID logs' });
    }
}
async function getRfidDashboard(req, res) {
    try {
        const uidFilter = typeof req.query.uid === 'string'
            ? req.query.uid.trim()
            : undefined;
        const { allRows, uniqueRows } = await fetchRfidData(uidFilter);
        const uniqueCount = uniqueRows.length;
        const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>RFID Attendance Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f4f6fb; color: #333; padding: 20px; }
        .container { max-width: 1200px; margin: 0 auto; }
        header { background: #ffffff; padding: 24px; border-radius: 12px; box-shadow: 0 12px 28px rgba(0,0,0,0.06); margin-bottom: 24px; }
        h1 { margin-bottom: 10px; }
        .subtitle { color: #666; font-size: 14px; }
        .section { background: #ffffff; border-radius: 12px; padding: 24px; box-shadow: 0 12px 28px rgba(0,0,0,0.06); margin-bottom: 24px; }
        .section h2 { margin-bottom: 16px; color: #222; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 20px; }
        .stat-card { background: linear-gradient(135deg, #4f7ef7, #6c56d3); color: white; padding: 18px; border-radius: 12px; }
        .stat-card h3 { margin-bottom: 8px; font-size: 13px; opacity: 0.8; }
        .stat-card .value { font-size: 28px; font-weight: 700; }
        .refresh-btn { border: none; background: #4f7ef7; color: white; padding: 10px 18px; border-radius: 8px; cursor: pointer; font-size: 14px; }
        .refresh-btn:hover { background: #3c68d4; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { padding: 14px 12px; text-align: left; border-bottom: 1px solid #e6eaf0; }
        thead { background: #4f7ef7; color: white; }
        tbody tr:hover { background: #f7f9ff; }
        .uid { font-family: 'Courier New', monospace; color: #3c47a0; }
        .timestamp { color: #555; font-size: 13px; }
        .empty { color: #777; padding: 32px; text-align: center; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>🧾 RFID Attendance Dashboard</h1>
            <p class="subtitle">Stored RFID reads from ESP32, searchable by UID.</p>
        </header>

        <div class="section">
            <h2>Summary</h2>
            <div class="stats">
                <div class="stat-card"><h3>Total Records</h3><div class="value">${allRows.length}</div></div>
                <div class="stat-card"><h3>Unique UIDs</h3><div class="value">${uniqueCount}</div></div>
            </div>
            <button class="refresh-btn" onclick="location.reload()">Refresh</button>
        </div>

        <div class="section">
            <h2>Latest RFID Logs</h2>
            ${allRows.length > 0 ? `
            <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>UID</th>
                    <th>Name</th>
                    <th>Location</th>
                    <th>Timestamp</th>
                    <th>Logged At</th>
                  </tr>
                </thead>
                <tbody>
                  ${allRows.map((row) => `
                    <tr>
                      <td>${escapeHtml(String(row.id))}</td>
                      <td class="uid">${escapeHtml(String(row.uid))}</td>
                      <td>${escapeHtml(String(row.tag_name || 'Unknown'))}</td>
                      <td>${escapeHtml(String(row.USTP_CDO || 'Inside'))}</td>
                      <td class="timestamp">${escapeHtml(String(row.timestamp))}</td>
                      <td class="timestamp">${escapeHtml(String(row.created_at))}</td>
                    </tr>
                  `).join('')}
                </tbody>
            </table>
            ` : '<p class="empty">No RFID logs yet. Waiting for ESP32 POST data...</p>'}
        </div>
    </div>
</body>
</html>`;
        res.type('html').send(html);
    }
    catch (err) {
        console.error('getRfidDashboard error:', err);
        res.status(500).send('Unable to load RFID dashboard');
    }
}
