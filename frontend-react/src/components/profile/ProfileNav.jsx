import React from 'react';

const ProfileNav = ({ activeSection, completedSections, switchSection, handleSave, loading }) => {
  const sections = [
    { id: 'personal', icon: 'fa-user', label: 'Personal' },
    { id: 'professional', icon: 'fa-briefcase', label: 'Professional' },
    { id: 'preferences', icon: 'fa-bullseye', label: 'Preferences' },
    { id: 'custom', icon: 'fa-list-check', label: 'Additional' },
    { id: 'platforms', icon: 'fa-lock', label: 'Logins' }
  ];

  return (
    <nav className="profile-nav">
      {sections.map(s => (
        <button
          key={s.id}
          className={`profile-nav-item${activeSection === s.id ? ' active' : ''}${completedSections.includes(s.id) ? ' done' : ''}`}
          onClick={() => switchSection(s.id)}
        >
          <span><i className={`fa-solid ${s.icon}`}></i></span>
          {s.label}
          {completedSections.includes(s.id) && <i className="fa-solid fa-circle-check check" style={{ marginLeft: 'auto' }}></i>}
        </button>
      ))}
      
      <div style={{ marginTop: '24px' }}>
        <button onClick={() => handleSave(false)} className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
          {loading ? <span className="spinner"></span> : <><i className="fa-solid fa-save"></i> Save Progress</>}
        </button>
      </div>
    </nav>
  );
};

export default ProfileNav;
