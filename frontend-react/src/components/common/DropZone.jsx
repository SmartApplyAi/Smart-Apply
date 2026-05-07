import { useState, useRef, useCallback } from 'react';

export default function DropZone({
  onFileSelect,
  accept = '.pdf',
  maxSize = 5 * 1024 * 1024,
  label = 'Drop your PDF here',
  sublabel = 'or click to browse · Max 5MB',
  icon = 'fa-solid fa-file-pdf',
  iconColor = 'var(--danger)',
  id,
}) {
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState('');
  const inputRef = useRef(null);

  const processFile = useCallback((file) => {
    if (!file) return;
    if (accept === '.pdf' && file.type !== 'application/pdf') {
      alert('Only PDF files are accepted');
      return;
    }
    if (file.size > maxSize) {
      alert(`File too large. Max ${Math.round(maxSize / 1024 / 1024)}MB.`);
      return;
    }
    setFileName(file.name);
    setFileSize((file.size / 1024).toFixed(0) + ' KB');
    if (onFileSelect) onFileSelect(file);
  }, [accept, maxSize, onFileSelect]);

  return (
    <div
      className={`upload-zone${dragOver ? ' dragover' : ''}`}
      id={id}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        processFile(e.dataTransfer.files[0]);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={(e) => processFile(e.target.files[0])}
        style={{ display: 'none' }}
      />
      <div className="upload-icon">
        <i className={icon} style={{ color: iconColor }}></i>
      </div>
      <h3>{fileName || label}</h3>
      <p className="text-muted">{fileName ? fileSize : sublabel}</p>
    </div>
  );
}
