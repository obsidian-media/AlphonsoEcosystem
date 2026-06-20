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
  'todo': {
    name: 'Todo App (React + localStorage)',
    detect: /\b(todo|task|list|checklist|task.?manager)\b/i,
    files: {
      'package.json': `{
  "name": "todo-app",
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
export default defineConfig({ plugins: [react()], server: { port: 5173 } });`,
      'tailwind.config.js': `/** @type {import('tailwindcss').Config} */
export default { content: ['./index.html', './src/**/*.{js,jsx}'], theme: { extend: {} }, plugins: [] };`,
      'postcss.config.js': `export default { plugins: { tailwindcss: {}, autoprefixer: {} } };`,
      'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Todo App</title>
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
ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);`,
      'src/index.css': `@tailwind base;\n@tailwind components;\n@tailwind utilities;\nbody { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }`,
      'src/App.jsx': `import { useState, useEffect } from 'react';

const STORAGE_KEY = 'todo-app-tasks';

function loadTasks() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}

function saveTasks(tasks) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

export default function App() {
  const [tasks, setTasks] = useState(loadTasks);
  const [input, setInput] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => { saveTasks(tasks); }, [tasks]);

  const addTask = () => {
    if (!input.trim()) return;
    setTasks([...tasks, { id: Date.now(), text: input.trim(), done: false, createdAt: new Date().toISOString() }]);
    setInput('');
  };

  const toggleTask = (id) => setTasks(tasks.map((t) => t.id === id ? { ...t, done: !t.done } : t));
  const deleteTask = (id) => setTasks(tasks.filter((t) => t.id !== id));
  const clearCompleted = () => setTasks(tasks.filter((t) => !t.done));

  const filtered = tasks.filter((t) => filter === 'all' ? true : filter === 'active' ? !t.done : t.done);
  const remaining = tasks.filter((t) => !t.done).length;

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-center">Todo App</h1>
        <div className="flex gap-2 mb-4">
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTask()}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            placeholder="What needs to be done?" />
          <button onClick={addTask} className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg font-medium transition">Add</button>
        </div>
        <div className="flex gap-2 mb-4 text-sm">
          {['all', 'active', 'completed'].map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={\`px-3 py-1 rounded \${filter === f ? 'bg-blue-600' : 'bg-gray-800 hover:bg-gray-700'}\`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
          <span className="ml-auto text-gray-500">{remaining} remaining</span>
          {tasks.some((t) => t.done) && (
            <button onClick={clearCompleted} className="text-red-400 hover:text-red-300">Clear done</button>
          )}
        </div>
        <ul className="space-y-2">
          {filtered.map((task) => (
            <li key={task.id} className="flex items-center gap-3 bg-gray-800 rounded-lg px-4 py-3 group">
              <button onClick={() => toggleTask(task.id)}
                className={\`w-5 h-5 rounded border-2 flex items-center justify-center transition \${task.done ? 'bg-green-600 border-green-600' : 'border-gray-600 hover:border-blue-500'}\`}>
                {task.done && <span className="text-white text-xs">✓</span>}
              </button>
              <span className={\`flex-1 \${task.done ? 'line-through text-gray-500' : ''}\`}>{task.text}</span>
              <button onClick={() => deleteTask(task.id)}
                className="text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition">✕</button>
            </li>
          ))}
        </ul>
        {tasks.length === 0 && <p className="text-center text-gray-600 mt-8">No tasks yet. Add one above!</p>}
      </div>
    </div>
  );
}`
    },
    commands: [{ program: 'npm', args: ['install'] }]
  },
  'weather': {
    name: 'Weather Dashboard (React + Open-Meteo)',
    detect: /\b(weather|forecast|temperature|climate)\b/i,
    files: {
      'package.json': `{
  "name": "weather-app",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build" },
  "dependencies": { "react": "^18.2.0", "react-dom": "^18.2.0" },
  "devDependencies": { "@vitejs/plugin-react": "^4.2.0", "autoprefixer": "^10.4.0", "postcss": "^8.4.0", "tailwindcss": "^3.4.0", "vite": "^5.0.0" }
}`,
      'vite.config.js': `import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react'; export default defineConfig({ plugins: [react()] });`,
      'tailwind.config.js': `export default { content: ['./index.html', './src/**/*.{js,jsx}'], theme: { extend: {} }, plugins: [] };`,
      'postcss.config.js': `export default { plugins: { tailwindcss: {}, autoprefixer: {} } };`,
      'index.html': `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Weather</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>`,
      'src/main.jsx': `import React from 'react'; import ReactDOM from 'react-dom/client'; import App from './App'; import './index.css'; ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);`,
      'src/index.css': `@tailwind base;\n@tailwind components;\n@tailwind utilities;\nbody { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }`,
      'src/App.jsx': `import { useState } from 'react';

const WMO_ICONS = { 0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️', 45: '🌫️', 48: '🌫️', 51: '🌦️', 53: '🌧️', 55: '🌧️', 61: '🌧️', 63: '🌧️', 65: '🌧️', 71: '🌨️', 73: '🌨️', 75: '🌨️', 80: '🌦️', 81: '🌧️', 82: '⛈️', 95: '⛈️', 96: '⛈️', 99: '⛈️' };

export default function App() {
  const [city, setCity] = useState('');
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchWeather = async () => {
    if (!city.trim()) return;
    setLoading(true); setError(null); setWeather(null);
    try {
      const geoRes = await fetch(\`https://geocoding-api.open-meteo.com/v1/search?name=\${encodeURIComponent(city)}&count=1\`);
      const geoData = await geoRes.json();
      if (!geoData.results?.length) { setError('City not found'); setLoading(false); return; }
      const { latitude, longitude, name, country } = geoData.results[0];
      const wxRes = await fetch(\`https://api.open-meteo.com/v1/forecast?latitude=\${latitude}&longitude=\${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=5\`);
      const wxData = await wxRes.json();
      setWeather({ city: name, country, current: wxData.current, daily: wxData.daily });
    } catch (e) { setError('Failed to fetch weather'); } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-lg mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-center">Weather Dashboard</h1>
        <div className="flex gap-2 mb-6">
          <input value={city} onChange={(e) => setCity(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && fetchWeather()}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            placeholder="Enter city name..." />
          <button onClick={fetchWeather} disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded-lg font-medium disabled:opacity-50">{loading ? '...' : 'Search'}</button>
        </div>
        {error && <p className="text-red-400 text-center mb-4">{error}</p>}
        {weather && (
          <div>
            <div className="text-center mb-6">
              <h2 className="text-xl font-semibold">{weather.city}, {weather.country}</h2>
              <p className="text-5xl my-4">{WMO_ICONS[weather.current.weather_code] || '🌡️'}</p>
              <p className="text-4xl font-bold">{Math.round(weather.current.temperature_2m)}°C</p>
              <p className="text-gray-400 mt-2">Humidity: {weather.current.relative_humidity_2m}% · Wind: {Math.round(weather.current.wind_speed_10m)} km/h</p>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {weather.daily.time.map((date, i) => (
                <div key={date} className="bg-gray-800 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-400">{new Date(date).toLocaleDateString('en', { weekday: 'short' })}</p>
                  <p className="text-2xl my-1">{WMO_ICONS[weather.daily.weather_code[i]] || '🌡️'}</p>
                  <p className="text-sm">{Math.round(weather.daily.temperature_2m_max[i])}°</p>
                  <p className="text-xs text-gray-500">{Math.round(weather.daily.temperature_2m_min[i])}°</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {!weather && !loading && !error && <p className="text-center text-gray-600">Search for a city to see the weather</p>}
      </div>
    </div>
  );
}`
    },
    commands: [{ program: 'npm', args: ['install'] }]
  },
  'calculator': {
    name: 'Calculator App (React)',
    detect: /\b(calculator|calc|math)\b/i,
    files: {
      'package.json': `{
  "name": "calculator-app",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build" },
  "dependencies": { "react": "^18.2.0", "react-dom": "^18.2.0" },
  "devDependencies": { "@vitejs/plugin-react": "^4.2.0", "vite": "^5.0.0" }
}`,
      'vite.config.js': `import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react'; export default defineConfig({ plugins: [react()] });`,
      'index.html': `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Calculator</title></head><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>`,
      'src/main.jsx': `import React from 'react'; import ReactDOM from 'react-dom/client'; import App from './App'; ReactDOM.createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);`,
      'src/App.jsx': `import { useState } from 'react';

const BUTTONS = [
  { label: 'C', type: 'action' }, { label: '±', type: 'action' }, { label: '%', type: 'action' }, { label: '÷', type: 'op' },
  { label: '7' }, { label: '8' }, { label: '9' }, { label: '×', type: 'op' },
  { label: '4' }, { label: '5' }, { label: '6' }, { label: '−', type: 'op' },
  { label: '1' }, { label: '2' }, { label: '3' }, { label: '+', type: 'op' },
  { label: '0', span: 2 }, { label: '.' }, { label: '=', type: 'op' }
];

const OPS = { '÷': (a, b) => a / b, '×': (a, b) => a * b, '−': (a, b) => a - b, '+': (a, b) => a + b };

export default function App() {
  const [display, setDisplay] = useState('0');
  const [prev, setPrev] = useState(null);
  const [op, setOp] = useState(null);
  const [fresh, setFresh] = useState(false);

  const handle = (btn) => {
    const { label, type } = btn;
    if (label === 'C') { setDisplay('0'); setPrev(null); setOp(null); setFresh(false); return; }
    if (label === '±') { setDisplay((d) => String(-parseFloat(d))); return; }
    if (label === '%') { setDisplay((d) => String(parseFloat(d) / 100)); return; }
    if (type === 'op') {
      if (label === '=' && op && prev !== null) {
        const result = OPS[op](prev, parseFloat(display));
        setDisplay(String(result)); setPrev(null); setOp(null); setFresh(true);
      } else {
        setPrev(parseFloat(display)); setOp(label); setFresh(true);
      }
      return;
    }
    if (fresh) { setDisplay(label); setFresh(false); }
    else { setDisplay((d) => d === '0' && label !== '.' ? label : d + label); }
  };

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="bg-gray-900 rounded-2xl p-6 w-80 shadow-2xl">
        <div className="bg-gray-800 rounded-xl p-4 mb-4 text-right">
          <span className="text-4xl font-light text-white overflow-hidden">{display}</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {BUTTONS.map((btn, i) => (
            <button key={i} onClick={() => handle(btn)}
              className={\`h-14 rounded-xl text-xl font-medium transition active:scale-95 \${btn.span === 2 ? 'col-span-2' : ''} \${btn.type === 'op' ? 'bg-blue-600 hover:bg-blue-500 text-white' : btn.type === 'action' ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-800 hover:bg-gray-700 text-white'}\`}>
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );`
    },
    commands: [{ program: 'npm', args: ['install'] }]
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
