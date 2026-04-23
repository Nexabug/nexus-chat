import React, { useState, useRef } from 'react';
import { X, Camera, User, Upload, Palette } from 'lucide-react';
import './ProfileModal.css';

// Deterministic gradient per username
export function getAvatarGradient(username) {
  const gradients = [
    'linear-gradient(135deg, #667eea, #764ba2)',
    'linear-gradient(135deg, #f093fb, #f5576c)',
    'linear-gradient(135deg, #4facfe, #00f2fe)',
    'linear-gradient(135deg, #43e97b, #38f9d7)',
    'linear-gradient(135deg, #fa709a, #fee140)',
    'linear-gradient(135deg, #a18cd1, #fbc2eb)',
    'linear-gradient(135deg, #fccb90, #d57eeb)',
    'linear-gradient(135deg, #e0c3fc, #8ec5fc)',
    'linear-gradient(135deg, #f6d365, #fda085)',
    'linear-gradient(135deg, #96fbc4, #f9f586)',
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = username.charCodeAt(i) + ((hash << 5) - hash);
  return gradients[Math.abs(hash) % gradients.length];
}

export function Avatar({ username, avatarUrl, size = 40, className = '' }) {
  const style = {
    width: size,
    height: size,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    fontSize: size * 0.4,
    flexShrink: 0,
    background: avatarUrl ? 'transparent' : getAvatarGradient(username || 'user'),
    overflow: 'hidden',
  };

  if (avatarUrl) {
    return (
      <div style={style} className={className}>
        <img src={avatarUrl} alt={username} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }

  return (
    <div style={style} className={className}>
      {(username || '?').charAt(0).toUpperCase()}
    </div>
  );
}

export default function ProfileModal({ username, avatarUrl, onClose, onSave, apiUrl }) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(avatarUrl);
  const [currentTheme, setCurrentTheme] = useState(localStorage.getItem('theme') || 'theme-deep-space');
  const fileRef = useRef();

  const handleThemeChange = (newTheme) => {
    setCurrentTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.body.className = newTheme;
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${apiUrl}/api/upload`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.fileUrl) setPreview(data.fileUrl);
    } catch (err) {
      console.error('Upload failed', err);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    const token = localStorage.getItem('token');
    try {
      await fetch(`${apiUrl}/api/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ avatarUrl: preview }),
      });
      onSave(preview);
      onClose();
    } catch (err) {
      console.error('Profile save failed', err);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card profile-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3><User size={18} /> Edit Profile</h3>
          <button className="modal-close-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="profile-avatar-section">
          <div className="profile-avatar-wrapper">
            <Avatar username={username} avatarUrl={preview} size={96} />
            <button
              className="avatar-upload-btn"
              onClick={() => fileRef.current.click()}
              disabled={uploading}
            >
              {uploading ? <div className="spinner-small" /> : <Camera size={16} />}
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
          <p className="profile-username">{username}</p>
          <p className="profile-hint">Click the camera icon to change your avatar</p>
        </div>

        <div className="theme-selection-section">
          <h4><Palette size={16} /> Theme</h4>
          <div className="theme-options">
            <button 
              className={`theme-btn ${currentTheme === 'theme-deep-space' ? 'active' : ''}`}
              onClick={() => handleThemeChange('theme-deep-space')}
              title="Deep Space"
            >
              <div className="theme-color-preview" style={{ background: '#0f172a', borderColor: '#8b5cf6' }}></div>
            </button>
            <button 
              className={`theme-btn ${currentTheme === 'theme-arctic' ? 'active' : ''}`}
              onClick={() => handleThemeChange('theme-arctic')}
              title="Arctic"
            >
              <div className="theme-color-preview" style={{ background: '#f8fafc', borderColor: '#3b82f6' }}></div>
            </button>
            <button 
              className={`theme-btn ${currentTheme === 'theme-midnight-neon' ? 'active' : ''}`}
              onClick={() => handleThemeChange('theme-midnight-neon')}
              title="Midnight Neon"
            >
              <div className="theme-color-preview" style={{ background: '#09090b', borderColor: '#22c55e' }}></div>
            </button>
            <button 
              className={`theme-btn ${currentTheme === 'theme-sunset' ? 'active' : ''}`}
              onClick={() => handleThemeChange('theme-sunset')}
              title="Sunset"
            >
              <div className="theme-color-preview" style={{ background: '#2a1525', borderColor: '#f97316' }}></div>
            </button>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={uploading}>
            <Upload size={16} /> Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
