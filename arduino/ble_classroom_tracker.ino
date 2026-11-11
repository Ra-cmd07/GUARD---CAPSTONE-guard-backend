// ============================================================================
// ESP32 BLE LOCATION TRACKER - Grade 7 Classroom - v3.0 (REAL-TIME)
// ============================================================================
// Purpose: Detect student BLE devices in Grade 7 Classroom (Room 201)
// Integration: Sends location updates to /api/location/ble-update
// Detection Range: 5 meters (classroom-wide coverage)
// Function: Real-time location tracking with MOVING DOTS on live map
// 
// ✨ NEW in v3.0:
// - Updated API payload format (macAddress, beaconId, rssi)
// - RSSI-based distance calculation on backend
// - Position updates broadcast via WebSocket to all connected clients
// - Students appear as moving dots on admin/teacher live map
// - Smooth position transitions with exponential smoothing
// - Color-coded by grade level on map
// ============================================================================

#include <WiFi.h>
#include <WiFiClient.h>
#include <HTTPClient.h>
#include <BLEDevice.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>
#include <time.h>
#include <ArduinoJson.h>  // Install via Library Manager: ArduinoJson by Benoit Blanchon

// ═══════════════════════════════════════════════════════════════════════
// CONFIGURATION - UPDATE THESE FOR YOUR SETUP
// ═══════════════════════════════════════════════════════════════════════

// ─── WiFi CONFIGURATION ────────────────────────────────────────────────
const char* WIFI_SSID = "Infinix HOT 20 5G";
const char* WIFI_PASSWORD = "12345678000";

// ─── SERVER CONFIGURATION ──────────────────────────────────────────────
const char* SERVER_HOST = "10.170.131.63";        // Your backend IP address
const uint16_t SERVER_PORT = 5000;                // Backend port
const char* API_ENDPOINT = "/api/location/ble-update";  // Location tracking endpoint

// ─── BEACON CONFIGURATION - GRADE 7 CLASSROOM ──────────────────────────
const char* BEACON_ID = "BEACON_ROOM201";         // Must match database ble_beacons.beacon_id
const char* LOCATION_NAME = "Room 201";
const char* LOCATION_TYPE = "classroom";          // IMPORTANT: "classroom" = location tracking only
const char* BUILDING = "Academic Building";
const char* FLOOR = "2nd Floor";

// ─── DETECTION CONFIGURATION - 5 METER RANGE ───────────────────────────
const int RSSI_THRESHOLD = -75;                   // 5-meter detection range
                                                  // -60 = ~1m, -70 = ~3m, -75 = ~5m, -80 = ~10m
const int SCAN_DURATION = 5;                      // Seconds per BLE scan
const int SCAN_INTERVAL = 0;                      // No delay - continuous scanning
const float FIXED_DISTANCE = 5.0;                 // Always report 5 meters
const int WIFI_CONNECT_TIMEOUT = 20000;           // 20 seconds timeout for WiFi

// ─── NTP & TIMEZONE ────────────────────────────────────────────────────
const char* NTP_SERVER = "pool.ntp.org";
const long GMT_OFFSET = 8 * 3600;                 // UTC+8 (Philippines)
const int DAYLIGHT_OFFSET = 0;                    // No DST in Philippines

// ═══════════════════════════════════════════════════════════════════════
// GLOBAL VARIABLES
// ═══════════════════════════════════════════════════════════════════════

BLEScan* bleScan;

struct Statistics {
  unsigned long successful_updates = 0;
  unsigned long failed_updates = 0;
  unsigned long devices_detected = 0;
  unsigned long wifi_reconnects = 0;
} stats;

// ═══════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get current timestamp in ISO 8601 format
 */
String getIsoTimestamp() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    return "1970-01-01T00:00:00Z";
  }
  char buffer[30];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(buffer);
}

/**
 * Normalize MAC address format (AA:BB:CC:DD:EE:FF)
 */
String normalizeMacAddress(String mac) {
  mac.toUpperCase();
  mac.replace("-", ":");
  return mac;
}

