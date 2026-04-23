import React, { useState, useEffect } from 'react';
import './Toast.css';

let toastId = 0;
let addToastFn = null;

export function showToast(message, type = 'info', duration = 4000) {
  if (addToastFn) addToastFn({ id: ++toastId, message, type, duration });
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    addToastFn = (toast) => {
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, toast.duration);
    };
    return () => { addToastFn = null; };
  }, []);

  const dismiss = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.type}`} onClick={() => dismiss(toast.id)}>
          <span className="toast-icon">
            {toast.type === 'success' && '✓'}
            {toast.type === 'error' && '✕'}
            {toast.type === 'info' && '💬'}
            {toast.type === 'warning' && '⚠'}
          </span>
          <span className="toast-message">{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
