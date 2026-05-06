/**
 * ecosystem.config.cjs
 * PM2 process configuration for NetSuite → HubSpot product sync.
 *
 * Start:      pm2 start ecosystem.config.cjs
 * Full sync:  pm2 start ecosystem.config.cjs --only ns-hs-products --node-args="" -- --full
 * Logs:       pm2 logs ns-hs-products
 * Status:     pm2 status
 */
// module.exports = {
//   apps: [
//     {
//       name: 'ns-hs-products',
//       script: 'sync_products.js',
//       interpreter: 'node',

//       // Run every hour on the hour (incremental sync)
//       cron_restart: '0 * * * *',
//       watch: false,
//       autorestart: false, // Script exits normally after each run — don't restart until next cron tick

//       // Log files (PM2 will create the logs/ directory if it doesn't exist)
//       out_file: './logs/products_out.log',
//       error_file: './logs/products_err.log',
//       merge_logs: false,
//       log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

//       // Safety valve: restart if process exceeds 512 MB
//       max_memory_restart: '512M',

//       env: {
//         NODE_ENV: 'production',
//       },
//     },
//   ],
// };

module.exports = {
  apps: [
    {
      name: "NetSuite ↔ HubSpot Real-Time API Integration", // Updated name
      script: " netsuite-hubspot-realtime-api-integration.js", // Point to the new unified server
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
