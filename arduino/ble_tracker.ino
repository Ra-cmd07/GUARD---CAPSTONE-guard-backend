#include <WiFi.h>
#include <WiFiClient.h>
#include <HTTPClient.h>
#include <BLEDevice.h>
#include <BLEScan.h>
#include <time.h>

// Wi-Fi credentials
const char* ssid = "Alsaul";
const char* password = "PLDTWIFIFIBER10ross";

// Backend endpoint (adjust host and port if needed)
const char* serverHost = "192.168.1.29";
const uint16_t serverPort = 5000;
const char* serverPath = "/api/ble/upload";

// Identify this ESP32 instance by room name
const char* roomName = "room1"; // change to room2, room3, etc. for other devices

const char* ntpServer = "pool.ntp.org";
const long gmtOffset_sec = 0;
const int daylightOffset_sec = 0;

BLEScan* pBLEScan;

String getIsoTimestamp() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    return String("1970-01-01T00:00:00Z");
  }

  char buffer[25];
  strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(buffer);
}

float rssiToDistance(int rssi) {
  // Rough approximation using RSSI and reference power at 1 meter
  const float txPower = -59.0;
  float ratio = rssi * 1.0 / txPower;
  if (ratio < 1.0) {
    return pow(ratio, 10);
  } else {
    return (0.89976) * pow(ratio, 7.7095) + 0.111;
  }
}

void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  Serial.print("Connecting to Wi-Fi");
  WiFi.begin(ssid, password);

  int retries = 0;
  while (WiFi.status() != WL_CONNECTED && retries < 20) {
    delay(500);
    Serial.print('.');
    retries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWi-Fi connected");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
    Serial.print("Gateway: ");
    Serial.println(WiFi.gatewayIP());
  } else {
    Serial.println("\nFailed to connect to Wi-Fi");
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  connectWifi();
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);

  BLEDevice::init("");
  pBLEScan = BLEDevice::getScan();
  pBLEScan->setActiveScan(true);
  pBLEScan->setInterval(100);
  pBLEScan->setWindow(99);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWifi();
  }

  Serial.println("Starting BLE scan...");
  BLEScanResults* foundDevices = pBLEScan->start(5, false);
  int count = foundDevices->getCount();
  Serial.printf("Found %d BLE devices\n", count);

  String payload = "{\"devices\": [";
  String timestamp = getIsoTimestamp();

  for (int i = 0; i < count; i++) {
    BLEAdvertisedDevice device = foundDevices->getDevice(i);
    String mac = device.getAddress().toString().c_str();
    int rssi = device.getRSSI();
    float distance = rssiToDistance(rssi);

    if (i > 0) {
      payload += ",";
    }
    payload += "{\"mac_address\":\"" + mac + "\",\"rssi\":" + String(rssi) + ",\"distance\":" + String(distance, 2) + ",\"timestamp\":\"" + timestamp + "\"}";
  }

  payload += "],\"room_name\":\"" + String(roomName) + "\"}";
  if (count == 0) {
    Serial.println("No BLE devices found.");
    pBLEScan->clearResults();
    delay(10000);
    return;
  }
  
  Serial.println("Sending payload to backend:");
  Serial.println(payload);

  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    WiFiClient client;
    Serial.printf("POST host: %s port: %u path: %s\n", serverHost, serverPort, serverPath);

    if (!http.begin(client, serverHost, serverPort, serverPath, false)) {
      Serial.println("❌ HTTP begin failed");
    } else {
      http.addHeader("Content-Type", "application/json");
      http.addHeader("Connection", "close");
      http.setTimeout(10000);

      int httpResponseCode = http.POST(payload);
      Serial.printf("HTTP response code: %d\n", httpResponseCode);

      if (httpResponseCode > 0) {
        String response = http.getString();
        Serial.println("Backend response:");
        Serial.println(response);
      } else {
        Serial.printf("Failed to POST to backend: %s\n", http.errorToString(httpResponseCode).c_str());
        if (!client.connect(serverHost, serverPort)) {
          Serial.println("❌ Direct TCP connect failed");
        } else {
          Serial.println("✅ Direct TCP connect succeeded");
          client.stop();
        }
      }
    }

    http.end();
  } else {
    Serial.println("Wi-Fi not connected, skipping upload");
  }

  pBLEScan->clearResults();
  delay(15000);
}
