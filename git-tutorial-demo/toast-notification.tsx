import React, { useEffect } from 'react';

/**
 * Toast Notification Component
 * Renders an auto-dismissing banner for user actions (success, error, info).
 */

export interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  durationMs?: number;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
}

export const ToastNotification: React.FC<ToastProps> = ({
  message,
  type = 'info',
  durationMs = 4000,
  actionLabel,
  onAction,
  onDismiss,
}) => {
  useEffect(() => {
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, onDismiss]);

  const bgColors = {
    success: '#10b981',
    error: '#ef4444',
    info: '#3b82f6',
    warning: '#f59e0b',
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        backgroundColor: bgColors[type],
        color: '#ffffff',
        padding: '12px 20px',
        borderRadius: '8px',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        zIndex: 9999,
        fontWeight: 500,
      }}
      role="alert"
    >
      <span>{message}</span>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          style={{
            background: 'rgba(255, 255, 255, 0.25)',
            border: 'none',
            color: '#ffffff',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
        >
          {actionLabel}
        </button>
      )}
      <button
        onClick={onDismiss}
        style={{
          background: 'none',
          border: 'none',
          color: '#ffffff',
          fontWeight: 'bold',
          fontSize: '1.25rem',
          lineHeight: 1,
          cursor: 'pointer',
          padding: '0 4px',
        }}
        aria-label="Dismiss notification"
      >
        &times;
      </button>
    </div>
  );
};

