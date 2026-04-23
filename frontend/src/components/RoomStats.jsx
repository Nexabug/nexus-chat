import React, { useState, useEffect } from 'react';
import { X, MessageSquare, Users, Award, BarChart3, TrendingUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import './RoomStats.css';

const GRADIENTS = [
  ['#6c63ff','#9c63ff'], ['#f093fb','#f5576c'], ['#4facfe','#00f2fe'],
  ['#43e97b','#38f9d7'], ['#fa709a','#fee140'], ['#a18cd1','#fbc2eb'],
];

function getGradient(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const g = GRADIENTS[Math.abs(hash) % GRADIENTS.length];
  return `linear-gradient(135deg, ${g[0]}, ${g[1]})`;
}

export default function RoomStats({ room, roomName, apiUrl, onClose }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/rooms/${room}/stats`);
        const data = await res.json();
        setStats(data);
      } catch (err) {
        console.error('Failed to fetch stats:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [room, apiUrl]);

  if (loading) {
    return (
      <div className="room-stats-overlay">
        <div className="room-stats-panel">
          <div className="stats-header">
            <h2>Room Activity</h2>
            <button className="close-stats-btn" onClick={onClose}><X size={20} /></button>
          </div>
          <div className="stats-content">
            <div className="loading-spinner-container" style={{ display: 'flex', justifyContent: 'center', padding: '50px' }}>
              <div className="spinner-large"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="chart-tooltip" style={{ 
          background: 'rgba(23, 23, 33, 0.95)', 
          border: '1px solid rgba(255,255,255,0.1)', 
          padding: '10px', 
          borderRadius: '8px',
          backdropFilter: 'blur(10px)',
          fontSize: '0.85rem'
        }}>
          <p style={{ margin: 0, fontWeight: 600 }}>{payload[0].payload.label}</p>
          <p style={{ margin: 0, color: '#3b82f6' }}>{payload[0].value} messages</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="room-stats-overlay" onClick={onClose}>
      <div className="room-stats-panel" onClick={e => e.stopPropagation()}>
        <div className="stats-header">
          <div>
            <h2>{roomName}</h2>
            <p className="stat-label">Activity Dashboard</p>
          </div>
          <button className="close-stats-btn" onClick={onClose}><X size={20} /></button>
        </div>

        <div className="stats-content">
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon blue"><MessageSquare size={18} /></div>
              <div className="stat-value">{stats.messagesToday}</div>
              <div className="stat-label">Messages Today</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon purple"><Users size={18} /></div>
              <div className="stat-value">{stats.activeMembersToday}</div>
              <div className="stat-label">Active Members</div>
            </div>
          </div>

          <div className="chart-section">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <TrendingUp size={16} className="text-primary" />
              <h3 style={{ margin: 0 }}>Message Velocity (24h)</h3>
            </div>
            <div style={{ width: '100%', height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.hourlyActivity}>
                  <defs>
                    <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.8}/>
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.1}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis 
                    dataKey="label" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#71717a', fontSize: 10 }}
                    interval={3}
                  />
                  <YAxis hide />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {stats.hourlyActivity.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill="url(#barGradient)" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="chart-section">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Award size={16} className="text-orange" />
              <h3 style={{ margin: 0 }}>Top Contributors</h3>
            </div>
            <div className="active-members-list">
              {stats.topMembers.length === 0 ? (
                <div className="text-muted" style={{ textAlign: 'center', fontSize: '0.9rem', padding: '20px' }}>
                  No messages yet today.
                </div>
              ) : (
                stats.topMembers.map((m, i) => (
                  <div key={m.username} className="member-stat-item">
                    <div className="member-stat-avatar" style={{ background: getGradient(m.username) }}>
                      {m.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="member-stat-info">
                      <span className="member-stat-name">{m.username}</span>
                      <span className="member-stat-count">{m.count} messages</span>
                    </div>
                    {i === 0 && <TrendingUp size={14} style={{ color: '#10b981' }} />}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
