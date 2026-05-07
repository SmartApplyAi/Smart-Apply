import { useRef, useCallback } from 'react';

export default function PinInput({ length = 6, value = '', onChange }) {
  const inputsRef = useRef([]);

  const handleInput = useCallback((idx, e) => {
    const val = e.target.value.replace(/\D/g, '');
    e.target.value = val;

    const newPin = value.split('');
    newPin[idx] = val;
    const result = newPin.join('').slice(0, length);
    onChange(result);

    if (val && idx < length - 1) {
      inputsRef.current[idx + 1]?.focus();
    }
  }, [value, onChange, length]);

  const handleKeyDown = useCallback((idx, e) => {
    if (e.key === 'Backspace' && !e.target.value && idx > 0) {
      const newPin = value.split('');
      newPin[idx - 1] = '';
      onChange(newPin.join(''));
      inputsRef.current[idx - 1]?.focus();
    }
  }, [value, onChange]);

  const handlePaste = useCallback((e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, length);
    onChange(text);
    const focusIdx = Math.min(text.length, length - 1);
    inputsRef.current[focusIdx]?.focus();
  }, [onChange, length]);

  return (
    <div className="pin-inputs" id="pin-inputs">
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={(el) => (inputsRef.current[i] = el)}
          type="text"
          maxLength={1}
          inputMode="numeric"
          pattern="[0-9]"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          value={value[i] || ''}
          className={value[i] ? 'filled' : ''}
          onChange={(e) => handleInput(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={i === 0 ? handlePaste : undefined}
        />
      ))}
    </div>
  );
}
