import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import api from '../services/api';
import { formatDate, timeAgo } from '../services/utils';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title as ChartTitle,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ChartTitle,
  Tooltip,
  Legend,
  Filler
);

export default function AdminPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [trends, setTrends] = useState(null);
  const [users, setUsers] = useState([]);
  const [keys, setKeys] = useState([]);
  const [newKey, setNewKey] = useState('');
  const [sessions, setSessions] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateContent, setTemplateContent] = useState('');
  const [broadcast, setBroadcast] = useState({ subject: '', message: '' });
  
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Question Modal State
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [questionForm, setQuestionForm] = useState({
    text: '',
    type: 'text',
    is_required: false,
    options: ''
  });

  // Redirect if not admin
  useEffect(() => {
    if (user && user.role !== 'admin') {
      showToast('Unauthorized access', 'error');
      navigate('/dashboard');
    }
  }, [user, navigate, showToast]);

  const fetchData = useCallback(async (tab) => {
    setLoading(true);
    try {
      if (tab === 'overview') {
        const [s, t] = await Promise.all([
          api.get('/admin/stats'),
          api.get('/admin/trends')
        ]);
        setStats(s);
        setTrends(t);
      } else if (tab === 'users') {
        const data = await api.get('/admin/users?limit=50');
        setUsers(data.users || []);
      } else if (tab === 'keys') {
        const data = await api.get('/admin/keys');
        setKeys(data.keys || []);
      } else if (tab === 'sessions') {
        const data = await api.get('/admin/sessions');
        setSessions(data.sessions || []);
      } else if (tab === 'audit') {
        const data = await api.get('/admin/audit-logs');
        setAuditLogs(data.logs || []);
      } else if (tab === 'questions') {
        const data = await api.get('/admin/questions');
        setQuestions(data.questions || []);
      } else if (tab === 'templates') {
        const data = await api.get('/admin/email-templates');
        setTemplates(data.templates || []);
      }
    } catch (err) {
      showToast('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchData(activeTab);
  }, [activeTab, fetchData]);

  // User Actions
  const toggleUserStatus = async (userId, current) => {
    try {
      await api.request('PATCH', `/admin/users/${userId}`, { is_active: !current });
      showToast('User status updated', 'success');
      fetchData('users');
    } catch (err) { showToast(err.detail, 'error'); }
  };

  const toggleUserRole = async (userId, currentRole) => {
    try {
      const newRole = currentRole === 'admin' ? 'user' : 'admin';
      await api.request('PATCH', `/admin/users/${userId}`, { role: newRole });
      showToast('User role updated', 'success');
      fetchData('users');
    } catch (err) { showToast(err.detail, 'error'); }
  };

  const deleteUser = async (userId) => {
    if (!confirm('Permanently delete this user?')) return;
    try {
      await api.delete(`/admin/users/${userId}/hard-delete`);
      showToast('User deleted', 'success');
      fetchData('users');
    } catch (err) { showToast(err.detail, 'error'); }
  };

  // Key Actions
  const addKey = () => {
    if (!newKey.startsWith('nvapi-')) return showToast('Invalid key format', 'error');
    if (keys.includes(newKey)) return showToast('Key already exists', 'error');
    setKeys([...keys, newKey]);
    setNewKey('');
  };

  const removeKey = (idx) => {
    setKeys(keys.filter((_, i) => i !== idx));
  };

  const saveKeys = async () => {
    try {
      await api.put('/admin/keys', { keys });
      showToast('Keys saved', 'success');
    } catch (err) { showToast(err.detail, 'error'); }
  };

  // Question Actions
  const openQuestionModal = (q = null) => {
    if (q) {
      setEditingQuestion(q);
      setQuestionForm({
        text: q.text,
        type: q.type,
        is_required: q.is_required,
        options: (q.options || []).join(', ')
      });
    } else {
      setEditingQuestion(null);
      setQuestionForm({ text: '', type: 'text', is_required: false, options: '' });
    }
    setShowQuestionModal(true);
  };

  const saveQuestion = async () => {
    const payload = {
      ...questionForm,
      options: questionForm.options.split(',').map(s => s.trim()).filter(Boolean)
    };
    try {
      if (editingQuestion) {
        await api.put(`/admin/questions/${editingQuestion.id}`, payload);
        showToast('Question updated', 'success');
      } else {
        await api.post('/admin/questions', payload);
        showToast('Question added', 'success');
      }
      setShowQuestionModal(false);
      fetchData('questions');
    } catch (err) { showToast(err.detail, 'error'); }
  };

  const deleteQuestion = async (id) => {
    if (!confirm('Delete this question?')) return;
    try {
      await api.delete(`/admin/questions/${id}`);
      showToast('Question deleted', 'success');
      fetchData('questions');
    } catch (err) { showToast(err.detail, 'error'); }
  };

  // Broadcast
  const sendBroadcast = async () => {
    if (!broadcast.subject || !broadcast.message) return showToast('Fields required', 'error');
    try {
      await api.post('/admin/broadcast', broadcast);
      showToast('Broadcast sent', 'success');
      setBroadcast({ subject: '', message: '' });
    } catch (err) { showToast(err.detail, 'error'); }
  };

  const chartData = trends ? {
    labels: trends.labels,
    datasets: [{
      label: 'Applications',
      data: trends.data,
      borderColor: '#0071e3',
      backgroundColor: 'rgba(0, 113, 227, 0.1)',
      fill: true,
      tension: 0.4
    }]
  } : null;

  return (
    <>
        <div className="page-header">
          <div><h3>Admin Dashboard</h3><p className="text-muted text-sm">Platform management and insights</p></div>
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '8px' }}>
            {['overview', 'users', 'keys', 'sessions', 'audit', 'broadcast', 'questions', 'templates'].map(t => (
              <button key={t} className={`btn btn-sm ${activeTab === t ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setActiveTab(t)}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'overview' && stats && (
          <div className="stagger">
            <div className="grid-3">
              <div className="card">
                <div className="text-muted text-xs uppercase font-bold">Total Users</div>
                <div style={{ fontSize: '2rem', fontWeight: 800 }}>{stats.total_users || 0}</div>
                <div className="text-muted text-sm">{stats.active_users || 0} active</div>
              </div>
              <div className="card">
                <div className="text-muted text-xs uppercase font-bold">Applications</div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent)' }}>{stats.total_applications || 0}</div>
                <div className="text-muted text-sm">{stats.success_rate || 0}% success rate</div>
              </div>
              <div className="card">
                <div className="text-muted text-xs uppercase font-bold">API Keys</div>
                <div style={{ fontSize: '2rem', fontWeight: 800 }}>{stats.nvidia_keys || 0}</div>
                <div className="text-muted text-sm">Active NIM Keys</div>
              </div>
            </div>
            <div className="card" style={{ marginTop: '24px' }}>
              <h4 style={{ marginBottom: '20px' }}>Application Trends (Last 7 Days)</h4>
              {chartData && <Line data={chartData} options={{ responsive: true, plugins: { legend: { display: false } } }} />}
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border)' }}>
              <input type="text" className="input" placeholder="Search users..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Apps</th>
                    <th>Joined</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.filter(u => u.email.toLowerCase().includes(searchQuery.toLowerCase())).map(u => (
                    <tr key={u.id}>
                      <td><div style={{ fontWeight: 600 }}>{u.email}</div><div className="text-xs text-muted">ID: {u.id}</div></td>
                      <td><span className={`badge ${u.role === 'admin' ? 'badge-warning' : 'badge-neutral'}`}>{u.role}</span></td>
                      <td><div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><div className={`status-dot ${u.is_active ? 'running' : 'stopped'}`}></div> {u.is_active ? 'Active' : 'Inactive'}</div></td>
                      <td>{u.app_count}</td>
                      <td className="text-muted text-sm">{formatDate(u.created_at)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => toggleUserStatus(u.id, u.is_active)}><i className={`fa-solid ${u.is_active ? 'fa-user-slash' : 'fa-user-check'}`}></i></button>
                          <button className="btn btn-ghost btn-sm" onClick={() => toggleUserRole(u.id, u.role)}><i className={`fa-solid ${u.role === 'admin' ? 'fa-user-minus' : 'fa-user-shield'}`}></i></button>
                          <button className="btn btn-ghost btn-sm text-danger" onClick={() => deleteUser(u.id)}><i className="fa-solid fa-trash-can"></i></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'keys' && (
          <div className="card">
            <h4 style={{ marginBottom: '16px' }}>NVIDIA NIM Keys</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              {keys.map((k, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'var(--bg-3)', borderRadius: '8px' }}>
                  <div style={{ flex: 1, fontFamily: 'monospace', fontSize: '13px' }}>{k.slice(0, 16)}••••••••{k.slice(-8)}</div>
                  <button className="btn btn-ghost btn-sm text-danger" onClick={() => removeKey(i)}><i className="fa-solid fa-xmark"></i></button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <input type="text" className="input" placeholder="nvapi-..." value={newKey} onChange={e => setNewKey(e.target.value)} style={{ flex: 1 }} />
              <button className="btn btn-primary" onClick={addKey}>Add Key</button>
            </div>
            <button className="btn btn-secondary" style={{ marginTop: '24px', width: '100%' }} onClick={saveKeys}>Save All Keys</button>
          </div>
        )}

        {activeTab === 'sessions' && (
          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr><th>User</th><th>Status</th><th>Applied</th><th>Started</th><th>Last Update</th></tr>
                </thead>
                <tbody>
                  {sessions.length === 0 ? <tr><td colSpan="5" style={{ textAlign: 'center', padding: '48px' }}>No active sessions</td></tr> : sessions.map((s, i) => (
                    <tr key={i}>
                      <td>{s.user_email}</td>
                      <td><span className="badge badge-success">{s.status}</span></td>
                      <td>{s.total_applied}</td>
                      <td className="text-muted">{timeAgo(s.started_at)}</td>
                      <td className="text-muted">{timeAgo(s.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="card" style={{ maxHeight: '600px', overflowY: 'auto', padding: '12px' }}>
            {auditLogs.map((l, i) => (
              <div key={i} style={{ fontFamily: 'monospace', fontSize: '12px', padding: '8px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ color: 'var(--accent)' }}>[{formatDate(l.timestamp)} {new Date(l.timestamp).toLocaleTimeString()}]</span>
                  <span style={{ fontWeight: 600, color: 'var(--primary)', marginLeft: '8px' }}>{l.method}</span>
                  <span style={{ marginLeft: '8px' }}>{l.path}</span>
                  <span className="text-muted" style={{ marginLeft: '8px' }}>by {l.user_id}</span>
                </div>
                <span className={l.status_code < 400 ? 'text-accent' : 'text-danger'}>{l.status_code}</span>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'broadcast' && (
          <div className="card">
            <h4 style={{ marginBottom: '16px' }}>Send Broadcast Message</h4>
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label>Subject</label>
              <input type="text" className="input" value={broadcast.subject} onChange={e => setBroadcast({ ...broadcast, subject: e.target.value })} />
            </div>
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label>Message (HTML Supported)</label>
              <textarea className="input" style={{ height: '200px' }} value={broadcast.message} onChange={e => setBroadcast({ ...broadcast, message: e.target.value })}></textarea>
            </div>
            <button className="btn btn-primary w-full" onClick={sendBroadcast}>Send to All Users</button>
          </div>
        )}

        {activeTab === 'questions' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3>Profile Questions</h3>
              <button className="btn btn-primary" onClick={() => openQuestionModal()}><i className="fa-solid fa-plus"></i> Add Question</button>
            </div>
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr><th>Question</th><th>Type</th><th>Required</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {questions.map(q => (
                      <tr key={q.id}>
                        <td><div style={{ fontWeight: 500 }}>{q.text}</div><div className="text-xs text-muted">{q.options?.join(', ')}</div></td>
                        <td><span className="badge badge-neutral">{q.type}</span></td>
                        <td>{q.is_required ? <span className="text-danger">Yes</span> : 'No'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => openQuestionModal(q)}><i className="fa-solid fa-pen"></i></button>
                            <button className="btn btn-ghost btn-sm text-danger" onClick={() => deleteQuestion(q.id)}><i className="fa-solid fa-trash-can"></i></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {showQuestionModal && (
              <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                <div className="card" style={{ width: '500px', maxWidth: '90%' }}>
                  <h4>{editingQuestion ? 'Edit Question' : 'Add Question'}</h4>
                  <div className="form-group" style={{ margin: '16px 0' }}>
                    <label>Question Text</label>
                    <input type="text" className="input" value={questionForm.text} onChange={e => setQuestionForm({ ...questionForm, text: e.target.value })} />
                  </div>
                  <div className="grid-2">
                    <div className="form-group">
                      <label>Type</label>
                      <select className="input" value={questionForm.type} onChange={e => setQuestionForm({ ...questionForm, type: e.target.value })}>
                        <option value="text">Text</option>
                        <option value="textarea">Textarea</option>
                        <option value="radio">Radio</option>
                        <option value="dropdown">Dropdown</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Required</label>
                      <select className="input" value={questionForm.is_required} onChange={e => setQuestionForm({ ...questionForm, is_required: e.target.value === 'true' })}>
                        <option value="false">No</option>
                        <option value="true">Yes</option>
                      </select>
                    </div>
                  </div>
                  {['radio', 'dropdown'].includes(questionForm.type) && (
                    <div className="form-group" style={{ marginTop: '16px' }}>
                      <label>Options (Comma separated)</label>
                      <input type="text" className="input" value={questionForm.options} onChange={e => setQuestionForm({ ...questionForm, options: e.target.value })} />
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                    <button className="btn btn-primary" style={{ flex: 1 }} onClick={saveQuestion}>Save</button>
                    <button className="btn btn-ghost" onClick={() => setShowQuestionModal(false)}>Cancel</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'templates' && (
          <div className="card">
            <h4>Email Templates</h4>
            <div className="form-group" style={{ margin: '16px 0' }}>
              <label>Select Template</label>
              <select className="input" value={selectedTemplateId} onChange={handleTemplateChange}>
                <option value="">-- Choose Template --</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            {selectedTemplateId && (
              <>
                <div className="form-group">
                  <label>Template HTML</label>
                  <textarea className="input" style={{ height: '400px', fontFamily: 'monospace' }} value={templateContent} onChange={e => setTemplateContent(e.target.value)}></textarea>
                </div>
                <button className="btn btn-primary w-full" style={{ marginTop: '16px' }} onClick={saveTemplate}>Save Template</button>
              </>
            )}
          </div>
        )}
    </>
  );
}
