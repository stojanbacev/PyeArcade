import React, { useState } from 'react';
import { X, Trophy } from 'lucide-react';

export default function NeonRecall({ onExit }) {
  const [score, setScore] = useState(0);

  const buttons = [
    { id: 'yellow', baseColor: '#fde047', glowColor: 'rgba(253, 224, 71, 0.8)' },
    { id: 'green',  baseColor: '#4ade80', glowColor: 'rgba(74, 222, 128, 0.8)' },
    { id: 'pink',   baseColor: '#f472b6', glowColor: 'rgba(244, 114, 182, 0.8)' },
    { id: 'blue',   baseColor: '#22d3ee', glowColor: 'rgba(34, 211, 238, 0.8)' }
  ];

  const handleButtonPress = (colorId) => {
    console.log(`User pressed: ${colorId}`);
    setScore(prev => prev + 10);
    if (navigator.vibrate) navigator.vibrate(50);
  };

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
            onClick={onExit}
            className="flex items-center gap-1 text-sm font-bold text-pink-400 bg-pink-500/10 px-4 py-2 rounded-full border border-pink-500/50 hover:bg-pink-500/20 active:scale-95 transition-all shadow-[0_0_10px_rgba(244,114,182,0.3)]"
          >
            EXIT <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 relative z-10 flex w-full justify-center items-center gap-6 sm:gap-12 px-4">
        {buttons.map((btn) => (
          <button
            key={btn.id}
            onPointerDown={() => handleButtonPress(btn.id)}
            style={{
              backgroundColor: btn.baseColor,
              boxShadow: `0 0 35px ${btn.glowColor}, inset -12px -12px 20px rgba(0,0,0,0.4), inset 12px 12px 25px rgba(255,255,255,0.9)`,
              borderRadius: '50%',
              aspectRatio: '1 / 1'
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
