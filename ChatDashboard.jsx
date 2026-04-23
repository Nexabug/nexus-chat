import { useState, useRef, useEffect } from "react";

const CONTACTS = [
  { id: 1, name: "Real estate deals", avatar: null, initials: "RE", color: "#4CAF9A", preview: "typing...", time: "11:15", isTyping: true, active: true },
  { id: 2, name: "Kate Johnson", avatar: null, initials: "KJ", color: "#7B8CDE", preview: "I will send the document s...", time: "11:15", isTyping: false, active: false },
  { id: 3, name: "Tamara Shevchenko", avatar: null, initials: "TS", color: "#E8A87C", preview: "are you going to a busine...", time: "10:05", isTyping: false, active: false },
  { id: 4, name: "Joshua Clarkson", avatar: null, initials: "JC", color: "#B57BDE", preview: "I suggest to start, I have n...", time: "15:09", isTyping: false, active: false },
  { id: 5, name: "Jeroen Zoet", avatar: null, initials: "JZ", color: "#DE7B8C", preview: "We need to start a new re...", time: "14:09", isTyping: false, active: false },
];

const MESSAGES = [
  { id: 1, sender: "Kate Johnson", avatar: "KJ", color: "#7B8CDE", text: "Hi everyone, let's start the call soon 🤩", time: "11:24 AM", isOwn: false },
  { id: 2, sender: "Kate Johnson", avatar: "KJ", color: "#7B8CDE", text: "Recently I saw properties in a great location that I did not pay attention to before 😅", time: "11:24 AM", isOwn: false },
  { id: 3, sender: "Evan Scott", avatar: "ES", color: "#4CAF9A", text: "Ooa, why don't you say something more", time: "11:25 AM", isOwn: false },
  { id: 4, sender: "Evan Scott", avatar: "ES", color: "#4CAF9A", text: "@Robert? 😄", time: "11:25 AM", isOwn: false },
  { id: 5, sender: "You", avatar: null, text: "He creates an atmosphere of mystery 😎", time: "11:26 AM", isOwn: true, reactions: ["😎", "😅"] },
  { id: 6, sender: "Evan Scott", avatar: "ES", color: "#4CAF9A", text: "Robert, don't be like that and say something more :) 😊", time: "11:34 AM", isOwn: false },
];

const FILE_CATEGORIES = [
  { icon: "📄", label: "Documents", count: "126 files", size: "193MB", color: "#5B8DEF", bg: "#EEF3FE" },
  { icon: "🖼️", label: "Photos", count: "53 files", size: "321MB", color: "#F5A623", bg: "#FEF6EA" },
  { icon: "🎬", label: "Movies", count: "3 files", size: "210MB", color: "#7B8CDE", bg: "#F0F1FC" },
  { icon: "📁", label: "Other", count: "49 files", size: "19.4MB", color: "#E87C8C", bg: "#FEF0F0" },
];

function Avatar({ initials, color, size = 36 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `linear-gradient(135deg, ${color}cc, ${color})`,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "#fff", fontFamily: "'Outfit', sans-serif",
      fontSize: size * 0.35, fontWeight: 600, flexShrink: 0,
      boxShadow: `0 2px 8px ${color}44`,
    }}>
      {initials}
    </div>
  );
}

function IconBtn({ children, active }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 42, height: 42, borderRadius: 12,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: active ? "#E8F8F2" : hovered ? "#f5f5f5" : "transparent",
        color: active ? "#3CC68A" : "#94A3B8",
        border: "none", cursor: "pointer",
        transition: "all 0.18s ease",
        transform: hovered ? "scale(1.1)" : "scale(1)",
      }}
    >
      {children}
    </button>
  );
}

