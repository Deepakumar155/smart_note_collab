import React, { useState, useEffect, useRef } from 'react';
import socket from '../../socket';

export default function TerminalPanel({ roomId, activeFile }) {
  const [output, setOutput] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const terminalEndRef = useRef(null);

  useEffect(() => {
    const handleTerminalOutput = (data) => {
      if (data.roomId === roomId && data.filename === activeFile?.filename) {
        setOutput(prev => [...prev, data]);
        if (data.isRunning !== undefined) {
          setIsRunning(data.isRunning);
        }
      }
    };

    socket.on('terminal-output', handleTerminalOutput);

    return () => {
      socket.off('terminal-output', handleTerminalOutput);
    };
  }, [roomId, activeFile]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [output]);

  const handleRunCode = () => {
    if (!activeFile) return;
    setOutput([]); // Clear previous output on new run
    setIsRunning(true);
    socket.emit('run-code', {
      roomId,
      filename: activeFile.filename
    });

    // Safety timeout to reset isRunning if backend never responds
    setTimeout(() => {
      setIsRunning(current => {
        if (current) {
          setOutput(prev => [...prev, { 
            output: '\nExecution request sent, waiting for response...', 
            error: false 
          }]);
        }
        return current;
      });
    }, 5000);
  };

  const handleClear = () => {
    setOutput([]);
  };

  if (!activeFile) return null;

  const isExecutable = 
    activeFile.filename.endsWith('.js') || 
    activeFile.filename.endsWith('.py') || 
    activeFile.filename.endsWith('.java');

  return (
    <div className="h-64 bg-[#0d1117] border-t border-slate-700 flex flex-col font-mono text-sm shrink-0 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)]">
      <div className="flex justify-between items-center px-4 py-2 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <span className="text-slate-300 font-semibold tracking-wider text-xs uppercase">Terminal</span>
          {isExecutable && (
            <span className={`text-xs px-2 py-0.5 rounded-full ${isRunning ? 'bg-yellow-500/20 text-yellow-500' : 'bg-green-500/20 text-green-400'}`}>
              {isRunning ? 'Running...' : 'Ready'}
            </span>
          )}
        </div>
        
        <div className="flex gap-2">
          {isExecutable && (
            <button 
              onClick={handleRunCode}
              disabled={isRunning}
              className="flex items-center gap-1 bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded transition disabled:opacity-50"
            >
              ▶ Run
            </button>
          )}
          <button 
            onClick={handleClear}
            className="text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-slate-700 transition"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 text-slate-300 whitespace-pre-wrap">
        {!isExecutable && (
          <div className="text-slate-500 italic">Code execution is supported for .js, .py, and .java files.</div>
        )}
        {isExecutable && output.length === 0 && (
          <div className="text-slate-500 italic mb-2">
            Note: Code runs from the version saved in MongoDB. Use <kbd className="bg-slate-700 px-1 rounded text-xs">Ctrl+S</kbd> or click "Save" before running.
          </div>
        )}
        {output.map((line, i) => (
          <div key={i} className={`mb-1 ${line.error ? 'text-red-400' : 'text-slate-300'}`}>
            {line.output}
          </div>
        ))}
        {output.length === 0 && isExecutable && (
          <div className="text-slate-500 mt-2">Output will appear here...</div>
        )}
        <div ref={terminalEndRef} />
      </div>
    </div>
  );
}
