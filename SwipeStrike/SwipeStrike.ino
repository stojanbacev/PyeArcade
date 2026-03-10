#include <Adafruit_NeoPixel.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// --- CONFIGURATION ---
// Adjust these for the Swipe Strike physical board
#define LED_PIN    25   
#define NUM_NODES  9    // 3x3 grid
#define LEDS_PER_NODE 8 // CHANGE TO 8 IF YOU ARE USING THE SAME JEWELS AS NEON RECALL!
#define LED_COUNT  (NUM_NODES * LEDS_PER_NODE) 

// Game Settings
String boardId = "swipe_strike_1"; // Default ID, will be overwritten by NetworkManager if configured
String apiUrlBase = "https://www.pyeclub.com/pyearcade/api/api.php?board=";
String fullApiUrl = "";

// Create the pixel object
// Note: If you have RGBW LEDs (SK6812), change NEO_GRB to NEO_GRBW
Adafruit_NeoPixel strip(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);

// Hardware to Logical Mapping
// The physical LEDs are wired in a snake pattern starting from bottom-left:
// 7 8 9 (Physical 6, 7, 8)
// 6 5 4 (Physical 5, 4, 3)
// 1 2 3 (Physical 0, 1, 2)
//
// We want to address them logically as a standard grid (0 to 8):
// 0 1 2 (Top Row)
// 3 4 5 (Middle Row)
// 6 7 8 (Bottom Row)
const int nodeMap[9] = {
  6, 7, 8, // Logical 0,1,2 -> Physical 6,7,8 (Top row)
  5, 4, 3, // Logical 3,4,5 -> Physical 5,4,3 (Middle row, reversed)
  0, 1, 2  // Logical 6,7,8 -> Physical 0,1,2 (Bottom row)
};

// Global State
String currentState = "idle";
long long currentTimestamp = 0;

// Task Synchronization
SemaphoreHandle_t stateMutex;
TaskHandle_t NetworkTaskHandle;

// Colors
uint32_t colorOff = strip.Color(0, 0, 0);
uint32_t colorNodeBase = strip.Color(0, 50, 50); // Dim cyan
uint32_t colorNodeActive = strip.Color(0, 255, 255); // Bright cyan
uint32_t colorNodePath = strip.Color(255, 0, 128); // Pink

// Game State Variables
#define MAX_PATTERN_LEN 9
int currentPattern[MAX_PATTERN_LEN];
int currentPatternLen = 0;
int currentLevel = 1;
bool isShowingPattern = false;

// Animation State Variables
unsigned long lastAnimationUpdate = 0;
int animStep = 0;
int animSubStep = 0;
int animMode = 0; // 0=Light Up, 1=Hold, 2=Fade Down, 3=Wait
unsigned long animTimer = 0; // Generic timer
bool isGeneratingAttractPattern = true; // Flag for idle mode

// Per-node brightness for smooth dimming
int nodeBrightness[9] = {0, 0, 0, 0, 0, 0, 0, 0, 0};
uint32_t nodeColors[9] = {0, 0, 0, 0, 0, 0, 0, 0, 0};

// Function Prototypes
void setAll(uint32_t color);
void clearAll();
void lightNode(int logicalIndex, uint32_t color);
void updateLEDs();
void generatePattern(int length);
void runAttractMode(unsigned long now);
void runStartingAnimation(unsigned long now);
void runShowPattern(unsigned long now);
void runWaitingAnimation(unsigned long now);
void runSuccessAnimation(unsigned long now);
void runFailAnimation(unsigned long now);

// --- LED HELPERS ---
void setAll(uint32_t color) {
  for(int i=0; i<LED_COUNT; i++) strip.setPixelColor(i, color);
}

void clearAll() {
  strip.clear();
  for(int i=0; i<9; i++) {
    nodeBrightness[i] = 0;
    nodeColors[i] = 0;
  }
}

void lightNode(int logicalIndex, uint32_t color) {
  if (logicalIndex < 0 || logicalIndex >= NUM_NODES) return;
  nodeColors[logicalIndex] = color;
  nodeBrightness[logicalIndex] = 255;
}

