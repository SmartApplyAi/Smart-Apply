import { useState, useRef, useEffect, useCallback } from 'react';
import api from '../../services/api';
import './JarvisChat.css';

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
    .replace(/\r/g, '') // Remove carriage returns
    .replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^(.+)\n={3,}$/gm, '<h3>$1</h3>') // Underlined headers (====)
    .replace(/^(.+)\n-{3,}$/gm, '<h4>$1</h4>') // Underlined headers (----)
    .replace(/^###\s+(.*)$/gm, '<h4>$1</h4>') // ### Header
    .replace(/^##\s+(.*)$/gm, '<h3>$1</h3>')  // ## Header
    .replace(/^#\s+(.*)$/gm, '<h2>$1</h2>')   // # Header
    .replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>')
    .replace(/^\s*\d+\.\s+(.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');

  // Wrap loose <li> in <ul>
  html = html.replace(/(<li>.*?<\/li>)+/gs, '<ul>$&</ul>');

  // Clean up <br/> tags around block elements to prevent excessive spacing
  html = html.replace(/<br\/>\s*(<h[1-6]>|<ul|<ol|<pre)/g, '$1');
  html = html.replace(/(<\/h[1-6]>|<\/ul>|<\/ol>|<\/pre>)\s*<br\/>/g, '$1');

  return html;
}

// Quick suggestions
const SUGGESTIONS = [
  '💡 Resume tips',
  '📊 Explain ATS scoring',
  '🎯 Interview prep',
  '🐛 Fix a website issue',
  '🔧 Help with code',
  '🚀 How SmartApply works',
];

const BotMessage = ({ content, isNew }) => {
  const [displayedHtml, setDisplayedHtml] = useState(isNew ? '' : renderMarkdown(content));
  const [isTyping, setIsTyping] = useState(isNew);

  useEffect(() => {
    if (!isNew) return;

    let i = 0;
    let isMounted = true;
    const fullHtml = renderMarkdown(content);
    
    const typeWriter = () => {
      if (!isMounted) return;
      if (i < fullHtml.length) {
        if (fullHtml.charAt(i) === '<') {
          const closeIdx = fullHtml.indexOf('>', i);
          if (closeIdx !== -1) i = closeIdx + 1;
          else i++;
        } else if (fullHtml.charAt(i) === '&') {
          const closeIdx = fullHtml.indexOf(';', i);
          if (closeIdx !== -1 && closeIdx - i < 10) i = closeIdx + 1;
          else i++;
        } else {
          i++;
        }
        
        setDisplayedHtml(fullHtml.substring(0, i));
        
        const messagesArea = document.getElementById('jarvis-messages-area');
        if (messagesArea) {
          messagesArea.scrollTop = messagesArea.scrollHeight;
        }

        setTimeout(typeWriter, 10 + Math.random() * 15);
      } else {
        setIsTyping(false);
        setDisplayedHtml(fullHtml);
      }
    };
    
    setTimeout(typeWriter, 400);
    
    return () => { isMounted = false; };
  }, [content, isNew]);

  return (
    <div 
      className={isTyping ? 'typing-active' : ''}
      dangerouslySetInnerHTML={{ __html: displayedHtml }} 
    />
  );
};

export default function JarvisChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
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

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 350);
  }, []);

  // Escape key to close
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isOpen) handleClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, handleClose]);

  const handleToggle = useCallback(() => {
    if (isOpen) {
      handleClose();
    } else {
      setIsOpen(true);
    }
  }, [isOpen, handleClose]);

  const callBackendAPI = useCallback(async (allMessages) => {
    // Send only user/assistant messages to the backend
    const chatMessages = allMessages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }));

    const data = await api.post('/ai/jarvis-chat', { messages: chatMessages });
    return data.reply || "I apologize, I didn't get a response. Please try again.";
  }, []);

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
      const reply = await callBackendAPI(newMessages);
      setMessages(prev => [...prev, { role: 'assistant', content: reply, isNew: true }]);
    } catch (err) {
      const errorMsg = err?.detail || err?.message || 'Something went wrong. Please try again.';
      setMessages(prev => [
        ...prev,
        { role: 'error', content: errorMsg },
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, messages, callBackendAPI]);

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
                    <BotMessage content={msg.content} isNew={msg.isNew} />
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

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
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
