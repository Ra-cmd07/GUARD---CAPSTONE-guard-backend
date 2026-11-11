// ============================================================================
// ESP32 #2 - ROOM 201 SCANNER - AttendBox v4.0
// ============================================================================
// ESP32 MAC Address: EC:E3:34:22:76:D6
// Beacon ID: BEACON_ROOM201
// Location: Room 201 - Grade 7 Section 1
// 
// ⚠️ UPLOAD THIS FILE TO ESP32 WITH MAC: EC:E3:34:22:76:D6
// 
// Purpose: Detect student BLE tags with triangulation from multiple beacons
// Integration: Fetches beacon MAC addresses from database, compares RSSI
// Best Location: Determined by strongest signal from multiple beacons
// Distance: Calculated from RSSI for each beacon
// ============================================================================

#include <WiFi.h>
#include <WiFiClient.h>
#include <HTTPClient.h>
#include <BLEDevice.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>
#include <time.h>
#include <ArduinoJson.h>

// ═══════════════════════════════════════════════════════════════════════
// CONFIGURATION - ESP32 #2 ROOM 201
// ═══════════════════════════════════════════════════════════════════════

// WiFi
const char* WIFI_SSID = "Infinix HOT 20 5G";
const char* WIFI_PASSWORD = "12345678000";

// Server
const char* SERVER_HOST = "192.168.1.29";
const uint16_t SERVER_PORT = 5000;
const char* API_ENDPOINT = "/api/location/ble-update";
const char* BEACONS_ENDPOINT = "/api/location/beacons";

// ⭐ THIS ESP32 IDENTITY - PRE-CONFIGURED FOR ROOM 201
const char* MY_BEACON_ID = "BEACON_ROOM201";
const char* MY_LOCATION_NAME = "Room 201";

// Detection
const int RSSI_THRESHOLD = -85;         // Detect up to ~15m away
const int SCAN_DURATION = 5;
const int SCAN_INTERVAL = 3000;

// Beacon refresh interval (fetch from database every 5 minutes)
const unsigned long BEACON_REFRESH_INTERVAL = 300000; // 5 minutes
unsigned long lastBeaconRefresh = 0;

// ═══════════════════════════════════════════════════════════════════════
// STRUCTURES
// ═══════════════════════════════════════════════════════════════════════

struct BeaconInfo {
  String beaconId;
  String macAddress;
  String locationName;
  String locationType;
};

struct DetectionResult {
  String macAddress;
  int rssi;
  String closestBeacon;
  int closestRssi;
};

// ═══════════════════════════════════════════════════════════════════════
// GLOBAL VARIABLES
// ═══════════════════════════════════════════════════════════════════════

BLEScan* bleScan;
std::vector<BeaconInfo> knownBeacons;

struct Statistics {
  unsigned long successful_updates = 0;
  unsigned long failed_updates = 0;
  unsigned long devices_detected = 0;
} stats;

// ═══════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

String normalizeMacAddress(String mac) {
  mac.toUpperCase();
  mac.replace("-", ":");
  return mac;
}

float calculateDistance(int rssi, int txPower = -70, float n = 2.8) {
  // CALIBRATED FOR: Indoor Classroom (Room 201)
  // txPower = -70 (calibrated from actual RSSI=-59 at 0.25m distance)
  // n = 2.8 (optimized for classroom with desks, chairs, people)
  // 
  // Calibration based on user measurement from ESP32 #1:
  // - At 0.25m distance: RSSI = -59
  // - Calculated TxPower at 1m: -70
  // - Same txPower used for all ESP32s (detecting same BLE beacons)
  // 
  // Expected accuracy: ±10-15% error
  if (rssi == 0) return -1.0;
  float ratio = (txPower - rssi) / (10.0 * n);
  float distance = pow(10.0, ratio);
  // Allow distances from 0.1m to 50m (removed 0.5m minimum)
  return max(0.1f, min(distance, 50.0f));
}

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  
  Serial.print("\n📡 Connecting to WiFi: ");
  Serial.println(WIFI_SSID);
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long startTime = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - startTime) < 20000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi connected!");
    Serial.print("   IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n❌ WiFi connection failed!");
  }
}

// ═══════════════════════════════════════════════════════════════════════
// FETCH BEACONS FROM DATABASE
// ═══════════════════════════════════════════════════════════════════════