// Draw based on current brightness/colors
void updateLEDs() {
  for (int i = 0; i < NUM_NODES; i++) {
    int physicalNode = nodeMap[i];
    int startLed = physicalNode * LEDS_PER_NODE;
    
    // Scale color by brightness carefully
    uint32_t c = nodeColors[i];
    uint8_t r = (uint8_t)(((c >> 16) & 0xFF) * nodeBrightness[i] / 255);
    uint8_t g = (uint8_t)(((c >> 8) & 0xFF) * nodeBrightness[i] / 255);
    uint8_t b = (uint8_t)((c & 0xFF) * nodeBrightness[i] / 255);
    
    uint32_t finalColor = strip.Color(r, g, b);
    for (int j = 0; j < LEDS_PER_NODE; j++) {
      if (startLed + j < LED_COUNT) {
        strip.setPixelColor(startLed + j, finalColor);
      }
    }
  }
  strip.show();
}

// --- GAME LOGIC ---
// Helper to determine if a move between two nodes is valid in a continuous swipe.
bool isValidSwipeMove(int start, int end, bool used[]) {
  if (start == end) return false;

  int startX = start % 3;
  int startY = start / 3;
  int endX = end % 3;
  int endY = end / 3;

  int dx = abs(endX - startX);
  int dy = abs(endY - startY);

  if (dx <= 1 && dy <= 1) return true;
  return false;
}

void generatePattern(int length) {
  if (length > MAX_PATTERN_LEN) length = MAX_PATTERN_LEN;
  
  bool used[NUM_NODES] = {false};
  int currentPos = random(NUM_NODES);
  currentPattern[0] = currentPos;
  used[currentPos] = true;
  
  int actualLength = 1;
  
  while (actualLength < length) {
    int validMoves[NUM_NODES];
    int validCount = 0;
    
    for (int i = 0; i < NUM_NODES; i++) {
      if (!used[i]) { 
        if (isValidSwipeMove(currentPos, i, used)) {
          validMoves[validCount++] = i;
        }
      }
    }
    
    if (validCount == 0) break;
    
    int nextPos = validMoves[random(validCount)];
    currentPattern[actualLength] = nextPos;
    used[nextPos] = true;
    currentPos = nextPos;
    actualLength++;
  }
  
  currentPatternLen = actualLength;
}

// --- ANIMATION FUNCTIONS ---
void runAttractMode(unsigned long now) {
  int fadeDelay = 300;   // Wait time before allowing the next node to fade in/out
  int fadeRate = 15;     // Smoothness speed

  if (now - lastAnimationUpdate < 30) return;
  lastAnimationUpdate = now;

  if (isGeneratingAttractPattern) {
      generatePattern(random(4, 9));
      isGeneratingAttractPattern = false;
      animStep = 0;
      animSubStep = 0; 
      animMode = 0; 
      animTimer = now;
      clearAll();
  }

  // 1. Process Fading IN for nodes up to animStep
  if (animMode == 0) {
      for (int i = 0; i <= animStep && i < currentPatternLen; i++) {
          int node = currentPattern[i];
          
          // Smooth Cold (Blue) to Warm (Red) Hue Transition
          long startHue = 45000; // Deep Blue
          long endHue = 0;       // Bright Red
          long hue = (currentPatternLen > 1) ? startHue - (i * (startHue - endHue) / (currentPatternLen - 1)) : startHue;
          
          nodeColors[node] = strip.ColorHSV(hue, 255, 255);
          
          if (nodeBrightness[node] < 255) {
              nodeBrightness[node] = (nodeBrightness[node] + fadeRate <= 255) ? nodeBrightness[node] + fadeRate : 255;
          }
      }
  }

  // 2. Process Dimming OUT for nodes up to animSubStep
  if (animMode == 2 || animMode == 3) {
      for (int i = 0; i <= animSubStep && i < currentPatternLen; i++) {
          int node = currentPattern[i];
          if (nodeBrightness[node] > 0) {
              nodeBrightness[node] = (nodeBrightness[node] > fadeRate) ? nodeBrightness[node] - fadeRate : 0;
          }
      }
  }

  // 3. Phase 0: Sequential Fade Up
  if (animMode == 0) {
      if (animStep < currentPatternLen - 1) {
          if (now - animTimer > fadeDelay) {
              animStep++;
              animTimer = now;
          }
      } else {
          // Wait for the very last node to hit full brightness before holding
          int lastNode = currentPattern[currentPatternLen - 1];
          if (nodeBrightness[lastNode] >= 255) {
              animMode = 1; 
              animTimer = now;
          }
      }
  } 
  // 4. Phase 1: Hold
  else if (animMode == 1) {
      if (now - animTimer > 1000) {
          animMode = 2; 
          animSubStep = 0; 
          animTimer = now;
      }
  } 
  // 5. Phase 2: Staggered Dim Down from the tail
  else if (animMode == 2) {
      if (now - animTimer > fadeDelay) {
          animSubStep++; 
          animTimer = now;

          if (animSubStep >= currentPatternLen) {
              animMode = 3; 
          }
      }
  } 
  // 6. Phase 3: Wait completely black
  else if (animMode == 3) {
      bool stillLit = false;
      for (int i=0; i<9; i++) if (nodeBrightness[i] > 0) stillLit = true;
      if (!stillLit && now - animTimer > 1000) { 
          isGeneratingAttractPattern = true; 
      }
  }
  
  updateLEDs();
}

