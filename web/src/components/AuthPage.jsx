import React, { useState } from 'react';
import { Eye, EyeOff, Gamepad2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export default function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' or 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Manual validation
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        setError("Please enter a valid email address");
        return;
    }

    const fn = mode === 'login' ? login : register;
    const result = await fn(email, password);
    if (!result.success) {
      setError(result.message || 'Authentication failed');
    }
  };

  return (
    <div className="flex flex-col h-[100dvh] w-screen bg-gray-900 text-white overflow-hidden font-sans">
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

      <main className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
        <div className="w-full max-w-md p-8 space-y-6 bg-gray-800 rounded-xl shadow-lg border border-gray-700 relative overflow-hidden">
          
          {mode === 'register' && (
            <div className="absolute top-0 left-0 w-full bg-gradient-to-r from-pink-600 via-purple-600 to-cyan-600 p-2 text-center shadow-lg animate-pulse">
               <p className="font-black text-white text-xs uppercase tracking-widest">
                 🔥 Limited Offer: Get 1 FREE GAME! 🔥
               </p>
            </div>
          )}

          <h2 className="text-3xl font-extrabold text-center mt-6">
          {mode === 'login' ? 'Sign in to your account' : 'Create a new account'}
        </h2>
        {error && <p className="text-red-400 text-center">{error}</p>}
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email" className="sr-only">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="relative block w-full appearance-none rounded-none rounded-t-md border border-gray-700 bg-gray-900 px-3 py-2 text-gray-300 placeholder-gray-500 focus:z-10 focus:border-cyan-500 focus:outline-none focus:ring-cyan-500 sm:text-sm"
                placeholder="Email address"
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="relative block w-full appearance-none rounded-none rounded-b-md border border-gray-700 bg-gray-900 px-3 py-2 pr-10 text-gray-300 placeholder-gray-500 focus:z-10 focus:border-cyan-500 focus:outline-none focus:ring-cyan-500 sm:text-sm"
                  placeholder="Password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-10 pointer-events-auto text-gray-400 hover:text-gray-200 focus:outline-none"
                  title={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex="0"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </div>

          <div>
            <button
              type="submit"
              className="group relative flex w-full justify-center rounded-md border border-transparent bg-cyan-500 py-2 px-4 text-sm font-medium text-white hover:bg-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2"
            >
              {mode === 'login' ? 'Sign in' : 'Register'}
            </button>
          </div>
        </form>

        <div className="text-center text-sm text-gray-400">
          {mode === 'login' ? (
            <>
              Don't have an account?{' '}
              <button
                className="text-cyan-400 hover:text-cyan-300 font-bold transition-colors"
                onClick={() => { setMode('register'); setError(null); }}
              >
                Sign up & Play FREE!
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                className="text-cyan-400 hover:text-cyan-300 transition-colors"
                onClick={() => { setMode('login'); setError(null); }}
              >
                Log in
              </button>
            </>
          )}
        </div>
      </div>
      </main>

      <footer className="shrink-0 text-center py-4 bg-gray-900/95 backdrop-blur-sm border-t border-white/5 z-20">
        <div className="inline-block bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-bold px-4 py-2 rounded-full tracking-wider uppercase">
          Help kids code!
        </div>
      </footer>
    </div>
  );
}
