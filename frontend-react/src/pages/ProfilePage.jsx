import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import { escHtml } from '../services/utils';
import TagInput from '../components/common/TagInput';
import LoadingButton from '../components/common/LoadingButton';

export default function ProfilePage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  
  const [activeSection, setActiveSection] = useState('personal');
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState({
    headline: false,
    summary: false,
    skills: false,
    cover: false,
    searchTerms: false,
    badWords: false
  });
  
  const [profile, setProfile] = useState({
    first_name: '', middle_name: '', last_name: '',
    phone_country_code: 'India (+91)', phone_number: '',
    current_city: '', street: '', state: '', country: 'India', zipcode: '',
    gender: '', ethnicity: 'Decline', disability_status: 'Decline', veteran_status: 'Decline',
    linkedin_profile: '', github: '', website: '',
    linkedin_headline: '', linkedin_summary: '', skills_summary: '',
    education_text: '', experience_text: '', cover_letter: '',
    years_of_experience: '0', recent_employer: '',
    current_ctc: '', desired_salary: '', notice_period: '0', confidence_level: '7',
    search_terms: [], search_location: 'India',
    exp_level: ['Entry level'], on_site: ['On-site', 'Hybrid', 'Remote'],
    date_posted: 'Past month', switch_number: 15, easy_apply_only: true,
    us_citizenship: 'Other', require_visa: 'No',
    bad_words: ['US Citizen', '10+ years'],
    linkedin_email: '', linkedin_password: ''
  });

  const [dynamicQuestions, setDynamicQuestions] = useState([]);
  const [dynamicAnswers, setDynamicAnswers] = useState({});
  const [completedSections, setCompletedSections] = useState([]);

  const loadData = useCallback(async () => {
    try {
      const [pData, qData] = await Promise.all([
        api.get('/profile/me'),
        api.get('/profile/questions').catch(() => ({ questions: [] }))
      ]);
      
      if (pData.profile) {
        const p = pData.profile;
        setProfile(prev => ({
          ...prev,
          ...p,
          // Ensure arrays are handled
          search_terms: Array.isArray(p.search_terms) ? p.search_terms : [],
          bad_words: Array.isArray(p.bad_words) ? p.bad_words : prev.bad_words,
          exp_level: Array.isArray(p.exp_level) ? p.exp_level : prev.exp_level,
          on_site: Array.isArray(p.on_site) ? p.on_site : prev.on_site,
          linkedin_password: '' // Don't fill password from API
        }));
        
        // Map dynamic answers
        if (p.additional_details) {
          setDynamicAnswers(p.additional_details);
        }
      }
      
      setDynamicQuestions(qData.questions || []);
    } catch (err) {
      showToast('Failed to load profile data', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleChange = (e) => {
    const { id, value, type, checked } = e.target;
    if (type === 'checkbox' && e.target.name === 'exp_level') {
      setProfile(prev => ({
        ...prev,
        exp_level: checked ? [...prev.exp_level, value] : prev.exp_level.filter(v => v !== value)
      }));
    } else if (type === 'checkbox' && e.target.name === 'on_site') {
      setProfile(prev => ({
        ...prev,
        on_site: checked ? [...prev.on_site, value] : prev.on_site.filter(v => v !== value)
      }));
    } else if (type === 'checkbox' && id === 'easy_apply_only') {
      setProfile(prev => ({ ...prev, [id]: checked }));
    } else {
      setProfile(prev => ({ ...prev, [id]: value }));
    }
  };

  const handleDynamicChange = (qId, value) => {
    setDynamicAnswers(prev => ({ ...prev, [qId]: value }));
  };

  const switchSection = (sectionId) => {
    setActiveSection(sectionId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const markDoneAndNext = (current, next) => {
    if (!completedSections.includes(current)) {
      setCompletedSections(prev => [...prev, current]);
    }
    switchSection(next);
  };

  const handleSave = async (isFinish = false) => {
    setLoading(true);
    try {
      const payload = {
        ...profile,
        additional_details: dynamicAnswers
      };
      // Don't send empty password if not changed
      if (!payload.linkedin_password) delete payload.linkedin_password;
      
      await api.post('/profile/update', payload);
      showToast(isFinish ? 'Profile completed successfully!' : 'Progress saved', 'success');
      
      if (isFinish) {
        navigate('/dashboard');
      }
    } catch (err) {
      showToast(err.detail || 'Failed to save profile', 'error');
    } finally {
      setLoading(false);
    }
  };

  // AI Helpers
  const buildAiCtx = () => {
    const p = profile;
    const parts = [];
    if (p.first_name || p.last_name) parts.push(`Name: ${[p.first_name, p.middle_name, p.last_name].filter(Boolean).join(' ')}`);
    parts.push(`Experience: ${p.years_of_experience} years`);
    if (p.recent_employer) parts.push(`Recent Employer: ${p.recent_employer}`);
    if (p.skills_summary) parts.push(`Skills: ${p.skills_summary.slice(0, 400)}`);
    if (p.linkedin_headline) parts.push(`Headline: ${p.linkedin_headline}`);
    if (p.education_text) parts.push(`Education: ${p.education_text.slice(0, 250)}`);
    if (p.experience_text) parts.push(`Work Experience: ${p.experience_text.slice(0, 350)}`);
    if (p.current_city) parts.push(`Location: ${p.current_city}, ${p.country}`);
    return parts.join('\n');
  };

  const runAi = async (type, prompt, field) => {
    setAiLoading(prev => ({ ...prev, [type]: true }));
    try {
      const r = await api.post('/ai/answer-question', { 
        question: prompt, 
        user_info: buildAiCtx() 
      });
      let val = (r.answer || '').trim().replace(/^["'`]+|["'`]+$/g, '');
      if (val) {
        if (field === 'search_terms' || field === 'bad_words') {
          try {
            const arr = JSON.parse(val.replace(/^```json|```$/g, '').trim());
            if (Array.isArray(arr)) {
              setProfile(prev => ({
                ...prev,
                [field]: [...new Set([...prev[field], ...arr])]
              }));
              showToast('Suggestions added!', 'success');
            }
          } catch { showToast('AI returned invalid format', 'error'); }
        } else {
          setProfile(prev => ({ ...prev, [field]: val }));
          showToast('Generated successfully!', 'success');
        }
      }
    } catch (err) {
      showToast('AI service unavailable', 'error');
    } finally {
      setAiLoading(prev => ({ ...prev, [type]: false }));
    }
  };

  const generateCoverLetter = async () => {
    setAiLoading(prev => ({ ...prev, cover: true }));
    try {
      const jobTitle = profile.search_terms[0] || 'the target role';
      const r = await api.post('/ai/cover-letter', { 
        user_info: buildAiCtx(), 
        job_title: jobTitle, 
        company: 'your organisation' 
      });
      if (r.cover_letter) {
        setProfile(prev => ({ ...prev, cover_letter: r.cover_letter }));
        showToast('Cover letter generated!', 'success');
      }
    } catch (err) {
      showToast('AI service unavailable', 'error');
    } finally {
      setAiLoading(prev => ({ ...prev, cover: false }));
    }
  };

    return (
      <div className="profile-layout">
        <nav className="profile-nav">
          {[
            { id: 'personal', icon: 'fa-user', label: 'Personal' },
            { id: 'professional', icon: 'fa-briefcase', label: 'Professional' },
            { id: 'preferences', icon: 'fa-bullseye', label: 'Preferences' },
            { id: 'custom', icon: 'fa-list-check', label: 'Additional' },
            { id: 'platforms', icon: 'fa-lock', label: 'Logins' }
          ].map(s => (
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

        <div className="profile-content">
          <div className="page-header" style={{ marginBottom: '32px' }}>
            <div>
              <h3><i className="fa-solid fa-user-pen"></i> Profile Setup</h3>
              <p className="text-muted text-sm">Complete your profile for accurate auto-applications</p>
            </div>
            <Link to="/resume" className="btn btn-ghost btn-sm"><i className="fa-solid fa-arrow-left"></i> Resume Upload</Link>
          </div>

          {/* PERSONAL SECTION */}
          {activeSection === 'personal' && (
            <div className="section-panel active">
              <div className="card stagger">
                <h4 style={{ marginBottom: '20px' }}><i className="fa-solid fa-id-card"></i> Personal Details</h4>
                
                <div className="sec-divider">Full Name</div>
                <div className="grid-3" style={{ marginBottom: '16px' }}>
                  <div className="form-group"><label>First Name *</label><input type="text" id="first_name" className="input" value={profile.first_name} onChange={handleChange} placeholder="First Name" /></div>
                  <div className="form-group"><label>Middle Name</label><input type="text" id="middle_name" className="input" value={profile.middle_name} onChange={handleChange} placeholder="Middle Name" /></div>
                  <div className="form-group"><label>Last Name *</label><input type="text" id="last_name" className="input" value={profile.last_name} onChange={handleChange} placeholder="Last Name" /></div>
                </div>

                <div className="sec-divider">Contact & Location</div>
                <div className="grid-3" style={{ marginBottom: '16px' }}>
                  <div className="form-group">
                    <label>Country Code *</label>
                    <select id="phone_country_code" className="input" value={profile.phone_country_code} onChange={handleChange}>
                      <option value="India (+91)">India (+91)</option>
                      <option value="United States (+1)">United States (+1)</option>
                      <option value="United Kingdom (+44)">United Kingdom (+44)</option>
                    </select>
                  </div>
                  <div className="form-group"><label>Phone Number *</label><input type="tel" id="phone_number" className="input" value={profile.phone_number} onChange={handleChange} placeholder="10-digit number" /></div>
                  <div className="form-group"><label>Current City</label><input type="text" id="current_city" className="input" value={profile.current_city} onChange={handleChange} placeholder="e.g. Hyderabad" /></div>
                </div>
                
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label>Street Address</label>
                  <input type="text" id="street" className="input" value={profile.street} onChange={handleChange} placeholder="123 Main St, Area name" />
                </div>

                <div className="grid-3" style={{ marginBottom: '16px' }}>
                  <div className="form-group"><label>State</label><input type="text" id="state" className="input" value={profile.state} onChange={handleChange} placeholder="e.g. Telangana" /></div>
                  <div className="form-group"><label>Country</label><input type="text" id="country" className="input" value={profile.country} onChange={handleChange} /></div>
                  <div className="form-group"><label>Pincode / ZIP</label><input type="text" id="zipcode" className="input" value={profile.zipcode} onChange={handleChange} placeholder="Pincode" /></div>
                </div>

                <div className="sec-divider">Equal Opportunity Data</div>
                <div className="eeo-note" style={{ marginBottom: '16px', background: 'rgba(var(--primary-rgb), 0.05)', padding: '12px', borderRadius: '8px', fontSize: '13px' }}>
                  <i className="fa-solid fa-circle-info" style={{ color: 'var(--primary)', marginRight: '8px' }}></i>
                  Stored securely for auto-filling EEO forms. Never shared externally.
                </div>
                
                <div className="grid-2">
                  <div className="form-group">
                    <label>Gender</label>
                    <select id="gender" className="input" value={profile.gender} onChange={handleChange}>
                      <option value="">Prefer not to say</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Non-binary">Non-binary</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Ethnicity</label>
                    <select id="ethnicity" className="input" value={profile.ethnicity} onChange={handleChange}>
                      <option value="Decline">Decline to identify</option>
                      <option value="Asian">Asian</option>
                      <option value="White">White</option>
                      <option value="Black">Black</option>
                      <option value="Hispanic">Hispanic</option>
                    </select>
                  </div>
                </div>

                <div style={{ marginTop: '24px', textAlign: 'right' }}>
                  <button className="btn btn-primary" onClick={() => markDoneAndNext('personal', 'professional')}>
                    Next: Professional <i className="fa-solid fa-arrow-right"></i>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* PROFESSIONAL SECTION */}
          {activeSection === 'professional' && (
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
          )}

          {/* PREFERENCES SECTION */}
          {activeSection === 'preferences' && (
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
          )}

          {/* CUSTOM SECTION */}
          {activeSection === 'custom' && (
            <div className="section-panel active">
              <div className="card stagger">
                <h4 style={{ marginBottom: '20px' }}><i className="fa-solid fa-list-check"></i> Additional Details</h4>
                <p className="text-muted text-sm" style={{ marginBottom: '24px' }}>Answer these questions to help the extension fill complex forms.</p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {dynamicQuestions.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px' }}>No additional questions required.</div>
                  ) : dynamicQuestions.map(q => (
                    <div key={q.id} className="form-group">
                      <label>{q.text}{q.is_required ? ' *' : ''}</label>
                      {q.type === 'dropdown' ? (
                        <select className="input" value={dynamicAnswers[q.id] || ''} onChange={(e) => handleDynamicChange(q.id, e.target.value)}>
                          <option value="">Select an option</option>
                          {q.options?.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : q.type === 'radio' ? (
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '6px' }}>
                          {q.options?.map(o => (
                            <label key={o} className={`badge ${dynamicAnswers[q.id] === o ? 'badge-primary' : 'badge-neutral'}`} style={{ cursor: 'pointer' }}>
                              <input type="radio" name={`q_${q.id}`} value={o} checked={dynamicAnswers[q.id] === o} onChange={(e) => handleDynamicChange(q.id, e.target.value)} style={{ display: 'none' }} />
                              {o}
                            </label>
                          ))}
                        </div>
                      ) : q.type === 'textarea' ? (
                        <textarea className="input" rows="3" value={dynamicAnswers[q.id] || ''} onChange={(e) => handleDynamicChange(q.id, e.target.value)}></textarea>
                      ) : (
                        <input type={q.type === 'numerical' ? 'number' : 'text'} className="input" value={dynamicAnswers[q.id] || ''} onChange={(e) => handleDynamicChange(q.id, e.target.value)} />
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'space-between' }}>
                  <button className="btn btn-ghost" onClick={() => switchSection('preferences')}><i className="fa-solid fa-arrow-left"></i> Back</button>
                  <button className="btn btn-primary" onClick={() => markDoneAndNext('custom', 'platforms')}>Next: Logins <i className="fa-solid fa-arrow-right"></i></button>
                </div>
              </div>
            </div>
          )}

          {/* PLATFORMS SECTION */}
          {activeSection === 'platforms' && (
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
          )}
        </div>
        
        <style>{`
          .profile-layout { display: grid; grid-template-columns: 220px 1fr; gap: 32px; align-items: start; }
          .profile-nav { position: sticky; top: 88px; }
          .profile-nav-item { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: var(--radius-sm); font-size: 14px; color: var(--text-2); cursor: pointer; transition: var(--transition); margin-bottom: 2px; background: none; border: none; width: 100%; text-align: left; font-family: inherit; }
          .profile-nav-item:hover { background: var(--surface); color: var(--text); }
          .profile-nav-item.active { background: rgba(79,124,255,0.1); color: var(--primary); font-weight: 500; }
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
