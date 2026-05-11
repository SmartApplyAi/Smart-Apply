import React from 'react';
import LoadingButton from '../common/LoadingButton';

const LoginsSection = ({ profile, handleChange, switchSection, handleSave, loading }) => {
  return (
    <div className="section-panel active">
      <div className="card stagger">
        <div className="alert alert-info" style={{ marginBottom: '24px', background: 'rgba(var(--primary-rgb), 0.05)', padding: '16px', borderRadius: '12px', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <i className="fa-solid fa-lock" style={{ color: 'var(--primary)', fontSize: '20px' }}></i>
          <div className="text-sm">Credentials are encrypted using AES-256 and used <strong>only</strong> by the extension for automation.</div>
        </div>
        
        <h4 style={{ marginBottom: '20px' }}><i className="fa-solid fa-key"></i> Platform Credentials</h4>
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fa-brands fa-linkedin" style={{ color: '#0a66c2' }}></i> LinkedIn
          </div>
          <div className="grid-2">
            <div className="form-group"><label>Email</label><input type="email" id="linkedin_email" className="input" value={profile.linkedin_email} onChange={handleChange} placeholder="your@email.com" /></div>
            <div className="form-group"><label>Password</label><input type="password" id="linkedin_password" className="input" value={profile.linkedin_password} onChange={handleChange} placeholder="Leave empty to keep current" /></div>
          </div>
        </div>

        <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="btn btn-ghost" onClick={() => switchSection('custom')}><i className="fa-solid fa-arrow-left"></i> Back</button>
          <LoadingButton 
            onClick={() => handleSave(true)} 
            loading={loading}
            className="btn-accent btn-lg"
          >
            <i className="fa-solid fa-check"></i> Finish & Go to Dashboard
          </LoadingButton>
        </div>
      </div>
    </div>
  );
};

export default LoginsSection;
