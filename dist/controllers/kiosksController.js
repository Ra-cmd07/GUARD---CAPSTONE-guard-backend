"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getKiosks = getKiosks;
exports.pingKiosk = pingKiosk;
exports.createKiosk = createKiosk;
exports.updateKiosk = updateKiosk;
exports.deleteKiosk = deleteKiosk;
const db_1 = __importDefault(require("../lib/db"));
// ─── GET /api/kiosks ──────────────────────────────────────────────────
async function getKiosks(req, res) {
    try {
        const [kiosks] = await db_1.default.execute(`SELECT 
        id, name, location, gate, ip_address, 
        is_active,
        last_ping as last_heartbeat,
        CASE 
          WHEN last_ping IS NULL THEN 'unknown'
          WHEN TIMESTAMPDIFF(MINUTE, last_ping, NOW()) < 5 THEN 'online'
          WHEN TIMESTAMPDIFF(MINUTE, last_ping, NOW()) < 30 THEN 'stale'
          ELSE 'offline'
        END as status,
        created_at, updated_at
       FROM kiosks
       WHERE is_active = 1
       ORDER BY name`);
        res.json(kiosks);
    }
    catch (err) {
        console.error('getKiosks error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}
// ─── POST /api/kiosks/:id/ping ────────────────────────────────────────
async function pingKiosk(req, res) {
    try {
        const { id } = req.params;
        // Update last_ping to current time
        await db_1.default.execute('UPDATE kiosks SET last_ping = NOW() WHERE id = ?', [id]);
        // Get updated kiosk with computed status
        const [kiosks] = await db_1.default.execute(`SELECT 
        id, name, location, gate, ip_address, 
        is_active, last_ping as last_heartbeat,
        CASE 
          WHEN last_ping IS NULL THEN 'unknown'
          WHEN TIMESTAMPDIFF(MINUTE, last_ping, NOW()) < 5 THEN 'online'
          WHEN TIMESTAMPDIFF(MINUTE, last_ping, NOW()) < 30 THEN 'stale'
          ELSE 'offline'
        END as status
       FROM kiosks 
       WHERE id = ?`, [id]);
        if (kiosks.length === 0) {
            res.status(404).json({ error: 'Kiosk not found' });
            return;
        }
        res.json({
            success: true,
            message: 'Kiosk pinged successfully',
            kiosk: kiosks[0],
        });
    }
    catch (err) {
        console.error('pingKiosk error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}
// ─── POST /api/kiosks ─────────────────────────────────────────────────
async function createKiosk(req, res) {
    try {
        const { name, location, gate, ip_address } = req.body;
        if (!name || !location) {
            res.status(400).json({ error: 'name and location are required' });
            return;
        }
        const [result] = await db_1.default.execute(`INSERT INTO kiosks (name, location, gate, ip_address, is_active)
       VALUES (?, ?, ?, ?, 1)`, [name, location, gate || null, ip_address || null]);
        const kioskId = result.insertId;
        res.status(201).json({
            id: kioskId,
            message: 'Kiosk created successfully',
        });
    }
    catch (err) {
        console.error('createKiosk error:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            res.status(400).json({ error: 'Kiosk with this name already exists' });
            return;
        }
        res.status(500).json({ error: 'Server error' });
    }
}
// ─── PUT /api/kiosks/:id ──────────────────────────────────────────────
async function updateKiosk(req, res) {
    try {
        const { id } = req.params;
        const { name, location, gate, ip_address } = req.body;
        await db_1.default.execute('UPDATE kiosks SET name = ?, location = ?, gate = ?, ip_address = ? WHERE id = ?', [name, location, gate || null, ip_address || null, id]);
        res.json({ message: 'Kiosk updated successfully' });
    }
    catch (err) {
        console.error('updateKiosk error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}
// ─── DELETE /api/kiosks/:id ───────────────────────────────────────────
async function deleteKiosk(req, res) {
    try {
        const { id } = req.params;
        // Soft delete by setting is_active to 0
        await db_1.default.execute('UPDATE kiosks SET is_active = 0 WHERE id = ?', [id]);
        res.json({ message: 'Kiosk deleted successfully' });
    }
    catch (err) {
        console.error('deleteKiosk error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}
