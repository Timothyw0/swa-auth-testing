const { app } = require("@azure/functions");

app.http("helloWorld", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  handler: async (request, context) => {
    context.res = {
        status: 200,
        body: "hello world!"
    };

    return context.res;
  },
});
