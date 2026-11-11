import { Request, Response } from 'express';
import pool from '../lib/db';

// ─── GET /api/kiosks ──────────────────────────────────────────────────
export async function getKiosks(req: Request, res: Response): Promise<void> {
  try {
    const [kiosks] = await pool.execute(
      `SELECT 
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
       ORDER BY name`
    ) as any[];
    
    res.json(kiosks);
  } catch (err) {
    console.error('getKiosks error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── POST /api/kiosks/:id/ping ────────────────────────────────────────
export async function pingKiosk(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    
    // Update last_ping to current time
    await pool.execute(
      'UPDATE kiosks SET last_ping = NOW() WHERE id = ?',
      [id]
    );
    
    // Get updated kiosk with computed status
    const [kiosks] = await pool.execute(
      `SELECT 
        id, name, location, gate, ip_address, 
        is_active, last_ping as last_heartbeat,
        CASE 
          WHEN last_ping IS NULL THEN 'unknown'
          WHEN TIMESTAMPDIFF(MINUTE, last_ping, NOW()) < 5 THEN 'online'
          WHEN TIMESTAMPDIFF(MINUTE, last_ping, NOW()) < 30 THEN 'stale'
          ELSE 'offline'
        END as status
       FROM kiosks 
       WHERE id = ?`,
      [id]
    ) as any[];
    
    if ((kiosks as any[]).length === 0) {
      res.status(404).json({ error: 'Kiosk not found' });
      return;
    }
    
    res.json({
      success: true,
      message: 'Kiosk pinged successfully',
      kiosk: (kiosks as any[])[0],
    });
  } catch (err) {
    console.error('pingKiosk error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── POST /api/kiosks ─────────────────────────────────────────────────
export async function createKiosk(req: Request, res: Response): Promise<void> {
  try {
    const { name, location, gate, ip_address } = req.body;
    
    if (!name || !location) {
      res.status(400).json({ error: 'name and location are required' });
      return;
    }
    
    const [result] = await pool.execute(
      `INSERT INTO kiosks (name, location, gate, ip_address, is_active)
       VALUES (?, ?, ?, ?, 1)`,
      [name, location, gate || null, ip_address || null]
    ) as any[];
    
    const kioskId = (result as any).insertId;
    
    res.status(201).json({
      id: kioskId,
      message: 'Kiosk created successfully',
    });
  } catch (err: any) {
    console.error('createKiosk error:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Kiosk with this name already exists' });
      return;
    }
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── PUT /api/kiosks/:id ──────────────────────────────────────────────
export async function updateKiosk(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { name, location, gate, ip_address } = req.body;
    
    await pool.execute(
      'UPDATE kiosks SET name = ?, location = ?, gate = ?, ip_address = ? WHERE id = ?',
      [name, location, gate || null, ip_address || null, id]
    );
    
    res.json({ message: 'Kiosk updated successfully' });
  } catch (err) {
    console.error('updateKiosk error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── DELETE /api/kiosks/:id ───────────────────────────────────────────
export async function deleteKiosk(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    
    // Soft delete by setting is_active to 0
    await pool.execute('UPDATE kiosks SET is_active = 0 WHERE id = ?', [id]);
    
    res.json({ message: 'Kiosk deleted successfully' });
  } catch (err) {
    console.error('deleteKiosk error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
