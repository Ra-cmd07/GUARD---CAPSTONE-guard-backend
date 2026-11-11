/**
 * ============================================================================
 * ATTENDBOX - Combined BLE Kiosk + GSM Module
 * ============================================================================
 * 
 * This ESP32 does EVERYTHING:
 * 1. Scans for BLE beacons (as scan method like RFID/QR)
 * 2. Sends scan data to backend for partial attendance
 * 3. Receives SMS trigger from backend
 * 4. Sends SMS via GSM module to parents
 * 
 * DUAL MODE OPERATION:
 * - BLE Mode: Scans for student beacons (clean logging, no spam)
 * - GSM Mode: Sends SMS when triggered by backend
 * 
 * FLOW:
 * Web kiosk → Backend → ESP32 /scan → Finds student
 *   → Backend queues SMS
 *   → Backend triggers ESP32 GSM (/trigger)
 *   → ESP32 sends SMS via SIM800L
 *   → Backend creates partial attendance (PENDING)
 *   → Teacher approves later → APPROVED status
 * 
 * ============================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <ArduinoJson.h>
#include <BLEDevice.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>

// ============================================================================
// 🔧 CONFIGURATION
// ============================================================================

// Multiple WiFi Networks (ESP32 will try each one until connected)
struct WiFiNetwork {
  const char* ssid;
  const char* password;
};

WiFiNetwork WIFI_NETWORKS[] = {
  {"Infinix HOT 20 5G", "12345678000"},      // Network 1
  {"Alsaul", "PLDTWIFIFIBER10ross"},         // Network 2
  // Add more networks as needed
};
const int NUM_WIFI_NETWORKS = sizeof(WIFI_NETWORKS) / sizeof(WIFI_NETWORKS[0]);

// Backend URL - WILL BE AUTO-DETECTED FROM CURRENT NETWORK
// Format: http://<gateway_ip>:5001 or specify manually
String BACKEND_URL = "";  // Auto-detected or set manually below
const char* MANUAL_BACKEND_URL = "http://10.163.118.63:5001";  // Your backend server IP
const int   BACKEND_PORT = 5001;

const int   KIOSK_ID    = 1;
const int   ANCHOR_ID   = 1;  // For BLE tracking

// SIM800L GSM Pins
#define SIM800_TX_PIN  16
#define SIM800_RX_PIN  17
#define SIM800_BAUD    9600

// BLE Configuration
#define BLE_SCAN_DURATION  3    // Scan for 3 seconds
#define BLE_SCAN_INTERVAL  100  // Scan every 100ms
#define BLE_SCAN_WINDOW    99
#define BLE_SCAN_COOLDOWN  5000 // 5 seconds between detecting same student

// SMS Configuration - GROUPED BY STUDENT MODE
#define POLL_INTERVAL   2000    // Poll every 2 seconds
#define MAX_RETRY       5       // Max retry attempts per SMS (5 retries)
#define RETRY_DELAY     5000    // Wait 5 seconds between retries
#define MAX_BATCH_SIZE  5       // Max SMS per student (multiple parents)

// Target BLE Beacons (Students)
struct StudentBeacon {
  String serviceUUID;
  String macAddress;
  String name;
  int targetId;
  int studentId;
  bool hasUUID;
  unsigned long lastDetected; // For cooldown
};

StudentBeacon TARGET_STUDENTS[] = {
  {"00005242-0000-1000-8000-00805f9b34fb", "F7:6C:A5:11:0A:F7", "Bernie", 1, 1, false, 0},
  {"00001803-0000-1000-8000-00805f9b34fb", "51:00:24:06:00:C4", "Kurtt", 2, 3, false, 0},
  {"00001111-0000-1000-8000-00805f9b34fb", "58:54:FF:88:E2:36", "Rae", 3, 2, true, 0},
};
int NUM_TARGETS = sizeof(TARGET_STUDENTS) / sizeof(TARGET_STUDENTS[0]);

// ============================================================================
// HARDWARE
// ============================================================================

HardwareSerial sim800(2);
WebServer server(80);
BLEScan* pBLEScan;

// ============================================================================
// STATE - GROUPED BY STUDENT MODE
// ============================================================================

bool wifiConnected = false;
bool gsmReady = false;
bool bleReady = false;
bool pollingActive = false;

unsigned long lastPollTime = 0;
unsigned long lastRetryTime = 0;

// SMS Message structure
struct SMSMessage {
  int    smsId;
  String phoneNumber;
  String message;
  int    retryCount;
  bool   processed;
};

// Current batch of SMS (all for one student)
struct SMSBatch {
  SMSMessage messages[MAX_BATCH_SIZE];
  int count;           // How many SMS in this batch
  int currentIndex;    // Which SMS we're currently sending
  int studentId;       // Which student this batch belongs to
  bool active;
} currentBatch = {{}, 0, 0, 0, false};

// ============================================================================
// WIFI CONNECTION WITH MULTI-NETWORK SUPPORT
// ============================================================================

bool connectToWiFi() {
  Serial.println("🔌 Scanning for available WiFi networks...");
  
  for (int i = 0; i < NUM_WIFI_NETWORKS; i++) {
    Serial.print("   Trying: ");
    Serial.print(WIFI_NETWORKS[i].ssid);
    Serial.print(" ... ");
    
    WiFi.begin(WIFI_NETWORKS[i].ssid, WIFI_NETWORKS[i].password);
    
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
      delay(500);
      Serial.print(".");
      attempts++;
    }
    
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println(" ✅");
      Serial.println();
      Serial.println("✅ WiFi connected!");
      Serial.print("   Network: ");
      Serial.println(WIFI_NETWORKS[i].ssid);
      Serial.print("   IP Address: ");
      Serial.println(WiFi.localIP());
      Serial.print("   Gateway: ");
      Serial.println(WiFi.gatewayIP());
      
      // Auto-detect backend URL if not manually set
      if (strlen(MANUAL_BACKEND_URL) > 0) {
        BACKEND_URL = String(MANUAL_BACKEND_URL);
      } else {
        // Use gateway IP as backend (usually the router/server)
        BACKEND_URL = "http://" + WiFi.gatewayIP().toString() + ":" + String(BACKEND_PORT);
      }
      
      Serial.print("   Backend: ");
      Serial.println(BACKEND_URL);
      
      return true;
    } else {
      Serial.println(" ❌");
      WiFi.disconnect();
    }
  }
  
  Serial.println("\n❌ Failed to connect to any WiFi network!");
  Serial.println("   Please check WiFi credentials in the sketch.");
  return false;
}

// ============================================================================
// ESP32 AUTO-REGISTRATION WITH BACKEND
// ============================================================================

bool registerWithBackend() {
  if (!wifiConnected) return false;

  Serial.println();
  Serial.println("════════════════════════════════════════════");
  Serial.println("🤖 REGISTERING ESP32 WITH BACKEND");
  Serial.println("════════════════════════════════════════════");

  HTTPClient http;
  String url = BACKEND_URL + "/api/kiosk/register-esp32";
  
  Serial.print("   URL: ");
  Serial.println(url);

  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(10000);

  // Get MAC address
  String macAddress = WiFi.macAddress();
  
  // Build registration payload
  DynamicJsonDocument doc(512);
  doc["kiosk_id"] = KIOSK_ID;
  doc["esp32_ip"] = WiFi.localIP().toString();
  doc["mac_address"] = macAddress;
  doc["firmware_version"] = "v2.0-grouped-sms";
  
  String payload;
  serializeJson(doc, payload);
  
  Serial.print("   Kiosk ID: ");
  Serial.println(KIOSK_ID);
  Serial.print("   ESP32 IP: ");
  Serial.println(WiFi.localIP());
  Serial.print("   MAC: ");
  Serial.println(macAddress);

  int httpCode = http.POST(payload);

  if (httpCode == 200) {
    String response = http.getString();
    Serial.println("   ✅ Registration successful!");
    Serial.println("   Response: " + response);
    Serial.println("════════════════════════════════════════════");
    http.end();
    return true;
  } else {
    Serial.print("   ❌ Registration failed: HTTP ");
    Serial.println(httpCode);
    if (httpCode > 0) {
      Serial.println("   Response: " + http.getString());
    }
    Serial.println("════════════════════════════════════════════");
    http.end();
    return false;
  }
}

// ============================================================================
// SETUP
// ============================================================================

void setup() {
  Serial.begin(115200);
  delay(2000);

  Serial.println("\n\n");
  Serial.println("╔══════════════════════════════════════════════╗");
  Serial.println("║  ATTENDBOX - BLE + GSM Combined Kiosk       ║");
  Serial.println("║  Scan Methods: BLE, RFID, QR Code           ║");
  Serial.println("║  Auto-Registration Enabled                  ║");
  Serial.println("╚══════════════════════════════════════════════╝");
  Serial.println();

  // Connect to WiFi (tries multiple networks)
  wifiConnected = connectToWiFi();
  
  if (!wifiConnected) {
    Serial.println("⚠️  System starting in offline mode");
    Serial.println("   ESP32 will retry WiFi connection periodically");
    // Don't return - continue with offline functionality
  } else {
    // Register ESP32 with backend automatically
    bool registered = registerWithBackend();
    
    if (registered) {
      Serial.println("✅ ESP32 is now registered with backend!");
      Serial.println("   No manual SQL updates needed!");
    } else {
      Serial.println("⚠️  Registration failed - will retry later");
      Serial.println("   System will continue normally");
    }
  }

  // Initialize HTTP server (for GSM trigger and BLE scan)
  server.on("/trigger", HTTP_POST, handleTrigger);
  server.on("/scan", HTTP_GET, handleBLEScan);
  server.begin();
  Serial.println();
  Serial.println("✅ HTTP server started on port 80");
  if (wifiConnected) {
    Serial.println("   Trigger endpoint: POST http://" + WiFi.localIP().toString() + "/trigger");
    Serial.println("   BLE scan endpoint: GET http://" + WiFi.localIP().toString() + "/scan");
  }

  // Initialize BLE
  initBLE();

  // Initialize GSM
  initGSM();

  Serial.println();
  Serial.println("✅ System ready!");
  Serial.println("🔵 BLE: ON-DEMAND ONLY (web kiosk triggers scan)");
  Serial.println("🛑 GSM: Idle (waiting for trigger)");
  Serial.println("🎯 SMS MODE: GROUPED BY STUDENT - All parents before next student");
  Serial.println("🔄 RETRY: 5 attempts per SMS with 5s delay");
  Serial.println("🤖 AUTO-REGISTRATION: Enabled");
  Serial.println("──────────────────────────────────────────────");
  Serial.println("📱 Endpoints:");
  Serial.println("   GET  /scan    - Scan for BLE tokens");
  Serial.println("   POST /trigger - Start GSM SMS sending");
  Serial.println("──────────────────────────────────────────────");
  Serial.println();
}

// ============================================================================
// MAIN LOOP - Grouped SMS Processing (by Student)
// ============================================================================

void loop() {
  unsigned long currentMillis = millis();

  // ── HANDLE HTTP REQUESTS (BLE scan & GSM trigger) ─────────────────
  server.handleClient();  // Handle /scan and /trigger endpoints

  // ── GSM POLLING & PROCESSING (Grouped by Student) ────────────────
  if (pollingActive) {
    // If no current batch, poll for next student's SMS
    if (!currentBatch.active) {
      if (currentMillis - lastPollTime >= POLL_INTERVAL) {
        lastPollTime = currentMillis;
        pollForNextBatch();
      }
    } 
    // If we have a batch, process current SMS
    else {
      if (currentMillis - lastRetryTime >= RETRY_DELAY) {
        lastRetryTime = currentMillis;
        processCurrentSMS();
      }
    }
  }

  delay(10);
}

// ============================================================================
// BLE INITIALIZATION
// ============================================================================

void initBLE() {
  Serial.println("📡 Initializing BLE scanner...");

  BLEDevice::init("");
  pBLEScan = BLEDevice::getScan();
  pBLEScan->setActiveScan(true);
  pBLEScan->setInterval(BLE_SCAN_INTERVAL);
  pBLEScan->setWindow(BLE_SCAN_WINDOW);

  bleReady = true;
  Serial.println("✅ BLE scanner ready!");
  Serial.println("   Tracking " + String(NUM_TARGETS) + " students:");
  for (int i = 0; i < NUM_TARGETS; i++) {
    Serial.println("   - " + TARGET_STUDENTS[i].name + " (ID: " + String(TARGET_STUDENTS[i].targetId) + ")");
  }
}

// ============================================================================
// GSM INITIALIZATION
// ============================================================================

void initGSM() {
  Serial.println("📱 Initializing SIM800L GSM module...");

  sim800.begin(SIM800_BAUD, SERIAL_8N1, SIM800_TX_PIN, SIM800_RX_PIN);
  delay(1000);

  while (sim800.available()) sim800.read();

  // Test AT
  bool atOk = false;
  for (int i = 0; i < 5; i++) {
    while (sim800.available()) sim800.read();
    sim800.println("AT");
    delay(1000);
    String response = "";
    unsigned long t = millis();
    while (millis() - t < 1000) {
      if (sim800.available()) response += (char)sim800.read();
    }
    if (response.indexOf("OK") != -1) {
      Serial.println("   ✅ AT command OK");
      atOk = true;
      break;
    }
  }

  if (!atOk) {
    Serial.println("   ❌ AT command failed - SMS will not work");
    return;
  }

  // Set SMS text mode
  sim800.println("AT+CMGF=1");
  delay(500);

  // Check SIM
  while (sim800.available()) sim800.read();
  sim800.println("AT+CPIN?");
  delay(1000);
  if (sim800.available()) {
    String resp = sim800.readString();
    if (resp.indexOf("READY") != -1) {
      Serial.println("   ✅ SIM card ready");
      gsmReady = true;
    }
  }

  if (gsmReady) {
    Serial.println("✅ SIM800L ready to send SMS!");
  }
}

// ============================================================================
// HTTP HANDLERS
// ============================================================================

// Handle GSM trigger (for SMS sending)
void handleTrigger() {
  Serial.println();
  Serial.println("════════════════════════════════════════════");
  Serial.println("🔔 GSM TRIGGER RECEIVED FROM BACKEND!");
  Serial.println("════════════════════════════════════════════");
  startPolling();
  server.send(200, "application/json", "{\"status\":\"polling_started\"}");
}

// Handle on-demand BLE scan (for web kiosk)
void handleBLEScan() {
  Serial.println();
  Serial.println("════════════════════════════════════════════");
  Serial.println("🔍 BLE SCAN REQUEST FROM WEB KIOSK");
  Serial.println("════════════════════════════════════════════");
  
  // Scan for BLE beacons immediately
  BLEScanResults* foundDevices = pBLEScan->start(BLE_SCAN_DURATION, false);
  
  bool studentFound = false;
  String foundStudentName = "";
  int foundStudentId = 0;
  int foundRSSI = 0;
  String foundMAC = "";
  
  // Check each target student
  for (int t = 0; t < NUM_TARGETS; t++) {
    for (int i = 0; i < foundDevices->getCount(); i++) {
      BLEAdvertisedDevice device = foundDevices->getDevice(i);
      String deviceMAC = device.getAddress().toString().c_str();
      deviceMAC.toUpperCase();

      // Match by UUID or MAC
      bool match = false;
      if (TARGET_STUDENTS[t].hasUUID && device.haveServiceUUID()) {
        for (int j = 0; j < device.getServiceUUIDCount(); j++) {
          String uuidStr = device.getServiceUUID(j).toString().c_str();
          uuidStr.toLowerCase();
          String targetUUID = TARGET_STUDENTS[t].serviceUUID;
          targetUUID.toLowerCase();
          if (uuidStr == targetUUID) {
            match = true;
            break;
          }
        }
      } else {
        String targetMAC = TARGET_STUDENTS[t].macAddress;
        targetMAC.toUpperCase();
        if (deviceMAC == targetMAC) {
          match = true;
        }
      }

      if (match) {
        studentFound = true;
        foundStudentName = TARGET_STUDENTS[t].name;
        foundStudentId = TARGET_STUDENTS[t].studentId;
        foundRSSI = device.getRSSI();
        foundMAC = deviceMAC;
        break;
      }
    }
    if (studentFound) break;
  }

  pBLEScan->clearResults();

  // Build JSON response
  DynamicJsonDocument doc(512);
  doc["found"] = studentFound;
  
  if (studentFound) {
    doc["student_id"] = foundStudentId;
    doc["student_name"] = foundStudentName;
    doc["rssi"] = foundRSSI;
    doc["mac_address"] = foundMAC;
    
    Serial.println("   ✅ Student found: " + foundStudentName);
    Serial.println("   RSSI: " + String(foundRSSI) + " dBm");
  } else {
    Serial.println("   ❌ No student BLE token detected");
  }
  
  Serial.println("════════════════════════════════════════════");
  
  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

void startPolling() {
  if (pollingActive) return;
  pollingActive = true;
  lastPollTime = 0;
  lastRetryTime = 0;
  Serial.println("▶️  GSM Polling STARTED (GROUPED BY STUDENT MODE)");
  Serial.println("   All parent SMS sent before moving to next student");
  Serial.println("   Each SMS retries up to " + String(MAX_RETRY) + " times");
}

void stopPolling() {
  if (!pollingActive) return;
  pollingActive = false;
  currentBatch.active = false;
  Serial.println("⏸️  GSM Polling STOPPED");
  Serial.println("✅ All students' SMS processed!");
  Serial.println("🛑 Back to BLE-only mode");
  Serial.println("──────────────────────────────────────────────");
  Serial.println();
}

// ============================================================================
// POLL FOR NEXT BATCH (ALL SMS FOR ONE STUDENT)
// ============================================================================

void pollForNextBatch() {
  if (!wifiConnected) return;

  HTTPClient http;
  String url = String(BACKEND_URL) + "/api/gsm/pending?kiosk_id=" + String(KIOSK_ID);

  http.begin(url);
  http.setTimeout(5000);
  int httpCode = http.GET();

  if (httpCode == 200) {
    String payload = http.getString();

    DynamicJsonDocument doc(4096);
    DeserializationError error = deserializeJson(doc, payload);

    if (!error) {
      JsonArray smsArray = doc.as<JsonArray>();

      if (smsArray.size() > 0) {
        // Load batch with all SMS for this student
        currentBatch.count = min((int)smsArray.size(), MAX_BATCH_SIZE);
        currentBatch.currentIndex = 0;
        currentBatch.active = true;
        
        if (smsArray.size() > 0 && !smsArray[0]["student_id"].isNull()) {
          currentBatch.studentId = smsArray[0]["student_id"].as<int>();
        } else {
          currentBatch.studentId = 0;
        }

        Serial.println();
        Serial.println("════════════════════════════════════════════");
        Serial.println("📬 NEW BATCH RECEIVED - Student ID: " + String(currentBatch.studentId));
        Serial.println("════════════════════════════════════════════");
        Serial.println("   Total SMS in batch: " + String(currentBatch.count));

        for (int i = 0; i < currentBatch.count; i++) {
          JsonObject sms = smsArray[i];
          
          currentBatch.messages[i].smsId = sms["id"].as<int>();
          currentBatch.messages[i].phoneNumber = sms["phone_number"].as<String>();
          currentBatch.messages[i].message = sms["message"].as<String>();
          currentBatch.messages[i].retryCount = 0;
          currentBatch.messages[i].processed = false;

          Serial.println("   " + String(i+1) + ". SMS ID " + String(currentBatch.messages[i].smsId) + 
                        " → " + currentBatch.messages[i].phoneNumber);
        }
        
        Serial.println("════════════════════════════════════════════");

        lastRetryTime = 0; // Send first SMS immediately
      } else {
        // No more SMS in queue - stop polling
        Serial.println("📭 No more SMS in queue");
        stopPolling();
      }
    }
  } else if (httpCode != 200) {
    Serial.println("⚠️  Backend poll error: HTTP " + String(httpCode));
  }

  http.end();
}

// ============================================================================
// PROCESS CURRENT SMS IN BATCH (BLOCKING WITH RETRY)
// ============================================================================

void processCurrentSMS() {
  if (!currentBatch.active) return;
  
  // Check if batch is complete
  if (currentBatch.currentIndex >= currentBatch.count) {
    Serial.println();
    Serial.println("✅ BATCH COMPLETE - All parents notified for Student ID " + String(currentBatch.studentId));
    Serial.println("════════════════════════════════════════════");
    currentBatch.active = false;
    lastPollTime = 0; // Poll immediately for next batch
    return;
  }

  SMSMessage& sms = currentBatch.messages[currentBatch.currentIndex];
  
  if (sms.processed) {
    // Move to next SMS in batch
    currentBatch.currentIndex++;
    lastRetryTime = 0;
    return;
  }

  int attemptNum = sms.retryCount + 1;
  
  Serial.println();
  Serial.println("📤 SENDING SMS [" + String(currentBatch.currentIndex + 1) + "/" + 
                 String(currentBatch.count) + "] (Attempt " + String(attemptNum) + "/" + String(MAX_RETRY) + ")");
  Serial.println("   SMS ID: " + String(sms.smsId));
  Serial.println("   To: " + sms.phoneNumber);
  
  bool sent = sendSMS(sms.phoneNumber, sms.message);

  if (sent) {
    // ✅ SUCCESS - Mark as sent and move to next SMS in batch
    Serial.println("   ✅ SMS SENT SUCCESSFULLY!");
    Serial.println("   Notifying backend...");
    notifyBackendSent(sms.smsId, true);
    
    sms.processed = true;
    currentBatch.currentIndex++;
    
    Serial.println("   ✅ Moving to next SMS in batch");
    
    lastRetryTime = 0; // Send next SMS immediately
  } 
  else {
    // ❌ FAILED - Retry or give up
    sms.retryCount++;
    
    if (sms.retryCount >= MAX_RETRY) {
      // Give up after max retries
      Serial.println("   ❌ SMS FAILED after " + String(MAX_RETRY) + " attempts");
      Serial.println("   Marking as failed and moving to next...");
      notifyBackendSent(sms.smsId, false);
      
      sms.processed = true;
      currentBatch.currentIndex++;
      
      lastRetryTime = 0; // Move to next SMS immediately
    } 
    else {
      // Retry
      Serial.println("   ⚠️  SMS failed, will retry in " + String(RETRY_DELAY / 1000) + " seconds...");
      Serial.println("   (Retry " + String(sms.retryCount) + "/" + String(MAX_RETRY) + ")");
    }
  }
}

// ============================================================================
// SEND SMS VIA GSM
// ============================================================================

bool sendSMS(String phoneNumber, String message) {
  if (!gsmReady) return false;

  while (sim800.available()) sim800.read();

  sim800.print("AT+CMGS=\"");
  sim800.print(phoneNumber);
  sim800.println("\"");
  delay(500);

  sim800.print(message);
  delay(500);

  sim800.write(26);
  delay(5000);

  String response = "";
  unsigned long start = millis();
  while (millis() - start < 10000) {
    if (sim800.available()) response += (char)sim800.read();
    if (response.indexOf("+CMGS:") != -1) return true;
  }

  return false;
}

// ============================================================================
// NOTIFY BACKEND
// ============================================================================

void notifyBackendSent(int smsId, bool success) {
  if (!wifiConnected) return;

  HTTPClient http;
  String url = String(BACKEND_URL) + "/api/gsm/mark-sent/" + String(smsId);

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  String payload = "{\"success\":" + String(success ? "true" : "false") + "}";
  http.POST(payload);
  http.end();
}
