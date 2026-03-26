import React, { useRef, useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import socket from '../../socket';

export default function CodeEditor({ roomId, activeFile, users, userId, onContentChange }) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const decorationsRef = useRef([]);
  const allLocksRef = useRef({}); // { [filename]: { [line]: lockInfo } }
  const lineLocksRef = useRef({}); // { [line]: lockInfo } for CURRENT file

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
      
      // Update locks for NOT resetting on file change, but FETCH from allLocksRef
      lineLocksRef.current = allLocksRef.current[activeFile.filename] || {};
      updateDecorations();
      setSavedStatus(null);
    }
  }, [activeFile?.filename]); // ONLY on filename change to follow current file's locks

  const updateDecorations = () => {
    if (!editorRef.current || !monacoRef.current) return;

    const newDecorations = [];

    // Line locks
    for (const [line, lockInfo] of Object.entries(lineLocksRef.current)) {
      const isLockedByMe = String(lockInfo.lockedBy) === String(userId);
      const lockedBy = lockInfo.lockedBy;
      
      newDecorations.push({
        range: new monacoRef.current.Range(parseInt(line), 1, parseInt(line), 1),
        options: {
          isWholeLine: true,
          className: isLockedByMe ? 'my-locked-line-decoration' : 'locked-line-decoration',
          glyphMarginClassName: isLockedByMe ? 'my-lock-icon' : 'lock-icon',
          glyphMarginHoverMessage: { value: isLockedByMe ? 'You have locked this line' : `Locked by ${lockInfo.username || 'another user'}` },
          stickiness: monacoRef.current.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
        }
      });
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
      // Store globally for all files
      allLocksRef.current[filename] = locks;
      
      // Update current file if it matches
      if (filename === activeFile?.filename) {
        lineLocksRef.current = locks;
        updateDecorations();
      }
    };

    const handleLinesUnlocked = ({ userId: unlockedUserId }) => {
      // Remove all locks for this user across all files
      for (const filename in allLocksRef.current) {
        const locks = allLocksRef.current[filename];
        let changed = false;
        for (const line in locks) {
          if (locks[line].lockedBy === unlockedUserId) {
            delete locks[line];
            changed = true;
          }
        }
        if (changed && filename === activeFile?.filename) {
          lineLocksRef.current = { ...locks };
          updateDecorations();
        }
      }
    };

    socket.on('content-change', handleContentChange);
    socket.on('line-lock-broadcast', handleLineLocks);
    socket.on('lines-unlocked', handleLinesUnlocked);
    
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
      socket.off('lines-unlocked', handleLinesUnlocked);
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

    const lastCursorEmitRef = { current: 0 };
    editor.onDidChangeCursorPosition((e) => {
      const now = Date.now();
      if (now - lastCursorEmitRef.current > 100) { // Throttle to 100ms
        socket.emit('cursor-move', {
          roomId: roomIdRef.current,
          filename: activeFileRef.current?.filename,
          line: e.position.lineNumber,
          column: e.position.column,
          color: '#ff0000'
        });
        lastCursorEmitRef.current = now;
      }
    });

    editor.onMouseDown((e) => {
      if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN || 
          e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS) {
        const lineNumber = e.target.position.lineNumber;
        toggleLock(lineNumber);
      }
    });

    // Run decoration update once to handle initial load
    updateDecorations();
  };

  const toggleLock = (line) => {
    const isLocked = lineLocksRef.current[line];
    const isLockedByMe = isLocked && isLocked.lockedBy === userId;

    if (!isLocked) {
      // Request lock
      socket.emit('line-lock', {
        roomId: roomIdRef.current,
        filename: activeFileRef.current?.filename,
        line: line
      });
    } else if (isLockedByMe) {
      // Request unlock
      socket.emit('line-unlock', {
        roomId: roomIdRef.current,
        filename: activeFileRef.current?.filename,
        line: line
      });
    } else {
      // Locked by someone else
      alert('This line is locked by another user');
    }
  };

  const lastValueRef = useRef('');

  const handleEditorChange = (value, event) => {
    if (isRevertingRef.current || isIncomingChangeRef.current) return;
    
    // Check if the change is on a locked line (by someone else)
    // Check if ANY of the changes are on a locked line (by someone else)
    let isLockedEdit = false;
    for (const change of event.changes) {
      for (let i = change.range.startLineNumber; i <= change.range.endLineNumber; i++) {
        const lockInfo = lineLocksRef.current[i];
        const lockedBy = lockInfo ? lockInfo.lockedBy : null;
        if (lockedBy && String(lockedBy) !== String(userId)) {
          console.warn(`Line ${i} is locked by ${lockedBy}. Your ID: ${userId}`);
          isLockedEdit = true;
          break;
        }
      }
      if (isLockedEdit) break;
    }

    if (isLockedEdit) {
      // Revert the change immediately
      if (editorRef.current) {
        isRevertingRef.current = true;
        const model = editorRef.current.getModel();
        const position = editorRef.current.getPosition();
        
        console.warn('Enforcing read-only for locked line(s)');
        model.setValue(lastValueRef.current);
        editorRef.current.setPosition(position);
        
        isRevertingRef.current = false;
      }
      return; 
    }

    // Handle all changes in the event (usually just one)
    for (const change of event.changes) {
      // Calculate edit log info for this change
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
    }

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
          glyphMargin: true, // Enable glyph margin for lock icons
          lineNumbersMinChars: 3,
        }}
      />
    </div>
  );
}
