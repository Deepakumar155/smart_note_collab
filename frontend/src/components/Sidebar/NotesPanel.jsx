import React, { useState, useEffect } from 'react';
import socket from '../../socket';

export default function NotesPanel({ roomId, activeFile }) {
  const [notes, setNotes] = useState('');

  useEffect(() => {
    // Initialize notes when file changes
    setNotes(activeFile?.notes || '');

    const handleNotesChange = ({ filename, notes: newNotes }) => {
      if (filename === activeFile?.filename) {
        setNotes(newNotes);
      }
    };

    socket.on('notes-change', handleNotesChange);

    return () => {
      socket.off('notes-change', handleNotesChange);
    };
  }, [activeFile]);

  const handleChange = (e) => {
    const val = e.target.value;
    setNotes(val);
    if (activeFile) {
      socket.emit('notes-change', {
        roomId,
        filename: activeFile.filename,
        notes: val
      });
    }
  };

  return (
    <div className="h-full flex flex-col p-4">
      <div className="mb-2 text-sm text-slate-400">
        Collaborative notes for <span className="text-blue-400 font-mono">{activeFile?.filename}</span>
      </div>
      <textarea
        value={notes}
        onChange={handleChange}
        placeholder="Write your shared notes here..."
        className="flex-1 w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-sm text-slate-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none transition-all"
      />
    </div>
  );
}
