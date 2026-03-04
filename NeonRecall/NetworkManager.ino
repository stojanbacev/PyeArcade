#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <esp_task_wdt.h> // Include Watchdog header

// Global instances for Network Manager
Preferences netMgr_preferences;
WebServer netMgr_webServer(80);

// HTML for the setup page
const char* netMgr_htmlHeader = "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width, initial-scale=1'><style>body{font-family:Arial;padding:20px;text-align:center}input,select{padding:10px;margin:10px;width:100%;box-sizing:border-box}button{background:#4CAF50;color:white;padding:12px;border:none;width:100%;font-size:16px}</style></head><body>";

// Function to handle the root URL of the Web Server
void netMgr_handleRoot() {
  String html = netMgr_htmlHeader;
  html += "<h2>WiFi Setup</h2>";
  html += "<form action='/save' method='POST'>";
  
  // Scan for networks
  int n = WiFi.scanNetworks();
  if (n == 0) {
    html += "<p>No networks found.</p>";
  } else {
    html += "<label>Select Network:</label><br>";
    html += "<select name='ssid'>";
    for (int i = 0; i < n; ++i) {
      String ssid = WiFi.SSID(i);
      html += "<option value='" + ssid + "'>" + ssid + " (" + String(WiFi.RSSI(i)) + " dBm)</option>";
    }
    html += "</select><br>";
  }
  
  html += "<label>Password:</label><br>";
  html += "<input type='password' name='password' placeholder='WiFi Password'><br>";
  html += "<button type='submit'>Save & Connect</button>";
  html += "</form></body></html>";
  
  netMgr_webServer.send(200, "text/html", html);
}

// Function to handle saving credentials
void netMgr_handleSave() {
  String ssid = netMgr_webServer.arg("ssid");
  String password = netMgr_webServer.arg("password");
  
  if (ssid.length() > 0) {
    netMgr_preferences.begin("pye_config", false);
    netMgr_preferences.putString("ssid", ssid);
    netMgr_preferences.putString("password", password);
    netMgr_preferences.end();
    
    String html = netMgr_htmlHeader;
    html += "<h2>Saved!</h2><p>Credentials saved. Rebooting...</p></body></html>";
    netMgr_webServer.send(200, "text/html", html);
    
    delay(2000);
    ESP.restart();
  } else {
    netMgr_webServer.send(400, "text/plain", "SSID missing");
  }
}

/**
 * setupNetwork
 * @param boardId The unique ID for this board (used for AP name if needed)
 * @param onConnecting Callback function to run repeatedly while trying to connect (animation)
 * @param onSetupMode Callback function to run once when entering setup mode (AP mode)
 */
void setupNetwork(String boardId, void (*onConnecting)(), void (*onSetupMode)()) {
  netMgr_preferences.begin("pye_config", true); // Read-only mode first
  String ssid = netMgr_preferences.getString("ssid", "");
  String password = netMgr_preferences.getString("password", "");
  netMgr_preferences.end();

  WiFi.mode(WIFI_STA);
  
  bool connected = false;

  // Try to connect if we have credentials
  if (ssid != "") {
    Serial.print("Connecting to stored WiFi: ");
    Serial.println(ssid);
    
    WiFi.begin(ssid.c_str(), password.c_str());
    
    unsigned long startAttempt = millis();
    // Try for 30 seconds
    while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 30000) {
      if (onConnecting) onConnecting();
      // esp_task_wdt_reset(); // Removed as we rely on default loop task WDT behavior now
      delay(10); // Yield to other tasks
    }
    
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("\nConnected to WiFi!");
      Serial.print("IP Address: ");
      Serial.println(WiFi.localIP());
      connected = true;
    } else {
      Serial.println("\nConnection failed/timeout.");
    }
  } else {
    Serial.println("No stored credentials.");
  }

  // If not connected, start Web Server / AP Mode
  if (!connected) {
    Serial.println("Starting Setup Mode (AP)...");
    delay(100); // Flush serial
    
    WiFi.disconnect();
    delay(100); // Let radio settle
    WiFi.mode(WIFI_AP);
    
    String apName = boardId + "_wifi";
    // Channel 1, Hidden 0, Max 4 connections
    WiFi.softAP(apName.c_str(), NULL, 1, 0, 4);
    
    Serial.print("AP Created: ");
    Serial.println(apName);
    Serial.print("AP IP: ");
    Serial.println(WiFi.softAPIP());

    netMgr_webServer.on("/", netMgr_handleRoot);
    netMgr_webServer.on("/save", netMgr_handleSave);
    netMgr_webServer.begin();
    
    // Set LEDs for setup mode
    if (onSetupMode) onSetupMode();
    
    // Loop forever in Setup Mode
    while (true) {
      netMgr_webServer.handleClient();
      // esp_task_wdt_reset(); // Removed
      delay(10); // Yield
    }
  }
}
