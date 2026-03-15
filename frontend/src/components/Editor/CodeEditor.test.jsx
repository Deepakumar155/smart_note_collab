import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CodeEditor from './CodeEditor';

// Mock Monaco Editor as it's hard to test in JSDOM
vi.mock('@monaco-editor/react', () => {
  return {
    default: (props) => (
      <textarea
        data-testid="monaco-editor"
        defaultValue={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    ),
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

  it('renders the editor with file content', () => {
    render(<CodeEditor activeFile={mockFile} />);
    const editor = screen.getByTestId('monaco-editor');
    expect(editor).toBeInTheDocument();
    expect(editor.value).toBe(mockFile.content);
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
