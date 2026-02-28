import React, { useState } from 'react';
import { Gamepad2, Info, X, Play, Trophy } from 'lucide-react';

export default function App() {
  const [currentView, setCurrentView] = useState('home');
  const [selectedGame, setSelectedGame] = useState(null);
  const [score, setScore] = useState(0);

  const games = [
    {
      id: 'neon-recall',
      title: 'Neon Recall',
      tagline: 'Memory Sequence',
      description: 'Watch the light sequence on the physical board and repeat it using your phone. The sequences get longer every round!',
      colors: ['bg-yellow-400', 'bg-green-500', 'bg-pink-500', 'bg-blue-500']
    }
  ];

  const enterGameMode = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      if (window.screen && window.screen.orientation && window.screen.orientation.lock) {
        await window.screen.orientation.lock('landscape');
      }
    } catch (err) {
      console.warn("Fullscreen or Orientation lock not supported/allowed by browser.", err);
    }
    setCurrentView('playing');
  };

  const exitGameMode = async () => {
    try {
      if (window.screen && window.screen.orientation && window.screen.orientation.unlock) {
        window.screen.orientation.unlock();
      }
      if (document.exitFullscreen && document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn("Exit Fullscreen error.", err);
    }
    setCurrentView('home');
    setSelectedGame(null);
    setScore(0);
  };

  const renderHome = () => (
    <div className="flex flex-col h-[100dvh] w-screen bg-gray-900 text-white overflow-hidden font-sans">
      <header className="flex justify-between items-center px-6 pt-6 pb-4 shrink-0">
        <div>
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">PYE CLUB</h1>
          <p className="text-gray-400 text-sm tracking-widest uppercase mt-1">Arcade Portal</p>
        </div>
        <div className="bg-gray-800 p-3 rounded-full shadow-[0_0_15px_rgba(0,229,255,0.3)]">
          <Gamepad2 className="text-cyan-400" size={28} />
        </div>
      </header>

      <main className="flex-1 flex flex-col gap-4 overflow-y-auto min-h-0 px-6 pb-4">
        <h2 className="text-xl font-bold mb-2">Select a Game</h2>
        {games.map((game) => (
          <button
            key={game.id}
            onClick={() => {
              setSelectedGame(game);
              setCurrentView('instructions');
            }}
            style={{ backgroundColor: 'black' }}
            className="group relative overflow-hidden bg-black rounded-2xl p-6 text-left border border-gray-700 transition-all active:scale-95 flex justify-between items-center hover:border-cyan-500 hover:shadow-[0_0_20px_rgba(0,229,255,0.2)] text-white shrink-0"
          >
            <div className="z-10 relative">
              <h3 className="text-2xl font-bold text-white mb-1">{game.title}</h3>
              <p className="text-gray-400 text-sm">{game.tagline}</p>
            </div>
            <div className="flex gap-3 z-10 relative">
              {game.colors.map((color, i) => (
                <div key={i} className={`w-6 h-6 rounded-full ${color} shadow-[0_0_8px_currentColor] border border-white/10`}></div>
              ))}
            </div>
          </button>
        ))}
      </main>
      
      <footer className="shrink-0 text-center py-4 bg-gray-900/95 backdrop-blur-sm border-t border-white/5 z-20">
        <div className="inline-block bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-bold px-4 py-2 rounded-full tracking-wider uppercase">
          Help kids code!
        </div>
      </footer>
    </div>
  );

  const renderInstructions = () => (
    <div className="flex flex-col h-screen w-screen bg-gray-900 text-white overflow-hidden p-6 font-sans">
      <header className="flex justify-between items-center mb-8 pt-4">
        <button 
          onClick={() => setCurrentView('home')}
          className="text-gray-400 hover:text-white p-2 rounded-lg bg-gray-800 active:scale-95 transition-all"
        >
          <X size={24} />
        </button>
        <span className="text-xl sm:text-2xl font-black italic tracking-[0.2em] text-white drop-shadow-[0_0_2px_#08f] [text-shadow:0_0_10px_#08f,0_0_20px_#08f,0_0_40px_#08f] uppercase">
          {selectedGame.title}
        </span>
        <div className="w-10"></div>
      </header>

      <main className="flex-1 flex flex-col justify-center items-center text-center max-w-md mx-auto">
        <div className="bg-gray-800 p-6 rounded-full mb-6 border border-cyan-500/30 shadow-[0_0_30px_rgba(0,229,255,0.2)]">
          <Info size={48} className="text-cyan-400" />
        </div>
        <h3 className="text-2xl font-bold mb-4">How to Play</h3>
        <p className="text-gray-300 mb-8 leading-relaxed text-lg">
          {selectedGame.description}
        </p>
        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 w-full mb-8">
          <p className="text-sm text-pink-400 font-bold mb-1">PRO TIP:</p>
          <p className="text-sm text-gray-300">Keep your eyes on the physical board to see the sequence!</p>
        </div>
      </main>

      <footer className="pb-8">
        <button
          onClick={enterGameMode}
          className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-xl py-5 rounded-2xl shadow-[0_0_20px_rgba(0,229,255,0.4)] flex justify-center items-center gap-2 active:scale-95 transition-all uppercase tracking-wider"
        >
          <Play size={24} fill="currentColor" />
          Start Game
        </button>
      </footer>
    </div>
  );

  const renderGameplay = () => {
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
              onClick={exitGameMode}
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
  };

  return (
    <>
      {currentView === 'home' && renderHome()}
      {currentView === 'instructions' && renderInstructions()}
      {currentView === 'playing' && renderGameplay()}
    </>
  );
}