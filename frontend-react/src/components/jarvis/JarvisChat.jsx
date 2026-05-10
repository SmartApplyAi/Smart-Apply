import { useState, useRef, useEffect, useCallback } from 'react';
import './JarvisChat.css';

// ─── NVIDIA NIM Configuration ───
const NVIDIA_NIM_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_MODEL = 'meta/llama-3.1-8b-instruct'; // Small, fast model

const SYSTEM_PROMPT = `You are JARVIS — Just A Rather Very Intelligent System — the AI assistant embedded inside SmartApply, a comprehensive career automation platform.

## Your Capabilities
You are a **general-purpose intelligent assistant** that can:
1. **Explain any concept** — technology, career advice, coding, science, history, math, or any topic the user asks about.
2. **Solve problems** — debug code, troubleshoot technical issues, fix errors, and provide step-by-step solutions.
3. **Help with the SmartApply platform** — guide users on resume building, ATS scoring, LinkedIn optimization, profile setup, Chrome extension usage, and all platform features.
4. **Provide website support** — if users encounter bugs, UI issues, login problems, or any issues with SmartApply, help them troubleshoot and suggest fixes.
5. **Write and review code** — assist with HTML, CSS, JavaScript, Python, React, and any programming language.
6. **Career coaching** — interview preparation, salary negotiation, job search strategies, cover letters, and professional networking.

## SmartApply Platform Knowledge
SmartApply is a web application with these features:
- **Dashboard** — Overview of applications, stats, and activity
- **Resume Builder** — AI-powered resume creation and optimization
- **ATS Analyzer** — Score resumes against job descriptions for ATS compatibility (scores keyword matching, formatting, skills alignment)
- **LinkedIn Optimizer** — Optimize LinkedIn profiles for recruiter visibility
- **Chrome Extension** — Auto-fill job applications on LinkedIn, Indeed, Glassdoor, etc.
- **Profile Page** — Manage personal info, education, experience, skills
- **Settings** — Account preferences, theme toggle (dark/light), notifications
- **Admin Panel** — For administrators to manage users and broadcast messages

Common issues users face:
- Login/signup errors → Check email verification, password requirements, or try Google OAuth
- ATS score seems low → Suggest adding missing keywords, proper formatting, quantified achievements
- Extension not working → Check if extension is installed, logged in, and has correct permissions
- Profile incomplete → Guide through filling education, experience, skills sections
- Page loading issues → Suggest clearing cache, refreshing, or checking internet connection

## Your Personality
- Speak like Tony Stark's JARVIS: articulate, composed, slightly witty
- Be concise for simple questions (2-3 sentences), detailed for complex ones
- Use markdown formatting: **bold** for emphasis, \`code\` for technical terms, bullet lists for steps
- Always be helpful, never refuse to help with any reasonable question
- If you don't know something specific about SmartApply's internals, give your best general guidance`;

// ─── SVG Icons as components ───
const BotIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a4 4 0 0 1 4 4v1h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2V6a4 4 0 0 1 4-4z"/>
    <circle cx="9" cy="13" r="1"/><circle cx="15" cy="13" r="1"/>
    <path d="M10 17h4"/>
  </svg>
);

const SendIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

const SparkleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l1.912 5.813a2 2 0 0 0 1.275 1.275L21 12l-5.813 1.912a2 2 0 0 0-1.275 1.275L12 21l-1.912-5.813a2 2 0 0 0-1.275-1.275L3 12l5.813-1.912a2 2 0 0 0 1.275-1.275L12 3z"/>
  </svg>
);

const ChatBubbleIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    <path d="M8 10h.01M12 10h.01M16 10h.01"/>
  </svg>
);

// ─── Simple markdown renderer (no external deps) ───
function renderMarkdown(text) {
  if (!text) return '';
  let html = text
    // Code blocks
    .replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Unordered lists
    .replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>')
    // Ordered lists
    .replace(/^\s*\d+\.\s+(.+)$/gm, '<li>$1</li>')
    // Line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');
  
  // Wrap loose <li> in <ul>
  html = html.replace(/(<li>.*?<\/li>)+/gs, '<ul>$&</ul>');
  
  return `<p>${html}</p>`;
}

// Quick suggestions — broader scope
const SUGGESTIONS = [
  '💡 Resume tips',
  '📊 Explain ATS scoring',
  '🎯 Interview prep',
  '🐛 Fix a website issue',
  '🔧 Help with code',
  '🚀 How SmartApply works',
];

