const { app } = require('@azure/functions');
const { getSecretFromKeyVault } = require('../helpers/keyVaultHelper');
const {
  BASIC_AUTH_PASSWORD,
  BASIC_AUTH_PASSWORD_SECRET_NAME,
  OIDC_AUTH_EMAIL,
  OIDC_AUTH_EMAIL_SECRET_NAME,
  OIDC_AUTH_PASSWORD,
  OIDC_AUTH_PASSWORD_SECRET_NAME,
} = require('../utils/constants');
const { initializeChromium } = require('../helpers/chromiumHelper');

function generateFailure(status, message) {
  return {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      isError: true,
      errorMessage: message,
    }),
  };
}

async function browserValidationFunc(request, context) {
  const generateLogMessage = (hostname, message) => {
    context.log(
      `Request Log\r\n  PreciseTimestamp: ${new Date(Date.now())}\r\n  Hostname: ${hostname}\r\n  Message: ${message}`,
    );
  };

  generateLogMessage('', `Http function processed request for url "${request.url}"`);

  if (!request.body || request.body === null) {
    return generateFailure(400, 'Invalid parameters: Missing request body');
  }

  let browser, page, requestBody;
  let credentials = {};
  let isError = false;
  let failedValidationsPaths = [];

  // LOCAL TESTING FLAG
  const isLocal = false;

  // STEP 0: Process request body
  try {
    requestBody = await request.json();
    generateLogMessage('', `Http function body: ${JSON.stringify(requestBody)}`);
  } catch (error) {
    context.error(`Error reading request body: ${error}`);
    return generateFailure(400, 'Invalid JSON format in request body');
  }

  // STEP 1: Initialize puppeteer headless chromium
  try {
    browser = await initializeChromium(isLocal);
    page = await browser.newPage();
    generateLogMessage(requestBody.hostname, 'Pupeteer headless chromium successfully launched');
  } catch (error) {
    context.error(`Error occurred: ${error}`);
    return generateFailure(500, 'Error initializing Pupeteer headless chromium');
  }

  // STEP 2: Navigate to request hostname
  try {
    const encodedURI = encodeURI(`https://${requestBody.hostname}`);
    generateLogMessage(requestBody.hostname, `Navigating to: ${encodedURI}`);
    await page.goto(encodedURI);
  } catch (error) {
    context.error(`Error occurred: ${error}`);
    return generateFailure(500, 'Error occurred navigating to the defaultHostname');
  }

  // STEP 3: Get Credentials
  try {
    generateLogMessage(requestBody.hostname, 'Fetching secrets from keyvault');
    const inputCredentials = requestBody.credentials;

    credentials[BASIC_AUTH_PASSWORD] =
      inputCredentials?.[BASIC_AUTH_PASSWORD_SECRET_NAME] &&
      (await getSecretFromKeyVault('auth-testing-kv', inputCredentials[BASIC_AUTH_PASSWORD_SECRET_NAME]));

    credentials[OIDC_AUTH_EMAIL] =
      inputCredentials?.[OIDC_AUTH_EMAIL_SECRET_NAME] &&
      (await getSecretFromKeyVault('auth-testing-kv', inputCredentials[OIDC_AUTH_EMAIL_SECRET_NAME]));

    credentials[OIDC_AUTH_PASSWORD] =
      inputCredentials?.[OIDC_AUTH_PASSWORD_SECRET_NAME] &&
      (await getSecretFromKeyVault('auth-testing-kv', inputCredentials[OIDC_AUTH_PASSWORD_SECRET_NAME]));
  } catch (error) {
    context.error(`Error occurred: ${error}`);
    return generateFailure(500, 'Error occurred getting secrets from the keyvault');
  }

  // STEP 4: Authenticate
  try {
    generateLogMessage(requestBody.hostname, 'Inputting authentication credentials');

    if (await page.$('input[type="email"]')) {
      generateLogMessage(requestBody.hostname, 'Email input field found, inputting email');

      await page.type('input[type="password"', credentials[OIDC_AUTH_EMAIL]);
      // For Entra ID, we input email first and hit enter to input the password
      if ((await page.$('input[type="password"')) === null) {
        await page.keyboard.press('Enter');
      }
    }

    await page.waitForSelector('input[type="password"');

    generateLogMessage(requestBody.hostname, 'Password input field found, inputting password');
    await page.type('input[type="password"', credentials[BASIC_AUTH_PASSWORD] || credentials[OIDC_AUTH_PASSWORD]);
    await page.keyboard.press('Enter');
    await page.waitForNavigation();
  } catch (error) {
    context.error(`Error occurred: ${error}. Page: ${await page.content()}`);
    return generateFailure(
      500,
      `Error occurred during authentication, authentication page may not be ready yet. Check logs for more details. ${error}`,
    );
  }

  // STEP 5: Validate Expected Content
  try {
    generateLogMessage(requestBody.hostname, 'Validating expected responses');
    const inputValidations = requestBody.expectedResponses;

    for (const validation of inputValidations) {
      const { path, expectedContent } = validation;
      const cleanHostname = requestBody.hostname.replace(/\/$/, '');
      const fullPath = `https://${cleanHostname}${path}`;
      const encodedPath = encodeURI(fullPath);
      generateLogMessage(requestBody.hostname, `Now validating ${fullPath} for expected content: ${expectedContent}`);

      await page.goto(encodedPath);

      const foundText = await page.evaluate((text) => {
        return document.body.innerText.includes(text);
      }, expectedContent);
      if (!foundText) {
        generateLogMessage(requestBody.hostname, `Validation failed for ${fullPath}`);
        isError = true;
        failedValidationsPaths.push(path);
      }
    }

    if (isError) {
      return generateFailure(400, `Content validations failed for paths: ${failedValidationsPaths.join(',')}`);
    }

    return {
      status: 200,
      body: JSON.stringify({
        isError,
      }),
    };
  } catch (error) {
    context.error(`Error occurred: ${error}`);
    return generateFailure(500, 'Error occurred during expected content validations');
  }
}

app.http('runBrowserValidation', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: browserValidationFunc,
});
