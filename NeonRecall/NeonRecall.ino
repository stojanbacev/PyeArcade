#include <Adafruit_NeoPixel.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <esp_task_wdt.h> // Include WDT

// --- CONFIGURATION ---
#define LED_PIN    25   
#define NUM_JEWELS 4    
#define LEDS_PER_JEWEL 8 
#define LED_COUNT  (NUM_JEWELS * LEDS_PER_JEWEL) 

// Game Settings
String boardId = "neon_recall_1";
String apiUrlBase = "https://www.pyeclub.com/pyearcade/games/NeonRecall/api.php?board=";
String fullApiUrl = ""; // Populated in setup

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

// Animation State Variables
unsigned long lastAnimationUpdate = 0;
int animStep = 0;
int animSubStep = 0;
int animMode = 0; // For attract mode switching
unsigned long animTimer = 0; // Generic timer
bool animActive = false;
int localPattern[MAX_PATTERN_LEN];
int localPatternLen = 0;

// Task Synchronization
SemaphoreHandle_t stateMutex;
TaskHandle_t NetworkTaskHandle;

// Colors
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

// Forward declarations for Network Manager
void setupNetwork(String &boardId, void (*onConnecting)(), void (*onSetupMode)());

// Forward declarations
void runStartingAnimation(unsigned long now);
void runSuccessAnimation(unsigned long now);
void runFailAnimation(unsigned long now);
void runWaitingAnimation(unsigned long now);
void runPatternTick(unsigned long now);
void runSnakeTick(unsigned long now, int speedDelay);
void runPopcornTick(unsigned long now, int speedDelay);
void runBreathingTick(unsigned long now, int speedDelay);

// --- CALLBACKS FOR NETWORK MANAGER ---
void onConnectingCallback() {
  // Pulse Blue/White while connecting
  static int b = 0;
  static int dir = 5;
  b += dir;
  if (b >= 255 || b <= 0) dir = -dir;
  if (b < 0) b = 0;
  if (b > 255) b = 255;
  
  for(int i=0; i<LED_COUNT; i++) {
     strip.setPixelColor(i, strip.Color(b, b, b)); // Pulse White
  }
  strip.show();
  delay(10);
}

void onSetupModeCallback() {
  // Keep all LEDs ON (dimmed)
  strip.setBrightness(20); // Low brightness for AP mode to save power
  for(int i=0; i<LED_COUNT; i++) {
     strip.setPixelColor(i, strip.Color(255, 255, 255));
  }
  strip.show();
}

