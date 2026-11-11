// ============================================================================
// ESP32 BLE MAC Address Finder
// ============================================================================
// Upload this to each ESP32 to get its BLE MAC address
// Write down the MAC address and label each device!
// ============================================================================

#include <BLEDevice.h>

void setup() {
  Serial.begin(115200);
  delay(2000);
  
  Serial.println("\n\n╔════════════════════════════════════════════╗");
  Serial.println("║  ESP32 BLE MAC Address Finder v1.0      ║");
  Serial.println("╚════════════════════════════════════════════╝\n");
  
  // Initialize BLE
  Serial.print("🔵 Initializing BLE...");
  BLEDevice::init("ESP32_Beacon_Finder");
  Serial.println(" ✅\n");
  
  // Get BLE MAC address
  String mac = BLEDevice::getAddress().toString().c_str();
  mac.toUpperCase();
  
  Serial.println("╔════════════════════════════════════════════╗");
  Serial.println("║         📍 YOUR ESP32 BLE MAC ADDRESS       ║");
  Serial.println("╠════════════════════════════════════════════╣");
  Serial.print("║           ");
  Serial.print(mac);
  Serial.println("           ║");
  Serial.println("╚════════════════════════════════════════════╝\n");
  
  Serial.println("✅ WRITE THIS DOWN AND LABEL THE DEVICE!");
  Serial.println("   Example: Use tape to label:");
  Serial.println("   'Main Gate - " + mac + "'");
  Serial.println("\n📋 Repeat for all 3 ESP32 devices\n");
  
  Serial.println("════════════════════════════════════════════\n");
}

void loop() {
  delay(10000);
  Serial.println("💡 MAC Address: " + String(BLEDevice::getAddress().toString().c_str()));
}
