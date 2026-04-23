import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Download, Image, Film, FileText, Layers, ChevronLeft, ChevronRight, ZoomIn, ExternalLink, FolderOpen } from 'lucide-react';
import './FileGallery.css';

const FILTERS = [
  { key: 'all',      label: 'All',       icon: Layers },
  { key: 'image',    label: 'Images',    icon: Image },
  { key: 'video',    label: 'Videos',    icon: Film },
  { key: 'document', label: 'Docs',      icon: FileText },
];

function getFileLabel(file_type = '') {
  if (file_type.startsWith('image/')) return file_type.replace('image/', '').toUpperCase();
  if (file_type.startsWith('video/')) return file_type.replace('video/', '').toUpperCase();
  const parts = file_type.split('/');
  return (parts[1] || parts[0] || 'FILE').toUpperCase().substring(0, 8);
}

export default function FileGallery({ room, roomName, apiUrl, onClose }) {
  const [activeFilter, setActiveFilter] = useState('all');
  const [mediaItems, setMediaItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lightboxIdx, setLightboxIdx] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const lightboxRef = useRef(null);

  const fetchMedia = useCallback(async (filter) => {
    setLoading(true);
    try {
      const url = filter === 'all'
        ? `${apiUrl}/api/rooms/${room}/media`
        : `${apiUrl}/api/rooms/${room}/media?type=${filter}`;
      const res = await fetch(url);
      const data = await res.json();
      setMediaItems(Array.isArray(data) ? data : []);
    } catch {
      setMediaItems([]);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, room]);

  useEffect(() => {
    fetchMedia(activeFilter);
  }, [activeFilter, fetchMedia]);

  // Keyboard navigation for lightbox
  useEffect(() => {
    const handler = (e) => {
      if (lightboxIdx === null) return;
      if (e.key === 'Escape') setLightboxIdx(null);
      if (e.key === 'ArrowRight') setLightboxIdx(i => Math.min(i + 1, mediaItems.length - 1));
      if (e.key === 'ArrowLeft') setLightboxIdx(i => Math.max(i - 1, 0));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightboxIdx, mediaItems.length]);

  const handleDownloadAll = async () => {
    if (mediaItems.length === 0 || downloading) return;
    setDownloading(true);
    for (const item of mediaItems) {
      try {
        const res = await fetch(item.file_url);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = item.file_url.split('/').pop() || 'file';
        a.click();
        URL.revokeObjectURL(blobUrl);
        await new Promise(r => setTimeout(r, 350)); // stagger downloads
      } catch {}
    }
    setDownloading(false);
  };

  const lightboxItem = lightboxIdx !== null ? mediaItems[lightboxIdx] : null;

  return (
    <div className="gallery-overlay" onClick={onClose}>
      <div className="gallery-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="gallery-header">
          <div className="gallery-title">
            <FolderOpen size={20} className="gallery-title-icon" />
            <div>
              <h2>Media Gallery</h2>
              <span className="gallery-subtitle">{roomName || room}</span>
            </div>
          </div>
          <div className="gallery-header-actions">
            <button
              className="gallery-download-all"
              onClick={handleDownloadAll}
              disabled={mediaItems.length === 0 || downloading}
              title="Download all files"
            >
              <Download size={16} />
              {downloading ? 'Downloading…' : `Download All (${mediaItems.length})`}
            </button>
            <button className="gallery-close-btn" onClick={onClose} title="Close">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="gallery-filters">
          {FILTERS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              className={`gallery-filter-btn ${activeFilter === key ? 'active' : ''}`}
              onClick={() => setActiveFilter(key)}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="gallery-body">
          {loading ? (
            <div className="gallery-loading">
              <div className="gallery-spinner" />
              <span>Loading media…</span>
            </div>
          ) : mediaItems.length === 0 ? (
            <div className="gallery-empty">
              <FolderOpen size={48} className="gallery-empty-icon" />
              <h3>No files here yet</h3>
              <p>Files shared in this room will appear here.</p>
            </div>
          ) : (
            <div className="gallery-grid">
              {mediaItems.map((item, idx) => (
                <GalleryCard
                  key={item.id}
                  item={item}
                  onClick={() => setLightboxIdx(idx)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxItem && (
        <div
          className="lightbox-overlay"
          onClick={() => setLightboxIdx(null)}
          ref={lightboxRef}
        >
          <div className="lightbox-content" onClick={e => e.stopPropagation()}>
            {/* Nav arrows */}
            <button
              className="lightbox-nav prev"
              onClick={() => setLightboxIdx(i => Math.max(i - 1, 0))}
              disabled={lightboxIdx === 0}
            >
              <ChevronLeft size={28} />
            </button>

            <div className="lightbox-media-wrapper">
              {lightboxItem.file_type?.startsWith('image/') ? (
                <img src={lightboxItem.file_url} alt="media" className="lightbox-image" />
              ) : lightboxItem.file_type?.startsWith('video/') ? (
                <video src={lightboxItem.file_url} controls className="lightbox-video" />
              ) : (
                <div className="lightbox-doc">
                  <FileText size={64} className="lightbox-doc-icon" />
                  <p className="lightbox-doc-name">{lightboxItem.file_url.split('/').pop()}</p>
                  <a
                    href={lightboxItem.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="lightbox-open-link"
                  >
                    <ExternalLink size={16} /> Open File
                  </a>
                </div>
              )}
            </div>

            <button
              className="lightbox-nav next"
              onClick={() => setLightboxIdx(i => Math.min(i + 1, mediaItems.length - 1))}
              disabled={lightboxIdx === mediaItems.length - 1}
            >
              <ChevronRight size={28} />
            </button>
          </div>

          {/* Lightbox info bar */}
          <div className="lightbox-info-bar" onClick={e => e.stopPropagation()}>
            <div className="lightbox-meta">
              <span className="lightbox-sender">Shared by <strong>{lightboxItem.username}</strong></span>
              <span className="lightbox-date">
                {new Date(lightboxItem.timestamp).toLocaleDateString(undefined, {
                  month: 'short', day: 'numeric', year: 'numeric',
                  hour: '2-digit', minute: '2-digit'
                })}
              </span>
            </div>
            <div className="lightbox-actions">
              <span className="lightbox-counter">{lightboxIdx + 1} / {mediaItems.length}</span>
              <a
                href={lightboxItem.file_url}
                download
                className="lightbox-download-btn"
                title="Download"
              >
                <Download size={18} />
              </a>
              <a
                href={lightboxItem.file_url}
                target="_blank"
                rel="noreferrer"
                className="lightbox-download-btn"
                title="Open in new tab"
              >
                <ExternalLink size={18} />
              </a>
            </div>
            <button className="lightbox-close-btn" onClick={() => setLightboxIdx(null)}>
              <X size={22} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function GalleryCard({ item, onClick }) {
  const isImage = item.file_type?.startsWith('image/');
  const isVideo = item.file_type?.startsWith('video/');
  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <div className="gallery-card" onClick={onClick}>
      {isImage ? (
        <>
          {!imgLoaded && <div className="gallery-card-skeleton" />}
          <img
            src={item.file_url}
            alt=""
            className={`gallery-card-img ${imgLoaded ? 'loaded' : ''}`}
            onLoad={() => setImgLoaded(true)}
          />
          <div className="gallery-card-overlay">
            <ZoomIn size={20} />
          </div>
        </>
      ) : isVideo ? (
        <>
          <video src={item.file_url} className="gallery-card-img" muted />
          <div className="gallery-card-overlay video-overlay">
            <Film size={22} />
          </div>
          <div className="gallery-card-type-badge video">VIDEO</div>
        </>
      ) : (
        <div className="gallery-card-doc">
          <FileText size={32} className="gallery-card-doc-icon" />
          <span className="gallery-card-doc-type">{getFileLabel(item.file_type)}</span>
          <div className="gallery-card-overlay">
            <ZoomIn size={20} />
          </div>
        </div>
      )}
      <div className="gallery-card-footer">
        <span className="gallery-card-sender">{item.username}</span>
        <span className="gallery-card-date">
          {new Date(item.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
      </div>
    </div>
  );
}
