import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { Trophy, X, RotateCcw } from 'lucide-react';
import confetti from 'canvas-confetti';

const API_URL = 'api/api.php';

export default function SwipeStrike({ onExit, boardId = 'swipe_strike_1', sessionId }) {
  const { endSession } = useAuth();
  const [score, setScore] = useState(0);
  const [path, setPath] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPointer, setCurrentPointer] = useState(null);
  
  const [gameState, setGameState] = useState('idle');
  const [pattern, setPattern] = useState([]);
  const [statusMessage, setStatusMessage] = useState('READY');
  
  const INPUT_TIMEOUT = 20000;
  const [timeLeft, setTimeLeft] = useState(INPUT_TIMEOUT / 1000);
  
  const svgRef = useRef(null);
  const gameStateRef = useRef('idle');
  const roundsCompletedRef = useRef(0);
  const patternTimeoutRef = useRef(null);
  const nextRoundTimeoutRef = useRef(null);
  const startTimeoutRef = useRef(null);
  const inputTimeoutRef = useRef(null);
  const timerIntervalRef = useRef(null);

  const setGameStateSafe = (newState) => {
    setGameState(newState);
    gameStateRef.current = newState;
  };

  // Start the game automatically when the component mounts
  useEffect(() => {
    startGame();
  }, []);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const boardFromUrl = urlParams.get('board');
    // We ignore URL params if a prop was passed
  }, []);

  useEffect(() => {
    switch (gameState) {
      case 'idle': setStatusMessage('READY'); break;
      case 'starting': setStatusMessage('GET READY...'); break;
      case 'watch_board': setStatusMessage('WATCH THE BOARD'); break;
      case 'showing_pattern': setStatusMessage('WATCH THE BOARD'); break;
      case 'waiting_for_player': setStatusMessage('SWIPE THE PATTERN!'); break;
      case 'success': setStatusMessage('CORRECT!'); break;
      case 'fail': setStatusMessage(timeLeft > 0 && timeLeft <= 10 ? 'GAME OVER' : 'GAME OVER'); break;
      case 'time_up': setStatusMessage('TIME UP!'); break;
      default: setStatusMessage('');
    }
  }, [gameState, timeLeft]);

  const handleExit = () => {
    updateBoardState('game_end'); // Reset board
    
    // Record final score if we have a valid session
    if (sessionId) {
        endSession(sessionId, score);
    }
    onExit();
  };

  // Helper to determine valid continuous swipes
  const isValidSwipeMove = (start, end, used) => {
    if (start === end) return false;
    const startX = start % 3;
    const startY = Math.floor(start / 3);
    const endX = end % 3;
    const endY = Math.floor(end / 3);
    const dx = Math.abs(endX - startX);
    const dy = Math.abs(endY - startY);
    return dx <= 1 && dy <= 1;
  };

  const generatePattern = (length) => {
    let newPattern = [];
    let used = Array(9).fill(false);
    let currentPos = Math.floor(Math.random() * 9);
    
    newPattern.push(currentPos);
    used[currentPos] = true;
    
    while (newPattern.length < length) {
      let validMoves = [];
      for (let i = 0; i < 9; i++) {
        if (!used[i] && isValidSwipeMove(currentPos, i, used)) {
          validMoves.push(i);
        }
      }
      
      if (validMoves.length === 0) break;
      
      let nextPos = validMoves[Math.floor(Math.random() * validMoves.length)];
      newPattern.push(nextPos);
      used[nextPos] = true;
      currentPos = nextPos;
    }
    return newPattern;
  };

  const updateBoardState = async (newState, extraData = {}) => {
    try {
      const payload = {
        state: newState,
        timestamp: Date.now(),
        ...extraData
      };
      await fetch(`${API_URL}?board=${boardId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.error("Update error:", err);
    }
  };

  const startGame = () => {
    // Clear any pending exit timers if they clicked Play Again
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    
    setScore(0);
    roundsCompletedRef.current = 0;
    setPath([]);
    
    setGameStateSafe('starting');
    updateBoardState('game_start');
    
    if (startTimeoutRef.current) clearTimeout(startTimeoutRef.current);
    startTimeoutRef.current = setTimeout(() => prepareRound(), 2000);
  };

  const prepareRound = () => {
    setGameStateSafe('watch_board');
    
    startTimeoutRef.current = setTimeout(() => {
        startRound();
    }, 3000);
  };

  const startRound = () => {
    // 3 patterns per level
    // Round 0-2: Length 3
    // Round 3-5: Length 4
    // Round 6-8: Length 5
    // Caps out at Length 9 (all nodes)
    const sequenceLength = Math.min(3 + Math.floor(roundsCompletedRef.current / 3), 9);
    const newPattern = generatePattern(sequenceLength);
    
    setPattern(newPattern);
    setGameStateSafe('showing_pattern');
    updateBoardState('showing_pattern', { pattern: newPattern });
    
    // Board animation takes time: 500ms per node + fixed delays. 
    // We add an extra 2000ms just to be perfectly safe before enabling input.
    const totalDuration = newPattern.length * 500 + 2000;
    
    if (patternTimeoutRef.current) clearTimeout(patternTimeoutRef.current);
    
    patternTimeoutRef.current = setTimeout(() => {
        setGameStateSafe('waiting_for_player');
        updateBoardState('waiting_for_player', { pattern: newPattern });
        setTimeLeft(INPUT_TIMEOUT / 1000);
        
        if (inputTimeoutRef.current) clearTimeout(inputTimeoutRef.current);
        inputTimeoutRef.current = setTimeout(handleTimeout, INPUT_TIMEOUT);
        
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = setInterval(() => {
          setTimeLeft(prev => Math.max(0, prev - 1));
        }, 1000);
    }, totalDuration);
  };

  const handleTimeout = () => {
    if (gameStateRef.current !== 'waiting_for_player') return;
    
    setGameStateSafe('time_up');
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    updateBoardState('fail'); // Hardware visual uses "fail" (red flashes)
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

  // Cleanup timeouts
  useEffect(() => {
    return () => {
      if (startTimeoutRef.current) clearTimeout(startTimeoutRef.current);
      if (patternTimeoutRef.current) clearTimeout(patternTimeoutRef.current);
      if (nextRoundTimeoutRef.current) clearTimeout(nextRoundTimeoutRef.current);
      if (inputTimeoutRef.current) clearTimeout(inputTimeoutRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  // Poll to see if the server has killed our session (e.g. from timeout)
  useEffect(() => {
    if (!sessionId) return;

    const interval = setInterval(async () => {
        try {
            const res = await fetch(`api/auth.php?action=check_session_status&session_id=${sessionId}`);
            const data = await res.json();
            if (!data.success) {
                // The server has killed our session.
                clearInterval(interval);
                alert("Your session has expired due to inactivity.");
                onExit();
            }
        } catch (err) {
            console.error("Session check failed:", err);
            clearInterval(interval); // Stop polling on error
        }
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [sessionId, onExit]);

  // Effect for confetti on success and fail
  useEffect(() => {
    if (gameState === 'success') {
       // Fire confetti from left and right
       const duration = 2000;
       const end = Date.now() + duration;
       const colors = ['#00FFFF', '#FF0055', '#FFFFFF'];

       (function frame() {
         confetti({
           particleCount: 3,
           angle: 60,
           spread: 55,
           origin: { x: 0 },
           colors: colors
         });
         confetti({
           particleCount: 3,
           angle: 120,
           spread: 55,
           origin: { x: 1 },
           colors: colors
         });
  
         if (Date.now() < end) {
           requestAnimationFrame(frame);
         }
       }());
    } else if (gameState === 'fail' || gameState === 'time_up') {
       // Sad confetti (grey/red, heavy rain effect)
       const duration = 3000;
       const end = Date.now() + duration;
       const colors = ['#555555', '#333333', '#111111', '#FF0055'];

       (function frame() {
         confetti({
           particleCount: 8,
           angle: 90,
           spread: 160,
           startVelocity: 40,
           gravity: 1.2,
           origin: { y: -0.1 }, // Start slightly above screen
           colors: colors,
           shapes: ['square'],
           scalar: 2, // Much bigger particles
           drift: 0,
           ticks: 400
         });
  
         if (Date.now() < end) {
           requestAnimationFrame(frame);
         }
       }());
    }
  }, [gameState]);

  // The 3x3 grid coordinates within a 300x300 SVG viewBox
  const nodes = [
    { id: 0, x: 50, y: 50 },  { id: 1, x: 150, y: 50 },  { id: 2, x: 250, y: 50 },
    { id: 3, x: 50, y: 150 }, { id: 4, x: 150, y: 150 }, { id: 5, x: 250, y: 150 },
    { id: 6, x: 50, y: 250 }, { id: 7, x: 150, y: 250 }, { id: 8, x: 250, y: 250 },
  ];

  // Helper to convert screen coordinates to SVG coordinates
  const getPointerCoords = (e) => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    
    // Support both mouse and touch events
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    return {
      x: (clientX - rect.left) * (300 / rect.width),
      y: (clientY - rect.top) * (300 / rect.height)
    };
  };

  const handlePointerDown = (e) => {
    if (gameState !== 'waiting_for_player') return;
    setIsDrawing(true);
    const coords = getPointerCoords(e);
    setCurrentPointer(coords);
    checkNodeCollision(coords);
  };

  const handlePointerMove = (e) => {
    if (!isDrawing) return;
    // Prevent default scrolling on touch devices
    if (e.cancelable) e.preventDefault(); 
    
    const coords = getPointerCoords(e);
    setCurrentPointer(coords);
    checkNodeCollision(coords);
  };

  const handlePointerUp = async () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    setCurrentPointer(null);

    if (path.length > 0) {
      if (gameStateRef.current === 'waiting_for_player') {
        if (inputTimeoutRef.current) clearTimeout(inputTimeoutRef.current);
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

        const isCorrect = path.length === pattern.length && path.every((val, index) => val === pattern[index]);
        
        if (isCorrect) {
          setScore(prev => prev + (path.length * 10));
          roundsCompletedRef.current += 1;
          setGameStateSafe('success');
          updateBoardState('success');
          
          nextRoundTimeoutRef.current = setTimeout(() => {
             prepareRound();
          }, 2000);
        } else {
          setGameStateSafe('fail');
          updateBoardState('fail');
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
        }
      }
      setTimeout(() => setPath([]), 400);
    }
  };

  const checkNodeCollision = (coords) => {
    if (!coords) return;
    
    // Hit-box radius for nodes
    const HIT_RADIUS = 35; 

    nodes.forEach(node => {
      const dist = Math.hypot(node.x - coords.x, node.y - coords.y);
      if (dist < HIT_RADIUS) {
        setPath(prevPath => {
          // If the node isn't already in the path, add it!
          if (!prevPath.includes(node.id)) {
            if (navigator.vibrate) navigator.vibrate(20); // Tactile feedback
            
            // In the future, send an instant "Node Lit" message to ESP32 here
            // console.log(`Instantly lighting up physical node ${node.id}`);
            
            return [...prevPath, node.id];
          }
          return prevPath;
        });
      }
    });
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0a0512] text-white overflow-hidden relative font-sans touch-none select-none">
      
      {/* Background Hacker Aesthetics */}
      <div className="absolute inset-0 pointer-events-none opacity-20" 
           style={{
             backgroundImage: 'linear-gradient(#00FFFF 1px, transparent 1px), linear-gradient(90deg, #00FFFF 1px, transparent 1px)',
             backgroundSize: '40px 40px'
           }}>
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,#05020a_100%)] pointer-events-none"></div>

      {/* WATCH THE BOARD OVERLAY */}
      {(gameState === 'watch_board' || gameState === 'showing_pattern') && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none">
          <div className="animate-pulse flex flex-col items-center">
            <span className="text-[#00FFFF] text-5xl font-black tracking-widest uppercase drop-shadow-[0_0_20px_rgba(0,255,255,0.8)] text-center px-4">
              WATCH
              <br/>
              THE BOARD
            </span>
          </div>
        </div>
      )}

      {/* GAME OVER SCREEN OVERLAY */}
      {(gameState === 'fail' || gameState === 'time_up') && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm border-2 border-[#FF0055] bg-gray-900 rounded-2xl p-6 text-center shadow-[0_0_40px_rgba(255,0,85,0.4)]">
            <h2 className="text-4xl font-black text-[#FF0055] mb-2 drop-shadow-[0_0_10px_rgba(255,0,85,0.8)] tracking-widest uppercase">
              {gameState === 'time_up' ? 'TIME UP!' : 'GAME OVER'}
            </h2>
            <div className="text-gray-400 mb-6 font-mono">
              Auto-exiting in {timeLeft}s
            </div>

            <div className="bg-black/50 rounded-xl p-4 mb-8 border border-gray-800">
              <div className="text-gray-400 text-sm font-bold uppercase tracking-wider mb-1">Final Score</div>
              <div className="text-5xl font-black text-[#00FFFF] drop-shadow-[0_0_10px_rgba(0,255,255,0.5)] flex justify-center items-center gap-2">
                <Trophy size={40} className="text-[#00FFFF]" />
                {score}
              </div>
            </div>

            <div className="flex flex-col gap-3">
               <button 
                onClick={handleExit}
                className="w-full py-4 bg-transparent border-2 border-[#FF0055] text-gray-300 font-bold text-lg rounded-xl hover:bg-gray-800 active:scale-95 transition-all tracking-wider"
               >
                 MAIN MENU
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Ribbon */}
      <div className="relative z-20 flex justify-between items-center px-6 py-3 bg-black/60 backdrop-blur-md border-b border-[#00FFFF]/30 shadow-[0_4px_20px_rgba(0,255,255,0.15)]">
        <div className="flex items-center gap-3 w-1/3">
          <Trophy className="text-[#FDE047] drop-shadow-[0_0_8px_rgba(253,224,71,0.8)]" size={20} />
          <span className="text-xl font-black font-mono tracking-widest text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]">
            {score.toString().padStart(4, '0')}
          </span>
        </div>
        
        <div className="w-1/3 text-center text-[#FF0055] font-black tracking-widest uppercase text-lg drop-shadow-[0_0_12px_rgba(255,0,85,0.8)] hidden sm:block">
          SWIPE STRIKE
        </div>

        <div className="w-1/3 flex justify-end">
          <button 
            onClick={handleExit}
            className="flex items-center gap-1 text-sm font-bold text-[#00FFFF] bg-[#00FFFF]/10 px-4 py-2 rounded-full border border-[#00FFFF]/50 hover:bg-[#00FFFF]/20 active:scale-95 transition-all shadow-[0_0_10px_rgba(0,255,255,0.3)]"
          >
            EXIT <X size={16} />
          </button>
        </div>
      </div>

      <div className="relative z-20 flex justify-center mt-2 sm:mt-8 flex-col items-center gap-2">
        <div className={`text-xl sm:text-2xl font-black tracking-widest uppercase drop-shadow-[0_0_10px_rgba(0,255,255,0.8)] transition-colors duration-300 ${
          (gameState === 'fail' || gameState === 'time_up') ? 'text-[#FF0000]' : 
          gameState === 'success' ? 'text-[#00FF00]' : 
          gameState === 'waiting_for_player' ? 'text-[#00FFFF]' : 'text-[#FF0055]'
        }`}>
          {statusMessage}
        </div>
        {(gameState === 'waiting_for_player' || gameState === 'fail' || gameState === 'time_up') && (
          <div className={`font-mono font-bold text-lg animate-pulse ${gameState === 'waiting_for_player' ? 'text-[#FF0055]' : 'text-[#FF0000]'}`}>
            {timeLeft}s
          </div>
        )}
      </div>

      {/* The 3x3 Play Area */}
      <div className="flex-1 relative z-10 flex w-full justify-center items-center p-4 sm:p-8">
        <div className="relative w-full max-w-[400px] aspect-square bg-[#05020a]/80 rounded-3xl border border-[#00FFFF]/20 shadow-[0_0_40px_rgba(255,0,85,0.1)] p-4 flex justify-center items-center">
          
          {gameState === 'idle' && (
            <button 
              onClick={startGame}
              className="absolute z-30 px-8 py-4 bg-[#FF0055] text-white font-black tracking-widest text-xl rounded-full shadow-[0_0_20px_rgba(255,0,85,0.6)] hover:scale-105 active:scale-95 transition-all"
            >
              START GAME
            </button>
          )}

          <svg 
            ref={svgRef}
            viewBox="0 0 300 300" 
            className={`w-full h-full cursor-crosshair transition-opacity duration-300 ${gameState !== 'waiting_for_player' ? 'opacity-30' : 'opacity-100'}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onPointerCancel={handlePointerUp}
            // Fallbacks for older touch devices
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
            onTouchCancel={handlePointerUp}
          >
            <defs>
              <filter id="neon-pink">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
              <filter id="neon-cyan">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>

            {/* Draw confirmed paths */}
            {path.length > 1 && (
              <polyline
                points={path.map(id => `${nodes[id].x},${nodes[id].y}`).join(' ')}
                fill="none"
                stroke="#FF0055"
                strokeWidth="12"
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#neon-pink)"
              />
            )}

            {/* Draw the active drawing line following the finger */}
            {isDrawing && path.length > 0 && currentPointer && (
              <line
                x1={nodes[path[path.length - 1]].x}
                y1={nodes[path[path.length - 1]].y}
                x2={currentPointer.x}
                y2={currentPointer.y}
                stroke="#FF0055"
                strokeWidth="8"
                strokeLinecap="round"
                opacity="0.6"
                filter="url(#neon-pink)"
              />
            )}

            {/* Draw the 9 Nodes */}
            {nodes.map(node => {
              const isSelected = path.includes(node.id);
              return (
                <g key={node.id}>
                  {/* Outer glowing halo when selected */}
                  {isSelected && (
                    <circle 
                      cx={node.x} cy={node.y} r="22" 
                      fill="none" stroke="#00FFFF" strokeWidth="4" 
                      filter="url(#neon-cyan)" opacity="0.8" 
                    />
                  )}
                  {/* The actual ping-pong ball representation */}
                  <circle 
                    cx={node.x} 
                    cy={node.y} 
                    r="16" 
                    fill={isSelected ? "#00FFFF" : "#1a2535"} 
                    stroke={isSelected ? "#FFFFFF" : "#00FFFF"} 
                    strokeWidth={isSelected ? "3" : "2"}
                    strokeOpacity={isSelected ? "1" : "0.5"}
                    filter={isSelected ? "url(#neon-cyan)" : "none"}
                    className="transition-all duration-150"
                  />
                  {/* Specular highlight for 3D orb effect */}
                  <ellipse cx={node.x - 4} cy={node.y - 6} rx="4" ry="2" fill="#FFFFFF" opacity={isSelected ? 0.8 : 0.2} transform={`rotate(-30 ${node.x} ${node.y})`} />
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      
    </div>
  );
}