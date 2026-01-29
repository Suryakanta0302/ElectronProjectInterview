const { ipcRenderer } = require('electron');

// Function to get element by XPath
function getElementByXPath(xpath) {
  const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
  return result.singleNodeValue;
}

// Function to fill element and trigger events
function fillElement(element, value, fieldName) {
  if (!element) return false;
  
  
  // Handle SELECT/DROPDOWN elements
  if (element.tagName === 'SELECT') {
    const options = element.querySelectorAll('option');
    
    let found = false;
    let attemptedValues = [];
    
    // First pass: exact value match
    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      attemptedValues.push(`[${option.value}] ${option.textContent.trim()}`);
      
      if (option.value === value) {
        element.value = value;
        option.selected = true;
        found = true;
        break;
      }
    }
    
    // Second pass: text content match
    if (!found) {
      for (let i = 0; i < options.length; i++) {
        const option = options[i];
        if (option.textContent.includes(value)) {
          element.value = option.value;
          option.selected = true;
          found = true;
          break;
        }
      }
    }
    
    if (!found) {
      for (let i = 0; i < Math.min(20, options.length); i++) {
        console.log(`[${options[i].value}] ${options[i].textContent.trim()}`);
      }
    } else {
      console.log(`Selected value is now: "${element.value}"`);
      console.log(`Selected text is: "${element.options[element.selectedIndex]?.textContent}"`);
    }
  } else {
    // For text inputs
    console.log(`This is a TEXT input, setting value to: "${value}"`);
    element.value = value;
  }
  
  // Trigger all necessary events
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('blur', { bubbles: true }));
  
  // Special event for ASP.NET forms (CEAC uses ASP.NET)
  element.dispatchEvent(new Event('onchange', { bubbles: true }));
  
  return true;
}

// Listen for fill-form messages from main process
ipcRenderer.on('fill-form', (event, data) => {
  
  // Function to fill form fields on CEAC website
  function fillFields(fieldData) {
    let count = 0;

    // Map local field names to CEAC form selectors (CSS) and XPath
    const fieldSelectors = {
      country: {
        selectors: ['select[name*="ctl00$SiteContentPlaceHolder$ucLocation$ddlLocation"]', 'select[id*="ddlLocation"]', 'select[name="Country"]', 'select[id*="country"]'],
        xpath: '//*[@id="ctl00_SiteContentPlaceHolder_ucLocation_ddlLocation"]'
      },
      captcha: {
        selectors: ['input[id*="captcha"]', 'input[name*="captcha"]', 'input[id*="code"]'],
        xpath: '//*[@id="ctl00_SiteContentPlaceHolder_ucCaptcha_txtCaptchaCode"]'
      }
    };

    for (const [fieldName, config] of Object.entries(fieldSelectors)) {
      if (!fieldData[fieldName]) {
        console.log(`Skipping ${fieldName} - no data provided`);
        continue;
      }

      let element = null;
      let source = '';

      console.log(`\n Looking for field: ${fieldName}`);

      // Try XPath first (more specific)
      if (config.xpath) {
        console.log(`Trying XPath: ${config.xpath}`);
        element = getElementByXPath(config.xpath);
        if (element) {
          source = 'XPath';
          console.log(`Found via XPath!`);
        }
      }

      // Fallback to CSS selectors
      if (!element && config.selectors) {
        for (const selector of config.selectors) {
          console.log(`Trying CSS: ${selector}`);
          element = document.querySelector(selector);
          if (element) {
            source = 'CSS';
            console.log(`Found via CSS!`);
            break;
          }
        }
      }

      // Fill the element if found
      if (element && fillElement(element, fieldData[fieldName], fieldName)) {
        console.log(`SUCCESS: Filled ${fieldName} via ${source}`);
        count++;
      } else if (element) {
        console.log(`FAILED: Could not fill ${fieldName}`);
      } else {
        console.log(`NOT FOUND: ${fieldName} element not found`);
      }
    }

  }

  // Start attempting to fill - try multiple times with increasing delays
  let attemptCount = 0;
  const tryFill = () => {
    attemptCount++;
    
    // Check if country dropdown exists
    const countryDropdown = getElementByXPath('//*[@id="ctl00_SiteContentPlaceHolder_ucLocation_ddlLocation"]');
    
    if (countryDropdown) {
      fillFields(data);
    } else if (attemptCount < 5) {
      setTimeout(tryFill, 1000);
    } else {
      console.log(`Attempting with alternative methods anyway...`);
      fillFields(data);
    }
  };

  // Start the first attempt after 500ms
  setTimeout(tryFill, 500);
});