export default function ChatDashboard() {
  const [activeTab, setActiveTab] = useState("Messages");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState(MESSAGES);
  const [activeContact, setActiveContact] = useState(1);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = () => {
    if (!message.trim()) return;
    setMessages(prev => [...prev, {
      id: Date.now(), sender: "You", text: message,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      isOwn: true,
    }]);
    setMessage("");
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#F0F4F8",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Outfit', 'Segoe UI', sans-serif",
      padding: 24,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #D1D5DB; border-radius: 99px; }
        .contact-item:hover { background: #f5faf8 !important; }
        .file-row:hover { background: #f9fafb !important; }
        .send-btn:hover { transform: scale(1.08) !important; box-shadow: 0 4px 16px #3CC68A66 !important; }
        .tab-btn { transition: all 0.18s ease; }
        .tab-btn:hover { color: #3CC68A !important; }
        .icon-nav-btn:hover { background: #f0f0f0 !important; color: #3CC68A !important; }
      `}</style>

      <div style={{
        width: "100%", maxWidth: 1180,
        background: "#FFFFFF",
        borderRadius: 24,
        boxShadow: "0 20px 80px rgba(0,0,0,0.10)",
        display: "flex",
        overflow: "hidden",
        height: 660,
      }}>

        {/* ─── ICON SIDEBAR ─── */}
        <div style={{
          width: 68, background: "#FAFAFA",
          borderRight: "1px solid #F0F0F0",
          display: "flex", flexDirection: "column",
          alignItems: "center", padding: "20px 0", gap: 8,
        }}>
          {/* Logo */}
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "linear-gradient(135deg, #3CC68A, #27A870)",
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 16, boxShadow: "0 4px 12px #3CC68A44",
          }}>
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>

          <IconBtn>
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </IconBtn>
          <IconBtn active>
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </IconBtn>
          <IconBtn>
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </IconBtn>
          <IconBtn>
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </IconBtn>

          <div style={{ flex: 1 }} />
          <IconBtn>
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </IconBtn>
        </div>

        {/* ─── LEFT SIDEBAR (Contacts) ─── */}
        <div style={{
          width: 240, background: "#FFFFFF",
          borderRight: "1px solid #F0F0F0",
          display: "flex", flexDirection: "column",
          padding: "20px 0",
        }}>
          {/* Header */}
          <div style={{ padding: "0 18px", display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <button style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", padding: 4 }}>
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span style={{ fontWeight: 700, fontSize: 16, color: "#1A2336" }}>Chat</span>
            <div style={{ width: 26 }} />
          </div>

          {/* Profile */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 18px 20px", borderBottom: "1px solid #F5F5F5" }}>
            <div style={{ position: "relative", marginBottom: 10 }}>
              <Avatar initials="JA" color="#3CC68A" size={64} />
              <div style={{
                position: "absolute", bottom: 2, right: 2,
                width: 14, height: 14, borderRadius: "50%",
                background: "#3CC68A", border: "2px solid #fff",
              }} />
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#1A2336", marginBottom: 6 }}>Jontray Arnold</div>
            <div style={{
              background: "#E8F8F2", color: "#3CC68A",
              fontSize: 11, fontWeight: 500, padding: "3px 10px",
              borderRadius: 99, display: "flex", alignItems: "center", gap: 4,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#3CC68A", display: "inline-block" }} />
              available ▾
            </div>
          </div>

          {/* Search */}
          <div style={{ padding: "14px 18px" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "#F7F8FA", borderRadius: 12, padding: "8px 12px",
              border: "1px solid #EDEFF2",
            }}>
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="#94A3B8" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
              </svg>
              <input placeholder="Search" style={{
                border: "none", background: "transparent", outline: "none",
                fontSize: 13, color: "#1A2336", width: "100%",
                fontFamily: "'Outfit', sans-serif",
              }} />
            </div>
          </div>

          {/* Last Chats */}
          <div style={{ padding: "0 10px", flex: 1, overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px 8px" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#94A3B8", letterSpacing: "0.04em" }}>LAST CHATS</span>
              <div style={{ display: "flex", gap: 4 }}>
                <button style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", fontSize: 18, lineHeight: 1 }}>+</button>
                <button style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", fontSize: 16, lineHeight: 1 }}>⋯</button>
              </div>
            </div>

            {CONTACTS.map(c => (
              <div
                key={c.id}
                className="contact-item"
                onClick={() => setActiveContact(c.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 10px", borderRadius: 14, cursor: "pointer",
                  background: c.id === activeContact ? "#F0FBF6" : "transparent",
                  transition: "background 0.15s ease", marginBottom: 2,
                }}
              >
                <Avatar initials={c.initials} color={c.color} size={38} />
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: "#1A2336", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 100 }}>{c.name}</span>
                    <span style={{ fontSize: 11, color: "#B0BAC9", flexShrink: 0 }}>{c.time}</span>
                  </div>
                  <div style={{ fontSize: 12, color: c.isTyping ? "#3CC68A" : "#94A3B8", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.isTyping ? "typing..." : c.preview}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ─── CENTER CHAT AREA ─── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#FAFCFB" }}>
          {/* Header */}
          <div style={{
            padding: "18px 24px", borderBottom: "1px solid #EDEFF2",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: "#fff",
          }}>
            <span style={{ fontWeight: 700, fontSize: 17, color: "#1A2336" }}>Group Chat</span>
            <div style={{ display: "flex", gap: 6 }}>
              {["Messages", "Participants"].map(tab => (
                <button
                  key={tab}
                  className="tab-btn"
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: "6px 16px", borderRadius: 99, border: "none", cursor: "pointer",
                    fontFamily: "'Outfit', sans-serif", fontWeight: 500, fontSize: 13,
                    background: activeTab === tab ? "#3CC68A" : "#F0F0F0",
                    color: activeTab === tab ? "#fff" : "#94A3B8",
                    transition: "all 0.18s ease",
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.map(msg => (
              <div key={msg.id} style={{
                display: "flex", flexDirection: msg.isOwn ? "row-reverse" : "row",
                alignItems: "flex-end", gap: 10,
              }}>
                {!msg.isOwn && (
                  <Avatar initials={msg.avatar} color={msg.color || "#94A3B8"} size={32} />
                )}
                <div style={{ maxWidth: "60%" }}>
                  {!msg.isOwn && (
                    <div style={{ fontSize: 11, color: "#94A3B8", marginBottom: 4, fontWeight: 500 }}>
                      {msg.sender} · {msg.time}
                    </div>
                  )}
                  <div style={{
                    background: msg.isOwn ? "linear-gradient(135deg, #3CC68A, #27B97A)" : "#fff",
                    color: msg.isOwn ? "#fff" : "#1A2336",
                    padding: "11px 15px", borderRadius: msg.isOwn ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                    fontSize: 13.5, lineHeight: 1.5, fontWeight: 400,
                    boxShadow: msg.isOwn ? "0 4px 16px #3CC68A33" : "0 2px 8px rgba(0,0,0,0.06)",
                  }}>
                    {msg.text}
                  </div>
                  {msg.isOwn && (
                    <div style={{ textAlign: "right", fontSize: 11, color: "#94A3B8", marginTop: 4 }}>{msg.time}</div>
                  )}
                  {msg.reactions && (
                    <div style={{
                      display: "flex", justifyContent: "flex-end", gap: 4, marginTop: 6,
                    }}>
                      {msg.reactions.map((r, i) => (
                        <span key={i} style={{
                          background: "#fff", borderRadius: 99, padding: "3px 8px",
                          fontSize: 14, boxShadow: "0 1px 4px rgba(0,0,0,0.10)", cursor: "pointer",
                        }}>{r}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Typing Indicator */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Avatar initials="ES" color="#4CAF9A" size={32} />
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  background: "#fff", borderRadius: "18px 18px 18px 4px",
                  padding: "10px 14px", boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                  display: "flex", alignItems: "center", gap: 5,
                }}>
                  {[0, 1, 2].map(i => (
                    <span key={i} style={{
                      width: 6, height: 6, borderRadius: "50%", background: "#94A3B8",
                      display: "inline-block",
                      animation: `bounce 1.2s ${i * 0.2}s infinite ease-in-out`,
                    }} />
                  ))}
                </div>
                <span style={{ fontSize: 12, color: "#94A3B8" }}>Robert is typing</span>
              </div>
            </div>
            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <div style={{
            padding: "14px 20px", borderTop: "1px solid #EDEFF2", background: "#fff",
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{
              flex: 1, display: "flex", alignItems: "center", gap: 10,
              background: "#F7F8FA", borderRadius: 16, padding: "10px 16px",
              border: "1px solid #EDEFF2",
            }}>
              <input
                value={message}
                onChange={e => setMessage(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendMessage()}
                placeholder="Write your message..."
                style={{
                  flex: 1, border: "none", background: "transparent", outline: "none",
                  fontSize: 13.5, color: "#1A2336", fontFamily: "'Outfit', sans-serif",
                }}
              />
              <button style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", padding: 2, display: "flex", alignItems: "center" }}>
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
              </button>
              <button style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", padding: 2, display: "flex", alignItems: "center" }}>
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="10"/><path strokeLinecap="round" d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
                </svg>
              </button>
            </div>
            <button
              className="send-btn"
              onClick={sendMessage}
              style={{
                width: 44, height: 44, borderRadius: 14, border: "none", cursor: "pointer",
                background: "linear-gradient(135deg, #3CC68A, #27B97A)",
                display: "flex", alignItems: "center", justifyContent: "center",
                boxShadow: "0 4px 12px #3CC68A44", transition: "all 0.18s ease",
              }}
            >
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth="2.2">
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>

        {/* ─── RIGHT SIDEBAR ─── */}
        <div style={{
          width: 240, background: "#FFFFFF",
          borderLeft: "1px solid #F0F0F0",
          display: "flex", flexDirection: "column",
          padding: "20px 18px",
          overflowY: "auto",
        }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
            <button style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", padding: 4 }}>
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <span style={{ fontWeight: 700, fontSize: 15, color: "#1A2336" }}>Shared files</span>
            <div style={{ width: 26 }} />
          </div>

          {/* Group Info */}
          <div style={{
            background: "linear-gradient(135deg, #F0FBF6, #E8F8F0)",
            borderRadius: 18, padding: "18px 14px", textAlign: "center",
            marginBottom: 16, border: "1px solid #DCF5EA",
          }}>
            <div style={{
              width: 60, height: 60, borderRadius: 16,
              background: "linear-gradient(135deg, #3CC68A22, #3CC68A44)",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 10px", fontSize: 28,
              boxShadow: "0 4px 16px #3CC68A22",
            }}>🏙️</div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#1A2336", marginBottom: 3 }}>Real estate deals</div>
            <div style={{ fontSize: 12, color: "#94A3B8" }}>10 members</div>
          </div>

          {/* Stats */}
          <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
            {[
              { label: "All files", value: "231", icon: "🗂️", color: "#3CC68A", bg: "#F0FBF6" },
              { label: "All links", value: "45", icon: "🔗", color: "#7B8CDE", bg: "#F0F1FC" },
            ].map(s => (
              <div key={s.label} style={{
                flex: 1, background: s.bg, borderRadius: 14,
                padding: "12px 10px", textAlign: "center",
                border: `1px solid ${s.color}22`,
              }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 20, color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* File Categories */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#94A3B8", letterSpacing: "0.04em" }}>FILE TYPE</span>
            <button style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", fontSize: 18 }}>⋯</button>
          </div>

          {FILE_CATEGORIES.map(f => (
            <div
              key={f.label}
              className="file-row"
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: 14, marginBottom: 6,
                background: "#F9FAFB", cursor: "pointer", transition: "background 0.15s ease",
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: f.bg, display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 18, flexShrink: 0,
              }}>{f.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: "#1A2336" }}>{f.label}</div>
                <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{f.count}, {f.size}</div>
              </div>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="#C5CDD8" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-5px); }
        }
      `}</style>
    </div>
  );
}
