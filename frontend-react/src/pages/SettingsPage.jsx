import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useToast } from '../hooks/useToast';
import api from '../services/api';
import PasswordInput from '../components/common/PasswordInput';
import LoadingButton from '../components/common/LoadingButton';

const NOTIF_PREFS_KEY = 'sa_notification_prefs';

const DEFAULT_PREFS = {
  application_status: true,
  weekly_summary: true,
  product_updates: true,
};

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

  // Notification preferences state
  const [notifPrefs, setNotifPrefs] = useState(() => {
    try {
      const saved = localStorage.getItem(NOTIF_PREFS_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_PREFS;
    } catch {
      return DEFAULT_PREFS;
    }
  });
  const [notifSaving, setNotifSaving] = useState(false);

  // Load notification preferences from backend on mount
  useEffect(() => {
    (async () => {
      try {
        const profile = await api.get('/profile/me');
        const prefs = profile?.notification_preferences;
        if (prefs && typeof prefs === 'object') {
          const merged = { ...DEFAULT_PREFS, ...prefs };
          setNotifPrefs(merged);
          localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(merged));
        }
      } catch { /* use local defaults */ }
    })();
  }, []);

  const updateNotifPref = async (key, value) => {
    const updated = { ...notifPrefs, [key]: value };
    setNotifPrefs(updated);
    localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(updated));

    setNotifSaving(true);
    try {
      await api.patch('/profile/me', { notification_preferences: updated });
      showToast('Notification preference saved', 'success');
    } catch {
      showToast('Failed to save preference', 'error');
      // Revert on failure
      setNotifPrefs(notifPrefs);
      localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(notifPrefs));
    } finally {
      setNotifSaving(false);
    }
  };

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

  const [pairingCode, setPairingCode] = useState(null);
  const [pairingLoading, setPairingLoading] = useState(false);

  const generatePairingCode = async () => {
    setPairingLoading(true);
    try {
      const res = await api.post('/extension/pairing-code');
      setPairingCode(res);
      showToast('Pairing code generated', 'success');

      // Auto-clear after expiry
      setTimeout(() => {
        setPairingCode(null);
      }, res.expires_in * 1000);

    } catch (err) {
      showToast(err.detail || 'Could not generate pairing code', 'error');
    } finally {
      setPairingLoading(false);
    }
  };

  const panels = [
    { id: 'general', icon: 'fa-solid fa-sliders', label: 'General' },
    { id: 'notifications', icon: 'fa-solid fa-bell', label: 'Notifications' },
    { id: 'security', icon: 'fa-solid fa-shield-halved', label: 'Security' },
    { id: 'extension', icon: 'fa-solid fa-puzzle-piece', label: 'Extension' },
  ];

  const NOTIF_OPTIONS = [
    { key: 'application_status', label: 'Application Status Updates', desc: 'Receive alerts when applications are submitted successfully or fail.' },
    { key: 'weekly_summary', label: 'Weekly Summary', desc: 'Get a weekly email with your job search progress.' },
    { key: 'product_updates', label: 'Product Updates', desc: 'Stay informed about new features and improvements.' },
  ];

  return (
    <>
      <div style={{ marginBottom: '32px' }}>
        <h2><i className="fa-solid fa-gear"></i> Settings</h2>
        <p className="text-muted" style={{ marginTop: '6px' }}>Manage your preferences and account</p>
      </div>
      <div className="settings-grid">
        <nav className="settings-nav">
          {panels.map((p) => (
            <button key={p.id} className={`settings-nav-item${activePanel === p.id ? ' active' : ''}`} onClick={() => setActivePanel(p.id)}>
              <i className={p.icon}></i> {p.label}
            </button>
          ))}
        </nav>
        <div className="settings-content">
          {activePanel === 'general' && (
            <div className="card stagger">
              <h4 style={{ marginBottom: '20px' }}><i className="fa-solid fa-palette"></i> Appearance</h4>
              <div className="theme-selector" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                {['light', 'dark', 'auto'].map((t) => (
                  <button key={t} className={`btn btn-ghost w-full ${theme === t ? 'active' : ''}`} onClick={() => setTheme(t)} style={{ border: '1px solid var(--border)', flexDirection: 'column', gap: '8px', padding: '16px 8px', background: theme === t ? 'rgba(79,124,255,0.1)' : 'transparent', color: theme === t ? 'var(--primary)' : 'var(--text-2)' }}>
                    <i className={`fa-solid ${t === 'light' ? 'fa-sun' : t === 'dark' ? 'fa-moon' : 'fa-circle-half-stroke'}`}></i>
                    <span>{t.charAt(0).toUpperCase() + t.slice(1)}</span>
                  </button>
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
            <div className="card stagger">
              <h4 style={{ marginBottom: '20px' }}><i className="fa-solid fa-bell"></i> Notification Settings</h4>
              {NOTIF_OPTIONS.map((n, i) => (
                <div className="toggle-row" key={n.key} style={{ padding: '12px 0', borderBottom: i < NOTIF_OPTIONS.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div><div style={{ fontWeight: 500, fontSize: '14px' }}>{n.label}</div><div className="text-muted text-sm">{n.desc}</div></div>
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={notifPrefs[n.key] ?? true}
                      onChange={(e) => updateNotifPref(n.key, e.target.checked)}
                      disabled={notifSaving}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              ))}
              {notifSaving && <p className="text-muted text-xs" style={{ marginTop: '8px' }}>Saving…</p>}
            </div>
          )}
          {activePanel === 'security' && (
            <div className="stagger">
              <div className="card" style={{ marginBottom: '20px' }}>
                <h4 style={{ marginBottom: '20px' }}><i className="fa-solid fa-key"></i> Change Password</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '400px' }}>
                  <div className="form-group"><label>Current Password</label><PasswordInput value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} placeholder="Enter current password" /></div>
                  <div className="form-group"><label>New Password</label><PasswordInput value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="Min. 8 characters" autoComplete="new-password" /></div>
                  <div className="form-group"><label>Confirm New Password</label><PasswordInput value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="Confirm new password" autoComplete="new-password" /></div>
                  <LoadingButton onClick={changePassword} loading={pwLoading}><i className="fa-solid fa-check"></i> Update Password</LoadingButton>
                </div>
              </div>
              <div className="card" style={{ border: '1px solid rgba(255,107,107,0.3)', background: 'rgba(255,107,107,0.02)' }}>
                <h4 style={{ color: 'var(--danger)', marginBottom: '12px' }}><i className="fa-solid fa-triangle-exclamation"></i> Danger Zone</h4>
                <p className="text-muted text-sm" style={{ marginBottom: '16px' }}>Permanently delete your account and all associated data. This action is irreversible.</p>
                <LoadingButton onClick={deleteAccount} loading={deleteLoading} className="btn btn-danger">
                  <i className="fa-solid fa-trash"></i> Delete Account
                </LoadingButton>
              </div>
            </div>
          )}
          {activePanel === 'extension' && (
            <div className="stagger">
              <div className="card" style={{ marginBottom: '20px' }}>
                <h4 style={{ marginBottom: '20px' }}><i className="fa-solid fa-link"></i> Link Browser Extension</h4>
                <p className="text-muted text-sm" style={{ marginBottom: '20px' }}>
                  Generate a secure pairing code to link the SmartApply browser extension to your account.
                </p>
                {pairingCode ? (
                  <div style={{ background: 'var(--surface)', padding: '24px', borderRadius: 'var(--radius)', textAlign: 'center', border: '1px dashed var(--primary)' }}>
                    <div style={{ fontSize: '14px', color: 'var(--text-2)', marginBottom: '8px' }}>Your one-time pairing code</div>
                    <div style={{ fontSize: '32px', fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: '4px', color: 'var(--primary)', marginBottom: '16px' }}>
                      {pairingCode.pairing_code}
                    </div>
                    <div className="text-muted text-sm">
                      <i className="fa-regular fa-clock"></i> Expires in {Math.floor(pairingCode.expires_in / 60)} minutes
                    </div>
                  </div>
                ) : (
                  <LoadingButton onClick={generatePairingCode} loading={pairingLoading} className="btn btn-primary">
                    <i className="fa-solid fa-qrcode"></i> Generate Pairing Code
                  </LoadingButton>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`
        .settings-grid { display: grid; grid-template-columns: 240px 1fr; gap: 32px; align-items: start; }
        .settings-nav { position: sticky; top: 88px; display: flex; flex-direction: column; gap: 4px; }
        .settings-nav-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: var(--radius-sm); font-size: 14px; color: var(--text-2); cursor: pointer; transition: var(--transition); background: none; border: none; width: 100%; text-align: left; font-weight: 500; }
        .settings-nav-item:hover { background: var(--surface); color: var(--text); }
        .settings-nav-item.active { background: rgba(79, 124, 255, 0.1); color: var(--primary); font-weight: 600; box-shadow: inset 0 0 0 1px rgba(79,124,255,0.2); }
        
        @media(max-width: 768px) { 
          .settings-grid { grid-template-columns: 1fr; } 
          .settings-nav { flex-direction: row; overflow-x: auto; position: static; margin-bottom: 24px; padding-bottom: 8px; scroll-snap-type: x mandatory; }
          .settings-nav::-webkit-scrollbar { display: none; }
          .settings-nav-item { white-space: nowrap; width: auto; scroll-snap-align: start; }
        }
      `}</style>
    </>
  );
}
