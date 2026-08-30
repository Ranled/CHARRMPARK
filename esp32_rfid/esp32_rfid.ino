/*
 * ============================================================
 * CHARRMPASS — ESP32 Dual-Gate RFID Scanner v3.0
 *
 * ONE firmware for BOTH gates.
 * Change GATE_TYPE and GATE_ID below to switch between units.
 *
 * Hardware:
 *   - ESP32 Dev Board
 *   - MFRC522 RFID reader (SPI)
 *   - 16x2 I2C LCD (hd44780)
 *   - Green LED (authorized)
 *   - Red LED (denied)
 *   - Optional buzzer
 * ============================================================
 */

// =====================================================
// ▼▼▼  CHANGE THIS ONE LINE TO SWITCH GATE  ▼▼▼
// =====================================================
#define GATE_TYPE  "ENTRY"                 // "ENTRY" or "EXIT"
#define GATE_ID    "CHARRMPASS_GATE_ENTRY" // or "CHARRMPASS_GATE_EXIT"
// =====================================================

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
const char* ssid     = "YOUR_WIFI_SSID";      // <-- replace with your WiFi name
const char* password = "YOUR_WIFI_PASSWORD";   // <-- replace with your WiFi password

// =======================
// SUPABASE SETTINGS
// =======================
const char* SUPABASE_URL  = "YOUR_SUPABASE_PROJECT_URL";  // e.g. https://xxxx.supabase.co
const char* SUPABASE_ANON = "YOUR_SUPABASE_ANON_KEY";     // anon/public key


// =======================
// HARDWARE PINS
// =======================
#define SS_PIN      5
#define RST_PIN     27
#define RED_LED     2
#define GREEN_LED   4
#define BUZZER_PIN  15

MFRC522        rfid(SS_PIN, RST_PIN);
hd44780_I2Cexp lcd;

// =======================
// SCAN STATE (global)
// Populated by checkAuthorization()
// =======================
bool   card_found      = false;
bool   card_authorized = false;
String card_name       = "";
String card_plate      = "";
String card_role       = "";
String card_vehicleId  = "";
String card_userId     = "";

// =======================
// TIMING
// =======================
unsigned long lastScanTime = 0;
const unsigned long SCAN_COOLDOWN = 5000;
bool wifiConnected = false;

// =======================
// SETUP
// =======================
void setup() {
  Serial.begin(115200);
  Serial.println("\n================================");
  Serial.print  ("  CHARRMPASS — ");
  Serial.print  (GATE_TYPE);
  Serial.println(" GATE");
  Serial.println("================================\n");

  Wire.begin(21, 22);
  lcd.begin(16, 2);
  lcdMsg("  CHARRMPASS  ", GATE_TYPE);
  delay(2000);

  SPI.begin();
  rfid.PCD_Init();

  pinMode(RED_LED,    OUTPUT);
  pinMode(GREEN_LED,  OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(RED_LED,   HIGH);
  digitalWrite(GREEN_LED, LOW);

  connectWiFi();
  showReady();
}

// =======================
// HELPERS — LCD
// =======================
void lcdMsg(String line1, String line2) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1.substring(0, 16));
  lcd.setCursor(0, 1);
  lcd.print(line2.substring(0, 16));
}

void showReady() {
  lcdMsg("  SCAN CARD   ", String(GATE_TYPE) + " READY...");
  digitalWrite(RED_LED,   HIGH);
  digitalWrite(GREEN_LED, LOW);
}

// =======================
// WIFI
// =======================
void connectWiFi() {
  lcdMsg("CONNECTING WiFi", "Please wait...");
  WiFi.begin(ssid, password);
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 30) {
    delay(500);
    Serial.print(".");
    tries++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println("\n[OK] WiFi: " + WiFi.localIP().toString());
    lcdMsg("WiFi CONNECTED", WiFi.localIP().toString());
    delay(2000);
  } else {
    wifiConnected = false;
    Serial.println("\n[ERR] WiFi FAILED");
    lcdMsg("WiFi FAILED!", "Offline Mode");
    delay(2000);
  }
}

// =======================
// URL-ENCODE UID
// (spaces in UID → %20 for query param)
// =======================
String urlEncode(String s) {
  String out = "";
  for (unsigned int i = 0; i < s.length(); i++) {
    if (s[i] == ' ') out += "%20";
    else             out += s[i];
  }
  return out;
}

// =======================
// STEP 1 — CHECK AUTH
// Populates global card_* variables.
// Returns true if card found AND authorized.
// =======================
bool checkAuthorization(String uid) {
  // Reset globals
  card_found      = false;
  card_authorized = false;
  card_name       = "";
  card_plate      = "";
  card_role       = "";
  card_vehicleId  = "";
  card_userId     = "";

  String url = String(SUPABASE_URL)
    + "/rest/v1/rfid_cards?rfid_uid=eq."
    + urlEncode(uid)
    + "&select=authorization_status,vehicle_id,user_id,"
      "vehicles(plate_number),"
      "users(full_name,role)";

  HTTPClient http;
  http.begin(url);
  http.addHeader("apikey",        SUPABASE_ANON);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON);

  int code = http.GET();
  String body = "";
  if (code == 200) {
    body = http.getString();
    Serial.println("[AUTH] " + body);
  } else {
    Serial.println("[AUTH] HTTP error: " + String(code));
    http.end();
    return false;
  }
  http.end();

  // Parse JSON array
  DynamicJsonDocument doc(1024);
  DeserializationError err = deserializeJson(doc, body);
  if (err) {
    Serial.println("[AUTH] JSON error: " + String(err.c_str()));
    return false;
  }

  JsonArray arr = doc.as<JsonArray>();
  if (arr.size() == 0) {
    Serial.println("[AUTH] Card not registered");
    return false;  // card_found stays false
  }

  JsonObject card = arr[0];
  card_found      = true;
  card_authorized = (String(card["authorization_status"].as<const char*>()) == "AUTHORIZED");
  card_vehicleId  = String(card["vehicle_id"]  | "");
  card_userId     = String(card["user_id"]     | "");

  if (!card["vehicles"].isNull()) {
    card_plate = String(card["vehicles"]["plate_number"] | "");
  }
  if (!card["users"].isNull()) {
    card_name = String(card["users"]["full_name"] | "");
    card_role = String(card["users"]["role"]      | "");
  }

  return card_authorized;
}

