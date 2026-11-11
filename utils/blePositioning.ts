/**
 * BLE Positioning Utilities
 * Convert RSSI to distance and calculate position using trilateration
 */

interface BeaconSignal {
  beacon_id: string;
  rssi: number;
  coordinates: string; // "lat,lng"
}

interface Position {
  lat: number;
  lng: number;
  accuracy: number; // in meters
}

/**
 * Convert RSSI (signal strength) to distance in meters
 * Formula: distance = 10 ^ ((TxPower - RSSI) / (10 * N))
 * 
 * @param rssi - Received Signal Strength Indicator (typically -30 to -100)
 * @param txPower - Transmission power at 1 meter (calibrated: -70 dBm)
 * @param n - Path loss exponent (2-4, depends on environment)
 * 
 * CALIBRATED VALUES:
 * - txPower = -70 (measured from actual BLE beacon RSSI=-59 at 0.25m)
 * - n = 2.3 (average of all environments: outdoor 1.8, classroom 2.8, cafeteria 2.2)
 */
export function rssiToDistance(rssi: number, txPower: number = -70, n: number = 2.3): number {
  if (rssi === 0) return -1; // Invalid reading
  
  const ratio = (txPower - rssi) / (10 * n);
  const distance = Math.pow(10, ratio);
  
  // Clamp distance to reasonable range (0.1m - 50m)
  return Math.max(0.1, Math.min(distance, 50));
}

/**
 * Calculate position using trilateration from 3+ beacons
 * Uses weighted centroid method for simplicity
 * 
 * @param signals - Array of beacon signals with RSSI and coordinates
 */
export function calculatePosition(signals: BeaconSignal[]): Position | null {
  if (signals.length < 1) return null;
  
  // Convert RSSI to distances
  const measurements = signals.map(signal => {
    const [lat, lng] = signal.coordinates.split(',').map(Number);
    const distance = rssiToDistance(signal.rssi);
    // Weight: closer beacons have more influence
    const weight = 1 / Math.pow(distance, 2);
    
    return { lat, lng, distance, weight };
  }).filter(m => !isNaN(m.lat) && !isNaN(m.lng));
  
  if (measurements.length === 0) return null;
  
  // Weighted centroid calculation
  const totalWeight = measurements.reduce((sum, m) => sum + m.weight, 0);
  
  const lat = measurements.reduce((sum, m) => sum + (m.lat * m.weight), 0) / totalWeight;
  const lng = measurements.reduce((sum, m) => sum + (m.lng * m.weight), 0) / totalWeight;
  
  // Calculate accuracy (average distance to beacons)
  const avgDistance = measurements.reduce((sum, m) => sum + m.distance, 0) / measurements.length;
  
  return {
    lat: Number(lat.toFixed(7)),
    lng: Number(lng.toFixed(7)),
    accuracy: Math.round(avgDistance)
  };
}

/**
 * Calculate position offset within accuracy circle
 * When only one beacon is available, estimate position based on RSSI direction
 * 
 * @param beaconLat - Beacon latitude
 * @param beaconLng - Beacon longitude  
 * @param rssi - Signal strength
 * @param previousPosition - Last known position for smoothing
 */
export function calculateOffsetPosition(
  beaconLat: number,
  beaconLng: number,
  rssi: number,
  previousPosition?: { lat: number; lng: number }
): Position {
  const distance = rssiToDistance(rssi);
  
  // If we have previous position, move toward/away from beacon
  if (previousPosition) {
    const deltaLat = previousPosition.lat - beaconLat;
    const deltaLng = previousPosition.lng - beaconLng;
    const currentDistance = Math.sqrt(deltaLat * deltaLat + deltaLng * deltaLng) * 111320; // to meters
    
    // Smoothly adjust position based on new distance reading
    const ratio = distance / Math.max(currentDistance, 1);
    const smoothing = 0.3; // 30% new, 70% old (prevents jitter)
    
    return {
      lat: beaconLat + deltaLat * ratio * smoothing + deltaLat * (1 - smoothing),
      lng: beaconLng + deltaLng * ratio * smoothing + deltaLng * (1 - smoothing),
      accuracy: Math.round(distance)
    };
  }
  
  // No previous position: place at distance in random direction
  // Convert meters to degrees (approximate)
  const distanceDeg = distance / 111320;
  const angle = Math.random() * Math.PI * 2;
  
  return {
    lat: beaconLat + Math.cos(angle) * distanceDeg,
    lng: beaconLng + Math.sin(angle) * distanceDeg,
    accuracy: Math.round(distance)
  };
}

/**
 * Smooth position changes to prevent jitter
 * Exponential moving average
 */
export function smoothPosition(
  newPos: Position,
  oldPos: Position | null,
  alpha: number = 0.3
): Position {
  if (!oldPos) return newPos;
  
  return {
    lat: oldPos.lat * (1 - alpha) + newPos.lat * alpha,
    lng: oldPos.lng * (1 - alpha) + newPos.lng * alpha,
    accuracy: Math.round(oldPos.accuracy * (1 - alpha) + newPos.accuracy * alpha)
  };
}
