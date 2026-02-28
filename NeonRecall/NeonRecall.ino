#include <Adafruit_NeoPixel.h>

// --- CONFIGURATION ---
#define LED_PIN    25   // The GPIO pin connected to Din
#define NUM_JEWELS 4    // 4 Rings/Targets
#define LEDS_PER_JEWEL 8 // 8 LEDs per ring
#define LED_COUNT  (NUM_JEWELS * LEDS_PER_JEWEL) // Total: 32

// Create the pixel object
// NEO_GRB + NEO_KHZ800 is standard for WS2812B
Adafruit_NeoPixel strip(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);

void setup() {
  strip.begin();           // Initialize the strip
  strip.show();            // Turn everything off to start
  strip.setBrightness(150); // 0-255 (Keep it moderate to save power/heat)
}

void loop() {
  // Uncomment the one you want to test, or leave all to cycle through them
  
  // 1. Soft Pulse (looks like the game is "sleeping")
  animationBreathing(3, 10); 
  
  // 2. Fast Snake (checks all connections)
  animationSnake(30); 
  
  // 3. Random Sparkles (exciting, attracts attention)
  animationPopcorn(50, 100); 
  
  // 4. Lighting up one whole target at a time
  animationTargetJump(200); 
  
  // 5. Meteor with a fading tail
  animationMeteor(0xff, 0xff, 0xff, 10, 64, true, 30); 
}

// --- ANIMATION 1: BREATHING ---
// Smoothly fades all LEDs up and down
void animationBreathing(int cycles, int speedDelay) {
  for(int c = 0; c < cycles; c++) {
    // Fade IN
    for(int k = 0; k < 256; k++) {
      setAll(k, k, k); // White
      strip.show();
      delay(speedDelay);
    }
    // Fade OUT
    for(int k = 255; k >= 0; k--) {
      setAll(k, k, k); // White
      strip.show();
      delay(speedDelay);
    }
  }
}

// --- ANIMATION 2: SNAKE ---
// One pixel runs down the line
void animationSnake(int speedDelay) {
  for(int i = 0; i < LED_COUNT; i++) {
    strip.clear(); // Turn all off
    strip.setPixelColor(i, strip.Color(255, 255, 255)); // Set one white
    strip.show();
    delay(speedDelay);
  }
}

// --- ANIMATION 3: POPCORN ---
// Random LEDs flash bright white
void animationPopcorn(int flashes, int speedDelay) {
  strip.clear();
  strip.show();
  
  for(int i = 0; i < flashes; i++) {
    int randomPixel = random(LED_COUNT);
    strip.setPixelColor(randomPixel, strip.Color(255, 255, 255));
    strip.show();
    delay(speedDelay);
    strip.setPixelColor(randomPixel, 0); // Turn it off for the next loop
  }
}

// --- ANIMATION 4: TARGET JUMP ---
// Lights up LEDs 0-6, then 7-13, etc.
void animationTargetJump(int speedDelay) {
  for(int i = 0; i < 5; i++) { // Run 5 times
    for(int j = 0; j < NUM_JEWELS; j++) {
      strip.clear();
      
      // Calculate start and end LED for this target
      int startLed = j * LEDS_PER_JEWEL;
      int endLed = startLed + LEDS_PER_JEWEL;
      
      // Light up only this target
      for(int k = startLed; k < endLed; k++) {
        strip.setPixelColor(k, strip.Color(255, 255, 255));
      }
      strip.show();
      delay(speedDelay);
    }
  }
}

// --- ANIMATION 5: METEOR RAIN ---
// A shooting star effect
void animationMeteor(byte red, byte green, byte blue, byte meteorSize, byte meteorTrailDecay, boolean meteorRandomDecay, int speedDelay) {  
  for(int i = 0; i < LED_COUNT + LED_COUNT; i++) {
    // fade brightness all LEDs one step
    for(int j=0; j<LED_COUNT; j++) {
      if( (!meteorRandomDecay) || (random(10)>5) ) {
        fadeToBlack(j, meteorTrailDecay );        
      }
    }
    
    // draw meteor
    for(int j = 0; j < meteorSize; j++) {
      if( ( i-j <LED_COUNT) && (i-j>=0) ) {
        strip.setPixelColor(i-j, red, green, blue);
      } 
    }
   
    strip.show();
    delay(speedDelay);
  }
}

// --- HELPER FUNCTIONS ---

// Set all LEDs to a specific color
void setAll(byte red, byte green, byte blue) {
  for(int i = 0; i < LED_COUNT; i++ ) {
    strip.setPixelColor(i, red, green, blue); 
  }
}

// Used by Meteor animation to fade light
void fadeToBlack(int ledNo, byte fadeValue) {
   uint32_t oldColor;
   uint8_t r, g, b;
   
   oldColor = strip.getPixelColor(ledNo);
   r = (oldColor & 0x00ff0000UL) >> 16;
   g = (oldColor & 0x0000ff00UL) >> 8;
   b = (oldColor & 0x000000ffUL);

   r=(r<=10)? 0 : (int) r-(r*fadeValue/256);
   g=(g<=10)? 0 : (int) g-(g*fadeValue/256);
   b=(b<=10)? 0 : (int) b-(b*fadeValue/256);
   
   strip.setPixelColor(ledNo, r,g,b);
}