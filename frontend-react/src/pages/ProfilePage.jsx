import React from 'react';
import { Link } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile';

// Subcomponents
import ProfileNav from '../components/profile/ProfileNav';
import PersonalSection from '../components/profile/PersonalSection';
import ProfessionalSection from '../components/profile/ProfessionalSection';
import PreferencesSection from '../components/profile/PreferencesSection';
import AdditionalSection from '../components/profile/AdditionalSection';
import LoginsSection from '../components/profile/LoginsSection';

export default function ProfilePage() {
  const {
    profile,
    setProfile,
    loading,
    aiLoading,
    activeSection,
    completedSections,
    dynamicQuestions,
    dynamicAnswers,
    handleChange,
    handleDynamicChange,
    switchSection,
    markDoneAndNext,
    handleSave,
    runAi,
    generateCoverLetter
  } = useProfile();

  return (
    <div className="profile-layout">
      <ProfileNav 
        activeSection={activeSection} 
        completedSections={completedSections} 
        switchSection={switchSection} 
        handleSave={handleSave} 
        loading={loading} 
      />

      <div className="profile-content">
        <div className="page-header" style={{ marginBottom: '32px' }}>
          <div>
            <h3><i className="fa-solid fa-user-pen"></i> Profile Setup</h3>
            <p className="text-muted text-sm">Complete your profile for accurate auto-applications</p>
          </div>
          <Link to="/resume" className="btn btn-ghost btn-sm">
            <i className="fa-solid fa-arrow-left"></i> Resume Upload
          </Link>
        </div>

        {activeSection === 'personal' && (
          <PersonalSection 
            profile={profile} 
            handleChange={handleChange} 
            markDoneAndNext={markDoneAndNext} 
          />
        )}

        {activeSection === 'professional' && (
          <ProfessionalSection 
            profile={profile} 
            handleChange={handleChange} 
            runAi={runAi} 
            aiLoading={aiLoading} 
            generateCoverLetter={generateCoverLetter} 
            switchSection={switchSection} 
            markDoneAndNext={markDoneAndNext} 
          />
        )}

        {activeSection === 'preferences' && (
          <PreferencesSection 
            profile={profile} 
            setProfile={setProfile} 
            handleChange={handleChange} 
            runAi={runAi} 
            aiLoading={aiLoading} 
            switchSection={switchSection} 
            markDoneAndNext={markDoneAndNext} 
          />
        )}

        {activeSection === 'custom' && (
          <AdditionalSection 
            dynamicQuestions={dynamicQuestions} 
            dynamicAnswers={dynamicAnswers} 
            handleDynamicChange={handleDynamicChange} 
            switchSection={switchSection} 
            markDoneAndNext={markDoneAndNext} 
          />
        )}

        {activeSection === 'platforms' && (
          <LoginsSection 
            profile={profile} 
            handleChange={handleChange} 
            switchSection={switchSection} 
            handleSave={handleSave} 
            loading={loading} 
          />
        )}
      </div>
      
      <style>{`
        .profile-layout { display: grid; grid-template-columns: 220px 1fr; gap: 32px; align-items: start; }
        .profile-nav { position: sticky; top: 88px; }
        .profile-nav-item { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: var(--radius-sm); font-size: 14px; color: var(--text-2); cursor: pointer; transition: var(--transition); margin-bottom: 2px; background: none; border: none; width: 100%; text-align: left; font-family: inherit; }
        .profile-nav-item:hover { background: var(--surface); color: var(--text); }
        .profile-nav-item.active { background: rgba(0, 113, 227, 0.1); color: var(--primary); font-weight: 600; box-shadow: inset 0 0 0 1px rgba(0,113,227,0.2); }
        .profile-nav-item .check { display: none; }
        .profile-nav-item.done .check { display: block; }
        .section-panel { display: none; }
        .section-panel.active { display: block; animation: fadeIn 0.3s ease; }
        
        .ai-btn {
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.2);
          color: #6366f1;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .ai-btn:hover { background: rgba(99, 102, 241, 0.2); }
        .ai-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .ai-spin {
          display: inline-block;
          width: 10px;
          height: 10px;
          border: 2px solid rgba(99,102,241,0.3);
          border-top-color: #6366f1;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .sec-divider {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--text-3);
          margin: 24px 0 16px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .sec-divider::after {
          content: "";
          flex: 1;
          height: 1px;
          background: var(--border);
        }
        .badge {
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          transition: all 0.2s;
        }
        .badge-neutral { background: var(--bg-2); border: 1px solid var(--border); color: var(--text-2); }
        .badge-primary { background: var(--primary); color: white; border: 1px solid var(--primary); }
        
        @media (max-width: 900px) {
          .profile-layout { grid-template-columns: 1fr; }
          .profile-nav { display: none; }
        }
      `}</style>
    </div>
  );
}
