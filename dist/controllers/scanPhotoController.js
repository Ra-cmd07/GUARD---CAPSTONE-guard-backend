"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadScanPhoto = uploadScanPhoto;
exports.getScanPhotos = getScanPhotos;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const db_1 = __importDefault(require("../lib/db"));
// ─── POST /api/scan-photos ────────────────────────────────────────────
async function uploadScanPhoto(req, res) {
    try {
        const { student_name, status, photo_base64 } = req.body;
        if (!photo_base64 || !student_name) {
            res.status(400).json({ error: 'student_name and photo_base64 are required' });
            return;
        }
        // Ensure uploads directory exists
        const uploadsDir = path_1.default.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads', 'scans');
        if (!fs_1.default.existsSync(uploadsDir)) {
            fs_1.default.mkdirSync(uploadsDir, { recursive: true });
        }
        // Clean base64 string
        const base64Data = photo_base64.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        const filename = `scan_${Date.now()}_${student_name.replace(/\s+/g, '_')}.jpg`;
        const filepath = path_1.default.join(uploadsDir, filename);
        fs_1.default.writeFileSync(filepath, buffer);
        const photoPath = `/uploads/scans/${filename}`;
        await db_1.default.execute('INSERT INTO scan_photos (student_name, status, photo_path) VALUES (?, ?, ?)', [student_name, status || null, photoPath]);
        res.status(201).json({ message: 'Photo saved', path: photoPath });
    }
    catch (err) {
        console.error('uploadScanPhoto error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}
// ─── GET /api/scan-photos?student_name= ──────────────────────────────
async function getScanPhotos(req, res) {
    try {
        const { student_name } = req.query;
        let query = 'SELECT * FROM scan_photos';
        let params = [];
        if (student_name) {
            query += ' WHERE student_name LIKE ?';
            params = [`%${student_name}%`];
        }
        query += ' ORDER BY captured_at DESC LIMIT 100';
        const [rows] = await db_1.default.execute(query, params);
        res.json(rows);
    }
    catch (err) {
        console.error('getScanPhotos error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}
