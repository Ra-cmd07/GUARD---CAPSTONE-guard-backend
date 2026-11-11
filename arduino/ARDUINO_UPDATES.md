# Arduino Sketch Update Summary

## What Changed?

Your original Arduino BLE sketch has been updated to integrate with the new **BLE Location Tracking System** for AttendBox.

## Key Changes

### 1. **Fixed Distance** ✅
- **Old:** Calculated distance from RSSI using logarithmic formula
- **New:** Fixed distance of **1.0 meter** for all detections
- Why: More consistent tracking, matches your requirement

```cpp
// OLD (ble_tracker.ino):
float rssiToDistance(int rssi) {
  const float txPower = -59.0;
  float ratio = rssi * 1.0 / txPower;
  return pow(ratio, 10);  // Calculated distance
}

// NEW (ble_location_tracker.ino):
const float FIXED_DISTANCE = 1.0;  // Always 1 meter
```

### 2. **New API Endpoint** 🔄
- **Old:** `/api/ble/upload` (batch upload with room_name)
- **New:** `/api/location/ble-update` (single device with beacon_id)
- Why: Integrated with location tracking system and live map

```cpp
// OLD:
const char* serverPath = "/api/ble/upload";
payload = {"devices": [...], "room_name": "room1"}

// NEW:
const char* API_ENDPOINT = "/api/location/ble-update";
payload = {"mac_address": "AA:BB:CC:DD:EE:FF", "beacon_id": "BEACON_GATE1", "signal_strength": -65}
```

### 3. **Beacon Configuration** 📍
- **Old:** Room-based (`roomName = "room1"`)
- **New:** Beacon-based with full location info (BEACON_ID, LOCATION_NAME, TYPE, BUILDING, FLOOR)
- Why: Provides detailed location data for map display

```cpp
// OLD:
const char* roomName = "room1";

// NEW:
const char* BEACON_ID = "BEACON_GATE1";
const char* LOCATION_NAME = "Gate 1 - Main Entrance";
const char* LOCATION_TYPE = "gate";
const char* BUILDING = "Main Building";
const char* FLOOR = "Ground";
```

### 4. **Individual Device Processing** 🎯
- **Old:** Batch upload all detected devices at once
- **New:** Process and send each device individually
- Why: Real-time updates, better error handling per device

```cpp
// OLD:
// Build array of all devices, send once
payload += "{\"devices\": [";
for (int i = 0; i < count; i++) { ... }
http.POST(payload);

// NEW:
// Send each device separately
for (int i = 0; i < deviceCount; i++) {
  bool updated = sendLocationUpdate(mac, rssi);
}
```


### 5. **Enhanced Response Parsing** 📊
- **Old:** Basic JSON parsing with summary counts
- **New:** Detailed response with student name and location confirmation
- Why: Better visibility into what's being tracked

```cpp
// OLD:
int inserted = doc["summary"]["inserted"];
Serial.printf("Inserted: %d devices\n", inserted);

// NEW:
const char* studentName = responseDoc["student_name"];
const char* location = responseDoc["location"];
Serial.print("✅ ");
Serial.print(studentName);
Serial.print(" → ");
Serial.println(location);
```

### 6. **Live Map Integration** 🗺️
- **Old:** No map integration
- **New:** Updates appear in real-time on parent dashboard map
- Why: Parents can see student location instantly

### 7. **Multiple Beacon Support** 🏫
- **Old:** Single room configuration
- **New:** 6 pre-configured beacon presets, easy to add more
- Why: Campus-wide coverage with multiple ESP32 devices

---

## Migration Guide

### Step 1: Update Configuration

Replace your old configuration:

```cpp
// OLD (ble_tracker.ino):
const char* ssid = "Infinix HOT 20 5G";
const char* password = "12345678000";
const char* serverHost = "10.170.131.63";
const uint16_t serverPort = 5000;
const char* serverPath = "/api/ble/upload";
const char* roomName = "room1";
```

With new configuration:

