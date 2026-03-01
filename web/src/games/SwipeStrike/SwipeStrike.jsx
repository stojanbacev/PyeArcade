import React, { useState, useRef, useEffect } from 'react';
import { Trophy, X } from 'lucide-react';

export default function SwipeStrike({ onExit }) {
  const [score, setScore] = useState(0);
  const [path, setPath] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPointer, setCurrentPointer] = useState(null);
  
  const svgRef = useRef(null);

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

  const handlePointerUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    setCurrentPointer(null);

    if (path.length > 0) {
      // THIS IS WHERE YOU WILL SEND DATA TO THE ESP32
      console.log("Sequence Submitted to ESP32:", path);
      
      // Temporary logic: Add score and clear path after a delay
      setScore(prev => prev + (path.length * 10));
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
            onClick={onExit}
            className="flex items-center gap-1 text-sm font-bold text-[#00FFFF] bg-[#00FFFF]/10 px-4 py-2 rounded-full border border-[#00FFFF]/50 hover:bg-[#00FFFF]/20 active:scale-95 transition-all shadow-[0_0_10px_rgba(0,255,255,0.3)]"
          >
            EXIT <X size={16} />
          </button>
        </div>
      </div>

      {/* The 3x3 Play Area */}
      <div className="flex-1 relative z-10 flex w-full justify-center items-center p-4 sm:p-8">
        <div className="relative w-full max-w-[400px] aspect-square bg-[#05020a]/80 rounded-3xl border border-[#00FFFF]/20 shadow-[0_0_40px_rgba(255,0,85,0.1)] p-4">
          
          <svg 
            ref={svgRef}
            viewBox="0 0 300 300" 
            className="w-full h-full cursor-crosshair"
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
                    fill={isSelected ? "#00FFFF" : "#1a1525"} 
                    stroke={isSelected ? "#FFFFFF" : "#302645"} 
                    strokeWidth="3"
                    filter={isSelected ? "url(#neon-cyan)" : "none"}
                    className="transition-all duration-150"
                  />
                  {/* Specular highlight for 3D orb effect */}
                  <ellipse cx={node.x - 4} cy={node.y - 6} rx="4" ry="2" fill="#FFFFFF" opacity={isSelected ? 0.8 : 0.1} transform={`rotate(-30 ${node.x} ${node.y})`} />
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      
    </div>
  );
}