import http from 'http';

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', service: 'whatsapp-cloud' }));
});

server.listen(PORT, () => {
  console.log(`WhatsApp Cloud service listening on port ${PORT}`);
});
