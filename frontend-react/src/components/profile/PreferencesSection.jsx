import React from 'react';
import TagInput from '../common/TagInput';

const PreferencesSection = ({ profile, setProfile, handleChange, runAi, aiLoading, switchSection, markDoneAndNext }) => {
  return (
    <div className="section-panel active">
      <div className="card stagger">
        <h4 style={{ marginBottom: '20px' }}><i className="fa-solid fa-sliders"></i> Job Preferences</h4>
        
        <div className="form-group" style={{ marginBottom: '20px' }}>
          <div className="field-hdr" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label>Job Search Terms</label>
            <button 
              onClick={() => runAi('searchTerms', 'Suggest 7-8 specific LinkedIn job search terms as a JSON array.', 'search_terms')}
              className="ai-btn"
              disabled={aiLoading.searchTerms}
            >
              {aiLoading.searchTerms ? <span className="ai-spin"></span> : <><i className="fa-solid fa-wand-magic-sparkles"></i> AI Suggest</>}
            </button>
          </div>
          <TagInput 
            tags={profile.search_terms} 
            onChange={(tags) => setProfile(prev => ({ ...prev, search_terms: tags }))} 
            placeholder="Press Enter to add (e.g. Data Analyst)"
          />
        </div>

        <div className="grid-2" style={{ marginBottom: '20px' }}>
          <div className="form-group"><label>Preferred Location</label><input type="text" id="search_location" className="input" value={profile.search_location} onChange={handleChange} /></div>
          <div className="form-group">
            <label>Date Posted Filter</label>
            <select id="date_posted" className="input" value={profile.date_posted} onChange={handleChange}>
              <option value="Past 24 hours">Past 24 hours</option>
              <option value="Past week">Past week</option>
              <option value="Past month">Past month</option>
            </select>
          </div>
        </div>

        <div className="grid-2" style={{ marginBottom: '20px' }}>
          <div className="form-group">
            <label>Experience Level</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
              {['Internship', 'Entry level', 'Associate', 'Mid-Senior level'].map(l => (
                <label key={l} className={`badge ${profile.exp_level.includes(l) ? 'badge-primary' : 'badge-neutral'}`} style={{ cursor: 'pointer' }}>
                  <input type="checkbox" name="exp_level" value={l} checked={profile.exp_level.includes(l)} onChange={handleChange} style={{ display: 'none' }} />
                  {l}
                </label>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label>Work Mode</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
              {['On-site', 'Hybrid', 'Remote'].map(m => (
                <label key={m} className={`badge ${profile.on_site.includes(m) ? 'badge-primary' : 'badge-neutral'}`} style={{ cursor: 'pointer' }}>
                  <input type="checkbox" name="on_site" value={m} checked={profile.on_site.includes(m)} onChange={handleChange} style={{ display: 'none' }} />
                  {m}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="toggle-row" style={{ marginBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>Easy Apply Only</div>
            <div className="text-muted text-sm">Only apply to LinkedIn Easy Apply jobs</div>
          </div>
          <label className="toggle">
            <input type="checkbox" id="easy_apply_only" checked={profile.easy_apply_only} onChange={handleChange} />
            <span className="toggle-slider"></span>
          </label>
        </div>

        <div className="sec-divider">Filtering (Bad Words)</div>
        <div className="form-group">
          <div className="field-hdr" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label>Skip Keywords</label>
            <button 
              onClick={() => runAi('badWords', 'Suggest 8-10 job title keywords to SKIP as a JSON array.', 'bad_words')}
              className="ai-btn"
              disabled={aiLoading.badWords}
            >
              {aiLoading.badWords ? <span className="ai-spin"></span> : <><i className="fa-solid fa-wand-magic-sparkles"></i> AI Suggest</>}
            </button>
          </div>
          <TagInput 
            tags={profile.bad_words} 
            onChange={(tags) => setProfile(prev => ({ ...prev, bad_words: tags }))} 
            placeholder="Keywords in title to skip..."
          />
        </div>

        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between' }}>
          <button className="btn btn-ghost" onClick={() => switchSection('professional')}><i className="fa-solid fa-arrow-left"></i> Back</button>
          <button className="btn btn-primary" onClick={() => markDoneAndNext('preferences', 'custom')}>Next: Additional <i className="fa-solid fa-arrow-right"></i></button>
        </div>
      </div>
    </div>
  );
};

export default PreferencesSection;
