"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sf1Upload = void 0;
exports.generateSF1 = generateSF1;
exports.getSF1Preview = getSF1Preview;
exports.uploadSF1Template = uploadSF1Template;
exports.downloadSF1Template = downloadSF1Template;
exports.resetSF1Template = resetSF1Template;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const exceljs_1 = __importDefault(require("exceljs"));
const multer_1 = __importDefault(require("multer"));
const db_1 = __importDefault(require("../lib/db"));
/* ─── Multer (kept for API compat — no longer used) ──────────────────────── */
const TMP_DIR = path_1.default.join(__dirname, '..', 'uploads', 'sf1_tmp');
if (!fs_1.default.existsSync(TMP_DIR))
    fs_1.default.mkdirSync(TMP_DIR, { recursive: true });
exports.sf1Upload = (0, multer_1.default)({
    dest: TMP_DIR,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const ext = path_1.default.extname(file.originalname).toLowerCase();
        if (['.xlsx', '.xls'].includes(ext))
            cb(null, true);
        else
            cb(new Error('Only .xlsx / .xls files are allowed'));
    },
});
/* ─── Paths ───────────────────────────────────────────────────────────────── */
// Default template in public/ folder (fallback if no custom template uploaded)
const DEFAULT_TEMPLATE_PATH = path_1.default.join(__dirname, '..', 'public', 'School Form 1 (SF1).xlsx');
// Custom uploaded template storage
const CUSTOM_TEMPLATE_PATH = path_1.default.join(__dirname, '..', 'uploads', 'sf1_template.xlsx');
const UPLOAD_DIR = path_1.default.join(__dirname, '..', 'uploads', 'sf1');
if (!fs_1.default.existsSync(UPLOAD_DIR))
    fs_1.default.mkdirSync(UPLOAD_DIR, { recursive: true });
