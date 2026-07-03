import './env';
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { initSocketIO } from './lib/socket/server';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  // Attach Socket.IO
  initSocketIO(server);

  server.listen(port, () => {
    console.log(`> Local:   http://${hostname === '0.0.0.0' ? 'localhost' : hostname}:${port}`);
    
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]!) {
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`> Network: http://${net.address}:${port}`);
        }
      }
    }

    console.log(`> Socket.IO attached`);
  });
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
