import React, { useState } from 'react';
import { X, Copy, Users, LogOut, Check, Save } from 'lucide-react';
import './RoomSettingsModal.css';

export default function RoomSettingsModal({ 
  room, 
  roomName, 
  members, 
  onClose, 
  onLeave, 
  onRename 
}) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [newName, setNewName] = useState(roomName || room);
  const [saving, setSaving] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(room);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRename = async () => {
    if (newName.trim() === '' || newName.trim() === (roomName || room)) {
      setIsEditing(false);
      return;
    }
    setSaving(true);
    await onRename(room, newName.trim());
    setSaving(false);
    setIsEditing(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content room-settings-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Room Settings</h2>
          <button className="close-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="modal-body">
          <div className="setting-group">
            <label>Room Name</label>
            {isEditing ? (
              <div className="rename-input-group">
                <input 
                  type="text" 
                  className="input-field"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleRename();
                    if (e.key === 'Escape') setIsEditing(false);
                  }}
                />
                <button className="btn-primary" onClick={handleRename} disabled={saving}>
                  {saving ? '...' : <Save size={16} />}
                </button>
              </div>
            ) : (
              <div className="room-name-display">
                <span className="room-name-text">{roomName || room}</span>
                <button className="btn-secondary small-btn" onClick={() => setIsEditing(true)}>Edit</button>
              </div>
            )}
          </div>

          <div className="setting-group">
            <label>Room ID</label>
            <div className="copy-field">
              <span className="id-text">{room}</span>
              <button className="copy-btn" onClick={handleCopy} title="Copy Room ID">
                {copied ? <Check size={16} className="text-green" /> : <Copy size={16} />}
              </button>
            </div>
            <p className="setting-hint">Share this ID to invite others to the room.</p>
          </div>

          <div className="setting-group">
            <label className="flex-between">
              <span><Users size={16} className="inline-icon" /> Members Online ({members.length})</span>
            </label>
            <div className="members-list">
              {members.length > 0 ? members.map((member, idx) => (
                <div key={idx} className="member-item">
                  <div className="member-avatar">
                    {member.charAt(0).toUpperCase()}
                  </div>
                  <span>{member}</span>
                </div>
              )) : (
                <div className="no-members">No one is here right now.</div>
              )}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-danger leave-room-btn" onClick={() => onLeave(room)}>
            <LogOut size={18} /> Leave Room
          </button>
        </div>
      </div>
    </div>
  );
}
