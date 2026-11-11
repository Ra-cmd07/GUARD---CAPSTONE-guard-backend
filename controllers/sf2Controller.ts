/***
 * sf2Controller.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * ChildTrack HS Edition — DepEd School Form 2 (SF2) Generator
 *
 * v17 — Adapted for AttendBox:
 *   - getCoordinationStatus uses assignments table (not student_schedules)
 *   - student name uses last_name/first_name/middle_name if available
 *   - sf2_reports table created via migration
 */
import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import pool from '../lib/db';
import { RowDataPacket } from 'mysql2';
import multer from 'multer';

console.log('[SF2] ✅ v17 — AttendBox edition');

/* ─── Multer — disk storage (template upload) ─────────────────────────────── */
export const sf2Upload = multer({
  dest: path.join(__dirname, '..', '..', 'uploads', 'sf2_tmp'),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls'].includes(ext)) cb(null, true);
    else cb(new Error('Only .xlsx / .xls files are allowed'));
  },
});

/* ─── Output directory ────────────────────────────────────────────────────── */
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'sf2');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ─── DepEd SF2 template layout constants ─────────────────────────────────── */
const DATE_ROW         = 11;
const DAY_ROW          = 12;
const BOYS_START_ROW   = 14;
const BOYS_END_ROW     = 34;
const GIRLS_START_ROW  = 36;
const GIRLS_END_ROW    = 60;
const NAME_COLUMN      = 2;
const FIRST_DAY_COLUMN = 4;
const ROW_HEIGHT       = 22;

/* ─── Fill colours ────────────────────────────────────────────────────────── */
const GREEN = 'FF00B050';
const RED   = 'FFFF0000';
const FULL_GREEN_FILL: ExcelJS.Fill = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN },
};
const RED_FILL: ExcelJS.Fill = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: RED },
};
// Use white solid fill (not 'none') — 'pattern: none' doesn't reliably override
// pre-existing fills in template cells when opened in WPS/LibreOffice
const NO_FILL: ExcelJS.Fill = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' },
} as ExcelJS.Fill;

/* ─── Status helpers ──────────────────────────────────────────────────────── */
function isAttended(status: string): boolean {
  const s = (status || '').toLowerCase().replace(/[-_\s]/g, '');
  if (s === 'absent')     return false;
  if (s === 'droppedout') return false;
  return true;
}

/* ─── Triangle Drawing helpers ────────────────────────────────────────────── */
interface CellPos { col: number; row: number; }

