import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import authService from '../services/auth';
import LinkedInBridge from '../services/linkedinBridge';
import { escHtml, formatDate } from '../services/utils';
import DropZone from '../components/common/DropZone';
import LoadingButton from '../components/common/LoadingButton';
import Modal from '../components/common/Modal';

export default function ResumePage() {
  const { showToast } = useToast();
  const [resumes, setResumes] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [label, setLabel] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [parsedData, setParsedData] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPdf, setPreviewPdf] = useState({ key: '', label: '', filename: '' });

  function encodeKey(key) { return key.split('/').map(encodeURIComponent).join('/'); }

  const loadResumes = useCallback(async () => {
    try {
      const data = await api.get('/resume/list');
      setResumes(data.resumes || []);
    } catch { setResumes([]); }
  }, []);

  useEffect(() => { loadResumes(); }, [loadResumes]);

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true); setUploadPct(0);
    const form = new FormData();
    form.append('file', selectedFile);
    form.append('label', label.trim() || 'Default');
    try {
      const data = await api.upload('/resume/upload', form);
      setUploadPct(100);
      setParsedData(data.parsed);
      if (data.warning) showToast(data.warning, 'info', 8000);
      else showToast('Resume uploaded and parsed!', 'success');
      loadResumes();
      await syncProfile();
    } catch (err) { showToast(err.detail || 'Upload failed', 'error'); }
    finally { setUploading(false); setTimeout(() => setUploadPct(0), 1000); }
  };

  const syncProfile = async () => {
    try {
      const data = await api.get('/profile/me');
      if (data && data.profile) {
        const currentUser = authService.getUser() || {};
        const updatedUser = { ...currentUser, profile: { ...currentUser.profile, ...data.profile } };
        
        localStorage.setItem('sa_user', JSON.stringify(updatedUser));
        window.dispatchEvent(new StorageEvent('storage', { key: 'sa_user', newValue: JSON.stringify(updatedUser) }));
        
        // Notify extension directly via LinkedInBridge
        LinkedInBridge.syncProfileToExtension(updatedUser).catch(() => {});
      }
    } catch (e) {
      console.error('Failed to sync profile after resume change', e);
    }
  };

  const useForProfile = () => {
    if (parsedData) {
      sessionStorage.setItem('parsed_profile', JSON.stringify(parsedData));
      window.location.href = '/profile?from=resume';
    }
  };

  const activateResume = async (key) => {
    try { 
      await api.post('/resume/activate/' + encodeKey(key)); 
      showToast('Resume set as active', 'success'); 
      loadResumes(); 
      await syncProfile();
    }
    catch (err) { showToast(err.detail || 'Could not set active', 'error'); }
  };

  const deleteResume = async (key) => {
    if (!window.confirm('Delete this resume?')) return;
    try { 
      await api.delete('/resume/' + encodeKey(key)); 
      showToast('Resume deleted', 'info'); 
      loadResumes(); 
      await syncProfile();
    }
    catch (err) { showToast(err.detail || 'Could not delete', 'error'); }
  };

  const deleteLegacy = async (index) => {
    if (!window.confirm('Remove this legacy entry?')) return;
    try { 
      await api.delete(`/resume/legacy?index=${index}`); 
      showToast('Removed', 'info'); 
      loadResumes(); 
      await syncProfile();
    }
    catch (err) { showToast(err.detail || 'Could not remove', 'error'); }
  };

  const parsedFields = parsedData ? [
    ['Name', [parsedData.first_name, parsedData.middle_name, parsedData.last_name].filter(Boolean).join(' ')],
    ['Email', parsedData.email],
    ['Phone', parsedData.phone_number],
    ['City', parsedData.current_city],
    ['Experience', parsedData.years_of_experience ? parsedData.years_of_experience + ' years' : ''],
    ['Skills', parsedData.skills_summary?.slice(0, 120)],
  ].filter(([, v]) => v) : [];

  return (
    <>
      <div style={{ marginBottom: '32px' }}>
        <h2><i className="fa-solid fa-file-lines"></i> Resume Manager</h2>
        <p className="text-muted" style={{ marginTop: '6px' }}>Upload multiple resumes. We will extract your details automatically.</p>
      </div>
      <div className="resume-grid">
        <div>
          <div className="card" style={{ marginBottom: '24px' }}>
            <h4 style={{ marginBottom: '20px' }}><i className="fa-solid fa-cloud-arrow-up"></i> Upload New Resume</h4>
            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label htmlFor="resume-label">Resume Label</label>
              <input type="text" id="resume-label" placeholder="e.g. Java_Developer_Resume" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <DropZone id="upload-zone" onFileSelect={setSelectedFile} />
            {(uploading || uploadPct > 0) && (
              <div style={{ marginTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                  <span className="text-muted">{selectedFile?.name || 'Uploading…'}</span>
                  {uploadPct === 100 && <span className="text-success">100%</span>}
                </div>
                <div className="progress-bar">
                  <div className={`progress-fill ${uploading && uploadPct < 100 ? 'progress-indeterminate' : ''}`} style={{ width: uploadPct === 100 ? '100%' : uploading ? '50%' : '0%' }}></div>
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
              <LoadingButton onClick={handleUpload} loading={uploading} disabled={!selectedFile} className="btn btn-primary btn-lg" style={{ flex: 1 }}>
                <i className="fa-solid fa-upload"></i> Upload & Parse
              </LoadingButton>
              <a href="/profile" className="btn btn-ghost btn-lg"><i className="fa-solid fa-pen-to-square"></i> Enter manually</a>
            </div>
          </div>
          <div className="card">
            <h4 style={{ marginBottom: '16px' }}><i className="fa-solid fa-list"></i> Your Resumes</h4>
            {resumes === null ? (
              <><div className="skeleton" style={{ height: '62px', borderRadius: 'var(--radius-sm)', marginBottom: '8px' }}></div><div className="skeleton" style={{ height: '62px', borderRadius: 'var(--radius-sm)' }}></div></>
            ) : !resumes.length ? (
              <p className="text-muted text-sm" style={{ padding: '8px' }}>No resumes uploaded yet</p>
            ) : resumes.map((r, idx) => (
              <div className={`resume-chip${r.is_active ? ' active-chip' : ''}`} key={idx}>
                <i className="fa-solid fa-file-pdf" style={{ fontSize: '24px', color: 'var(--danger)', flexShrink: 0 }}></i>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: '14px' }}>{r.label || r.filename || 'Resume'}{r.is_active && <span className="badge badge-success" style={{ marginLeft: '8px' }}>Active</span>}</div>
                  <div className="text-muted text-sm">{r.filename || ''}{r.uploaded_at ? ` · ${formatDate(r.uploaded_at)}` : ''}</div>
                  {!r.object_key && <div style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '2px' }}><i className="fa-solid fa-triangle-exclamation"></i> Old format — click 🗑 to remove, then re-upload</div>}
                </div>
                <div className="resume-chip-actions">
                  {r.object_key ? (<>
                    {!r.is_active && <button className="btn btn-ghost btn-sm" onClick={() => activateResume(r.object_key)} title="Set as Active"><i className="fa-solid fa-check"></i> Active</button>}
                    <button className="btn btn-ghost btn-sm" onClick={() => { setPreviewPdf({ key: r.object_key, label: r.label || r.filename, filename: r.filename }); setPreviewOpen(true); }} title="Preview"><i className="fa-solid fa-eye"></i> Preview</button>
                    <a href={`/api/resume/download/${encodeKey(r.object_key)}`} className="btn btn-ghost btn-sm" title="Download"><i className="fa-solid fa-download"></i></a>
                    <button className="btn btn-ghost btn-sm" onClick={() => deleteResume(r.object_key)} title="Delete"><i className="fa-solid fa-trash"></i></button>
                  </>) : (
                    <button className="btn btn-danger btn-sm" onClick={() => deleteLegacy(idx)} title="Remove"><i className="fa-solid fa-trash"></i></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          {parsedData ? (
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h4><i className="fa-solid fa-wand-magic-sparkles"></i> Parsed Details</h4>
                <span className="badge badge-success"><i className="fa-solid fa-check"></i> Extracted</span>
              </div>
              {parsedFields.map(([k, v]) => <div className="parsed-field" key={k}><div className="key">{k}</div><div className="val">{v}</div></div>)}
              <div style={{ marginTop: '20px' }}><button className="btn btn-primary btn-lg w-full" onClick={useForProfile}><i className="fa-solid fa-arrow-right"></i> Use for Profile</button></div>
            </div>
          ) : (
            <div className="card"><div style={{ textAlign: 'center', padding: '48px 20px' }}>
              <i className="fa-solid fa-file-circle-question" style={{ fontSize: '48px', color: 'var(--text-3)', marginBottom: '16px', display: 'block' }}></i>
              <h4 style={{ marginBottom: '8px' }}>Parsed details will appear here</h4>
              <p className="text-muted text-sm">Upload a PDF resume and we will extract your profile automatically</p>
            </div></div>
          )}
        </div>
      </div>
      {/* PDF Preview Modal - simplified (opens in new tab for now) */}
      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="860px">
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px' }}>
          <div style={{ fontSize: '24px' }}>📄</div>
          <div style={{ flex: 1 }}><h4>{previewPdf.label || 'Resume'}</h4><div className="text-muted text-sm">{previewPdf.filename}</div></div>
          <button onClick={() => setPreviewOpen(false)} className="btn btn-ghost btn-sm"><i className="fa-solid fa-xmark"></i> Close</button>
        </div>
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <a href={`/api/resume/download/${previewPdf.key ? encodeKey(previewPdf.key) : ''}`} target="_blank" rel="noreferrer" className="btn btn-primary btn-lg">
            <i className="fa-solid fa-arrow-up-right-from-square"></i> Open PDF
          </a>
          <p className="text-muted text-sm" style={{ marginTop: '12px' }}>PDF will open in a new tab</p>
        </div>
      </Modal>
    </>
  );
}
