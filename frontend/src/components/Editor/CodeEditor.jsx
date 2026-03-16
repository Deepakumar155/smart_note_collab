import React, { useRef, useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import socket from '../../socket';

export default function CodeEditor({ roomId, activeFile, users }) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const decorationsRef = useRef([]);
  const lineLocksRef = useRef({}); // { [line]: userId }

  const [content, setContent] = useState('');
  const [localChangeIdx, setLocalChangeIdx] = useState(0);
  const [savedStatus, setSavedStatus] = useState(null); // 'saving', 'saved', or null

  // Update editor content when activeFile changes
  useEffect(() => {
    if (activeFile) {
      setContent(activeFile.content);
      // Reset locks and decorations on file change locally
      lineLocksRef.current = {};
      updateDecorations();
      setSavedStatus(null);
    }
  }, [activeFile?.filename, activeFile?.content]);

  const updateDecorations = () => {
    if (!editorRef.current || !monacoRef.current) return;

    const newDecorations = [];

    // Line locks
    for (const [line, lockedBy] of Object.entries(lineLocksRef.current)) {
      if (lockedBy !== socket.userId) { // Don't highlight our own locks as error
        newDecorations.push({
          range: new monacoRef.current.Range(parseInt(line), 1, parseInt(line), 1),
          options: {
            isWholeLine: true,
            className: 'locked-line-decoration',
            hoverMessage: { value: 'This line is locked by another user.' }
          }
        });
      }
    }

    // Since we don't have remote cursors fully managed in state here (for brevity), 
    // ideally we would add cursor decorations here too.

    decorationsRef.current = editorRef.current.deltaDecorations(
      decorationsRef.current,
      newDecorations
    );
  };

  useEffect(() => {
    socket.on('content-change', (data) => {
      if (data.filename === activeFile?.filename) {
        // Only update if it's not our own immediate echo (simplified handling)
        setContent(prevContent => {
          if (prevContent !== data.content) {
            lastValueRef.current = data.content;
            return data.content;
          }
          return prevContent;
        });
      }
    });

    socket.on('line-lock-broadcast', ({ filename, locks }) => {
      if (filename === activeFile?.filename) {
        const parsedLocks = {};
        for (const line in locks) {
          parsedLocks[line] = locks[line].lockedBy;
        }
        lineLocksRef.current = parsedLocks;
        updateDecorations();
      }
    });

    socket.on('line-lock-error', ({ filename, line, message }) => {
      if (filename === activeFile?.filename) {
        alert(message);
      }
    });

    socket.on('save-doc', ({ filename, message }) => {
      if (filename === activeFile?.filename) {
        setSavedStatus('saved');
        setTimeout(() => setSavedStatus(null), 3000);
      }
    });

    return () => {
      socket.off('content-change');
      socket.off('line-lock-broadcast');
      socket.off('line-lock-error');
      socket.off('save-doc');
    };
  }, [activeFile?.filename]);

  const lastLockedLineRef = useRef(null);

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    editor.onDidChangeCursorPosition((e) => {
      const newLine = e.position.lineNumber;
      
      socket.emit('cursor-move', {
        roomId,
        filename: activeFile.filename,
        line: newLine,
        column: e.position.column,
        color: '#ff0000'
      });

      // Request lock for current line only if it changed
      if (newLine !== lastLockedLineRef.current) {
        // Unlock previous line if it was us
        if (lastLockedLineRef.current) {
          socket.emit('line-unlock', {
            roomId,
            filename: activeFile.filename,
            line: lastLockedLineRef.current
          });
        }

        socket.emit('line-lock', {
          roomId,
          filename: activeFile.filename,
          line: newLine
        });
        lastLockedLineRef.current = newLine;
      }
    });

    // Remove lock when switching lines or blurring
    editor.onDidBlurEditorText(() => {
      if (lastLockedLineRef.current) {
        socket.emit('line-unlock', {
          roomId,
          filename: activeFile.filename,
          line: lastLockedLineRef.current
        });
        lastLockedLineRef.current = null;
      }
    });
  };

  const lastValueRef = useRef('');
  const logDebounceRef = useRef(null);

  useEffect(() => {
    if (activeFile) {
      lastValueRef.current = activeFile.content;
    }
  }, [activeFile?.filename]);

  const handleEditorChange = (value, event) => {
    // Check if the change is on a locked line (by someone else)
    const change = event.changes[0];
    if (!change) return;

    const changeLine = change.range.startLineNumber;
    const lockedBy = lineLocksRef.current[changeLine];
    
    if (lockedBy && lockedBy !== socket.userId) {
      console.warn(`Line ${changeLine} is locked by ${lockedBy}`);
      return; 
    }

    setContent(value);
    lastValueRef.current = value;

    // Calculate edit log info
    const oldContent = lastValueRef.current.substring(change.rangeOffset, change.rangeOffset + change.rangeLength);
    const editLog = {
      lineNumber: change.range.startLineNumber,
      oldContent: oldContent,
      newContent: change.text
    };

    // Broadcast content and edit log together for real-time responsiveness and server recording
    socket.emit('content-change', {
      roomId,
      filename: activeFile.filename,
      content: value,
      editLog
    });

    lastValueRef.current = value;
  };

  const handleSave = () => {
    setSavedStatus('saving');
    socket.emit('save-doc', {
      roomId,
      filename: activeFile.filename,
      content
    });
    // The socket listener for 'save-doc' will update it to 'saved'
  };

  useEffect(() => {
    const down = (e) => {
      if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSave();
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [content, activeFile]);

  return (
    <div className="flex-1 h-full relative bg-[#0d1117]">
      <div className="absolute top-0 right-0 z-10 p-2 flex items-center gap-2">
        {savedStatus && (
          <span className={`text-xs px-2 py-1 rounded shadow animate-pulse ${savedStatus === 'saved' ? 'text-green-400 bg-green-900/20' : 'text-blue-400 bg-blue-900/20'}`}>
            {savedStatus === 'saved' ? '✓ Saved' : 'Saving...'}
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={savedStatus === 'saving'}
          className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded shadow transition-colors font-medium border border-indigo-500 disabled:opacity-50"
        >
          Save
        </button>
        {/* Language hint */}
        <span className="text-xs bg-slate-800 text-slate-400 px-2 py-1 rounded shadow pointer-events-none border border-slate-700">
          {activeFile?.language || 'plaintext'}
        </span>
      </div>
      <Editor
        height="100%"
        theme="vs-dark"
        path={activeFile?.filename}
        language={activeFile?.language || 'javascript'}
        value={content}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          wordWrap: 'on',
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: true,
          formatOnPaste: true,
        }}
      />
    </div>
  );
}
