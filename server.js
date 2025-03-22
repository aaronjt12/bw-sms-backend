const express = require('express');
const path = require('path');
const compression = require('compression');
const fs = require('fs');

const app = express();

// Railway typically sets PORT to a specific value
const PORT = process.env.PORT || process.env.RAILWAY_PORT || 8080;

// Print all environment variables for debugging
console.log('All environment variables:');
console.log(JSON.stringify(process.env, null, 2));
console.log(`Starting server with PORT=${PORT}`);

// Enable compression
app.use(compression());

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Debug endpoint
app.get('/debug', (req, res) => {
  const debug = {
    env: process.env,
    port: PORT,
    cwd: process.cwd(),
    files: fs.readdirSync('./public')
  };
  res.json(debug);
});

// Error route - serve the error page for specific error paths
app.get('/error', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'error.html'));
});

// Maps error route - handle directly instead of using a separate file
app.get('/maps-error', (req, res) => {
  const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Google Maps API Error</title>
      <style>
          body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 800px;
              margin: 0 auto;
              padding: 20px;
          }
          h1 {
              color: #d93025;
          }
          .error-box {
              background-color: #f8f9fa;
              border-left: 4px solid #d93025;
              padding: 15px;
              margin-bottom: 20px;
          }
          .solution-box {
              background-color: #e8f0fe;
              border-left: 4px solid #1a73e8;
              padding: 15px;
              margin-bottom: 20px;
          }
          code {
              background-color: #f1f3f4;
              padding: 2px 4px;
              border-radius: 4px;
              font-family: monospace;
          }
          pre {
              background-color: #f1f3f4;
              padding: 15px;
              border-radius: 4px;
              overflow-x: auto;
          }
          .steps {
              margin-left: 20px;
          }
          .btn {
              display: inline-block;
              background-color: #1a73e8;
              color: white;
              padding: 10px 20px;
              text-decoration: none;
              border-radius: 4px;
              font-weight: bold;
          }
      </style>
  </head>
  <body>
      <h1>Google Maps API Error</h1>
      
      <div class="error-box">
          <h2>RefererNotAllowedMapError</h2>
          <p>This error occurs when the domain you're using to access the Google Maps JavaScript API is not authorized in the Google Cloud Console.</p>
          <p>Your current domain: <code id="current-domain">Loading...</code></p>
      </div>
      
      <div class="solution-box">
          <h2>How to Fix This Error</h2>
          <p>To resolve this issue, you need to add your domain to the list of authorized referrers in the Google Cloud Console:</p>
          
          <ol class="steps">
              <li>Go to the <a href="https://console.cloud.google.com/google/maps-apis/credentials" target="_blank">Google Cloud Console Credentials page</a></li>
              <li>Select the project that contains your Google Maps API key</li>
              <li>Find your API key in the list and click on it to edit</li>
              <li>Under "Application restrictions", select "HTTP referrers (web sites)"</li>
              <li>Add your domain to the list of authorized referrers. For example:
                  <pre id="domain-example">Loading...</pre>
              </li>
              <li>Click "Save" to apply the changes</li>
          </ol>
          
          <p><strong>Note:</strong> It may take a few minutes for the changes to take effect.</p>
      </div>
      
      <p>After adding your domain to the authorized referrers, you can return to the application:</p>
      <a href="/" class="btn">Return to Application</a>
      
      <script>
          // Display the current domain
          document.getElementById('current-domain').textContent = window.location.origin;
          document.getElementById('domain-example').textContent = window.location.origin + '/*';
      </script>
  </body>
  </html>
  `;
  
  res.send(html);
});

// Middleware to inject environment variables into the HTML
app.use((req, res, next) => {
  if (req.path.endsWith('.html') || req.path === '/') {
    const filePath = req.path === '/' 
      ? path.join(__dirname, 'public', 'index.html')
      : path.join(__dirname, 'public', req.path);
    
    if (fs.existsSync(filePath)) {
      let html = fs.readFileSync(filePath, 'utf8');
      
      // Inject environment variables as a global object
      const envVars = {
        VITE_MAPS_API_KEY: process.env.VITE_MAPS_API_KEY || '',
        VITE_FIREBASE_API_KEY: process.env.VITE_FIREBASE_API_KEY || '',
        VITE_FIREBASE_AUTH_DOMAIN: process.env.VITE_FIREBASE_AUTH_DOMAIN || '',
        VITE_FIREBASE_DATABASE_URL: process.env.VITE_FIREBASE_DATABASE_URL || '',
        VITE_FIREBASE_PROJECT_ID: process.env.VITE_FIREBASE_PROJECT_ID || '',
        VITE_FIREBASE_STORAGE_BUCKET: process.env.VITE_FIREBASE_STORAGE_BUCKET || '',
        VITE_FIREBASE_MESSAGING_SENDER_ID: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
        VITE_FIREBASE_APP_ID: process.env.VITE_FIREBASE_APP_ID || ''
      };
      
      // Insert the environment variables script before the closing </head> tag
      const envScript = `<script>window.env = ${JSON.stringify(envVars)};</script>`;
      html = html.replace('</head>', `${envScript}</head>`);
      
      res.send(html);
      return;
    }
  }
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// For SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Listen on all interfaces
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log('Available routes:');
  console.log('- /health - Health check endpoint');
  console.log('- /debug - Debug information');
  console.log('- /error - Error page');
  console.log('- /maps-error - Google Maps error help page');
  console.log('- /* - Static files and SPA routing');
}); 

