const { defineConfig } = require('vite');

module.exports = defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setupTests.js',
    globals: true
  }
});
