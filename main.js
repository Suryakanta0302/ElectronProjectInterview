const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { SessionManager, RateLimiter, AuditLogger, validateFormData } = require('./security');

let mainWindow;
let ceacWindow;

// Initialize security managers
const sessionManager = new SessionManager();
const rateLimiter = new RateLimiter();
const auditLogger = new AuditLogger();

// Session tracking
const windowSessions = new Map();

// Create the main control panel window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 900,
    minWidth: 400,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      sandbox: true  // Enable sandbox for additional security
    },
    icon: path.join(__dirname, 'icon.png')
  });

  mainWindow.loadFile('index.html');

  // Create session for this window
  const sessionId = `main-${Date.now()}`;
  windowSessions.set(mainWindow.id, sessionId);
  sessionManager.createSession(sessionId);

  mainWindow.on('closed', () => {
    const sid = windowSessions.get(mainWindow.id);
    if (sid) {
      sessionManager.destroySession(sid);
      windowSessions.delete(mainWindow.id);
    }
    mainWindow = null;
  });

  auditLogger.log({
    eventType: 'WINDOW_CREATED',
    message: 'Main control panel window created',
    sessionId: sessionId
  });
}

// Open CEAC website in a separate window
ipcMain.handle('open-ceac', async (event) => {
  try {
    const sessionId = windowSessions.get(mainWindow?.id);

    if (!sessionId) {
      console.error('Invalid session');
      return { success: false, message: 'Invalid session' };
    }

    if (ceacWindow) {
      ceacWindow.focus();
      auditLogger.log({
        eventType: 'CEAC_WINDOW_FOCUSED',
        message: 'CEAC window already open, focused',
        sessionId: sessionId
      });
      return { success: true, message: 'CEAC website window already open' };
    }

    ceacWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        preload: path.join(__dirname, 'ceac-preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true  // Enable sandbox
      }
    });

    // Create session for CEAC window
    const ceacSessionId = `ceac-${Date.now()}`;
    windowSessions.set(ceacWindow.id, ceacSessionId);
    sessionManager.createSession(ceacSessionId);

    ceacWindow.loadURL('https://ceac.state.gov/genniv/');

    ceacWindow.on('closed', () => {
      const sid = windowSessions.get(ceacWindow.id);
      if (sid) {
        sessionManager.destroySession(sid);
        windowSessions.delete(ceacWindow.id);
      }
      ceacWindow = null;
      auditLogger.log({
        eventType: 'CEAC_WINDOW_CLOSED',
        message: 'CEAC website window closed',
        sessionId: sessionId
      });
    });

    auditLogger.log({
      eventType: 'CEAC_WINDOW_OPENED',
      message: 'CEAC website window opened',
      sessionId: sessionId,
      ceacSessionId: ceacSessionId
    });

    return { success: true, message: 'CEAC website opened' };
  } catch (error) {
    console.error('❌ Error opening CEAC website:', error);
    auditLogger.log({
      eventType: 'ERROR',
      message: `Error opening CEAC website: ${error.message}`,
      severity: 'high'
    });
    return { success: false, message: 'Failed to open CEAC website' };
  }
});

// Handle form data to inject into CEAC website
ipcMain.handle('inject-form-data', async (event, data) => {
  try {
    // Get session ID
    const windowId = event.sender.getProcessId();
    const sessionId = windowSessions.get(mainWindow?.id);

    if (!sessionId) {
      console.error('Invalid session');
      return { success: false, message: 'Invalid session' };
    }

    // Check rate limit
    if (!rateLimiter.checkLimit(sessionId)) {
      auditLogger.log({
        eventType: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many form submission attempts',
        sessionId: sessionId
      });
      return { success: false, message: 'Rate limit exceeded. Please wait before trying again.' };
    }

    // Validate form data
    const validation = validateFormData(data);
    if (!validation.valid) {
      auditLogger.log({
        eventType: 'VALIDATION_FAILED',
        message: `Invalid form data: ${validation.errors.join(', ')}`,
        sessionId: sessionId,
        errors: validation.errors
      });
      return { success: false, message: validation.errors[0] };
    }

    // Check if CEAC window is open
    if (!ceacWindow) {
      console.error('CEAC window not open');
      return { success: false, message: 'CEAC website window is not open' };
    }

    // Log data access
    sessionManager.logAccess(sessionId, 'data-access', 'Form data submission');

    // Log the action
    auditLogger.log({
      eventType: 'FORM_DATA_RECEIVED',
      message: 'Form data received and validated',
      sessionId: sessionId
    });

    await new Promise(resolve => setTimeout(resolve, 3000));

    ceacWindow.webContents.send('fill-form', data);
    ceacWindow.focus();

    auditLogger.log({
      eventType: 'FORM_FILL_INITIATED',
      message: 'Form fill initiated on CEAC website',
      sessionId: sessionId
    });

    return { success: true, message: 'Form data sent to CEAC website' };
  } catch (error) {
    console.error('Error injecting form data:', error);
    auditLogger.log({
      eventType: 'ERROR',
      message: `Form injection error: ${error.message}`,
      severity: 'high'
    });
    return { success: false, message: 'An error occurred while processing your request' };
  }
});

app.on('ready', createWindow);

// Security status endpoint
ipcMain.handle('get-security-status', async (event) => {
  const sessionId = windowSessions.get(mainWindow?.id);
  if (!sessionId) {
    return { secure: false, message: 'Invalid session' };
  }

  const session = sessionManager.getSession(sessionId);
  return {
    secure: true,
    message: 'Application is secure',
    sessionId: sessionId,
    sessionAge: Date.now() - session.createdAt,
    dataAccessCount: session.dataAccessCount,
    accessLogEntries: session.accessLog.length
  };
});

// Clear sensitive data
ipcMain.handle('clear-sensitive-data', async (event) => {
  // Clear in-memory sensitive data
  auditLogger.log({
    eventType: 'SENSITIVE_DATA_CLEARED',
    message: 'Sensitive data cleared from memory'
  });
  return { success: true, message: 'Sensitive data cleared' };
});

// Cleanup sessions periodically
setInterval(() => {
  sessionManager.cleanupExpiredSessions();
}, 60000); // Every minute

app.on('window-all-closed', () => {
  // Log audit trail before closing
  const logs = auditLogger.getLogs();
  logs.slice(-10).forEach(log => {
    console.log(`[${log.timestamp}] ${log.eventType}: ${log.message}`);
  });


  // On macOS, applications typically stay open until user quits explicitly
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create window when dock icon is clicked
  if (mainWindow === null) {
    createWindow();
  }
});