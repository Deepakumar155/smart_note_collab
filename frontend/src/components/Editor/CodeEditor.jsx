import React, { useRef, useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import socket from '../../socket';

export default function CodeEditor({ roomId, activeFile, users, userId, onContentChange }) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const decorationsRef = useRef([]);
  const lineLocksRef = useRef({}); // { [line]: userId }

  const [content, setContent] = useState('');
  const [localChangeIdx, setLocalChangeIdx] = useState(0);
  const [savedStatus, setSavedStatus] = useState(null); // 'saving', 'saved', or null
  const isRevertingRef = useRef(false);
  const isIncomingChangeRef = useRef(false);
  
  // Use refs for props used in event listener closures to avoid stale closure issues
  const activeFileRef = useRef(activeFile);
  const roomIdRef = useRef(roomId);

  useEffect(() => {
    activeFileRef.current = activeFile;
  }, [activeFile]);

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  // Update editor content when activeFile changes (initial load or switch)
  useEffect(() => {
    if (activeFile && editorRef.current) {
      if (editorRef.current.getValue() !== activeFile.content) {
        isIncomingChangeRef.current = true;
        editorRef.current.setValue(activeFile.content);
        lastValueRef.current = activeFile.content;
        isIncomingChangeRef.current = false;
      }
      // Reset locks and decorations on file change locally
      lineLocksRef.current = {};
      updateDecorations();
      setSavedStatus(null);
    }
  }, [activeFile?.filename]); // ONLY on filename change to avoid resets on content changes

  const updateDecorations = () => {
    if (!editorRef.current || !monacoRef.current) return;

    const newDecorations = [];

    // Line locks
    for (const [line, lockedBy] of Object.entries(lineLocksRef.current)) {
      if (lockedBy && lockedBy !== userId) { 
        newDecorations.push({
          range: new monacoRef.current.Range(parseInt(line), 1, parseInt(line), 1),
          options: {
            isWholeLine: true,
            className: 'locked-line-decoration',
            hoverMessage: { value: `Locked by ${lockedBy.substring(0, 6)}...` },
            stickiness: monacoRef.current.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
          }
        });
      }
    }

    decorationsRef.current = editorRef.current.deltaDecorations(
      decorationsRef.current,
      newDecorations
    );
  };

  useEffect(() => {
    const handleContentChange = (data) => {
      if (data.filename === activeFile?.filename && editorRef.current) {
        const currentVal = editorRef.current.getValue();
        if (currentVal !== data.content) {
          // Use executeEdits or setValue if major change to preserve some cursor state
          // For simplicity, setValue but only if actually different from what we have
          const position = editorRef.current.getPosition();
          isIncomingChangeRef.current = true;
          editorRef.current.setValue(data.content);
          editorRef.current.setPosition(position);
          lastValueRef.current = data.content;
          isIncomingChangeRef.current = false;
        }
      }
    };

    const handleLineLocks = ({ filename, locks }) => {
      if (filename === activeFile?.filename) {
        const parsedLocks = {};
        for (const line in locks) {
          parsedLocks[line] = locks[line].lockedBy;
        }
        lineLocksRef.current = parsedLocks;
        updateDecorations();
      }
    };

    socket.on('content-change', handleContentChange);
    socket.on('line-lock-broadcast', handleLineLocks);
    
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
      socket.off('content-change', handleContentChange);
      socket.off('line-lock-broadcast', handleLineLocks);
      socket.off('line-lock-error');
      socket.off('save-doc');
    };
  }, [activeFile?.filename]);

  const lastLockedLineRef = useRef(null);

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Set initial content if activeFile was already present
    if (activeFile) {
      isIncomingChangeRef.current = true;
      editor.setValue(activeFile.content);
      lastValueRef.current = activeFile.content;
      isIncomingChangeRef.current = false;
    }

    editor.onDidChangeCursorPosition((e) => {
      const newLine = e.position.lineNumber;
      
      socket.emit('cursor-move', {
        roomId: roomIdRef.current,
        filename: activeFileRef.current?.filename,
        line: newLine,
        column: e.position.column,
        color: '#ff0000'
      });

      // Request lock for current line only if it changed
      if (newLine !== lastLockedLineRef.current) {
        // Unlock previous line if it was us
        if (lastLockedLineRef.current) {
          socket.emit('line-unlock', {
            roomId: roomIdRef.current,
            filename: activeFileRef.current?.filename,
            line: lastLockedLineRef.current
          });
        }

        socket.emit('line-lock', {
          roomId: roomIdRef.current,
          filename: activeFileRef.current?.filename,
          line: newLine
        });
        lastLockedLineRef.current = newLine;
      }
    });

    // Remove lock when switching lines or blurring
    editor.onDidBlurEditorText(() => {
      if (lastLockedLineRef.current) {
        socket.emit('line-unlock', {
          roomId: roomIdRef.current,
          filename: activeFileRef.current?.filename,
          line: lastLockedLineRef.current
        });
        lastLockedLineRef.current = null;
      }
    });
  };

  const lastValueRef = useRef('');

  const handleEditorChange = (value, event) => {
    if (isRevertingRef.current || isIncomingChangeRef.current) return;
    
    // Check if the change is on a locked line (by someone else)
    const change = event.changes[0];
    if (!change) return;

    // Check all affected lines
    for (let i = change.range.startLineNumber; i <= change.range.endLineNumber; i++) {
      const lockedBy = lineLocksRef.current[i];
      if (lockedBy && lockedBy !== userId) {
        console.warn(`Line ${i} is locked by ${lockedBy}`);
        
        // Revert the change immediately
        if (editorRef.current) {
          const model = editorRef.current.getModel();
          isRevertingRef.current = true;
          
          // Get original text for the range
          const originalText = lastValueRef.current.substring(change.rangeOffset, change.rangeOffset + change.rangeLength);
          
          model.pushEditOperations(
            [],
            [{
              range: change.range,
              text: originalText,
              forceMoveMarkers: true
            }],
            () => null
          );
          
          isRevertingRef.current = false;
        }
        return; 
      }
    }

    // IMPORTANT: Calculate edit log info BEFORE updating lastValueRef
    const oldContent = lastValueRef.current.substring(change.rangeOffset, change.rangeOffset + change.rangeLength);
    const editLog = {
      lineNumber: change.range.startLineNumber,
      oldContent: oldContent,
      newContent: change.text
    };

    // Broadcast content and edit log together
    socket.emit('content-change', {
      roomId,
      filename: activeFile.filename,
      content: value,
      editLog
    });

    lastValueRef.current = value;
    setContent(value); // Keep setContent for UI components that might depend on it (like Savestatus)
    
    // Notify parent about local content change
    if (onContentChange) {
      onContentChange(value);
    }
  };

  const handleSave = () => {
    setSavedStatus('saving');
    socket.emit('save-doc', {
      roomId,
      filename: activeFile.filename,
      content: editorRef.current ? editorRef.current.getValue() : content
    });
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
  }, [activeFile]);

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
