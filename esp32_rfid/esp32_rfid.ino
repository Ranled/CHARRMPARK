/*
 * ============================================
 * CHARRMPARK - ESP32 RFID Scanner
 * Connects to Supabase Edge Function
 * Uses MFRC522 RFID + I2C LCD + LED indicators
 * ============================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <ArduinoJson.h>
#include <hd44780.h>
#include <hd44780ioClass/hd44780_I2Cexp.h>

// =======================
// WIFI SETTINGS
// =======================
const char* ssid = "FTTx-4a6210";
const char* password = "10008636";

// =======================
// SUPABASE SETTINGS
// =======================
const char* serverName = "https://vhytyasrqwfyidezpeme.supabase.co/rest/v1/parking_logs";
const char* anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoeXR5YXNycXdmeWlkZXpwZW1lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2NzYyNzMsImV4cCI6MjA5NDI1MjI3M30.Jd4fiSxTKvXJgijGjPUiOext8_YNWL9z6-tCnGH-v2Y";
const char* deviceId = "ESP32-CHARRMPARK-01";

// =======================
// HARDWARE PINS
// =======================
#define SS_PIN 5
#define RST_PIN 27
#define RED_LED 2
#define GREEN_LED 4
#define BUZZER_PIN 15  // Optional buzzer

MFRC522 rfid(SS_PIN, RST_PIN);
hd44780_I2Cexp lcd;

// =======================
// SYSTEM VARIABLES
// =======================
unsigned long lastScanTime = 0;
const unsigned long SCAN_COOLDOWN = 5000; // 5 second cooldown between scans
bool wifiConnected = false;

// =======================
// SETUP
// =======================
void setup() {
  Serial.begin(115200);
  Serial.println("\n=============================");
  Serial.println("  CHARRMPARK RFID SCANNER");
  Serial.println("=============================\n");

  // Initialize I2C LCD
  Wire.begin(21, 22);
  lcd.begin(16, 2);
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("   CHARRMPARK   ");
  lcd.setCursor(0, 1);
  lcd.print(" RFID  PARKING  ");
  delay(2000);

  // Initialize RFID
  SPI.begin();
  rfid.PCD_Init();
  Serial.println("[OK] RFID Reader initialized");

  // Initialize LEDs
  pinMode(RED_LED, OUTPUT);
  pinMode(GREEN_LED, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(RED_LED, HIGH);
  digitalWrite(GREEN_LED, LOW);

  // Connect WiFi
  connectWiFi();

  // Ready state
  showReady();
}

// =======================
// WIFI CONNECTION
// =======================
void connectWiFi() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("CONNECTING WiFi");
  lcd.setCursor(0, 1);
  lcd.print("Please wait...");

  WiFi.begin(ssid, password);
  int attempts = 0;

  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println("\n[OK] WiFi Connected!");
    Serial.print("[IP] ");
    Serial.println(WiFi.localIP());

    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi CONNECTED");
    lcd.setCursor(0, 1);
    lcd.print(WiFi.localIP());
    delay(2000);
  } else {
    wifiConnected = false;
    Serial.println("\n[ERROR] WiFi FAILED");
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("WiFi FAILED!");
    lcd.setCursor(0, 1);
    lcd.print("Offline Mode");
    delay(2000);
  }
}

// =======================
// READY STATE DISPLAY
// =======================
void showReady() {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("SCAN YOUR CARD");
  lcd.setCursor(0, 1);
  lcd.print("READY...");
  digitalWrite(RED_LED, HIGH);
  digitalWrite(GREEN_LED, LOW);
}

// =======================
// MAIN LOOP
// =======================
void loop() {
  // Check WiFi reconnect
  if (WiFi.status() != WL_CONNECTED && wifiConnected) {
    wifiConnected = false;
    Serial.println("[WARN] WiFi disconnected, reconnecting...");
    connectWiFi();
    showReady();
  }

  // Wait for RFID card
  if (!rfid.PICC_IsNewCardPresent()) return;
  if (!rfid.PICC_ReadCardSerial()) return;

  // Cooldown check (prevent duplicate scans)
  if (millis() - lastScanTime < SCAN_COOLDOWN) {
    Serial.println("[SKIP] Cooldown active");
    rfid.PICC_HaltA();
    return;
  }
  lastScanTime = millis();

  // Read UID
  String cardUID = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) cardUID += "0";
    cardUID += String(rfid.uid.uidByte[i], HEX);
    if (i != rfid.uid.size - 1) cardUID += " ";
  }
  cardUID.toUpperCase();

  Serial.print("[SCAN] UID: ");
  Serial.println(cardUID);

  // Show scanning animation
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("SCANNING...");
  lcd.setCursor(0, 1);
  lcd.print(cardUID);

  // Beep on scan
  tone(BUZZER_PIN, 2000, 100);

  // Send to Supabase
  if (wifiConnected) {
    sendToSupabase(cardUID);
  } else {
    // Offline fallback
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("NO CONNECTION");
    lcd.setCursor(0, 1);
    lcd.print("OFFLINE MODE");
    blinkLED(RED_LED, 3);
    delay(2000);
    showReady();
  }

  rfid.PICC_HaltA();
}

// =======================
// SEND TO SUPABASE
// =======================
void sendToSupabase(String uid) {
  HTTPClient http;
  http.begin(serverName);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", anonKey);
  http.addHeader("Authorization", String("Bearer ") + anonKey);
  http.addHeader("Prefer", "return=representation");

  // Build JSON payload for parking_logs
  StaticJsonDocument<256> doc;
  doc["rfid_uid"] = uid;
  doc["scan_type"] = "ENTRY";
  doc["status"] = "DENIED";
  doc["remarks"] = "ESP32_RAW_SCAN";

  String jsonData;
  serializeJson(doc, jsonData);

  Serial.print("[HTTP] Sending: ");
  Serial.println(jsonData);

  int httpCode = http.POST(jsonData);

  if (httpCode > 0) {
    String response = http.getString();
    Serial.print("[HTTP] Response (");
    Serial.print(httpCode);
    Serial.print("): ");
    Serial.println(response);

    // Beep once sent
    digitalWrite(RED_LED, LOW);
    digitalWrite(GREEN_LED, HIGH);
    tone(BUZZER_PIN, 1500, 200);
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("SCANNED!");
    lcd.setCursor(0, 1);
    lcd.print("Check Dashboard");
  } else {
    Serial.print("[HTTP] Error: ");
    Serial.println(httpCode);
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("SERVER ERROR");
    lcd.setCursor(0, 1);
    lcd.print("Code: " + String(httpCode));
    blinkLED(RED_LED, 3);
  }

  http.end();

  delay(3000);
  showReady();
}

// =======================
// LED BLINK HELPER
// =======================
void blinkLED(int pin, int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(pin, LOW);
    delay(200);
    digitalWrite(pin, HIGH);
    delay(200);
  }
}
