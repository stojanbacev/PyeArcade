import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

export default function ChangePassword({ onDone }) {
  const { changePassword, user } = useAuth();
  const [current, setCurrent] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    if (newPass !== confirm) {
      setError('New passwords do not match');
      setLoading(false);
      return;
    }

    const res = await changePassword(current, newPass);
    setLoading(false);
    
    if (!res.success) {
      setError(res.message || 'Password change failed');
    } else {
      setError(null);
      setSuccess(true);
      // Auto-return after 2 seconds
      setTimeout(() => onDone(), 2000);
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
      <div className="w-full max-w-md p-8 space-y-6 bg-gray-800 rounded-xl shadow-lg">
        <h2 className="text-3xl font-extrabold text-center">Change Password</h2>
        {error && <p className="text-red-400 text-center">{error}</p>}
        {success && (
          <p className="text-green-400 text-center">Password updated successfully.</p>
        )}
        {!success && (
          <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
            {/* Hidden username field for accessibility and password manager support */}
            <input
              type="text"
              autoComplete="username"
              value={user?.email || ''}
              readOnly
              style={{ display: 'none' }}
              aria-hidden="true"
            />
            <div className="rounded-md shadow-sm -space-y-px">
              <div>
                <label htmlFor="current" className="sr-only">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    id="current"
                    name="current"
                    type={showCurrent ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={current}
                    onChange={(e) => setCurrent(e.target.value)}
                    className="relative block w-full appearance-none rounded-none rounded-t-md border border-gray-700 bg-gray-900 px-3 py-2 pr-10 text-gray-300 placeholder-gray-500 focus:z-10 focus:border-cyan-500 focus:outline-none focus:ring-cyan-500 sm:text-sm"
                    placeholder="Current Password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(!showCurrent)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                    title={showCurrent ? 'Hide password' : 'Show password'}
                  >
                    {showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="new" className="sr-only">
                  New Password
                </label>
                <div className="relative">
                  <input
                    id="new"
                    name="new"
                    type={showNew ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    className="relative block w-full appearance-none rounded-none border border-gray-700 bg-gray-900 px-3 py-2 pr-10 text-gray-300 placeholder-gray-500 focus:z-10 focus:border-cyan-500 focus:outline-none focus:ring-cyan-500 sm:text-sm"
                    placeholder="New Password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                    title={showNew ? 'Hide password' : 'Show password'}
                  >
                    {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="confirm" className="sr-only">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    id="confirm"
                    name="confirm"
                    type={showConfirm ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="relative block w-full appearance-none rounded-none rounded-b-md border border-gray-700 bg-gray-900 px-3 py-2 pr-10 text-gray-300 placeholder-gray-500 focus:z-10 focus:border-cyan-500 focus:outline-none focus:ring-cyan-500 sm:text-sm"
                    placeholder="Confirm New Password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200"
                    title={showConfirm ? 'Hide password' : 'Show password'}
                  >
                    {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="group relative flex w-full justify-center rounded-md border border-transparent bg-cyan-500 py-2 px-4 text-sm font-medium text-white hover:bg-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Updating...' : 'Change Password'}
              </button>
            </div>
          </form>
        )}

        <div className="text-center text-sm">
          <button
            className="text-cyan-400 hover:underline"
            onClick={() => onDone()}
          >
            {success ? 'Back to home' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}