// =======================
// STEP 2 — INSERT TRANSACTION
// =======================
void insertTransaction(String uid, String status, String remarks) {
  String url = String(SUPABASE_URL) + "/rest/v1/transactions";

  HTTPClient http;
  http.begin(url);
  http.addHeader("Content-Type",  "application/json");
  http.addHeader("apikey",        SUPABASE_ANON);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON);
  http.addHeader("Prefer",        "return=minimal");

  DynamicJsonDocument doc(512);
  doc["rfid_uid"]  = uid;
  doc["direction"] = GATE_TYPE;
  doc["gate"]      = GATE_ID;
  doc["status"]    = status;
  doc["remarks"]   = remarks;
  if (card_vehicleId.length() > 0 && card_vehicleId != "null")
    doc["vehicle_id"] = card_vehicleId;
  if (card_userId.length() > 0 && card_userId != "null")
    doc["user_id"] = card_userId;

  String body;
  serializeJson(doc, body);
  Serial.println("[TXN] " + body);

  int code = http.POST(body);
  Serial.println("[TXN] Response: " + String(code));
  http.end();
}

// =======================
// LED BLINK HELPER
// =======================
void blinkLED(int pin, int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(pin, LOW);  delay(150);
    digitalWrite(pin, HIGH); delay(150);
  }
}

// =======================
// PROCESS SCAN
// =======================
void processScan(String uid) {
  Serial.println("[SCAN] UID: " + uid);
  lcdMsg("CHECKING...", uid.substring(0, 16));

  if (!wifiConnected) {
    lcdMsg("NO CONNECTION", "OFFLINE MODE");
    blinkLED(RED_LED, 3);
    delay(3000);
    showReady();
    return;
  }

  bool authorized = checkAuthorization(uid);

  if (!card_found) {
    // Unregistered card
    Serial.println("[RESULT] NOT REGISTERED");
    lcdMsg("ACCESS DENIED", "UNREGISTERED");
    tone(BUZZER_PIN, 500, 400);
    blinkLED(RED_LED, 4);
    insertTransaction(uid, "DENIED", "Unregistered RFID");
    delay(3000);
    showReady();
    return;
  }

  if (!authorized) {
    // Registered but PENDING or DENIED
    Serial.println("[RESULT] UNAUTHORIZED");
    lcdMsg("UNAUTHORIZED", "PENDING APPROVAL");
    tone(BUZZER_PIN, 500, 400);
    blinkLED(RED_LED, 3);
    insertTransaction(uid, "DENIED", "Card not authorized");
    delay(3000);
    showReady();
    return;
  }

  // AUTHORIZED
  Serial.println("[RESULT] AUTHORIZED — " + card_name);
  String statusLine = String(GATE_TYPE) + " GRANTED";
  String plateLine  = (card_plate.length() > 0) ? card_plate : uid.substring(0, 16);

  lcdMsg(statusLine, plateLine);
  tone(BUZZER_PIN, 2000, 150);
  delay(80);
  tone(BUZZER_PIN, 2500, 150);
  digitalWrite(RED_LED,   LOW);
  digitalWrite(GREEN_LED, HIGH);

  insertTransaction(uid, "AUTHORIZED", String(GATE_TYPE) + " scan");

  // Show name on LCD after insert
  if (card_name.length() > 0) {
    lcd.setCursor(0, 1);
    lcd.print(card_name.substring(0, 16));
  }

  delay(4000);
  showReady();
}

// =======================
// MAIN LOOP
// =======================
void loop() {
  // WiFi watchdog
  if (WiFi.status() != WL_CONNECTED) {
    if (wifiConnected) {
      wifiConnected = false;
      Serial.println("[WARN] WiFi lost");
    }
    connectWiFi();
    showReady();
    return;
  }
  wifiConnected = true;

  // Wait for card
  if (!rfid.PICC_IsNewCardPresent()) return;
  if (!rfid.PICC_ReadCardSerial())   return;

  // Cooldown guard
  if (millis() - lastScanTime < SCAN_COOLDOWN) {
    Serial.println("[SKIP] Cooldown");
    rfid.PICC_HaltA();
    return;
  }
  lastScanTime = millis();

  // Build UID string (hex bytes separated by spaces)
  String uid = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(rfid.uid.uidByte[i], HEX);
    if (i != rfid.uid.size - 1) uid += " ";
  }
  uid.toUpperCase();

  tone(BUZZER_PIN, 2000, 100);  // scan beep

  processScan(uid);
  rfid.PICC_HaltA();
}
