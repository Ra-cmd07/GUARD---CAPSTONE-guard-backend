/**
 * ============================================================================
 * ATTENDBOX - Kiosk WiFi + GSM Integration
 * ============================================================================
 * 
 * This sketch connects your GSM module to the kiosk website!
 * When a student scans at the kiosk, SMS is sent automatically.
 * 
 * Hardware: ESP32 (WROOM-32) + SIM800L EVB GSM Module
 * 
 * QUICK SETUP:
 * 1. Update WiFi credentials below (WIFI_SSID and WIFI_PASSWORD)
 * 2. Update BACKEND_URL with your computer's IP address
 * 3. Upload to ESP32
 * 4. Scan at kiosk website → Parent gets SMS automatically!
 * 
 * Pin Connections (CONFIRMED WORKING):
 * ─────────────────────────────────────
 * SIM800L EVB → ESP32
 * - TXD → GPIO 16
 * - RXD → GPIO 17
 * - VCC → 4.2V external (18650 Li-ion battery)
 * - GND → GND  ⚠️ Must be GND pin — NOT CMD, CLK, or any other pin!
 * - RST → Not connected (not required)
 * 
 * ⚠️ CRITICAL:
 *   - SIM800L needs 18650 Li-ion battery or 4.2V 2A external supply
 *   - GND must be shared between ESP32 and SIM800L
 *   - Do NOT use CMD, CLK, SD0-SD3 pins — those are internal flash pins
 * 
 * ============================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ============================================================================
// 🔧 CONFIGURATION - UPDATE THESE VALUES!
// ============================================================================

// WiFi Credentials
const char* WIFI_SSID     = "Alsaul";
const char* WIFI_PASSWORD = "PLDTWIFIFIBER10ross";

// Backend API URL (use HTTP port 5001 — ESP32 cannot use HTTPS on port 5000)
const char* BACKEND_URL = "http://192.168.1.29:5001";
const int   KIOSK_ID    = 1;

// SIM800L Pin Configuration (CONFIRMED WORKING on ESP32-WROOM-32)
#define SIM800_TX_PIN  16   // SIM800L TXD → ESP32 GPIO 16
#define SIM800_RX_PIN  17   // SIM800L RXD → ESP32 GPIO 17
#define SIM800_BAUD    9600
// RST pin not used — not connected

// Polling Configuration
#define POLL_INTERVAL   2000  // Poll backend every 2 seconds
#define MAX_SMS_QUEUE   10    // Maximum SMS in queue
#define SMS_RETRY_DELAY 3000  // 3 seconds between retries
#define MAX_RETRIES     3     // Maximum retry attempts

// ============================================================================
// HARDWARE
// ============================================================================

HardwareSerial sim800(2);  // UART2

// ============================================================================
// SMS QUEUE
// ============================================================================

struct SMSMessage {
  int    smsId;
  String phoneNumber;
  String message;
  int    retryCount;
  bool   active;
};

SMSMessage smsQueue[MAX_SMS_QUEUE];
int queueHead = 0;
int queueTail = 0;

// ============================================================================
// GLOBAL STATE
// ============================================================================

unsigned long lastPollTime    = 0;
unsigned long lastSmsAttempt  = 0;
bool          gsmReady        = false;
bool          wifiConnected   = false;

// ============================================================================
// SETUP
// ============================================================================

void setup() {
  Serial.begin(115200);
  delay(1000);

  printBanner();

  // Initialize GSM first
  initGSM();

  // Connect to WiFi
  connectWiFi();

  // Initialize SMS queue
  for (int i = 0; i < MAX_SMS_QUEUE; i++) {
    smsQueue[i].active     = false;
    smsQueue[i].retryCount = 0;
  }

  Serial.println();
  Serial.println("✅ System ready!");
  Serial.println("🔍 Waiting for kiosk scans...");
  Serial.println();
}

// ============================================================================
// MAIN LOOP
// ============================================================================

void loop() {
  // Check WiFi connection
  if (WiFi.status() != WL_CONNECTED) {
    if (wifiConnected) {
      Serial.println("⚠️  WiFi disconnected, reconnecting...");
      wifiConnected = false;
    }
    connectWiFi();
    delay(5000);
    return;
  } else if (!wifiConnected) {
    wifiConnected = true;
    Serial.println("✅ WiFi reconnected!");
  }

  // Poll backend for pending SMS
  if (millis() - lastPollTime >= POLL_INTERVAL) {
    lastPollTime = millis();
    pollForSMS();
  }

  // Process SMS queue
  if (gsmReady && (millis() - lastSmsAttempt >= SMS_RETRY_DELAY)) {
    processSMSQueue();
  }

  delay(100);
}

// ============================================================================
// PRINT BANNER
// ============================================================================

void printBanner() {
  Serial.println();
  Serial.println("╔═══════════════════════════════════════════════════════╗");
  Serial.println("║   ATTENDBOX - Kiosk WiFi + GSM Integration           ║");
  Serial.println("║   ESP32 + SIM800L EVB  |  TX=G16 RX=G17 GND=GND     ║");
  Serial.println("╚═══════════════════════════════════════════════════════╝");
  Serial.println();
}

// ============================================================================
// WIFI CONNECTION
// ============================================================================

void connectWiFi() {
  Serial.print("📡 Connecting to WiFi: ");
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
    Serial.print("   Backend URL: ");
    Serial.println(BACKEND_URL);
    wifiConnected = true;
  } else {
    Serial.println("❌ WiFi connection failed!");
    Serial.println("   Check WIFI_SSID and WIFI_PASSWORD");
    wifiConnected = false;
  }
}

// ============================================================================
// INITIALIZE SIM800L GSM MODULE
// ============================================================================

void initGSM() {
  Serial.println("📱 Initializing SIM800L GSM module...");

  // Start UART2 on GPIO 16/17
  // HardwareSerial.begin(baud, config, RX_pin, TX_pin)
  sim800.begin(SIM800_BAUD, SERIAL_8N1, SIM800_TX_PIN, SIM800_RX_PIN);
  delay(1000);

  // Flush any leftover data
  while (sim800.available()) sim800.read();

  // Test AT command — try up to 5 times
  Serial.println("   Testing AT commands...");
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
    Serial.println("   ❌ AT command failed — check TX/RX wiring and GND");
    Serial.println("   System will continue but SMS will not work");
    return;
  }

  // Set SMS text mode
  sim800.println("AT+CMGF=1");
  delay(500);

  // Set character set
  sim800.println("AT+CSCS=\"GSM\"");
  delay(500);

  // Check signal quality
  while (sim800.available()) sim800.read();
  sim800.println("AT+CSQ");
  delay(1000);
  if (sim800.available()) {
    String resp = sim800.readString();
    Serial.print("   Signal: ");
    Serial.println(resp);
  }

  // Check SIM card
  while (sim800.available()) sim800.read();
  sim800.println("AT+CPIN?");
  delay(1000);
  if (sim800.available()) {
    String resp = sim800.readString();
    if (resp.indexOf("READY") != -1) {
      Serial.println("   ✅ SIM card ready");
      gsmReady = true;
    } else {
      Serial.println("   ⚠️  SIM card not ready: " + resp);
    }
  }

  // Check network registration
  while (sim800.available()) sim800.read();
  sim800.println("AT+CREG?");
  delay(1000);
  if (sim800.available()) {
    String resp = sim800.readString();
    Serial.print("   Network: ");
    Serial.println(resp);
  }

  // Check operator
  while (sim800.available()) sim800.read();
  sim800.println("AT+COPS?");
  delay(1000);
  if (sim800.available()) {
    String resp = sim800.readString();
    Serial.print("   Operator: ");
    Serial.println(resp);
  }

  Serial.println();
  if (gsmReady) {
    Serial.println("✅ SIM800L ready to send SMS!");
  } else {
    Serial.println("⚠️  SIM800L initialization incomplete — SMS will not work");
  }
}

// ============================================================================
// POLL BACKEND FOR PENDING SMS
// ============================================================================

void pollForSMS() {
  if (!wifiConnected) return;

  HTTPClient http;
  String url = String(BACKEND_URL) + "/api/gsm/pending?kiosk_id=" + String(KIOSK_ID) + "&limit=3";

  http.begin(url);
  http.setTimeout(5000);
  int httpCode = http.GET();

  Serial.println("🔄 Polling... HTTP " + String(httpCode));  // Always show poll status

  if (httpCode == 200) {
    String payload = http.getString();
    Serial.println("   Response length: " + String(payload.length()));
    Serial.println("   Raw: " + payload.substring(0, 100));  // Show first 100 chars

    DynamicJsonDocument doc(4096);  // Increased from 2048 to 4096
    DeserializationError error = deserializeJson(doc, payload);

    if (error) {
      Serial.println("   ❌ JSON parse error: " + String(error.c_str()));
      http.end();
      return;
    }

    JsonArray smsArray = doc.as<JsonArray>();
    Serial.println("   SMS in response: " + String(smsArray.size()));

    if (smsArray.size() > 0) {
      Serial.println();
      Serial.println("📬 Pending SMS from backend: " + String(smsArray.size()));
    }

    int newCount = 0;
    for (JsonObject sms : smsArray) {
      String phone   = sms["phone_number"].as<String>();
      String message = sms["message"].as<String>();
      int    smsId   = sms["id"].as<int>();

      Serial.println("   Found SMS ID=" + String(smsId) + " to=" + phone);

      if (phone.length() > 0 && message.length() > 0) {
        if (addToQueue(phone, message, smsId)) {
          newCount++;
          Serial.println("   📩 Queued SMS ID: " + String(smsId));
          Serial.println("      To: " + phone);
          Serial.println("      Msg: " + message.substring(0, 50) + "...");
        } else {
          Serial.println("   ⚠️  Already in queue: " + String(smsId));
        }
      }
    }

    if (newCount > 0) {
      Serial.println("   ✅ Added " + String(newCount) + " SMS to queue");
      Serial.println();
    }
  } else if (httpCode > 0) {
    Serial.println("⚠️  Backend HTTP " + String(httpCode));
  } else {
    Serial.println("❌ HTTP error: " + String(httpCode));
  }

  http.end();
}

// ============================================================================
// ADD SMS TO QUEUE
// ============================================================================

bool addToQueue(String phone, String message, int smsId) {
  // Skip duplicates
  for (int i = 0; i < MAX_SMS_QUEUE; i++) {
    if (smsQueue[i].active && smsQueue[i].smsId == smsId) return false;
  }

  int nextTail = (queueTail + 1) % MAX_SMS_QUEUE;
  if (nextTail == queueHead) {
    Serial.println("⚠️  SMS queue full!");
    return false;
  }

  smsQueue[queueTail].smsId       = smsId;
  smsQueue[queueTail].phoneNumber = phone;
  smsQueue[queueTail].message     = message;
  smsQueue[queueTail].retryCount  = 0;
  smsQueue[queueTail].active      = true;

  queueTail = nextTail;
  return true;
}

// ============================================================================
// PROCESS SMS QUEUE
// ============================================================================

void processSMSQueue() {
  if (queueHead == queueTail) return;

  SMSMessage* currentSms = &smsQueue[queueHead];

  if (!currentSms->active) {
    queueHead = (queueHead + 1) % MAX_SMS_QUEUE;
    return;
  }

  Serial.println();
  Serial.println("📤 Sending SMS...");
  Serial.println("   ID: "      + String(currentSms->smsId));
  Serial.println("   To: "      + currentSms->phoneNumber);
  Serial.println("   Attempt: " + String(currentSms->retryCount + 1));

  bool success = sendSMS(currentSms->phoneNumber, currentSms->message);

  if (success) {
    Serial.println("✅ SMS sent successfully!");
    acknowledgeBackend(currentSms->smsId, "sent", "");
    currentSms->active = false;
    queueHead = (queueHead + 1) % MAX_SMS_QUEUE;
  } else {
    currentSms->retryCount++;
    if (currentSms->retryCount >= MAX_RETRIES) {
      Serial.println("❌ SMS failed after " + String(MAX_RETRIES) + " attempts");
      markFailedBackend(currentSms->smsId, "No GSM response after retries");
      currentSms->active = false;
      queueHead = (queueHead + 1) % MAX_SMS_QUEUE;
    } else {
      Serial.println("⚠️  SMS failed, will retry (" +
                     String(currentSms->retryCount) + "/" + String(MAX_RETRIES) + ")");
    }
  }

  lastSmsAttempt = millis();
}

// ============================================================================
// SEND SMS VIA SIM800L
// ============================================================================

bool sendSMS(String phoneNumber, String message) {
  if (!gsmReady) {
    Serial.println("   ❌ GSM not ready");
    return false;
  }

  // Flush buffer
  while (sim800.available()) sim800.read();
  delay(100);

  // Set SMS text mode
  sim800.println("AT+CMGF=1");
  String response = "";
  unsigned long t = millis();
  while (millis() - t < 1000) {
    if (sim800.available()) response += (char)sim800.read();
  }
  if (response.indexOf("OK") == -1) {
    Serial.println("   ❌ Failed to set SMS mode");
    return false;
  }

  // Flush buffer
  while (sim800.available()) sim800.read();
  delay(100);

  // Send CMGS command
  sim800.print("AT+CMGS=\"");
  sim800.print(phoneNumber);
  sim800.println("\"");
  delay(1000);

  // Wait for '>' prompt
  if (!waitForPrompt()) {
    Serial.println("   ❌ No prompt — check SIM card and signal");
    return false;
  }

  // Send message + CTRL+Z
  sim800.print(message);
  delay(100);
  sim800.write(26);  // CTRL+Z
  delay(100);

  // Wait for +CMGS confirmation (up to 15 seconds)
  unsigned long sendTimeout = millis() + 15000;
  bool success = false;
  response = "";

  while (millis() < sendTimeout) {
    if (sim800.available()) {
      char c = sim800.read();
      response += c;
      Serial.print(c);
      if (response.indexOf("+CMGS:") != -1) { success = true; break; }
      if (response.indexOf("ERROR")  != -1) {
        Serial.println();
        Serial.println("   ❌ GSM ERROR response");
        break;
      }
    }
    delay(10);
  }

  Serial.println();
  if (!success) Serial.println("   ❌ Timeout or error sending SMS");

  return success;
}

// ============================================================================
// WAIT FOR '>' PROMPT
// ============================================================================

bool waitForPrompt() {
  unsigned long timeout = millis() + 5000;
  while (millis() < timeout) {
    if (sim800.available()) {
      char c = sim800.read();
      if (c == '>') return true;
    }
    delay(10);
  }
  return false;
}

// ============================================================================
// ACKNOWLEDGE TO BACKEND
// ============================================================================

void acknowledgeBackend(int smsId, String status, String errorMsg) {
  if (!wifiConnected) return;

  HTTPClient http;
  String url = String(BACKEND_URL) + "/api/gsm/ack/" + String(smsId);

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<256> doc;
  doc["status"]   = status;
  doc["sent_by"]  = "gsm_module";
  doc["kiosk_id"] = KIOSK_ID;
  if (errorMsg.length() > 0) doc["error_message"] = errorMsg;

  String payload;
  serializeJson(doc, payload);

  int httpCode = http.POST(payload);
  if (httpCode == 200) {
    Serial.println("   ✅ Acknowledged: " + status);
  } else {
    Serial.println("   ⚠️  Acknowledge failed: HTTP " + String(httpCode));
  }

  http.end();
}

// ============================================================================
// MARK SMS AS FAILED IN BACKEND
// ============================================================================

void markFailedBackend(int smsId, String errorMsg) {
  if (!wifiConnected) return;

  HTTPClient http;
  String url = String(BACKEND_URL) + "/api/gsm/failed/" + String(smsId);

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<200> doc;
  doc["error_message"] = errorMsg;
  doc["kiosk_id"]      = KIOSK_ID;

  String payload;
  serializeJson(doc, payload);

  int httpCode = http.POST(payload);
  if (httpCode == 200) {
    Serial.println("   ✅ Marked as failed in backend");
  } else {
    Serial.println("   ⚠️  Failed to mark: HTTP " + String(httpCode));
  }

  http.end();
}
