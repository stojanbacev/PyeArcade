import React, { useState } from 'react';
import { Gamepad2, Info, X, Play, LogOut, Lock } from 'lucide-react';
import NeonRecall from './games/NeonRecall/NeonRecall';
import SwipeStrike from './games/SwipeStrike/SwipeStrike';
import AuthPage from './components/AuthPage.jsx';
import ChangePassword from './components/ChangePassword.jsx';
import { useAuth } from './context/AuthContext.jsx';

const GAME_COMPONENTS = {
  'neon-recall': NeonRecall,
  'swipe-strike': SwipeStrike,
};

const GAME_TEMPLATES = {
  'neon-recall': {
    title: 'Neon Recall',
    tagline: 'Memory Sequence',
    description: 'Watch the light sequence on the physical board and repeat it using your phone. You have 20 seconds per turn!',
    colors: ['bg-yellow-400', 'bg-green-500', 'bg-pink-500', 'bg-blue-500']
  },
  'swipe-strike': {
    title: 'Swipe Strike',
    tagline: 'Pattern Unlock',
    description: 'Swipe to connect the nodes in the correct pattern. Speed and accuracy are key to unlocking the high score!',
    colors: ['bg-pink-500', 'bg-cyan-400'],
    renderIcon: () => (
      <div className="grid grid-cols-3 gap-2 bg-gray-900/50 p-2 rounded-lg border border-gray-700">
        {[...Array(9)].map((_, i) => (
          <div key={i} className={`w-3 h-3 rounded-full ${[0, 4, 8].includes(i) ? 'bg-pink-500 shadow-[0_0_8px_#ec4899]' : 'bg-cyan-400/30'}`}></div>
        ))}
      </div>
    )
  }
};

