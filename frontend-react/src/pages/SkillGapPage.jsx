import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import { useWebSocket } from '../websocket/WebSocketProvider';
import '../styles/SkillGapPage.css';

const CIRCUMFERENCE = 2 * Math.PI * 72; // radius 72

function ScoreRing({ score, label }) {
  const offset = CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE;
  const color = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : score >= 30 ? '#f97316' : '#ef4444';

  return (
    <div className="score-ring">
      <svg viewBox="0 0 180 180">
        <circle className="ring-bg" cx="90" cy="90" r="72" />
        <circle
          className="ring-fill"
          cx="90" cy="90" r="72"
          stroke={color}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="score-value">
        <div className="score-number" style={{ color }}>{score}</div>
        <div className="score-label">{label || 'Avg Match'}</div>
      </div>
    </div>
  );
}

export default function SkillGapPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [activeSection, setActiveSection] = useState('analyzer');
  const [analysis, setAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [days, setDays] = useState(30);

  const [roadmap, setRoadmap] = useState(null);
  const [roadmapLoading, setRoadmapLoading] = useState(false);
  const [targetRole, setTargetRole] = useState('');
  const [currentSkillsInput, setCurrentSkillsInput] = useState('');
  const [targetSkillsInput, setTargetSkillsInput] = useState('');
  const [expandedPhases, setExpandedPhases] = useState({});

  const [savedRoadmaps, setSavedRoadmaps] = useState([]);
  const [savedLoading, setSavedLoading] = useState(false);

  const [pdfExporting, setPdfExporting] = useState(false);
  const roadmapRef = useRef(null);
  const { subscribe } = useWebSocket();
  const roadmapLoadingRef = useRef(false);

  // Sync ref with state for use in listener
  useEffect(() => {
    roadmapLoadingRef.current = roadmapLoading;
  }, [roadmapLoading]);

  // WebSocket listener for roadmap ready event
  useEffect(() => {
    if (!subscribe) return;
    const unsub = subscribe('ROADMAP_READY', (event) => {
      if (roadmapLoadingRef.current) {
        showToast('Roadmap is ready!', 'success');
        loadSavedRoadmap(event.payload.id);
        setRoadmapLoading(false);
        loadSavedRoadmaps();
      }
    });
    return unsub;
  }, [subscribe, loadSavedRoadmaps, showToast]);

  // ── Load Analysis ────────────────────────────────────────────────────
  const loadAnalysis = useCallback(async () => {
    setAnalysisLoading(true);
    try {
      const data = await api.get(`/skillgap/analysis?days=${days}`);
      setAnalysis(data);
    } catch (err) {
      showToast('Failed to load skill gap analysis', 'error');
    } finally {
      setAnalysisLoading(false);
    }
  }, [days, showToast]);

  useEffect(() => {
    if (activeSection === 'analyzer') loadAnalysis();
  }, [activeSection, loadAnalysis]);

  // ── Load Saved Roadmaps ──────────────────────────────────────────────
  const loadSavedRoadmaps = useCallback(async () => {
    setSavedLoading(true);
    try {
      const data = await api.get('/skillgap/roadmaps');
      setSavedRoadmaps(data.roadmaps || []);
    } catch { /* ignore */ }
    finally { setSavedLoading(false); }
  }, []);

  useEffect(() => {
    if (activeSection === 'roadmap') loadSavedRoadmaps();
  }, [activeSection, loadSavedRoadmaps]);

  // ── Generate Roadmap ─────────────────────────────────────────────────
  const generateRoadmap = async () => {
    setRoadmapLoading(true);
    try {
      const currentSkills = currentSkillsInput.split(',').map(s => s.trim()).filter(Boolean);
      const targetSkills = targetSkillsInput.split(',').map(s => s.trim()).filter(Boolean);

      const data = await api.post('/skillgap/roadmap', {
        target_role: targetRole,
        current_skills: currentSkills,
        target_skills: targetSkills,
      });

      setRoadmap(data);
      setExpandedPhases({});
      showToast('Roadmap generated successfully!', 'success');
      loadSavedRoadmaps(); // Refresh the list
    } catch (err) {
      // If it's a timeout (status 0 or no response), we don't clear loading
      // because the WebSocket listener will catch it when it finishes on the backend.
      if (err.code === 'ECONNABORTED' || !err.response) {
        showToast('Generation is taking a while. We will notify you when it is ready.', 'info');
      } else {
        showToast(err?.response?.data?.detail || 'Failed to generate roadmap', 'error');
        setRoadmapLoading(false);
      }
    } finally {
      // We only stop loading if we got a response or a real error.
      // If it's still running on the backend, we let the WS listener handle it.
    }
  };

  // ── Auto-fill from analysis ──────────────────────────────────────────
  const autoFillFromAnalysis = () => {
    if (!analysis) return;
    const matched = analysis.matched_skills?.map(s => s.skill) || [];
    const missing = analysis.missing_skills?.map(s => s.skill) || [];
    setCurrentSkillsInput(matched.slice(0, 15).join(', '));
    setTargetSkillsInput(missing.slice(0, 10).join(', '));
    showToast('Skills auto-filled from your analysis', 'success');
  };

  // ── Toggle Phase ─────────────────────────────────────────────────────
  const togglePhase = (idx) => {
    setExpandedPhases(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  // ── PDF Export ───────────────────────────────────────────────────────
  const exportPDF = async () => {
    if (!roadmapRef.current) return;
    setPdfExporting(true);

    try {
      // Expand all phases for PDF
      const allExpanded = {};
      (roadmap?.roadmap || []).forEach((_, i) => { allExpanded[i] = true; });
      setExpandedPhases(allExpanded);

      // Wait for re-render
      await new Promise(r => setTimeout(r, 300));

      const { default: html2canvas } = await import('html2canvas');
      const { default: jsPDF } = await import('jspdf');

      const canvas = await html2canvas(roadmapRef.current, {
        scale: 2,
        backgroundColor: '#0f1117',
        useCORS: true,
        logging: false,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      let heightLeft = pdfHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
      heightLeft -= pdf.internal.pageSize.getHeight();

      while (heightLeft > 0) {
        position = heightLeft - pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight);
        heightLeft -= pdf.internal.pageSize.getHeight();
      }

      const roleName = roadmap?.target_role || 'roadmap';
      pdf.save(`${roleName.replace(/\s+/g, '_')}_learning_roadmap.pdf`);
      showToast('PDF downloaded successfully!', 'success');
    } catch (err) {
      showToast('Failed to export PDF. Try again.', 'error');
      console.error('PDF export error:', err);
    } finally {
      setPdfExporting(false);
    }
  };

  // ── Load a saved roadmap ─────────────────────────────────────────────
  const loadSavedRoadmap = async (id) => {
    try {
      const data = await api.get(`/skillgap/roadmaps/${id}`);
      setRoadmap(data);
      setExpandedPhases({});
      setTargetRole(data.target_role || '');
    } catch {
      showToast('Failed to load roadmap', 'error');
    }
  };

  return (
    <>
      <div className="skillgap-hero">
        <h2><i className="fa-solid fa-chart-gantt"></i> Skill Gap Analyzer & Roadmap</h2>
        <p>Identify gaps in your skillset and generate a personalized learning path</p>
      </div>

      <div className="skillgap-tabs">
        <button className={`skillgap-tab ${activeSection === 'analyzer' ? 'active' : ''}`} onClick={() => setActiveSection('analyzer')}>
          <i className="fa-solid fa-magnifying-glass-chart"></i> Analyzer
        </button>
        <button className={`skillgap-tab ${activeSection === 'roadmap' ? 'active' : ''}`} onClick={() => setActiveSection('roadmap')}>
          <i className="fa-solid fa-route"></i> Roadmap Maker
        </button>
      </div>

      {/* ══ ANALYZER TAB ════════════════════════════════════════════════ */}
      {activeSection === 'analyzer' && (
        <div>
          {/* Time Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
            <span className="text-muted text-sm">Analyzing last</span>
            {[7, 14, 30, 90].map(d => (
              <button key={d} className={`btn btn-sm ${days === d ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setDays(d)}>{d} days</button>
            ))}
          </div>

          {analysisLoading ? (
            <div style={{ textAlign: 'center', padding: '60px 0' }}><div className="loader-spin mx-auto"></div><p className="text-muted text-sm" style={{ marginTop: '12px' }}>Analyzing your applications...</p></div>
          ) : !analysis || analysis.total_analyzed === 0 ? (
            <div className="skillgap-empty">
              <div className="empty-icon">📊</div>
              <h3>No Match Data Yet</h3>
              <p>Start applying to jobs with the extension to see your skill gap analysis. Match scores are computed automatically for each application.</p>
            </div>
          ) : (
            <>
              {/* Score + Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '32px', alignItems: 'center', marginBottom: '32px' }}>
                <div className="score-ring-container">
                  <ScoreRing score={analysis.average_match_score} label="Avg Match" />
                </div>
                <div>
                  <div className="stats-overview stagger" style={{ marginBottom: '0' }}>
                    <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', fontWeight: 800, color: 'var(--primary)' }}>{analysis.total_analyzed}</div>
                      <div className="text-muted text-sm">Jobs Analyzed</div>
                    </div>
                    <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', fontWeight: 800, color: '#22c55e' }}>{analysis.matched_skills?.length || 0}</div>
                      <div className="text-muted text-sm">Matched Skills</div>
                    </div>
                    <div className="card" style={{ padding: '16px', textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', fontWeight: 800, color: '#f87171' }}>{analysis.missing_skills?.length || 0}</div>
                      <div className="text-muted text-sm">Missing Skills</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Matched Skills */}
              {analysis.matched_skills?.length > 0 && (
                <div className="card" style={{ marginBottom: '20px' }}>
                  <h4 style={{ marginBottom: '12px' }}><i className="fa-solid fa-check-circle" style={{ color: '#22c55e' }}></i> Your Matched Skills</h4>
                  <div className="skill-tags">
                    {analysis.matched_skills.map((s, i) => (
                      <span key={i} className="skill-tag matched" style={{ animationDelay: `${i * 0.04}s` }}>
                        <i className="fa-solid fa-check" style={{ fontSize: '10px' }}></i> {s.skill}
                        <span className="tag-count">×{s.count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing Skills */}
              {analysis.missing_skills?.length > 0 && (
                <div className="card" style={{ marginBottom: '20px' }}>
                  <h4 style={{ marginBottom: '12px' }}><i className="fa-solid fa-triangle-exclamation" style={{ color: '#f87171' }}></i> Skills to Learn</h4>
                  <div className="skill-tags">
                    {analysis.missing_skills.map((s, i) => (
                      <span key={i} className="skill-tag missing" style={{ animationDelay: `${i * 0.04}s` }}>
                        <i className="fa-solid fa-xmark" style={{ fontSize: '10px' }}></i> {s.skill}
                        <span className="tag-count">×{s.count}</span>
                      </span>
                    ))}
                  </div>
                  <button className="btn btn-primary btn-sm" style={{ marginTop: '16px' }} onClick={() => { autoFillFromAnalysis(); setActiveSection('roadmap'); }}>
                    <i className="fa-solid fa-route"></i> Generate Learning Roadmap →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ══ ROADMAP MAKER TAB ═══════════════════════════════════════════ */}
      {activeSection === 'roadmap' && (
        <div>
          {/* Generator Form */}
          <div className="roadmap-form">
            <h4 style={{ marginBottom: '16px' }}><i className="fa-solid fa-wand-magic-sparkles"></i> Generate Your Roadmap</h4>
            <div className="form-row">
              <div>
                <label className="text-sm text-muted" style={{ display: 'block', marginBottom: '6px' }}>Target Role</label>
                <input type="text" className="input" placeholder="e.g. Senior Frontend Engineer" value={targetRole} onChange={(e) => setTargetRole(e.target.value)} />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                {analysis && (
                  <button className="btn btn-ghost btn-sm" onClick={autoFillFromAnalysis} style={{ whiteSpace: 'nowrap' }}>
                    <i className="fa-solid fa-magic"></i> Auto-fill from Analysis
                  </button>
                )}
              </div>
            </div>
            <div className="form-row">
              <div>
                <label className="text-sm text-muted" style={{ display: 'block', marginBottom: '6px' }}>Your Current Skills (comma-separated)</label>
                <input type="text" className="input" placeholder="Python, React, JavaScript, SQL..." value={currentSkillsInput} onChange={(e) => setCurrentSkillsInput(e.target.value)} />
              </div>
              <div>
                <label className="text-sm text-muted" style={{ display: 'block', marginBottom: '6px' }}>Skills to Learn (comma-separated)</label>
                <input type="text" className="input" placeholder="Kubernetes, GraphQL, TypeScript..." value={targetSkillsInput} onChange={(e) => setTargetSkillsInput(e.target.value)} />
              </div>
            </div>
            <button className="btn btn-primary" onClick={generateRoadmap} disabled={roadmapLoading || (!targetRole && !targetSkillsInput)}>
              {roadmapLoading ? <><div className="loader-spin" style={{ width: '16px', height: '16px', borderWidth: '2px' }}></div> Generating...</> : <><i className="fa-solid fa-sparkles"></i> Generate Roadmap</>}
            </button>
          </div>

          {/* Saved Roadmaps */}
          {!roadmap && savedRoadmaps.length > 0 && (
            <div style={{ marginBottom: '32px' }}>
              <h4 style={{ marginBottom: '16px' }}><i className="fa-solid fa-bookmark"></i> Your Saved Roadmaps</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                {savedRoadmaps.map((rm) => (
                  <div key={rm.id} className="saved-roadmap-card" onClick={() => loadSavedRoadmap(rm.id)}>
                    <div style={{ fontWeight: 600, fontSize: '15px', marginBottom: '6px' }}>{rm.target_role || 'Untitled Roadmap'}</div>
                    <div className="text-muted text-sm">{rm.total_duration} · {rm.roadmap?.length || 0} phases</div>
                    <div className="text-muted" style={{ fontSize: '11px', marginTop: '6px' }}>{rm.created_at ? new Date(rm.created_at).toLocaleDateString() : ''}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Generated Roadmap */}
          {roadmap && roadmap.roadmap?.length > 0 && (
            <div ref={roadmapRef}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <h3 style={{ fontSize: '20px', fontWeight: 700 }}>
                    {roadmap.target_role ? `${roadmap.target_role} Roadmap` : 'Learning Roadmap'}
                  </h3>
                  <p className="text-muted text-sm">Estimated duration: {roadmap.total_duration}</p>
                </div>
                <button className="pdf-btn" onClick={exportPDF} disabled={pdfExporting}>
                  {pdfExporting ? <><div className="loader-spin" style={{ width: '14px', height: '14px', borderWidth: '2px' }}></div> Exporting...</> : <><i className="fa-solid fa-file-pdf"></i> Download PDF</>}
                </button>
              </div>

              {/* Timeline */}
              <div className="roadmap-timeline">
                {roadmap.roadmap.map((phase, i) => (
                  <div key={i} className="roadmap-phase">
                    <div className="phase-node" style={{ background: phase.color || `hsl(${i * 60 + 220}, 70%, 55%)` }}>{phase.phase || i + 1}</div>
                    <div className={`phase-card ${expandedPhases[i] ? 'expanded' : ''}`} onClick={() => togglePhase(i)}>
                      <div className="phase-header">
                        <div>
                          <div className="phase-title">{phase.title}</div>
                          <div className="phase-description">{phase.description}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="phase-duration"><i className="fa-regular fa-clock"></i> {phase.duration}</span>
                          <i className={`fa-solid fa-chevron-${expandedPhases[i] ? 'up' : 'down'}`} style={{ color: 'var(--text-3)', fontSize: '12px', transition: 'transform 0.3s' }}></i>
                        </div>
                      </div>

                      {expandedPhases[i] && (
                        <div className="phase-skills" onClick={(e) => e.stopPropagation()}>
                          {phase.skills?.map((skill, j) => (
                            <div key={j} className="phase-skill-item">
                              <div className="skill-item-header">
                                <span className="skill-item-name">{skill.name}</span>
                                <span className={`skill-priority ${skill.priority || 'medium'}`}>{skill.priority || 'medium'}</span>
                              </div>
                              {skill.description && <div className="skill-item-desc">{skill.description}</div>}
                              {skill.resources?.length > 0 && (
                                <div className="skill-resources">
                                  {skill.resources.map((res, k) => (
                                    <a key={k} href={res.url || '#'} target="_blank" rel="noreferrer" className="resource-link">
                                      <i className={`fa-solid ${res.type === 'course' ? 'fa-graduation-cap' : res.type === 'project' ? 'fa-code' : res.type === 'documentation' ? 'fa-book' : 'fa-play'}`}></i>
                                      {res.title}
                                    </a>
                                  ))}
                                </div>
                              )}
                              {skill.estimated_hours && <div className="skill-hours"><i className="fa-regular fa-clock"></i> ~{skill.estimated_hours} hours</div>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Milestones */}
              {roadmap.milestones?.length > 0 && (
                <div style={{ marginTop: '32px' }}>
                  <h4 style={{ marginBottom: '4px' }}><i className="fa-solid fa-flag-checkered"></i> Milestones</h4>
                  <div className="milestones-grid">
                    {roadmap.milestones.map((ms, i) => (
                      <div key={i} className="milestone-card">
                        <div className="milestone-icon"><i className="fa-solid fa-trophy"></i></div>
                        <div className="milestone-title">{ms.title}</div>
                        <div className="milestone-desc">{ms.description}</div>
                        <div className="text-muted" style={{ fontSize: '11px', marginTop: '8px' }}>Phase {ms.phase}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tips */}
              {roadmap.tips?.length > 0 && (
                <div className="card" style={{ marginTop: '24px' }}>
                  <h4><i className="fa-solid fa-lightbulb" style={{ color: '#f59e0b' }}></i> Pro Tips</h4>
                  <ul className="tips-list">
                    {roadmap.tips.map((tip, i) => <li key={i}>{tip}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Empty state when no roadmap */}
          {!roadmap && savedRoadmaps.length === 0 && !roadmapLoading && (
            <div className="skillgap-empty">
              <div className="empty-icon">🗺️</div>
              <h3>Create Your First Roadmap</h3>
              <p>Enter your target role and skills above, or run the analyzer first to auto-detect skill gaps.</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
