const chromium = require("@sparticuz/chromium");
const { default: puppeteer } = require("puppeteer-core");

async function initializeChromium(isLocal) {
  chromium.setHeadlessMode = true;
  chromium.setGraphicsMode = false;

  const executablePath = isLocal
    ? ".\\chrome-win\\chrome.exe"
    : await chromium.executablePath();

  try {
    return await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", ...chromium.args],
      executablePath,
    });
  } catch (error) {
    throw error;
  }
}

module.exports = {
  initializeChromium,
};