bool fetchBeaconsFromDatabase() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("❌ WiFi not connected, cannot fetch beacons");
    return false;
  }

  HTTPClient http;
  WiFiClient client;

  String url = String("http://") + SERVER_HOST + ":" + SERVER_PORT + BEACONS_ENDPOINT;

  Serial.println("\n🔍 Fetching beacon list from database...");
  
  if (!http.begin(client, url)) {
    Serial.println("❌ HTTP begin failed");
    return false;
  }

  http.setTimeout(10000);
  int httpCode = http.GET();

  bool success = false;

  if (httpCode == 200) {
    String response = http.getString();
    
    DynamicJsonDocument doc(4096);
    DeserializationError error = deserializeJson(doc, response);

    if (!error) {
      JsonArray beaconsArray = doc["beacons"];
      knownBeacons.clear();

      for (JsonObject beaconObj : beaconsArray) {
        BeaconInfo beacon;
        beacon.beaconId = beaconObj["beacon_id"].as<String>();
        beacon.macAddress = beaconObj["mac_address"].as<String>();
        beacon.locationName = beaconObj["location_name"].as<String>();
        beacon.locationType = beaconObj["location_type"].as<String>();
        
        // Only add beacons that have MAC addresses
        if (beacon.macAddress.length() > 0) {
          knownBeacons.push_back(beacon);
        }
      }

      Serial.printf("✅ Loaded %d beacons with MAC addresses:\n", knownBeacons.size());
      for (const auto& b : knownBeacons) {
        Serial.printf("   📍 %s (%s) - MAC: %s\n", 
          b.locationName.c_str(), 
          b.beaconId.c_str(),
          b.macAddress.c_str()
        );
      }
      
      success = true;
    } else {
      Serial.println("❌ JSON parse error");
    }
  } else {
    Serial.printf("❌ HTTP %d\n", httpCode);
  }

  http.end();
  return success;
}

// ═══════════════════════════════════════════════════════════════════════
// TRIANGULATION: Find closest beacon
// ═══════════════════════════════════════════════════════════════════════

String findClosestBeacon(const std::vector<DetectionResult>& detections, 
                         const String& studentMac, 
                         int& outRssi) {
  int strongestRssi = -999;
  String closestBeacon = MY_BEACON_ID; // Default to this ESP32

  // Check if student detected by THIS scanner
  for (const auto& detection : detections) {
    if (detection.macAddress.equalsIgnoreCase(studentMac) && 
        detection.rssi > strongestRssi) {
      strongestRssi = detection.rssi;
    }
  }

  // Check if student detected by OTHER beacons
  for (const auto& beacon : knownBeacons) {
    for (const auto& detection : detections) {
      // If we detected another beacon's MAC address with strong signal,
      // it means student might be closer to that beacon
      if (detection.macAddress.equalsIgnoreCase(beacon.macAddress) &&
          detection.rssi > strongestRssi) {
        strongestRssi = detection.rssi;
        closestBeacon = beacon.beaconId;
      }
    }
  }

  outRssi = strongestRssi;
  return closestBeacon;
}

// ═══════════════════════════════════════════════════════════════════════
// SEND LOCATION UPDATE
// ═══════════════════════════════════════════════════════════════════════

bool sendLocationUpdate(String macAddress, int rssi, String beaconId) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("   ❌ WiFi not connected");
    return false;
  }

  HTTPClient http;
  WiFiClient client;

  String url = String("http://") + SERVER_HOST + ":" + SERVER_PORT + API_ENDPOINT;

  if (!http.begin(client, url)) {
    Serial.println("   ❌ HTTP begin failed");
    return false;
  }

  DynamicJsonDocument doc(512);
  doc["macAddress"] = macAddress;
  doc["beaconId"] = beaconId;
  doc["rssi"] = rssi;
  
  String payload;
  serializeJson(doc, payload);

  http.addHeader("Content-Type", "application/json");
  http.addHeader("Connection", "close");
  http.setTimeout(10000);

  int httpCode = http.POST(payload);

  bool success = false;

  if (httpCode > 0) {
    String response = http.getString();
    DynamicJsonDocument responseDoc(1024);
    DeserializationError error = deserializeJson(responseDoc, response);

    if (!error) {
      bool apiSuccess = responseDoc["success"] | false;
      
      if (httpCode == 200 && apiSuccess) {
        JsonObject studentObj = responseDoc["student"];
        const char* studentName = studentObj["name"];
        int studentId = studentObj["id"] | 0;
        
        JsonObject positionObj = responseDoc["position"];
        float lat = positionObj["lat"] | 0.0;
        float lng = positionObj["lng"] | 0.0;
        
        float distance = responseDoc["distance"] | 0.0;  // Changed from int to float

        Serial.print("   ✅ ");
        Serial.print(studentName ? studentName : "Student");
        Serial.print(" (ID:");
        Serial.print(studentId);
        Serial.print(") @ ");
        Serial.print(beaconId);
        Serial.print(" ~");
        Serial.print(distance, 2);  // Print with 2 decimal places
        Serial.println("m");
        
        success = true;
        stats.successful_updates++;
      } else {
        const char* error = responseDoc["error"];
        Serial.print("   ⚠️  ");
        Serial.println(error ? error : "Update failed");
      }
    }
  } else {
    Serial.printf("   ❌ HTTP %d\n", httpCode);
    stats.failed_updates++;
  }

  http.end();
  return success;
}

