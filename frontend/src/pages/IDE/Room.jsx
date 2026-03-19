import React, { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import socket from '../../socket';
import api from '../../api';

import FileExplorer from '../../components/Sidebar/FileExplorer';
import CodeEditor from '../../components/Editor/CodeEditor';
import NotesPanel from '../../components/Sidebar/NotesPanel';
import HistoryPanel from '../../components/Sidebar/HistoryPanel';
import TerminalPanel from '../../components/Terminal/TerminalPanel';
import UserPresence from '../../components/TopBar/UserPresence';

export default function Room() {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  
  const [files, setFiles] = useState([]);
  const [activeFile, setActiveFile] = useState(null);
  const [users, setUsers] = useState([]);
  const [rightPanel, setRightPanel] = useState('notes'); // 'notes' or 'history'
  const password = location.state?.password || '';

  const user = JSON.parse(localStorage.getItem('user'));

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    // Verify room access
    api.post('/docs/join', { roomId, password })
      .then(({ data }) => {
        setFiles(data.files);
        if (data.files.length > 0) {
          setActiveFile(data.files[0]);
        }

        // Connect socket
        socket.auth = { token: localStorage.getItem('token') };
        socket.connect();
        
        socket.emit('join-doc', { 
          roomId, 
          password // Include password for server-side verification
        });

        socket.on('room-users', (usersList) => {
          setUsers(usersList);
        });

        socket.on('content-change', ({ filename, content }) => {
          setFiles(prevFiles => prevFiles.map(f => 
            f.filename === filename ? { ...f, content } : f
          ));
          
          // CRITICAL FIX: Ensure activeFile is kept in sync with real-time content
          // so that HistoryPanel (saving versions) and other components don't use stale state.
          setActiveFile(prev => {
            if (prev && prev.filename === filename) {
              return { ...prev, content };
            }
            return prev;
          });
          // We don't call setActiveFile(newObj) directly because CodeEditor 
          // handles its own real-time internal state updates from the same socket event.
          // Updating activeFile here causes a parent re-render which is fine if we only change content prop.
        });
        
        socket.on('notes-change', ({ filename, notes }) => {
          setFiles(prevFiles => prevFiles.map(f => 
            f.filename === filename ? { ...f, notes } : f
          ));

          // Also update activeFile notes
          setActiveFile(prev => {
            if (prev && prev.filename === filename) {
              return { ...prev, notes };
            }
            return prev;
          });
        });

        socket.on('file-created', ({ file }) => {
          setFiles(prev => [...prev.filter(f => f.filename !== file.filename), file]);
        });

        socket.on('file-renamed', ({ oldFilename, newFilename }) => {
          setFiles(prev => prev.map(f => 
            f.filename === oldFilename ? { ...f, filename: newFilename } : f
          ));
          setActiveFile(prev => {
            if (prev && prev.filename === oldFilename) {
              return { ...prev, filename: newFilename };
            }
            return prev;
          });
        });

        socket.on('file-deleted', ({ filename }) => {
          setFiles(prev => prev.filter(f => f.filename !== filename));
          setActiveFile(prev => {
            if (prev && prev.filename === filename) {
              return null;
            }
            return prev;
          });
        });

      })
      .catch((err) => {
        console.error('Room access error:', err);
        navigate('/dashboard');
      });

    return () => {
      socket.off('room-users');
      socket.off('content-change');
      socket.off('file-created');
      socket.off('file-renamed');
      socket.off('file-deleted');
      socket.disconnect();
    };
  }, [roomId, password, navigate]);

  const handleFileChange = (file) => {
    setActiveFile(file);
  };

  const handleFilesUpdated = (newFiles) => {
    setFiles(newFiles);
    if (!newFiles.find(f => f.filename === activeFile?.filename)) {
      setActiveFile(newFiles[0] || null);
    }
  };

  const handleLocalContentChange = (content) => {
    setActiveFile(prev => {
      if (prev) {
        return { ...prev, content };
      }
      return prev;
    });
  };

  if (!activeFile && files.length === 0) {
    return <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">Loading room...</div>;
  }

  return (
    <div className="h-screen flex flex-col bg-slate-900 text-slate-300 overflow-hidden font-sans">
      <UserPresence users={users} roomId={roomId} />
      
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-64 border-r border-slate-700 bg-slate-800/50 flex flex-col">
          <FileExplorer 
            roomId={roomId} 
            files={files} 
            activeFile={activeFile} 
            onFileChange={handleFileChange}
            onFilesUpdated={handleFilesUpdated}
          />
        </aside>

        {/* Center Editor area */}
        <main className="flex-1 flex flex-col overflow-hidden relative">
          <div className="flex-1 flex flex-col overflow-hidden">
            {activeFile ? (
              <CodeEditor 
                roomId={roomId}
                activeFile={activeFile}
                users={users}
                userId={user.id}
                onContentChange={handleLocalContentChange}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500">
                Select a file to start editing
              </div>
            )}
          </div>
          
          <TerminalPanel roomId={roomId} activeFile={activeFile} />
        </main>

        {/* Right Sidebar */}
        <aside className="w-80 border-l border-slate-700 bg-slate-800/50 flex flex-col">
          <div className="flex border-b border-slate-700">
            <button 
              className={`flex-1 py-3 text-sm font-medium ${rightPanel === 'notes' ? 'text-white border-b-2 border-blue-500 bg-slate-700/50' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/30'}`}
              onClick={() => setRightPanel('notes')}
            >
              Notes
            </button>
            <button 
              className={`flex-1 py-3 text-sm font-medium ${rightPanel === 'history' ? 'text-white border-b-2 border-blue-500 bg-slate-700/50' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/30'}`}
              onClick={() => setRightPanel('history')}
            >
              History
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {rightPanel === 'notes' && activeFile && (
              <NotesPanel roomId={roomId} activeFile={activeFile} />
            )}
            {rightPanel === 'history' && activeFile && (
              <HistoryPanel roomId={roomId} activeFile={activeFile} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
