import React, { useEffect, useState } from 'react';
import api from '../../api';
import socket from '../../socket';

export default function HistoryPanel({ roomId, activeFile }) {
  const [logs, setLogs] = useState([]);
  const [versions, setVersions] = useState([]);
  const [tab, setTab] = useState('logs'); // 'logs' or 'versions'
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeFile) return;
    
    const fetchData = async () => {
      setLoading(true);
      try {
        const [logsRes, versionsRes] = await Promise.all([
          api.get(`/docs/${roomId}/logs/${activeFile.filename}`),
          api.get(`/docs/${roomId}/versions/${activeFile.filename}`)
        ]);
        
        // Sort newest first
        setLogs(logsRes.data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
        setVersions(versionsRes.data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
      } catch (err) {
        console.error('Failed to fetch history', err);
      }
      setLoading(false);
    };

    fetchData();

    // Listen for real-time log updates
    const handleLogUpdate = (data) => {
      if (data.filename === activeFile.filename) {
        setLogs(data.logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
      }
    };

    socket.on('log-update', handleLogUpdate);

    return () => {
      socket.off('log-update', handleLogUpdate);
    };
  }, [roomId, activeFile?.filename]);

  const handleSaveVersion = async () => {
    try {
      const { data } = await api.post(`/docs/${roomId}/version`, {
        filename: activeFile.filename,
        content: activeFile.content
      });
      setVersions([data.version, ...versions]);
      alert('Version saved successfully!');
    } catch (err) {
      console.error('Failed to save version');
      alert('Failed to save version');
    }
  };

  const handleRestore = async (versionId) => {
    try {
      await api.post(`/docs/${roomId}/restore-version`, {
        filename: activeFile.filename,
        versionId
      });
      
      // Refresh logs and versions to show restoration event
      const [logsRes, versionsRes] = await Promise.all([
        api.get(`/docs/${roomId}/logs/${activeFile.filename}`),
        api.get(`/docs/${roomId}/versions/${activeFile.filename}`)
      ]);
      setLogs(logsRes.data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
      setVersions(versionsRes.data.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
      
      alert('Version restored successfully');
    } catch (err) {
      console.error('Failed to restore version');
      alert('Failed to restore version');
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border-l border-slate-700">
      <div className="flex text-xs font-semibold bg-slate-800 border-b border-slate-700 shrink-0">
        <button 
          className={`flex-1 py-3 text-center transition ${tab === 'logs' ? 'text-white border-b-2 border-blue-500 bg-slate-700/50' : 'text-slate-400 hover:text-slate-200'}`}
          onClick={() => setTab('logs')}
        >
          Edit Logs
        </button>
        <button 
          className={`flex-1 py-3 text-center transition ${tab === 'versions' ? 'text-white border-b-2 border-blue-500 bg-slate-700/50' : 'text-slate-400 hover:text-slate-200'}`}
          onClick={() => setTab('versions')}
        >
          Versions
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loading && <div className="text-center text-slate-500 text-sm">Loading...</div>}
        
        {!loading && tab === 'logs' && (
          <div className="space-y-3">
            {logs.length === 0 && <div className="text-slate-500 text-sm italic">No edit logs found.</div>}
            {logs.map((log, i) => (
              <div key={i} className="bg-slate-800/80 p-3 rounded border border-slate-700 text-xs shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <span className="font-bold text-blue-400">{log.editedBy}</span>
                  <span className="text-slate-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="text-slate-300 mb-1">Edited line {log.lineNumber}</div>
                <div className="font-mono bg-red-900/20 text-red-300 p-1 mb-1 rounded line-through overflow-x-auto whitespace-pre">
                  {log.oldContent || '(empty)'}
                </div>
                <div className="font-mono bg-green-900/20 text-green-300 p-1 rounded overflow-x-auto whitespace-pre">
                  {log.newContent || '(empty)'}
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && tab === 'versions' && (
          <div className="space-y-4">
            <button 
              onClick={handleSaveVersion}
              className="w-full bg-blue-600/20 border border-blue-500 text-blue-400 hover:bg-blue-600 hover:text-white py-2 rounded text-sm font-medium transition"
            >
              📥 Save Current as Version
            </button>
            
            <div className="space-y-2">
              {versions.length === 0 && <div className="text-slate-500 text-sm italic text-center mt-4">No saved versions.</div>}
              {versions.map((v, i) => (
                <div key={i} className="bg-slate-800 p-3 rounded border border-slate-700 text-sm flex flex-col gap-2 shadow-sm">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-medium text-slate-300">By {v.savedBy}</span>
                    <span className="text-slate-500">{new Date(v.timestamp).toLocaleString()}</span>
                  </div>
                  <button 
                    onClick={() => handleRestore(v._id)}
                    className="mt-1 bg-slate-700 hover:bg-slate-600 text-white py-1 rounded text-xs transition border border-slate-600"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