```cpp
// NEW (ble_location_tracker.ino):
const char* WIFI_SSID = "Infinix HOT 20 5G";
const char* WIFI_PASSWORD = "12345678000";
const char* SERVER_HOST = "10.170.131.63";
const uint16_t SERVER_PORT = 5000;
const char* API_ENDPOINT = "/api/location/ble-update";
const char* BEACON_ID = "BEACON_GATE1";           // Choose beacon ID
const char* LOCATION_NAME = "Gate 1 - Main Entrance";
const char* LOCATION_TYPE = "gate";
const char* BUILDING = "Main Building";
const char* FLOOR = "Ground";
```

### Step 2: Upload New Sketch

1. Open `guard-backend/arduino/ble_location_tracker.ino` in Arduino IDE
2. Configure WiFi, server, and beacon settings
3. Upload to ESP32

### Step 3: Register Student MAC Addresses

```sql
-- Add student MAC addresses to database
UPDATE students 
SET mac_address = 'AA:BB:CC:DD:EE:FF' 
WHERE id = 1;
```

### Step 4: Test

1. Open Serial Monitor (115200 baud)
2. Watch for successful location updates: `✅ Padios → Gate 1 - Main Entrance`
3. Check parent dashboard map for real-time updates

---

## File Comparison

| Feature | ble_tracker.ino (OLD) | ble_location_tracker.ino (NEW) |
|---------|----------------------|-------------------------------|
| Distance | Calculated from RSSI | Fixed 1.0 meter |
| API Endpoint | `/api/ble/upload` | `/api/location/ble-update` |
| Upload Mode | Batch (all devices) | Individual (per device) |
| Location | Room name only | Full beacon details |
| Map Integration | No | Yes (real-time) |
| Response Data | Summary counts | Student name + location |
| Beacon Config | Single room | Multiple beacon presets |
| File Size | ~290 lines | ~375 lines |

---

## What to Keep

Both sketches are kept in the `arduino` folder:

1. **`ble_tracker.ino`** (OLD)
   - Your original sketch
   - Kept for reference
   - Uses old `/api/ble/upload` endpoint

2. **`ble_location_tracker.ino`** (NEW)
   - Updated sketch
   - Use this for location tracking
   - Integrates with live map

---

## Backend Changes Required

### Old Backend Endpoint (if still used):

```typescript
// POST /api/ble/upload
{
  "devices": [
    {"mac_address": "AA:BB:CC:DD:EE:FF", "rssi": -65, "distance": 2.5, "timestamp": "..."}
  ],
  "room_name": "room1"
}
```

### New Backend Endpoint (recommended):

```typescript
// POST /api/location/ble-update
{
  "mac_address": "AA:BB:CC:DD:EE:FF",
  "beacon_id": "BEACON_GATE1",
  "signal_strength": -65
}
```

---

## Benefits of New Sketch

✅ **Simpler distance tracking** - No complex RSSI calculations  
✅ **Real-time map updates** - Parents see location instantly  
✅ **Better error handling** - Per-device status reporting  
✅ **Campus-wide support** - Multiple beacons with detailed locations  
✅ **Cleaner logs** - Table format for detected devices  
✅ **More reliable** - Enhanced WiFi reconnection logic  
✅ **Future-proof** - Supports upcoming features (geofencing, alerts)  

---

## Quick Start

**Want to get started immediately?**

1. Open `ble_location_tracker.ino`
2. Update lines 25-26 (WiFi credentials)
3. Update line 29 (Server IP address)
4. Choose beacon preset (lines 37-85)
5. Upload to ESP32
6. Monitor Serial output
7. Check parent dashboard map

That's it! 🎉

---

## Need Help?

- **Serial output shows errors?** → Check Troubleshooting section in BLE_LOCATION_TRACKING_GUIDE.md
- **Map not updating?** → Verify backend is running and student MAC is registered
- **WiFi won't connect?** → Ensure 2.4GHz network, check credentials

---

**Last Updated:** June 15, 2026  
**Version:** 2.0  
**Sketch File:** `guard-backend/arduino/ble_location_tracker.ino`
