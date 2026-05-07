import { getPasswordStrength, getStrengthColor } from '../../services/utils';

export default function PasswordStrength({ password = '' }) {
  const score = getPasswordStrength(password);
  const color = getStrengthColor(score);

  return (
    <div className="pw-strength">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="pw-bar"
          style={{
            background: i <= score ? color : undefined,
          }}
        ></div>
      ))}
    </div>
  );
}
