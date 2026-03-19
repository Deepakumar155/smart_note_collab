import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CodeEditor from './CodeEditor';

// Mock Monaco Editor as it's hard to test in JSDOM
vi.mock('@monaco-editor/react', () => {
  return {
    default: (props) => {
      const { onChange, onMount, path } = props;
      
      // Simulate onMount after initial render
      React.useEffect(() => {
        if (onMount) {
          const mockEditor = {
            getValue: vi.fn().mockReturnValue(''),
            setValue: vi.fn(),
            onDidChangeCursorPosition: vi.fn(),
            onDidBlurEditorText: vi.fn(),
            getModel: vi.fn().mockReturnValue({
              pushEditOperations: vi.fn()
            }),
            getPosition: vi.fn().mockReturnValue({ lineNumber: 1, column: 1 }),
            setPosition: vi.fn()
          };
          onMount(mockEditor, { Range: vi.fn(), editor: { TrackedRangeStickiness: {} } });
        }
      }, []);

      return (
        <textarea
          data-testid="monaco-editor"
          data-path={path}
          onChange={(e) => {
            if (onChange) {
              onChange(e.target.value, {
                changes: [{
                  range: { startLineNumber: 1, endLineNumber: 1 },
                  rangeOffset: 0,
                  rangeLength: 0,
                  text: e.target.value
                }]
              });
            }
          }}
        />
      );
    },
  };
});

vi.mock('../../socket', () => {
  return {
    default: {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
    },
  };
});

describe('CodeEditor Component', () => {
  const mockFile = {
    filename: 'test.js',
    content: 'console.log("hello");',
    language: 'javascript'
  };

  it('renders the editor', () => {
    render(<CodeEditor activeFile={mockFile} />);
    const editor = screen.getByTestId('monaco-editor');
    expect(editor).toBeInTheDocument();
  });

  it('displays the language hint correctly', () => {
    render(<CodeEditor activeFile={mockFile} />);
    expect(screen.getByText(/javascript/i)).toBeInTheDocument();
  });

  it('renders the Save button', () => {
    render(<CodeEditor activeFile={mockFile} />);
    const saveButton = screen.getByRole('button', { name: /save/i });
    expect(saveButton).toBeInTheDocument();
  });

  it('shows saving status on save button click', async () => {
    render(<CodeEditor activeFile={mockFile} />);
    const saveButton = screen.getByRole('button', { name: /save/i });
    
    fireEvent.click(saveButton);
    
    expect(screen.getByText(/saving/i)).toBeInTheDocument();
  });

  it('shows saved status when save-doc event is received', async () => {
    const { rerender } = render(<CodeEditor activeFile={mockFile} />);
    
    // Get the socket mock
    const socket = (await import('../../socket')).default;
    
    // Find the callback for 'save-doc'
    const saveDocCallback = socket.on.mock.calls.find(call => call[0] === 'save-doc')[1];
    
    // Trigger the callback
    act(() => {
      saveDocCallback({ filename: mockFile.filename, message: 'Saved successfully' });
    });
    
    expect(screen.getByText(/saved/i)).toBeInTheDocument();
  });
});
