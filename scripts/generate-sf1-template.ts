/**
 * generate-sf1-template.ts
 * Run:  npx ts-node scripts/generate-sf1-template.ts
 *
 * Generates public/sf1_template.xlsx — the official DepEd SF1 blank template.
 *
 * Header cell map (controller must match):
 *   C3       → School ID value
 *   I3:K3    → Division value
 *   O3:S3    → District value
 *   C4:G4    → School Name value
 *   L4:M4    → School Year value
 *   P4:Q4    → Grade Level value
 *   S4       → Section value
 *
 * Data rows start at row 9, columns A(1)–S(19).
 */
import path from 'path';
import ExcelJS from 'exceljs';

const OUT = path.join(__dirname, '..', 'public', 'sf1_template.xlsx');

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AttendBox';

  const ws = wb.addWorksheet('School Form 1 (SF1)', {
    properties:  { defaultRowHeight: 15 },
    pageSetup: {
      paperSize: 9, orientation: 'landscape',
      fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  });

  /* ── Column widths (19 columns A–S) ── */
  //   A   B    C   D   E    F   G   H   I   J    K   L    M   N    O    P   Q   R    S
  const W = [13, 20, 3.5, 9, 5, 10, 8, 7.5, 8, 9.5, 9, 10, 8.5, 17, 17, 12, 9, 12, 14];
  W.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  /* ── Style helpers ── */
  const T: ExcelJS.Border = { style: 'thin', color: { argb: 'FF000000' } };
  const B: Partial<ExcelJS.Borders> = { top: T, left: T, bottom: T, right: T };
  const fB = (sz: number): ExcelJS.Font => ({ name: 'Arial', size: sz, bold: true } as ExcelJS.Font);
  const fN = (sz: number): ExcelJS.Font => ({ name: 'Arial', size: sz } as ExcelJS.Font);
  const aC: Partial<ExcelJS.Alignment> = { horizontal: 'center', vertical: 'middle', wrapText: true };
  const aL: Partial<ExcelJS.Alignment> = { horizontal: 'left',   vertical: 'middle', wrapText: true };

  // col number → Excel letter
  const L = (n: number) => {
    let s = '';
    while (n > 0) { s = String.fromCharCode(64 + ((n - 1) % 26 + 1)) + s; n = Math.floor((n - 1) / 26); }
    return s;
  };

  const merge  = (r1: number, c1: number, r2: number, c2: number) => {
    try { ws.mergeCells(`${L(c1)}${r1}:${L(c2)}${r2}`); } catch {}
  };

  const put = (r: number, c: number, v: any,
               font: ExcelJS.Font, align: Partial<ExcelJS.Alignment>,
               brd?: boolean) => {
    const cl = ws.getCell(r, c);
    cl.value = v; cl.font = font; cl.alignment = align;
    if (brd) cl.border = B;
  };

  const mput = (r1: number, c1: number, r2: number, c2: number, v: any,
                font: ExcelJS.Font, align: Partial<ExcelJS.Alignment>,
                brd?: boolean) => {
    merge(r1, c1, r2, c2);
    if (brd) for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) ws.getCell(r, c).border = B;
    put(r1, c1, v, font, align);
  };

  const hdrCell = (r1: number, c1: number, r2: number, c2: number, label: string) => {
    merge(r1, c1, r2, c2);
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) ws.getCell(r, c).border = B;
    const cl = ws.getCell(r1, c1);
    cl.value = label; cl.font = fB(7); cl.alignment = aC;
  };

  /* ════════════════════════════════════════
     ROW 1 — Title
  ════════════════════════════════════════ */
  ws.getRow(1).height = 16;
  mput(1, 1, 1, 19, 'School Form 1 (SF 1) School Register', fB(11), aC);

  /* ════════════════════════════════════════
     ROW 2 — Subtitle
  ════════════════════════════════════════ */
  ws.getRow(2).height = 11;
  mput(2, 1, 2, 19,
    '(This replaces  Form 1, Master List & STS Form 2-Family Background and Profile)',
    fN(7), aC);

  /* ════════════════════════════════════════
     ROW 3 — School ID | Region VIII | Division | District
     Layout (matching Image 2):
       A3        : blank/logo area
       B3        : "School ID" label
       C3        : value box  ← HDR.SCHOOL_ID
       D3        : "Region VIII" text (no box, spans D3:E3)
       F3        : "Division" label
       G3        : blank
       H3        : blank (spacer, value starts at I)
       I3:K3     : Division value box  ← HDR.DIVISION
       L3:M3     : blank spacer
       N3        : "District" label
       O3:S3     : District value box  ← HDR.DISTRICT
  ════════════════════════════════════════ */
  ws.getRow(3).height = 18;
  // Border ALL cells in row 3 first
  for (let c = 1; c <= 19; c++) ws.getCell(3, c).border = B;

  put(3,  2, 'School ID',   fB(8), aC);
  put(3,  3, '',            fN(9), aC);   // ← SCHOOL_ID value cell (C3)
  mput(3, 4, 3, 5, 'Region VIII', fB(8), aC);
  put(3,  6, 'Division',    fB(8), aC);
  // G3, H3 blank spacers (bordered by loop above)
  mput(3, 9, 3, 11, '',    fN(9), aC);   // ← DIVISION value (I3:K3)
  // L3:M3 blank (bordered by loop)
  put(3, 14, 'District',   fB(8), aC);
  mput(3, 15, 3, 19, '',   fN(9), aC);   // ← DISTRICT value (O3:S3)

  /* ════════════════════════════════════════
     ROW 4 — School Name | School Year | Grade Level | Section
     Layout (matching Image 2):
       A4        : "School Name" label
       B4        : blank
       C4:G4     : School Name value box  ← HDR.SCHOOL_NAME
       H4:K4     : blank spacer
       L4        : "School Year" label  (merged L4)
       M4:N4     : School Year value box  ← HDR.SCHOOL_YEAR
       O4        : "Grade Level" label (merged O4:P4)
       Q4        : Grade Level value (merged Q4)  ← HDR.GRADE_LEVEL
       R4        : "Section" label
       S4        : Section value  ← HDR.SECTION
  ════════════════════════════════════════ */
  ws.getRow(4).height = 18;
  // Border ALL cells in row 4 first
  for (let c = 1; c <= 19; c++) ws.getCell(4, c).border = B;

  put(4,  1, 'School Name',  fB(8), aC);
  mput(4, 2, 4, 7, '',       fN(9), aL);  // ← SCHOOL_NAME value (B4:G4)
  // H4:K4 blank spacers (bordered by loop)
  put(4, 12, 'School Year',  fB(8), aC);
  mput(4, 13, 4, 14, '',     fN(9), aC);  // ← SCHOOL_YEAR value (M4:N4)
  mput(4, 15, 4, 16, 'Grade\nLevel', fB(8), aC); // Grade Level label (O4:P4)
  put(4, 17, '',             fN(9), aC);  // ← GRADE_LEVEL value (Q4)
  put(4, 18, 'Section',      fB(8), aC);
  put(4, 19, '',             fN(9), aC);  // ← SECTION value (S4)

  /* ════════════════════════════════════════
     ROW 5 — spacer
  ════════════════════════════════════════ */
  ws.getRow(5).height = 4;

  /* ════════════════════════════════════════
     ROWS 6-8 — Column headers
  ════════════════════════════════════════ */
  ws.getRow(6).height = 22;
  ws.getRow(7).height = 22;
  ws.getRow(8).height = 22;

  // Single-col headers spanning rows 6-8
  hdrCell(6,  1, 8,  1, 'LRN');
  hdrCell(6,  2, 8,  2, 'NAME\n(Last Name, First Name,\nMiddle Name)');
  hdrCell(6,  3, 8,  3, 'Sex\n(M/F)');
  hdrCell(6,  4, 8,  4, 'BIRTH DATE\n(mm/dd/\nyyyy)');
  hdrCell(6,  5, 8,  5, 'AGE as\nof 1st\nFriday\nJune');
  hdrCell(6,  6, 8,  6, ' BIRTH PLACE\n(Province)');
  hdrCell(6,  7, 8,  7, 'MOTHER\nTONGUE');
  hdrCell(6,  8, 8,  8, 'IP\n(Ethnic\nGroup)');
  hdrCell(6,  9, 8,  9, 'RELIGION');

  // ADDRESS group (cols 10-13)
  hdrCell(6, 10, 6, 13, 'ADDRESS');
  hdrCell(7, 10, 8, 10, 'House #,\nStreet/ Sitio/\nPurok');
  hdrCell(7, 11, 8, 11, 'Barangay');
  hdrCell(7, 12, 8, 12, 'Municipality/\nCity');
  hdrCell(7, 13, 8, 13, 'Province');

  // PARENTS group (cols 14-15)
  hdrCell(6, 14, 6, 15, 'PARENTS');
  hdrCell(7, 14, 8, 14, "Father's Name\n(Last Name, First Name,\nMiddle Name)");
  hdrCell(7, 15, 8, 15, "Mother's Maiden Name\n(Last Name, First Name,\nMiddle Name)");

  // GUARDIAN group (cols 16-17)
  hdrCell(6, 16, 6, 17, 'GUARDIAN\n(If not Parent)');
  hdrCell(7, 16, 8, 16, 'Name');
  hdrCell(7, 17, 8, 17, 'Relation-\nship');

  // Contact + Remarks span rows 6-8
  hdrCell(6, 18, 8, 18, 'Contact\nNumber of\nParent or\nGuardian');
  hdrCell(6, 19, 8, 19, 'REMARKS\n(Please refer to\nthe legend on last\npage)');

  /* ════════════════════════════════════════
     DATA ROWS 9-28
  ════════════════════════════════════════ */
  for (let i = 0; i < 20; i++) {
    const row = 9 + i;
    ws.getRow(row).height = 16;
    for (let c = 1; c <= 19; c++) {
      const cl = ws.getCell(row, c);
      cl.border    = B;
      cl.font      = fN(8);
      cl.alignment = (c === 2 || c === 14 || c === 15) ? aL : aC;
    }
  }

  await wb.xlsx.writeFile(OUT);
  console.log('✅ SF1 template saved →', OUT);
  console.log('Header cells:');
  console.log('  SCHOOL_ID  → C3  (col 3)');
  console.log('  DIVISION   → I3  (col 9,  merged I3:K3)');
  console.log('  DISTRICT   → O3  (col 15, merged O3:S3)');
  console.log('  SCHOOL_NAME→ B4  (col 2,  merged B4:G4)');
  console.log('  SCHOOL_YEAR→ M4  (col 13, merged M4:N4)');
  console.log('  GRADE_LEVEL→ Q4  (col 17)');
  console.log('  SECTION    → S4  (col 19)');
}

main().catch(e => { console.error(e); process.exit(1); });