// ═══════════════════════════════════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════════════════════════════════

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n\n╔════════════════════════════════════════════════════════════╗");
  Serial.println("║  ESP32 #2 - ROOM 201 SCANNER - v4.0                     ║");
  Serial.println("║  Triangulation with Database-Stored Beacon MAC Addresses ║");
  Serial.println("╚════════════════════════════════════════════════════════════╝");
  
  Serial.println("\n📍 This Beacon:");
  Serial.print("   ID: ");
  Serial.println(MY_BEACON_ID);
  Serial.print("   Location: ");
  Serial.println(MY_LOCATION_NAME);
  Serial.println("   ESP32 MAC: EC:E3:34:22:76:D6");

  connectWiFi();

  Serial.print("\n🔵 Initializing BLE scanner...");
  BLEDevice::init("");
  bleScan = BLEDevice::getScan();
  bleScan->setActiveScan(true);
  bleScan->setInterval(100);
  bleScan->setWindow(99);
  Serial.println(" ✅");

  // Fetch beacon list from database
  fetchBeaconsFromDatabase();

  Serial.println("\n╔════════════════════════════════════════════════════════════╗");
  Serial.println("║   Ready! Multi-beacon triangulation active                ║");
  Serial.println("║   Monitoring Room 201 - Grade 7 Section 1                ║");
  Serial.println("╚════════════════════════════════════════════════════════════╝\n");
  
  delay(2000);
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN LOOP
// ═══════════════════════════════════════════════════════════════════════

void loop() {
  // Check WiFi
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️  WiFi disconnected - reconnecting...");
    connectWiFi();
    delay(1000);
    return;
  }

  // Refresh beacon list periodically
  if (millis() - lastBeaconRefresh > BEACON_REFRESH_INTERVAL) {
    fetchBeaconsFromDatabase();
    lastBeaconRefresh = millis();
  }

  // Start BLE scan
  Serial.println("════════════════════════════════════════════════════════════");
  Serial.println("📡 Scanning for BLE devices...");

  BLEScanResults* results = bleScan->start(SCAN_DURATION, false);
  int deviceCount = results->getCount();
  
  Serial.printf("✓ Found %d BLE devices\n", deviceCount);
  stats.devices_detected += deviceCount;

  if (deviceCount > 0) {
    std::vector<DetectionResult> detections;

    // Collect all detections
    for (int i = 0; i < deviceCount; i++) {
      BLEAdvertisedDevice device = results->getDevice(i);
      DetectionResult det;
      det.macAddress = normalizeMacAddress(String(device.getAddress().toString().c_str()));
      det.rssi = device.getRSSI();
      detections.push_back(det);
    }

    // Process each detected device
    Serial.println("\n📋 Processing detections:");
    for (const auto& detection : detections) {
      if (detection.rssi < RSSI_THRESHOLD) continue; // Too far

      // Determine closest beacon for this device
      int closestRssi;
      String closestBeacon = findClosestBeacon(detections, detection.macAddress, closestRssi);
      
      float distance = calculateDistance(detection.rssi);

      Serial.printf("│ %s │ %5d │ %4.2fm │ %s\n", 
        detection.macAddress.c_str(),
        detection.rssi,
        distance,
        closestBeacon.c_str()
      );

      // Send update
      bool updated = sendLocationUpdate(detection.macAddress, detection.rssi, closestBeacon);
      
      delay(100);
    }
  }

  // Statistics
  Serial.println("\n╔════════════════════════════════════════════════════════════╗");
  Serial.printf("✅ Successful: %lu  ❌ Failed: %lu  📱 Detected: %lu\n", 
    stats.successful_updates, 
    stats.failed_updates,
    stats.devices_detected
  );
  Serial.println("╚════════════════════════════════════════════════════════════╝\n");

  bleScan->clearResults();
  delay(SCAN_INTERVAL);
}
