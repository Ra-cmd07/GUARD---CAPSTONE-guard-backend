/**
 * ============================================================================
 * ATTENDBOX - Kiosk WiFi + GSM Integration (ON-DEMAND POLLING)
 * ============================================================================
 * 
 * This version only polls when triggered by backend!
 * Saves power and bandwidth - polling starts only when kiosk scan happens.
 * 
 * HOW IT WORKS:
 * 1. ESP32 waits idle (no polling)
 * 2. Student scans kiosk → Backend adds SMS to queue
 * 3. Backend sends trigger → /trigger endpoint on ESP32
 * 4. ESP32 polls for SMS and sends via GSM
 * 5. After queue empty, ESP32 goes back to idle
 * 
 * ============================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <ArduinoJson.h>

// ============================================================================
// 🔧 CONFIGURATION
// ============================================================================

// WiFi Credentials
const char* WIFI_SSID     = "Alsaul";
const char* WIFI_PASSWORD = "PLDTWIFIFIBER10ross";

// Backend API URL
const char* BACKEND_URL = "http://192.168.1.29:5001";
const int   KIOSK_ID    = 1;

// SIM800L Pins
#define SIM800_TX_PIN  16
#define SIM800_RX_PIN  17
#define SIM800_BAUD    9600

// Polling Configuration
#define POLL_INTERVAL   2000  // Poll every 2 seconds WHEN ACTIVE
#define IDLE_TIMEOUT    30000 // Stop polling after 30 seconds of empty queue
#define MAX_SMS_QUEUE   10

// ============================================================================
// HARDWARE
// ============================================================================

HardwareSerial sim800(2);
WebServer server(80);  // HTTP server for trigger endpoint

// ============================================================================
// STATE
// ============================================================================

bool wifiConnected = false;
bool gsmReady = false;
bool pollingActive = false;  // NEW: Flag to control polling

unsigned long lastPollTime = 0;
unsigned long lastSMSTime = 0;  // Track when last SMS was found

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
// SETUP
// ============================================================================

void setup() {
  Serial.begin(115200);
  delay(2000);

  Serial.println("\n\n");
  Serial.println("╔══════════════════════════════════════════════╗");
  Serial.println("║  ATTENDBOX - GSM Kiosk (ON-DEMAND)          ║");
  Serial.println("║  Polling only when triggered by backend     ║");
  Serial.println("╚══════════════════════════════════════════════╝");
  Serial.println();

  // Initialize WiFi
  Serial.print("🔌 Connecting to WiFi: ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println();
    Serial.println("✅ WiFi connected!");
    Serial.print("   IP Address: ");
    Serial.println(WiFi.localIP());
    Serial.print("   Backend URL: ");
    Serial.println(BACKEND_URL);
  } else {
    Serial.println("\n❌ WiFi connection failed!");
    return;
  }

  // Initialize HTTP trigger server
  server.on("/trigger", HTTP_POST, handleTrigger);
  server.begin();
  Serial.println("✅ HTTP server started on port 80");
  Serial.println("   Listening for trigger: POST http://" + WiFi.localIP().toString() + "/trigger");

  // Initialize GSM
  initGSM();

  Serial.println();
  Serial.println("✅ System ready!");
  Serial.println("🛑 Idle mode - waiting for trigger from backend...");
  Serial.println();
}

// ============================================================================
// MAIN LOOP
// ============================================================================

void loop() {
  // Handle HTTP requests (trigger endpoint)
  server.handleClient();

  unsigned long currentMillis = millis();

  // Only poll if polling is active
  if (pollingActive) {
    // Poll backend for SMS
    if (currentMillis - lastPollTime >= POLL_INTERVAL) {
      lastPollTime = currentMillis;
      pollForSMS();
    }

    // Process SMS queue
    processSMSQueue();

    // Auto-stop polling if queue empty for too long
    if (currentMillis - lastSMSTime >= IDLE_TIMEOUT) {
      stopPolling();
    }
  }

  delay(10);
}

// ============================================================================
// HTTP TRIGGER HANDLER (Called by backend)
// ============================================================================

void handleTrigger() {
  Serial.println();
  Serial.println("🔔 Trigger received from backend!");

  // Parse JSON body
  if (server.hasArg("plain")) {
    String body = server.arg("plain");
    DynamicJsonDocument doc(256);
    DeserializationError error = deserializeJson(doc, body);

    if (!error) {
      String action = doc["action"].as<String>();
      if (action == "start_polling") {
        startPolling();
        server.send(200, "application/json", "{\"status\":\"polling_started\"}");
        return;
      }
    }
  }

  // Default: start polling
  startPolling();
  server.send(200, "application/json", "{\"status\":\"ok\"}");
}

// ============================================================================
// POLLING CONTROL
// ============================================================================

void startPolling() {
  if (pollingActive) {
    Serial.println("   Already polling");
    return;
  }

  pollingActive = true;
  lastPollTime = 0;  // Poll immediately
  lastSMSTime = millis();  // Reset idle timer

  Serial.println("▶️  Polling STARTED");
  Serial.println("   Will check backend every 2 seconds");
  Serial.println();
}

void stopPolling() {
  if (!pollingActive) return;

  pollingActive = false;
  Serial.println();
  Serial.println("⏸️  Polling STOPPED (queue empty)");
  Serial.println("🛑 Idle mode - waiting for next trigger...");
  Serial.println();
}

// ============================================================================
// INITIALIZE GSM
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
    Serial.println("   ❌ AT command failed");
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
// POLL BACKEND
// ============================================================================

void pollForSMS() {
  if (!wifiConnected) return;

  HTTPClient http;
  String url = String(BACKEND_URL) + "/api/gsm/pending?kiosk_id=" + String(KIOSK_ID) + "&limit=3";

  http.begin(url);
  http.setTimeout(5000);
  int httpCode = http.GET();

  Serial.print("📊 Polling... HTTP " + String(httpCode));

  if (httpCode == 200) {
    String payload = http.getString();
    Serial.println(" | Response: " + String(payload.length()) + " bytes");

    DynamicJsonDocument doc(4096);
    DeserializationError error = deserializeJson(doc, payload);

    if (error) {
      Serial.println("   ❌ JSON parse error");
      http.end();
      return;
    }

    JsonArray smsArray = doc.as<JsonArray>();
    int smsCount = smsArray.size();

    Serial.println("   SMS in queue: " + String(smsCount));

    if (smsCount > 0) {
      lastSMSTime = millis();  // Reset idle timer (found SMS!)

      Serial.println();
      Serial.println("📬 Pending SMS from backend: " + String(smsCount));

      int newCount = 0;
      for (JsonObject sms : smsArray) {
        String phone   = sms["phone_number"].as<String>();
        String message = sms["message"].as<String>();
        int    smsId   = sms["id"].as<int>();

        if (phone.length() > 0 && message.length() > 0) {
          if (addToQueue(phone, message, smsId)) {
            newCount++;
            Serial.println("📩 Queued SMS ID: " + String(smsId));
            Serial.println("   To: " + phone);
          }
        }
      }

      if (newCount > 0) {
        Serial.println("✅ Added " + String(newCount) + " SMS to queue");
      }
      Serial.println();
    }
  } else {
    Serial.println(" | Error");
  }

  http.end();
}

// ============================================================================
// QUEUE MANAGEMENT
// ============================================================================

bool addToQueue(String phone, String message, int smsId) {
  // Skip duplicates
  for (int i = 0; i < MAX_SMS_QUEUE; i++) {
    if (smsQueue[i].active && smsQueue[i].smsId == smsId) return false;
  }

  int nextTail = (queueTail + 1) % MAX_SMS_QUEUE;
  if (nextTail == queueHead) return false;

  smsQueue[queueTail].smsId       = smsId;
  smsQueue[queueTail].phoneNumber = phone;
  smsQueue[queueTail].message     = message;
  smsQueue[queueTail].retryCount  = 0;
  smsQueue[queueTail].active      = true;

  queueTail = nextTail;
  return true;
}

void processSMSQueue() {
  if (queueHead == queueTail) return;  // Queue empty

  SMSMessage& sms = smsQueue[queueHead];
  if (!sms.active) {
    queueHead = (queueHead + 1) % MAX_SMS_QUEUE;
    return;
  }

  Serial.println("📤 Sending SMS...");
  Serial.println("   ID: " + String(sms.smsId));
  Serial.println("   To: " + sms.phoneNumber);
  Serial.println("   Msg: " + sms.message.substring(0, 50) + "...");

  bool sent = sendSMS(sms.phoneNumber, sms.message);

  if (sent) {
    Serial.println("✅ SMS sent successfully!");
    notifyBackendSent(sms.smsId, true);
    sms.active = false;
    queueHead = (queueHead + 1) % MAX_SMS_QUEUE;
  } else {
    sms.retryCount++;
    if (sms.retryCount >= 3) {
      Serial.println("❌ SMS failed after 3 attempts");
      notifyBackendSent(sms.smsId, false);
      sms.active = false;
      queueHead = (queueHead + 1) % MAX_SMS_QUEUE;
    } else {
      Serial.println("⚠️  Retry " + String(sms.retryCount) + "/3");
    }
  }

  Serial.println();
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

  sim800.write(26);  // Ctrl+Z
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
  int httpCode = http.POST(payload);

  http.end();
}
