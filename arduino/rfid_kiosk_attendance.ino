// ============================================================================
// ESP32 RFID APPROVAL SYSTEM v4.0
// ============================================================================
// Purpose: Scan RFID cards and send to PENDING approval system
// Integration: Sends to /api/rfid/detect (requires kiosk approval)
// Features: 2-step approval, photo capture, SMS notifications
// ============================================================================

#include <WiFi.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>
#include <ArduinoJson.h>

// ═══════════════════════════════════════════════════════════════════════
// CONFIGURATION - UPDATE THESE FOR YOUR SETUP
// ═══════════════════════════════════════════════════════════════════════

// ─── WiFi CONFIGURATION ────────────────────────────────────────────────
const char* WIFI_SSID = "Infinix HOT 20 5G";
const char* WIFI_PASSWORD = "12345678000";

// ─── SERVER CONFIGURATION ──────────────────────────────────────────────
const char* SERVER_HOST = "10.188.5.63";         // Your backend IP address
const uint16_t SERVER_PORT = 5000;                // Backend port
const char* API_ENDPOINT = "/api/rfid/detect";    // RFID detection endpoint (PENDING approval)

// ─── KIOSK CONFIGURATION ───────────────────────────────────────────────
const int KIOSK_ID = 1;                           // Must match database kiosks.id

// ─── RFID PINS ─────────────────────────────────────────────────────────
#define BUZZER_PIN  27
#define GREEN_LED   25
#define RED_LED     26
#define RC522_CS    21
#define RC522_RST   22

// ─── DEBOUNCE CONFIGURATION ────────────────────────────────────────────
const unsigned long DEBOUNCE_TIME = 2000;        // 2 seconds between reads
unsigned long lastReadTime = 0;

// ═══════════════════════════════════════════════════════════════════════
// GLOBAL VARIABLES
// ═══════════════════════════════════════════════════════════════════════

MFRC522 rfid(RC522_CS, RC522_RST);

struct Statistics {
  unsigned long successful_scans = 0;
  unsigned long failed_scans = 0;
  unsigned long total_cards = 0;
  unsigned long wifi_reconnects = 0;
} stats;

// ═══════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get UID from RFID card in standard format (AA:BB:CC:DD)
 */
