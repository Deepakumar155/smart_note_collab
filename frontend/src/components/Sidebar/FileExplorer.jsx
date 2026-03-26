import React, { useRef, useState } from 'react';
import api from '../../api';

export default function FileExplorer({ roomId, files, activeFile, onFileChange, onFilesUpdated }) {
  const [isUploading, setIsUploading] = useState(false);
  const [modal, setModal] = useState({ show: false, type: '', initialValue: '', target: null });
  const [inputValue, setInputValue] = useState('');
  const fileInputRef = useRef(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    setIsUploading(true);
    try {
      const { data } = await api.post(`/docs/${roomId}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      onFilesUpdated([...files, data.file]);
    } catch (err) {
      alert(err.response?.data?.message || 'Upload failed');
    }
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openModal = (type, target = null) => {
    const initialValue = type === 'rename' ? target : '';
    setModal({ show: true, type, initialValue, target });
    setInputValue(initialValue);
  };

  const closeModal = () => {
    setModal({ show: false, type: '', initialValue: '', target: null });
    setInputValue('');
  };

  const handleModalSubmit = async () => {
    if (modal.type === 'create') {
      if (!inputValue) return;
      try {
        const { data } = await api.post(`/docs/${roomId}/files/create`, { filename: inputValue });
        onFilesUpdated([...files, data.file]);
        closeModal();
      } catch (err) {
        alert(err.response?.data?.message || 'Failed to create file');
      }
    } else if (modal.type === 'rename') {
      const oldFilename = modal.target;
      if (!inputValue || inputValue === oldFilename) return;
      try {
        await api.put(`/docs/${roomId}/files/rename`, { oldFilename, newFilename: inputValue });
        const updatedFiles = files.map(f => 
          f.filename === oldFilename ? { ...f, filename: inputValue } : f
        );
        onFilesUpdated(updatedFiles);
        closeModal();
      } catch (err) {
        alert(err.response?.data?.message || 'Failed to rename file');
      }
    } else if (modal.type === 'delete') {
      const filename = modal.target;
      try {
        await api.delete(`/docs/${roomId}/files/delete`, { data: { filename } });
        const updatedFiles = files.filter(f => f.filename !== filename);
        onFilesUpdated(updatedFiles);
        closeModal();
      } catch (err) {
        alert(err.response?.data?.message || 'Failed to delete file');
      }
    }
  };

  const handleDownload = (filename) => {
    const token = localStorage.getItem('token');
    const url = `${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'||'https://your-backend.onrender.com/api'}/docs/${roomId}/download/${filename}`;
    
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.blob())
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      })
      .catch(console.error);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border-r border-slate-700 relative">
      <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
        <h3 className="font-semibold text-slate-200 uppercase tracking-wide text-xs">Explorer</h3>
        
        <div className="flex gap-2">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
          />
          <button 
            onClick={() => openModal('create')}
            className="text-[10px] bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded transition flex items-center gap-1"
            title="New file"
          >
            <span>+</span> New
          </button>
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-300 px-2 py-1 rounded transition"
            title="Upload file"
          >
            {isUploading ? '...' : 'Upload'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {files.map((file, idx) => (
          <div 
            key={idx}
            className={`group flex items-center justify-between px-3 py-2 text-sm rounded cursor-pointer transition-colors ${
              activeFile?.filename === file.filename 
                ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' 
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-transparent'
            }`}
            onClick={() => onFileChange(file)}
          >
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="text-slate-500 text-xs">📄</span>
              <span className="truncate">{file.filename}</span>
            </div>
            
            <div className="flex items-center opacity-0 group-hover:opacity-100 transition ml-2 shrink-0">
              <button 
                onClick={(e) => { e.stopPropagation(); openModal('rename', file.filename); }}
                className="text-slate-500 hover:text-yellow-500 p-1"
                title="Rename"
              >
                ✎
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); openModal('delete', file.filename); }}
                className="text-slate-500 hover:text-red-500 p-1"
                title="Delete"
              >
                ✕
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); handleDownload(file.filename); }}
                className="text-slate-500 hover:text-blue-400 p-1"
                title="Download"
              >
                ⬇
              </button>
            </div>
          </div>
        ))}
        {files.length === 0 && (
          <div className="text-center text-slate-500 text-sm mt-4">
            No files available
          </div>
        )}
      </div>

      {/* Custom Modal */}
      {modal.show && (
        <div className="absolute inset-0 z-50 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 w-full max-w-[220px] shadow-2xl animate-in fade-in zoom-in duration-200">
            <h4 className="text-xs font-bold text-slate-300 uppercase mb-3">
              {modal.type === 'create' ? 'New File' : modal.type === 'rename' ? 'Rename File' : 'Delete File?'}
            </h4>
            
            {modal.type !== 'delete' ? (
              <input 
                autoFocus
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleModalSubmit()}
                className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500 mb-4"
                placeholder="filename.js"
              />
            ) : (
              <p className="text-xs text-slate-400 mb-4">Are you sure you want to delete <span className="text-red-400 font-mono">{modal.target}</span>?</p>
            )}

            <div className="flex gap-2">
              <button 
                onClick={handleModalSubmit}
                className={`flex-1 text-[11px] font-semibold py-1.5 rounded transition ${modal.type === 'delete' ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
              >
                {modal.type === 'delete' ? 'Delete' : 'Confirm'}
              </button>
              <button 
                onClick={closeModal}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-[11px] font-semibold py-1.5 rounded transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