void runStartingAnimation(unsigned long now) {
  if (now - lastAnimationUpdate < 250) return;
  lastAnimationUpdate = now;

  if (animStep < 6) {
    if (animStep % 2 == 0) setAll(strip.Color(0, 255, 0)); // Green flash
    else clearAll(); // Dark
    strip.show();
    animStep++;
  } else {
    // Wait for React to transition state
    clearAll();
    strip.show();
  }
}

void runShowPattern(unsigned long now) {
  int fadeDelay = 400;   // Slower cascade speed for players to memorize
  int fadeRate = 12;     // Slower, smoother dimming
  
  if (now - lastAnimationUpdate < 30) return;
  lastAnimationUpdate = now;

  // 1. Process Fading IN ONLY for nodes up to animStep
  if (animMode == 0) {
      for (int i = 0; i <= animStep && i < currentPatternLen; i++) {
          int node = currentPattern[i];
          
          // Smooth Cold (Blue) to Warm (Red) Hue Transition
          long startHue = 45000; // Deep Blue
          long endHue = 0;       // Bright Red
          long hue = (currentPatternLen > 1) ? startHue - (i * (startHue - endHue) / (currentPatternLen - 1)) : startHue;
          
          nodeColors[node] = strip.ColorHSV(hue, 255, 255); 
          
          if (nodeBrightness[node] < 255) {
              nodeBrightness[node] = (nodeBrightness[node] + fadeRate <= 255) ? nodeBrightness[node] + fadeRate : 255;
          }
      }
  }

  // 2. Process Dimming OUT ONLY for nodes up to animSubStep
  if (animMode == 2 || animMode == 3) {
      for (int i = 0; i <= animSubStep && i < currentPatternLen; i++) {
          int node = currentPattern[i];
          if (nodeBrightness[node] > 0) {
              nodeBrightness[node] = (nodeBrightness[node] > fadeRate) ? nodeBrightness[node] - fadeRate : 0;
          }
      }
  }
  
  // 3. Phase 0: Sequential Fade Up (Pink)
  if (animMode == 0) {
      if (currentPatternLen > 0) {
          if (animStep < currentPatternLen - 1) {
              if (now - animTimer > fadeDelay) {
                  animStep++;
                  animTimer = now;
              }
          } else {
              int lastNode = currentPattern[currentPatternLen - 1];
              if (nodeBrightness[lastNode] >= 255) {
                  animMode = 1; 
                  animTimer = now;
              }
          }
      } else {
          animMode = 3; // Skip if no pattern
      }
  } 
  // 4. Phase 1: Hold all nodes on so player can memorize
  else if (animMode == 1) {
      if (now - animTimer > 1000) { // Hold for 1 second
          animMode = 2; 
          animSubStep = 0;
          animTimer = now;
      }
  } 
  // 5. Phase 2: Staggered Dim Down from the tail
  else if (animMode == 2) {
      if (now - animTimer > fadeDelay) {
          animSubStep++;
          animTimer = now;

          if (animSubStep >= currentPatternLen) {
              animMode = 3;
          }
      }
  } 
  // 6. Phase 3: Wait completely black, then hand control to phone
  else if (animMode == 3) {
      bool stillLit = false;
      for (int i=0; i<9; i++) if (nodeBrightness[i] > 0) stillLit = true;
      if (!stillLit && now - animTimer > 500) {
          // DO NOT FORCE STATE LOCALLY
          animStep = 0;
          animSubStep = 0;
          animMode = 0;
      }
  }

  updateLEDs();
}