function buildDrawingXml(amCells: CellPos[], pmCells: CellPos[]): string {
  let shapeId = 100;
  const shapes: string[] = [];

  const makeShape = (pos: CellPos, isAM: boolean, id: number): string => {
    const flipAttr = isAM ? 'flipV="1"' : 'flipH="1"';
    return `  <xdr:twoCellAnchor editAs="absolute">` +
      `<xdr:from><xdr:col>${pos.col}</xdr:col><xdr:colOff>0</xdr:colOff>` +
      `<xdr:row>${pos.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
      `<xdr:to><xdr:col>${pos.col + 1}</xdr:col><xdr:colOff>0</xdr:colOff>` +
      `<xdr:row>${pos.row + 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
      `<xdr:sp macro="" textlink=""><xdr:nvSpPr>` +
      `<xdr:cNvPr id="${id}" name="${isAM ? 'AM' : 'PM'}_c${pos.col}_r${pos.row}"/>` +
      `<xdr:cNvSpPr><a:spLocks noGrp="1"/></xdr:cNvSpPr></xdr:nvSpPr>` +
      `<xdr:spPr><a:xfrm ${flipAttr}><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm>` +
      `<a:prstGeom prst="rtTriangle"><a:avLst/></a:prstGeom>` +
      `<a:solidFill><a:srgbClr val="00B050"/></a:solidFill>` +
      `<a:ln><a:noFill/></a:ln></xdr:spPr>` +
      `<xdr:style><a:lnRef idx="0"><a:schemeClr clr="accent1"/></a:lnRef>` +
      `<a:fillRef idx="0"><a:schemeClr clr="accent1"/></a:fillRef>` +
      `<a:effectRef idx="0"><a:schemeClr clr="accent1"/></a:effectRef>` +
      `<a:fontRef idx="minor"><a:schemeClr clr="lt1"/></a:fontRef></xdr:style>` +
      `<xdr:txBody><a:bodyPr/><a:lstStyle/><a:p/></xdr:txBody>` +
      `</xdr:sp><xdr:clientData/></xdr:twoCellAnchor>`;
  };

  for (const pos of amCells) shapes.push(makeShape(pos, true,  shapeId++));
  for (const pos of pmCells) shapes.push(makeShape(pos, false, shapeId++));

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"` +
    ` xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"` +
    ` xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `${shapes.join('\n')}</xdr:wsDr>`;
}

/* ─── JSZip DrawingML patch ───────────────────────────────────────────────── */
async function patchDrawings(
  filePath: string,
  amCells: CellPos[],
  pmCells: CellPos[],
): Promise<void> {
  if (amCells.length === 0 && pmCells.length === 0) return;

  const buf     = fs.readFileSync(filePath);
  const zip     = await JSZip.loadAsync(buf);
  const allKeys = Object.keys(zip.files);
  const sheetKey = allKeys.find(k => /xl\/worksheets\/sheet\d+\.xml$/.test(k));
  if (!sheetKey) throw new Error('Could not find worksheet in xlsx');

  const sheetXml     = await zip.file(sheetKey)!.async('string');
  const sheetName    = path.basename(sheetKey);
  const relsKey      = `xl/worksheets/_rels/${sheetName}.rels`;
  const drawingRelId = 'rId_drawing1';

  let relsXml = zip.file(relsKey)
    ? await zip.file(relsKey)!.async('string')
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`;

  if (!relsXml.includes('drawing')) {
    relsXml = relsXml.replace(
      '</Relationships>',
      `<Relationship Id="${drawingRelId}" ` +
      `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" ` +
      `Target="../drawings/drawing1.xml"/>\n</Relationships>`,
    );
  }

  let newSheetXml = sheetXml;
  if (!newSheetXml.includes('<drawing')) {
    newSheetXml = newSheetXml.replace(
      '</worksheet>',
      `<drawing r:id="${drawingRelId}"/></worksheet>`,
    );
    if (!newSheetXml.includes('xmlns:r=')) {
      newSheetXml = newSheetXml.replace(
        '<worksheet ',
        '<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ',
      );
    }
  }

  const drawingXml = buildDrawingXml(amCells, pmCells);

  let ctXml = await zip.file('[Content_Types].xml')!.async('string');
  if (!ctXml.includes('drawing1.xml')) {
    ctXml = ctXml.replace(
      '</Types>',
      `<Override PartName="/xl/drawings/drawing1.xml" ` +
      `ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>\n</Types>`,
    );
  }

  zip.file(sheetKey,                   newSheetXml);
  zip.file(relsKey,                    relsXml);
  zip.file('xl/drawings/drawing1.xml', drawingXml);
  zip.file('[Content_Types].xml',      ctXml);

  const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(filePath, out);
}

/* ─── Cell reset (preserves outer border from template) ──────────────────── */
function hardReset(cell: ExcelJS.Cell) {
  const b = (cell.border || {}) as any;
  const outerBorder = {
    top: b.top, left: b.left, bottom: b.bottom, right: b.right,
  };
  cell.value = null;
  cell.style = {
    font:      { name: 'Arial Narrow', size: 11 },
    alignment: { horizontal: 'center', vertical: 'middle' },
    border:    outerBorder as ExcelJS.Borders,
    numFmt:    'General',
    // Use white solid fill to override any pre-existing template fills
    fill:      { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } } as ExcelJS.Fill,
  };
  cell.border = outerBorder as ExcelJS.Borders;
}

/* ─── Utility ─────────────────────────────────────────────────────────────── */
const daysInMonth = (m: number, y: number) => new Date(y, m, 0).getDate();

