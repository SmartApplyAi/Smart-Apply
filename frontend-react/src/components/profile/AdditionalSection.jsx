import React from 'react';

const AdditionalSection = ({ dynamicQuestions, dynamicAnswers, handleDynamicChange, switchSection, markDoneAndNext }) => {
  return (
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
  );
};

export default AdditionalSection;
