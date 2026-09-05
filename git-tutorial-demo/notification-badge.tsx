import React from 'react';

/**
 * Notification Badge Component
 * Demonstrates component additions and styling updates in a Git workflow.
 */

export interface NotificationBadgeProps {
  count: number;
  maxCount?: number;
  showPulse?: boolean;
  variant?: 'danger' | 'primary' | 'warning' | 'success';
  size?: 'sm' | 'md' | 'lg';
}

const variantColors = {
  danger: '#ef4444',
  primary: '#3b82f6',
  warning: '#f59e0b',
  success: '#10b981',
};

const sizeStyles = {
  sm: { fontSize: '10px', padding: '1px 5px' },
  md: { fontSize: '11px', padding: '2px 6px' },
  lg: { fontSize: '12px', padding: '3px 8px' },
};

export const NotificationBadge: React.FC<NotificationBadgeProps> = ({
  count,
  maxCount = 99,
  showPulse = false,
  variant = 'danger',
  size = 'md',
}) => {
  if (count <= 0) return null;

  const displayCount = count > maxCount ? `${maxCount}+` : count;
  const currentSize = sizeStyles[size] || sizeStyles.md;
  const color = variantColors[variant] || variantColors.danger;

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <span
        style={{
          backgroundColor: color,
          color: '#ffffff',
          borderRadius: '9999px',
          fontWeight: 'bold',
          lineHeight: '1',
          boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
          ...currentSize,
        }}
        aria-label={`${count} notifications`}
      >
        {displayCount}
      </span>
      {showPulse && (
        <span
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            borderRadius: '9999px',
            animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
            backgroundColor: `${color}99`,
          }}
        />
      )}
    </div>
  );
};