/**
 * Connect to WiFi with enhanced retry logic
 */
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;  // Already connected
  }

  Serial.print("\n📡 Connecting to WiFi: ");
  Serial.println(WIFI_SSID);
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startTime = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - startTime) < WIFI_CONNECT_TIMEOUT) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi connected!");
    Serial.print("   IP Address: ");
    Serial.println(WiFi.localIP());
    Serial.print("   Gateway: ");
    Serial.println(WiFi.gatewayIP());
    Serial.print("   Signal Strength: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
  } else {
    Serial.println("\n❌ WiFi connection failed!");
    Serial.print("   Status Code: ");
    Serial.println(WiFi.status());
    stats.wifi_reconnects++;
  }
}

/**
 * Send location update to backend API for REAL-TIME MAP TRACKING
 * Updated for new /api/location/ble-update endpoint (v3.0)
 */
bool sendLocationUpdate(String macAddress, int rssi) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("   ❌ WiFi not connected");
    return false;
  }

  HTTPClient http;
  WiFiClient client;

  // Build API URL
  String url = String("http://") + SERVER_HOST + ":" + SERVER_PORT + API_ENDPOINT;

  if (!http.begin(client, url)) {
    Serial.println("   ❌ HTTP begin failed");
    return false;
  }

  // Build JSON payload - NEW FORMAT for real-time location tracking
  // Note: Backend will lookup studentId from MAC address
  DynamicJsonDocument doc(512);
  doc["macAddress"] = macAddress;     // Changed from "mac_address" to "macAddress"
  doc["beaconId"] = BEACON_ID;        // Changed from "beacon_id" to "beaconId"
  doc["rssi"] = rssi;                 // Changed from "signal_strength" to "rssi"
  
  String payload;
  serializeJson(doc, payload);

  // Set headers
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Connection", "close");
  http.setTimeout(10000);

  // Send POST request
  int httpCode = http.POST(payload);

  bool success = false;

  if (httpCode > 0) {
    String response = http.getString();

    // Parse JSON response - NEW FORMAT from real-time location API
    DynamicJsonDocument responseDoc(1024);
    DeserializationError error = deserializeJson(responseDoc, response);

    if (!error) {
      bool apiSuccess = responseDoc["success"] | false;
      
      // Extract student info
      JsonObject studentObj = responseDoc["student"];
      const char* studentName = studentObj["name"];
      int studentId = studentObj["id"] | 0;
      
      // Extract position info
      JsonObject positionObj = responseDoc["position"];
      float lat = positionObj["lat"] | 0.0;
      float lng = positionObj["lng"] | 0.0;
      int accuracy = positionObj["accuracy"] | 0;
      
      const char* beaconName = responseDoc["beacon"];
      int distance = responseDoc["distance"] | 0;
      int responseRssi = responseDoc["rssi"] | rssi;

      if (httpCode == 200 && apiSuccess) {
        // Successfully updated location
        Serial.print("   ✅ ");
        Serial.print(studentName ? studentName : "Student");
        Serial.print(" (ID:");
        Serial.print(studentId);
        Serial.print(") @ ");
        Serial.print(beaconName ? beaconName : LOCATION_NAME);
        Serial.print(" ~");
        Serial.print(distance);
        Serial.println("m");
        
        // Show position on map
        Serial.print("      📍 Map: (");
        Serial.print(lat, 6);
        Serial.print(", ");
        Serial.print(lng, 6);
        Serial.print(") ±");
        Serial.print(accuracy);
        Serial.println("m");
        
        // Note: Real-time tracking updates live map via WebSocket
        Serial.println("      🗺️  Live map updated via WebSocket");
        
        success = true;
        stats.successful_updates++;
      } else if (httpCode == 404) {
        const char* error = responseDoc["error"];
        Serial.print("   ⚠️  ");
        Serial.println(error ? error : "Student not found");
      } else {
        const char* error = responseDoc["error"];
        Serial.print("   ⚠️  ");
        Serial.println(error ? error : response.c_str());
      }
    } else {
      // JSON parse failed - show raw response
      Serial.print("   Response (HTTP ");
      Serial.print(httpCode);
      Serial.print("): ");
      Serial.println(response.substring(0, 100));  // First 100 chars
      
      if (httpCode >= 200 && httpCode < 300) {
        success = true;
        stats.successful_updates++;
      }
    }
  } else {
    // HTTP request failed
    Serial.print("   ❌ HTTP ");
    Serial.print(httpCode);
    Serial.print(": ");
    Serial.println(http.errorToString(httpCode));
    stats.failed_updates++;
    
    // Try direct TCP test for debugging
    if (httpCode == -1) {
      Serial.print("   🔍 Testing TCP connection to ");
      Serial.print(SERVER_HOST);
      Serial.print(":");
      Serial.println(SERVER_PORT);
      
      if (client.connect(SERVER_HOST, SERVER_PORT)) {
        Serial.println("   ✅ TCP connection successful");
        client.stop();
      } else {
        Serial.println("   ❌ TCP connection failed");
      }
    }
  }

  http.end();
  return success;
}

