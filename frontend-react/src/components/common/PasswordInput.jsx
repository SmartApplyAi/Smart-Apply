import { useState } from 'react';

export default function PasswordInput({
  id,
  value,
  onChange,
  placeholder = 'Enter your password',
  autoComplete = 'current-password',
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="pw-wrap">
      <input
        type={visible ? 'text' : 'password'}
        id={id}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        className="pw-toggle"
        aria-label="Toggle password"
        onClick={() => setVisible((v) => !v)}
      >
        <i className={visible ? 'fa-regular fa-eye-slash' : 'fa-regular fa-eye'}></i>
      </button>
    </div>
  );
}
