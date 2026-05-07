import { useTheme } from '../../context/ThemeContext';

export default function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme();

  const iconClass =
    theme === 'dark' ? 'fa-solid fa-moon' :
    theme === 'light' ? 'fa-solid fa-sun' :
    'fa-solid fa-circle-half-stroke';

  return (
    <button
      className={`btn btn-ghost btn-sm ${className}`}
      aria-label="Toggle theme"
      onClick={toggleTheme}
      id="theme-toggle"
    >
      <i className={iconClass}></i>
    </button>
  );
}
