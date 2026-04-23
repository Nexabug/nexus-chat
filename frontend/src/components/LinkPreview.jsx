import React, { useState, useEffect } from 'react';
import './LinkPreview.css';

export default function LinkPreview({ url, apiUrl }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchPreview = async () => {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch(`${apiUrl}/api/link-preview?url=${encodeURIComponent(url)}`);
        if (!res.ok) throw new Error('Failed to fetch preview');
        const previewData = await res.json();
        
        // If we don't have at least a title, we don't really have a preview
        if (!previewData.title) {
          throw new Error('Insufficient preview data');
        }

        if (isMounted) {
          setData(previewData);
        }
      } catch (err) {
        if (isMounted) {
          setError(true);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchPreview();
    return () => { isMounted = false; };
  }, [url, apiUrl]);

  if (error) return null; // Fallback to normal text only if we fail to fetch preview

  if (loading) {
    return (
      <div className="link-preview-container skeleton">
        <div className="skeleton-image"></div>
        <div className="skeleton-content">
          <div className="skeleton-text title"></div>
          <div className="skeleton-text desc"></div>
          <div className="skeleton-text site"></div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="link-preview-container">
      {data.image && (
        <div className="link-preview-image">
          <img src={data.image} alt={data.title || "Link preview"} />
        </div>
      )}
      <div className="link-preview-content">
        <div className="link-preview-site">
          {data.favicon && <img src={data.favicon} alt="favicon" className="link-preview-favicon" />}
          <span>{data.siteName || new URL(url).hostname}</span>
        </div>
        <h4 className="link-preview-title">{data.title}</h4>
        {data.description && <p className="link-preview-description">{data.description}</p>}
      </div>
    </a>
  );
}
