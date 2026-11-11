/**
 * ============================================================================
 * ATTENDBOX - Standalone Kiosk GSM SMS (NO WiFi Required)
 * ============================================================================
 * 
 * Hardware: ESP32 + SIM800L V2 GSM Module + RFID RC522 Reader
 * 
 * Description:
 * This standalone version sends SMS directly when RFID is scanned.
 * NO WiFi or backend connection required!
 * 
 * Student-Parent data is stored in the Arduino code itself.
 * 
 * Pin Connections:
 * ----------------
 * SIM800L V2 → ESP32
 * - TX  → GPIO 16 (RX2)
 * - RX  → GPIO 17 (TX2)
 * - VCC → 4.2V (External power supply - 2A!)
 * - GND → GND
 * - RST → GPIO 18
 * 
 * RFID RC522 → ESP32
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

#include <SPI.h>
#include <MFRC522.h>

// ============================================================================
// PIN CONFIGURATION
// ============================================================================

// RFID RC522
#define RFID_SS_PIN  5
#define RFID_RST_PIN 22

// SIM800L
#define SIM800_TX_PIN 17
#define SIM800_RX_PIN 16
#define SIM800_RST_PIN 18
#define SIM800_BAUD 9600

// ============================================================================
// STUDENT DATABASE (Stored in Arduino)
// ============================================================================

struct Student {
  String rfidUID;       // RFID card UID
  String lrn;           // Learner Reference Number (QR code)
  String bleMac;        // BLE MAC Address (Bluetooth)
  String name;          // Student name
  String grade;         // Grade level
  String section;       // Section
  String parentName;    // Parent/Guardian name
  String parentPhone;   // Parent phone number (+639xxxxxxxxx)
};

// Add your students here (up to 100 students)
// You can use any combination of identifiers: RFID, LRN (QR), or BLE MAC
Student students[] = {
  // RFID UID,      LRN,            BLE MAC,               Name,    Grade,      Section,  Parent Name,    Phone Number
  {"0002310671",   "2212343555",   "51:00:24:06:00:C4",   "Kurt",  "Grade 9",  "Wax",    "Kurt Sigada",  "+639536812353"},
  
  // Add more students below (use any identifier - RFID, QR, or BLE)
  // {"RFID_UID",   "LRN_NUMBER",   "BLE:MAC:ADDRESS",     "Name",  "Grade X",  "Section", "Parent",      "+639XXXXXXXXX"},
};

const int TOTAL_STUDENTS = sizeof(students) / sizeof(students[0]);

// ============================================================================
// HARDWARE OBJECTS
// ============================================================================

MFRC522 rfid(RFID_SS_PIN, RFID_RST_PIN);
HardwareSerial sim800(2);

// ============================================================================
// GLOBAL VARIABLES
// ============================================================================

bool gsmReady = false;
String lastScannedUID = "";
unsigned long lastScanTime = 0;
const unsigned long SCAN_COOLDOWN = 5000; // 5 seconds between same card scans

// ============================================================================
// SETUP
// ============================================================================

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println();
  Serial.println("╔═══════════════════════════════════════════════════════╗");
  Serial.println("║   ATTENDBOX - Standalone Kiosk GSM SMS               ║");
  Serial.println("║   ESP32 + SIM800L V2 + RFID (NO WiFi Required)       ║");
  Serial.println("╚═══════════════════════════════════════════════════════╝");
  Serial.println();
  
  // Initialize SPI for RFID
  SPI.begin();
  
  // Initialize RFID reader
  rfid.PCD_Init();
  delay(100);
  
  Serial.println("📡 RFID Reader initialized");
  Serial.print("   Firmware Version: ");
  rfid.PCD_DumpVersionToSerial();
  Serial.println();
  
  // Initialize SIM800L
  initGSM();
  
  Serial.println();
  Serial.println("✅ System ready!");
  Serial.println("📱 " + String(TOTAL_STUDENTS) + " students loaded in database");
  Serial.println("🔍 Waiting for RFID card scan...");
  Serial.println();
}

// ============================================================================
// MAIN LOOP
// ============================================================================

void loop() {
  // TEST MODE: Check for manual input via Serial Monitor
  if (Serial.available()) {
    String testUID = Serial.readStringUntil('\n');
    testUID.trim();
    if (testUID.length() > 0) {
      Serial.println();
      Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      Serial.println("🧪 TEST MODE - Manual UID entered: " + testUID);
      
      Student* student = findStudent(testUID);
      if (student != NULL) {
        Serial.println("✅ Student Found:");
        Serial.println("   Name:    " + student->name);
        Serial.println("   Grade:   " + student->grade + " - " + student->section);
        Serial.println("   Parent:  " + student->parentName);
        Serial.println("   Phone:   " + student->parentPhone);
        Serial.println();
        sendAttendanceSMS(student);
      } else {
        Serial.println("❌ Student NOT FOUND in database!");
        Serial.println("   Please register this identifier: " + testUID);
      }
      Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      Serial.println();
    }
  }
  
  // Check for RFID card
  if (!rfid.PICC_IsNewCardPresent()) {
    delay(50);
    return;
  }
  
  if (!rfid.PICC_ReadCardSerial()) {
    delay(50);
    return;
  }
  
  // Read RFID UID
  String uid = getUID();
  
  // Cooldown check - prevent duplicate scans
  if (uid == lastScannedUID && (millis() - lastScanTime) < SCAN_COOLDOWN) {
    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
    return;
  }
  
  lastScannedUID = uid;
  lastScanTime = millis();
  
  Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  Serial.println("🆔 RFID Card Detected!");
  Serial.println("   UID: " + uid);
  
  // Find student in database
  Student* student = findStudent(uid);
  
  if (student != NULL) {
    Serial.println("✅ Student Found:");
    Serial.println("   Name:    " + student->name);
    Serial.println("   Grade:   " + student->grade + " - " + student->section);
    Serial.println("   Parent:  " + student->parentName);
    Serial.println("   Phone:   " + student->parentPhone);
    Serial.println();
    
    // Send SMS notification
    sendAttendanceSMS(student);
    
  } else {
    Serial.println("❌ Student NOT FOUND in database!");
    Serial.println("   Please register this RFID card: " + uid);
  }
  
  Serial.println("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  Serial.println();
  
  // Halt PICC
  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  
  delay(100);
}

// ============================================================================
// GET RFID UID
// ============================================================================

String getUID() {
  String uid = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    uid += String(rfid.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();
  return uid;
}

// ============================================================================
// FIND STUDENT BY ANY IDENTIFIER (RFID, LRN, or BLE MAC)
// ============================================================================

Student* findStudent(String identifier) {
  // Normalize identifier for comparison
  String normalizedId = identifier;
  normalizedId.toUpperCase();
  normalizedId.trim();
  
  // Search through all students
  for (int i = 0; i < TOTAL_STUDENTS; i++) {
    // Check RFID UID
    if (students[i].rfidUID.length() > 0 && students[i].rfidUID.equalsIgnoreCase(identifier)) {
      return &students[i];
    }
    
    // Check LRN (QR code)
    if (students[i].lrn.length() > 0 && students[i].lrn.equalsIgnoreCase(identifier)) {
      return &students[i];
    }
    
    // Check BLE MAC Address
    if (students[i].bleMac.length() > 0 && students[i].bleMac.equalsIgnoreCase(identifier)) {
      return &students[i];
    }
  }
  
  return NULL; // Student not found
}

// ============================================================================
// SEND ATTENDANCE SMS
// ============================================================================

void sendAttendanceSMS(Student* student) {
  if (!gsmReady) {
    Serial.println("⚠️  GSM not ready, skipping SMS");
    return;
  }
  
  // Get current time (you can use RTC module for accurate time)
  // For now, we'll use a simple timestamp
  String timeStr = "Now"; // Replace with actual time if RTC available
  
  // Get current date
  String dateStr = "Today"; // Replace with actual date if RTC available
  
  // Create SMS message
  String message = "✅ ATTENDBOX: " + student->name + 
                   " has arrived at school at " + timeStr + 
                   ". Date: " + dateStr + 
                   ". Grade: " + student->grade + " " + student->section;
  
  Serial.println("📤 Sending SMS...");
  Serial.println("   To: " + student->parentPhone);
  Serial.println("   Message: " + message);
  Serial.println();
  
  bool success = sendSMS(student->parentPhone, message);
  
  if (success) {
    Serial.println("✅ SMS sent successfully!");
  } else {
    Serial.println("❌ SMS failed to send");
  }
}

// ============================================================================
// INITIALIZE SIM800L GSM MODULE
// ============================================================================

void initGSM() {
  Serial.println("📱 Initializing SIM800L GSM module...");
  
  // Initialize reset pin
  pinMode(SIM800_RST_PIN, OUTPUT);
  digitalWrite(SIM800_RST_PIN, HIGH);
  
  // Start serial communication
  sim800.begin(SIM800_BAUD, SERIAL_8N1, SIM800_RX_PIN, SIM800_TX_PIN);
  delay(1000);
  
  // Hardware reset
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
  
  // Check signal
  Serial.print("   Signal: ");
  sim800.println("AT+CSQ");
  delay(1000);
  if (sim800.available()) {
    String response = sim800.readString();
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
      Serial.println("   ⚠️  SIM card not ready");
    }
  }
  
  // Check network
  sim800.println("AT+CREG?");
  delay(1000);
  if (sim800.available()) {
    String response = sim800.readString();
    Serial.print("   Network: ");
    Serial.println(response);
  }
  
  Serial.println();
  if (gsmReady) {
    Serial.println("✅ SIM800L ready to send SMS!");
  } else {
    Serial.println("⚠️  SIM800L initialization incomplete");
  }
}

// ============================================================================
// SEND SMS VIA SIM800L
// ============================================================================

bool sendSMS(String phoneNumber, String message) {
  if (!gsmReady) {
    return false;
  }
  
  // Clear buffer
  while (sim800.available()) sim800.read();
  
  // Set SMS text mode
  sim800.println("AT+CMGF=1");
  delay(500);
  
  // Set recipient
  sim800.print("AT+CMGS=\"");
  sim800.print(phoneNumber);
  sim800.println("\"");
  delay(1000);
  
  // Wait for '>' prompt
  if (!waitForPrompt()) {
    Serial.println("   ❌ No prompt received");
    return false;
  }
  
  // Send message
  sim800.print(message);
  delay(100);
  
  // Send Ctrl+Z (ASCII 26)
  sim800.write(26);
  delay(100);
  
  // Wait for response
  unsigned long timeout = millis() + 10000;
  bool success = false;
  
  while (millis() < timeout) {
    if (sim800.available()) {
      String response = sim800.readString();
      Serial.println("   GSM Response: " + response);
      
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
// WAIT FOR '>' PROMPT
// ============================================================================

bool waitForPrompt() {
  unsigned long timeout = millis() + 5000;
  
  while (millis() < timeout) {
    if (sim800.available()) {
      char c = sim800.read();
      Serial.print(c); // Debug
      if (c == '>') {
        Serial.println(); // New line after prompt
        return true;
      }
    }
    delay(10);
  }
  
  return false;
}

// ============================================================================
// UTILITY: READ SERIAL STRING (for debugging)
// ============================================================================

String readSerialString() {
  String str = "";
  unsigned long timeout = millis() + 1000;
  
  while (millis() < timeout) {
    if (sim800.available()) {
      char c = sim800.read();
      str += c;
      timeout = millis() + 100; // Extend timeout on new data
    }
    delay(10);
  }
  
  return str;
}
