import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';

export const useProfile = () => {
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
          search_terms: Array.isArray(p.search_terms) ? p.search_terms : [],
          bad_words: Array.isArray(p.bad_words) ? p.bad_words : prev.bad_words,
          exp_level: Array.isArray(p.exp_level) ? p.exp_level : prev.exp_level,
          on_site: Array.isArray(p.on_site) ? p.on_site : prev.on_site,
          linkedin_password: '' 
        }));
        
        const loadedAnswers = {};
        const source = p.dynamic_answers || p.additional_details || {};
        const questions = qData.questions || [];
        
        questions.forEach(q => {
          const textKey = q.text.toLowerCase().trim();
          if (source[textKey]) {
            loadedAnswers[q.id] = source[textKey];
          } else if (source[q.id]) {
            loadedAnswers[q.id] = source[q.id];
          }
        });
        setDynamicAnswers(loadedAnswers);
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
    const { id, value, type, checked, name } = e.target;
    if (type === 'checkbox' && name === 'exp_level') {
      setProfile(prev => ({
        ...prev,
        exp_level: checked ? [...prev.exp_level, value] : prev.exp_level.filter(v => v !== value)
      }));
    } else if (type === 'checkbox' && name === 'on_site') {
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

  const setProfileState = (updater) => {
    setProfile(updater);
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
    if (!profile.first_name || !profile.phone_number) {
      showToast('Please fill in required fields (First Name, Phone)', 'error');
      if (!profile.first_name) document.getElementById('first_name')?.classList.add('error');
      if (!profile.phone_number) document.getElementById('phone_number')?.classList.add('error');
      return;
    }
    
    document.getElementById('first_name')?.classList.remove('error');
    document.getElementById('phone_number')?.classList.remove('error');
    
    setLoading(true);
    try {
      const textKeyedAnswers = {};
      dynamicQuestions.forEach(q => {
        if (dynamicAnswers[q.id]) {
          textKeyedAnswers[q.text.toLowerCase().trim()] = dynamicAnswers[q.id];
        }
      });

      const payload = {
        ...profile,
        dynamic_answers: textKeyedAnswers
      };
      if (!payload.linkedin_password) delete payload.linkedin_password;
      
      await api.put('/profile/update', payload);
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

  return {
    profile,
    setProfile: setProfileState,
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
  };
};