/* ─── Layout ──────────────────────────────────────────────────────────────── */
// Each student occupies exactly 1 row in this template
const ROWS_PER_STUDENT = 1;
const DATA_START_ROW = 10; // first student row in the real template
const STUDENTS_PER_PAGE = 49; // template rows 10-58 = 49 student slots
/* ─── Header value cell positions (col numbers, 1-based A=1 B=2 …) ───────── */
// Row 4 - New template structure
const HDR_SCHOOL_ID_COL = 6; // F4  (single cell box)
const HDR_DIVISION_COL = 14; // N4  (N4:Q4 merged box)
const HDR_DISTRICT_COL = 21; // U4  (U4:X4 merged box)
// Row 6
const HDR_SCHOOL_NAME_COL = 6; // F6  (merged F6:L6)
const HDR_SCHOOL_YEAR_COL = 16; // P6  (merged P6:Q6)
const HDR_GRADE_LEVEL_COL = 21; // U6  (merged U6:V6)
const HDR_SECTION_COL = 24; // X6  (merged X6:Z6)
/* ─── Data column numbers (1-based) ──────────────────────────────────────── */
const DC = {
    LRN: 2, // B
    NAME: 3, // C  (merged C:F — write to C)
    SEX: 7, // G
    BIRTHDATE: 8, // H
    AGE: 9, // I
    BIRTH_PLACE: 10, // J  (merged J:K — write to J)
    MOTHER_TONGUE: 12, // L
    IP: 13, // M
    RELIGION: 14, // N
    ADDR_HOUSE: 15, // O
    ADDR_BRGAY: 16, // P
    ADDR_MUNI: 17, // Q
    ADDR_PROV: 18, // R  (merged R:S — write to R)
    FATHER: 20, // T  (merged T:U — write to T)
    MOTHER: 22, // V  (merged V:W — write to V)
    GUARD_NAME: 24, // X
    GUARD_REL: 25, // Y
    CONTACT: 26, // Z
    REMARKS: 27, // AA
};
/* ─── Concurrency guard ───────────────────────────────────────────────────── */
let sf1InProgress = false;
/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function formatBirthdate(raw) {
    if (!raw)
        return '';
    try {
        const d = new Date(raw);
        if (isNaN(d.getTime()))
            return String(raw);
        return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
    }
    catch {
        return String(raw);
    }
}
function normaliseGender(g) {
    if (!g)
        return '';
    const u = g.toUpperCase().trim();
    if (u === 'M' || u === 'MALE')
        return 'M';
    if (u === 'F' || u === 'FEMALE')
        return 'F';
    return g;
}
function buildDisplayName(s) {
    if (s.last_name && s.first_name) {
        const mid = s.middle_name ? ` ${s.middle_name}` : '';
        return `${s.last_name}, ${s.first_name}${mid}`;
    }
    return s.name || '';
}
/* ─── DB helpers ──────────────────────────────────────────────────────────── */
async function fetchSchoolSettings() {
    try {
        const [rows] = await db_1.default.query('SELECT * FROM school_settings WHERE id = 1 LIMIT 1');
        return rows[0] || {};
    }
    catch {
        return {};
    }
}
async function getTeacherRow(userId) {
    const [rows] = await db_1.default.query('SELECT t.id, t.user_id, t.name, t.section, t.subject, t.room FROM teachers t WHERE t.user_id = ? LIMIT 1', [userId]);
    return rows.length > 0 ? rows[0] : null;
}
async function fetchStudentsForSF1(teacherId, section) {
    const [rows] = await db_1.default.query(`SELECT DISTINCT
       s.id, s.lrn, s.name, s.last_name, s.first_name, s.middle_name,
       s.gender, s.section, s.grade,
       s.birthdate, s.age, s.birth_place,
       s.mother_tongue, s.ip_ethnic, s.religion,
       s.address_street, s.barangay, s.municipality, s.province,
       s.contact, s.sf1_remarks
     FROM assignment_students asg
     JOIN assignments a ON a.id = asg.assignment_id
     JOIN students s ON s.id = asg.student_id
     WHERE a.teacher_id = ?
       ${section ? 'AND LOWER(a.section) = LOWER(?)' : ''}
       AND s.is_active = 1
     ORDER BY s.name`, section ? [teacherId, section] : [teacherId]);
    const students = rows;
    for (const s of students) {
        const [parentRows] = await db_1.default.query(`SELECT p.name, ps.relationship, p.contact
       FROM parent_student ps JOIN parents p ON p.id = ps.parent_id
       WHERE ps.student_id = ? ORDER BY p.id`, [s.id]);
        s.parents = parentRows;
    }
    return students;
}
function resolveParents(parents) {
    if (!parents?.length)
        return { father: '', mother: '', guardianName: '', guardianRel: '', contact: '' };
    const dad = parents.find(p => { const r = (p.relationship || '').toLowerCase(); return r.includes('father') || r === 'dad' || r === 'tatay'; });
    const mom = parents.find(p => { const r = (p.relationship || '').toLowerCase(); return r.includes('mother') || r === 'mom' || r === 'nanay'; });
    const grd = parents.find(p => p !== dad && p !== mom);
    const ctct = dad || mom || grd;
    return { father: dad?.name || '', mother: mom?.name || '', guardianName: grd?.name || '', guardianRel: grd?.relationship || '', contact: ctct?.contact || '' };
}
/* ─── Fill a worksheet loaded from the real SF1 template ─────────────────── */
function fillSF1Sheet(ws, students, schoolInfo) {
    // Border style for value boxes
    const boxBorder = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
    };
    // No border style (to remove unwanted boxes)
    const noBorder = {
        top: { style: undefined },
        left: { style: undefined },
        bottom: { style: undefined },
        right: { style: undefined },
    };
    /* ── Header values ── */
    // Row 4 - School ID box (F4 single cell)
    ws.getCell(4, 6).value = schoolInfo.school_id || '';
    ws.getCell(4, 6).border = boxBorder;
    // Row 4 - Remove G4 border if it exists (part of Region VIII label area)
    ws.getCell(4, 7).border = noBorder;
    // Row 4 - Remove any borders from H4:K4 (Region VIII label area)
    for (let col = 8; col <= 11; col++) {
        ws.getCell(4, col).border = noBorder;
    }
    // Row 4 - Division box (N4:Q4) - ensure borders on all cells
    ws.getCell(4, HDR_DIVISION_COL).value = schoolInfo.division || '';
    for (let col = 14; col <= 17; col++) {
        ws.getCell(4, col).border = boxBorder;
    }
    // Row 4 - District box (U4:X4) - ensure borders on all cells
    ws.getCell(4, HDR_DISTRICT_COL).value = schoolInfo.district || '';
    for (let col = 21; col <= 24; col++) {
        ws.getCell(4, col).border = boxBorder;
    }
    // Row 6 - School Name box (F6:L6)
    ws.getCell(6, HDR_SCHOOL_NAME_COL).value = schoolInfo.school_name || '';
    for (let col = 6; col <= 12; col++) {
        ws.getCell(6, col).border = boxBorder;
    }
    // Row 6 - School Year box (P6:Q6)
    ws.getCell(6, HDR_SCHOOL_YEAR_COL).value = schoolInfo.school_year || '';
    ws.getCell(6, 16).border = boxBorder;
    ws.getCell(6, 17).border = boxBorder;
    // Row 6 - Grade Level box (U6:V6)
    ws.getCell(6, HDR_GRADE_LEVEL_COL).value = schoolInfo.grade_level || '';
    ws.getCell(6, 21).border = boxBorder;
    ws.getCell(6, 22).border = boxBorder;
    // Row 6 - Section box (X6:Z6)
    ws.getCell(6, HDR_SECTION_COL).value = schoolInfo.section || '';
    for (let col = 24; col <= 26; col++) {
        ws.getCell(6, col).border = boxBorder;
    }
    /* ── Student data rows ── */
    students.forEach((s, i) => {
        if (i >= STUDENTS_PER_PAGE)
            return; // template only has slots for 49 students
        // Each student uses 1 row
        const row = DATA_START_ROW + (i * ROWS_PER_STUDENT);
        const pg = resolveParents(s.parents || []);
        const write = (col, val) => {
            const cell = ws.getCell(row, col);
            cell.value = val ?? '';
            // Preserve existing font but ensure size is at least 18 (to match Name column)
            // The template uses 18pt for most data columns, but LRN was 10pt
            if (cell.font) {
                cell.font = { ...cell.font, size: 18 };
            }
            else {
                cell.font = { name: 'Arial Narrow', size: 18 };
            }
        };
        write(DC.LRN, s.lrn || '');
        write(DC.NAME, buildDisplayName(s));
        write(DC.SEX, normaliseGender(s.gender));
        write(DC.BIRTHDATE, formatBirthdate(s.birthdate));
        write(DC.AGE, s.age || '');
        write(DC.BIRTH_PLACE, s.birth_place || '');
        write(DC.MOTHER_TONGUE, s.mother_tongue || '');
        write(DC.IP, s.ip_ethnic || '');
        write(DC.RELIGION, s.religion || '');
        write(DC.ADDR_HOUSE, s.address_street || '');
        write(DC.ADDR_BRGAY, s.barangay || '');
        write(DC.ADDR_MUNI, s.municipality || '');
        write(DC.ADDR_PROV, s.province || '');
        write(DC.FATHER, pg.father);
        write(DC.MOTHER, pg.mother);
        write(DC.GUARD_NAME, pg.guardianName);
        write(DC.GUARD_REL, pg.guardianRel);
        write(DC.CONTACT, pg.contact || s.contact || '');
        write(DC.REMARKS, s.sf1_remarks || '');
    });
}
/* ═══════════════════════════════════════════════════════════════════════════
   CONTROLLER: POST /api/sf1/generate
═══════════════════════════════════════════════════════════════════════════ */
async function generateSF1(req, res) {
    // Discard any uploaded template file (not used - we use stored template)
    if (req.file) {
        try {
            fs_1.default.unlinkSync(req.file.path);
        }
        catch { /* ignore */ }
    }
    if (sf1InProgress) {
        res.status(503).json({ error: 'Another SF1 is currently being generated. Please try again.' });
        return;
    }
    sf1InProgress = true;
    try {
        // Use custom template if uploaded, otherwise use default
        const TEMPLATE_PATH = fs_1.default.existsSync(CUSTOM_TEMPLATE_PATH)
            ? CUSTOM_TEMPLATE_PATH
            : DEFAULT_TEMPLATE_PATH;
        if (!fs_1.default.existsSync(TEMPLATE_PATH)) {
            console.error('[SF1] Template not found:', TEMPLATE_PATH);
            res.status(500).json({ error: `SF1 template not found at: ${TEMPLATE_PATH}` });
            return;
        }
        console.log('[SF1] Using template:', TEMPLATE_PATH);
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const teacher = await getTeacherRow(userId);
        if (!teacher) {
            res.status(404).json({ error: 'Teacher profile not found' });
            return;
        }
        const section = (req.body.section || teacher.section || '').trim();
        const ss = await fetchSchoolSettings();
        const schoolInfo = {
            school_id: ss.school_id || '',
            division: ss.division || '',
            district: ss.district || '',
            school_name: ss.school_name || '',
            school_year: ss.school_year || '',
            grade_level: '',
            section: section.includes(' - ') ? section.split(' - ')[1] : section,
        };
        const allStudents = await fetchStudentsForSF1(teacher.id, section);
        if (allStudents.length === 0) {
            res.status(404).json({ error: 'No students found for this section.' });
            return;
        }
        schoolInfo.grade_level = allStudents[0]?.grade || '';
        // Split students into pages of STUDENTS_PER_PAGE
        const pages = [];
        for (let i = 0; i < allStudents.length; i += STUDENTS_PER_PAGE) {
            pages.push(allStudents.slice(i, i + STUDENTS_PER_PAGE));
        }
        const workbook = new exceljs_1.default.Workbook();
        workbook.creator = 'AttendBox';
        workbook.created = new Date();
        for (let p = 0; p < pages.length; p++) {
            // Load a fresh copy of the real template for each page
            const tmpl = new exceljs_1.default.Workbook();
            await tmpl.xlsx.readFile(TEMPLATE_PATH);
            const srcWs = tmpl.worksheets[0];
            const pageLabel = pages.length > 1
                ? `Page ${p + 1}`
                : (schoolInfo.section || 'School Form 1 (SF1)');
            const destWs = workbook.addWorksheet(pageLabel);
            // Copy column widths
            srcWs.columns.forEach((col, idx) => {
                if (col.width)
                    destWs.getColumn(idx + 1).width = col.width;
            });
            // Copy all rows: values + styles
            srcWs.eachRow({ includeEmpty: true }, (row, rowNum) => {
                const destRow = destWs.getRow(rowNum);
                destRow.height = row.height ?? 15;
                row.eachCell({ includeEmpty: true }, (cell, colNum) => {
                    const dest = destWs.getCell(rowNum, colNum);
                    dest.value = cell.value;
                    try {
                        if (cell.style)
                            dest.style = JSON.parse(JSON.stringify(cell.style));
                    }
                    catch { /* skip style errors */ }
                });
            });
            // Copy merged cells
            if (srcWs.model?.merges) {
                srcWs.model.merges.forEach((range) => {
                    try {
                        destWs.mergeCells(range);
                    }
                    catch { /* already merged */ }
                });
            }
            // Copy images (logo) - place in A1:C7 area like the template
            try {
                const imgs = srcWs.getImages();
                if (imgs.length > 0) {
                    imgs.forEach((img) => {
                        try {
                            const media = tmpl.getImage(img.imageId);
                            if (!media?.buffer)
                                return;
                            const newId = workbook.addImage({ buffer: media.buffer, extension: media.extension });
                            // Place logo from A1 to C7 (larger area for better visibility)
                            // This creates a more square region to prevent stretching
                            destWs.addImage(newId, {
                                tl: { col: 0, row: 0 }, // A1
                                br: { col: 2, row: 6 }, // C7
                                editAs: 'undefined'
                            });
                        }
                        catch (err) {
                            console.error('Error copying image:', err);
                        }
                    });
                }
            }
            catch (err) {
                console.error('Error copying images:', err);
            }
            // Fill data into the copied worksheet
            fillSF1Sheet(destWs, pages[p], schoolInfo);
        }
        const outputPath = path_1.default.join(UPLOAD_DIR, `SF1_${Date.now()}.xlsx`);
        await workbook.xlsx.writeFile(outputPath);
        const safeSec = schoolInfo.section.replace(/\s+/g, '_') || 'Section';
        const safeYear = (ss.school_year || String(new Date().getFullYear())).replace(/[^a-zA-Z0-9-]/g, '');
        const filename = `SF1_${safeSec}_${safeYear}.xlsx`;
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        const stream = fs_1.default.createReadStream(outputPath);
        stream.pipe(res);
        stream.on('end', () => fs_1.default.unlink(outputPath, () => { }));
        stream.on('error', () => { if (!res.headersSent)
            res.status(500).end(); });
        console.log(`[SF1] ✅ section="${section}" pages=${pages.length} students=${allStudents.length}`);
    }
    catch (err) {
        console.error('[SF1] generateSF1 error:', err);
        if (!res.headersSent)
            res.status(500).json({ error: err.message ?? 'Server error' });
    }
    finally {
        sf1InProgress = false;
    }
}
/* ═══════════════════════════════════════════════════════════════════════════
   CONTROLLER: GET /api/sf1/preview
═══════════════════════════════════════════════════════════════════════════ */
async function getSF1Preview(req, res) {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const teacher = await getTeacherRow(userId);
        if (!teacher) {
            res.status(404).json({ error: 'Teacher profile not found' });
            return;
        }
        const section = (req.query.section || teacher.section || '').trim();
        const students = await fetchStudentsForSF1(teacher.id, section);
        res.json({
            section,
            count: students.length,
            page_count: Math.ceil(students.length / STUDENTS_PER_PAGE),
            students: students.map((s, i) => {
                const pg = resolveParents(s.parents || []);
                return {
                    row_number: i + 1,
                    lrn: s.lrn,
                    name: buildDisplayName(s),
                    gender: normaliseGender(s.gender),
                    birthdate: formatBirthdate(s.birthdate),
                    age: s.age,
                    birth_place: s.birth_place,
                    mother_tongue: s.mother_tongue,
                    ip_ethnic: s.ip_ethnic,
                    religion: s.religion,
                    address: s.address_street,
                    barangay: s.barangay,
                    municipality: s.municipality,
                    province: s.province,
                    father: pg.father,
                    mother: pg.mother,
                    guardian: pg.guardianName,
                    guardian_rel: pg.guardianRel,
                    contact: pg.contact || s.contact,
                    remarks: s.sf1_remarks,
                    section: s.section,
                    grade: s.grade,
                };
            }),
        });
    }
    catch (err) {
        console.error('[SF1] getSF1Preview error:', err);
        res.status(500).json({ error: err.message ?? 'Server error' });
    }
}
/* ═══════════════════════════════════════════════════════════════════════════
   CONTROLLER: POST /api/sf1/upload-template
═══════════════════════════════════════════════════════════════════════════ */
async function uploadSF1Template(req, res) {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No template file uploaded' });
            return;
        }
        // Move uploaded file to custom template location
        fs_1.default.copyFileSync(req.file.path, CUSTOM_TEMPLATE_PATH);
        fs_1.default.unlinkSync(req.file.path); // Clean up temp file
        console.log(`[SF1] ✅ Custom template uploaded: ${req.file.originalname}`);
        res.json({
            message: 'SF1 template uploaded successfully',
            filename: req.file.originalname
        });
    }
    catch (err) {
        console.error('[SF1] uploadSF1Template error:', err);
        res.status(500).json({ error: err.message ?? 'Server error' });
    }
}
/* ═══════════════════════════════════════════════════════════════════════════
   CONTROLLER: GET /api/sf1/download-template
═══════════════════════════════════════════════════════════════════════════ */
async function downloadSF1Template(req, res) {
    try {
        // Download custom template if exists, otherwise download default
        const templatePath = fs_1.default.existsSync(CUSTOM_TEMPLATE_PATH)
            ? CUSTOM_TEMPLATE_PATH
            : DEFAULT_TEMPLATE_PATH;
        if (!fs_1.default.existsSync(templatePath)) {
            res.status(404).json({ error: 'SF1 template not found' });
            return;
        }
        const filename = 'School_Form_1_Template.xlsx';
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        const stream = fs_1.default.createReadStream(templatePath);
        stream.pipe(res);
        stream.on('error', () => { if (!res.headersSent)
            res.status(500).end(); });
        console.log(`[SF1] ✅ Template downloaded: ${filename}`);
    }
    catch (err) {
        console.error('[SF1] downloadSF1Template error:', err);
        if (!res.headersSent)
            res.status(500).json({ error: err.message ?? 'Server error' });
    }
}
/* ═══════════════════════════════════════════════════════════════════════════
   CONTROLLER: DELETE /api/sf1/reset-template
═══════════════════════════════════════════════════════════════════════════ */
async function resetSF1Template(req, res) {
    try {
        if (fs_1.default.existsSync(CUSTOM_TEMPLATE_PATH)) {
            fs_1.default.unlinkSync(CUSTOM_TEMPLATE_PATH);
            console.log(`[SF1] ✅ Custom template deleted, reverting to default`);
            res.json({ message: 'SF1 template reset to default' });
        }
        else {
            res.json({ message: 'Already using default template' });
        }
    }
    catch (err) {
        console.error('[SF1] resetSF1Template error:', err);
        res.status(500).json({ error: err.message ?? 'Server error' });
    }
}
