const { default: puppeteer } = require("puppeteer-core");
const { app } = require("@azure/functions");

app.http("httpTrigger1", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    try {
      context.log(`Http function processed request for url "${request.url}"`);

      const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        executablePath: ".\\chrome-win\\chrome.exe",
      });

      const page = await browser.newPage();
      context.log("Pupeteer headless chromium successfully launched");

      await page.goto("https://proud-island-0a32e3d00.5.azurestaticapps.net/");

      // Take a screenshot
      const screenshot = await page.screenshot({ fullPage: true });
      context.log("Pupetter headless chromium screenshot successful");

      await browser.close();

      context.res = {
        body: screenshot,
        headers: {
          "Content-Type": "image/png",
        },
      };

      return context.res;
    } catch (error) {
      context.log.error(`Error occurred: ${error}`);
      context.res = {
        status: 500,
        body: "Error occurred",
      };

      return context.res;
    }
  },
});