export default function App() {
  const { user, logout, startSession, loading: authLoading } = useAuth();
  const [currentView, setCurrentView] = useState('home');
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [selectedGame, setSelectedGame] = useState(null);
  const [activeBoards, setActiveBoards] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch active boards from API (only when authenticated)
  React.useEffect(() => {
    if (!user) {
      setActiveBoards([]);
      setLoading(true);
      return; // skip when not logged in
    }
    const fetchBoards = async () => {
      try {
        const response = await fetch('games/NeonRecall/api.php?action=list_boards');
        const data = await response.json();
        setActiveBoards(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Failed to fetch boards:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchBoards();
    const interval = setInterval(fetchBoards, 2000); // Refresh every 2s
    return () => clearInterval(interval);
  }, [user]);

  // Handle game selection with online check
  const handleGameSelect = async (game) => {
    try {
      // Perform strict active check (must be seen in last 2 seconds)
      const response = await fetch(`games/NeonRecall/api.php?action=check_status&target=${game.boardId}`);
      const statusData = await response.json();
      
      if (statusData.status === 'online') {
        setSelectedGame(game);
        setCurrentView('instructions');
      } else {
        alert("Board is offline or unresponsive! (Last seen > 5s ago)");
        // Trigger a list refresh to remove it if it's truly gone
        const listResponse = await fetch('games/NeonRecall/api.php?action=list_boards');
        const listData = await listResponse.json();
        setActiveBoards(Array.isArray(listData) ? listData : []);
      }
    } catch (err) {
      console.error("Connection error checking board status", err);
      alert("Could not verify board status.");
    }
  };

  const games = activeBoards.map(board => {
    const templateId = board.game; // 'neon-recall' or 'swipe-strike'
    const template = GAME_TEMPLATES[templateId] || GAME_TEMPLATES['neon-recall'];
    
    // Extract number suffix (e.g. 'neon_recall_1' -> '1')
    const suffix = board.id.split('_').pop();
    
    return {
      ...template,
      id: board.id, // Unique ID (neon_recall_1)
      componentId: templateId,
      boardId: board.id,
      title: `${template.title} - ${suffix}`, 
    };
  });

  const enterGameMode = async () => {
    if (user.credits < 1) {
      alert("Not enough credits to play!");
      return;
    }

    const result = await startSession(selectedGame.boardId, selectedGame.title);

    if (!result.success) {
      alert(result.message || "Could not start game session.");
      // Refresh board list
      try {
        const listResponse = await fetch('games/NeonRecall/api.php?action=list_boards');
        const listData = await listResponse.json();
        setActiveBoards(Array.isArray(listData) ? listData : []);
      } catch (e) { console.error(e); }
      
      // Kick back to home if failed
      setCurrentView('home');
      setSelectedGame(null);
      return;
    }

    setCurrentSessionId(result.sessionId);

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
  };

  // show login/register page if not signed in
  if (authLoading) {
    return <div className="flex items-center justify-center h-screen text-gray-400">Checking authentication...</div>;
  }

  if (!user) {
    return <AuthPage />;
  }

  if (currentView === 'change_password') {
    return <ChangePassword onDone={() => setCurrentView('home')} />;
  }

  const renderHome = () => (
    <div className="flex flex-col h-[100dvh] w-screen bg-gray-900 text-white overflow-hidden font-sans">
      {/* Main Branding Header */}
      <header className="flex justify-center items-center px-6 py-6 shrink-0 border-b border-gray-700/50">
        <div className="flex items-center gap-4">
          <div className="bg-gray-800 p-3 rounded-full shadow-[0_0_15px_rgba(0,229,255,0.3)]">
            <Gamepad2 className="text-cyan-400" size={32} />
          </div>
          <div>
            <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">PYE CLUB</h1>
            <p className="text-gray-400 text-xs tracking-widest uppercase">Arcade Portal</p>
          </div>
        </div>
      </header>

      {/* User Info Header */}
      <header className="flex justify-between items-center px-6 py-3 shrink-0 border-b border-gray-700/30 bg-gray-800/30">
        <div>
          {user && (
            <div className="flex flex-col gap-1">
              <span className="text-sm text-gray-300">{user.email}</span>
              {user.credits != null && <span className="text-xs text-cyan-400 font-bold">Credits: {user.credits}</span>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {user && (
            <>
              <button
                onClick={() => setCurrentView('change_password')}
                className="p-2 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors"
                title="Change Password"
              >
                <Lock size={20} className="text-cyan-400" />
              </button>
              <button
                onClick={logout}
                className="p-2 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors"
                title="Logout"
              >
                <LogOut size={20} className="text-cyan-400" />
              </button>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col gap-4 overflow-y-auto min-h-0 px-6 pb-4">
        <h2 className="text-xl font-bold mb-2">Select a Game</h2>
        {loading && <div className="text-center text-gray-500 py-8">Scanning for active boards...</div>}
        
        {!loading && games.length === 0 && (
           <div className="text-center py-8">
              <p className="text-gray-400 mb-2">No active game boards found.</p>
              <p className="text-xs text-gray-600">Make sure boards are powered on and connected to WiFi.</p>
           </div>
        )}

        {games.map((game) => (
          <button
            key={game.id}
            onClick={() => handleGameSelect(game)}
            style={{ backgroundColor: 'black' }}
            disabled={game.is_occupied}
            className={`group relative overflow-hidden bg-black rounded-2xl p-6 text-left border border-gray-700 transition-all active:scale-95 flex justify-between items-center ${game.is_occupied ? 'opacity-50 cursor-not-allowed border-orange-900' : 'hover:border-cyan-500 hover:shadow-[0_0_20px_rgba(0,229,255,0.2)]'} text-white shrink-0`}
          >
            <div className="z-10 relative">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-2xl font-bold text-white">{game.title}</h3>
                {game.is_occupied && <span className="text-[10px] bg-orange-600 text-white px-2 py-0.5 rounded uppercase font-bold tracking-wider">Busy</span>}
              </div>
              <p className="text-gray-400 text-sm">{game.is_occupied ? 'Game in Progress' : game.tagline}</p>
            </div>
            <div className="flex gap-3 z-10 relative">
              {game.renderIcon ? game.renderIcon() : game.colors.map((color, i) => (
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
          disabled={user.credits < 1}
          className={`w-full bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-xl py-5 rounded-2xl shadow-[0_0_20px_rgba(0,229,255,0.4)] flex justify-center items-center gap-2 active:scale-95 transition-all uppercase tracking-wider ${user.credits < 1 ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
        >
          <Play size={24} fill="currentColor" />
          Start Game (1 Credit)
        </button>
        {user.credits < 1 && (
             <p className="text-center text-red-400 mt-2 text-sm">Not enough credits!</p>
        )}
      </footer>
    </div>
  );

  const renderGameplay = () => {
    // Look up component by componentId (e.g. 'neon-recall') not the unique instance id ('neon-recall-1')
    const GameComponent = GAME_COMPONENTS[selectedGame?.componentId];
    
    if (!GameComponent) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white">
          <h2 className="text-2xl font-bold mb-4">Game Not Found</h2>
          <button 
            onClick={exitGameMode}
            className="px-6 py-2 bg-pink-500 rounded-full font-bold"
          >
            Go Back
          </button>
        </div>
      );
    }

    return <GameComponent onExit={exitGameMode} boardId={selectedGame?.boardId} sessionId={currentSessionId} />;
  };

  return (
    <>
      {currentView === 'home' && renderHome()}
      {currentView === 'instructions' && renderInstructions()}
      {currentView === 'playing' && renderGameplay()}
    </>
  );
}