import JarvisChat from '../components/jarvis/JarvisChat';

export default function JarvisChatPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h3><i className="fa-solid fa-robot"></i> Jarvis AI Assistant</h3>
          <p className="text-muted text-sm">Chat with JARVIS — your AI career coach powered by NVIDIA NIM</p>
        </div>
      </div>
      <div className="card" style={{ padding: '24px', minHeight: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🤖</div>
        <h4 style={{ marginBottom: '8px' }}>Click the chat bubble to start</h4>
        <p className="text-muted text-sm" style={{ maxWidth: '400px' }}>
          Use the floating chat button in the bottom-right corner to open JARVIS. 
          Ask about resume tips, interview prep, ATS scoring, or anything career-related.
        </p>
      </div>
    </>
  );
}
