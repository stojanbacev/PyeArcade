import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { Send, CheckCircle, ArrowLeft, Gamepad2 } from 'lucide-react';

export default function ContactPage({ onBack }) {
  const { user } = useAuth();
  const [subject, setSubject] = useState('General Issue');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('idle'); // idle, sending, success, error
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('sending');
    setErrorMsg('');

    try {
      const response = await fetch('api/contact.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: user?.id,
          email: user?.email,
          subject,
          message
        }),
      });

      const data = await response.json();

      if (data.success) {
        setStatus('success');
        setMessage('');
      } else {
        setStatus('error');
        setErrorMsg(data.message || 'Failed to send message.');
      }
    } catch (err) {
      console.error(err);
      setStatus('error');
      setErrorMsg('Network error. Please try again later.');
    }
  };

  if (status === 'success') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6 animate-fade-in">
        <div className="bg-gray-800 p-6 rounded-full mb-6 border border-green-500/30 shadow-[0_0_30px_rgba(34,197,94,0.2)]">
          <CheckCircle size={64} className="text-green-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Message Sent!</h2>
        <p className="text-gray-400 mb-8 max-w-sm">
          We've received your message and will get back to you at <span className="text-cyan-400">{user?.email}</span> shortly.
        </p>
        <button
          onClick={onBack}
          className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-lg font-bold transition-all active:scale-95"
        >
          Return to Home
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-gray-900 text-white overflow-hidden font-sans">
      <header className="relative flex justify-center items-center px-6 py-6 shrink-0 border-b border-gray-700/50">
        <button
          onClick={onBack}
          className="absolute left-6 p-2 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        <div className="flex items-center gap-4">
          <div className="bg-gray-800 p-3 rounded-full shadow-[0_0_15px_rgba(0,229,255,0.3)]">
            <Gamepad2 className="text-cyan-400" size={32} />
          </div>
          <div>
            <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">PYE CLUB</h1>
            <p className="text-gray-400 text-xs tracking-widest uppercase">Contact Support</p>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-md mx-auto">
          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <p className="text-gray-400 text-sm mb-6">
              Experiencing an issue with a game or your account? Let us know and we'll help you out.
            </p>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Subject
                </label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-600 text-white text-sm rounded-lg focus:ring-cyan-500 focus:border-cyan-500 block p-3"
                >
                  <option value="General Issue">General Issue</option>
                  <option value="Billing/Credits">Billing / Credits Issue</option>
                  <option value="Game Bug">Report a Bug</option>
                  <option value="Feedback">Feedback / Suggestion</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Message
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  rows="6"
                  className="w-full bg-gray-900 border border-gray-600 text-white text-sm rounded-lg focus:ring-cyan-500 focus:border-cyan-500 block p-3"
                  placeholder="Describe your issue in detail..."
                ></textarea>
              </div>

              {status === 'error' && (
                <div className="p-3 bg-red-900/30 border border-red-500/50 rounded-lg text-red-200 text-sm text-center">
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={status === 'sending' || !message.trim()}
                className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-bold transition-all active:scale-95 ${
                  status === 'sending' || !message.trim()
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20 hover:from-cyan-400 hover:to-blue-500'
                }`}
              >
                {status === 'sending' ? (
                  'Sending...'
                ) : (
                  <>
                    <Send size={18} /> Send Message
                  </>
                )}
              </button>
            </form>
          </div>
          
          <div className="mt-8 text-center">
            <p className="text-gray-500 text-xs">
              Or email us directly at <a href="mailto:contact@pyeclub.com" className="text-cyan-500 hover:underline">contact@pyeclub.com</a>
            </p>
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
