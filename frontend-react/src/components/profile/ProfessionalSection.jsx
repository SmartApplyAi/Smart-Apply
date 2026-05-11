import React from 'react';

const ProfessionalSection = ({ profile, handleChange, runAi, aiLoading, generateCoverLetter, switchSection, markDoneAndNext }) => {
  return (
    <div className="section-panel active">
      <div className="card stagger">
        <h4 style={{ marginBottom: '20px' }}><i className="fa-solid fa-briefcase"></i> Professional Details</h4>
        
        <div className="sec-divider">Online Presence</div>
        <div className="grid-2" style={{ marginBottom: '16px' }}>
          <div className="form-group"><label><i className="fa-brands fa-linkedin" style={{ color: '#0a66c2' }}></i> LinkedIn URL</label><input type="url" id="linkedin_profile" className="input" value={profile.linkedin_profile} onChange={handleChange} placeholder="https://linkedin.com/in/..." /></div>
          <div className="form-group"><label><i className="fa-brands fa-github"></i> GitHub URL</label><input type="url" id="github" className="input" value={profile.github} onChange={handleChange} placeholder="https://github.com/..." /></div>
        </div>

        <div className="form-group" style={{ marginBottom: '20px' }}>
          <div className="field-hdr" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label>LinkedIn Headline</label>
            <button 
              onClick={() => runAi('headline', 'Write a compelling LinkedIn headline for this candidate. Max 220 chars. Format: Role | Skill · Skill | CTA.', 'linkedin_headline')}
              className="ai-btn"
              disabled={aiLoading.headline}
            >
              {aiLoading.headline ? <span className="ai-spin"></span> : <><i className="fa-solid fa-wand-magic-sparkles"></i> AI Generate</>}
            </button>
          </div>
          <input type="text" id="linkedin_headline" className="input" value={profile.linkedin_headline} onChange={handleChange} placeholder="e.g. Software Engineer | React · Node.js | Building Scalable Apps" />
        </div>

        <div className="grid-3" style={{ marginBottom: '20px' }}>
          <div className="form-group">
            <label>Years of Experience</label>
            <select id="years_of_experience" className="input" value={profile.years_of_experience} onChange={handleChange}>
              <option value="0">0 — Fresher</option>
              <option value="1">1 year</option>
              <option value="2">2 years</option>
              <option value="3">3 years</option>
              <option value="5">5+ years</option>
            </select>
          </div>
          <div className="form-group"><label>Current CTC (₹ p.a.)</label><input type="number" id="current_ctc" className="input" value={profile.current_ctc} onChange={handleChange} placeholder="e.g. 800000" /></div>
          <div className="form-group"><label>Desired Salary (₹ p.a.)</label><input type="number" id="desired_salary" className="input" value={profile.desired_salary} onChange={handleChange} placeholder="e.g. 1200000" /></div>
        </div>

        <div className="sec-divider">Resume Content</div>
        <div className="form-group" style={{ marginBottom: '16px' }}>
          <div className="field-hdr" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label>Skills Summary</label>
            <button 
              onClick={() => runAi('skills', 'Extract and list tech and soft skills as comma-separated string. Max 25 items.', 'skills_summary')}
              className="ai-btn"
              disabled={aiLoading.skills}
            >
              {aiLoading.skills ? <span className="ai-spin"></span> : <><i className="fa-solid fa-wand-magic-sparkles"></i> AI Generate</>}
            </button>
          </div>
          <textarea id="skills_summary" className="input" rows="3" value={profile.skills_summary} onChange={handleChange} placeholder="Python, SQL, React, AWS..."></textarea>
        </div>

        <div className="grid-2" style={{ marginBottom: '16px' }}>
          <div className="form-group"><label>Education</label><textarea id="education_text" className="input" rows="5" value={profile.education_text} onChange={handleChange} placeholder="Degree, University, Year, CGPA..."></textarea></div>
          <div className="form-group"><label>Work Experience</label><textarea id="experience_text" className="input" rows="5" value={profile.experience_text} onChange={handleChange} placeholder="Role, Company, Dates, Achievements..."></textarea></div>
        </div>

        <div className="form-group">
          <div className="field-hdr" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label>Cover Letter Template</label>
            <button 
              onClick={generateCoverLetter}
              className="ai-btn"
              disabled={aiLoading.cover}
            >
              {aiLoading.cover ? <span className="ai-spin"></span> : <><i className="fa-solid fa-wand-magic-sparkles"></i> AI Generate</>}
            </button>
          </div>
          <textarea id="cover_letter" className="input" rows="7" value={profile.cover_letter} onChange={handleChange} placeholder="Fallback template for applications..."></textarea>
        </div>

        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between' }}>
          <button className="btn btn-ghost" onClick={() => switchSection('personal')}><i className="fa-solid fa-arrow-left"></i> Back</button>
          <button className="btn btn-primary" onClick={() => markDoneAndNext('professional', 'preferences')}>Next: Preferences <i className="fa-solid fa-arrow-right"></i></button>
        </div>
      </div>
    </div>
  );
};

export default ProfessionalSection;