void runWaitingAnimation(unsigned long now) {
  if (now - lastAnimationUpdate < 50) return;
  lastAnimationUpdate = now;

  for (int i=0; i<NUM_NODES; i++) {
    lightNode(i, colorNodeBase);
  }
  strip.show();
}

void runSuccessAnimation(unsigned long now) {
  if (now - lastAnimationUpdate < 150) return;
  lastAnimationUpdate = now;

  if (animStep < 6) {
    if (animStep % 2 == 0) setAll(strip.Color(0, 255, 0));
    else clearAll();
    strip.show();
    animStep++;
  } else {
    // Wait for React to transition state
    clearAll();
    strip.show();
  }
}

void runFailAnimation(unsigned long now) {
  if (now - lastAnimationUpdate < 150) return;
  lastAnimationUpdate = now;

  if (animStep < 8) {
    if (animStep % 2 == 0) setAll(strip.Color(255, 0, 0));
    else clearAll();
    strip.show();
    animStep++;
  } else {
    // DO NOT FORCE STATE LOCALLY
    animStep = 0;
  }
}

// --- CALLBACKS FOR NETWORK MANAGER ---
void onConnectingCallback() {
  static int b = 0;
  static int dir = 5;
  b += dir;
  if (b >= 255 || b <= 0) dir = -dir;
  if (b < 0) b = 0;
  if (b > 255) b = 255;
  
  for(int i=0; i<LED_COUNT; i++) {
     strip.setPixelColor(i, strip.Color(0, b, b));
  }
  strip.show();
  delay(15); 
}

void onSetupModeCallback() {
  strip.setBrightness(50); 
  for(int i=0; i<LED_COUNT; i++) {
     strip.setPixelColor(i, strip.Color(255, 255, 255));
  }
  strip.show();
}

// --- NETWORK TASK ---
void networkTask(void * pvParameters) {
  setupNetwork(boardId, onConnectingCallback, onSetupModeCallback);
  
  fullApiUrl = apiUrlBase + boardId;
  Serial.print("API URL: ");
  Serial.println(fullApiUrl);

  WiFiClientSecure client;
  client.setInsecure(); 

  HTTPClient http;
  
  String lastSentState = "";
  long long lastSentTimestamp = -1;

  while(true) {
    if(WiFi.status() == WL_CONNECTED) {
      
      // PURE POLLING LIKE NEON RECALL
      http.begin(client, fullApiUrl);
      http.setReuse(true); 
      int httpResponseCode = http.GET();
      
      if (httpResponseCode > 0) {
        String payload = http.getString();
        StaticJsonDocument<1024> responseDoc; 
        DeserializationError error = deserializeJson(responseDoc, payload);

        if (!error) {
          String newState = responseDoc["state"].as<String>();
          long long newTimestamp = responseDoc["timestamp"].as<long long>();
          
          if (xSemaphoreTake(stateMutex, portMAX_DELAY)) {
            if (newTimestamp > currentTimestamp) {
              currentTimestamp = newTimestamp;
              currentState = newState;
              
              if (currentState == "game_end") {
                  currentState = "idle";
              }
              
              if (newState == "showing_pattern" || newState == "waiting_for_player") {
                 if (responseDoc.containsKey("pattern")) {
                     JsonArray arr = responseDoc["pattern"].as<JsonArray>();
                     currentPatternLen = 0;
                     for(JsonVariant v : arr) {
                        if(currentPatternLen < MAX_PATTERN_LEN) {
                          currentPattern[currentPatternLen++] = v.as<int>();
                        }
                     }
                 }
                 Serial.print("Received pattern length: ");
                 Serial.println(currentPatternLen);
              }

              Serial.print("New State: ");
              Serial.println(currentState);
            }
            xSemaphoreGive(stateMutex);
          }
        }
      } else {
         http.end(); 
      }
      
    } else {
      WiFi.reconnect();
      vTaskDelay(1000 / portTICK_PERIOD_MS);
    }

    vTaskDelay(150 / portTICK_PERIOD_MS);
  }
}

