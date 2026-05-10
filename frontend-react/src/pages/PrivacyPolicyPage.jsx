import React, { useEffect } from 'react';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';
import AmbientBackground from '../components/effects/AmbientBackground';
import '../styles/globals.css';

export default function PrivacyPolicyPage() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="landing-page" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AmbientBackground />
      <Navbar />
      
      <main style={{ flex: 1, paddingTop: '120px', paddingBottom: '60px', width: '100%', display: 'flex', justifyContent: 'center' }}>
        <div className="card" style={{ 
            maxWidth: '800px', 
            width: '90%', 
            padding: '40px', 
            background: 'rgba(255, 255, 255, 0.03)', 
            border: '1px solid rgba(255, 255, 255, 0.1)', 
            borderRadius: '16px',
            backdropFilter: 'blur(10px)',
            margin: '0 auto'
          }}>
          <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem', background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Privacy Policy
          </h1>
          <p style={{ color: 'var(--text2)', marginBottom: '2rem' }}>Last updated: May 2026</p>

          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: 'var(--text1)' }}>1. Introduction</h2>
            <p style={{ color: 'var(--text2)', lineHeight: '1.6' }}>
              Welcome to SmartApply. We respect your privacy and are committed to protecting your personal data. This privacy policy explains how we collect, use, and safeguard your information when you use our website, web application, and Chrome extension.
            </p>
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: 'var(--text1)' }}>2. Data We Collect</h2>
            <ul style={{ color: 'var(--text2)', lineHeight: '1.6', paddingLeft: '20px' }}>
              <li style={{ marginBottom: '0.5rem' }}><strong>Personal Information:</strong> Name, email address, phone number, and resume details necessary for job applications.</li>
              <li style={{ marginBottom: '0.5rem' }}><strong>Authentication Information:</strong> Secure authentication tokens (e.g., Google OAuth tokens).</li>
              <li style={{ marginBottom: '0.5rem' }}><strong>Extension Data:</strong> The Chrome extension reads necessary content from LinkedIn job pages solely to automate the application process on your behalf.</li>
            </ul>
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: 'var(--text1)' }}>3. How We Use Your Data</h2>
            <p style={{ color: 'var(--text2)', lineHeight: '1.6' }}>
              Your data is used strictly for its intended single purpose: to automate your job application process. We do not sell or transfer your data to third parties, nor do we use it for advertising or credit-determination purposes.
            </p>
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: 'var(--text1)' }}>4. Data Security</h2>
            <p style={{ color: 'var(--text2)', lineHeight: '1.6' }}>
              We implement industry-standard security measures to protect your personal information. Passwords and platform credentials are encrypted before being stored in our database.
            </p>
          </section>

          <section style={{ marginBottom: '2rem' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem', color: 'var(--text1)' }}>5. Contact Us</h2>
            <p style={{ color: 'var(--text2)', lineHeight: '1.6' }}>
              If you have any questions about this Privacy Policy, please contact us at support@smartapplies.app.
            </p>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
