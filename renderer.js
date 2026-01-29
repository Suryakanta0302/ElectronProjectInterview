// Default static data - customize with your information
const staticData = {
  country: 'ALGERIA, ALGIERS',  // Valid embassy location code: MEX=Mexico City, TRT=Toronto, PRS=Paris, LND=London, etc.
  captcha: ''  // CAPTCHA will be entered manually
};

const fieldMapping = {
  country: {
    selectors: ['[name="ctl00$SiteContentPlaceHolder$ucLocation$ddlLocation"]', '[id*="country"]', 'select'],
    xpath: '//*[@id="ctl00_SiteContentPlaceHolder_ucLocation_ddlLocation"]',
    optional: false
  },
  captcha: {
    selectors: ['[id*="captcha"]', '[name*="captcha"]', '[id*="code"]'],
    xpath: '//*[@id="ctl00_SiteContentPlaceHolder_ucCaptcha_txtCaptchaCode"]',
    optional: true,
    manual: true
  }
};

// Get all form input elements from the UI
function getFormData() {
  const data = {};
  Object.keys(staticData).forEach(key => {
    const element = document.getElementById(key);
    if (element) {
      data[key] = element.value || staticData[key];
    } else {
      data[key] = staticData[key];
    }
  });
  return data;
}

// Fill form fields on the CEAC website
function fillFormFields(data) {
  if (!data || typeof data !== 'object') {
    console.error('Invalid data object');
    return;
  }

  let filledCount = 0;

  Object.keys(data).forEach(key => {
    const selectors = fieldMapping[key];
    if (!selectors) return;

    // Try each selector until one works
    for (let selector of selectors) {
      const input = document.querySelector(selector);
      if (input) {
        const oldValue = input.value;
        
        // Handle SELECT/DROPDOWN elements differently
        if (input.tagName === 'SELECT') {
          // For select elements, find and select the matching option
          const options = input.querySelectorAll('option');
          let found = false;
          
          for (let option of options) {
            if (option.value === data[key] || option.textContent.includes(data[key])) {
              input.value = option.value;
              found = true;
              break;
            }
          }
          
          if (!found && data[key]) {
            // If exact match not found but value provided, set it anyway
            input.value = data[key];
          }
        } else {
          // For text inputs
          input.value = data[key];
        }

        // Trigger change events for the website to register the change
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));

        filledCount++;
        break;
      }
    }
  });

  return filledCount;
}

// Load form data into the control panel when page loads
document.addEventListener('DOMContentLoaded', () => {
  // Load saved data or use defaults
  Object.keys(staticData).forEach(key => {
    const element = document.getElementById(key);
    if (element) {
      element.value = localStorage.getItem(key) || staticData[key];
    }
  });

  // Open Website Button
  const openBtn = document.getElementById('openBtn');
  if (openBtn) {
    openBtn.addEventListener('click', async () => {
      try {
        showStatus('Opening CEAC website...', 'info');
        await window.electronAPI.openCEAC();
        showStatus('Website opened successfully!', 'success');
      } catch (error) {
        console.error('Error opening website:', error);
        showStatus(`Error: ${error.message}`, 'error');
      }
    });
  }

  // Auto-Fill Form Button
  const fillBtn = document.getElementById('fillBtn');
  if (fillBtn) {
    fillBtn.addEventListener('click', async () => {
      try {
        showStatus('Collecting form data...', 'info');
        const formData = getFormData();

        // Save form data to localStorage
        Object.keys(formData).forEach(key => {
          localStorage.setItem(key, formData[key]);
        });

        showStatus('Opening website and preparing for auto-fill...', 'info');
        
        // First, fill basic info (without CAPTCHA)
        const basicData = { ...formData, captcha: '' };
        let result = await window.electronAPI.sendFormData(basicData);

        if (result.success) {
          showStatus('Please wait for CAPTCHA prompt...', 'info');
          
          // Wait a moment for CAPTCHA image to load, then prompt user
          setTimeout(() => {
            promptForCaptcha();
          }, 2000);
        } else {
          showStatus(`Error: ${result.message || 'Failed to fill form'}`, 'error');
        }
      } catch (error) {
        console.error('Error filling form:', error);
        showStatus(`Error: ${error.message}`, 'error');
      }
    });
  }

  // Listen for form filling requests from main process
  if (window.electronAPI && window.electronAPI.onFillForm) {
    window.electronAPI.onFillForm((data) => {
      const count = fillFormFields(data);
      showStatus(`Filled ${count} fields on CEAC website`, 'success');
    });
  }
});

// Show status message
function showStatus(message, type = 'info') {
  const statusDiv = document.getElementById('status');
  if (statusDiv) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    
    // Auto-hide after 5 seconds for success messages
    if (type === 'success') {
      setTimeout(() => {
        statusDiv.className = 'status';
      }, 5000);
    }
  }
  console.log(`[${type.toUpperCase()}] ${message}`);
}

// Prompt user to enter CAPTCHA manually
function promptForCaptcha() {
  const captchaInput = prompt(
    '🔐 CAPTCHA Entry\n\n' +
    'Please look at the CAPTCHA image on the CEAC website and enter the code below:\n' +
    '(The website window should be visible behind this dialog)\n\n' +
    'Enter the CAPTCHA code:',
    ''
  );

  if (captchaInput !== null) {
    if (captchaInput.trim() === '') {
      showStatus('CAPTCHA code cannot be empty!', 'error');
      setTimeout(() => promptForCaptcha(), 1000);
    } else {
      // User entered CAPTCHA, now fill it automatically
      fillCaptchaAndComplete(captchaInput.trim());
    }
  } else {
    // User cancelled
    showStatus('Auto-fill cancelled by user', 'info');
  }
}

// Fill CAPTCHA field and trigger completion
async function fillCaptchaAndComplete(captchaCode) {
  try {
    showStatus('Filling CAPTCHA field...', 'info');
    
    // Store captcha value
    const captchaField = document.getElementById('captcha');
    if (captchaField) {
      captchaField.value = captchaCode;
      localStorage.setItem('captcha', captchaCode);
    }

    // Send CAPTCHA to CEAC form
    const result = await window.electronAPI.sendFormData({ captcha: captchaCode });
    
    if (result.success) {
      showStatus('CAPTCHA auto-filled! Ready to click "START AN APPLICATION"', 'success');
    } else {
      showStatus('Could not fill CAPTCHA: ' + result.message, 'error');
    }
  } catch (error) {
    console.error('Error filling CAPTCHA:', error);
    showStatus(`Error: ${error.message}`, 'error');
  }
}

// Check security status
async function checkSecurityStatus() {
  try {
    const status = await window.electronAPI.getSecurityStatus();
    console.log('Security Status:', status);
    
    const securityInfo = document.getElementById('security-info');
    if (securityInfo && status.secure) {
      securityInfo.innerHTML = `
        <small style="color: #27ae60; font-weight: bold;">
          Secure Session Active
        </small>
      `;
    }
  } catch (error) {
    console.error('Error checking security status:', error);
  }
}

// Initialize security status check
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', checkSecurityStatus);
} else {
  checkSecurityStatus();
}