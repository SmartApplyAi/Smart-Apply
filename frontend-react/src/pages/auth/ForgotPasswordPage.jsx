import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import { getParam } from '../../services/utils';
import api from '../../services/api';
import Logo from '../../components/common/Logo';
import PasswordInput from '../../components/common/PasswordInput';
import PasswordStrength from '../../components/common/PasswordStrength';
import LoadingButton from '../../components/common/LoadingButton';
import ThemeToggle from '../../components/common/ThemeToggle';

export default function ForgotPasswordPage() {
  const token = getParam('token');
  const [step, setStep] = useState(token ? 'reset' : 'request');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const { showToast } = useToast();
  const navigate = useNavigate();

  const handleRequest = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!email.trim()) { setError('Please enter your email'); return; }
    setLoading(true);
    try {
      const data = await api.post('/auth/forgot-password', { email: email.trim() });
      setSuccess(data.message);
    } catch (err) {
      setError(err.detail || 'Something went wrong');
    } finally { setLoading(false); }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError(''); setFieldErrors({});
    const errs = {};
    if (newPassword.length < 8) errs.newPassword = 'Minimum 8 characters';
    if (newPassword !== confirmPassword) errs.confirmPassword = 'Passwords do not match';
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }

    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, new_password: newPassword, confirm_password: confirmPassword });
      showToast('Password reset! Redirecting…', 'success');
      setTimeout(() => navigate('/login?msg=reset'), 1500);
    } catch (err) {
      setError(err.detail || 'Reset failed.');
    } finally { setLoading(false); }
  };

  const inner = step === 'reset' ? (
    <div className="auth-card fade-in">
      <div className="auth-header">
        <Logo as="div" className="auth-logo" />
      </div>
      
      <h2>Set new password</h2>
      <p className="subtitle">Choose a strong, secure password</p>
      
      {error && <div className="alert alert-error" style={{ marginBottom: '16px' }}>{error}</div>}
      
      <div className="auth-body">
        <form onSubmit={handleReset} noValidate>
          <div className="form-stack">
            <div className={`form-group${fieldErrors.newPassword ? ' has-error' : ''}`}>
              <label><i className="fa-solid fa-lock"></i> New Password</label>
              <div className="input-wrapper">
                <PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 8 characters" autoComplete="new-password" />
              </div>
              <PasswordStrength password={newPassword} />
              {fieldErrors.newPassword && <span className="field-error">{fieldErrors.newPassword}</span>}
            </div>

            <div className={`form-group${fieldErrors.confirmPassword ? ' has-error' : ''}`}>
              <label><i className="fa-solid fa-lock"></i> Confirm Password</label>
              <div className="input-wrapper">
                <PasswordInput value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password" autoComplete="new-password" />
              </div>
              {fieldErrors.confirmPassword && <span className="field-error">{fieldErrors.confirmPassword}</span>}
            </div>

            <LoadingButton type="submit" className="btn btn-primary btn-block btn-lg" loading={loading}>
              <i className="fa-solid fa-key"></i> Reset Password
            </LoadingButton>
          </div>
        </form>
      </div>
    </div>
  ) : (
    <div className="auth-card fade-in">
      <div className="auth-header">
        <Logo as="div" className="auth-logo" />
      </div>

      <h2>Reset password</h2>
      <p className="subtitle">Enter your email and we will send a reset link</p>

      {error && <div className="alert alert-error" style={{ marginBottom: '16px' }}>{error}</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: '16px' }}>{success}</div>}

      <div className="auth-body">
        <form onSubmit={handleRequest} noValidate>
          <div className="form-stack">
            <div className="form-group">
              <label><i className="fa-solid fa-envelope"></i> Email Address</label>
              <div className="input-wrapper">
                <input type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <LoadingButton type="submit" className="btn btn-primary btn-block btn-lg" loading={loading}>
              <i className="fa-solid fa-paper-plane"></i> Send Reset Link
            </LoadingButton>
          </div>
        </form>
      </div>

      <div className="auth-footer">
        <Link to="/login"><i className="fa-solid fa-arrow-left"></i> Back to login</Link>
      </div>
    </div>
  );

  return (
    <div className="auth-container">
      <div className="theme-toggle-fixed">
        <ThemeToggle />
      </div>
      {inner}
    </div>
  );
}