/**
 * Check if device is within proximity threshold
 */
bool isWithinRange(int rssi) {
  // Stronger signal (higher RSSI) = closer device
  // -75 dBm is roughly 5 meters for most BLE devices
  return rssi >= RSSI_THRESHOLD;
}

/**
 * Calculate distance from RSSI (same formula as backend)
 * Formula: distance = 10 ^ ((TxPower - RSSI) / (10 * N))
 * TxPower: -59 dBm (signal strength at 1 meter)
 * N: 2.5 (path loss exponent)
 */
float calculateDistance(int rssi, int txPower = -59, float n = 2.5) {
  if (rssi == 0) return -1.0; // Invalid
  
  float ratio = (txPower - rssi) / (10.0 * n);
  float distance = pow(10.0, ratio);
  
  // Clamp to reasonable range (0.5m - 50m)
  return max(0.5f, min(distance, 50.0f));
}

// ═══════════════════════════════════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════════════════════════════════

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n\n╔════════════════════════════════════════════════════════════╗");
  Serial.println("║  AttendBox BLE Classroom Tracker - ESP32 v3.0            ║");
  Serial.println("║  Real-Time Location Tracking with Moving Dots on Map     ║");
  Serial.println("╚════════════════════════════════════════════════════════════╝");
  
  Serial.println("\n📍 Beacon Configuration:");
  Serial.print("   Beacon ID: ");
  Serial.println(BEACON_ID);
  Serial.print("   Location: ");
  Serial.println(LOCATION_NAME);
  Serial.print("   Type: ");
  Serial.print(LOCATION_TYPE);
  Serial.println(" (LOCATION TRACKING ONLY - NO ATTENDANCE)");
  Serial.print("   Building: ");
  Serial.println(BUILDING);
  Serial.print("   Floor: ");
  Serial.println(FLOOR);
  Serial.print("   Detection Range: ");
  Serial.print(FIXED_DISTANCE);
  Serial.println(" meters (classroom-wide coverage)");
  Serial.print("   RSSI Threshold: ");
  Serial.print(RSSI_THRESHOLD);
  Serial.println(" dBm (approx 5 meters)");

  // Connect to WiFi
  connectWiFi();

  // Initialize NTP time sync
  Serial.print("\n⏰ Synchronizing time with NTP...");
  configTime(GMT_OFFSET, DAYLIGHT_OFFSET, NTP_SERVER);
  
  time_t now = time(nullptr);
  int attempts = 0;
  while (now < 24 * 3600 && attempts < 20) {
    delay(500);
    Serial.print(".");
    now = time(nullptr);
    attempts++;
  }
  
  if (now > 24 * 3600) {
    Serial.println(" ✅");
    Serial.print("   Current time: ");
    Serial.println(getIsoTimestamp());
  } else {
    Serial.println(" ⚠️");
    Serial.println("   Time sync failed - timestamps may be incorrect");
  }

  // Initialize BLE scanner
  Serial.print("\n🔵 Initializing BLE scanner...");
  BLEDevice::init("");
  bleScan = BLEDevice::getScan();
  bleScan->setActiveScan(true);
  bleScan->setInterval(100);
  bleScan->setWindow(99);
  Serial.println(" ✅");

  Serial.println("\n╔════════════════════════════════════════════════════════════╗");
  Serial.println("║   Ready! Real-Time Location Tracking Active              ║");
  Serial.println("║   Students will appear as MOVING DOTS on live map        ║");
  Serial.println("║   Updates broadcast via WebSocket every few seconds      ║");
  Serial.println("╚════════════════════════════════════════════════════════════╝\n");
  
  delay(2000);  // Give time to read startup messages
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN LOOP
// ═══════════════════════════════════════════════════════════════════════

