import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import Logo from '../../components/common/Logo';
import GoogleOAuthButton from '../../components/common/GoogleOAuthButton';
import PasswordInput from '../../components/common/PasswordInput';
import PasswordStrength from '../../components/common/PasswordStrength';
import PinInput from '../../components/common/PinInput';
import LoadingButton from '../../components/common/LoadingButton';
import ThemeToggle from '../../components/common/ThemeToggle';
import '../../styles/auth-premium.css';


export default function SignupPage() {
  const [step, setStep] = useState('signup'); // 'signup' | 'verify'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [pin, setPin] = useState('');
  const [verifyError, setVerifyError] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  const { showToast } = useToast();
  const navigate = useNavigate();

  // Resend timer countdown
  useEffect(() => {
    if (resendTimer <= 0) return;
    const id = setInterval(() => setResendTimer((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, [resendTimer]);

  const handleSignup = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    const errs = {};
    if (!email.trim()) errs.email = 'Email is required';
    if (password.length < 8) errs.password = 'Minimum 8 characters';
    if (password !== confirmPassword) errs.confirm = 'Passwords do not match';
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }

    setLoading(true);
    try {
      await api.post('/auth/signup', { email: email.trim(), password, confirm_password: confirmPassword });
      setStep('verify');
      setResendTimer(60);
    } catch (err) {
      setError(err.detail || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    setVerifyError('');
    if (pin.length !== 6) { setVerifyError('Enter all 6 digits'); return; }
    setVerifyLoading(true);
    try {
      await api.post('/auth/verify', { email, pin });
      showToast('Email verified! Redirecting…', 'success');
      setTimeout(() => navigate('/login'), 1200);
    } catch (err) {
      setVerifyError(err.detail || 'Invalid code');
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleResend = useCallback(async () => {
    try {
      await api.post('/auth/resend-pin', { email });
      showToast('Code resent!', 'info');
      setResendTimer(60);
    } catch (err) {
      showToast(err.detail || 'Failed', 'error');
    }
  }, [email, showToast]);

  if (step === 'verify') {
    return (
      <div className="auth-container auth-container--premium">
        <div className="auth-ambient-1" />
        <div className="auth-ambient-2" />
        <div className="theme-toggle-fixed">
          <ThemeToggle />
        </div>

        <div className="auth-card fade-in">
          <div className="auth-header">
            <Logo as="div" className="auth-logo" />
          </div>
          
          <h2>Verify your email</h2>
          <p className="subtitle">Enter the 6-digit code sent to {email}</p>

          <div className="auth-body">
            {verifyError && <div className="alert alert-error" style={{ marginBottom: '16px' }}>{verifyError}</div>}
            <PinInput value={pin} onChange={setPin} />
            <div style={{ marginTop: '16px' }}>
              <LoadingButton className="btn btn-primary btn-block btn-lg" loading={verifyLoading} onClick={handleVerify}>
                <i className="fa-solid fa-circle-check"></i> Verify Email
              </LoadingButton>
            </div>
          </div>

          <div className="auth-footer">
            {resendTimer > 0 ? (
              <span>Resend in {resendTimer}s</span>
            ) : (
              <a href="#" onClick={(e) => { e.preventDefault(); handleResend(); }}>Resend code</a>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container auth-container--premium">
      <div className="auth-ambient-1" />
      <div className="auth-ambient-2" />
      <div className="theme-toggle-fixed">
        <ThemeToggle />
      </div>

      <div className="auth-card fade-in">
        <div className="auth-header">
          <Logo as="div" className="auth-logo" />
        </div>
        
        <h2>Create your account</h2>
        <p className="subtitle">Start automating your job applications today</p>

        <div className="auth-body">
          {error && <div className="alert alert-error" style={{ marginBottom: '16px' }}>{error}</div>}

          <form onSubmit={handleSignup} noValidate>
            <div className="form-stack">
              <div className={`form-group${fieldErrors.email ? ' has-error' : ''}`}>
                <label><i className="fa-solid fa-envelope"></i> Email Address</label>
                <div className="input-wrapper">
                  <input type="email" placeholder="you@company.com" autoComplete="email"
                    value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
              </div>

              <div className={`form-group${fieldErrors.password ? ' has-error' : ''}`}>
                <label><i className="fa-solid fa-lock"></i> Password</label>
                <div className="input-wrapper">
                  <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters" autoComplete="new-password" />
                </div>
                <PasswordStrength password={password} />
                {fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
              </div>

              <div className={`form-group${fieldErrors.confirm ? ' has-error' : ''}`}>
                <label><i className="fa-solid fa-lock"></i> Confirm Password</label>
                <div className="input-wrapper">
                  <PasswordInput value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat your password" autoComplete="new-password" />
                </div>
                {fieldErrors.confirm && <span className="field-error">{fieldErrors.confirm}</span>}
              </div>

              <LoadingButton type="submit" className="btn btn-primary btn-block btn-lg" loading={loading}>
                <i className="fa-solid fa-user-plus"></i> Create Account
              </LoadingButton>
            </div>
          </form>

          <div className="divider">
            <span>or sign up with email</span>
          </div>

          <GoogleOAuthButton label="Sign up with Google" />
        </div>

        <div className="auth-footer">
          Already have an account? <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
