import { useState, useRef, useCallback } from 'react';

export default function TagInput({ id, hiddenId, initialTags = [], onChange, placeholder = 'Type and press Enter' }) {
  const [tags, setTags] = useState(initialTags);
  const inputRef = useRef(null);

  const updateTags = useCallback((newTags) => {
    setTags(newTags);
    if (onChange) onChange(newTags);
  }, [onChange]);

  const addTag = useCallback((text) => {
    const trimmed = text.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    updateTags([...tags, trimmed]);
  }, [tags, updateTags]);

  const removeTag = useCallback((index) => {
    updateTags(tags.filter((_, i) => i !== index));
  }, [tags, updateTags]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputRef.current.value);
      inputRef.current.value = '';
    }
    if (e.key === 'Backspace' && !inputRef.current.value && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  };

  return (
    <>
      <div
        className="tag-input-wrap"
        id={id}
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag, i) => (
          <span key={i} className="badge badge-neutral" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            {tag}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(i); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '14px', padding: 0, lineHeight: 1 }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          placeholder={tags.length === 0 ? placeholder : ''}
          onKeyDown={handleKeyDown}
          style={{
            flex: 1, minWidth: '80px', border: 'none', background: 'none',
            outline: 'none', color: 'var(--text)', fontSize: '14px', padding: '4px 0',
          }}
        />
      </div>
      <input type="hidden" id={hiddenId} value={JSON.stringify(tags)} />
    </>
  );
}

/** Helper to get/set tags from outside (imperative) */
TagInput.getTags = (tags) => tags;
TagInput.setTags = (setFn, newTags) => setFn(newTags);
