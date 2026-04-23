import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Send, LogOut, Plus, Hash, Users, MessageSquare, Smile, Edit2, Trash2, X, Paperclip, Check, CheckCheck, Download, Phone, PhoneOff, Video, Lock } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';
import CryptoJS from 'crypto-js';
import './Chat.css';

export default function Chat() {
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [currentRoom, setCurrentRoom] = useState('global');
  const [roomInput, setRoomInput] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [users, setUsers] = useState([]);
  const [sidebarTab, setSidebarTab] = useState('rooms');
  const [typingUsers, setTypingUsers] = useState({});
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [editingMessage, setEditingMessage] = useState(null);
  const [roomSecret, setRoomSecret] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  
  // WebRTC State
  const [stream, setStream] = useState(null);
  const [receivingCall, setReceivingCall] = useState(false);
  const [caller, setCaller] = useState("");
  const [callerSignal, setCallerSignal] = useState(null);
  const [callAccepted, setCallAccepted] = useState(false);
  const [calling, setCalling] = useState(false);

  const username = localStorage.getItem('username');
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  
  const myVideo = useRef();
  const userVideo = useRef();
  const connectionRef = useRef();

  useEffect(() => {
    if (!username) {
      navigate('/login');
      return;
    }

    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
      Notification.requestPermission();
    }

    const newSocket = io(API_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      newSocket.emit('set_online', username);
      joinRoom(newSocket, 'global');
      fetchUsers();
    });

    newSocket.on('receive_message', (msg) => {
      setMessages((prev) => [...prev, msg]);
      
      setTypingUsers((prev) => {
        const roomTyping = prev[msg.room] || [];
        return { ...prev, [msg.room]: roomTyping.filter(u => u !== msg.username) };
      });

      if (document.hidden && msg.username !== username && Notification.permission === "granted") {
        new Notification(`New message in ${msg.room} from ${msg.username}`, {
          body: msg.file_url ? 'Sent a file' : msg.text,
        });
      }
      
      if (msg.room === currentRoom && msg.username !== username) {
        newSocket.emit('mark_read', { messageIds: [msg.id], username, room: currentRoom });
      }
    });

    newSocket.on('user_status_change', () => fetchUsers());
    newSocket.on('user_list_updated', () => fetchUsers());

    newSocket.on('user_typing', ({ username: typingUsername, room }) => {
      if (typingUsername !== username) {
        setTypingUsers((prev) => {
          const roomTyping = prev[room] || [];
          if (!roomTyping.includes(typingUsername)) return { ...prev, [room]: [...roomTyping, typingUsername] };
          return prev;
        });
      }
    });

    newSocket.on('user_stopped_typing', ({ username: typingUsername, room }) => {
      setTypingUsers((prev) => {
        const roomTyping = prev[room] || [];
        return { ...prev, [room]: roomTyping.filter(u => u !== typingUsername) };
      });
    });

    newSocket.on('message_edited', ({ id, text }) => setMessages((prev) => prev.map(m => m.id === id ? { ...m, text, is_edited: 1 } : m)));
    newSocket.on('message_deleted', ({ id }) => setMessages((prev) => prev.map(m => m.id === id ? { ...m, is_deleted: 1 } : m)));
    newSocket.on('message_read', ({ id, readers }) => setMessages((prev) => prev.map(m => m.id === id ? { ...m, read_by: readers } : m)));

    // WebRTC Signaling Handlers
    newSocket.on('incoming_call', (data) => {
      setReceivingCall(true);
      setCaller(data.from);
      setCallerSignal(data.signalData);
    });

    newSocket.on('call_answered', async (data) => {
      setCallAccepted(true);
      if (connectionRef.current) {
        await connectionRef.current.setRemoteDescription(new RTCSessionDescription(data.signalData));
      }
    });

    newSocket.on('ice_candidate', (data) => {
      if (connectionRef.current) {
        connectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    });

    newSocket.on('call_ended', () => {
      cleanupCall();
    });

    return () => newSocket.close();
  }, [navigate, username]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingUsers]);

  useEffect(() => {
    if (messages.length > 0 && socket) {
      const unreadIds = messages.filter(m => m.username !== username && !m.read_by?.includes(username)).map(m => m.id);
      if (unreadIds.length > 0) socket.emit('mark_read', { messageIds: unreadIds, username, room: currentRoom });
    }
  }, [messages, currentRoom, socket, username]);

  // Set local video stream once media is acquired
  useEffect(() => {
    if (stream && myVideo.current) {
      myVideo.current.srcObject = stream;
    }
  }, [stream, calling, callAccepted]);

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_URL}/api/users`);
      setUsers(await res.json());
    } catch (err) {}
  };

  const fetchMessages = async (room) => {
    try {
      const res = await fetch(`${API_URL}/api/messages/${room}`);
      setMessages(await res.json());
    } catch (err) {}
  };

  const joinRoom = (sock, room) => {
    if(!sock) return;
    sock.emit('join_room', { room, username });
    setCurrentRoom(room);
    fetchMessages(room);
    setSidebarTab('rooms');
    setShowEmojiPicker(false);
    setEditingMessage(null);
    setMessageInput('');
    setRoomSecret(''); // Reset encryption secret on room change
    cleanupCall(); // End any active calls
  };

  const handleJoinCustomRoom = (e) => {
    e.preventDefault();
    if (roomInput.trim() && socket) { joinRoom(socket, roomInput.trim()); setRoomInput(''); }
  };

  const generatePrivateRoom = () => {
    const roomId = Math.random().toString(36).substring(2, 10);
    if (socket) joinRoom(socket, roomId);
  };

  const startDM = (otherUsername) => {
    const usersList = [username, otherUsername].sort();
    if (socket) joinRoom(socket, `dm_${usersList[0]}_${usersList[1]}`);
  };

  const handleTyping = (e) => {
    setMessageInput(e.target.value);
    if (socket && currentRoom) {
      socket.emit('typing', { room: currentRoom, username });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => socket.emit('stop_typing', { room: currentRoom, username }), 2000);
    }
  };

  const onEmojiClick = (emojiObject) => setMessageInput(prev => prev + emojiObject.emoji);

  const encryptText = (text) => {
    if (!roomSecret || !text) return text;
    return CryptoJS.AES.encrypt(text, roomSecret).toString();
  };

  const decryptText = (ciphertext) => {
    if (!roomSecret || !ciphertext) return ciphertext;
    try {
      const bytes = CryptoJS.AES.decrypt(ciphertext, roomSecret);
      const originalText = bytes.toString(CryptoJS.enc.Utf8);
      return originalText || ciphertext; 
    } catch { return ciphertext; }
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!messageInput.trim() || !socket) return;

    let textToSend = messageInput.trim();
    if (roomSecret) textToSend = encryptText(textToSend);

    if (editingMessage) {
      socket.emit('edit_message', { id: editingMessage.id, room: currentRoom, username, text: textToSend });
      setEditingMessage(null);
    } else {
      socket.emit('send_message', { room: currentRoom, username, text: textToSend, file_url: null, file_type: null });
    }
    
    setMessageInput('');
    setShowEmojiPicker(false);
    socket.emit('stop_typing', { room: currentRoom, username });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !socket) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${API_URL}/api/upload`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.fileUrl) {
        socket.emit('send_message', { room: currentRoom, username, text: '', file_url: data.fileUrl, file_type: data.fileType });
      }
    } catch (err) { console.error('Upload failed', err); }
    finally { setIsUploading(false); }
    e.target.value = '';
  };

  const handleDelete = (id) => {
    if(window.confirm('Are you sure you want to delete this message?')) {
      socket.emit('delete_message', { id, username, room: currentRoom });
    }
  };

  // WebRTC Call Functions
  const setupPeerEvents = (peer) => {
    peer.onicecandidate = (event) => {
      if (event.candidate) socket.emit('ice_candidate', { room: currentRoom, candidate: event.candidate });
    };
    peer.ontrack = (event) => {
      if (userVideo.current) userVideo.current.srcObject = event.streams[0];
    };
  };

  const initiateCall = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setStream(mediaStream);
      setCalling(true);

      const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      mediaStream.getTracks().forEach(track => peer.addTrack(track, mediaStream));
      setupPeerEvents(peer);

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socket.emit('call_user', { room: currentRoom, signalData: offer, from: username });
      connectionRef.current = peer;
    } catch (err) { console.error("Media access denied or error:", err); }
  };

  const answerCall = async () => {
    setCallAccepted(true);
    setReceivingCall(false);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setStream(mediaStream);

      const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      mediaStream.getTracks().forEach(track => peer.addTrack(track, mediaStream));
      setupPeerEvents(peer);

      await peer.setRemoteDescription(new RTCSessionDescription(callerSignal));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);

      socket.emit('answer_call', { room: currentRoom, signalData: answer });
      connectionRef.current = peer;
    } catch (err) { console.error("Media access denied or error:", err); }
  };

  const cleanupCall = () => {
    setCalling(false); setReceivingCall(false); setCallAccepted(false);
    if (connectionRef.current) connectionRef.current.close();
    if (stream) stream.getTracks().forEach(track => track.stop());
    setStream(null);
  };

  const leaveCall = () => {
    cleanupCall();
    socket.emit('end_call', { room: currentRoom });
  };

  const logout = () => {
    cleanupCall();
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    navigate('/login');
  };

  const currentTyping = typingUsers[currentRoom] || [];

  return (
    <div className="chat-layout">
      {/* Sidebar */}
      <div className="glass-panel sidebar">
        <div className="sidebar-header">
          <MessageSquare size={32} className="logo-icon-sm" />
          <h2 className="text-gradient">Nexus</h2>
        </div>
        
        <div className="user-profile">
          <div className="avatar">{username?.charAt(0).toUpperCase()}</div>
          <div className="user-info-col">
            <span className="username">{username}</span>
            <span className="status-badge online"><span className="dot"></span>Online</span>
          </div>
        </div>

        <div className="sidebar-tabs">
          <button className={`tab-btn ${sidebarTab === 'rooms' ? 'active' : ''}`} onClick={() => setSidebarTab('rooms')}>Rooms</button>
          <button className={`tab-btn ${sidebarTab === 'directory' ? 'active' : ''}`} onClick={() => setSidebarTab('directory')}>Directory</button>
        </div>

        <div className="sidebar-content">
          {sidebarTab === 'rooms' ? (
            <>
              <div className="room-section">
                <h3>Global</h3>
                <button className={`room-btn ${currentRoom === 'global' ? 'active' : ''}`} onClick={() => joinRoom(socket, 'global')}>
                  <Users size={18} /> Global Chat
                </button>
              </div>

              <div className="room-section">
                <h3>Private Room</h3>
                <form onSubmit={handleJoinCustomRoom} className="join-room-form">
                  <input type="text" className="input-field room-input" placeholder="Enter Room ID" value={roomInput} onChange={(e) => setRoomInput(e.target.value)} />
                  <button type="submit" className="btn-secondary join-btn"><Hash size={18} /></button>
                </form>
                <div className="divider"><span>OR</span></div>
                <button className="btn-outline create-room-btn" onClick={generatePrivateRoom}><Plus size={18} /> Generate New Room</button>
              </div>
            </>
          ) : (
            <div className="directory-list">
              {users.map(u => (
                <div key={u.id} className="directory-item" onClick={() => { if(u.username !== username) startDM(u.username); }}>
                  <div className="avatar-sm">{u.username.charAt(0).toUpperCase()}</div>
                  <span className="dir-username">{u.username} {u.username === username && '(You)'}</span>
                  {u.online ? <div className="status-dot online"></div> : <div className="status-dot offline"></div>}
                </div>
              ))}
            </div>
          )}
        </div>
        <button className="logout-btn" onClick={logout}><LogOut size={18} /> Logout</button>
      </div>

      {/* Main Chat Area */}
      <div className="glass-panel chat-main">
        <div className="chat-header">
          <div className="room-info">
            <Hash size={24} className="text-muted" />
            <h2>{currentRoom.startsWith('dm_') ? `Direct Message` : currentRoom}</h2>
          </div>
          <div className="header-actions">
            {currentRoom !== 'global' && (
              <div className="encryption-toggle">
                <Lock size={16} className={roomSecret ? 'text-green' : 'text-muted'} />
                <input 
                  type="password" 
                  placeholder="Set E2E Secret Key" 
                  className="input-field secret-input"
                  value={roomSecret}
                  onChange={(e) => setRoomSecret(e.target.value)}
                  title="Messages are encrypted using this key. Both users must have the same key."
                />
              </div>
            )}
            {currentRoom !== 'global' && !calling && !callAccepted && (
              <button className="btn-secondary call-btn" onClick={initiateCall} title="Start Video Call">
                <Video size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Video Call UI */}
        {(calling || callAccepted) && (
          <div className="video-call-container">
            <div className="video-grid">
              <div className="video-wrapper">
                <video playsInline muted ref={myVideo} autoPlay className="my-video" />
                <span className="video-label">You</span>
              </div>
              {callAccepted && (
                <div className="video-wrapper">
                  <video playsInline ref={userVideo} autoPlay className="user-video" />
                  <span className="video-label">{caller || 'Peer'}</span>
                </div>
              )}
            </div>
            <div className="call-controls">
              <button className="btn-danger end-call-btn" onClick={leaveCall}><PhoneOff size={20} /> End Call</button>
            </div>
          </div>
        )}

        {/* Incoming Call Overlay */}
        {receivingCall && !callAccepted && (
          <div className="incoming-call-overlay">
            <div className="incoming-call-box">
              <h3><Video size={24}/> Incoming Call</h3>
              <p><strong>{caller}</strong> is calling you...</p>
              <div className="incoming-actions">
                <button className="btn-success" onClick={answerCall}><Phone size={18} /> Answer</button>
                <button className="btn-danger" onClick={leaveCall}><PhoneOff size={18} /> Decline</button>
              </div>
            </div>
          </div>
        )}

        <div className="messages-container">
          {messages.map((msg, idx) => {
            const isMe = msg.username === username;
            
            if (msg.is_deleted) {
              return (
                <div key={idx} className={`message-wrapper ${isMe ? 'me' : 'other'}`}>
                  <div className="message-content">
                    <div className="message-bubble deleted-bubble"><span className="deleted-text">🚫 This message was deleted</span></div>
                  </div>
                </div>
              );
            }

            const displayedText = msg.text ? decryptText(msg.text) : '';

            return (
              <div key={idx} className={`message-wrapper ${isMe ? 'me' : 'other'}`}>
                {!isMe && <div className="message-avatar">{msg.username.charAt(0).toUpperCase()}</div>}
                <div className="message-content group">
                  {!isMe && <span className="message-sender">{msg.username}</span>}
                  
                  <div className="message-bubble-wrapper">
                    {isMe && !msg.file_url && (
                      <div className="message-actions hidden">
                        <button className="action-btn" onClick={() => { setEditingMessage(msg); setMessageInput(displayedText); setShowEmojiPicker(false); }}><Edit2 size={14} /></button>
                        <button className="action-btn text-danger" onClick={() => handleDelete(msg.id)}><Trash2 size={14} /></button>
                      </div>
                    )}
                    
                    <div className={`message-bubble ${isMe ? 'glass-primary' : 'glass-secondary'}`}>
                      {msg.file_url ? (
                        <div className="file-attachment">
                          {msg.file_type?.startsWith('image/') ? (
                            <img src={msg.file_url} alt="attachment" className="attached-image" />
                          ) : (
                            <a href={msg.file_url} target="_blank" rel="noreferrer" className="attached-file-link"><Download size={18}/> Download File</a>
                          )}
                        </div>
                      ) : (
                        <>
                          {displayedText}
                          {msg.is_edited ? <span className="edited-badge">(edited)</span> : null}
                        </>
                      )}
                      
                      {isMe && (
                        <span className="read-receipt">
                          {msg.read_by && msg.read_by.length > 0 ? <CheckCheck size={14} className="text-blue" /> : <Check size={14} />}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="message-time">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            );
          })}
          
          {currentTyping.length > 0 && (
            <div className="typing-indicator-wrapper">
              <div className="typing-indicator"><span className="dot"></span><span className="dot"></span><span className="dot"></span></div>
              <span className="typing-text">{currentTyping.join(', ')} {currentTyping.length > 1 ? 'are' : 'is'} typing...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="message-input-area">
          {editingMessage && (
            <div className="editing-banner">
              <Edit2 size={14} /> Editing message...
              <button className="cancel-edit-btn" onClick={() => { setEditingMessage(null); setMessageInput(''); }}><X size={14}/></button>
            </div>
          )}
          
          {showEmojiPicker && <div className="emoji-picker-container"><EmojiPicker onEmojiClick={onEmojiClick} theme="dark" /></div>}

          <form className="message-form" onSubmit={sendMessage}>
            <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
            <button type="button" className="action-icon-btn" onClick={() => fileInputRef.current.click()} disabled={isUploading}>
              {isUploading ? <div className="spinner-small" /> : <Paperclip size={20} />}
            </button>
            <button type="button" className="action-icon-btn" onClick={() => setShowEmojiPicker(!showEmojiPicker)}><Smile size={20} /></button>
            <input type="text" className="input-field message-input" placeholder="Type your message..." value={messageInput} onChange={handleTyping} />
            <button type="submit" className="btn-primary send-btn" disabled={!messageInput.trim() && !fileInputRef.current?.value}><Send size={20} /></button>
          </form>
        </div>
      </div>
    </div>
  );
}
