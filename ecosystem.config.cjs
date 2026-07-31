/**
 * ecosystem.config.cjs
 * PM2 process configuration for NetSuite ↔ HubSpot real-time integration (contact/company sync).
 *
 * Start:      pm2 start ecosystem.config.cjs
 * Logs:       pm2 logs
 * Status:     pm2 status
 */
module.exports = {
  apps: [
    {
      name: "NetSuite ↔ HubSpot Real-Time API Integration", // Updated name
      script: "index.js",
      interpreter: "node",

      // Keep it alive 24/7
      autorestart: true,
      watch: false,

      // Log files
      out_file: "./logs/server_out.log",
      error_file: "./logs/server_err.log",
      merge_logs: false,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",

      // Safety valve
      max_memory_restart: "512M",

      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
