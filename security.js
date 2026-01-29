/**
 * Security Module for CEAC Visa Application Form Filler
 * Implements encryption, validation, and audit logging
 */

const crypto = require('crypto');

// Security Configuration
const SECURITY_CONFIG = {
  encryption: {
    algorithm: 'aes-256-cbc',
    keyLength: 32,
    ivLength: 16,
    saltLength: 16
  },
  session: {
    maxAge: 30 * 60 * 1000, // 30 minutes
    checkInterval: 5 * 60 * 1000 // 5 minutes
  },
  rateLimit: {
    maxAttempts: 10,
    timeWindow: 60 * 1000 // 1 minute
  }
};

// Encryption Key (should be loaded from secure storage in production)
let encryptionKey = null;

/**
 * Initialize encryption key
 */
function initializeEncryption(key) {
  if (!key || key.length !== 32) {
    // Generate a default key for demo (DO NOT use in production)
    encryptionKey = crypto.scryptSync('ceac-visa-app-key', 'salt', 32);
    console.warn('Using default encryption key - NOT SECURE for production!');
  } else {
    encryptionKey = key;
  }
}

/**
 * Encrypt sensitive data
 */
function encryptData(data) {
  if (!encryptionKey) {
    initializeEncryption();
  }

  try {
    const iv = crypto.randomBytes(SECURITY_CONFIG.encryption.ivLength);
    const cipher = crypto.createCipheriv(
      SECURITY_CONFIG.encryption.algorithm,
      encryptionKey,
      iv
    );

    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return {
      encrypted: encrypted,
      iv: iv.toString('hex'),
      timestamp: Date.now()
    };
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt sensitive data
 */
function decryptData(encryptedData) {
  if (!encryptionKey) {
    initializeEncryption();
  }

  try {
    const decipher = crypto.createDecipheriv(
      SECURITY_CONFIG.encryption.algorithm,
      encryptionKey,
      Buffer.from(encryptedData.iv, 'hex')
    );

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Validate form data before submission
 */
function validateFormData(data) {
  const errors = [];

  // Country field validation
  if (data.country) {
    if (typeof data.country !== 'string') {
      errors.push('Country must be a string');
    } else if (data.country.length > 100) {
      errors.push('Country value exceeds maximum length');
    }
  }

  // CAPTCHA field validation
  if (data.captcha) {
    if (typeof data.captcha !== 'string') {
      errors.push('CAPTCHA must be a string');
    } else if (data.captcha.length > 10) {
      errors.push('CAPTCHA value exceeds maximum length');
    } else if (!/^[a-zA-Z0-9]+$/.test(data.captcha)) {
      errors.push('CAPTCHA contains invalid characters');
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors: errors
    };
  }

  return {
    valid: true,
    errors: []
  };
}

/**
 * Session Management
 */
class SessionManager {
  constructor() {
    this.sessions = new Map();
  }

  createSession(sessionId) {
    const session = {
      id: sessionId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      accessLog: [],
      dataAccessCount: 0
    };
    this.sessions.set(sessionId, session);
    console.log(`✅ Session created: ${sessionId}`);
    return session;
  }

  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.warn(`Session not found: ${sessionId}`);
      return null;
    }

    // Check if session expired
    if (Date.now() - session.createdAt > SECURITY_CONFIG.session.maxAge) {
      console.warn(`Session expired: ${sessionId}`);
      this.sessions.delete(sessionId);
      return null;
    }

    session.lastActivity = Date.now();
    return session;
  }

  logAccess(sessionId, action, details) {
    const session = this.getSession(sessionId);
    if (!session) return;

    session.accessLog.push({
      timestamp: Date.now(),
      action: action,
      details: details
    });

    if (action === 'data-access') {
      session.dataAccessCount++;
    }

  }

  destroySession(sessionId) {
    this.sessions.delete(sessionId);
  }

  cleanupExpiredSessions() {
    for (const [sessionId, session] of this.sessions) {
      if (Date.now() - session.createdAt > SECURITY_CONFIG.session.maxAge) {
        this.destroySession(sessionId);
      }
    }
  }
}

/**
 * Rate Limiter
 */
class RateLimiter {
  constructor() {
    this.attempts = new Map();
  }

  checkLimit(key) {
    const now = Date.now();
    let record = this.attempts.get(key);

    if (!record || now - record.windowStart > SECURITY_CONFIG.rateLimit.timeWindow) {
      // New window
      record = {
        count: 0,
        windowStart: now
      };
    }

    record.count++;

    if (record.count > SECURITY_CONFIG.rateLimit.maxAttempts) {
      console.warn(`Rate limit exceeded for key: ${key}`);
      return false;
    }

    this.attempts.set(key, record);
    return true;
  }

  reset(key) {
    this.attempts.delete(key);
  }
}

/**
 * Audit Logger
 */
class AuditLogger {
  constructor() {
    this.logs = [];
  }

  log(event) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      ...event
    };
    this.logs.push(logEntry);
  }

  getLogs() {
    return this.logs;
  }

  clearLogs() {
    this.logs = [];
  }
}

// Export instances
module.exports = {
  SECURITY_CONFIG,
  initializeEncryption,
  encryptData,
  decryptData,
  validateFormData,
  SessionManager,
  RateLimiter,
  AuditLogger
};