// --- SETUP ---
void setup() {
  Serial.begin(115200);
  delay(1000);

  strip.begin();
  strip.setBrightness(255);
  strip.show(); 

  stateMutex = xSemaphoreCreateMutex();

  xTaskCreatePinnedToCore(
    networkTask,
    "NetworkTask",
    16384, // Increased from 8192 to prevent WiFiClientSecure stack overflow
    NULL,
    1,
    &NetworkTaskHandle,
    0
  );
}

String lastProcessedState = "";
long long lastProcessedTimestamp = -1;
unsigned long waitingStateStart = 0; 

void resetAnimations() {
  lastAnimationUpdate = 0;
  animStep = 0;
  animSubStep = 0;
  animMode = 0; 
  animTimer = millis();
  isGeneratingAttractPattern = true; 
  strip.setBrightness(255); 
  clearAll();
  strip.show();
}

// --- MAIN LOOP ---
void loop() {
  bool stateChanged = false;
  
  if (xSemaphoreTake(stateMutex, 0)) { 
     if (currentTimestamp > lastProcessedTimestamp) {
        lastProcessedTimestamp = currentTimestamp;
        
        if (currentState != lastProcessedState) {
            lastProcessedState = currentState;
            stateChanged = true;
        }
     }
     xSemaphoreGive(stateMutex);
  }

  if (stateChanged) {
      resetAnimations();
      Serial.print("Loop State Changed to: ");
      Serial.println(lastProcessedState);
      
      if (lastProcessedState == "waiting_for_player") {
          waitingStateStart = millis();
      } else {
          waitingStateStart = 0;
      }
  }
  
  if (lastProcessedState == "waiting_for_player" && waitingStateStart != 0) {
      if (millis() - waitingStateStart > 60000) { 
          Serial.println("Timeout: Forced return to IDLE from waiting state.");
          lastProcessedState = "fail"; // Force the fail animation first
          resetAnimations();
          
          if (xSemaphoreTake(stateMutex, 10)) {
              currentState = "idle";
              currentTimestamp = millis(); // Force local override to push out to server
              xSemaphoreGive(stateMutex);
          }
      }
  }

  unsigned long now = millis();

  if (lastProcessedState == "idle") {
    runAttractMode(now);
  } 
  else if (lastProcessedState == "starting" || lastProcessedState == "game_start") {
    runStartingAnimation(now);
  } 
  else if (lastProcessedState == "showing_pattern") {
    runShowPattern(now);
  } 
  else if (lastProcessedState == "waiting_for_player") {
    runWaitingAnimation(now);
  } 
  else if (lastProcessedState == "success") {
    runSuccessAnimation(now);
  } 
  else if (lastProcessedState == "fail") {
    runFailAnimation(now);
  } 
  else if (lastProcessedState == "game_end") {
    if (xSemaphoreTake(stateMutex, 10)) {
        currentState = "idle";
        xSemaphoreGive(stateMutex);
    }
  }
  else {
    delay(100);
  }
}