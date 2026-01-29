const { contextBridge, ipcRenderer } = require('electron');

// Expose safe API to renderer process with security checks
contextBridge.exposeInMainWorld('electronAPI', {
  // Send form data to main process for injection (with validation)
  sendFormData: async (data) => {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid data format');
    }
    return ipcRenderer.invoke('inject-form-data', data);
  },
  
  // Open CEAC website (with security checks)
  openCEAC: async () => {
    return ipcRenderer.invoke('open-ceac');
  },
  
  // Listen for form filling from main process
  onFillForm: (callback) => {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
    return ipcRenderer.on('fill-form', (event, data) => {
      // Validate data before passing to callback
      if (data && typeof data === 'object') {
        callback(data);
      }
    });
  },

  // Get security status
  getSecurityStatus: async () => {
    return ipcRenderer.invoke('get-security-status');
  },

  // Clear sensitive data from memory
  clearSensitiveData: async () => {
    return ipcRenderer.invoke('clear-sensitive-data');
  }
});