"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllBuildings = getAllBuildings;
exports.getBuildingFloors = getBuildingFloors;
exports.getFloorRooms = getFloorRooms;
exports.getRoomFloorPlan = getRoomFloorPlan;
exports.getRoomStudents = getRoomStudents;
const db_1 = __importDefault(require("../lib/db"));
/**
 * GET /api/buildings
 * Get all buildings with their coordinates and zoom levels
 */
async function getAllBuildings(req, res) {
    try {
        console.log('🏢 Fetching all buildings...');
        const [rows] = await db_1.default.query(`
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
        console.log(`✅ Found ${rows.length} buildings`);
        res.json(rows);
    }
    catch (error) {
        console.error('❌ Error fetching buildings:', error);
        res.status(500).json({ error: 'Server error fetching buildings' });
    }
}
/**
 * GET /api/buildings/:id/floors
 * Get all floors for a specific building
 */
async function getBuildingFloors(req, res) {
    try {
        const { id } = req.params;
        console.log(`🏢 Fetching floors for building ${id}...`);
        const [rows] = await db_1.default.query(`
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
        console.log(`✅ Found ${rows.length} floors for building ${id}`);
        res.json(rows);
    }
    catch (error) {
        console.error('❌ Error fetching building floors:', error);
        res.status(500).json({ error: 'Server error fetching floors' });
    }
}
/**
 * GET /api/buildings/floors/:floorId/rooms
 * Get all rooms for a specific floor
 */
async function getFloorRooms(req, res) {
    try {
        const { floorId } = req.params;
        console.log(`🚪 Fetching rooms for floor ${floorId}...`);
        const [rows] = await db_1.default.query(`
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
      ORDER BY br.room_number
    `, [floorId]);
        console.log(`✅ Found ${rows.length} rooms for floor ${floorId}`);
        res.json(rows);
    }
    catch (error) {
        console.error('❌ Error fetching floor rooms:', error);
        res.status(500).json({ error: 'Server error fetching rooms' });
    }
}
/**
 * GET /api/buildings/rooms/:roomId/floor-plan
 * Get floor plan and students for a specific room
 */
async function getRoomFloorPlan(req, res) {
    console.log('🚨🚨🚨 getRoomFloorPlan CALLED - roomId:', req.params.roomId);
    try {
        const { roomId } = req.params;
        console.log(`📐 Fetching floor plan for room ${roomId}...`);
        // Get room details
        const [roomRows] = await db_1.default.query(`
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
        if (roomRows.length === 0) {
            res.status(404).json({ error: 'Room not found' });
            return;
        }
        const room = roomRows[0];
        // Get floor plan image if exists
        const [floorPlanRows] = await db_1.default.query(`
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
        const floorPlan = floorPlanRows.length > 0 ? floorPlanRows[0] : null;
        // Get students currently in this room
        // Simply return empty array for now - the frontend will use WebSocket positions
        let finalStudents = [];
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
            student_count: finalStudents.length
        };
        console.log(`✅ Floor plan data for room ${roomId}:`, response);
        res.json(response);
    }
    catch (error) {
        console.error('❌ Error fetching room floor plan:', error);
        res.status(500).json({ error: 'Server error fetching room floor plan' });
    }
}
/**
 * GET /api/buildings/rooms/:roomId/students
 * Get students currently in a specific room (real-time)
 */
async function getRoomStudents(req, res) {
    console.log('🚨🚨🚨 getRoomStudents CALLED - roomId:', req.params.roomId);
    try {
        const { roomId } = req.params;
        console.log(`👥 Fetching students in room ${roomId}...`);
        // Get room details including anchor_id
        const [roomRows] = await db_1.default.query(`
      SELECT id, room_name, esp32_ip, anchor_id FROM building_rooms WHERE id = ?
    `, [roomId]);
        if (roomRows.length === 0) {
            res.status(404).json({ error: 'Room not found' });
            return;
        }
        const room = roomRows[0];
        // Get students detected by THIS room's anchor only
        const [studentsRows] = await db_1.default.query(`
      SELECT DISTINCT
        s.id,
        s.first_name,
        s.last_name,
        CONCAT(s.first_name, ' ', s.last_name) as student_name,
        s.student_id_number,
        s.grade,
        s.section,
        sl.coordinates,
        sl.signal_strength as accuracy,
        sl.timestamp as last_updated
      FROM students s
      INNER JOIN student_locations sl ON sl.student_id = s.id
      WHERE sl.is_active = 1
        AND sl.room_id = ?
        AND sl.anchor_id = ?
        AND sl.timestamp > DATE_SUB(NOW(), INTERVAL 5 MINUTE)
      ORDER BY sl.timestamp DESC
    `, [roomId, room.anchor_id]);
        // Parse coordinates into lat/lng
        const students = studentsRows.map((student) => {
            const [lat, lng] = student.coordinates ? student.coordinates.split(',').map(Number) : [0, 0];
            return {
                id: student.id,
                student_name: student.student_name,
                student_id_number: student.student_id_number,
                grade: student.grade,
                section: student.section,
                latitude: lat,
                longitude: lng,
                accuracy: student.accuracy || 0,
                last_updated: student.last_updated
            };
        });
        console.log(`✅ Found ${students.length} students in room ${room.room_name} (anchor ${room.anchor_id})`);
        res.json({
            room_name: room.room_name,
            esp32_ip: room.esp32_ip,
            anchor_id: room.anchor_id,
            students: students,
            count: students.length
        });
    }
    catch (error) {
        console.error('❌ Error fetching room students:', error);
        res.status(500).json({ error: 'Server error fetching room students' });
    }
}
