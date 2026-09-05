/**
 * Authentication Input Validation Helper
 * Used to demonstrate git branch merges and conflict resolution.
 */

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export function validateEmail(email: string): ValidationResult {
  const errors: string[] = [];
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!email || email.trim() === '') {
    errors.push('Email is required.');
  } else if (!emailRegex.test(email)) {
    errors.push('Please enter a valid email address.');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function validatePassword(password: string): ValidationResult {
  const errors: string[] = [];

  if (!password || password.length < 8) {
    errors.push('Password must be at least 8 characters long.');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter.');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number.');
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    errors.push('Password must contain at least one special character.');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function validateUsername(username: string): ValidationResult {
  const errors: string[] = [];
  const usernameRegex = /^[a-zA-Z0-9_-]{3,20}$/;

  if (!username || username.trim() === '') {
    errors.push('Username is required.');
  } else if (!usernameRegex.test(username)) {
    errors.push('Username must be 3-20 characters long and contain only letters, numbers, underscores, or hyphens.');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function validateUrl(url: string): ValidationResult {
  const errors: string[] = [];

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      errors.push('URL must use http or https protocol.');
    }
  } catch {
    errors.push('Please enter a valid URL.');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function validatePhoneNumber(phone: string): ValidationResult {
  const errors: string[] = [];
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;

  if (!phone || phone.trim() === '') {
    errors.push('Phone number is required.');
  } else if (!phoneRegex.test(phone.replace(/[\s()-]/g, ''))) {
    errors.push('Please enter a valid E.164 phone number.');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}