/* ─── Name formatter — uses last/first/middle if available ───────────────── */
async function getFormattedName(
  studentName: string,
  lrn: string | null,
): Promise<string> {
  try {
    if (lrn) {
      const [rows]: any = await pool.execute(
        `SELECT last_name, first_name, middle_name, name
         FROM students WHERE lrn = ? LIMIT 1`,
        [lrn]
      );
      const s = (rows as any[])[0];
      if (s?.last_name && s?.first_name) {
        const mid = s.middle_name ? ` ${s.middle_name}` : '';
        return `${s.last_name}, ${s.first_name}${mid}`;
      }
    }
  } catch { /* ignore — fall back to attendance student_name */ }
  return studentName;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CORE DATA FETCH
   Gender lookup: students.lrn → direct (no enrollments table needed)
═══════════════════════════════════════════════════════════════════════════ */
async function buildStudentMeta(
  month: number,
  year: number,
  section?: string,
): Promise<Record<string, {
  gender: string;
  lrn: string;
  displayName: string;
  days: Record<number, { am: boolean; pm: boolean }>;
  lateDays: Record<number, boolean>;   // days where status = 'Late'
}>> {
  const conditions: string[] = ['MONTH(a.date) = ?', 'YEAR(a.date) = ?'];
  const params: any[] = [month, year];

  if (section?.trim()) {
    conditions.push('a.section = ?');
    params.push(section.trim());
  }

  // Only read general attendance (subject IS NULL) — this is what SF2 tracks
  conditions.push('(a.subject IS NULL OR a.subject = \'\')');

  // Only include VERIFIED (final) attendance — not partial kiosk scans awaiting teacher confirmation
  conditions.push('a.is_verified = 1');

  const [rows] = await (pool as any).execute(
    `SELECT
       a.student_name,
       a.lrn,
       COALESCE(
         (SELECT s.gender FROM students s
          WHERE s.lrn = a.lrn AND a.lrn IS NOT NULL AND a.lrn != ''
            AND s.gender IS NOT NULL AND s.gender != '' LIMIT 1),
         (SELECT s.gender FROM students s
          WHERE s.name = a.student_name
            AND s.gender IS NOT NULL AND s.gender != '' LIMIT 1),
         NULLIF(a.gender, ''),
         ''
       ) AS gender,
       DATE_FORMAT(CONVERT_TZ(a.date, '+00:00', '+08:00'), '%Y-%m-%d') AS date,
       COALESCE(a.session, 'AM')       AS session,
       a.status,
       CASE WHEN (a.subject IS NULL OR a.subject = '') THEN 0 ELSE 1 END AS is_subject
     FROM attendance a
     WHERE ${conditions.join(' AND ')}
     ORDER BY a.student_name, a.date, a.session, is_subject ASC, a.id ASC`,
    params,
  ) as [RowDataPacket[], any];

  const meta: Record<string, {
    gender: string; lrn: string; displayName: string;
    days: Record<number, { am: boolean; pm: boolean }>;
    lateDays: Record<number, boolean>;
  }> = {};

  for (const r of rows as any[]) {
    const name    = (r.student_name || '').trim();
    const lrn     = (r.lrn || '').trim();
    const raw     = (r.gender || '').trim().toUpperCase();
    const gender  = raw.startsWith('M') ? 'M' : raw.startsWith('F') ? 'F' : '';
    const day     = Number((r.date as string).split('-')[2]);
    const session = (r.session || '').trim().toUpperCase();

    if (!name || isNaN(day) || day < 1 || day > 31) continue;

    if (!meta[name]) {
      meta[name] = { gender: '', lrn, displayName: name, days: {}, lateDays: {} };
    }
    if (!meta[name].gender && gender) meta[name].gender = gender;
    if (!meta[name].days[day]) meta[name].days[day] = { am: false, pm: false };

    const attended = isAttended(r.status);
    const isLate   = (r.status || '').toLowerCase().replace(/[-_\s]/g, '') === 'late';

    if      (session === 'AM')   meta[name].days[day].am = attended;
    else if (session === 'PM')   meta[name].days[day].pm = attended;
    else if (session === 'FULL') {
      meta[name].days[day].am = attended;
      meta[name].days[day].pm = attended;
    }

    // Track tardy days — Late status on any session counts as tardy for that day
    if (isLate && attended) {
      meta[name].lateDays[day] = true;
    }
  }

  // Resolve formatted display names (Last, First Middle) from students table
  // Also include ALL assigned students (even those with no attendance records)
  if (section?.trim()) {
    try {
      const [assignedStudents]: any = await (pool as any).execute(
        `SELECT DISTINCT s.id, s.name, s.lrn, s.gender,
                s.last_name, s.first_name, s.middle_name
         FROM assignment_students asg
         JOIN assignments a ON a.id = asg.assignment_id
         JOIN students s ON s.id = asg.student_id
         WHERE LOWER(TRIM(a.section)) = LOWER(TRIM(?))
         ORDER BY s.name`,
        [section.trim()]
      );

      for (const s of assignedStudents as any[]) {
        const studentName = (s.name || '').trim();
        if (!studentName) continue;

        // Build display name from split fields if available
        let displayName = studentName;
        if (s.last_name && s.first_name) {
          const mid = s.middle_name ? ` ${s.middle_name}` : '';
          displayName = `${s.last_name}, ${s.first_name}${mid}`;
        }

        const lrn    = (s.lrn || '').trim();
        const rawG   = (s.gender || '').trim().toUpperCase();
        const gender = rawG.startsWith('M') ? 'M' : rawG.startsWith('F') ? 'F' : '';

        if (!meta[studentName]) {
          // Student has no attendance records yet — add with empty days (will show all red/absent)
          meta[studentName] = { gender, lrn, displayName, days: {}, lateDays: {} };
        } else {
          // Update gender and display name if missing/incomplete
          if (!meta[studentName].gender && gender) meta[studentName].gender = gender;
          if (meta[studentName].displayName === studentName && displayName !== studentName) {
            meta[studentName].displayName = displayName;
          }
          if (!meta[studentName].lrn && lrn) meta[studentName].lrn = lrn;
        }
      }
    } catch (err) {
      console.warn('[SF2] Could not load assigned students:', err);
    }
  }

  // Resolve remaining display names for students from attendance records
  for (const key of Object.keys(meta)) {
    if (meta[key].displayName === key) {
      meta[key].displayName = await getFormattedName(key, meta[key].lrn || null);
    }
  }

  const boyCount  = Object.values(meta).filter(m => m.gender === 'M').length;
  const girlCount = Object.values(meta).filter(m => m.gender === 'F').length;
  const unkCount  = Object.values(meta).filter(m => !m.gender).length;
  console.log(`[SF2] Gender resolved — Boys: ${boyCount}, Girls: ${girlCount}, Unknown: ${unkCount}`);
  if (unkCount > 0) {
    Object.entries(meta).filter(([, m]) => !m.gender)
      .forEach(([n]) => console.log(`  [SF2] No gender found: "${n}"`));
  }

  return meta;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONTROLLER: POST /api/sf2/generate
═══════════════════════════════════════════════════════════════════════════ */
export async function generateSF2(req: Request, res: Response) {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Upload template file' });

  const month     = Number(req.body.month);
  const year      = Number(req.body.year);
  const section   = (req.body.section || '').trim() || (req as any).teacher?.section?.trim() || '';
  const totalDays = daysInMonth(month, year);
  const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' });

  if (isNaN(month) || month < 1 || month > 12)
    return res.status(400).json({ error: 'Invalid month' });
  if (isNaN(year) || year < 2000 || year > 2100)
    return res.status(400).json({ error: 'Invalid year' });

  // ── Fetch school settings ──────────────────────────────────────────
  let schoolSettings: {
    school_id?: string; school_name?: string;
    school_year?: string; school_head_name?: string;
  } = {};
  try {
    const [rows] = await (pool as any).execute(
      'SELECT school_id, school_name, school_year, school_head_name FROM school_settings WHERE id = 1'
    ) as [any[], any];
    if ((rows as any[]).length > 0) schoolSettings = (rows as any[])[0];
  } catch { /* school_settings may not exist yet — proceed without */ }

  const studentMeta = await buildStudentMeta(month, year, section);

  /* ── gender split — sorted alphabetically within each group ── */
  const boys:  string[] = [];
  const girls: string[] = [];
  const other: string[] = [];

  Object.entries(studentMeta).sort(([a], [b]) => a.localeCompare(b))
    .forEach(([name, meta]) => {
      if      (meta.gender === 'M') boys.push(name);
      else if (meta.gender === 'F') girls.push(name);
      else                          other.push(name);
    });
  boys.push(...other);

  /* ── load the uploaded DepEd template ── */
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file.path);
  if (!workbook.worksheets.length)
    return res.status(400).json({ error: 'Template has no worksheets' });
  const ws = workbook.worksheets[0];

  /* ── Fill SF2 header from school settings ── */
  // Exact positions from template inspection of "School Form 2 (SF2).xlsx":
  //   R6: School ID label=B6, value=C6 (merged C-E, col 3)
  //       School Year label=H6 (col 8), value=K6 (merged K-P, col 11)
  //       Month of label=Q6 (merged Q-W, col 17), value=X6 (col 24)
  //   R8: Name of School label=B8 (col 2), value=C8 (col 3, wide unmerged area)
  //       Grade Level label=T8 (merged T-W, col 20), value=X8 (merged X-Y, col 24)
  //       Section label=Z8 (merged Z-AB, col 26), value=AC8 (merged AC-AD, col 29)
  try {
    if (schoolSettings.school_id)   ws.getCell(6, 3).value  = schoolSettings.school_id;
    if (schoolSettings.school_year) ws.getCell(6, 11).value = schoolSettings.school_year;
    ws.getCell(6, 24).value = `${monthName} ${year}`;
    if (schoolSettings.school_name) ws.getCell(8, 3).value  = schoolSettings.school_name;
    // Grade Level — fetch from assignments table using section name
    try {
      const [yrRows]: any = await (pool as any).query(
        `SELECT year_level FROM assignments
         WHERE LOWER(TRIM(section)) = LOWER(TRIM(?))
           AND year_level IS NOT NULL AND year_level != ''
         LIMIT 1`,
        [section]
      );
      const yearLevel = (yrRows as any[])[0]?.year_level || '';
      ws.getCell(8, 24).value = yearLevel || null;
    } catch { ws.getCell(8, 24).value = null; }
    if (section) ws.getCell(8, 29).value = section;
  } catch (headerErr) {
    console.warn('[SF2] Header fill warning:', headerErr);
  }

  /* ── Auto-detect section order and start rows from template ── */
  // Scan the template to find FEMALE and MALE separator rows.
  // Templates vary — some have FEMALE first (rows 14-33), MALE below (row 35+)
  let femaleHeaderRow = -1;
  let maleHeaderRow   = -1;

  try {
    for (let r = 10; r <= 55; r++) {
      for (let c = 1; c <= 10; c++) {  // scan more columns — merged cells can be in any column
        const rawVal = ws.getCell(r, c).value;
        if (!rawVal) continue;
        const cellVal = String(rawVal).trim().toUpperCase();
        // Detect FEMALE separator (e.g. "FEMALE | TOTAL Per Day")
        if (femaleHeaderRow < 0 &&
            (cellVal.includes('FEMALE') || cellVal.startsWith('FEMALE'))) {
          femaleHeaderRow = r;
          console.log(`[SF2] Found FEMALE header at row ${r} col ${c}: "${rawVal}"`);
        }
        // Detect MALE separator (e.g. "MALE | TOTAL Per Day") — must not match FEMALE
        if (maleHeaderRow < 0 &&
            !cellVal.includes('FEMALE') &&
            (cellVal.includes('MALE') || cellVal.startsWith('MALE'))) {
          maleHeaderRow = r;
          console.log(`[SF2] Found MALE header at row ${r} col ${c}: "${rawVal}"`);
        }
      }
    }
    console.log(`[SF2] Template — FEMALE header row: ${femaleHeaderRow}, MALE header row: ${maleHeaderRow}`);
  } catch { /* use defaults */ }

  // Determine which section comes first in this template
  let girlsStart: number;
  let boysStart:  number;

  // Debug: log actual cell values at detected rows
  if (maleHeaderRow > 0) {
    for (let c2 = 1; c2 <= 4; c2++) {
      const v = ws.getCell(maleHeaderRow, c2).value;
      if (v) { console.log(`[SF2] maleHeaderRow ${maleHeaderRow} col ${c2}: "${v}"`); break; }
    }
  }
  if (femaleHeaderRow > 0) {
    for (let c2 = 1; c2 <= 4; c2++) {
      const v = ws.getCell(femaleHeaderRow, c2).value;
      if (v) { console.log(`[SF2] femaleHeaderRow ${femaleHeaderRow} col ${c2}: "${v}"`); break; }
    }
  }

  if (femaleHeaderRow > 0 && maleHeaderRow > 0) {
    if (femaleHeaderRow < maleHeaderRow) {
      // FEMALE first (this template: girls rows 14-33, male header at row 34)
      girlsStart = femaleHeaderRow + 1;
      boysStart  = maleHeaderRow  + 1;
    } else {
      // MALE first (standard DepEd: boys rows 14-33, female header at row 35)
      boysStart  = maleHeaderRow  + 1;
      girlsStart = femaleHeaderRow + 1;
    }
  } else {
    // Fallback to hardcoded constants
    boysStart  = BOYS_START_ROW;
    girlsStart = GIRLS_START_ROW;
  }

  console.log(`[SF2] Filling: boys from row ${boysStart}, girls from row ${girlsStart}`);

  const EFFECTIVE_BOYS_START  = boysStart;
  const EFFECTIVE_GIRLS_START = girlsStart;

  /* ── template layout constants for ABSENT/TARDY columns ── */
  const ABSENT_COLUMN = 29; // AC — matches template R12C29
  const TARDY_COLUMN  = 30; // AD — matches template R12C30
  const dayColumns: Record<number, number> = {};
  let col = FIRST_DAY_COLUMN;
  for (let d = 1; d <= totalDays; d++) {
    const wd = new Date(year, month - 1, d).getDay();
    if (wd >= 1 && wd <= 5) {
      dayColumns[d] = col;
      ws.getCell(DATE_ROW, col).value = d;
      ws.getCell(DAY_ROW,  col).value = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][wd - 1];
      col++;
    }
  }

  /* ── triangle cell collectors (0-indexed for DrawingML) ── */
  const amCells: CellPos[] = [];
  const pmCells: CellPos[] = [];

  /* ── fill a gender section into the template ── */
  function fillSection(list: string[], startRow: number, endRow: number) {
    list.forEach((name, i) => {
      const row = startRow + i;
      if (row > endRow) return;
      ws.getRow(row).height = ROW_HEIGHT;
      ws.getCell(row, NAME_COLUMN).value = studentMeta[name]?.displayName ?? name;

      let absentCount = 0;
      let tardyCount  = 0;

      for (const [dStr, c] of Object.entries(dayColumns)) {
        const day   = Number(dStr);
        const cell  = ws.getCell(row, c);
        const flags = studentMeta[name]?.days[day] ?? { am: false, pm: false };
        hardReset(cell);

        if (flags.am && flags.pm) {
          cell.fill = FULL_GREEN_FILL;
        } else if (flags.am) {
          cell.fill = NO_FILL;
          // DrawingML uses 0-indexed columns; ExcelJS ws columns are 1-indexed
          // The triangle must align with the cell visually — offset tested at c-1
          amCells.push({ col: c - 1, row: row - 1 });
        } else if (flags.pm) {
          cell.fill = NO_FILL;
          pmCells.push({ col: c - 1, row: row - 1 });
        } else {
          cell.fill = RED_FILL;
          absentCount++;
        }
      }

      // Count tardy (Late) days — kept for internal use but NOT written to sheet
      const tardyDays = studentMeta[name]?.lateDays || {};
      for (const day of Object.keys(dayColumns).map(Number)) {
        if (tardyDays[day]) tardyCount++;
      }

      // ABSENT and TARDY columns intentionally NOT filled — leave template values intact
      // absentCell and tardyCell are left as-is per user preference
    });
  }

  fillSection(boys,  EFFECTIVE_BOYS_START,  BOYS_END_ROW);
  fillSection(girls, EFFECTIVE_GIRLS_START, GIRLS_END_ROW);

  /* ── Fill MALE | TOTAL Per Day and FEMALE | TOTAL Per Day rows ── */
  // Build per-day presence counts directly from studentMeta
  const maleDayCount:   Record<number, number> = {};
  const femaleDayCount: Record<number, number> = {};

  for (const [, meta] of Object.entries(studentMeta)) {
    const rawGender = (meta.gender || '').trim().toUpperCase();
    const isM = rawGender.startsWith('M');
    const isF = rawGender.startsWith('F');
    for (const [dayStr, flags] of Object.entries(meta.days)) {
      const day = Number(dayStr);
      if (flags.am || flags.pm) {
        if (isM) maleDayCount[day]   = (maleDayCount[day]   || 0) + 1;
        if (isF) femaleDayCount[day] = (femaleDayCount[day] || 0) + 1;
      }
    }
  }
  console.log(`[SF2] Day counts — Male: ${JSON.stringify(maleDayCount)}, Female: ${JSON.stringify(femaleDayCount)}`);

  const writeTotal = (headerRow: number, dayCounts: Record<number, number>, label: string) => {
    if (headerRow < 1) { console.log(`[SF2] SKIP ${label} — row not detected`); return; }
    let written = 0;
    for (const [dayStr, col] of Object.entries(dayColumns)) {
      const day   = Number(dayStr);
      const count = dayCounts[day] || null;
      const cell  = ws.getCell(headerRow, col);
      cell.value  = count;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      // Explicit black bold font — overrides any inherited white fill/font from template
      cell.font   = { bold: true, size: 9, color: { argb: 'FF000000' } };
      // Reset fill to white so text is visible
      cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } } as any;
      if (count) written++;
    }
    console.log(`[SF2] Wrote ${label} totals at row ${headerRow} — ${written} non-zero cells`);
  };

  // Scan ALL rows 1-70 to find MALE, FEMALE and Combined labels (robust detection)
  let detectedMale     = -1;
  let detectedFemale   = -1;
  let detectedCombined = -1;
  for (let r = 1; r <= 70; r++) {
    for (let c2 = 1; c2 <= 10; c2++) {
      const rawVal  = ws.getCell(r, c2).value;
      if (!rawVal) continue;
      const cellStr = String(rawVal).trim().toUpperCase();
      if (detectedFemale < 0 && cellStr.includes('FEMALE'))  { detectedFemale   = r; console.log(`[SF2] FEMALE label row ${r} col ${c2}: "${rawVal}"`); }
      if (detectedMale   < 0 && !cellStr.includes('FEMALE') && cellStr.includes('MALE')) { detectedMale = r; console.log(`[SF2] MALE label row ${r} col ${c2}: "${rawVal}"`); }
      if (detectedCombined < 0 && cellStr.includes('COMBINED')) { detectedCombined = r; console.log(`[SF2] COMBINED label row ${r} col ${c2}: "${rawVal}"`); }
    }
  }

  // Write totals: MALE label row gets male counts, FEMALE label row gets female counts
  writeTotal(detectedMale,     maleDayCount,   'MALE');
  writeTotal(detectedFemale,   femaleDayCount, 'FEMALE');

  // Combined = male + female
  if (detectedCombined > 0) {
    let written = 0;
    for (const [dayStr, col] of Object.entries(dayColumns)) {
      const day   = Number(dayStr);
      const total = (maleDayCount[day] || 0) + (femaleDayCount[day] || 0);
      const cell  = ws.getCell(detectedCombined, col);
      cell.value  = total || null;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.font   = { bold: true, size: 9, color: { argb: 'FF000000' } };
      cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } } as any;
      if (total) written++;
    }
    console.log(`[SF2] Wrote COMBINED totals at row ${detectedCombined} — ${written} non-zero cells`);
  }

  /* ── write base xlsx to disk ── */
  const outputPath = path.join(UPLOAD_DIR, `SF2_${Date.now()}.xlsx`);
  await workbook.xlsx.writeFile(outputPath);

  /* ── patch DrawingML triangles for AM-only / PM-only cells ── */
  await patchDrawings(outputPath, amCells, pmCells);

  /* ── clean up temp upload ── */
  fs.unlink(file.path, () => {});

  /* ── stream back to client ── */
  const filename = section
    ? `SF2_${section.replace(/\s+/g, '_')}_${monthName}_${year}.xlsx`
    : `SF2_${monthName}_${year}.xlsx`;

  res.setHeader('Content-Type',        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const fileStream = fs.createReadStream(outputPath);
  fileStream.pipe(res);
  fileStream.on('end',   () => fs.unlink(outputPath, () => {}));
  fileStream.on('error', () => { if (!res.headersSent) res.status(500).end(); });
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONTROLLER: GET /api/sf2/preview
═══════════════════════════════════════════════════════════════════════════ */
export async function getSF2Preview(req: Request, res: Response) {
  try {
    const teacher   = (req as any).teacher;
    const { month, year, section } = req.query as Record<string, string>;

    if (!month || !year)
      return res.status(400).json({ error: 'month and year are required' });

    const m = parseInt(month, 10);
    const y = parseInt(year,  10);
    const targetSection = section?.trim() || teacher?.section?.trim();
    const meta      = await buildStudentMeta(m, y, targetSection);

    const schoolDays: string[] = [];
    const totalDays = daysInMonth(m, y);
    for (let d = 1; d <= totalDays; d++) {
      const wd = new Date(y, m - 1, d).getDay();
      if (wd >= 1 && wd <= 5) {
        schoolDays.push(`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
      }
    }

    res.json({
      section:     targetSection ?? '',
      month:       m,
      year:        y,
      school_days: schoolDays.length,
      students:    Object.entries(meta).map(([name, rec]) => ({
        student_name: name,
        display_name: rec.displayName,
        gender:       rec.gender,
        days:         rec.days,
      })),
    });
  } catch (err: any) {
    console.error('[SF2 Preview]', err);
    res.status(500).json({ error: err.message ?? 'Internal server error' });
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONTROLLER: GET /api/sf2/coordination-status
   Fixed: uses assignments table instead of student_schedules
═══════════════════════════════════════════════════════════════════════════ */
export async function getCoordinationStatus(req: Request, res: Response) {
  try {
    const { month, year, section } = req.query as Record<string, string>;
    if (!month || !year || !section)
      return res.status(400).json({ error: 'month, year, and section are required' });

    const m         = parseInt(month, 10);
    const y         = parseInt(year,  10);
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const endDate   = `${y}-${String(m).padStart(2, '0')}-31`;

    // Use assignments table (replaces the non-existent student_schedules)
    const [subjectRows] = await (pool as any).execute(
      `SELECT
         a.subject,
         t.name AS teacher_name,
         COUNT(DISTINCT att.date) AS days_recorded,
         COUNT(*)                 AS total_records,
         MAX(att.date)            AS last_recorded
       FROM attendance att
       LEFT JOIN assignments a
         ON a.subject = att.subject AND LOWER(TRIM(a.section)) = LOWER(TRIM(att.section))
       LEFT JOIN teachers t
         ON t.id = a.subject_teacher_id
       WHERE att.section = ?
         AND att.date BETWEEN ? AND ?
         AND att.subject IS NOT NULL AND att.subject != ''
       GROUP BY att.subject, t.name
       ORDER BY att.subject`,
      [section, startDate, endDate]
    ) as [any[], any];

    const totalDays = daysInMonth(m, y);
    let schoolDaysCount = 0;
    for (let d = 1; d <= totalDays; d++) {
      const wd = new Date(y, m - 1, d).getDay();
      if (wd >= 1 && wd <= 5) schoolDaysCount++;
    }

    const [advisoryRows] = await (pool as any).execute(
      `SELECT COUNT(DISTINCT date) AS days_recorded, COUNT(*) AS total_records
       FROM attendance
       WHERE section = ? AND date BETWEEN ? AND ?
         AND (subject IS NULL OR subject = '')`,
      [section, startDate, endDate]
    ) as [any[], any];

    res.json({
      section,
      month:       m,
      year:        y,
      school_days: schoolDaysCount,
      advisory:    advisoryRows[0] ?? { days_recorded: 0, total_records: 0 },
      subjects:    subjectRows,
    });
  } catch (err: any) {
    console.error('[SF2 Coordination]', err);
    res.status(500).json({ error: err.message ?? 'Internal server error' });
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONTROLLER: GET /api/sf2/inspect-template (diagnostic)
   Upload a template and see what's in each cell of rows 6 and 8
═══════════════════════════════════════════════════════════════════════════ */
export async function inspectTemplate(req: Request, res: Response) {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Upload template file' });
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(file.path);
    const ws = workbook.worksheets[0];
    fs.unlink(file.path, () => {});

    const result: Record<string, any> = {};
    for (const rowNum of [6, 7, 8, 9, 10, 11, 12]) {
      const rowData: Record<string, any> = {};
      for (let c = 1; c <= 35; c++) {
        const cell = ws.getCell(rowNum, c);
        const v = cell.value;
        if (v !== null && v !== undefined && String(v).trim() !== '') {
          rowData[`col_${c} (${String.fromCharCode(64 + c)})`] = String(v).trim();
        }
      }
      result[`row_${rowNum}`] = rowData;
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
export async function getSF2History(_req: Request, res: Response) {
  try {
    const [rows] = await (pool as any).execute(
      `SELECT * FROM sf2_reports ORDER BY created_at DESC LIMIT 50`
    ) as [RowDataPacket[], any];
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
