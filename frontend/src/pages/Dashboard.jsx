import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

export default function Dashboard() {
  const [roomId, setRoomId] = useState('');
  const [password, setPassword] = useState('');
  const [initialFile, setInitialFile] = useState('index.js');
  const [isJoining, setIsJoining] = useState(true);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      navigate('/login');
    } else {
      setUser(JSON.parse(userData));
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      if (isJoining) {
        // Join Room
        const { data } = await api.post('/docs/join', { roomId, password });
        navigate(`/room/${data.roomId}`, { state: { password } });
      } else {
        // Create Room
        const { data } = await api.post('/docs/new', { roomId, password, initialFile });
        navigate(`/room/${data.roomId}`, { state: { password } });
      }
    } catch (err) {
      setError(err.response?.data?.message || 'An error occurred');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200">
      <nav className="bg-slate-800 border-b border-slate-700 px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <span className="text-blue-500">{"</>"}</span> CollabEdit
        </h1>
        <div className="flex items-center gap-4">
          <span>Welcome, <strong className="text-white">{user?.username}</strong></span>
          <button 
            onClick={handleLogout}
            className="text-sm bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded transition"
          >
            Logout
          </button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto mt-12 px-4">
        <div className="text-center mb-10">
          <h2 className="text-4xl font-extrabold text-white mb-4">Start Coding Together</h2>
          <p className="text-slate-400 text-lg">Create a new workspace or join an existing session.</p>
        </div>

        <div className="bg-slate-800 rounded-xl shadow-2xl overflow-hidden border border-slate-700 max-w-md mx-auto">
          <div className="flex border-b border-slate-700">
            <button 
              className={`flex-1 py-4 text-center font-medium transition-colors ${isJoining ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              onClick={() => setIsJoining(true)}
            >
              Join Room
            </button>
            <button 
              className={`flex-1 py-4 text-center font-medium transition-colors ${!isJoining ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              onClick={() => setIsJoining(false)}
            >
              Create Room
            </button>
          </div>

          <div className="p-6">
            {error && <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-2 rounded mb-4 text-sm">{error}</div>}
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Room ID</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g., project-alpha"
                  className="w-full bg-slate-900 border border-slate-600 rounded px-4 py-2 focus:outline-none focus:border-blue-500 transition-colors"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
                <input 
                  type="password" 
                  required
                  placeholder="Room access password"
                  className="w-full bg-slate-900 border border-slate-600 rounded px-4 py-2 focus:outline-none focus:border-blue-500 transition-colors"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {!isJoining && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Initial File</label>
                  <input 
                    type="text" 
                    placeholder="e.g., main.js"
                    className="w-full bg-slate-900 border border-slate-600 rounded px-4 py-2 focus:outline-none focus:border-blue-500 transition-colors"
                    value={initialFile}
                    onChange={(e) => setInitialFile(e.target.value)}
                  />
                </div>
              )}

              <button 
                type="submit" 
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded transition-colors mt-2"
              >
                {isJoining ? 'Join Session' : 'Create & Enter'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
