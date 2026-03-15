import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function UserPresence({ users, roomId }) {
  const navigate = useNavigate();

  const handleLeave = () => {
    navigate('/dashboard');
  };

  return (
    <div className="h-14 bg-slate-800 border-b border-slate-700 flex items-center justify-between px-6 shrink-0 z-10">
      <div className="flex items-center gap-4">
        <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
          {"</>"} CollabEdit
        </h1>
        <div className="h-4 w-px bg-slate-600 mx-2"></div>
        <div className="text-sm font-medium text-slate-300">
          Room: <span className="text-white font-mono">{roomId}</span>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 uppercase tracking-widest font-semibold">Active Users: {users.length}</span>
          <div className="flex -space-x-2">
            {users.map((u, i) => (
              <div 
                key={i} 
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm ring-2 ring-slate-800"
                style={{ backgroundColor: u.color || '#3b82f6' }}
                title={u.username}
              >
                {u.username.charAt(0).toUpperCase()}
              </div>
            ))}
          </div>
        </div>

        <button 
          onClick={handleLeave}
          className="text-sm bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 px-4 py-1.5 rounded transition"
        >
          Leave Room
        </button>
      </div>
    </div>
  );
}
