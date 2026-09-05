import React, { useEffect } from 'react';

/**
 * Accessible Modal Dialog Component
 * Supports keyboard ESC dismissal and backdrop click handling.
 */

export interface ModalDialogProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footerActions?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'full';
  closeOnBackdrop?: boolean;
}

const modalWidths = {
  sm: '380px',
  md: '520px',
  lg: '760px',
  full: '95vw',
};

export const ModalDialog: React.FC<ModalDialogProps> = ({
  isOpen,
  title,
  onClose,
  children,
  footerActions,
  size = 'md',
  closeOnBackdrop = true,
}) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(2px)',
      }}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: modalWidths[size],
          width: '90%',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>{title}</h3>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1.5rem',
              lineHeight: 1,
              color: '#6b7280',
            }}
            aria-label="Close dialog"
          >
            &times;
          </button>
        </div>
        <div style={{ color: '#374151', fontSize: '0.95rem' }}>{children}</div>
        {footerActions && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '8px',
              marginTop: '24px',
              paddingTop: '16px',
              borderTop: '1px solid #e5e7eb',
            }}
          >
            {footerActions}
          </div>
        )}
      </div>
    </div>
  );
};

