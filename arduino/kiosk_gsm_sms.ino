/**
 * ============================================================================
 * ATTENDBOX - Kiosk GSM SMS Notification System
 * ============================================================================
 * 
 * Hardware: ESP32 + SIM800L V2 GSM Module + RFID Reader (Optional)
 * 
 * Description:
 * This Arduino sketch connects to the kiosk backend via WiFi. When a student
 * scans (RFID/QR/BLE), the backend sends parent contact info via HTTP, and
 * this device sends SMS via SIM800L GSM module.
 * 
 * Pin Connections:
 * ----------------
 * SIM800L V2 → ESP32
 * - TX  → GPIO 16 (RX2)
 * - RX  → GPIO 17 (TX2)
 * - VCC → 4.2V (Use external 3.7-4.2V 2A power supply - ESP32 can't power it!)
 * - GND → GND (Common ground with ESP32)
 * - RST → GPIO 18 (Optional - for hardware reset)
 * 
 * RFID RC522 (Optional) → ESP32
 * - SDA  → GPIO 5
 * - SCK  → GPIO 18
 * - MOSI → GPIO 23
 * - MISO → GPIO 19
 * - RST  → GPIO 22
 * - 3.3V → 3.3V
 * - GND  → GND
 * 
 * ============================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ============================================================================
// CONFIGURATION - Update these values
// ============================================================================

// WiFi Credentials
const char* WIFI_SSID     = "YourWiFiSSID";     // UPDATE: Your WiFi network name
const char* WIFI_PASSWORD = "YourWiFiPassword"; // UPDATE: Your WiFi password

// Backend API Configuration
const char* BACKEND_URL   = "http://192.168.1.100:5000"; // UPDATE: Your backend IP address
const int   KIOSK_ID      = 1;                            // Kiosk identifier

// SIM800L Configuration
#define SIM800_TX_PIN 17  // ESP32 TX2 → SIM800L RX
#define SIM800_RX_PIN 16  // ESP32 RX2 → SIM800L TX
#define SIM800_RST_PIN 18 // Optional: for hardware reset
#define SIM800_BAUD 9600

// SMS Queue Configuration
#define MAX_SMS_QUEUE 10
#define SMS_RETRY_DELAY 5000  // 5 seconds between retries
#define POLL_INTERVAL 2000    // Poll backend every 2 seconds

// ============================================================================
// HARDWARE SERIAL
// ============================================================================

HardwareSerial sim800(2); // Use UART2 for SIM800L

// ============================================================================
// SMS QUEUE STRUCTURE
// ============================================================================

struct SMSMessage {
  int smsId;          // Database ID for acknowledgment
  String phoneNumber;
  String message;
  int retryCount;
  bool active;
};

SMSMessage smsQueue[MAX_SMS_QUEUE];
int queueHead = 0;
int queueTail = 0;

// ============================================================================
// GLOBAL VARIABLES
// ============================================================================

unsigned long lastPollTime = 0;

bool gsmReady = false;
unsigned long lastSmsAttempt = 0;

// ============================================================================
// SETUP
// ============================================================================

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println();
  Serial.println("╔═══════════════════════════════════════════════════════╗");
  Serial.println("║   ATTENDBOX - Kiosk GSM SMS Notification System      ║");
  Serial.println("║   ESP32 + SIM800L V2                                 ║");
  Serial.println("╚═══════════════════════════════════════════════════════╝");
  Serial.println();
  
  // Initialize SIM800L
  initGSM();
  
  // Connect to WiFi
  connectWiFi();
  
  // Initialize SMS queue
  for (int i = 0; i < MAX_SMS_QUEUE; i++) {
    smsQueue[i].active = false;
    smsQueue[i].retryCount = 0;
  }
  
  Serial.println();
  Serial.println("✅ System ready! Waiting for attendance scans...");
  Serial.println();
}

// ============================================================================
// MAIN LOOP
// ============================================================================

void loop() {
  // Check WiFi connection
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️  WiFi disconnected, reconnecting...");
    connectWiFi();
    delay(5000);
    return;
  }
  
  // Poll backend for pending SMS requests
  if (millis() - lastPollTime >= POLL_INTERVAL) {
    lastPollTime = millis();
    pollForSMS();
  }
  
  // Process SMS queue
  if (gsmReady && (millis() - lastSmsAttempt >= SMS_RETRY_DELAY)) {
    processSMSQueue();
  }
  
  // Handle incoming serial data from SIM800L
  if (sim800.available()) {
    String response = sim800.readString();
    Serial.print("📱 SIM800L: ");
    Serial.println(response);
  }
  
  delay(100);
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
  } else {
    Serial.println("❌ WiFi connection failed!");
  }
}

// ============================================================================
// SIM800L GSM INITIALIZATION
// ============================================================================

void initGSM() {
  Serial.println("📱 Initializing SIM800L GSM module...");
  
  // Initialize hardware reset pin
  pinMode(SIM800_RST_PIN, OUTPUT);
  digitalWrite(SIM800_RST_PIN, HIGH);
  
  // Start serial communication with SIM800L
  sim800.begin(SIM800_BAUD, SERIAL_8N1, SIM800_RX_PIN, SIM800_TX_PIN);
  delay(1000);
  
  // Hardware reset SIM800L
  Serial.println("   Resetting SIM800L...");
  digitalWrite(SIM800_RST_PIN, LOW);
  delay(200);
  digitalWrite(SIM800_RST_PIN, HIGH);
  delay(3000);
  
  // Test AT command
  Serial.println("   Testing AT commands...");
  for (int i = 0; i < 5; i++) {
    sim800.println("AT");
    delay(1000);
    if (sim800.available()) {
      String response = sim800.readString();
      if (response.indexOf("OK") != -1) {
        Serial.println("   ✅ AT command OK");
        break;
      }
    }
  }
  
  // Set SMS text mode
  sim800.println("AT+CMGF=1");
  delay(1000);
  
  // Set character set
  sim800.println("AT+CSCS=\"GSM\"");
  delay(1000);
  
  // Check signal strength
  sim800.println("AT+CSQ");
  delay(1000);
  if (sim800.available()) {
    String response = sim800.readString();
    Serial.print("   Signal: ");
    Serial.println(response);
  }
  
  // Check SIM card
  sim800.println("AT+CPIN?");
  delay(1000);
  if (sim800.available()) {
    String response = sim800.readString();
    if (response.indexOf("READY") != -1) {
      Serial.println("   ✅ SIM card ready");
      gsmReady = true;
    } else {
      Serial.println("   ⚠️  SIM card not ready: " + response);
    }
  }
  
  // Check network registration
  sim800.println("AT+CREG?");
  delay(1000);
  if (sim800.available()) {
    String response = sim800.readString();
    Serial.print("   Network: ");
    Serial.println(response);
  }
  
  Serial.println();
  if (gsmReady) {
    Serial.println("✅ SIM800L initialized successfully!");
  } else {
    Serial.println("⚠️  SIM800L initialization incomplete - will retry");
  }
}

// ============================================================================
// POLL BACKEND FOR PENDING SMS REQUESTS
// ============================================================================

void pollForSMS() {
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  String url = String(BACKEND_URL) + "/api/gsm/pending?kiosk_id=" + String(KIOSK_ID);
  
  http.begin(url);
  int httpCode = http.GET();
  
  if (httpCode == 200) {
    String payload = http.getString();
    
    // Parse JSON response
    StaticJsonDocument<2048> doc;
    DeserializationError error = deserializeJson(doc, payload);
    
    if (!error) {
      JsonArray smsArray = doc.as<JsonArray>();
      
      for (JsonObject sms : smsArray) {
        String phone = sms["phone_number"].as<String>();
        String message = sms["message"].as<String>();
        int smsId = sms["id"].as<int>();
        
        if (phone.length() > 0 && message.length() > 0) {
          // Add to SMS queue
          if (addToQueue(phone, message, smsId)) {
            Serial.println("📩 SMS queued:");
            Serial.println("   ID: " + String(smsId));
            Serial.println("   To: " + phone);
            Serial.println("   Msg: " + message.substring(0, 50) + "...");
          }
        }
      }
    }
  } else if (httpCode > 0) {
    Serial.println("⚠️  Backend returned HTTP " + String(httpCode));
  }
  
  http.end();
}

// ============================================================================
// ADD SMS TO QUEUE
// ============================================================================

bool addToQueue(String phone, String message, int smsId) {
  int nextTail = (queueTail + 1) % MAX_SMS_QUEUE;
  
  // Check if queue is full
  if (nextTail == queueHead) {
    Serial.println("⚠️  SMS queue full!");
    return false;
  }
  
  smsQueue[queueTail].smsId = smsId;
  smsQueue[queueTail].phoneNumber = phone;
  smsQueue[queueTail].message = message;
  smsQueue[queueTail].retryCount = 0;
  smsQueue[queueTail].active = true;
  
  queueTail = nextTail;
  return true;
}

// ============================================================================
// PROCESS SMS QUEUE
// ============================================================================

void processSMSQueue() {
  if (queueHead == queueTail) return; // Queue empty
  
  SMSMessage* currentSms = &smsQueue[queueHead];
  
  if (!currentSms->active) {
    queueHead = (queueHead + 1) % MAX_SMS_QUEUE;
    return;
  }
  
  Serial.println();
  Serial.println("📤 Sending SMS...");
  Serial.println("   ID: " + String(currentSms->smsId));
  Serial.println("   To: " + currentSms->phoneNumber);
  Serial.println("   Attempt: " + String(currentSms->retryCount + 1));
  
  bool success = sendSMS(currentSms->phoneNumber, currentSms->message);
  
  if (success) {
    Serial.println("✅ SMS sent successfully!");
    
    // Acknowledge to backend
    acknowledgeBackend(currentSms->smsId, "sent");
    
    currentSms->active = false;
    queueHead = (queueHead + 1) % MAX_SMS_QUEUE;
  } else {
    currentSms->retryCount++;
    
    if (currentSms->retryCount >= 3) {
      Serial.println("❌ SMS failed after 3 attempts, removing from queue");
      
      // Report failure to backend
      acknowledgeBackend(currentSms->smsId, "failed");
      
      currentSms->active = false;
      queueHead = (queueHead + 1) % MAX_SMS_QUEUE;
    } else {
      Serial.println("⚠️  SMS failed, will retry...");
    }
  }
  
  lastSmsAttempt = millis();
}

// ============================================================================
// SEND SMS VIA SIM800L
// ============================================================================

bool sendSMS(String phoneNumber, String message) {
  if (!gsmReady) {
    Serial.println("❌ GSM not ready");
    return false;
  }
  
  // Clear serial buffer
  while (sim800.available()) sim800.read();
  
  // Set SMS text mode
  sim800.println("AT+CMGF=1");
  delay(500);
  
  // Set recipient number
  sim800.print("AT+CMGS=\"");
  sim800.print(phoneNumber);
  sim800.println("\"");
  delay(1000);
  
  // Check if module is ready for message
  if (!waitForPrompt()) {
    Serial.println("❌ SIM800L not ready for message");
    return false;
  }
  
  // Send message content
  sim800.print(message);
  delay(100);
  
  // Send Ctrl+Z to send SMS (ASCII 26)
  sim800.write(26);
  delay(100);
  
  // Wait for response
  unsigned long timeout = millis() + 10000; // 10 second timeout
  bool success = false;
  
  while (millis() < timeout) {
    if (sim800.available()) {
      String response = sim800.readString();
      Serial.println("   Response: " + response);
      
      if (response.indexOf("+CMGS:") != -1 || response.indexOf("OK") != -1) {
        success = true;
        break;
      }
      
      if (response.indexOf("ERROR") != -1) {
        Serial.println("   ❌ GSM ERROR");
        break;
      }
    }
    delay(100);
  }
  
  return success;
}

// ============================================================================
// WAIT FOR '>' PROMPT FROM SIM800L
// ============================================================================

bool waitForPrompt() {
  unsigned long timeout = millis() + 5000;
  
  while (millis() < timeout) {
    if (sim800.available()) {
      char c = sim800.read();
      if (c == '>') {
        return true;
      }
    }
    delay(10);
  }
  
  return false;
}

// ============================================================================
// ACKNOWLEDGE SMS SENT TO BACKEND
// ============================================================================

void acknowledgeBackend(int smsId, String status) {
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  String url = String(BACKEND_URL) + "/api/gsm/ack/" + String(smsId);
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  StaticJsonDocument<200> doc;
  doc["status"] = status;
  doc["sent_by"] = "gsm_module";
  doc["kiosk_id"] = KIOSK_ID;
  
  String payload;
  serializeJson(doc, payload);
  
  int httpCode = http.POST(payload);
  
  if (httpCode == 200) {
    Serial.println("   ✅ Acknowledged to backend: " + status);
  } else {
    Serial.println("   ⚠️  Failed to acknowledge: HTTP " + String(httpCode));
  }
  
  http.end();
}

// ============================================================================
// UTILITY: PRINT FREE HEAP
// ============================================================================

void printFreeHeap() {
  Serial.print("Free heap: ");
  Serial.print(ESP.getFreeHeap());
  Serial.println(" bytes");
}
