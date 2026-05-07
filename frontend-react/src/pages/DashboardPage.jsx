import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import { escHtml, timeAgo, formatDate } from '../services/utils';
import StatCard from '../components/common/StatCard';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const PAGE_SIZE = 20;

export default function DashboardPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('overview');
  const [summary, setSummary] = useState(null);
  const [history, setHistory] = useState({ applications: [], total: 0 });
  const [historyFilter, setHistoryFilter] = useState(null);
  const [historyPage, setHistoryPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
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
    try {
      const skip = historyPage * PAGE_SIZE;
      let url = `/jobs/history?skip=${skip}&limit=${PAGE_SIZE}`;
      if (historyFilter) url += `&result=${historyFilter}`;
      if (searchQuery) url += `&q=${encodeURIComponent(searchQuery)}`;
      const data = await api.get(url);
      setHistory({ applications: data.applications || [], total: data.total || 0 });
    } catch { /* fail silently */ }
  }, [historyPage, historyFilter, searchQuery]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => { if (activeTab === 'history') loadHistory(); }, [activeTab, loadHistory]);

  // 5s polling
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadDashboard();
        if (activeTab === 'history') loadHistory();
      }
    }, 5000);
    return () => clearInterval(id);
  }, [loadDashboard, loadHistory, activeTab]);

  const handleSearch = (val) => {
    setSearchQuery(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
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

    return (
      <>
          <div className="page-header">
            <div><h3>Welcome back{summary?.user_profile?.first_name ? `, ${summary.user_profile.first_name}` : ''}!</h3><p className="text-muted text-sm">Here is your job application overview</p></div>
            <div className="page-header-actions"><button onClick={downloadExtension} className="btn btn-primary btn-sm"><i className="fa-brands fa-chrome"></i> Extension</button></div>
          </div>

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div>
              <div className="stats-overview stagger">
                <StatCard label="Total Applied" value={summary?.total || 0} sub="across all platforms" />
                <StatCard label="Successful" value={summary?.applied || 0} valueColor="var(--primary)" sub={`${summary?.success_rate || 0}% success rate`} />
                <StatCard label="Failed / Skipped" value={(summary?.failed || 0) + (summary?.skipped || 0)} sub={`${summary?.failed || 0} failed · ${summary?.skipped || 0} skipped`} />
              </div>
              <div className="overview-panels" style={{ marginTop: '28px' }}>
                <div className="card">
                  <h4 style={{ marginBottom: '16px' }}><i className="fa-solid fa-clock-rotate-left"></i> Recent Applications</h4>
                  {!(summary?.recent_applications?.length) ? (
                    <div style={{ textAlign: 'center', padding: '32px 0' }}><i className="fa-solid fa-folder-open" style={{ fontSize: '32px', color: 'var(--text-3)', marginBottom: '12px', display: 'block' }}></i><p className="text-muted text-sm">No recent applications found.</p></div>
                  ) : summary.recent_applications.map((a, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: '4px' }}>
                      <div style={{ minWidth: 0, flex: 1 }}><div style={{ fontSize: '14px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.job_title}</div><div className="text-muted text-sm">{a.company} · {timeAgo(a.applied_at)}</div></div>
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
                    {[null, 'Applied', 'Failed', 'Skipped'].map((f) => (
                      <button key={f || 'all'} className={`filter-btn${historyFilter === f ? ' active' : ''}`} onClick={() => { setHistoryFilter(f); setHistoryPage(0); loadHistory(); }}>
                        {f || 'All'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="table-wrapper"><table><thead><tr><th>Job Title</th><th>Company</th><th>Platform</th><th>Status</th><th>Applied</th><th>Link</th></tr></thead><tbody>
                {!history.applications.length ? <tr><td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-3)' }}>No applications found.</td></tr> : history.applications.map((a, i) => (
                  <tr key={i}><td><div style={{ fontWeight: 500 }}>{a.job_title}</div></td><td className="text-sm">{a.company}</td><td style={{ textTransform: 'capitalize' }}>{a.platform || 'unknown'}</td><td><span className={`result-pill result-${a.result}`}>{a.result}</span></td><td className="text-sm">{formatDate(a.applied_at)}</td><td><a href={a.job_link || a.job_url || '#'} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ padding: '4px' }}><i className="fa-solid fa-external-link"></i></a></td></tr>
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