void loop() {
  // Check WiFi connection
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️  WiFi disconnected - reconnecting...");
    connectWiFi();
    delay(1000);
    return;
  }

  // Start BLE scan
  Serial.println("════════════════════════════════════════════════════════════");
  Serial.print("📡 Scanning for BLE devices at ");
  Serial.println(getIsoTimestamp());
  Serial.print("   Beacon: ");
  Serial.print(BEACON_ID);
  Serial.print(" (");
  Serial.print(LOCATION_NAME);
  Serial.println(")");

  BLEScanResults* results = bleScan->start(SCAN_DURATION, false);
  int deviceCount = results->getCount();
  
  Serial.printf("✓ Found %d BLE devices\n", deviceCount);
  stats.devices_detected += deviceCount;

  if (deviceCount == 0) {
    Serial.println("ℹ️  No devices detected in range");
  } else {
    Serial.println("\n📋 Detected Devices:");
    Serial.println("┌─────────────────────┬───────┬──────────┬────────┐");
    Serial.println("│   MAC Address       │ RSSI  │ Distance │ Status │");
    Serial.println("├─────────────────────┼───────┼──────────┼────────┤");

    int processedDevices = 0;

    for (int i = 0; i < deviceCount; i++) {
      BLEAdvertisedDevice device = results->getDevice(i);
      String mac = normalizeMacAddress(String(device.getAddress().toString().c_str()));
      int rssi = device.getRSSI();

      // Check if device is within range
      if (isWithinRange(rssi)) {
        // Calculate actual distance from RSSI
        float distance = calculateDistance(rssi);
        
        char line[80];
        sprintf(line, "│ %-19s │ %5d │ %5.1fm   │", mac.c_str(), rssi, distance);
        Serial.print(line);

        // Send location update to backend via WiFi
        bool updated = sendLocationUpdate(mac, rssi);
        
        if (updated) {
          Serial.println(" ✅ OK  │");
        } else {
          Serial.println(" ❌ FAIL│");
        }
        
        processedDevices++;
        delay(100); // Small delay between updates
      } else {
        // Device too far away
        char line[80];
        sprintf(line, "│ %-19s │ %5d │  Too far │ SKIP   │", mac.c_str(), rssi);
        Serial.println(line);
      }
    }

    Serial.println("└─────────────────────┴───────┴──────────┴────────┘");
    Serial.printf("\n📊 Processed %d/%d devices within range\n", processedDevices, deviceCount);
  }

  // Print statistics
  Serial.println("\n╔════════════════════════════════════════════════════════════╗");
  Serial.println("║                    Session Statistics                     ║");
  Serial.println("╚════════════════════════════════════════════════════════════╝");
  Serial.printf("✅ Successful updates: %lu\n", stats.successful_updates);
  Serial.printf("❌ Failed updates: %lu\n", stats.failed_updates);
  Serial.printf("📱 Total devices detected: %lu\n", stats.devices_detected);
  Serial.printf("📡 WiFi reconnects: %lu\n", stats.wifi_reconnects);
  Serial.printf("⏱️  Uptime: %lu seconds\n", millis() / 1000);
  
  float successRate = stats.successful_updates + stats.failed_updates > 0 
    ? (100.0 * stats.successful_updates) / (stats.successful_updates + stats.failed_updates)
    : 0;
  Serial.printf("📈 Success rate: %.1f%%\n", successRate);
  Serial.println();

  // Clean up and wait
  bleScan->clearResults();
  
  if (SCAN_INTERVAL > 0) {
    Serial.printf("⏳ Waiting %d seconds until next scan...\n\n", SCAN_INTERVAL / 1000);
    delay(SCAN_INTERVAL);
  } else {
    Serial.println("🔄 Starting next scan immediately...\n");
    // No delay - continuous scanning
  }
}
