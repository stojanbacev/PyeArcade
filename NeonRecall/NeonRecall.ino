#include <Adafruit_NeoPixel.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// --- CONFIGURATION ---
#define LED_PIN    25   
#define NUM_JEWELS 4    
#define LEDS_PER_JEWEL 8 
#define LED_COUNT  (NUM_JEWELS * LEDS_PER_JEWEL) 

// Network Settings
const char* ssid = "Bacev";
const char* password = "negorci03";
const char* apiUrl = "https://www.pyeclub.com/pyearcade/games/NeonRecall/api.php?board=neon_recall_1";

// Create the pixel object
Adafruit_NeoPixel strip(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);

// Global State (Protected by Mutex)
String currentState = "idle";
long long currentTimestamp = 0;
// We'll use a temporary buffer for pattern to transfer between tasks
#define MAX_PATTERN_LEN 32
int sharedPattern[MAX_PATTERN_LEN];
int sharedPatternLen = 0;
bool patternPending = false;

// Task Synchronization
SemaphoreHandle_t stateMutex;
TaskHandle_t NetworkTaskHandle;

// Colors
uint32_t colorYellow;
uint32_t colorGreen;
uint32_t colorPink;
uint32_t colorBlue;
uint32_t colorWhite;
uint32_t colorOff;

// Function Prototypes
void setAll(uint32_t color);
void clearAll();
void lightJewel(int index, uint32_t color);
void animationBreathing(int cycles, int speedDelay);
void animationFlashColor(uint32_t color, int count, int wait);
void animationPulseColor(uint32_t color, int wait);
void animationStarting();
void animationSuccess();
void animationFail();
void animationWaiting();
void playPattern(int* pattern, int length);
uint32_t getJewelColor(int jewelIndex);
void runAttractMode(unsigned long now);

// Forward declarations
void animationSnake(int speedDelay);
void animationPopcorn(int flashes, int speedDelay);

// --- NETWORK TASK ---
void networkTask(void * pvParameters) {
  for(;;) {
    if (WiFi.status() == WL_CONNECTED) {
      WiFiClientSecure client;
      client.setInsecure(); 
      HTTPClient http;
      http.begin(client, apiUrl);
      
      int httpResponseCode = http.GET();
      if (httpResponseCode > 0) {
        String payload = http.getString();
        DynamicJsonDocument doc(2048);
        DeserializationError error = deserializeJson(doc, payload);

        if (!error) {
          String newState = doc["state"].as<String>();
          long long newTimestamp = doc["timestamp"].as<long long>();
          
          if (xSemaphoreTake(stateMutex, portMAX_DELAY)) {
            if (newTimestamp > currentTimestamp) {
              currentTimestamp = newTimestamp;
              currentState = newState;
              
              if (newState == "showing_pattern") {
                 JsonArray arr = doc["pattern"];
                 sharedPatternLen = 0;
                 for(JsonVariant v : arr) {
                    if(sharedPatternLen < MAX_PATTERN_LEN) {
                      sharedPattern[sharedPatternLen++] = v.as<int>();
                    }
                 }
                 patternPending = true;
              }
              
              if (currentState == "game_end") {
                  currentState = "idle";
              }

              Serial.print("New State: ");
              Serial.println(currentState);
            }
            xSemaphoreGive(stateMutex);
          }
        }
      }
      http.end();
    }
    vTaskDelay(500 / portTICK_PERIOD_MS);
  }
}

void setup() {
  Serial.begin(115200);
  
  stateMutex = xSemaphoreCreateMutex();
  
  strip.begin();           
  strip.show();            
  strip.setBrightness(100); 

  // Initialize Colors
  colorYellow = strip.Color(253, 224, 71);
  colorGreen  = strip.Color(74, 222, 128);
  colorPink   = strip.Color(244, 114, 182);
  colorBlue   = strip.Color(34, 211, 238);
  colorWhite  = strip.Color(255, 255, 255);
  colorOff    = strip.Color(0, 0, 0);

  // Connect to WiFi
  WiFi.mode(WIFI_STA);
  Serial.print("Connecting to WiFi SSID: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    animationPulseColor(colorBlue, 10);
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Connected!");
    animationFlashColor(colorWhite, 3, 100);
  } else {
    Serial.println("\nFailed to connect.");
    animationFlashColor(strip.Color(255, 0, 0), 5, 200);
  }

  // Start Network Task
  xTaskCreatePinnedToCore(
    networkTask,
    "NetworkTask",
    10000,
    NULL,
    1,
    &NetworkTaskHandle,
    0
  );
}

// Internal state tracking for loop
String lastProcessedState = "";
long long lastProcessedTimestamp = -1;

