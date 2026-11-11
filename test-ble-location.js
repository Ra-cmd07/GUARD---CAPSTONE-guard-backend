/**
 * Test script for BLE location tracking
 * Simulates location updates for multiple students
 * 
 * Usage: node test-ble-location.js
 */

const axios = require('axios');

const API_URL = 'http://localhost:5000/api';

// Simulate RSSI readings for 5 students near 3 beacons
const STUDENT_IDS = [1, 2, 3, 4, 5];
const BEACON_IDS = ['BLE_GATE_001', 'BLE_CLASS_001', 'BLE_CLASS_002'];

// Simulate student movement by varying RSSI
let studentPositions = STUDENT_IDS.map((id, index) => ({
  studentId: id,
  beaconIndex: index % BEACON_IDS.length, // Start near different beacons
  baseRssi: -60,
  direction: 1, // 1 = moving away, -1 = moving closer
}));

async function sendLocationUpdate() {
  try {
    // Update positions
    studentPositions = studentPositions.map(pos => {
      // Randomly change direction
      if (Math.random() > 0.8) {
        pos.direction *= -1;
      }

      // Move RSSI (simulating movement)
      pos.baseRssi += pos.direction * (Math.random() * 5);

      // Clamp RSSI between -45 and -85
      pos.baseRssi = Math.max(-85, Math.min(-45, pos.baseRssi));

      // Sometimes switch to different beacon
      if (Math.random() > 0.9) {
        pos.beaconIndex = Math.floor(Math.random() * BEACON_IDS.length);
      }

      return pos;
    });

    // Prepare batch readings
    const readings = studentPositions.map(pos => ({
      studentId: pos.studentId,
      beaconId: BEACON_IDS[pos.beaconIndex],
      rssi: pos.baseRssi + (Math.random() * 4 - 2), // Add jitter
      macAddress: `AA:BB:CC:DD:EE:0${pos.studentId}`,
    }));

    // Send to API
    const response = await axios.post(`${API_URL}/location/ble-batch`, { readings });
    
    console.log(`✅ [${new Date().toLocaleTimeString()}] Sent batch update for ${readings.length} students`);
    readings.forEach(r => {
      console.log(`   Student ${r.studentId} @ ${r.beaconId}: ${r.rssi.toFixed(1)} dBm (~${calculateDistance(r.rssi)}m)`);
    });

  } catch (error) {
    console.error('❌ Failed to send location update:', error.response?.data || error.message);
  }
}

// Calculate approximate distance from RSSI
function calculateDistance(rssi, txPower = -59, n = 2.5) {
  const ratio = (txPower - rssi) / (10 * n);
  const distance = Math.pow(10, ratio);
  return Math.round(Math.max(0.5, Math.min(distance, 50)));
}

async function startSimulation() {
  console.log('🗺️  Starting BLE Location Tracking Simulation');
  console.log('📡 Sending updates every 3 seconds...\n');

  // Send first update immediately
  await sendLocationUpdate();

  // Then send updates every 3 seconds
  setInterval(sendLocationUpdate, 3000);
}

// Start simulation
startSimulation();
