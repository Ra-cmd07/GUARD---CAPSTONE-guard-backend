"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAnchorWhitelist = getAnchorWhitelist;
exports.getAnchorInfo = getAnchorInfo;
const db_1 = __importDefault(require("../lib/db"));
/**
 * GET /api/anchors/:anchorId/whitelist
 * Get list of students that this anchor is allowed to detect
 * Used by ESP32 for Plug-and-Play configuration
 */
async function getAnchorWhitelist(req, res) {
    try {
        const { anchorId } = req.params;
        const anchorIdNum = parseInt(Array.isArray(anchorId) ? anchorId[0] : anchorId);
        console.log(`📋 Fetching whitelist for Anchor ${anchorIdNum}...`);
        // Get allowed students for this anchor
        const [rows] = await db_1.default.query(`
      SELECT 
        asw.student_id,
        s.first_name,
        s.last_name,
        asw.mac_address,
        s.rfid_uid,
        asw.is_active
      FROM anchor_student_whitelist asw
      JOIN students s ON s.id = asw.student_id
      WHERE asw.anchor_id = ?
        AND asw.is_active = 1
      ORDER BY s.first_name
    `, [anchorIdNum]);
        const whitelist = rows.map((row) => ({
            studentId: row.student_id,
            name: `${row.first_name} ${row.last_name}`,
            mac: row.mac_address,
            rfid: row.rfid_uid
        }));
        console.log(`✅ Found ${whitelist.length} students for Anchor ${anchorIdNum}`);
        res.json({
            anchorId: anchorIdNum,
            students: whitelist,
            count: whitelist.length,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('❌ Error fetching anchor whitelist:', error);
        res.status(500).json({ error: 'Server error fetching whitelist' });
    }
}
/**
 * GET /api/anchors/:anchorId/info
 * Get anchor configuration info
 */
async function getAnchorInfo(req, res) {
    try {
        const { anchorId } = req.params;
        const anchorIdNum = parseInt(Array.isArray(anchorId) ? anchorId[0] : anchorId);
        // Get room info for this anchor
        const [roomRows] = await db_1.default.query(`
      SELECT 
        br.id as room_id,
        br.room_name,
        br.room_number,
        br.anchor_id,
        br.device_mac,
        bf.floor_name,
        b.name as building_name
      FROM building_rooms br
      JOIN building_floors bf ON bf.id = br.floor_id
      JOIN buildings b ON b.id = bf.building_id
      WHERE br.anchor_id = ?
    `, [anchorIdNum]);
        if (roomRows.length === 0) {
            res.status(404).json({ error: 'Anchor not configured in any room' });
            return;
        }
        const room = roomRows[0];
        // Get whitelist count
        const [countRows] = await db_1.default.query(`
      SELECT COUNT(*) as count
      FROM anchor_student_whitelist
      WHERE anchor_id = ? AND is_active = 1
    `, [anchorIdNum]);
        const studentCount = countRows[0].count;
        res.json({
            anchorId: anchorIdNum,
            room: {
                id: room.room_id,
                name: room.room_name,
                number: room.room_number,
                floor: room.floor_name,
                building: room.building_name
            },
            studentCount: studentCount,
            deviceMac: room.device_mac
        });
    }
    catch (error) {
        console.error('❌ Error fetching anchor info:', error);
        res.status(500).json({ error: 'Server error fetching anchor info' });
    }
}
