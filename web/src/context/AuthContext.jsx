import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check if user is logged in on load
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      // Note: We use relative path assuming built structure
      // In dev mode, you might need a proxy or full URL
      const res = await fetch('api/auth.php?action=check');
      const data = await res.json();
      if (data.success) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error("Auth Check Failed", err);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const res = await fetch('api/auth.php?action=login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (data.success) {
      setUser(data.user);
      return { success: true };
    }
    return { success: false, message: data.message };
  };

  const register = async (email, password) => {
    const res = await fetch('api/auth.php?action=register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (data.success) {
      setUser(data.user);
      return { success: true };
    }
    return { success: false, message: data.message };
  };


  const logout = async () => {
    await fetch('api/auth.php?action=logout');
    setUser(null);
  };

  const updateCredits = async (amount, description) => {
    try {
      const res = await fetch('api/auth.php?action=transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, description })
      });
      const data = await res.json();
      if (data.success) {
        // update local user state with new credit amount
        setUser(prev => ({ ...prev, credits: data.credits }));
        return { success: true, credits: data.credits };
      }
      return { success: false, message: data.message };
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  const startSession = async (boardId, gameName) => {
    try {
      const res = await fetch('api/auth.php?action=start_session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ board_id: boardId, game_name: gameName })
      });
      const data = await res.json();
      if (data.success) {
        setUser(prev => ({ ...prev, credits: data.credits }));
        return { success: true, sessionId: data.session_id };
      }
      return { success: false, message: data.message };
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  const endSession = async (sessionId, score) => {
    try {
      const res = await fetch('api/auth.php?action=end_session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, score })
      });
      return await res.json();
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  const changePassword = async (currentPassword, newPassword) => {
    try {
      const res = await fetch('api/auth.php?action=change_password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
      });
      const data = await res.json();
      return data;
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, startSession, endSession, updateCredits, changePassword, loading, refreshUser: checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

// The following export is a custom hook, not a component. Disable
// the react-refresh/only-export-components rule which would otherwise
// complain during development hot reloads.
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
