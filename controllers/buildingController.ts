import { Request, Response } from 'express';
import pool from '../lib/db';
import { AuthRequest } from '../middleware/authMiddleware';

/**
 * GET /api/buildings
 * Get all buildings with their coordinates and zoom levels
 */
export async function getAllBuildings(req: Request, res: Response): Promise<void> {
  try {
    console.log('🏢 Fetching all buildings...');
    
    const [rows] = await pool.query(`
      SELECT 
        id,
        name,
        latitude,
        longitude,
        bounds_north,
        bounds_south,
        bounds_east,
        bounds_west,
        min_zoom,
        created_at
      FROM buildings
      ORDER BY name
    `);
    
    console.log(`✅ Found ${(rows as any[]).length} buildings`);
    res.json(rows);
  } catch (error) {
    console.error('❌ Error fetching buildings:', error);
    res.status(500).json({ error: 'Server error fetching buildings' });
  }
}

/**
 * GET /api/buildings/:id/floors
 * Get all floors for a specific building
 */
export async function getBuildingFloors(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    console.log(`🏢 Fetching floors for building ${id}...`);
    
    const [rows] = await pool.query(`
      SELECT 
        bf.id,
        bf.building_id,
        bf.floor_number,
        bf.floor_name,
        bf.zoom_level,
        bf.created_at,
        b.name as building_name
      FROM building_floors bf
      JOIN buildings b ON b.id = bf.building_id
      WHERE bf.building_id = ?
      ORDER BY bf.floor_number
    `, [id]);
    
    console.log(`✅ Found ${(rows as any[]).length} floors for building ${id}`);
    res.json(rows);
  } catch (error) {
    console.error('❌ Error fetching building floors:', error);
    res.status(500).json({ error: 'Server error fetching floors' });
  }
}

/**
 * GET /api/buildings/floors/:floorId/rooms
 * Get all rooms for a specific floor
 */
export async function getFloorRooms(req: Request, res: Response): Promise<void> {
  try {
    const { floorId } = req.params;
    console.log(`🚪 Fetching rooms for floor ${floorId}...`);
    
    const [rows] = await pool.query(`
      SELECT 
        br.id,
        br.floor_id,
        br.room_name,
        br.room_number,
        br.esp32_ip,
        br.bounds_north,
        br.bounds_south,
        br.bounds_east,
        br.bounds_west,
        br.zoom_level,
        br.created_at,
        bf.floor_name,
        bf.floor_number,
        b.name as building_name
      FROM building_rooms br
      JOIN building_floors bf ON bf.id = br.floor_id
      JOIN buildings b ON b.id = bf.building_id
      WHERE br.floor_id = ?
        AND br.room_name != 'Room 2'
      ORDER BY br.room_number
    `, [floorId]);
    
    console.log(`✅ Found ${(rows as any[]).length} rooms for floor ${floorId} (Room 2 excluded)`);
    res.json(rows);
  } catch (error) {
    console.error('❌ Error fetching floor rooms:', error);
    res.status(500).json({ error: 'Server error fetching rooms' });
  }
}

/**
 * GET /api/buildings/rooms/:roomId/floor-plan
 * Get floor plan and students for a specific room
 */
export async function getRoomFloorPlan(req: Request, res: Response): Promise<void> {
  console.log('🚨🚨🚨 getRoomFloorPlan CALLED - roomId:', req.params.roomId);
  try {
    const { roomId } = req.params;
    console.log(`📐 Fetching floor plan for room ${roomId}...`);
    
    // Get room details
    const [roomRows] = await pool.query(`
      SELECT 
        br.id,
        br.room_name,
        br.room_number,
        br.esp32_ip,
        br.bounds_north,
        br.bounds_south,
        br.bounds_east,
        br.bounds_west,
        bf.floor_name,
        bf.floor_number,
        b.name as building_name,
        b.latitude as building_lat,
        b.longitude as building_lng
      FROM building_rooms br
      JOIN building_floors bf ON bf.id = br.floor_id
      JOIN buildings b ON b.id = bf.building_id
      WHERE br.id = ?
    `, [roomId]);
    
    if ((roomRows as any[]).length === 0) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    
    const room = (roomRows as any[])[0];
    
    // Get floor plan image if exists
    const [floorPlanRows] = await pool.query(`
      SELECT 
        id,
        image_path,
        zoom_level,
        opacity,
        created_at
      FROM room_floor_plans
      WHERE room_id = ?
      LIMIT 1
    `, [roomId]);
    
    const floorPlan = (floorPlanRows as any[]).length > 0 ? (floorPlanRows as any[])[0] : null;
    
    // Get students currently in this room
    // Simply return empty array for now - the frontend will use WebSocket positions
    let finalStudents: any[] = [];
    
    console.log('ℹ️ Floor plan will show students from real-time positioning data (WebSocket)');
    
    const response = {
      room: {
        id: room.id,
        room_name: room.room_name,
        room_number: room.room_number,
        floor_name: room.floor_name,
        floor_number: room.floor_number,
        building_name: room.building_name,
        building_lat: room.building_lat,
        building_lng: room.building_lng,
        esp32_ip: room.esp32_ip,
        bounds: room.bounds_north ? {
          north: room.bounds_north,
          south: room.bounds_south,
          east: room.bounds_east,
          west: room.bounds_west
        } : null
      },
      floor_plan: floorPlan ? {
        id: floorPlan.id,
        image_url: `/uploads/floor-plans/${floorPlan.image_path.split('/').pop()}`,
        zoom_level: floorPlan.zoom_level,
        opacity: floorPlan.opacity
      } : null,
      students: finalStudents,
      student_count: (finalStudents as any[]).length
    };
    
    console.log(`✅ Floor plan data for room ${roomId}:`, response);
    res.json(response);
  } catch (error) {
    console.error('❌ Error fetching room floor plan:', error);
    res.status(500).json({ error: 'Server error fetching room floor plan' });
  }
}

/**
 * GET /api/buildings/rooms/:roomId/students
 * Get students currently in a specific room (real-time)
 */
export async function getRoomStudents(req: Request, res: Response): Promise<void> {
  console.log('🚨🚨🚨 getRoomStudents CALLED - roomId:', req.params.roomId);
  try {
    const { roomId } = req.params;
    console.log(`👥 Fetching students in room ${roomId}...`);
    
    // Get room ESP32 IP
    const [roomRows] = await pool.query(`
      SELECT esp32_ip, room_name FROM building_rooms WHERE id = ?
    `, [roomId]);
    
    if ((roomRows as any[]).length === 0) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    
    const room = (roomRows as any[])[0];
    
    // Get students connected to this room's ESP32
    // NOTE: Using ble_detections instead of phone_locations
    const [studentsRows] = await pool.query(`
      SELECT DISTINCT
        s.id,
        s.name as student_name,
        s.grade,
        s.section
      FROM students s
      WHERE s.id IN (
        SELECT DISTINCT student_id 
        FROM ble_detections 
        WHERE location_name LIKE CONCAT('%', ?, '%')
        AND detected_at > DATE_SUB(NOW(), INTERVAL 30 MINUTE)
      )
      ORDER BY s.name
    `, [room.room_name]);
    
    console.log(`✅ Found ${(studentsRows as any[]).length} students in room ${room.room_name}`);
    res.json({
      room_name: room.room_name,
      esp32_ip: room.esp32_ip,
      students: studentsRows,
      count: (studentsRows as any[]).length
    });
  } catch (error) {
    console.error('❌ Error fetching room students:', error);
    res.status(500).json({ error: 'Server error fetching room students' });
  }
}
