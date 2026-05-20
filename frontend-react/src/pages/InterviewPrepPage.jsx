import { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '../hooks/useToast';
import api from '../services/api';
import '../styles/InterviewPrepPage.css';

const INTERVIEW_TYPES = [
  { id: 'behavioral', name: 'Behavioral', icon: 'fa-solid fa-people-arrows', desc: 'Leadership, teamwork & STAR method' },
  { id: 'technical', name: 'Technical', icon: 'fa-solid fa-microchip', desc: 'System design, coding & architecture' },
  { id: 'hr', name: 'HR / General', icon: 'fa-solid fa-handshake', desc: 'Culture fit, goals & expectations' },
  { id: 'custom', name: 'Custom Role', icon: 'fa-solid fa-wand-magic-sparkles', desc: 'Paste a JD for targeted prep' },
];

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const speechSynthesis = window.speechSynthesis;

export default function InterviewPrepPage() {
  const { showToast } = useToast();

  // Phase: setup | countdown | interview | results
  const [phase, setPhase] = useState('setup');
  const [interviewType, setInterviewType] = useState('behavioral');
  const [jobTitle, setJobTitle] = useState('');
  const [jobDesc, setJobDesc] = useState('');
  const [countdown, setCountdown] = useState(3);

  // Interview state
  const [messages, setMessages] = useState([]);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);
  const [textInput, setTextInput] = useState('');
  const [evaluation, setEvaluation] = useState(null);
  const [hasSpeechSupport] = useState(!!SpeechRecognition);

  // Refs
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recognitionRef = useRef(null);
  const transcriptEndRef = useRef(null);
  const utteranceRef = useRef(null);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAiThinking]);

  // ── Camera & Recognition base helpers (declared early for cleanup effect) ──
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (err) {
        /* Ignore abort errors on stop */
      }
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  // Cleanup on unmount (now stopCamera/stopRecognition are declared above)
  useEffect(() => {
    return () => {
      stopCamera();
      stopRecognition();
      speechSynthesis?.cancel();
    };
  }, [stopCamera, stopRecognition]);

  // ── Camera ──
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      showToast('Camera access denied — you can still interview without video', 'warning');
      setIsCamOn(false);
    }
  }, [showToast]);

  const toggleCamera = useCallback(() => {
    if (isCamOn) {
      stopCamera();
      setIsCamOn(false);
    } else {
      startCamera();
      setIsCamOn(true);
    }
  }, [isCamOn, startCamera, stopCamera]);

  // ── Refs for circular references ──
  const startListeningRef = useRef(null);
  const handleUserMessageRef = useRef(null);

  // ── Speech Recognition ──
  const startListening = useCallback(() => {
    if (!SpeechRecognition || !isMicOn) return;
    stopRecognition();

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      if (transcript.trim()) {
        handleUserMessageRef.current?.(transcript.trim());
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (err) {
      /* Ignore start errors */
    }
  }, [isMicOn, stopRecognition]);

  // Assign to ref so it can be called safely in timeouts/other callbacks without circular dependency issues
  startListeningRef.current = startListening;

  const toggleMic = useCallback(() => {
    if (isMicOn) {
      stopRecognition();
      setIsMicOn(false);
    } else {
      setIsMicOn(true);
    }
  }, [isMicOn, stopRecognition]);

  // ── Text-to-Speech ──
  const speakText = useCallback((text) => {
    if (!speechSynthesis) return Promise.resolve();
    speechSynthesis.cancel();

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1;
      // Prefer a natural voice
      const voices = speechSynthesis.getVoices();
      const preferred = voices.find(v => v.name.includes('Google') && v.lang.startsWith('en'))
        || voices.find(v => v.lang.startsWith('en') && v.name.includes('Male'))
        || voices.find(v => v.lang.startsWith('en'));
      if (preferred) utterance.voice = preferred;

      utterance.onstart = () => setIsAiSpeaking(true);
      utterance.onend = () => { setIsAiSpeaking(false); resolve(); };
      utterance.onerror = () => { setIsAiSpeaking(false); resolve(); };

      utteranceRef.current = utterance;
      speechSynthesis.speak(utterance);
    });
  }, []);

  // ── Core Interview Logic ──
  const sendToAI = useCallback(async (msgs, endInterview = false) => {
    setIsAiThinking(true);
    try {
      const payload = {
        messages: msgs.map(m => ({ role: m.role, content: m.content })),
        interview_type: interviewType,
        job_description: jobDesc,
        job_title: jobTitle,
        end_interview: endInterview,
      };
      const data = await api.post('/ai/interview-chat', payload);
      return data;
    } catch (err) {
      showToast(err?.detail || 'AI service error', 'error');
      return null;
    } finally {
      setIsAiThinking(false);
    }
  }, [interviewType, jobDesc, jobTitle, showToast]);

  const handleUserMessage = useCallback(async (text) => {
    const userMsg = { role: 'user', content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);

    const data = await sendToAI(updated);
    if (data?.reply) {
      const aiMsg = { role: 'assistant', content: data.reply };
      setMessages(prev => [...prev, aiMsg]);
      await speakText(data.reply);
      // Auto-start listening after AI finishes speaking
      if (isMicOn && hasSpeechSupport) {
        setTimeout(() => startListeningRef.current?.(), 400);
      }
    }
  }, [messages, sendToAI, speakText, isMicOn, hasSpeechSupport]);

  // Assign to ref
  handleUserMessageRef.current = handleUserMessage;

  const handleTextSubmit = useCallback((e) => {
    e.preventDefault();
    if (!textInput.trim() || isAiThinking) return;
    handleUserMessageRef.current?.(textInput.trim());
    setTextInput('');
  }, [textInput, isAiThinking]);

  // ── Start Interview ──
  const startInterview = useCallback(async () => {
    setPhase('countdown');
    setCountdown(3);

    // Countdown
    for (let i = 3; i >= 1; i--) {
      setCountdown(i);
      await new Promise(r => setTimeout(r, 800));
    }

    setPhase('interview');
    await startCamera();

    // Send first message to AI (empty messages = start)
    const data = await sendToAI([]);
    if (data?.reply) {
      const aiMsg = { role: 'assistant', content: data.reply };
      setMessages([aiMsg]);
      await speakText(data.reply);
      if (isMicOn && hasSpeechSupport) {
        setTimeout(() => startListeningRef.current?.(), 400);
      }
    }
  }, [startCamera, sendToAI, speakText, isMicOn, hasSpeechSupport]);

  // ── End Interview ──
  const endInterview = useCallback(async () => {
    stopRecognition();
    speechSynthesis?.cancel();
    setIsAiSpeaking(false);
    setIsAiThinking(true);

    const data = await sendToAI(messages, true);
    stopCamera();

    if (data?.evaluation) {
      setEvaluation(data.evaluation);
    }
    setPhase('results');
    setIsAiThinking(false);
  }, [messages, sendToAI, stopRecognition, stopCamera]);

  // ── Reset ──
  const resetInterview = useCallback(() => {
    setPhase('setup');
    setMessages([]);
    setEvaluation(null);
    setIsAiThinking(false);
    setIsAiSpeaking(false);
    setIsListening(false);
    setIsMicOn(true);
    setIsCamOn(true);
  }, []);

  // ── Waveform bars ──
  const WaveformBars = ({ active }) => (
    <div className="voice-waveform">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className={`wave-bar${active ? ' active' : ''}`}
          style={{ height: active ? undefined : '6px' }} />
      ))}
    </div>
  );

  // ── Score Ring SVG ──
  const ScoreRingSVG = ({ score, color }) => {
    const r = 70, circ = 2 * Math.PI * r;
    const offset = circ - (score / 100) * circ;
    return (
      <div className="score-ring-large">
        <svg viewBox="0 0 160 160">
          <circle cx="80" cy="80" r={r} className="score-ring-track" />
          <circle cx="80" cy="80" r={r} className="score-ring-fill"
            stroke={color}
            strokeDasharray={circ}
            strokeDashoffset={offset} />
        </svg>
        <div className="score-ring-value" style={{ color }}>{score}</div>
      </div>
    );
  };

  const getScoreColor = (s) => s >= 75 ? '#10b981' : s >= 50 ? '#f59e0b' : '#ef4444';

  // ── Status label ──
  const getStatusLabel = () => {
    if (isAiThinking) return { text: 'AI is thinking…', cls: 'thinking' };
    if (isAiSpeaking) return { text: 'AI is speaking…', cls: 'ai-speaking' };
    if (isListening) return { text: 'Listening to you…', cls: 'listening' };
    return { text: 'Ready', cls: '' };
  };

  const status = getStatusLabel();

  // ═══════════════════════ RENDER ═══════════════════════

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(135deg,#8b5cf6,#3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
            <i className="fa-solid fa-microphone" style={{ color: 'white' }}></i>
          </div>
          <div>
            <h3>AI Interview Prep</h3>
            <p className="text-muted text-sm">Practice with a real-time AI interviewer — webcam &amp; voice powered</p>
          </div>
        </div>
      </div>

      {/* ── SETUP PHASE ── */}
      {phase === 'setup' && (
        <div className="interview-setup">
          <div className="card" style={{ marginBottom: '20px' }}>
            <h4 style={{ marginBottom: '16px' }}><i className="fa-solid fa-sliders"></i> Interview Type</h4>
            <div className="interview-type-grid">
              {INTERVIEW_TYPES.map(t => (
                <div key={t.id}
                  className={`interview-type-card${interviewType === t.id ? ' selected' : ''}`}
                  onClick={() => setInterviewType(t.id)}>
                  <span className="type-icon"><i className={t.icon}></i></span>
                  <div className="type-name">{t.name}</div>
                  <div className="type-desc">{t.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {interviewType === 'custom' && (
            <div className="card" style={{ marginBottom: '20px' }}>
              <div className="form-group" style={{ marginBottom: '14px' }}>
                <label><i className="fa-solid fa-briefcase"></i> Job Title</label>
                <input className="input" value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="e.g. Senior Frontend Engineer" />
              </div>
              <div className="form-group">
                <label><i className="fa-solid fa-file-lines"></i> Job Description</label>
                <textarea className="input" style={{ height: '120px' }} value={jobDesc} onChange={e => setJobDesc(e.target.value)} placeholder="Paste the job description for targeted questions…" />
              </div>
            </div>
          )}

          <div className="card" style={{ marginBottom: '20px' }}>
            <h4 style={{ marginBottom: '12px' }}><i className="fa-solid fa-circle-info"></i> How It Works</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { icon: 'fa-video', text: 'Your webcam will show your face so you can practice eye contact & body language' },
                { icon: 'fa-microphone', text: hasSpeechSupport ? 'Speak your answers naturally — the AI listens and responds in real-time' : 'Type your answers — voice input is not supported in your browser' },
                { icon: 'fa-robot', text: 'The AI interviewer asks 5-8 questions, gives feedback, and scores your performance' },
              ].map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '14px', color: 'var(--text-2)' }}>
                  <i className={`fa-solid ${s.icon}`} style={{ color: 'var(--primary)', width: '20px', textAlign: 'center' }}></i>
                  {s.text}
                </div>
              ))}
            </div>
          </div>

          <button className="btn btn-primary w-full" style={{ padding: '16px', fontSize: '16px', fontWeight: 700 }} onClick={startInterview}>
            <i className="fa-solid fa-play"></i> Start Mock Interview
          </button>
        </div>
      )}

      {/* ── COUNTDOWN ── */}
      {phase === 'countdown' && (
        <div className="countdown-overlay">
          <div className="countdown-number" key={countdown}>{countdown}</div>
        </div>
      )}

      {/* ── INTERVIEW ARENA ── */}
      {phase === 'interview' && (
        <>
          <div className="interview-arena">
            {/* Left: Video + AI avatar */}
            <div className="interview-video-panel">
              <div className="webcam-container" id="webcam-container">
                {isCamOn ? (
                  <video ref={videoRef} autoPlay playsInline muted />
                ) : (
                  <div className="webcam-off-placeholder">
                    <i className="fa-solid fa-video-slash"></i>
                    <span style={{ fontSize: '13px' }}>Camera off</span>
                  </div>
                )}
                <div className={`webcam-ring${isCamOn ? ' active' : ''}${isListening ? ' speaking' : ''}`} />
                <div className="webcam-status-bar">
                  <div className="status-indicator">
                    <div className={`status-dot-live ${status.cls}`} />
                    <span>{status.text}</span>
                  </div>
                  <span style={{ opacity: 0.7 }}>{messages.filter(m => m.role === 'assistant').length} Qs</span>
                </div>
              </div>

              {/* AI Avatar + Waveform */}
              <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 20px' }}>
                <div className={`ai-interviewer-avatar${isAiSpeaking ? ' speaking' : ''}`}>
                  <i className="fa-solid fa-robot"></i>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '4px' }}>AI Interviewer</div>
                  <WaveformBars active={isAiSpeaking} />
                </div>
              </div>
            </div>

            {/* Right: Transcript */}
            <div className="interview-transcript-panel card" style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <h4 style={{ fontSize: '15px' }}><i className="fa-solid fa-comments"></i> Live Transcript</h4>
              </div>

              <div className="transcript-scroll">
                {messages.map((m, i) => (
                  <div key={i} className={`transcript-msg ${m.role === 'assistant' ? 'ai' : 'user'}`}>
                    <div className="transcript-avatar">
                      <i className={m.role === 'assistant' ? 'fa-solid fa-robot' : 'fa-solid fa-user'}></i>
                    </div>
                    <div className="transcript-bubble">{m.content}</div>
                  </div>
                ))}
                {isAiThinking && (
                  <div className="transcript-msg ai">
                    <div className="transcript-avatar"><i className="fa-solid fa-robot"></i></div>
                    <div className="transcript-bubble" style={{ display: 'flex', gap: '4px', padding: '14px 20px' }}>
                      <span className="status-dot-live thinking" />
                      <span className="status-dot-live thinking" style={{ animationDelay: '0.2s' }} />
                      <span className="status-dot-live thinking" style={{ animationDelay: '0.4s' }} />
                    </div>
                  </div>
                )}
                <div ref={transcriptEndRef} />
              </div>

              {/* Text input fallback */}
              <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
                <form onSubmit={handleTextSubmit} className="interview-text-input-row">
                  <input value={textInput} onChange={e => setTextInput(e.target.value)}
                    placeholder={isAiThinking || isAiSpeaking ? 'Wait for AI…' : 'Type your answer…'}
                    disabled={isAiThinking || isAiSpeaking} />
                  <button type="submit" disabled={isAiThinking || isAiSpeaking || !textInput.trim()}>
                    <i className="fa-solid fa-paper-plane"></i>
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="interview-controls">
            <button className={`control-btn${isMicOn ? ' active' : ''}`} onClick={toggleMic} title={isMicOn ? 'Mute' : 'Unmute'}>
              <i className={`fa-solid ${isMicOn ? 'fa-microphone' : 'fa-microphone-slash'}`}></i>
            </button>
            <button className={`control-btn${isCamOn ? ' active' : ''}`} onClick={toggleCamera} title={isCamOn ? 'Camera off' : 'Camera on'}>
              <i className={`fa-solid ${isCamOn ? 'fa-video' : 'fa-video-slash'}`}></i>
            </button>
            {hasSpeechSupport && isMicOn && !isListening && !isAiSpeaking && !isAiThinking && (
              <button className="control-btn" onClick={startListening} title="Start listening" style={{ background: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.3)', color: '#10b981' }}>
                <i className="fa-solid fa-ear-listen"></i>
              </button>
            )}
            <button className="control-btn danger" onClick={endInterview} title="End Interview">
              <i className="fa-solid fa-phone-slash"></i>
            </button>
          </div>
        </>
      )}

      {/* ── RESULTS PHASE ── */}
      {phase === 'results' && evaluation && (
        <div className="interview-results">
          <div className="card results-score-hero" style={{ marginBottom: '20px' }}>
            <ScoreRingSVG score={evaluation.overall_score} color={getScoreColor(evaluation.overall_score)} />
            <h3 style={{ marginTop: '8px' }}>
              {evaluation.overall_score >= 80 ? 'Outstanding!' : evaluation.overall_score >= 60 ? 'Good Effort!' : evaluation.overall_score >= 40 ? 'Keep Practicing' : 'Needs Work'}
            </h3>
            <p className="text-muted" style={{ marginTop: '8px', maxWidth: '500px', marginInline: 'auto' }}>{evaluation.summary}</p>
          </div>

          <div className="results-category-grid">
            {[
              { key: 'communication', label: 'Communication', icon: 'fa-comments' },
              { key: 'confidence', label: 'Confidence', icon: 'fa-shield' },
              { key: 'content_quality', label: 'Content Quality', icon: 'fa-star' },
              { key: 'structure', label: 'Structure', icon: 'fa-layer-group' },
            ].map(c => {
              const score = evaluation[c.key] || 0;
              const color = getScoreColor(score);
              return (
                <div key={c.key} className="category-card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-2)', fontWeight: 600 }}>
                      <i className={`fa-solid ${c.icon}`} style={{ marginRight: '6px' }}></i>{c.label}
                    </span>
                    <span className="category-score" style={{ color, fontSize: '1.6rem' }}>{score}</span>
                  </div>
                  <div className="category-bar">
                    <div className="category-bar-fill" style={{ width: `${score}%`, background: color }} />
                  </div>
                </div>
              );
            })}
          </div>

          {evaluation.strengths?.length > 0 && (
            <div className="card results-list-section" style={{ marginBottom: '16px' }}>
              <h4><i className="fa-solid fa-check-circle" style={{ color: '#10b981' }}></i> Strengths</h4>
              {evaluation.strengths.map((s, i) => (
                <div key={i} className="result-item">
                  <i className="fa-solid fa-check" style={{ color: '#10b981', fontSize: '12px' }}></i>
                  <span>{s}</span>
                </div>
              ))}
            </div>
          )}

          {evaluation.weaknesses?.length > 0 && (
            <div className="card results-list-section" style={{ marginBottom: '16px' }}>
              <h4><i className="fa-solid fa-exclamation-triangle" style={{ color: '#f59e0b' }}></i> Areas to Improve</h4>
              {evaluation.weaknesses.map((w, i) => (
                <div key={i} className="result-item">
                  <i className="fa-solid fa-arrow-up-right" style={{ color: '#f59e0b', fontSize: '12px' }}></i>
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {evaluation.tips?.length > 0 && (
            <div className="card results-list-section" style={{ marginBottom: '20px' }}>
              <h4><i className="fa-solid fa-lightbulb" style={{ color: 'var(--primary)' }}></i> Pro Tips</h4>
              {evaluation.tips.map((t, i) => (
                <div key={i} className="result-item">
                  <i className="fa-solid fa-bolt" style={{ color: 'var(--primary)', fontSize: '12px' }}></i>
                  <span>{t}</span>
                </div>
              ))}
            </div>
          )}

          <button className="btn btn-primary w-full" style={{ padding: '16px', fontSize: '16px', fontWeight: 700 }} onClick={resetInterview}>
            <i className="fa-solid fa-rotate-right"></i> Try Another Interview
          </button>
        </div>
      )}
    </>
  );
}