// --- NETWORK TASK ---
void networkTask(void * pvParameters) {
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.setReuse(true); // Keep connection open if possible

  for(;;) {
    if (WiFi.status() == WL_CONNECTED) {
      http.begin(client, fullApiUrl.c_str());
      
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
  delay(100);
  
  /* REMOVED CUSTOM WDT CODE TO RULE OUT INIT ISSUES
  // Configure Watchdog
  // If already initialized, we need to deinit first to change config
  if (esp_task_wdt_status(NULL) == ESP_OK) {
      esp_task_wdt_deinit();
  }
  
  esp_task_wdt_config_t wdt_config = {
      .timeout_ms = 60000,
      .idle_core_mask = (1 << 0) | (1 << 1),    
      .trigger_panic = true
  };
  esp_task_wdt_init(&wdt_config);
  esp_task_wdt_add(NULL); 
  */
  
  stateMutex = xSemaphoreCreateMutex();
  
  strip.begin();           
  strip.show();            
  strip.setBrightness(255); // MAX BRIGHTNESS for daylight visibility 

  // Initialize Colors
  colorWhite  = strip.Color(255, 255, 255);
  colorOff    = strip.Color(0, 0, 0);

  // Construct API URL
  fullApiUrl = apiUrlBase + boardId;
  Serial.print("API URL: ");
  Serial.println(fullApiUrl);

  // Setup Network (Credentials, Connect, or AP Mode)
  // This function will block for 30s trying to connect, or enter an infinite loop if AP mode is triggered.
  setupNetwork(boardId, onConnectingCallback, onSetupModeCallback);

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi Connected! Starting Game...");
    animationFlashColor(colorWhite, 3, 100);
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

// --- ANIMATIONS & LOGIC ---

// Helper to clear state when switching animations
void resetAnimations() {
  lastAnimationUpdate = 0;
  animStep = 0;
  animSubStep = 0;
  animTimer = 0;
  animActive = true;
  strip.clear();
  strip.show();
}

// Internal state tracking for loop
String lastProcessedState = "";
long long lastProcessedTimestamp = -1;

void loop() {
  // 1. Process Network State Updates
  bool stateChanged = false;
  
  if (xSemaphoreTake(stateMutex, 0)) { // Non-blocking check
     if (currentTimestamp > lastProcessedTimestamp) {
        lastProcessedTimestamp = currentTimestamp;
        
        if (currentState != lastProcessedState || patternPending) {
            lastProcessedState = currentState;
            stateChanged = true;
            
            if (patternPending) {
               // Copy pattern for playback
               localPatternLen = sharedPatternLen;
               for(int i=0; i<localPatternLen; i++) localPattern[i] = sharedPattern[i];
               patternPending = false;
               
               // If we received a pattern, we treat it as a special state "showing_pattern"
               // even if the server state is technically "idle" or something else.
               // But usually the server sets state to "showing_pattern".
            }
        }
     }
     xSemaphoreGive(stateMutex);
  }

  // 2. Handle State Transitions
  if (stateChanged) {
      resetAnimations();
      Serial.print("State Changed to: ");
      Serial.println(lastProcessedState);
  }

  // 3. Run Animation Logic based on current state
  unsigned long now = millis();
  
  if (lastProcessedState == "idle") {
     runAttractMode(now);
  } else if (lastProcessedState == "starting" || lastProcessedState == "game_start") {
     runStartingAnimation(now);
  } else if (lastProcessedState == "success") {
     runSuccessAnimation(now);
  } else if (lastProcessedState == "fail") {
     runFailAnimation(now);
  } else if (lastProcessedState == "waiting_for_player") {
     runWaitingAnimation(now);
  } else if (lastProcessedState == "showing_pattern") {
     runPatternTick(now);
  } else {
     // Default fallback
     runAttractMode(now);
  }
}

// --- NON-BLOCKING ANIMATION FUNCTIONS ---

void runAttractMode(unsigned long now) {
  // Switch attract mode every 10 seconds
  if (now - animTimer > 10000) {
     animTimer = now;
     animMode++;
     if (animMode > 2) animMode = 0;
     
     // Reset step for the new animation
     animStep = 0; 
     strip.clear();
     strip.show();
  }

  if (animMode == 0) {
    runSnakeTick(now, 30); 
  } else if (animMode == 1) {
    runPopcornTick(now, 50); 
  } else {
    runBreathingTick(now, 15); 
  }
}

void runWaitingAnimation(unsigned long now) {
  // Breathing effect (already non-blocking style logic)
  static int brightness = 5;
  static int fadeDir = 1; 
  
  if (now - lastAnimationUpdate > 10) { // faster update for smooth breathe
    lastAnimationUpdate = now;
    
    brightness += fadeDir;
    if (brightness >= 255) {
      brightness = 255;
      fadeDir = -1;
    } else if (brightness <= 5) {
      brightness = 5;
      fadeDir = 1;
    }
    setAll(strip.Color(brightness, brightness, brightness));
  }
}

void runStartingAnimation(unsigned long now) {
  // Flash White 3 times
  // animStep: 0=On, 1=Off, 2=On, 3=Off, 4=On, 5=Off, 6=Done
  if (!animActive) return;

  if (now - lastAnimationUpdate > 200) {
     lastAnimationUpdate = now;
     
     if (animStep >= 6) {
        animActive = false; // Done
        return;
     }

     if (animStep % 2 == 0) {
        setAll(colorWhite);
     } else {
        clearAll();
     }
     animStep++;
  }
}

void runSuccessAnimation(unsigned long now) {
  // Flash White 5 times fast
  if (!animActive) return;
  
  if (now - lastAnimationUpdate > 100) {
     lastAnimationUpdate = now;
     
     if (animStep >= 10) { // 5 flashes = 10 steps (on/off)
        animActive = false;
        return;
     }

     if (animStep % 2 == 0) {
        setAll(colorWhite);
     } else {
        clearAll();
     }
     animStep++;
  }
}

void runFailAnimation(unsigned long now) {
  // Fade out Red (or White, per user instruction only white allowed)
  // Logic: Start bright, fade to 0
  if (!animActive) {
     // Initialize fail state
     animStep = 255; 
     animActive = true; 
  }

  if (now - lastAnimationUpdate > 15) {
    lastAnimationUpdate = now;
    
    if (animStep <= 0) {
       clearAll();
       animActive = false; // Done
       return;
    }
    
    for(int i=0; i<LED_COUNT; i++) {
       strip.setPixelColor(i, strip.Color(animStep, animStep, animStep));
    }
    strip.show();
    animStep -= 5; // Decrease brightness
  }
}

void runPatternTick(unsigned long now) {
  // Play sequence: Light Jewel -> Wait -> Clear -> Wait -> Next Jewel
  // animStep: Index in pattern
  // animSubStep: 
  //   0 = Initial Delay (Start of pattern only)
  //   1 = Light ON
  //   2 = Wait ON
  //   3 = Light OFF
  //   4 = Wait OFF
  
  if (animStep >= localPatternLen) {
     // Pattern done
     return; 
  }

  // Special case: Initial delay before the FIRST jewel
  if (animStep == 0 && animSubStep == 0) {
      clearAll();
      lastAnimationUpdate = now;
      animSubStep = 100; // Special state for initial delay
  }
  
  if (animSubStep == 100) {
      // Wait 2 seconds with everything OFF
      if (now - lastAnimationUpdate > 2000) {
          animSubStep = 1; // Start the first jewel
      }
      return;
  }

  // Normal Pattern Logic (shifted index to match new enum-like structure)
  if (animSubStep == 0) {
      // This state is only hit for subsequent jewels (index > 0)
      // Immediately move to Light ON
      animSubStep = 1;
  }
  
  if (animSubStep == 1) {
     // Turn ON Jewel
     int jewelIndex = localPattern[animStep];
     uint32_t color = getJewelColor(jewelIndex); // Will be white
     lightJewel(jewelIndex, color);
     lastAnimationUpdate = now;
     animSubStep = 2; 
  } 
  else if (animSubStep == 2) {
     // Wait 500ms with Light ON
     if (now - lastAnimationUpdate > 500) {
        animSubStep = 3;
     }
  }
  else if (animSubStep == 3) {
     // Turn OFF
     clearAll();
     lastAnimationUpdate = now;
     animSubStep = 4;
  }
  else if (animSubStep == 4) {
     // Wait 250ms with Light OFF
     if (now - lastAnimationUpdate > 250) {
        animStep++; // Next jewel
        animSubStep = 1; // Loop back to Light ON (skip initial delay)
     }
  }
}

void runSnakeTick(unsigned long now, int speedDelay) {
   if (now - lastAnimationUpdate > speedDelay) {
      lastAnimationUpdate = now;
      
      strip.clear();
      strip.setPixelColor(animStep, colorWhite);
      strip.show();
      
      animStep++;
      if (animStep >= LED_COUNT) {
         animStep = 0;
      }
   }
}

void runPopcornTick(unsigned long now, int speedDelay) {
   // animStep not really needed for random, but we use timer
   if (now - lastAnimationUpdate > speedDelay) {
      lastAnimationUpdate = now;
      
      // Clear previous (optional, but popcorn usually clears)
      // If we want single sparkles, we can clear only the last one, 
      // but simpler to clear all for this effect
      strip.clear(); 
      
      int randomPixel = random(LED_COUNT);
      strip.setPixelColor(randomPixel, colorWhite);
      strip.show();
      
      // Note: Original popcorn had a delay then clear. 
      // Ideally we'd have a state for "show" and "hide", but fast flashing works too.
   }
}

void runBreathingTick(unsigned long now, int speedDelay) {
  // animStep: brightness 0->255->0
  // animSubStep: direction (5 or -5)
  
  if (animSubStep == 0) { 
     animStep = 0; 
     animSubStep = 5; // increasing by 5
  }

  if (now - lastAnimationUpdate > speedDelay) {
     lastAnimationUpdate = now;
     
     strip.setBrightness(animStep);
     setAll(colorWhite);
     
     animStep += animSubStep;
     
     if (animStep >= 255) {
        animStep = 255;
        animSubStep = -5;
     } else if (animStep <= 0) {
        animStep = 0;
        animSubStep = 5;
     }
  }
}

uint32_t getJewelColor(int jewelIndex) {
  return colorWhite;
}

void lightJewel(int index, uint32_t color) {
  strip.clear(); 
  // Map index to physical LEDs
  // Note: Original logic: physicalIndex = (NUM_JEWELS - 1) - index;
  // If we assume valid index 0-3:
  if (index < 0 || index >= NUM_JEWELS) return;
  
  int physicalIndex = (NUM_JEWELS - 1) - index;
  int startLed = physicalIndex * LEDS_PER_JEWEL;
  
  for(int i = 0; i < LEDS_PER_JEWEL; i++) {
    strip.setPixelColor(startLed + i, color);
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

// Keep blocking helper for setup() only
void animationPulseColor(uint32_t color, int wait) {
  setAll(color);
  delay(wait * 10);
  clearAll();
  delay(wait * 10);
}

void animationFlashColor(uint32_t color, int count, int wait) {
  for(int i=0; i<count; i++) {
    setAll(color);
    delay(wait);
    clearAll();
    delay(wait);
  }
}