void loop() {
  String localState = "idle";
  bool isNewState = false;
  bool doPlayPattern = false;
  int localPattern[MAX_PATTERN_LEN];
  int localPatternLen = 0;

  if (xSemaphoreTake(stateMutex, 10)) {
     // Check if we have a new command from server
     if (currentTimestamp > lastProcessedTimestamp) {
        lastProcessedTimestamp = currentTimestamp;
        
        // Only consider it a "New State" transition if the state string changed
        // OR if there is a pattern pending (even if state didn't change)
        if (currentState != lastProcessedState || patternPending) {
            lastProcessedState = currentState;
            isNewState = true;
            
            if (patternPending) {
               doPlayPattern = true;
               localPatternLen = sharedPatternLen;
               for(int i=0; i<localPatternLen; i++) localPattern[i] = sharedPattern[i];
               patternPending = false;
            }
        }
     }
     
     // Always update localState for current animation logic
     localState = currentState;
     
     xSemaphoreGive(stateMutex);
  }

  if (isNewState) {
      strip.clear();
      strip.show();
      
      if (localState == "starting") {
         animationStarting();
      } else if (localState == "success") {
         animationSuccess();
      } else if (localState == "fail") {
         animationFail();
      }
      
      if (doPlayPattern) {
         playPattern(localPattern, localPatternLen);
      }
  }

  unsigned long now = millis();
  if (localState == "idle") {
    runAttractMode(now);
  } else if (localState == "waiting_for_player") {
     animationWaiting();
  }
}

// --- ANIMATIONS ---

void runAttractMode(unsigned long now) {
  static unsigned long lastAttractChange = 0;
  static int currentMode = 0;
  
  if (now - lastAttractChange > 10000) { // Change every 10 seconds
     lastAttractChange = now;
     currentMode++;
     if (currentMode > 2) currentMode = 0;
     strip.clear();
     strip.show();
  }

  if (currentMode == 0) {
    animationSnake(30); 
  } else if (currentMode == 1) {
    animationPopcorn(5, 50); 
  } else if (currentMode == 2) {
    animationBreathing(1, 15); 
  }
}

// Non-blocking Breathe: 1 sec up, 1 sec down
void animationWaiting() {
  static int brightness = 5;
  static int fadeDir = 1; 
  static unsigned long lastStep = 0;
  
  unsigned long now = millis();
  
  if (now - lastStep > 4) {
    lastStep = now;
    
    brightness += fadeDir;
    
    if (brightness >= 255) {
      brightness = 255;
      fadeDir = -1;
    } else if (brightness <= 5) {
      brightness = 5;
      fadeDir = 1;
    }
    
    setAll(strip.Color(brightness, brightness, brightness));
    strip.show();
  }
}

uint32_t getJewelColor(int jewelIndex) {
  switch (jewelIndex) {
    case 0: return colorYellow;
    case 1: return colorGreen;
    case 2: return colorPink;
    case 3: return colorBlue;
    default: return colorWhite;
  }
}

void lightJewel(int index, uint32_t color) {
  strip.clear(); 
  int physicalIndex = (NUM_JEWELS - 1) - index;
  int startLed = physicalIndex * LEDS_PER_JEWEL;
  int endLed = startLed + LEDS_PER_JEWEL;
  for(int i = startLed; i < endLed; i++) {
    strip.setPixelColor(i, strip.Color(255, 255, 255));
  }
  strip.show();
}

void clearAll() {
  strip.clear();
  strip.show();
}

void setAll(uint32_t color) {
  for(int i = 0; i < LED_COUNT; i++) {
    strip.setPixelColor(i, color);
  }
  strip.show();
}

void playPattern(int* pattern, int length) {
  clearAll();
  delay(500); 
  
  for(int i=0; i<length; i++) {
    int jewelIndex = pattern[i];
    uint32_t color = getJewelColor(jewelIndex);
    
    lightJewel(jewelIndex, color);
    delay(500); 
    
    clearAll();
    delay(250); 
  }
}

void animationStarting() {
  animationFlashColor(colorWhite, 3, 200);
}

void animationSuccess() {
  animationFlashColor(colorWhite, 5, 100);
}

void animationFail() {
  for(int b = 255; b >= 0; b-=2) { 
    for(int i=0; i<LED_COUNT; i++) {
       strip.setPixelColor(i, strip.Color(b, b, b));
    }
    strip.show();
    delay(15); 
  }
  clearAll();
}

void animationFlashColor(uint32_t color, int count, int wait) {
  for(int i=0; i<count; i++) {
    setAll(color);
    delay(wait);
    clearAll();
    delay(wait);
  }
}

void animationPulseColor(uint32_t color, int wait) {
  setAll(color);
  delay(wait * 10);
  clearAll();
  delay(wait * 10);
}

void animationSnake(int speedDelay) {
  for(int i = 0; i < LED_COUNT; i++) {
    strip.clear(); 
    strip.setPixelColor(i, colorWhite);
    strip.show();
    delay(speedDelay);
  }
}

void animationPopcorn(int flashes, int speedDelay) {
  strip.clear();
  strip.show();
  
  for(int i = 0; i < flashes; i++) {
    int randomPixel = random(LED_COUNT);
    strip.setPixelColor(randomPixel, colorWhite);
    strip.show();
    delay(speedDelay);
    strip.setPixelColor(randomPixel, 0); 
  }
}

void animationBreathing(int cycles, int speedDelay) {
  int originalBrightness = 100; 
  for(int c = 0; c < cycles; c++) {
    for(int k = 0; k < originalBrightness; k+=5) { 
      strip.setBrightness(k);
      setAll(colorWhite); 
      delay(speedDelay);
    }
    for(int k = originalBrightness; k >= 0; k-=5) {
      strip.setBrightness(k);
      setAll(colorWhite);
      delay(speedDelay);
    }
  }
  strip.setBrightness(originalBrightness); 
}