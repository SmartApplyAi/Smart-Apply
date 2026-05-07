import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import linkedin from '../services/linkedin';
import ScoreRing from '../components/common/ScoreRing';
import Sidebar from '../components/layout/Sidebar';
import Modal from '../components/common/Modal';

export default function LinkedInOptimizerPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  
  const [status, setStatus] = useState('empty'); // empty, loading, results
  const [loadingMsg, setLoadingMsg] = useState('');
  const [results, setResults] = useState(null);
  const [scrapedData, setScrapedData] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  const triggerSync = async () => {
    setStatus('loading');
    setLoadingMsg('Scraping your LinkedIn profile via Extension...');
    
    try {
      const result = await linkedin.scrapeProfile();
      if (result.ok && result.data) {
        setScrapedData(result.data);
        setShowPreview(true);
      } else {
        const msg = result.error === 'extension_not_found'
          ? 'SmartApply Extension not found. Please install it to continue.'
          : 'LinkedIn Scrape failed. Ensure you are logged in and on your profile page.';
        showToast(msg, 'error');
        setStatus('empty');
      }
    } catch (e) {
      showToast('Scrape error: ' + (e.message || 'Extension unavailable'), 'error');
      setStatus('empty');
    }
  };

  const startOptimization = async () => {
    setShowPreview(false);
    setStatus('loading');
    setLoadingMsg('AI Analysis in Progress...');

    try {
      // Save to profile
      await api.post('/profile/import-linkedin', { 
        raw_linkedin_data: scrapedData, 
        overwrite: false 
      });

      // Get suggestions
      const res = await api.post('/ai/linkedin-optimize', { 
        profile_data: scrapedData 
      });
      setResults(res);
      setStatus('results');
    } catch (e) {
      showToast('Optimization failed', 'error');
      setStatus('empty');
    }
  };

  const copyHeadline = () => {
    const h = results?.headline_suggestion || results?.summary_suggestion;
    if (h) {
      navigator.clipboard.writeText(h);
      showToast('Headline copied!', 'success');
    }
  };

  return (
    <>
        <div className="action-banner" style={{ background: 'linear-gradient(135deg, rgba(10, 102, 194, 0.1), rgba(79, 124, 255, 0.1))', border: '1px solid rgba(10, 102, 194, 0.2)', borderRadius: '16px', padding: '24px', display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '28px' }}>
          <div className="action-icon" style={{ width: '56px', height: '56px', borderRadius: '14px', background: '#0a66c2', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', flexShrink: 0 }}>
            <i className="fa-brands fa-linkedin-in"></i>
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0 }}>LinkedIn Profile Optimizer</h3>
            <p className="text-muted text-sm" style={{ marginTop: '4px' }}>Sync your profile and get AI-powered suggestions to stand out.</p>
          </div>
          <button className="btn btn-primary" onClick={triggerSync} disabled={status === 'loading'}>
            <i className="fa-solid fa-rotate"></i> Sync & Optimize
          </button>
        </div>

        {status === 'empty' && (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-3)' }}>
            <i className="fa-solid fa-wand-magic-sparkles" style={{ fontSize: '3rem', marginBottom: '20px', opacity: 0.5, display: 'block' }}></i>
            <h4>Ready to level up your LinkedIn?</h4>
            <p>Click the sync button above to analyze your profile.</p>
          </div>
        )}

        {status === 'loading' && (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div className="spinner" style={{ width: '40px', height: '40px', margin: '0 auto 20px' }}></div>
            <h4>{loadingMsg}</h4>
            <p className="text-muted">This takes about 15-20 seconds.</p>
          </div>
        )}

        {status === 'results' && results && (
          <div className="opt-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '28px' }}>
            <div>
              <div className="card" style={{ marginBottom: '20px' }}>
                <ScoreRing score={results.overall_score} label="Profile Strength" color="#0a66c2" />
                <div style={{ textAlign: 'center', marginTop: '12px' }}>
                  <div style={{ fontWeight: 600, fontSize: '1.1rem', color: '#0a66c2' }}>
                    {results.overall_score > 80 ? 'All-Star Profile' : results.overall_score > 60 ? 'Intermediate' : 'Needs Work'}
                  </div>
                  <p className="text-muted text-sm" style={{ marginTop: '8px' }}>{results.overall_feedback || results.overall_recommendation}</p>
                </div>
                
                <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--border)' }}>
                  <h5 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: '12px' }}><i className="fa-solid fa-magnifying-glass"></i> Top Keywords to Add</h5>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {(results.keywords_to_include || results.skills_to_add || []).map(k => (
                      <span key={k} className="badge badge-neutral">{k}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="card">
                <h5 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: '12px' }}><i className="fa-solid fa-eye"></i> Visibility Tips</h5>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {(results.visibility_tips || []).map((t, i) => (
                    <div key={i} className="text-sm" style={{ display: 'flex', gap: '8px' }}>
                      <i className="fa-solid fa-circle-check" style={{ color: 'var(--accent)', marginTop: '3px' }}></i>
                      <span>{t}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <div style={{ marginBottom: '24px' }}>
                <h5 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: '12px' }}><i className="fa-solid fa-pen-to-square"></i> Section Improvements</h5>
                {(results.section_improvements || []).map((s, i) => (
                  <div key={i} className="card" style={{ background: 'var(--bg-3)', marginBottom: '12px', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontWeight: 600, fontSize: '14px' }}>{(s.section || '').toUpperCase()}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, padding: '2px 8px', borderRadius: '99px', background: 'rgba(10,102,194,0.1)', color: '#0a66c2' }}>{s.current_score || 0}%</span>
                    </div>
                    <div className="text-sm text-muted" style={{ lineHeight: 1.6 }}>{s.suggestion}</div>
                  </div>
                ))}
              </div>
              
              <div className="card" style={{ background: 'var(--surface)', borderColor: 'var(--primary)' }}>
                <h5 style={{ fontSize: '13px', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: '12px' }}><i className="fa-solid fa-sparkles"></i> Optimized Headline</h5>
                <div style={{ padding: '12px', background: 'rgba(10,102,194,0.05)', borderRadius: '8px', fontSize: '14px', fontWeight: 600, color: 'var(--primary)', lineHeight: 1.5 }}>
                  {results.headline_suggestion || results.summary_suggestion || 'No suggestion available.'}
                </div>
                <button className="btn btn-ghost btn-sm" style={{ marginTop: '12px', width: '100%' }} onClick={copyHeadline}>
                  <i className="fa-solid fa-copy"></i> Copy Headline
                </button>
              </div>
            </div>
          </div>
        )}

        <Modal open={showPreview} onClose={() => { setShowPreview(false); setStatus('empty'); }} title="LinkedIn Profile Synced">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', gap: '12px', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-3)', minWidth: '100px' }}>Name</div>
              <div style={{ fontSize: '14px', color: 'var(--text)', flex: 1 }}>{scrapedData ? `${scrapedData.first_name} ${scrapedData.last_name}` : ''}</div>
            </div>
            <div style={{ display: 'flex', gap: '12px', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-3)', minWidth: '100px' }}>Headline</div>
              <div style={{ fontSize: '14px', color: 'var(--text)', flex: 1 }}>{scrapedData?.linkedin_headline}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={startOptimization}>
              <i className="fa-solid fa-wand-magic-sparkles"></i> Run Optimizer
            </button>
            <button className="btn btn-ghost" onClick={() => { setShowPreview(false); setStatus('empty'); }}>Cancel</button>
          </div>
        </Modal>

      <style>{`
        .badge-neutral { background: var(--bg-3); border: 1px solid var(--border); color: var(--text-2); border-radius: 99px; padding: 4px 12px; font-size: 12px; }
      `}</style>
    </>
  );
}
