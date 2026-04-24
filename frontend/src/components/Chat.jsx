import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Send, LogOut, Plus, Hash, Users, MessageSquare, Smile, Edit2, Trash2, X, Paperclip, Check, CheckCheck, Download, Phone, PhoneOff, Video, Lock, Menu, CornerUpLeft, User, Search, Bell, BellOff, BellRing, Settings, Pin, PinOff, ChevronRight, FolderOpen, Mic, Play, Pause, Square, Info } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';
import ProfileModal, { Avatar } from './ProfileModal';
import SearchPanel from './SearchPanel';
import RoomSettingsModal from './RoomSettingsModal';
import LinkPreview from './LinkPreview';
import FileGallery from './FileGallery';
import RoomStats from './RoomStats';
import confetti from 'canvas-confetti';
import './Chat.css';

// ── Gradient avatar helper ──────────────────────────────────────
const GRADIENTS = [
  ['#6c63ff','#9c63ff'], ['#f093fb','#f5576c'], ['#4facfe','#00f2fe'],
  ['#43e97b','#38f9d7'], ['#fa709a','#fee140'], ['#a18cd1','#fbc2eb'],
  ['#fda085','#f6d365'], ['#96fbc4','#f9f586'], ['#d4fc79','#96e6a1'],
  ['#667eea','#764ba2'],
];
function getGradient(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const g = GRADIENTS[Math.abs(hash) % GRADIENTS.length];
  return `linear-gradient(135deg, ${g[0]}, ${g[1]})`;
}

// ── Date separator helper ───────────────────────────────────────
const IST = 'Asia/Kolkata';

function toISTDateString(ts) {
  return new Date(ts).toLocaleDateString('en-IN', { timeZone: IST });
}

function formatDateLabel(ts) {
  const d = toISTDateString(ts);
  const today = toISTDateString(Date.now());
  const yesterday = toISTDateString(Date.now() - 86400000);
  if (d === today) return 'Today';
  if (d === yesterday) return 'Yesterday';
  return new Date(ts).toLocaleDateString('en-IN', { timeZone: IST, month: 'long', day: 'numeric', year: 'numeric' });
}

// ── Audio helper ────────────────────────────────────────────────
const playNotificationSound = () => {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
    oscillator.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.1);
    
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.3);
  } catch (e) {
    console.log('Audio error:', e);
  }
};

