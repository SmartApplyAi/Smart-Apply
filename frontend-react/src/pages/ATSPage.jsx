import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import ScoreRing from '../components/common/ScoreRing';
import Sidebar from '../components/layout/Sidebar';

export default function ATSPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  
  const [activeTab, setActiveTab] = useState('upload');
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);
  
  const [jd, setJd] = useState('');
  const [resumeText, setResumeText] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [savedResumes, setSavedResumes] = useState([]);
  const [selectedResumeKey, setSelectedResumeKey] = useState(null);
  const [compareFiles, setCompareFiles] = useState([null, null]);

  const loadSavedResumes = useCallback(async () => {
    try {
      const data = await api.get('/resume/list');
      setSavedResumes((data.resumes || []).filter(r => !!r.object_key));
    } catch (err) {
      showToast('Failed to load resumes', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    if (activeTab === 'saved') loadSavedResumes();
  }, [activeTab, loadSavedResumes]);

  useEffect(() => {
    const id = searchParams.get('id');
    if (id) {
      setActiveTab('saved');
      setSelectedResumeKey(id);
    }
  }, [searchParams]);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        showToast('Please upload a PDF file', 'error');
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleCompareFileChange = (e, index) => {
    const file = e.target.files[0];
    if (file) {
      const next = [...compareFiles];
      next[index] = file;
      setCompareFiles(next);
    }
  };

  const runAnalysis = async () => {
    setError('');
    setAnalyzing(true);
    setResults(null);
    
    try {
      let finalResumeText = resumeText;
      let finalObjectKey = null;

      if (activeTab === 'upload') {
        if (!selectedFile) throw new Error('Please select a file');
        const form = new FormData();
        form.append('file', selectedFile);
        const data = await api.upload('/ai/extract-text', form);
        finalResumeText = data.text;
      } else if (activeTab === 'saved') {
        if (!selectedResumeKey) throw new Error('Please select a resume');
        finalObjectKey = selectedResumeKey;
      } else if (activeTab === 'compare') {
        if (!compareFiles[0] || !compareFiles[1]) throw new Error('Please select both resumes');
        const texts = [];
        for (const f of compareFiles) {
          const form = new FormData();
          form.append('file', f);
          const d = await api.upload('/ai/extract-text', form);
          texts.push(d.text);
        }
        const res1 = await api.post('/ai/ats-analyze', { resume_text: texts[0], job_description: jd });
        const res2 = await api.post('/ai/ats-analyze', { resume_text: texts[1], job_description: jd });
        setResults({ isComparison: true, results: [res1, res2] });
        setAnalyzing(false);
        return;
      } else if (activeTab === 'paste') {
        if (!resumeText) throw new Error('Please paste your resume text');
      }

      const payload = {
        job_description: jd,
        ...(finalObjectKey ? { object_key: finalObjectKey } : { resume_text: finalResumeText })
      };

      const result = await api.post('/ai/ats-analyze', payload);
      setResults(result);
    } catch (err) {
      setError(err.message || err.detail || 'Analysis failed');
      showToast(err.message || 'Analysis failed', 'error');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <>
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(135deg,var(--primary),#7b61ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
              <i className="fa-solid fa-bullseye" style={{ color: 'white' }}></i>
            </div>
            <div>
              <h3>ATS Resume Analyzer</h3>
              <p className="text-muted text-sm">Check how well your resume passes Applicant Tracking Systems</p>
            </div>
          </div>
        </div>

        <div className="ats-layout" style={{ display: 'grid', gap: '28px' }}>
          <div>
            <div className="card" style={{ marginBottom: '20px' }}>
              <h4 style={{ marginBottom: '16px' }}><i className="fa-solid fa-file-pdf"></i> Your Resume</h4>
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '20px', flexWrap: 'wrap' }}>
                {['upload', 'saved', 'compare', 'paste'].map(t => (
                  <button key={t} className={`tab-btn-ats${activeTab === t ? ' active' : ''}`} onClick={() => setActiveTab(t)}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>

              {activeTab === 'upload' && (
                <div className="drop-zone" onClick={() => document.getElementById('pdf-input').click()} style={{ border: '2px dashed var(--border)', borderRadius: '12px', padding: '36px 20px', textAlign: 'center', cursor: 'pointer' }}>
                  <i className="fa-solid fa-file-arrow-up" style={{ fontSize: '2rem', color: 'var(--primary)', marginBottom: '8px', display: 'block' }}></i>
                  <div style={{ fontWeight: 600 }}>{selectedFile ? `✓ ${selectedFile.name}` : 'Drop your resume PDF here'}</div>
                  <div className="text-muted text-sm">or click to browse · Max 5MB</div>
                  <input type="file" id="pdf-input" accept=".pdf" style={{ display: 'none' }} onChange={handleFileChange} />
                </div>
              )}

              {activeTab === 'saved' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {savedResumes.length === 0 ? (
                    <p className="text-muted text-sm">No resumes uploaded yet.</p>
                  ) : savedResumes.map(r => (
                    <div key={r.object_key} className="card card-sm" style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', border: selectedResumeKey === r.object_key ? '2px solid var(--primary)' : '2px solid transparent' }} onClick={() => setSelectedResumeKey(r.object_key)}>
                      <i className="fa-solid fa-file-pdf" style={{ color: 'var(--danger)', fontSize: '20px' }}></i>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>{r.label || r.filename}</div>
                        <div className="text-muted text-sm">{new Date(r.uploaded_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'compare' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {[0, 1].map(i => (
                    <div key={i} className="drop-zone" style={{ padding: '20px 10px', border: '2px dashed var(--border)', borderRadius: '12px', textAlign: 'center', cursor: 'pointer' }} onClick={() => document.getElementById(`compare-${i}`).click()}>
                      <i className={`fa-solid fa-file-${i + 1}`} style={{ fontSize: '1.4rem', color: i === 0 ? 'var(--primary)' : 'var(--accent)', marginBottom: '4px', display: 'block' }}></i>
                      <div style={{ fontSize: '12px', fontWeight: 600 }}>{compareFiles[i] ? `✓ ${compareFiles[i].name}` : `Resume ${String.fromCharCode(65 + i)}`}</div>
                      <input type="file" id={`compare-${i}`} accept=".pdf" style={{ display: 'none' }} onChange={(e) => handleCompareFileChange(e, i)} />
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'paste' && (
                <textarea className="input" style={{ height: '220px' }} value={resumeText} onChange={(e) => setResumeText(e.target.value)} placeholder="Paste your resume text here..."></textarea>
              )}
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label><i className="fa-solid fa-file-lines"></i> Job Description (optional)</label>
              <textarea className="input" style={{ height: '100px' }} value={jd} onChange={(e) => setJd(e.target.value)} placeholder="Paste JD for targeted analysis..."></textarea>
            </div>

            <button className="btn btn-primary w-full" onClick={runAnalysis} disabled={analyzing} style={{ padding: '14px', fontWeight: 700 }}>
              {analyzing ? <><i className="fa-solid fa-spinner fa-spin"></i> Analyzing...</> : <><i className="fa-solid fa-magnifying-glass-chart"></i> Analyze My Resume</>}
            </button>
            {error && <div className="text-danger text-sm" style={{ marginTop: '10px' }}>{error}</div>}
          </div>

          <div id="results-panel">
            {!results && !analyzing && (
              <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
                <i className="fa-solid fa-chart-simple" style={{ fontSize: '3rem', marginBottom: '16px' }}></i>
                <p>Run analysis to see results</p>
              </div>
            )}

            {analyzing && (
              <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div className="spinner" style={{ width: '42px', height: '42px', margin: '0 auto 16px' }}></div>
                <h4>Analyzing your resume…</h4>
                <p className="text-muted text-sm">We are checking formatting, keywords, and relevance scores.</p>
              </div>
            )}

            {results && !results.isComparison && (
              <div className="stagger">
                <div className="card" style={{ marginBottom: '20px' }}>
                  <ScoreRing score={results.ats_score} label="ATS Score" color={results.ats_score >= 75 ? 'var(--accent)' : results.ats_score >= 50 ? 'var(--accent-2)' : 'var(--danger)'} />
                  <div style={{ textAlign: 'center', marginTop: '12px' }}>
                    <div style={{ fontWeight: 600, fontSize: '1.1rem', color: results.ats_score >= 75 ? 'var(--accent)' : results.ats_score >= 50 ? 'var(--accent-2)' : 'var(--danger)' }}>
                      {results.ats_score >= 80 ? 'Excellent — ATS Ready' : results.ats_score >= 60 ? 'Good Match' : results.ats_score >= 40 ? 'Fair — Needs Work' : 'Poor — Likely Filtered'}
                    </div>
                    <p className="text-muted text-sm" style={{ marginTop: '8px' }}>{results.summary}</p>
                  </div>
                </div>

                <div className="card" style={{ marginBottom: '20px' }}>
                  <h4 style={{ marginBottom: '18px' }}><i className="fa-solid fa-chart-bar"></i> Section Breakdown</h4>
                  {Object.entries({
                    skills_match: 'Skills Match',
                    experience_relevance: 'Experience',
                    education_fit: 'Education',
                    keyword_density: 'Keywords',
                    formatting_quality: 'Layout & Format',
                    readability: 'Readability'
                  }).map(([k, label]) => {
                    const val = results.section_scores?.[k] || 0;
                    const c = val >= 75 ? 'var(--accent)' : val >= 50 ? 'var(--accent-2)' : 'var(--danger)';
                    return (
                      <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                        <div style={{ width: '120px', fontSize: '13px' }}>{label}</div>
                        <div style={{ flex: 1, height: '7px', background: 'var(--bg-3)', borderRadius: '99px', overflow: 'hidden' }}>
                          <div style={{ width: `${val}%`, height: '100%', background: c, transition: 'width 1s' }}></div>
                        </div>
                        <div style={{ width: '30px', fontSize: '13px', fontWeight: 600, color: c }}>{val}</div>
                      </div>
                    );
                  })}
                </div>

                <div className="card" style={{ marginBottom: '20px' }}>
                  <h4 style={{ marginBottom: '12px' }}><i className="fa-solid fa-key"></i> Keywords</h4>
                  <div style={{ marginBottom: '16px' }}>
                    <div className="text-sm" style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: '8px' }}>Matched ({results.matched_keywords?.length || 0})</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {results.matched_keywords?.map(k => <span key={k} className="badge badge-accent">{k}</span>)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm" style={{ color: 'var(--danger)', fontWeight: 600, marginBottom: '8px' }}>Missing ({results.missing_keywords?.length || 0})</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {results.missing_keywords?.map(k => <span key={k} className="badge badge-danger">{k.replace(' (Required)', '')}</span>)}
                    </div>
                  </div>
                </div>

                {results.improvements && results.improvements.length > 0 && (
                  <div className="card" style={{ marginBottom: '20px' }}>
                    <h4 style={{ marginBottom: '16px' }}>
                      <i className="fa-solid fa-lightbulb" style={{ color: 'var(--accent-2)' }}></i> Improvements to Boost Your Score
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      {results.improvements.map((item, idx) => {
                        const priorityColors = { high: { bg: 'rgba(255,107,107,0.1)', text: 'var(--danger)', border: 'rgba(255,107,107,0.25)' }, medium: { bg: 'rgba(255,193,94,0.1)', text: '#ffb347', border: 'rgba(255,193,94,0.25)' }, low: { bg: 'rgba(126,232,162,0.1)', text: 'var(--accent)', border: 'rgba(126,232,162,0.25)' } };
                        const pc = priorityColors[item.priority] || priorityColors.medium;
                        const categoryIcons = { formatting: 'fa-solid fa-align-left', content: 'fa-solid fa-pen-fancy', skills: 'fa-solid fa-code', keywords: 'fa-solid fa-tags' };
                        const catIcon = categoryIcons[item.category] || 'fa-solid fa-circle-info';
                        return (
                          <div key={idx} className="improvement-item" style={{ display: 'flex', gap: '14px', padding: '14px 16px', background: 'var(--bg-3)', borderRadius: '10px', borderLeft: `3px solid ${pc.text}`, alignItems: 'flex-start' }}>
                            <div style={{ flexShrink: 0, marginTop: '2px' }}>
                              <i className={catIcon} style={{ fontSize: '16px', color: pc.text }}></i>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                                <span className="improvement-priority-badge" style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', padding: '2px 8px', borderRadius: '99px', background: pc.bg, color: pc.text, border: `1px solid ${pc.border}` }}>
                                  {item.priority}
                                </span>
                                {item.category && (
                                  <span style={{ fontSize: '11px', color: 'var(--text-2)', fontWeight: 500 }}>
                                    {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '13px', lineHeight: '1.5', color: 'var(--text)' }}>{item.tip}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {results && results.isComparison && (
              <div className="card">
                <h4 style={{ marginBottom: '20px' }}><i className="fa-solid fa-code-compare"></i> Comparison Results</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  {results.results.map((r, i) => (
                    <div key={i} className="card" style={{ background: 'var(--bg-3)', textAlign: 'center' }}>
                      <div style={{ fontSize: '2.4rem', fontWeight: 800, color: i === 0 ? 'var(--primary)' : 'var(--accent)' }}>{r.ats_score}</div>
                      <div className="text-muted text-sm">Resume {String.fromCharCode(65 + i)}</div>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-center text-muted" style={{ marginTop: '20px' }}>
                  {results.results[0].ats_score > results.results[1].ats_score ? 'Resume A is a better match.' : results.results[0].ats_score < results.results[1].ats_score ? 'Resume B is a better match.' : 'Both are equal.'}
                </p>
              </div>
            )}
        </div>
      </div>
      <style>{`
        .tab-btn-ats {
          padding: 10px 20px;
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          color: var(--text-2);
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .tab-btn-ats.active {
          color: var(--primary);
          border-bottom-color: var(--primary);
          font-weight: 600;
        }
        .badge-accent { background: rgba(126,232,162,0.1); color: var(--accent); border: 1px solid rgba(126,232,162,0.2); border-radius: 99px; padding: 4px 12px; font-size: 12px; }
        .badge-danger { background: rgba(255,107,107,0.1); color: var(--danger); border: 1px solid rgba(255,107,107,0.2); border-radius: 99px; padding: 4px 12px; font-size: 12px; }
        .stat-pill { background: var(--surface-2); border: 1px solid var(--border); padding: 8px 14px; border-radius: 99px; font-size: 13px; font-weight: 500; display: inline-flex; align-items: center; gap: 8px; }
        .stat-pill span { font-weight: 700; color: var(--text); }
        @media (min-width: 901px) { .ats-layout { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 900px) { .ats-layout { grid-template-columns: 1fr; } }
      `}</style>
    </>
  );
}