String getCardUID() {
  String uid = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (i > 0) uid += ":";
    if (rfid.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(rfid.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();
  return uid;
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

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  Serial.println();
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("✅ WiFi connected!");
    Serial.print("   IP Address: ");
    Serial.println(WiFi.localIP());
    Serial.print("   Gateway: ");
    Serial.println(WiFi.gatewayIP());
    Serial.print("   Signal Strength: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
  } else {
    Serial.println("❌ WiFi connection failed!");
    Serial.print("   Status Code: ");
    Serial.println(WiFi.status());
    stats.wifi_reconnects++;
    digitalWrite(RED_LED, HIGH);
    delay(2000);
    digitalWrite(RED_LED, LOW);
  }
}

/**
 * Send RFID detection to backend (PENDING approval)
 */
bool sendRFIDDetection(String uid) {
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

  // Build JSON payload for RFID detection
  DynamicJsonDocument doc(512);
  doc["rfid_uid"] = uid;
  doc["kiosk_id"] = KIOSK_ID;
  
  String payload;
  serializeJson(doc, payload);

  // Set headers
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Connection", "close");
  http.setTimeout(10000);

  Serial.print("   📤 POST: ");
  Serial.println(url);
  Serial.print("   📨 Payload: ");
  Serial.println(payload);

  // Send POST request
  int httpCode = http.POST(payload);
  bool success = false;

  if (httpCode > 0) {
    String response = http.getString();

    Serial.print("   📬 Status: ");
    Serial.print(httpCode);
    Serial.print(" | Response: ");
    Serial.println(response.substring(0, 100));  // First 100 chars

    // Parse JSON response
    DynamicJsonDocument responseDoc(1024);
    DeserializationError error = deserializeJson(responseDoc, response);

    if (!error) {
      const char* studentName = responseDoc["student_name"];
      const char* status = responseDoc["status"];
      int detectionId = responseDoc["detection_id"];

      if (httpCode == 201) {
        // Detection stored as PENDING
        Serial.print("   ⏳ PENDING APPROVAL → ");
        Serial.print(studentName ? studentName : "Student");
        Serial.print(" (Detection ID: ");
        Serial.print(detectionId);
        Serial.println(")");
        Serial.println("   ⚠️  Waiting for kiosk guard approval...");
        
        success = true;
        stats.successful_scans++;
      } else if (httpCode == 409) {
        // Already pending
        Serial.println("   ℹ️  Already pending approval");
        success = true;
      } else if (httpCode == 404) {
        Serial.println("   ⚠️  Student not found or not registered");
        stats.failed_scans++;
      } else {
        Serial.print("   ⚠️  ");
        Serial.println(response.substring(0, 50));
        stats.failed_scans++;
      }
    } else {
      // JSON parse failed
      if (httpCode >= 200 && httpCode < 300) {
        Serial.println("   ✅ Detection sent");
        success = true;
        stats.successful_scans++;
      } else {
        stats.failed_scans++;
      }
    }
  } else {
    // HTTP request failed
    Serial.print("   ❌ HTTP ");
    Serial.print(httpCode);
    Serial.print(": ");
    Serial.println(http.errorToString(httpCode));
    stats.failed_scans++;
    
    // Try direct TCP test
    if (httpCode == -1) {
      Serial.print("   🔍 Testing TCP to ");
      Serial.print(SERVER_HOST);
      Serial.print(":");
      Serial.println(SERVER_PORT);
      
      if (client.connect(SERVER_HOST, SERVER_PORT)) {
        Serial.println("   ✅ TCP OK");
        client.stop();
      } else {
        Serial.println("   ❌ TCP failed");
      }
    }
  }

  http.end();
  return success;
}

/**
 * Success feedback: Green LED + beep
 */
void feedbackSuccess() {
  digitalWrite(GREEN_LED, HIGH);
  
  // Triple beep
  for (int i = 0; i < 3; i++) {
    digitalWrite(BUZZER_PIN, HIGH);
    delay(100);
    digitalWrite(BUZZER_PIN, LOW);
    delay(50);
  }
  
  delay(1000);
  digitalWrite(GREEN_LED, LOW);
}

/**
 * Error feedback: Red LED + warning beep
 */
void feedbackError() {
  digitalWrite(RED_LED, HIGH);
  
  // Double long beep
  for (int i = 0; i < 2; i++) {
    digitalWrite(BUZZER_PIN, HIGH);
    delay(300);
    digitalWrite(BUZZER_PIN, LOW);
    delay(100);
  }
  
  delay(1000);
  digitalWrite(RED_LED, LOW);
}

// ═══════════════════════════════════════════════════════════════════════
// SETUP
// ═══════════════════════════════════════════════════════════════════════

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n\n╔════════════════════════════════════════════════════════════╗");
  Serial.println("║     ESP32 RFID Approval System v4.0                      ║");
  Serial.println("║     Kiosk approval REQUIRED before attendance            ║");
  Serial.println("╚════════════════════════════════════════════════════════════╝");
  
  Serial.println("\n📍 Kiosk Configuration:");
  Serial.print("   Kiosk ID: ");
  Serial.println(KIOSK_ID);
  Serial.print("   Endpoint: ");
  Serial.println(API_ENDPOINT);
  Serial.println("   Mode: PENDING APPROVAL (2-step process)");

  // Initialize pins
  Serial.print("\n🔌 Initializing GPIO pins...");
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(GREEN_LED, OUTPUT);
  pinMode(RED_LED, OUTPUT);
  digitalWrite(GREEN_LED, LOW);
  digitalWrite(RED_LED, LOW);
  digitalWrite(BUZZER_PIN, LOW);
  Serial.println(" ✅");

  // Initialize SPI and RFID
  Serial.print("📡 Initializing RC522 RFID reader...");
  SPI.begin(18, 19, 23, RC522_CS);
  rfid.PCD_Init();
  
  // Test RFID reader
  byte version = rfid.PCD_ReadRegister(rfid.VersionReg);
  Serial.print(" ✅ (Version: 0x");
  Serial.print(version, HEX);
  Serial.println(")");

  if (version == 0x00 || version == 0xFF) {
    Serial.println("⚠️  WARNING: RC522 not detected! Check wiring:");
    Serial.println("   SDA/CS  → GPIO 21");
    Serial.println("   SCK     → GPIO 18");
    Serial.println("   MOSI    → GPIO 23");
    Serial.println("   MISO    → GPIO 19");
    Serial.println("   RST     → GPIO 22");
    Serial.println("   3.3V    → 3.3V");
    Serial.println("   GND     → GND");
  }

  // Connect to WiFi
  connectWiFi();

  Serial.println("\n╔════════════════════════════════════════════════════════════╗");
  Serial.println("║   Ready! Waiting for RFID cards...                       ║");
  Serial.println("╚════════════════════════════════════════════════════════════╝\n");
  
  delay(2000);
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

  // Look for new cards
  if (!rfid.PICC_IsNewCardPresent()) {
    delay(100);
    return;
  }

  // Debounce check
  unsigned long currentTime = millis();
  if (currentTime - lastReadTime < DEBOUNCE_TIME) {
    Serial.println("⏳ Debounced: Card read too soon, skipping...");
    delay(100);
    return;
  }

  // Read card serial
  if (!rfid.PICC_ReadCardSerial()) {
    delay(100);
    return;
  }

  lastReadTime = currentTime;
  stats.total_cards++;

  // Get UID
  String uid = getCardUID();

  Serial.println("\n════════════════════════════════════════════════════════════");
  Serial.print("📛 RFID Card Detected! UID: ");
  Serial.println(uid);

  // Send to detection endpoint (PENDING approval)
  bool success = sendRFIDDetection(uid);

  // Feedback
  if (success) {
    feedbackSuccess();
  } else {
    feedbackError();
  }

  // Print statistics
  Serial.println("\n╔════════════════════════════════════════════════════════════╗");
  Serial.println("║                    Session Statistics                     ║");
  Serial.println("╚════════════════════════════════════════════════════════════╝");
  Serial.printf("✅ Successful scans: %lu\n", stats.successful_scans);
  Serial.printf("❌ Failed scans: %lu\n", stats.failed_scans);
  Serial.printf("📱 Total cards scanned: %lu\n", stats.total_cards);
  Serial.printf("📡 WiFi reconnects: %lu\n", stats.wifi_reconnects);
  Serial.printf("⏱️  Uptime: %lu seconds\n", millis() / 1000);
  
  if (stats.total_cards > 0) {
    float successRate = (100.0 * stats.successful_scans) / stats.total_cards;
    Serial.printf("📈 Success rate: %.1f%%\n", successRate);
  }
  Serial.println();

  // Stop reading
  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();

  delay(500);
}
