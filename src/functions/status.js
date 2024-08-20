const { app } = require("@azure/functions");

app.http("status", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    context.res = {
        status: 200,
        body: "Browser Validation function app is healthy!"
    };

    return context.res;
  },
});
