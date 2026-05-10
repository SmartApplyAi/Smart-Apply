import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useWebSocket } from '../websocket/WebSocketProvider';
import api from '../services/api';
import { escHtml, timeAgo, formatDate } from '../services/utils';
import StatCard from '../components/common/StatCard';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const PAGE_SIZE = 20;

function MatchBadge({ score }) {
  if (score == null) return <span className="result-pill" style={{ background: 'rgba(148,163,184,0.1)', color: '#94a3b8', fontSize: '11px' }}>N/A</span>;
  const color = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
  const bg = score >= 80 ? 'rgba(34,197,94,0.12)' : score >= 50 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: bg, color, padding: '3px 10px', borderRadius: '20px', fontWeight: 700, fontSize: '12px' }}>
      {score}%
    </span>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const wsCtx = useWebSocket();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('overview');
  const [summary, setSummary] = useState(null);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyFilter, setHistoryFilter] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [history, setHistory] = useState({ applications: [], total: 0, pages: 0 });
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [pastRecommendations, setPastRecommendations] = useState([]);
  const searchTimer = useRef(null);

  useEffect(() => {
    const path = location.pathname.split('/').filter(Boolean).pop();
    if (path === 'history') setActiveTab('history');
    else if (path === 'extension') setActiveTab('extension');
    else setActiveTab('overview');
  }, [location]);

  const userName = summary?.user_profile
    ? `${summary.user_profile.first_name || ''} ${summary.user_profile.last_name || ''}`.trim() || user?.email?.split('@')[0] || 'User'
    : 'Loading…';

  const loadDashboard = useCallback(async () => {
    try {
      const data = await api.get('/dashboard/summary');
      setSummary(data);
    } catch { /* silently fail for polling */ }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true); setHistoryError('');
    try {
      let url = `/jobs/history?skip=${historyPage * 10}&limit=10`;
      if (historyFilter) url += `&status=${historyFilter}`;
      if (debouncedSearchQuery) url += `&query=${encodeURIComponent(debouncedSearchQuery)}`;
      const data = await api.get(url);
      setHistory(data);
    } catch (err) {
      setHistoryError('Failed to load history');
    } finally { setHistoryLoading(false); }
  }, [historyPage, historyFilter, debouncedSearchQuery]);

  const loadRecommendations = useCallback(async () => {
    try {
      const data = await api.get('/jobs/history?result=Recommended&limit=5');
      setPastRecommendations(data.applications || []);
    } catch { /* silently fail */ }
  }, []);

  useEffect(() => { loadDashboard(); loadRecommendations(); }, [loadDashboard, loadRecommendations]);
  useEffect(() => { if (activeTab === 'history') loadHistory(); }, [activeTab, loadHistory]);

  // WebSocket-driven reactive updates (replace polling when WS connected)
  useEffect(() => {
    if (!wsCtx?.subscribe) return;
    const unsub = wsCtx.subscribe('JOB_APPLIED', () => {
      loadDashboard();
      if (activeTab === 'history') loadHistory();
    });
    return unsub;
  }, [wsCtx, loadDashboard, loadHistory, activeTab]);

  // Fallback polling (only when WS is not connected)
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadDashboard();
        if (activeTab === 'history') loadHistory();
      }
    }, 10000); // Slower polling since WS handles real-time
    return () => clearInterval(id);
  }, [loadDashboard, loadHistory, activeTab]);

  const handleSearch = (val) => {
    setSearchQuery(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearchQuery(val);
      setHistoryFilter(null);
      setHistoryPage(0);
    }, 400);
  };

  const downloadExtension = async () => {
    try {
      const resp = await fetch('/api/jobs/extension/download', { method: 'HEAD' });
      const cl = parseInt(resp.headers.get('Content-Length') || '0', 10);
      if (resp.ok && cl > 100) { window.location.href = '/api/jobs/extension/download'; }
      else { showToast('Extension is not yet packaged. Load it as an "Unpacked" extension.', 'info'); setActiveTab('extension'); }
    } catch { showToast('Extension not available. See setup instructions.', 'info'); setActiveTab('extension'); }
  };

  const activity = summary?.activity || { counts: [0,0,0,0,0,0,0], labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] };
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const chartData = {
    labels: activity.labels,
    datasets: [{ label: 'Applications', data: activity.counts, backgroundColor: isDark ? '#0a84ff' : '#0071e3', borderRadius: 4, barPercentage: 0.6 }],
  };
  const chartOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }, border: { display: false } }, x: { grid: { display: false }, border: { display: false } } } };

  const totalPages = Math.ceil(history.total / PAGE_SIZE);

  // Live feed from WebSocket
  const liveFeed = wsCtx?.liveFeed || [];
  
  // Combine real-time recommendations with past recommendations
  const recommendedJobs = [...(wsCtx?.recommendedJobs || []), ...pastRecommendations].reduce((acc, job) => {
    if (!acc.find(j => j.id === job.id || j.job_url === job.job_url)) {
      acc.push(job);
    }
    return acc;
  }, []).slice(0, 5);

    return (
      <>
          <div className="page-header">
            <div><h3>Welcome back{summary?.user_profile?.first_name ? `, ${summary.user_profile.first_name}` : ''}!</h3><p className="text-muted text-sm">Here is your job application overview</p></div>
            <div className="page-header-actions"><button onClick={downloadExtension} className="btn btn-primary btn-sm"><i className="fa-brands fa-chrome"></i> Extension</button></div>
          </div>

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div>
              {summary === null ? (
                <div className="stats-overview stagger">
                  {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: '100px', borderRadius: 'var(--radius)' }}></div>)}
                </div>
              ) : (
                <div className="stats-overview stagger">
                  <StatCard label="Total Applications" value={summary.total ?? 0} sub="All time" className="active" />
                  <StatCard label="Successfully Applied" value={summary.applied ?? 0} sub={`${summary.success_rate ?? 0}% success rate`} className="active" />
                  <StatCard label="Automation Status" value={summary.automation_status === 'running' ? 'Active' : (summary.pending_tasks ?? 0)} sub={summary.automation_status === 'running' ? 'Bot is running' : summary.automation_status === 'paused' ? 'Paused' : 'No active sessions'} className="active" />
                </div>
              )}

              {/* Live Feed */}
              {liveFeed.length > 0 && (
                <div className="card" style={{ marginTop: '28px', border: '1px solid rgba(79,124,255,0.2)' }}>
                  <h4 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'pulse 2s infinite' }}></span>
                    <i className="fa-solid fa-bolt"></i> Live Feed
                  </h4>
                  <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                    {liveFeed.slice(0, 10).map((item, i) => (
                      <div key={i} className="reveal active" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', gap: '8px', animation: `slideInUp 0.3s ease ${i * 0.05}s both` }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.job_title || 'Unknown'}</div>
                          <div className="text-muted" style={{ fontSize: '12px' }}>{item.company || 'Unknown'}</div>
                        </div>
                        <MatchBadge score={item.match_score} />
                        <span className={`result-pill result-${item.result || item.type}`} style={{ fontSize: '11px', textTransform: 'capitalize' }}>{item.result || item.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommended Manual Applies */}
              {recommendedJobs.length > 0 && (
                <div className="card" style={{ marginTop: '28px', border: '1px solid rgba(245,158,11,0.3)', background: 'linear-gradient(145deg, var(--card-bg) 0%, rgba(245,158,11,0.02) 100%)' }}>
                  <h4 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: '#f59e0b' }}>
                    <i className="fa-solid fa-bullseye"></i> Highly Recommended Manual Applies
                  </h4>
                  <p className="text-sm text-muted" style={{ marginBottom: '16px' }}>The bot found these external jobs to be a high match for your resume. You can apply to them manually.</p>
                  <div>
                    {recommendedJobs.map((item, i) => (
                      <div key={i} className="reveal active" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: i < recommendedJobs.length - 1 ? '1px solid var(--border)' : 'none', flexWrap: 'wrap', gap: '8px', animation: `fadeIn 0.4s ease ${i * 0.1}s both` }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: '14px', fontWeight: 600 }}>{item.job_title || 'Unknown'}</div>
                          <div className="text-muted" style={{ fontSize: '13px' }}>{item.company || 'Unknown'}</div>
                        </div>
                        <MatchBadge score={item.match_score} />
                        <a href={item.job_url || '#'} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '6px 14px', fontSize: '12px' }}>
                          <i className="fa-solid fa-arrow-up-right-from-square"></i> Apply
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="overview-panels" style={{ marginTop: '28px' }}>
                <div className="card">
                  <h4 style={{ marginBottom: '16px' }}><i className="fa-solid fa-clock-rotate-left"></i> Recent Applications</h4>
                  {!(summary?.recent_applications?.length) ? (
                    <div style={{ textAlign: 'center', padding: '32px 0' }}><i className="fa-solid fa-folder-open" style={{ fontSize: '32px', color: 'var(--text-3)', marginBottom: '12px', display: 'block' }}></i><p className="text-muted text-sm">No recent applications found.</p></div>
                  ) : summary.recent_applications.map((a, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: '4px' }}>
                      <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontSize: '14px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.job_title}</div><div className="text-muted text-sm">{a.company} · {timeAgo(a.applied_at)}</div></div>
                      <MatchBadge score={a.match_score} />
                      <span className={`result-pill result-${a.result}`}>{a.result}</span>
                    </div>
                  ))}
                  <a href="#" onClick={(e) => { e.preventDefault(); setActiveTab('history'); }} className="text-sm text-primary" style={{ display: 'block', marginTop: '12px' }}>View all <i className="fa-solid fa-arrow-right"></i></a>
                </div>
                <div className="card">
                  <h4 style={{ marginBottom: '16px' }}><i className="fa-solid fa-chart-line"></i> Application Activity</h4>
                  <div style={{ height: '168px', position: 'relative' }}><Bar data={chartData} options={chartOpts} /></div>
                </div>
                <div className="card">
                  <h4 style={{ marginBottom: '16px' }}><i className="fa-solid fa-chart-pie"></i> By Platform</h4>
                  {Object.entries(summary?.by_platform || {}).length ? Object.entries(summary.by_platform).map(([p, c]) => (
                    <div key={p} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}><span style={{ textTransform: 'capitalize', fontSize: '14px' }}>{p}</span><span style={{ fontWeight: 600, fontSize: '14px' }}>{c}</span></div>
                  )) : <div style={{ textAlign: 'center', padding: '24px 0' }}><p className="text-muted text-sm">No data available yet.</p></div>}
                </div>
              </div>
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <h4><i className="fa-solid fa-list-check"></i> Application History</h4>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ position: 'relative', width: 'clamp(200px, 30vw, 300px)' }}>
                    <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', fontSize: '14px' }}></i>
                    <input type="text" className="input" placeholder="Search jobs or companies..." style={{ paddingLeft: '36px', height: '38px', fontSize: '14px' }} value={searchQuery} onChange={(e) => handleSearch(e.target.value)} />
                  </div>
                  <div className="filter-bar" style={{ marginBottom: 0 }}>
                    {['All', 'Applied', 'Failed', 'Skipped'].map(f => (
                      <button key={f} className={`filter-btn ${historyFilter === (f === 'All' ? null : f) ? 'active' : ''}`} onClick={() => { setHistoryFilter(f === 'All' ? null : f); setHistoryPage(0); }}>{f}</button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="table-wrapper"><table><thead><tr><th>Job Title</th><th>Company</th><th>Match</th><th>Platform</th><th>Status</th><th>Applied</th><th>Link</th></tr></thead>
                  <tbody>
                    {historyLoading ? (
                      <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px' }}><div className="loader-spin mx-auto"></div></td></tr>
                    ) : historyError ? (
                      <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--danger)' }}><i className="fa-solid fa-triangle-exclamation"></i> {historyError}</td></tr>
                    ) : history.applications.length === 0 ? (
                      <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-3)' }}>No applications found.</td></tr>
                    ) : history.applications.map((a, i) => (
                  <tr key={i}>
                    <td><div style={{ fontWeight: 500 }}>{a.job_title}</div></td>
                    <td className="text-sm">{a.company}</td>
                    <td><MatchBadge score={a.match_score} /></td>
                    <td style={{ textTransform: 'capitalize' }}>{a.platform || 'unknown'}</td>
                    <td><span className={`result-pill result-${a.result}`}>{a.result}</span></td>
                    <td className="text-sm">{formatDate(a.applied_at)}</td>
                    <td><a href={a.job_link || a.job_url || '#'} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ padding: '4px' }}><i className="fa-solid fa-external-link"></i></a></td>
                  </tr>
                ))}
              </tbody></table></div>
              {totalPages > 1 && <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
                {Array.from({ length: totalPages }, (_, i) => <button key={i} className={`btn btn-sm ${i === historyPage ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setHistoryPage(i); }}>{i + 1}</button>)}
              </div>}
            </div>
          )}

          {/* Extension Tab */}
          {activeTab === 'extension' && (
            <div>
              <div className="card" style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
                  <div><h4 style={{ marginBottom: '6px' }}><i className="fa-brands fa-chrome"></i> SmartApply Chrome Extension</h4><p className="text-muted text-sm">Sign in with your SmartApply email and password directly in the extension popup.</p></div>
                  <button onClick={downloadExtension} className="btn btn-primary"><i className="fa-solid fa-download"></i> Download</button>
                </div>
              </div>
              <div className="card">
                <h4 style={{ marginBottom: '20px' }}><i className="fa-solid fa-circle-info"></i> Setup Instructions</h4>
                {['Download and unzip — Click "Download" above and unzip to a permanent folder.', 'Load in Chrome — chrome://extensions → Enable Developer Mode → Load Unpacked.', 'Sign in — Use your SmartApply email and password in the popup.', 'Go to LinkedIn Jobs and click Start Bot — Applications appear here automatically.'].map((s, i) => (
                  <div className="setup-step" key={i}><div className="step-num">{i + 1}</div><div><div style={{ fontWeight: 500, marginBottom: '3px' }}>{s.split(' — ')[0]}</div><div className="text-muted text-sm">{s.split(' — ')[1]}</div></div></div>
                ))}
              </div>
            </div>
          )}
      </>
    );
}
