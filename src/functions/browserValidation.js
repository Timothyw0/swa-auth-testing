const { app } = require("@azure/functions");
const { default: puppeteer } = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");
const { getSecretFromKeyVault } = require("../helpers/keyVaultHelper");
const { BASIC_AUTH_PASSWORD } = require("../utils/constants");

function generateFailure(status, body) {
  return {
    status,
    body,
  };
}

async function browserValidationFunc(request, context) {
  context.log(`Http function processed request for url "${request.url}"`);

  if (!request.body || request.body === null) {
    return {
      status: 400,
      body: "Invalid parameters",
    };
  }

  let browser, page, requestBody;
  try {
    requestBody = await request.json();
    context.log(`Http function body process as: ${JSON.stringify(requestBody)}`);
  } catch (error) {
    context.error(`Error reading request body: ${error}`);
    return generateFailure(400, "Invalid JSON format");
  }

  try {
    chromium.setHeadlessMode = true;
    chromium.setGraphicsMode = false;
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", ...chromium.args],
      // Comment below for local Windows testing and use the chrome-win client
      executablePath: await chromium.executablePath(),
      // executablePath: ".\\chrome-win\\chrome.exe",
    });

    page = await browser.newPage();
    context.log("Pupeteer headless chromium successfully launched");
  } catch (error) {
    context.error(`Error occurred: ${error}`);
    return generateFailure(
      500,
      "Error initializing Pupeteer headless chromium"
    );
  }

  try {
    const encodedURI = encodeURI(requestBody.defaultHostname);
    context.log(`Navigating to: ${encodedURI}`);
    await page.goto(encodedURI);
  } catch (error) {
    context.error(`Error occurred: ${error}`);
    return generateFailure(
      500,
      "Error occurred navigating to the defaultHostname"
    );
  }

  let credentials = {};
  try {
    credentials[BASIC_AUTH_PASSWORD] = await getSecretFromKeyVault(
      requestBody.keyvaultName,
      BASIC_AUTH_PASSWORD
    );
  } catch (error) {
    context.error(`Error occurred: ${error}`);
    return generateFailure(
      500,
      "Error occurred getting secrets from the keyvault"
    );
  }

  try {
    context.log("Inputting authentication credentials");
    await page.waitForSelector('input[type="password"');
    await page.type('input[type="password"', credentials[BASIC_AUTH_PASSWORD]);
    await page.keyboard.press("Enter");
    await page.waitForNavigation();
    const screenshot = await page.screenshot({ fullPage: true });
    return {
      status: 200,
      body: screenshot,
      headers: { "Content-Type": "image/png" },
    };
  } catch (error) {
    context.error(`Error occured: ${error}`);
    return generateFailure(500, "Error occurred during authentication");
  }
}

app.http("browserValidation", {
  methods: ["POST"],
  authLevel: "anonymous",
  handler: browserValidationFunc,
});
