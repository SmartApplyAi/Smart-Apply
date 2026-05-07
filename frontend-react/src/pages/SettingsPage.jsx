import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import PasswordInput from '../components/common/PasswordInput';
import LoadingButton from '../components/common/LoadingButton';

export default function SettingsPage() {
  const [activePanel, setActivePanel] = useState(() => localStorage.getItem('sa_settings_panel') || 'general');
  const { theme, setTheme } = useTheme();
  const { logout } = useAuth();
  const { showToast } = useToast();

  // Security state
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  useEffect(() => { localStorage.setItem('sa_settings_panel', activePanel); }, [activePanel]);

  const changePassword = async () => {
    if (!currentPw || !newPw) { showToast('Fill in all password fields', 'error'); return; }
    if (newPw.length < 8) { showToast('New password must be at least 8 characters', 'error'); return; }
    if (newPw !== confirmPw) { showToast('Passwords do not match', 'error'); return; }
    setPwLoading(true);
    try {
      await api.post('/auth/change-password', { current_password: currentPw, new_password: newPw, confirm_password: confirmPw });
      showToast('Password changed successfully', 'success');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (err) { showToast(err.detail || 'Password change failed', 'error'); }
    finally { setPwLoading(false); }
  };

  const deleteAccount = async () => {
    if (!window.confirm('Are you sure you want to permanently delete your account? This action cannot be undone. All your data, applications, and profiles will be permanently removed.')) return;
    const confirmText = window.prompt('Type DELETE to confirm:');
    if (confirmText !== 'DELETE') { showToast('Account deletion cancelled', 'info'); return; }
    setDeleteLoading(true);
    try {
      await api.delete('/profile/me');
      showToast('Account deleted. Goodbye.', 'info');
      setTimeout(logout, 1500);
    } catch (err) { showToast(err.detail || 'Could not delete account', 'error'); }
    finally { setDeleteLoading(false); }
  };

  const exportData = async () => {
    setExportLoading(true);
    try {
      const data = await api.get('/profile/me');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'smartapply_profile_export.json';
      a.click(); URL.revokeObjectURL(url);
      showToast('Profile data exported!', 'success');
    } catch (err) { showToast(err.detail || 'Export failed', 'error'); }
    finally { setExportLoading(false); }
  };

  const panels = [
    { id: 'general', icon: 'fa-solid fa-sliders', label: 'General' },
    { id: 'notifications', icon: 'fa-solid fa-bell', label: 'Notifications' },
    { id: 'security', icon: 'fa-solid fa-shield-halved', label: 'Security' },
  ];

  return (
    <div className="container" style={{ paddingTop: '40px', paddingBottom: '60px', maxWidth: '900px' }}>
      <div style={{ marginBottom: '32px' }}>
        <h2><i className="fa-solid fa-gear"></i> Settings</h2>
        <p className="text-muted" style={{ marginTop: '6px' }}>Manage your preferences and account</p>
      </div>
      <div className="settings-layout">
        <div className="settings-nav">
          {panels.map((p) => (
            <button key={p.id} className={`settings-nav-item${activePanel === p.id ? ' active' : ''}`} onClick={() => setActivePanel(p.id)}>
              <i className={p.icon}></i> {p.label}
            </button>
          ))}
        </div>
        <div className="settings-content">
          {activePanel === 'general' && (
            <div className="card fade-in">
              <h4 style={{ marginBottom: '20px' }}><i className="fa-solid fa-palette"></i> Appearance</h4>
              <div className="theme-selector">
                {['light', 'dark', 'auto'].map((t) => (
                  <div key={t} className={`theme-option${theme === t ? ' active' : ''}`} onClick={() => setTheme(t)} data-theme={t}>
                    <i className={`fa-solid ${t === 'light' ? 'fa-sun' : t === 'dark' ? 'fa-moon' : 'fa-circle-half-stroke'}`}></i>
                    <span style={{ textTransform: 'capitalize' }}>{t}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '28px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
                <h4 style={{ marginBottom: '16px' }}><i className="fa-solid fa-download"></i> Export Your Data</h4>
                <p className="text-muted text-sm" style={{ marginBottom: '12px' }}>Download a JSON copy of your profile, preferences, and application history.</p>
                <LoadingButton onClick={exportData} loading={exportLoading} className="btn btn-ghost">
                  <i className="fa-solid fa-file-export"></i> Export Data
                </LoadingButton>
              </div>
            </div>
          )}
          {activePanel === 'notifications' && (
            <div className="card fade-in">
              <h4 style={{ marginBottom: '20px' }}><i className="fa-solid fa-bell"></i> Notification Preferences</h4>
              {[
                { label: 'Application Status Updates', desc: 'Receive alerts when applications are submitted successfully or fail.' },
                { label: 'Weekly Summary', desc: 'Get a weekly email with your job search progress.' },
                { label: 'Product Updates', desc: 'Stay informed about new features and improvements.' },
              ].map((n, i) => (
                <div className="toggle-row" key={i}>
                  <div><div style={{ fontWeight: 500, fontSize: '14px' }}>{n.label}</div><div className="text-muted text-sm">{n.desc}</div></div>
                  <label className="toggle"><input type="checkbox" defaultChecked /><span className="toggle-slider"></span></label>
                </div>
              ))}
            </div>
          )}
          {activePanel === 'security' && (
            <div>
              <div className="card fade-in" style={{ marginBottom: '20px' }}>
                <h4 style={{ marginBottom: '20px' }}><i className="fa-solid fa-key"></i> Change Password</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '400px' }}>
                  <div className="form-group"><label>Current Password</label><PasswordInput value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} placeholder="Enter current password" /></div>
                  <div className="form-group"><label>New Password</label><PasswordInput value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="Min. 8 characters" autoComplete="new-password" /></div>
                  <div className="form-group"><label>Confirm New Password</label><PasswordInput value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="Confirm new password" autoComplete="new-password" /></div>
                  <LoadingButton onClick={changePassword} loading={pwLoading}><i className="fa-solid fa-check"></i> Update Password</LoadingButton>
                </div>
              </div>
              <div className="card fade-in" style={{ border: '1px solid rgba(255,107,107,0.3)' }}>
                <h4 style={{ color: 'var(--danger)', marginBottom: '12px' }}><i className="fa-solid fa-triangle-exclamation"></i> Danger Zone</h4>
                <p className="text-muted text-sm" style={{ marginBottom: '16px' }}>Permanently delete your account and all associated data. This action is irreversible.</p>
                <LoadingButton onClick={deleteAccount} loading={deleteLoading} className="btn btn-danger">
                  <i className="fa-solid fa-trash"></i> Delete Account
                </LoadingButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