export default function JarvisChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('jarvis_nvidia_key') || '');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const textareaRef = useRef(null);
  const inputValueRef = useRef('');

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 500);
    }
  }, [isOpen]);

  // Escape key to close
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isOpen) handleClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen]);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 350);
  }, []);

  const handleToggle = useCallback(() => {
    if (isOpen) {
      handleClose();
    } else {
      setIsOpen(true);
    }
  }, [isOpen, handleClose]);

  const handleSaveKey = useCallback((key) => {
    if (!key || !key.trim()) return;
    setApiKey(key.trim());
    localStorage.setItem('jarvis_nvidia_key', key.trim());
    setShowKeyInput(false);
  }, []);

  const callNvidiaAPI = useCallback(async (userMessages) => {
    if (!apiKey) {
      setShowKeyInput(true);
      return null;
    }

    const payload = {
      model: NVIDIA_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...userMessages.map(m => ({
          role: m.role === 'error' ? 'assistant' : m.role,
          content: m.content,
        })),
      ],
      temperature: 0.6,
      top_p: 0.9,
      max_tokens: 1024,
      stream: false,
    };

    const response = await fetch(NVIDIA_NIM_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'I apologize, I didn\'t get a response. Please try again.';
  }, [apiKey]);

  const handleSend = useCallback(async (overrideText) => {
    const text = (overrideText || inputValueRef.current).trim();
    if (!text || isLoading) return;

    const userMsg = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    inputValueRef.current = '';
    setIsLoading(true);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const reply = await callNvidiaAPI(newMessages);
      if (reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      }
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'error', content: err.message || 'Something went wrong. Please try again.' },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messages, callNvidiaAPI]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // Auto-resize textarea
  const handleInputChange = useCallback((e) => {
    setInput(e.target.value);
    inputValueRef.current = e.target.value;
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 100) + 'px';
  }, []);

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className={`jarvis-backdrop${isClosing ? ' jarvis-closing' : ''}`}
          onClick={handleClose}
          id="jarvis-backdrop"
        />
      )}

      {/* Chat Window */}
      {isOpen && (
        <div className={`jarvis-window${isClosing ? ' jarvis-closing' : ''}`} id="jarvis-chat-window">
          {/* Header */}
          <div className="jarvis-header">
            <div className="jarvis-avatar">
              <BotIcon />
            </div>
            <div className="jarvis-header-info">
              <div className="jarvis-header-name">J.A.R.V.I.S</div>
              <div className="jarvis-header-status">
                <span className="jarvis-status-dot" />
                <span>Powered by NVIDIA NIM</span>
              </div>
            </div>
            <button className="jarvis-close-btn" onClick={handleClose} aria-label="Close JARVIS" id="jarvis-close-btn">
              <CloseIcon />
            </button>
          </div>

          {/* Messages */}
          <div className="jarvis-messages" id="jarvis-messages-area">
            {/* API Key Prompt */}
            {showKeyInput || !apiKey ? (
              <div className="jarvis-welcome">
                <div className="jarvis-welcome-icon">
                  <SparkleIcon />
                </div>
                <h4>Configure JARVIS</h4>
                <p>Enter your NVIDIA API key to activate JARVIS. Get one free at <strong>build.nvidia.com</strong></p>
                <div style={{ marginTop: '14px' }}>
                  <input
                    ref={inputRef}
                    type="password"
                    className="jarvis-input"
                    placeholder="nvapi-..."
                    style={{ marginBottom: '10px' }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveKey(e.target.value);
                    }}
                    id="jarvis-api-key-input"
                  />
                  <button
                    className="jarvis-send-btn"
                    style={{ width: '100%', borderRadius: '12px', height: '40px' }}
                    onClick={() => inputRef.current && handleSaveKey(inputRef.current.value)}
                    id="jarvis-save-key-btn"
                  >
                    Activate JARVIS
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Welcome */}
                {messages.length === 0 && (
                  <div className="jarvis-welcome">
                    <div className="jarvis-welcome-icon">
                      <SparkleIcon />
                    </div>
                    <h4>Hello! I'm JARVIS</h4>
                    <p>Your all-in-one AI assistant. I can explain concepts, solve problems, debug code, troubleshoot website issues, and help you navigate SmartApply.</p>
                    <div className="jarvis-suggestions">
                      {SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          className="jarvis-suggestion-btn"
                          onClick={() => handleSend(s)}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Message list */}
                {messages.map((msg, i) => {
                  if (msg.role === 'error') {
                    return (
                      <div key={i} className="jarvis-error">
                        ⚠️ {msg.content}
                      </div>
                    );
                  }
                  return (
                    <div
                      key={i}
                      className={`jarvis-msg ${msg.role === 'user' ? 'jarvis-msg-user' : 'jarvis-msg-bot'}`}
                    >
                      {msg.role === 'user' ? (
                        msg.content
                      ) : (
                        <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                      )}
                    </div>
                  );
                })}

                {/* Typing Indicator */}
                {isLoading && (
                  <div className="jarvis-typing">
                    <div className="jarvis-typing-dot" />
                    <div className="jarvis-typing-dot" />
                    <div className="jarvis-typing-dot" />
                  </div>
                )}
              </>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          {apiKey && !showKeyInput && (
            <div className="jarvis-input-area">
              <div className="jarvis-input-wrapper">
                <textarea
                  ref={textareaRef}
                  className="jarvis-input"
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask JARVIS anything..."
                  rows={1}
                  disabled={isLoading}
                  id="jarvis-chat-input"
                />
              </div>
              <button
                className="jarvis-send-btn"
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                aria-label="Send message"
                id="jarvis-send-btn"
              >
                <SendIcon />
              </button>
            </div>
          )}
        </div>
      )}

      {/* FAB */}
      <button className="jarvis-fab" onClick={handleToggle} aria-label="Open JARVIS" id="jarvis-fab-btn">
        {!isOpen && <span className="jarvis-fab-pulse" />}
        <span className="jarvis-fab-icon">
          {isOpen ? <CloseIcon /> : <ChatBubbleIcon />}
        </span>
      </button>
    </>
  );
}
