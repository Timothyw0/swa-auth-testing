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

function generateFailure(message) {
  return {
    status: 200,
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
    return generateFailure('Invalid parameters: Missing request body');
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
    return generateFailure('Invalid JSON format in request body');
  }

  // STEP 1: Initialize puppeteer headless chromium
  try {
    browser = await initializeChromium(isLocal);
    page = await browser.newPage();
    generateLogMessage(requestBody.hostname, 'Pupeteer headless chromium successfully launched');
  } catch (error) {
    context.error(`Error occurred: ${error}`);
    return generateFailure('Error initializing Pupeteer headless chromium');
  }

  // STEP 2: Navigate to request hostname
  try {
    const encodedURI = encodeURI(`https://${requestBody.hostname}`);
    generateLogMessage(requestBody.hostname, `Navigating to: ${encodedURI}`);
    await page.goto(encodedURI);
  } catch (error) {
    context.error(`Error occurred: ${error}`);
    return generateFailure('Error occurred navigating to the defaultHostname');
  }

  // STEP 3: Get Credentials
  try {
    generateLogMessage(requestBody.hostname, 'Fetching secrets from keyvault');
    const inputCredentials = requestBody.credentials;
    const keyvaultName = process.env.FUNCTIONS_RUNNER_KEY_VAULT_NAME;

    if (!keyvaultName) {
      return generateFailure('FUNCIONS_RUNNER_KEY_VAULT_NAME app setting not found, cannot get credentials');
    }

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
    return generateFailure('Error occurred getting secrets from the keyvault');
  }

  // STEP 4: Authenticate
  try {
    generateLogMessage(requestBody.hostname, 'Inputting authentication credentials');

    const suppliedEmailCredentials = !!requestBody.credentials?.[OIDC_AUTH_EMAIL_SECRET_NAME];
    if (suppliedEmailCredentials) {
      generateLogMessage(requestBody.hostname, 'Email input field found, inputting email');

      await page.type('input[type="password"]', credentials[OIDC_AUTH_EMAIL]);

      // For Entra ID, we input email first and hit enter to input the password
      if ((await page.$('input[type="password"]')) === null) {
        await page.keyboard.press('Enter');
      }
    }

    await page.waitForSelector('input[type="password"]');

    generateLogMessage(requestBody.hostname, 'Password input field found, inputting password');
    await page.type('input[type="password"]', credentials[BASIC_AUTH_PASSWORD] || credentials[OIDC_AUTH_PASSWORD]);
    await page.keyboard.press('Enter');
    await page.waitForNavigation();
  } catch (error) {
    context.error(`Error occurred: ${error}. Page: ${await page.content()}`);
    return generateFailure(
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
      return generateFailure(`Content validations failed for paths: ${failedValidationsPaths.join(',')}`);
    }
  } catch (error) {
    context.error(`Error occurred: ${error}`);
    return generateFailure('Error occurred during expected content validations');
  }

  return {
    status: 200,
    body: JSON.stringify({
      isError,
    }),
  };
}

app.http('runBrowserValidation', {
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: browserValidationFunc,
});
