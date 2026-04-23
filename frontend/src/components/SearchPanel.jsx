import React, { useState, useEffect, useRef } from 'react';
import { Search, X, ArrowRight } from 'lucide-react';
import './SearchPanel.css';

export default function SearchPanel({ room, apiUrl, onClose, onJumpToMessage }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query.length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`${apiUrl}/api/messages/${encodeURIComponent(room)}/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (Array.isArray(data)) setResults(data);
        else setResults([]);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }, 400);
  }, [query, room, apiUrl]);

  const highlight = (text, q) => {
    if (!q || !text) return text;
    const parts = text.split(new RegExp(`(${q})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === q.toLowerCase()
        ? <mark key={i} className="search-highlight">{part}</mark>
        : part
    );
  };

  return (
    <div className="search-panel">
      <div className="search-panel-header">
        <Search size={18} className="search-icon-lead" />
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder="Search messages in this room..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="search-close-btn" onClick={onClose}><X size={18} /></button>
      </div>

      <div className="search-results">
        {loading && (
          <div className="search-status">
            <div className="search-spinner" />
            <span>Searching...</span>
          </div>
        )}
        {!loading && query.length >= 2 && results.length === 0 && (
          <div className="search-status">No messages found for "<strong>{query}</strong>"</div>
        )}
        {!loading && results.length > 0 && (
          <>
            <p className="search-count">{results.length} result{results.length !== 1 ? 's' : ''} found</p>
            {results.map((msg) => (
              <div key={msg.id} className="search-result-item" onClick={() => { onJumpToMessage(msg.id); onClose(); }}>
                <div className="search-result-meta">
                  <span className="search-result-sender">{msg.username}</span>
                  <span className="search-result-time">{new Date(msg.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                </div>
                <p className="search-result-text">{highlight(msg.text, query)}</p>
                <ArrowRight size={14} className="search-result-arrow" />
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
