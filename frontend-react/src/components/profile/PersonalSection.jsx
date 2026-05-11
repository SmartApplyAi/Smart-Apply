import React from 'react';

const PersonalSection = ({ profile, handleChange, markDoneAndNext }) => {
  return (
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
  );
};

export default PersonalSection;
