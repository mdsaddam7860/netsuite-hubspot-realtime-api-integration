import express from "express";
import { handleNetsuiteWebhooks } from "./controllers/webhookController.js";
// import {} from ""

// import { rateLimit } from "express-rate-limit";
// const limiter = rateLimit({
//   windowMs: 1 * 60 * 1000, // 1 minute window
//   max: 200, // Limit each IP to 200 requests per `window`
//   message: { error: "Too many webhooks received, please try again later." },
//   standardHeaders: true,
//   legacyHeaders: false,
// });

const app = express();

app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(express.json({ limit: "50mb" }));

app.get("/", (req, res) => {
  res.send(`Servers is Running and Healthy ${new Date().toISOString()}`);
});

// Webhooks Endpoint
// Endpoint to receive NetSuite Webhooks(Customers)
app.post("webhooks/netsuiteCustomers", handleNetsuiteWebhooks);

// Endpoint to receive Hubspot Webhooks(companies/contacts)
// Handle Hubspot Webhooks for contact and company updates. This allows us to keep NetSuite in sync with changes made in HubSpot, ensuring data consistency across both platforms. Depending on the type of webhook received (contact or company), we can trigger the appropriate sync logic to update NetSuite records accordingly.
app.post("/hubspot/webhooks/contacts", (req, res) => {}); // handleHubspotContactWebhooks
app.post("/hubspot/webhooks/companies", (req, res) => {}); // handleHubspotCompanyWebhooks

export { app };
