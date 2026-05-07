import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import Logo from '../../components/common/Logo';
import GoogleOAuthButton from '../../components/common/GoogleOAuthButton';
import OrDivider from '../../components/common/OrDivider';
import PasswordInput from '../../components/common/PasswordInput';
import LoadingButton from '../../components/common/LoadingButton';

const OAUTH_ERRORS = {
  google_cancelled: 'Google sign-in was cancelled.',
  state_mismatch: 'Security check failed. Please try again.',
  google_token_failed: 'Could not connect to Google.',
  google_profile_failed: 'Could not retrieve your Google profile.',
  google_no_email: 'Your Google account has no public email.',
  oauth_failed: 'Sign-in failed. Please try again.',
};

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [oauthError, setOauthError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const { save } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const err = searchParams.get('error');
    if (err) {
      setOauthError(OAUTH_ERRORS[err] || 'Sign-in failed.');
      window.history.replaceState({}, '', window.location.pathname);
    }
    const msg = searchParams.get('msg');
    if (msg === 'verified') setSuccessMsg('Email verified! You can now log in.');
    if (msg === 'reset') setSuccessMsg('Password reset successfully. Please sign in.');
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    const errs = {};
    if (!email.trim()) errs.email = 'Email is required';
    if (!password) errs.password = 'Password is required';
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }

    setLoading(true);
    try {
      const data = await api.post('/auth/login', { email: email.trim(), password });
      save(data.access_token, data.user);
      showToast('Welcome back!', 'success');
      setTimeout(() => {
        navigate(data.user.has_profile ? '/dashboard' : '/profile');
      }, 800);
    } catch (err) {
      setError(err.detail || 'Email or password is wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="theme-toggle-fixed">
        <ThemeToggle />
      </div>
      
      <div className="auth-card fade-in">
        <div className="auth-header">
          <Logo as="div" className="auth-logo" />
        </div>
        
        <h2>Welcome back</h2>
        <p className="subtitle">Sign in to your account</p>

        {oauthError && <div className="oauth-error">{oauthError}</div>}
        {error && <div className="alert alert-error" style={{ marginBottom: '16px' }}>{error}</div>}
        {successMsg && <div className="alert alert-success" style={{ marginBottom: '16px' }}>{successMsg}</div>}

        <div className="auth-body">
          <GoogleOAuthButton label="Continue with Google" />
          
          <div className="divider">
            <span>or</span>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <div className="form-stack">
              <div className={`form-group${fieldErrors.email ? ' has-error' : ''}`}>
                <label htmlFor="email"><i className="fa-solid fa-envelope"></i> Email</label>
                <div className="input-wrapper">
                  <input
                    type="email" id="email" placeholder="you@company.com" autoComplete="email"
                    value={email} onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
              </div>

              <div className={`form-group${fieldErrors.password ? ' has-error' : ''}`}>
                <div className="label-row">
                  <label htmlFor="password"><i className="fa-solid fa-lock"></i> Password</label>
                  <Link to="/forgot-password" id="forgot-link">Forgot?</Link>
                </div>
                <div className="input-wrapper">
                  <PasswordInput
                    id="password" value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                  />
                </div>
                {fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
              </div>

              <LoadingButton type="submit" className="btn btn-primary btn-block btn-lg" loading={loading}>
                <i className="fa-solid fa-right-to-bracket"></i> Sign In
              </LoadingButton>
            </div>
          </form>
        </div>

        <div className="auth-footer">
          Don't have an account? <Link to="/signup">Create one free</Link>
        </div>
      </div>
    </div>
  );
}
