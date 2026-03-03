import React, { useState, useEffect, useRef } from 'react';
import { X, Trophy, Play, RotateCcw } from 'lucide-react';

// --- CONFIGURATION ---
const API_URL = 'games/NeonRecall/api.php'; // Relative to the base index.html
const BOARD_ID = 'neon_recall_1';
const FLASH_DURATION = 500; // ms per flash
const PAUSE_DURATION = 250; // ms between flashes
const INPUT_TIMEOUT = 20000; // 20s to press a button before game over

export default function NeonRecall({ onExit }) {
  const [score, setScore] = useState(0);
  const [gameState, setGameState] = useState('idle'); // idle, showing_pattern, waiting_for_player, success, fail
  const [gameSequence, setGameSequence] = useState([]);
  const [playerSequence, setPlayerSequence] = useState([]);
  const [statusMessage, setStatusMessage] = useState("Press START");
  const [timeLeft, setTimeLeft] = useState(INPUT_TIMEOUT / 1000);
  
  // Use refs for values needed inside timeouts/async to avoid stale closures if not careful
  const sequenceRef = useRef([]);
  const failTimeoutRef = useRef(null);
  const startTimeoutRef = useRef(null);
  const patternTimeoutRef = useRef(null);
  const nextRoundTimeoutRef = useRef(null);
  const inputTimeoutRef = useRef(null);
  const timerIntervalRef = useRef(null);

  const buttons = [
    { id: 'yellow', index: 0, baseColor: '#fde047', glowColor: 'rgba(253, 224, 71, 0.8)' },
    { id: 'green',  index: 1, baseColor: '#4ade80', glowColor: 'rgba(74, 222, 128, 0.8)' },
    { id: 'pink',   index: 2, baseColor: '#f472b6', glowColor: 'rgba(244, 114, 182, 0.8)' },
    { id: 'blue',   index: 3, baseColor: '#22d3ee', glowColor: 'rgba(34, 211, 238, 0.8)' }
  ];

  // Helper to send state to PHP/ESP32
  const sendGameState = async (state, pattern = []) => {
    try {
      // We don't await this to block UI, just fire and forget (or log error)
      fetch(`${API_URL}?board=${BOARD_ID}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          state,
          pattern,
          timestamp: Date.now()
        })
      }).catch(err => console.error("Network Error:", err));
    } catch (err) {
      console.error("Failed to sync game state:", err);
    }
  };

  const startGame = () => {
    setScore(0);
    setGameSequence([]);
    setPlayerSequence([]);
    sequenceRef.current = [];
    
    // Notify ESP32 to play intro
    setGameState('starting'); 
    setStatusMessage("Get Ready...");
    sendGameState('game_start');

    // Start first round after intro delay
    startTimeoutRef.current = setTimeout(() => startRound([]), 2000);
  };

  const handleExit = () => {
    sendGameState('game_end'); // Reset board
    onExit();
  };

  const startRound = (currentSeq) => {
    // 1. Add new random color (0-3)
    const nextColor = Math.floor(Math.random() * 4);
    const newSeq = [...currentSeq, nextColor];
    
    setGameSequence(newSeq);
    sequenceRef.current = newSeq;
    setPlayerSequence([]);
    setGameState('showing_pattern');
    setStatusMessage(`Level ${newSeq.length}`); // Update status to show level

    // 2. Send pattern to ESP32
    sendGameState('showing_pattern', newSeq);

    // 3. Wait for pattern to play (approx calculation) + buffer
    // ESP32 will play it. We just wait here before letting user input.
    const totalDuration = newSeq.length * (FLASH_DURATION + PAUSE_DURATION) + 1000;

    patternTimeoutRef.current = setTimeout(() => {
      setGameState('waiting_for_player');
      setStatusMessage("Your Turn!");
      setTimeLeft(INPUT_TIMEOUT / 1000);
      sendGameState('waiting_for_player', []); // Tell ESP32 to listen (or show idle anim)
      
      // Start inactivity timer
      inputTimeoutRef.current = setTimeout(handleTimeout, INPUT_TIMEOUT);
      
      // Visual countdown
      timerIntervalRef.current = setInterval(() => {
        setTimeLeft(prev => Math.max(0, prev - 1));
      }, 1000);

    }, totalDuration);
  };

  const handleTimeout = () => {
    setGameState('fail');
    setStatusMessage("TIME UP!");
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    sendGameState('fail', []);
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    
    // Auto-exit after 10 seconds (visual countdown)
    let countdown = 10;
    setTimeLeft(countdown);
    
    timerIntervalRef.current = setInterval(() => {
      countdown -= 1;
      setTimeLeft(countdown);
      if (countdown <= 0) {
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
          handleExit();
      }
    }, 1000);
  };

  const handleButtonPress = (btn) => {
    // Only accept input if it's the player's turn
    if (gameState !== 'waiting_for_player') return;

    // Reset inactivity timer on every press
    if (inputTimeoutRef.current) clearTimeout(inputTimeoutRef.current);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    
    // Restart logic
    setTimeLeft(INPUT_TIMEOUT / 1000);
    inputTimeoutRef.current = setTimeout(handleTimeout, INPUT_TIMEOUT);
    timerIntervalRef.current = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);

    console.log(`User pressed: ${btn.id} (${btn.index})`);
    
    // Feedback
    if (navigator.vibrate) navigator.vibrate(50);
    
    // Add to player sequence
    const newPlayerSeq = [...playerSequence, btn.index];
    setPlayerSequence(newPlayerSeq);

    // Check logic
    const currentIndex = newPlayerSeq.length - 1;
    
    if (newPlayerSeq[currentIndex] !== sequenceRef.current[currentIndex]) {
      // WRONG! - GAME OVER LOGIC
      setGameState('fail');
      setStatusMessage("GAME OVER");
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      sendGameState('fail', []);
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

      // Auto-exit after 10 seconds (visual countdown handled by state)
      let countdown = 10;
      setTimeLeft(countdown);
      
      timerIntervalRef.current = setInterval(() => {
        countdown -= 1;
        setTimeLeft(countdown);
        if (countdown <= 0) {
           if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
           handleExit();
        }
      }, 1000);

    } else {
      // CORRECT SO FAR
      if (newPlayerSeq.length === sequenceRef.current.length) {
        // ROUND COMPLETE
        setGameState('success');
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        if (inputTimeoutRef.current) clearTimeout(inputTimeoutRef.current);
        setScore(prev => prev + 10);
        setStatusMessage("Success!");
        sendGameState('success', []);
        
        // Wait then start next round
        nextRoundTimeoutRef.current = setTimeout(() => {
          startRound(sequenceRef.current);
        }, 1500);
      } else {
        // Still playing sequence, restart inactivity timer
        inputTimeoutRef.current = setTimeout(handleTimeout, INPUT_TIMEOUT);
      }
    }
  };
  
  // Cleanup timeout if component unmounts
  React.useEffect(() => {
    return () => {
      if (failTimeoutRef.current) clearTimeout(failTimeoutRef.current);
      if (startTimeoutRef.current) clearTimeout(startTimeoutRef.current);
      if (patternTimeoutRef.current) clearTimeout(patternTimeoutRef.current);
      if (nextRoundTimeoutRef.current) clearTimeout(nextRoundTimeoutRef.current);
      if (inputTimeoutRef.current) clearTimeout(inputTimeoutRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen bg-black text-white overflow-hidden relative font-sans touch-none select-none">
      
      <div className="absolute inset-0 pointer-events-none" 
           style={{ background: 'radial-gradient(circle at center top, #1a0b2e 0%, #000000 100%)' }}>
      </div>
      
      <div className="absolute inset-0 pointer-events-none opacity-40" 
           style={{
             backgroundImage: 'linear-gradient(to right, #f472b6 2px, transparent 2px), linear-gradient(to bottom, #22d3ee 2px, transparent 2px)',
             backgroundSize: '60px 60px',
             transform: 'perspective(600px) rotateX(70deg) scale(2.5) translateY(-40px)',
             transformOrigin: 'bottom center'
           }}>
      </div>

      <div className="relative z-20 flex justify-between items-center px-6 py-3 bg-black/60 backdrop-blur-md border-b border-pink-500/30 shadow-[0_4px_20px_rgba(244,114,182,0.2)]">
        <div className="flex items-center gap-3 w-1/3">
          <Trophy className="text-yellow-400 drop-shadow-[0_0_8px_rgba(253,224,71,0.8)]" size={20} />
          <span className="text-xl font-black font-mono tracking-widest text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]">
            {score.toString().padStart(4, '0')}
          </span>
        </div>
        
        <div className="w-1/3 text-center hidden sm:block">
          <span className="text-2xl font-black italic tracking-[0.2em] text-white drop-shadow-[0_0_2px_#08f] [text-shadow:0_0_10px_#08f,0_0_20px_#08f,0_0_40px_#08f]">
            NEON RECALL
          </span>
        </div>

        <div className="w-1/3 flex justify-end">
          <button 
            onClick={handleExit}
            className="flex items-center gap-1 text-sm font-bold text-pink-400 bg-pink-500/10 px-4 py-2 rounded-full border border-pink-500/50 hover:bg-pink-500/20 active:scale-95 transition-all shadow-[0_0_10px_rgba(244,114,182,0.3)]"
          >
            EXIT <X size={16} />
          </button>
        </div>
      </div>

      {/* Game Status / Start Overlay */}
      <div className="relative z-30 flex flex-col items-center justify-center py-2 h-16">
         <span className={`text-xl font-bold transition-all duration-300 ${
           gameState === 'fail' ? 'text-red-500 scale-110' : 
           gameState === 'success' ? 'text-green-400 scale-110' : 'text-blue-300'
         }`}>
            {statusMessage}
         </span>
         {gameState === 'waiting_for_player' && (
           <div className="w-48 h-1 bg-gray-800 rounded-full mt-2 overflow-hidden">
             <div 
               className={`h-full transition-all duration-1000 ease-linear ${timeLeft < 5 ? 'bg-red-500' : 'bg-blue-400'}`}
               style={{ width: `${(timeLeft / (INPUT_TIMEOUT/1000)) * 100}%` }}
             ></div>
           </div>
         )}
      </div>

      <div className="flex-1 relative z-10 flex w-full justify-center items-center gap-6 sm:gap-12 px-4">
        {gameState === 'idle' ? (
             <div className="absolute z-50 flex flex-col items-center gap-4 bg-black/80 p-8 rounded-2xl border border-pink-500/50 backdrop-blur-xl shadow-[0_0_50px_rgba(244,114,182,0.4)]">
                <button 
                  onClick={startGame}
                  className="flex items-center gap-2 text-2xl font-black bg-gradient-to-r from-pink-500 to-purple-600 px-8 py-4 rounded-full hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(236,72,153,0.6)]"
                >
                  <Play /> START GAME
                </button>
             </div>
        ) : null}

        {gameState === 'fail' ? (
             <div className="absolute z-50 flex flex-col items-center gap-6 bg-black/90 p-10 rounded-2xl border border-red-500/50 backdrop-blur-xl shadow-[0_0_50px_rgba(239,68,68,0.4)] text-center animate-in fade-in zoom-in duration-300">
                <h2 className="text-4xl text-red-500 font-black tracking-wider drop-shadow-[0_0_10px_rgba(239,68,68,0.8)]">GAME OVER</h2>
                <div className="flex flex-col gap-1">
                  <span className="text-gray-400 text-sm uppercase tracking-widest">Final Score</span>
                  <span className="text-5xl font-mono text-white font-bold">{score}</span>
                </div>
                <button 
                  onClick={handleExit}
                  className="mt-2 flex items-center gap-2 text-xl font-bold bg-white text-black px-8 py-3 rounded-full hover:bg-gray-200 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,255,255,0.4)]"
                >
                  OK
                </button>
                <p className="text-xs text-gray-500 mt-2">Returning to menu in {timeLeft}s...</p>
             </div>
        ) : null}

        {buttons.map((btn) => (
          <button
            key={btn.id}
            onPointerDown={() => handleButtonPress(btn)}
            disabled={gameState !== 'waiting_for_player'}
            style={{
              backgroundColor: btn.baseColor,
              boxShadow: `0 0 35px ${btn.glowColor}, inset -12px -12px 20px rgba(0,0,0,0.4), inset 12px 12px 25px rgba(255,255,255,0.9)`,
              borderRadius: '50%',
              aspectRatio: '1 / 1',
              opacity: gameState === 'waiting_for_player' || gameState === 'showing_pattern' ? 1 : 0.3,
              filter: gameState !== 'waiting_for_player' ? 'grayscale(0.5)' : 'none',
              transform: gameState !== 'waiting_for_player' ? 'scale(0.95)' : 'scale(1)'
            }}
            className="w-24 h-24 sm:w-32 sm:h-32 md:w-40 md:h-40 rounded-full active:scale-90 active:brightness-125 transition-all duration-75 border border-white/30 relative overflow-hidden flex-shrink-0"
          >
            <div className="absolute top-[12%] left-[18%] w-[25%] h-[15%] bg-white/70 rounded-[50%] rotate-[-40deg] blur-[1px]"></div>
          </button>
        ))}
      </div>
    </div>
  );
}
