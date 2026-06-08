import { writeWorkspaceArtifact } from './workspaceArtifactService';

const TEMPLATES = {
  'react': {
    name: 'React + Vite + Tailwind',
    detect: /\b(react|vite|tailwind|spa|single.?page)\b/i,
    files: {
      'package.json': `{
  "name": "my-react-app",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "vite": "^5.0.0"
  }
}`,
      'vite.config.js': `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 }
});`,
      'tailwind.config.js': `/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: {} },
  plugins: []
};`,
      'postcss.config.js': `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};`,
      'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>My React App</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>`,
      'src/main.jsx': `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`,
      'src/index.css': `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}`,
      'src/App.jsx': `export default function App() {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">My React App</h1>
        <p className="text-gray-400">Built with Alphonso</p>
      </div>
    </div>
  );
}`
    },
    commands: [
      { program: 'npm', args: ['install'] }
    ]
  },
  'nextjs': {
    name: 'Next.js + Tailwind',
    detect: /\b(next|nextjs|next\.js|ssr|server.?render)\b/i,
    files: {
      'package.json': `{
  "name": "my-next-app",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0"
  }
}`,
      'next.config.js': `/** @type {import('next').NextConfig} */
const nextConfig = {};
module.exports = nextConfig;`,
      'tailwind.config.js': `/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./pages/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: { extend: {} },
  plugins: []
};`,
      'postcss.config.js': `module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};`,
      'pages/_app.js': `import '../styles/globals.css';

export default function App({ Component, pageProps }) {
  return <Component {...pageProps} />;
}`,
      'pages/index.js': `export default function Home() {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">My Next.js App</h1>
        <p className="text-gray-400">Built with Alphonso</p>
      </div>
    </div>
  );
}`,
      'styles/globals.css': `@tailwind base;
@tailwind components;
@tailwind utilities;`
    },
    commands: [
      { program: 'npm', args: ['install'] }
    ]
  },
  'express': {
    name: 'Express.js API',
    detect: /\b(express|api|rest|backend|server|node.?api)\b/i,
    files: {
      'package.json': `{
  "name": "my-api",
  "version": "0.1.0",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js"
  },
  "dependencies": {
    "express": "^4.18.0",
    "cors": "^2.8.5",
    "dotenv": "^16.3.0"
  }
}`,
      'src/server.js': `const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from Alphonso API' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(\`API server running on port \${PORT}\`);
});`,
      '.env.example': `PORT=3001`,
      '.gitignore': `node_modules\n.env`
    },
    commands: [
      { program: 'npm', args: ['install'] }
    ]
  },
  'fullstack': {
    name: 'Full-Stack (React + Express)',
    detect: /\b(full.?stack|fullstack|mern|mean|full.?stack.?app|stack)\b/i,
    files: {
      'package.json': `{
  "name": "my-fullstack-app",
  "version": "0.1.0",
  "private": true,
  "workspaces": ["client", "server"],
  "scripts": {
    "dev:client": "cd client && npm run dev",
    "dev:server": "cd server && npm run dev",
    "dev": "npm run dev:server & npm run dev:client",
    "build": "cd client && npm run build"
  }
}`,
      'server/package.json': `{
  "name": "server",
  "version": "0.1.0",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js"
  },
  "dependencies": {
    "express": "^4.18.0",
    "cors": "^2.8.5",
    "dotenv": "^16.3.0"
  }
}`,
      'server/src/index.js': `const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(\`Server on port \${PORT}\`));`,
      'client/package.json': `{
  "name": "client",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.0",
    "vite": "^5.0.0"
  }
}`,
      'client/src/main.jsx': `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`,
      'client/src/App.jsx': `export default function App() {
  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold' }}>Full-Stack App</h1>
        <p style={{ color: '#888' }}>Built with Alphonso</p>
      </div>
    </div>
  );
}`,
      'client/index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Full-Stack App</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>`,
      'client/vite.config.js': `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' }
  }
});`,
      '.gitignore': `node_modules\n.env\ndist`
    },
    commands: [
      { program: 'npm', args: ['install'] }
    ]
  },
  'vanilla': {
    name: 'Vanilla HTML/CSS/JS',
    detect: /\b(vanilla|html|css|javascript|static|simple|plain)\b/i,
    files: {
      'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>My App</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <div class="container">
    <h1>My App</h1>
    <p>Built with Alphonso</p>
  </div>
  <script src="app.js"></script>
</body>
</html>`,
      'styles.css': `* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  min-height: 100vh;
  background: #0a0a0a;
  color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  text-align: center;
}

h1 { font-size: 2.5rem; margin-bottom: 1rem; }
p { color: #888; }`,
      'app.js': `console.log('App loaded');`
    },
    commands: []
  }
};

export function detectStackTemplate(commandText) {
  const lower = String(commandText || '').toLowerCase();
  for (const [key, template] of Object.entries(TEMPLATES)) {
    if (template.detect.test(lower)) {
      return { key, ...template };
    }
  }
  return null;
}

export async function scaffoldProject(commandText, workspaceRoot) {
  const template = detectStackTemplate(commandText);
  if (!template || !workspaceRoot) return null;

  const written = [];
  for (const [relativePath, content] of Object.entries(template.files)) {
    try {
      await writeWorkspaceArtifact({ workspaceRoot, relativePath, content });
      written.push(relativePath);
    } catch {
      // best-effort: some files may fail if path is invalid
    }
  }

  return {
    templateName: template.name,
    templateKey: template.name,
    filesWritten: written,
    commands: template.commands
  };
}

export function listScaffoldTemplates() {
  return Object.entries(TEMPLATES).map(([key, t]) => ({
    key,
    name: t.name,
    detect: t.detect.source,
    fileCount: Object.keys(t.files).length
  }));
}