// ── Voice Message Player ────────────────────────────────────────
function VoiceMessagePlayer({ url, knownDuration }) {
  const audioRef = React.useRef(null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [duration, setDuration] = React.useState(knownDuration || 0);

  const toggle = () => {
    if (!audioRef.current) return;
    if (isPlaying) { audioRef.current.pause(); setIsPlaying(false); }
    else { audioRef.current.play(); setIsPlaying(true); }
  };

  const fmt = (s) => {
    const m = Math.floor((s || 0) / 60);
    const sec = Math.floor((s || 0) % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="voice-player">
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
        onLoadedMetadata={() => {
          const d = audioRef.current?.duration;
          if (d && isFinite(d)) setDuration(d);
        }}
        onEnded={() => { setIsPlaying(false); setCurrentTime(0); }}
      />
      <button className="voice-play-btn" onClick={toggle} type="button">
        {isPlaying ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <div className="voice-waveform-container">
        {Array.from({ length: 28 }, (_, i) => {
          const h = 4 + Math.abs(Math.sin(i * 0.7 + 1) * 10 + Math.cos(i * 1.4) * 5);
          const filled = (i / 28) * 100 <= progress;
          return (
            <div
              key={i}
              className={`vwb ${filled ? 'filled' : ''} ${isPlaying ? 'playing' : ''}`}
              style={{ height: `${h}px`, animationDelay: `${(i % 7) * 0.1}s` }}
            />
          );
        })}
      </div>
      <span className="voice-time-label">
        {duration > 0 ? `${fmt(currentTime)} / ${fmt(duration)}` : fmt(currentTime)}
      </span>
    </div>
  );
}

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
  const [isUploading, setIsUploading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Phase 1: Unread badges & joined rooms
  const [unreadCounts, setUnreadCounts] = useState({});
  const [joinedRooms, setJoinedRooms] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nexus_rooms') || '["global"]'); } catch { return ['global']; }
  });
  const [roomLastActivity, setRoomLastActivity] = useState({});
  // Phase 2 state
  const [reactions, setReactions] = useState({}); // { messageId: [{username, emoji}] }
  const [replyingTo, setReplyingTo] = useState(null); // message object
  const [showProfile, setShowProfile] = useState(false);
  const [myAvatarUrl, setMyAvatarUrl] = useState(() => localStorage.getItem('avatarUrl') || '');
  const [hoveredMessageId, setHoveredMessageId] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);

  const startResizing = useCallback(() => {
    const handleMouseMove = (e) => {
      let newWidth = e.clientX - 20; 
      if (newWidth < 220) newWidth = 220;
      if (newWidth > 600) newWidth = 600;
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = 'auto';
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = 'none';
  }, []);
  
  // Phase 4: Room Management
  const [roomDetails, setRoomDetails] = useState({});
  const [roomMembers, setRoomMembers] = useState({});
  const [showRoomSettings, setShowRoomSettings] = useState(null);

  // Phase 4: Better Message Input
  const [pendingFile, setPendingFile] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Pinned Messages
  const [pinnedMessage, setPinnedMessage] = useState(null);
  const [contextMenu, setContextMenu] = useState(null); // { x, y, message }

  // File Gallery
  const [showGallery, setShowGallery] = useState(false);

  // Voice Messages
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [showStats, setShowStats] = useState(false);

  // Pagination & Custom Modal
  const [page, setPage] = useState(1);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [messageToDelete, setMessageToDelete] = useState(null);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  
  // Phase 3: Notifications
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [mutedRooms, setMutedRooms] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nexus_muted_rooms') || '[]'); } catch { return []; }
  });
  const mutedRoomsRef = useRef(mutedRooms);
  useEffect(() => { mutedRoomsRef.current = mutedRooms; }, [mutedRooms]);

  const addToast = useCallback((msg) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, ...msg }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  }, []);
  
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
  const textareaRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const isCancellingRef = useRef(false);
  
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

    // Load joined rooms from backend
    const loadRooms = async () => {
      try {
        const res = await fetch(`${API_URL}/api/rooms/joined`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (res.ok) {
          const data = await res.json();
          setJoinedRooms(data);
          localStorage.setItem('nexus_rooms', JSON.stringify(data));
        }
      } catch (err) { console.error('Failed to fetch joined rooms', err); }
    };
    loadRooms();

    const newSocket = io(API_URL, {
      auth: { token: localStorage.getItem('token') }
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      newSocket.emit('set_online', username);
      joinRoom(newSocket, 'global');
      fetchUsers();
      fetchRoomDetails(joinedRooms);
    });

    newSocket.on('room_updated', ({ id, name }) => {
      setRoomDetails(prev => ({ ...prev, [id]: name }));
    });

    newSocket.on('room_members', ({ room, members }) => {
      setRoomMembers(prev => ({ ...prev, [room]: members }));
    });

    newSocket.on('receive_message', (msg) => {
      const newMsg = { ...msg, isNew: true };
      setMessages((prev) => {
        const nextMessages = [...prev, newMsg];
        if (nextMessages.length > 0 && nextMessages.length % 100 === 0) {
          confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, zIndex: 9999 });
        }
        return nextMessages;
      });
      setTypingUsers((prev) => {
        const roomTyping = prev[msg.room] || [];
        return { ...prev, [msg.room]: roomTyping.filter(u => u !== msg.username) };
      });

      // Track unread counts for rooms not currently active
      setCurrentRoom(prev => {
        if (msg.room !== prev && msg.username !== username) {
          setUnreadCounts(u => ({ ...u, [msg.room]: (u[msg.room] || 0) + 1 }));
        }
        return prev;
      });

      // Update room last activity time
      setRoomLastActivity(prev => ({ ...prev, [msg.room]: Date.now() }));

      setJoinedRooms(prev => {
        if (!prev.includes(msg.room)) {
          const updated = [...prev, msg.room];
          localStorage.setItem('nexus_rooms', JSON.stringify(updated));
          return updated;
        }
        return prev;
      });

      const isMuted = mutedRoomsRef.current.includes(msg.room);

      if (msg.username !== username && msg.room !== currentRoom && !isMuted) {
        addToast({ room: msg.room, username: msg.username, text: msg.file_url ? 'Sent a file' : msg.text });
        playNotificationSound();
        setNotifications(prev => [{ id: msg.id, room: msg.room, username: msg.username, text: msg.file_url ? 'Sent a file' : msg.text, time: Date.now() }, ...prev].slice(0, 50));
      }

      if (document.hidden && msg.username !== username && !isMuted && Notification.permission === "granted") {
        new Notification(`New message in ${msg.room} from ${msg.username}`, {
          body: msg.file_url ? 'Sent a file' : msg.text,
        });
      }
      if (msg.room === currentRoom && msg.username !== username) {
        newSocket.emit('mark_read', { messageIds: [msg.id], username, room: currentRoom });
      }
    });

    // Phase 2: Reactions
    newSocket.on('reactions_updated', ({ message_id, reactions: reactionList }) => {
      setReactions(prev => ({ ...prev, [message_id]: reactionList }));
    });

    // Pinned Messages
    newSocket.on('message_pinned', (msg) => {
      setPinnedMessage(msg);
    });
    newSocket.on('message_unpinned', () => {
      setPinnedMessage(null);
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

  useEffect(() => {
    if (stream && myVideo.current) {
      myVideo.current.srcObject = stream;
    }
  }, [stream, calling, callAccepted]);

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_URL}/api/users`);
      const data = await res.json();
      if (Array.isArray(data)) setUsers(data);
    } catch (err) {}
  };

  const fetchRoomDetails = async (roomIds) => {
    if (!roomIds || roomIds.length === 0) return;
    try {
      const res = await fetch(`${API_URL}/api/rooms/details`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: roomIds })
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        const detailsMap = {};
        data.forEach(r => detailsMap[r.id] = r.name);
        setRoomDetails(prev => ({ ...prev, ...detailsMap }));
      }
    } catch (err) {}
  };

  useEffect(() => {
    fetchRoomDetails(joinedRooms);
    
    // Sync joined rooms to backend
    if (username && joinedRooms.length > 0) {
      fetch(`${API_URL}/api/rooms/joined`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ rooms: joinedRooms })
      }).catch(err => console.error('Failed to sync joined rooms', err));
    }
  }, [joinedRooms]);

  const fetchMessages = async (room, pageNum = 1, append = false) => {
    try {
      const res = await fetch(`${API_URL}/api/messages/${room}?page=${pageNum}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        if (data.length < 50) setHasMoreMessages(false);
        else setHasMoreMessages(true);

        if (append) {
          setMessages(prev => {
            // Keep current scroll position by adjusting after render (basic approach)
            const oldScrollHeight = document.querySelector('.chat-messages')?.scrollHeight;
            setTimeout(() => {
              const el = document.querySelector('.chat-messages');
              if (el) el.scrollTop = el.scrollHeight - oldScrollHeight;
            }, 0);
            return [...data, ...prev];
          });
        } else {
          setMessages(data);
        }
      }
      
      const rRes = await fetch(`${API_URL}/api/messages/${room}/reactions`);
      const rData = await rRes.json();
      if (Array.isArray(rData)) {
        const reactionMap = {};
        for (const r of rData) {
          if (!reactionMap[r.message_id]) reactionMap[r.message_id] = [];
          reactionMap[r.message_id].push({ username: r.username, emoji: r.emoji });
        }
        setReactions(reactionMap);
      }

      // Fetch pinned message for the room
      const pRes = await fetch(`${API_URL}/api/rooms/${room}/pinned`);
      const pData = await pRes.json();
      setPinnedMessage(pData || null);
    } catch (err) {}
  };

  const formatLastSeen = (lastSeen) => {
    if (!lastSeen) return '';
    const diff = Math.floor((Date.now() - new Date(lastSeen).getTime()) / 1000);
    if (diff < 60) return 'Active now';
    if (diff < 3600) return `Last seen ${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `Last seen ${Math.floor(diff / 3600)}h ago`;
    return `Last seen ${Math.floor(diff / 86400)}d ago`;
  };

  const getDMOtherUser = () => {
    if (!currentRoom.startsWith('dm_')) return null;
    const parts = currentRoom.replace('dm_', '').split('_');
    return parts.find(p => p !== username) || parts[0];
  };

  const toggleReaction = (messageId, emoji) => {
    if (!socket) return;
    const msgReactions = reactions[messageId] || [];
    const mine = msgReactions.find(r => r.username === username && r.emoji === emoji);
    if (mine) {
      socket.emit('remove_reaction', { message_id: messageId, username, emoji, room: currentRoom });
    } else {
      socket.emit('add_reaction', { message_id: messageId, username, emoji, room: currentRoom });
    }
  };

  const joinRoom = (sock, room) => {
    if(!sock) return;
    sock.emit('join_room', { room, username });
    setCurrentRoom(room);
    setPage(1);
    fetchMessages(room, 1, false);
    setSidebarTab('rooms');
    setShowEmojiPicker(false);
    setEditingMessage(null);
    setReplyingTo(null);
    setMessageInput('');
    setShowSearch(false);
    cleanupCall();
    setIsSidebarOpen(false);
    setPinnedMessage(null);
    setContextMenu(null);
    // Clear unread badge for this room
    setUnreadCounts(prev => ({ ...prev, [room]: 0 }));
    // Persist joined rooms
    setJoinedRooms(prev => {
      const updated = prev.includes(room) ? prev : [...prev, room];
      localStorage.setItem('nexus_rooms', JSON.stringify(updated));
      return updated;
    });
    setShowStats(false);
  };

  const handlePinMessage = (msg) => {
    if (socket) socket.emit('pin_message', { message_id: msg.id, room: currentRoom });
    setContextMenu(null);
  };

  const handleUnpinMessage = () => {
    if (socket) socket.emit('unpin_message', { room: currentRoom });
    setContextMenu(null);
  };

  const handleContextMenu = (e, msg) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, message: msg });
  };

  const scrollToPinnedMessage = () => {
    if (!pinnedMessage) return;
    const el = document.getElementById(`msg-${pinnedMessage.id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const handleJoinCustomRoom = (e) => {
    e.preventDefault();
    if (roomInput.trim() && socket) { joinRoom(socket, roomInput.trim()); setRoomInput(''); }
  };

  const generatePrivateRoom = () => {
    const roomId = Math.random().toString(36).substring(2, 10);
    if (socket) joinRoom(socket, roomId);
  };

  const leaveRoom = (roomId) => {
    if (socket) socket.emit('leave_room', { room: roomId });
    setJoinedRooms(prev => {
      const updated = prev.filter(r => r !== roomId);
      localStorage.setItem('nexus_rooms', JSON.stringify(updated));
      return updated;
    });
    if (currentRoom === roomId) {
      joinRoom(socket, 'global');
    }
    setShowRoomSettings(null);
  };

  const handleRenameRoom = async (roomId, newName) => {
    try {
      const res = await fetch(`${API_URL}/api/rooms/${roomId}`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ name: newName })
      });
      if (res.ok) {
        const data = await res.json();
        setRoomDetails(prev => ({ ...prev, [roomId]: data.name }));
      }
    } catch (err) {
      console.error('Failed to rename room', err);
    }
  };

  const startDM = (otherUsername) => {
    const usersList = [username, otherUsername].sort();
    if (socket) joinRoom(socket, `dm_${usersList[0]}_${usersList[1]}`);
    setIsSidebarOpen(false);
  };

  const handleTyping = (e) => {
    setMessageInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px';
    }
    if (socket && currentRoom) {
      socket.emit('typing', { room: currentRoom, username });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => socket.emit('stop_typing', { room: currentRoom, username }), 2000);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e);
    }
  };

  const onEmojiClick = (emojiObject) => setMessageInput(prev => prev + emojiObject.emoji);

  const handleFileSelect = (file) => {
    if (!file) return;
    setPendingFile(file);
    if (file.type.startsWith('image/')) {
      const url = URL.createObjectURL(file);
      setFilePreviewUrl(url);
    } else {
      setFilePreviewUrl('');
    }
  };

  const handleFileUpload = (e) => {
    handleFileSelect(e.target.files[0]);
    e.target.value = '';
  };

  const clearPendingFile = () => {
    setPendingFile(null);
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    setFilePreviewUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePaste = (e) => {
    if (e.clipboardData && e.clipboardData.files && e.clipboardData.files.length > 0) {
      e.preventDefault();
      handleFileSelect(e.clipboardData.files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const formatRecordingDuration = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const startRecording = async () => {
    if (isRecording) { stopRecording(); return; }
    isCancellingRef.current = false;
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      audioChunksRef.current = [];

      // Pick best supported MIME type
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) mimeType = 'audio/ogg;codecs=opus';
        else if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
        else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
        else mimeType = '';
      }

      const recorderOptions = mimeType ? { mimeType } : {};
      const mediaRecorder = new MediaRecorder(micStream, recorderOptions);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };

      mediaRecorder.onstop = () => {
        micStream.getTracks().forEach(t => t.stop());
        if (!isCancellingRef.current && audioChunksRef.current.length > 0) {
          const finalMime = mimeType || 'audio/webm';
          const blob = new Blob(audioChunksRef.current, { type: finalMime });
          setAudioBlob(blob);
          setAudioUrl(URL.createObjectURL(blob));
        }
        isCancellingRef.current = false;
      };

      mediaRecorder.start(250); // collect data every 250ms
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => setRecordingDuration(d => d + 1), 1000);
    } catch (err) {
      console.error('Mic access denied:', err);
      addToast({ room: currentRoom, username: '⚠️ System', text: 'Microphone access denied. Please allow mic access in your browser.' });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
  };

  const cancelRecording = () => {
    isCancellingRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setAudioBlob(null);
    setAudioUrl('');
    setRecordingDuration(0);
    if (recordingTimerRef.current) { clearInterval(recordingTimerRef.current); recordingTimerRef.current = null; }
  };

  const sendVoiceMessage = async () => {
    if (!audioBlob || !socket) return;
    setIsUploading(true);
    const formData = new FormData();
    const ext = audioBlob.type.includes('ogg') ? 'ogg' : audioBlob.type.includes('mp4') ? 'm4a' : 'webm';
    formData.append('file', audioBlob, `voice_message.${ext}`);
    try {
      const res = await fetch(`${API_URL}/api/upload`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.fileUrl) {
        socket.emit('send_message', {
          room: currentRoom, username, text: '',
          file_url: data.fileUrl,
          file_type: audioBlob.type || 'audio/webm',
          reply_to_id: replyingTo ? replyingTo.id : null
        });
        setReplyingTo(null);
      }
    } catch (err) {
      console.error('Voice upload failed', err);
    } finally {
      setIsUploading(false);
      setAudioBlob(null);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl('');
      setRecordingDuration(0);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!messageInput.trim() && !pendingFile) return;
    if (!socket) return;

    let textToSend = messageInput.trim();

    let uploadedFileUrl = null;
    let uploadedFileType = null;

    if (pendingFile) {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', pendingFile);
      try {
        const res = await fetch(`${API_URL}/api/upload`, { method: 'POST', body: formData });
        const data = await res.json();
        if (data.fileUrl) {
          uploadedFileUrl = data.fileUrl;
          uploadedFileType = data.fileType;
        }
      } catch (err) { console.error('Upload failed', err); }
      finally { setIsUploading(false); }
    }

    if (editingMessage) {
      socket.emit('edit_message', { id: editingMessage.id, room: currentRoom, username, text: textToSend });
      setEditingMessage(null);
    } else {
      socket.emit('send_message', { 
        room: currentRoom, username, text: textToSend, 
        file_url: uploadedFileUrl, file_type: uploadedFileType,
        reply_to_id: replyingTo ? replyingTo.id : null
      });
      setReplyingTo(null);
    }
    
    setMessageInput('');
    clearPendingFile();
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setShowEmojiPicker(false);
    socket.emit('stop_typing', { room: currentRoom, username });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  };

  const handleDelete = (id) => {
    setMessageToDelete(id);
  };

  const confirmDelete = () => {
    if (messageToDelete) {
      socket.emit('delete_message', { id: messageToDelete, username, room: currentRoom });
      setMessageToDelete(null);
    }
  };

  const cleanupCall = () => {
    setCalling(false); setReceivingCall(false); setCallAccepted(false);
    if (connectionRef.current) { connectionRef.current.close(); connectionRef.current = null; }
    if (stream) { stream.getTracks().forEach(track => track.stop()); setStream(null); }
  };

  const callUser = async () => {
    try {
      const currentStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setStream(currentStream);
      setCalling(true);

      const peer = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      });
      connectionRef.current = peer;

      currentStream.getTracks().forEach(track => peer.addTrack(track, currentStream));

      peer.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('ice_candidate', { room: currentRoom, candidate: event.candidate });
        }
      };

      peer.ontrack = (event) => {
        if (userVideo.current) {
          userVideo.current.srcObject = event.streams[0];
        }
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      socket.emit("call_user", {
        room: currentRoom,
        signalData: offer,
        from: username
      });
    } catch (err) {
      console.error("Failed to access media devices:", err);
      addToast({ room: currentRoom, username: "System", text: "Camera/microphone access denied." });
    }
  };

  const answerCall = async () => {
    setCallAccepted(true);
    try {
      let currentStream = stream;
      if (!currentStream) {
        currentStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        setStream(currentStream);
      }
      
      const peer = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      });
      connectionRef.current = peer;

      currentStream.getTracks().forEach(track => peer.addTrack(track, currentStream));

      peer.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('ice_candidate', { room: currentRoom, candidate: event.candidate });
        }
      };

      peer.ontrack = (event) => {
        if (userVideo.current) {
          userVideo.current.srcObject = event.streams[0];
        }
      };

      if (callerSignal) {
        await peer.setRemoteDescription(new RTCSessionDescription(callerSignal));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);

        socket.emit("answer_call", { signalData: answer, room: currentRoom });
      }
    } catch (err) {
      console.error("Failed to answer call:", err);
    }
  };

  const leaveCall = () => {
    cleanupCall();
    socket.emit('end_call', { room: currentRoom });
  };

  const logout = async () => {
    cleanupCall();
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    navigate('/login');
  };

  const currentTyping = typingUsers[currentRoom] || [];
  const sortedRooms = [...joinedRooms].sort((a, b) => (roomLastActivity[b] || 0) - (roomLastActivity[a] || 0));

  const handleScroll = (e) => {
    if (e.target.scrollTop === 0 && hasMoreMessages) {
      const newPage = page + 1;
      setPage(newPage);
      fetchMessages(currentRoom, newPage, true);
    }
  };

  return (
    <div className="chat-layout" style={{ '--sidebar-width': `${sidebarWidth}px` }} onClick={() => setContextMenu(null)}>
      {isSidebarOpen && <div className="mobile-sidebar-overlay" onClick={() => setIsSidebarOpen(false)}></div>}

      {/* Delete Confirmation Modal */}
      {messageToDelete && (
        <div className="modal-overlay glass-overlay active">
          <div className="modal-content glass-panel bounce-in" style={{ maxWidth: '400px', textAlign: 'center' }}>
            <div className="modal-header" style={{ justifyContent: 'center' }}>
              <h2 className="text-gradient">Delete Message</h2>
            </div>
            <div className="modal-body" style={{ padding: '20px 0' }}>
              <Trash2 size={48} color="var(--color-danger)" style={{ margin: '0 auto 15px auto', display: 'block' }} />
              <p>Are you sure you want to delete this message? This action cannot be undone.</p>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'center', gap: '15px' }}>
              <button className="btn-secondary" onClick={() => setMessageToDelete(null)}>Cancel</button>
              <button className="btn-primary" style={{ backgroundColor: 'var(--color-danger)' }} onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="context-menu-item" onClick={() => { setReplyingTo(contextMenu.message); setContextMenu(null); }}>
            <CornerUpLeft size={14} /> Reply
          </button>
          {pinnedMessage?.id === contextMenu.message.id ? (
            <button className="context-menu-item context-menu-unpin" onClick={handleUnpinMessage}>
              <PinOff size={14} /> Unpin Message
            </button>
          ) : (
            <button className="context-menu-item context-menu-pin" onClick={() => handlePinMessage(contextMenu.message)}>
              <Pin size={14} /> Pin Message
            </button>
          )}
          {contextMenu.message.username === username && (
            <>
              {!contextMenu.message.file_url && (
                <button className="context-menu-item" onClick={() => { setEditingMessage(contextMenu.message); setMessageInput(contextMenu.message.text || ''); setShowEmojiPicker(false); setContextMenu(null); }}>
                  <Edit2 size={14} /> Edit
                </button>
              )}
              <button className="context-menu-item context-menu-danger" onClick={() => { handleDelete(contextMenu.message.id); setContextMenu(null); }}>
                <Trash2 size={14} /> Delete
              </button>
            </>
          )}
        </div>
      )}
      <div className={`glass-panel sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <MessageSquare size={32} className="logo-icon-sm" />
          <h2 className="text-gradient">Nexus</h2>
          <button className="mobile-close-btn" onClick={() => setIsSidebarOpen(false)}><X size={24} /></button>
        </div>
        
        <div className="user-profile" onClick={() => setShowProfile(true)}>
          <div className="avatar" style={{ background: getGradient(username) }}>{username?.charAt(0).toUpperCase()}</div>
          <div className="user-info-col">
            <span className="username">{username}</span>
            <span className="status-badge online"><span className="dot"></span>Online</span>
          </div>
          <User size={14} className="profile-edit-hint" />
        </div>

        <div className="sidebar-tabs">
          <button className={`tab-btn ${sidebarTab === 'rooms' ? 'active' : ''}`} onClick={() => setSidebarTab('rooms')}>Rooms</button>
          <button className={`tab-btn ${sidebarTab === 'directory' ? 'active' : ''}`} onClick={() => setSidebarTab('directory')}>Directory</button>
        </div>

        <div className="sidebar-content">
          {sidebarTab === 'rooms' ? (
            <>
              <div className="room-section">
                <h3>Rooms</h3>
                {sortedRooms.map(room => {
                  const count = unreadCounts[room] || 0;
                  const isGlobal = room === 'global';
                  const isDM = room.startsWith('dm_');
                  
                  let label = room;
                  if (isDM) {
                    label = '💬 ' + room.replace(/^dm_/, '').replace(/_/g, ' ↔ ');
                  } else if (isGlobal) {
                    label = 'Global Chat';
                  } else if (roomDetails[room]) {
                    label = roomDetails[room];
                  } else {
                    label = `# ${room}`;
                  }

                  return (
                    <div key={room} className={`room-btn-wrapper ${currentRoom === room ? 'active' : ''}`}>
                      <button className="room-btn" onClick={() => joinRoom(socket, room)}>
                        {isGlobal ? <Users size={16}/> : <Hash size={16}/>}
                        <span className="room-btn-label">{label}</span>
                        {count > 0 && <span className="unread-badge">{count > 99 ? '99+' : count}</span>}
                      </button>
                      {!isGlobal && !isDM && (
                        <button 
                          className="room-settings-trigger" 
                          onClick={(e) => { e.stopPropagation(); setShowRoomSettings(room); }}
                        >
                          <Settings size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="room-section">
                <h3>Join Room</h3>
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
                  <div className="avatar-sm" style={{ background: getGradient(u.username) }}>{u.username.charAt(0).toUpperCase()}</div>
                  <span className="dir-username">{u.username} {u.username === username && '(You)'}</span>
                  {u.online ? <div className="status-dot online"></div> : <div className="status-dot offline"></div>}
                </div>
              ))}
            </div>
          )}
        </div>
        <button className="logout-btn" onClick={logout}><LogOut size={18} /> Logout</button>
      </div>

      <div className="sidebar-resizer hidden-mobile" onMouseDown={startResizing}></div>

      <div 
        className="glass-panel chat-main"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div className="drag-overlay">
            <div className="drag-content">
              <Download size={48} className="pulse-animation text-primary" />
              <h3>Drop files here to attach</h3>
            </div>
          </div>
        )}
        {showSearch && (
          <SearchPanel
            room={currentRoom}
            apiUrl={API_URL}
            onClose={() => setShowSearch(false)}
            onJumpToMessage={(id) => {
              const el = document.getElementById(`msg-${id}`);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
          />
        )}
        <div className="chat-header">
          <div className={`room-info ${currentRoom.startsWith('dm_') ? 'dm-room-info' : ''}`}>
            <button className="mobile-menu-btn" onClick={() => setIsSidebarOpen(true)}><Menu size={24} /></button>
            <Hash size={24} className="text-muted hidden-mobile" />
            <div className="room-info-text">
              <h2>
                {currentRoom.startsWith('dm_') 
                  ? `@ ${getDMOtherUser()}` 
                  : (roomDetails[currentRoom] || currentRoom)}
              </h2>
              {(() => {
                const other = getDMOtherUser();
                const otherUser = other && users.find(u => u.username === other);
                if (!otherUser) {
                  // For non-DM rooms, show member count if available
                  if (!currentRoom.startsWith('dm_') && roomMembers[currentRoom]) {
                    return <span className="dm-status">{roomMembers[currentRoom].length} members online</span>;
                  }
                  return null;
                }
                const statusText = otherUser.online ? 'Active now' : formatLastSeen(otherUser.last_seen);
                return <span className={`dm-status ${otherUser.online ? 'online' : ''}`}>{otherUser.online ? '🟢' : '🕐'} {statusText}</span>;
              })()}
            </div>
          </div>
          <div className="header-actions">
            <div className="notification-bell-container">
              <button className="action-btn notification-btn" onClick={() => setShowNotifications(!showNotifications)}>
                {notifications.length > 0 ? <BellRing size={18} className="text-primary pulse-animation" /> : <Bell size={18} />}
                {notifications.length > 0 && <span className="notification-dot"></span>}
              </button>
              {showNotifications && (
                <div className="notification-panel">
                  <div className="notification-panel-header">
                    <h3>Notifications</h3>
                    <button className="text-muted" onClick={() => setNotifications([])}>Clear</button>
                  </div>
                  <div className="notification-list">
                    {notifications.length === 0 ? (
                      <div className="no-notifications">No new notifications</div>
                    ) : (
                      notifications.map(n => (
                        <div key={n.id} className="notification-item" onClick={() => { joinRoom(socket, n.room); setShowNotifications(false); }}>
                          <div className="notification-item-header">
                            <span className="notification-room">#{n.room}</span>
                            <span className="notification-time">{new Date(n.time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <div className="notification-body"><strong>{n.username}:</strong> {n.text?.substring(0, 40)}{n.text?.length > 40 ? '...' : ''}</div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="notification-panel-footer">
                    <label className="mute-room-label">
                      <span>Mute #{currentRoom}</span>
                      <input 
                        type="checkbox" 
                        checked={mutedRooms.includes(currentRoom)} 
                        onChange={(e) => {
                          const updated = e.target.checked ? [...mutedRooms, currentRoom] : mutedRooms.filter(r => r !== currentRoom);
                          setMutedRooms(updated);
                          localStorage.setItem('nexus_muted_rooms', JSON.stringify(updated));
                        }} 
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>
            <button className="action-btn" onClick={() => setShowSearch(!showSearch)}><Search size={18} /></button>
            <button className="action-btn" onClick={() => setShowGallery(true)} title="Media Gallery"><FolderOpen size={18} /></button>
            <button className="action-btn" onClick={() => setShowStats(true)} title="Room Activity"><Info size={18} /></button>
            <button className="action-btn" onClick={callUser} title="Video Call"><Video size={18} /></button>
          </div>
        </div>

        {/* Pinned Message Banner */}
        {pinnedMessage && (
          <div className="pinned-banner" onClick={scrollToPinnedMessage}>
            <div className="pinned-banner-icon"><Pin size={14} /></div>
            <div className="pinned-banner-content">
              <span className="pinned-banner-label">Pinned Message</span>
              <span className="pinned-banner-text">
                {pinnedMessage.is_deleted
                  ? '🚫 Deleted message'
                  : (pinnedMessage.file_url
                      ? '📎 Attachment'
                      : (pinnedMessage.text || '').substring(0, 80))}
              </span>
            </div>
            <div className="pinned-banner-arrow"><ChevronRight size={16} /></div>
            <button
              className="pinned-banner-unpin"
              title="Unpin"
              onClick={(e) => { e.stopPropagation(); handleUnpinMessage(); }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Active Call UI */}
        {(calling || callAccepted) && (
          <div className="video-call-container">
            <div className="video-grid">
              {stream && (
                <div className="video-wrapper">
                  <video playsInline muted ref={myVideo} autoPlay className="my-video" />
                  <span className="video-label">{username} (You)</span>
                </div>
              )}
              {callAccepted && (
                <div className="video-wrapper">
                  <video playsInline ref={userVideo} autoPlay className="user-video" />
                  <span className="video-label">Remote</span>
                </div>
              )}
            </div>
            <div className="call-controls">
              {calling && !callAccepted && <span className="text-muted" style={{ alignSelf: 'center' }}>Calling...</span>}
              <button className="btn-danger" onClick={leaveCall}><PhoneOff size={18} /> End Call</button>
            </div>
          </div>
        )}

        {/* Incoming Call Overlay */}
        {receivingCall && !callAccepted && (
          <div className="incoming-call-overlay">
            <div className="incoming-call-box">
              <h3><Phone size={24} className="pulse-animation text-primary" /> Incoming Call</h3>
              <p><strong>{caller}</strong> is calling you in this room.</p>
              <div className="incoming-actions">
                <button className="btn-success" onClick={answerCall}><Phone size={18} /> Answer</button>
                <button className="btn-danger" onClick={() => { setReceivingCall(false); socket.emit('end_call', { room: currentRoom }); }}><PhoneOff size={18} /> Decline</button>
              </div>
            </div>
          </div>
        )}

        <div className="messages-container chat-messages" onScroll={handleScroll}>
          {messages.map((msg, idx) => {
            const isMe = msg.username === username;
            const prevMsg = messages[idx - 1];

            const showDate = !prevMsg || formatDateLabel(msg.timestamp) !== formatDateLabel(prevMsg.timestamp);
            const isGrouped = !showDate && prevMsg && !prevMsg.is_deleted &&
              prevMsg.username === msg.username &&
              (new Date(msg.timestamp) - new Date(prevMsg.timestamp)) < 5 * 60 * 1000;

            if (msg.is_deleted) {
              return (
                <React.Fragment key={idx}>
                  {showDate && <div className="date-separator"><span>{formatDateLabel(msg.timestamp)}</span></div>}
                  <div className={`message-wrapper ${isMe ? 'me' : 'other'} ${isGrouped ? 'grouped' : ''}`}>
                    <div className="message-content"><div className="message-bubble deleted-bubble"><span className="deleted-text">🚫 This message was deleted</span></div></div>
                  </div>
                </React.Fragment>
              );
            }

            const displayedText = msg.text || '';
            const msgReactions = reactions[msg.id] || [];
            const reactionGroups = msgReactions.reduce((acc, r) => {
              if (!acc[r.emoji]) acc[r.emoji] = [];
              acc[r.emoji].push(r.username);
              return acc;
            }, {});
            const QUICK_EMOJIS = ['👍','❤️','😂','😮','😢','😡'];
            
            const urlMatch = displayedText ? displayedText.match(/(https?:\/\/[^\s]+)/) : null;
            const firstUrl = urlMatch ? urlMatch[0] : null;

            return (
              <React.Fragment key={idx}>
                {showDate && <div className="date-separator"><span>{formatDateLabel(msg.timestamp)}</span></div>}
                <div
                  id={`msg-${msg.id}`}
                  className={`message-wrapper ${isMe ? 'me' : 'other'} ${isGrouped ? 'grouped' : ''} ${msg.isNew ? 'slide-in-bottom' : ''} ${pinnedMessage?.id === msg.id ? 'is-pinned' : ''}`}
                  onMouseEnter={() => setHoveredMessageId(msg.id)}
                  onMouseLeave={() => setHoveredMessageId(null)}
                  onContextMenu={(e) => !msg.is_deleted && handleContextMenu(e, msg)}
                  onClick={() => {
                    if (window.innerWidth <= 768) {
                      setHoveredMessageId(hoveredMessageId === msg.id ? null : msg.id);
                    }
                  }}
                >
                  {!isMe && (
                    <div 
                      className="message-avatar" 
                      style={{ 
                        background: msg.username === 'Nexus Bot' ? 'linear-gradient(135deg, #1f2937, #111827)' : getGradient(msg.username), 
                        visibility: isGrouped ? 'hidden' : 'visible',
                        border: msg.username === 'Nexus Bot' ? '1px solid var(--primary-color)' : 'none'
                      }}
                    >
                      {msg.username === 'Nexus Bot' ? '🤖' : msg.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="message-content group">
                    {!isMe && !isGrouped && (
                      <span className="message-sender" style={msg.username === 'Nexus Bot' ? { background: 'var(--primary-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: 700 } : {}}>
                        {msg.username}
                      </span>
                    )}

                    <div className={`message-bubble-wrapper ${hoveredMessageId === msg.id ? 'force-hover' : ''}`}>
                      {isMe && !msg.file_url && (
                        <div className="message-actions">
                          <button className="action-btn" onClick={() => { setReplyingTo(msg); setEditingMessage(null); }}><CornerUpLeft size={14} /></button>
                          <button className="action-btn" onClick={() => { setEditingMessage(msg); setMessageInput(displayedText); setShowEmojiPicker(false); }}><Edit2 size={14} /></button>
                          <button className="action-btn text-danger" onClick={() => handleDelete(msg.id)}><Trash2 size={14} /></button>
                        </div>
                      )}
                      {!isMe && <div className="message-actions"><button className="action-btn" onClick={() => setReplyingTo(msg)}><CornerUpLeft size={14} /></button></div>}

                      <div className="bubble-with-reactions">
                        {hoveredMessageId === msg.id && (
                          <div className={`reaction-bar ${isMe ? 'reaction-bar-left' : 'reaction-bar-right'}`}>
                            {QUICK_EMOJIS.map(emoji => (
                              <button
                                key={emoji}
                                className="reaction-quick-btn"
                                onClick={() => toggleReaction(msg.id, emoji)}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                        <div className={`message-bubble ${isMe ? 'glass-primary' : 'glass-secondary'} ${isGrouped ? (isMe ? 'grouped-me' : 'grouped-other') : ''}`}>
                          {msg.reply_to_id && (
                            <div className="reply-preview" onClick={() => { const el = document.getElementById(`msg-${msg.reply_to_id}`); el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>
                              <span className="reply-preview-sender">{msg.reply_username || 'Unknown'}</span>
                              <span className="reply-preview-text">{msg.reply_file_url ? '📎 Attachment' : (msg.reply_text || '').substring(0, 80)}</span>
                            </div>
                          )}
                          {msg.file_url ? (
                            <div className="file-attachment">
                              {msg.file_type?.startsWith('audio/') ? (
                                <VoiceMessagePlayer url={msg.file_url} />
                              ) : msg.file_type?.startsWith('image/') ? (
                                <img src={msg.file_url} alt="attachment" className="attached-image" />
                              ) : (
                                <a href={msg.file_url} target="_blank" rel="noreferrer" className="attached-file-link"><Download size={18}/> Download</a>
                              )}
                            </div>
                          ) : (
                            <>{displayedText}{msg.is_edited ? <span className="edited-badge">(edited)</span> : null}</>
                          )}
                          {firstUrl && !msg.file_url && <LinkPreview url={firstUrl} apiUrl={API_URL} />}
                          {isMe && <span className="read-receipt">{msg.read_by?.length > 0 ? <CheckCheck size={14} /> : <Check size={14} />}</span>}
                        </div>

                        {Object.keys(reactionGroups).length > 0 && (
                          <div className="reactions-row">
                            {Object.entries(reactionGroups).map(([emoji, usernames]) => (
                              <button
                                key={emoji}
                                className={`reaction-pill ${usernames.includes(username) ? 'my-reaction' : ''}`}
                                onClick={() => toggleReaction(msg.id, emoji)}
                                title={usernames.join(', ')}
                              >
                                {emoji} {usernames.length}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className="message-time">
                    {new Date(msg.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </React.Fragment>
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
          {replyingTo && !editingMessage && (
            <div className="reply-banner">
              <CornerUpLeft size={14} />
              <span>Replying to <strong>{replyingTo.username}</strong>: {(replyingTo.text || '').substring(0, 60)}{replyingTo.file_url ? '📎' : ''}</span>
              <button className="cancel-edit-btn" onClick={() => setReplyingTo(null)}><X size={14}/></button>
            </div>
          )}

          {showEmojiPicker && <div className="emoji-picker-container"><EmojiPicker onEmojiClick={onEmojiClick} theme="dark" /></div>}

          {pendingFile && (
            <div className="pending-file-preview">
              <div className="preview-container">
                {filePreviewUrl ? (
                  <img src={filePreviewUrl} alt="preview" className="preview-image" />
                ) : (
                  <div className="file-icon-placeholder">
                    <Paperclip size={24} />
                    <span className="file-name">{pendingFile.name}</span>
                  </div>
                )}
                <button className="remove-file-btn" onClick={clearPendingFile} disabled={isUploading}>
                  <X size={14} />
                </button>
                {isUploading && (
                  <div className="upload-overlay">
                    <div className="spinner-small"></div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Recording Overlay */}
          {isRecording && (
            <div className="voice-recording-overlay">
              <button type="button" className="voice-action-btn voice-cancel" onClick={cancelRecording} title="Cancel">
                <X size={18} />
              </button>
              <div className="voice-recording-waves">
                {Array.from({ length: 14 }, (_, i) => (
                  <div key={i} className="rec-wave-bar" style={{ animationDelay: `${(i % 7) * 0.1}s` }} />
                ))}
              </div>
              <div className="voice-rec-info">
                <div className="voice-rec-dot" />
                <span className="voice-rec-time">{formatRecordingDuration(recordingDuration)}</span>
              </div>
              <button
                type="button"
                className="voice-action-btn voice-stop"
                onMouseUp={stopRecording}
                onTouchEnd={stopRecording}
                title="Stop recording"
              >
                <Square size={18} />
              </button>
            </div>
          )}

          {/* Voice Preview Bar */}
          {audioUrl && !isRecording && (
            <div className="voice-preview-bar">
              <button type="button" className="voice-action-btn voice-cancel" onClick={cancelRecording} title="Discard">
                <X size={16} />
              </button>
              <VoiceMessagePlayer url={audioUrl} knownDuration={recordingDuration} />
              <button
                type="button"
                className="voice-action-btn voice-send-btn"
                onClick={sendVoiceMessage}
                disabled={isUploading}
                title="Send voice message"
              >
                {isUploading ? <div className="spinner-small" /> : <Send size={16} />}
              </button>
            </div>
          )}

          {/* Normal Message Form */}
          {!isRecording && !audioUrl && (
          <form className="message-form" onSubmit={sendMessage}>
            <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
            <button type="button" className="action-icon-btn" onClick={() => fileInputRef.current.click()} disabled={isUploading}>
              <Paperclip size={20} />
            </button>
            <button type="button" className="action-icon-btn" onClick={() => setShowEmojiPicker(!showEmojiPicker)}><Smile size={20} /></button>
            <textarea
              ref={textareaRef}
              className="input-field message-input message-textarea"
              placeholder=""
              value={messageInput}
              onChange={handleTyping}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              rows={1}
            />
            {messageInput.trim() || pendingFile ? (
              <button type="submit" className="btn-primary send-btn" disabled={(!messageInput.trim() && !pendingFile) || isUploading}><Send size={20} /></button>
            ) : (
              <button
                type="button"
                className={`action-icon-btn mic-btn ${isRecording ? 'mic-recording' : ''}`}
                onClick={startRecording}
                title={isRecording ? 'Click to stop recording' : 'Click to start voice message'}
              >
                <Mic size={20} />
              </button>
            )}
          </form>
          )}
        </div>
      </div>

      {/* Profile Modal */}
      {showProfile && (
        <ProfileModal
          username={username}
          avatarUrl={myAvatarUrl}
          apiUrl={API_URL}
          onClose={() => setShowProfile(false)}
          onSave={(url) => {
            setMyAvatarUrl(url);
            localStorage.setItem('avatarUrl', url);
          }}
        />
      )}

      {/* Room Settings Modal */}
      {showRoomSettings && (
        <RoomSettingsModal
          room={showRoomSettings}
          roomName={roomDetails[showRoomSettings]}
          members={roomMembers[showRoomSettings] || []}
          onClose={() => setShowRoomSettings(null)}
          onLeave={leaveRoom}
          onRename={handleRenameRoom}
        />
      )}

      {/* File Gallery Modal */}
      {showGallery && (
        <FileGallery
          room={currentRoom}
          roomName={roomDetails[currentRoom] || currentRoom}
          apiUrl={API_URL}
          onClose={() => setShowGallery(false)}
        />
      )}

      {/* Room Stats Panel */}
      {showStats && (
        <RoomStats
          room={currentRoom}
          roomName={roomDetails[currentRoom] || currentRoom}
          apiUrl={API_URL}
          onClose={() => setShowStats(false)}
        />
      )}

      {/* Toasts Container */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className="toast glass-panel" onClick={() => joinRoom(socket, t.room)}>
            <div className="toast-header">
              <span className="toast-room">#{t.room}</span>
              <button className="toast-close" onClick={(e) => { e.stopPropagation(); setToasts(prev => prev.filter(x => x.id !== t.id)); }}><X size={14}/></button>
            </div>
            <div className="toast-body">
              <strong>{t.username}:</strong> {t.text?.substring(0, 30)}{t.text?.length > 30 ? '...' : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
