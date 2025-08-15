// Basic Node WebSocket server
import { WebSocketServer } from 'ws';
import { nanoid } from 'nanoid';
import http from 'http';

const TICK_HZ = 60;
const SNAPSHOT_HZ = 15;
const SPEED = 220;
const BULLET_SPEED = 500;
const FIRE_COOLDOWN = 180;
const WORLD = { w: 3000, h: 2000 };

const players = new Map();
const bullets = [];

const server = http.createServer((req,res) => {
  res.writeHead(200).end('OK');
});
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', ws => {
  const id = nanoid(8);
  players.set(id, { x: Math.random()*WORLD.w, y: Math.random()*WORLD.h, vx:0, vy:0, ang:0, lastFire:0 });
  ws.send(JSON.stringify({ type:'init', id }));

  ws.on('message', data => {
    const msg = JSON.parse(data);
    const p = players.get(id);
    if (!p) return;
    if (msg.type === 'input') {
      const { up, down, left, right, shoot, aim } = msg.v;
      let dx = (right?1:0) - (left?1:0);
      let dy = (down?1:0) - (up?1:0);
      const mag = Math.hypot(dx, dy) || 1;
      p.vx = (dx/mag) * SPEED;
      p.vy = (dy/mag) * SPEED;
      p.ang = Math.atan2((aim.y ?? 0) - p.y, (aim.x ?? 0) - p.x);
      const now = Date.now();
      if (shoot && now - p.lastFire > FIRE_COOLDOWN) {
        p.lastFire = now;
        const cos = Math.cos(p.ang), sin = Math.sin(p.ang);
        bullets.push({
          x: p.x + cos*24, y: p.y + sin*24,
          vx: cos*BULLET_SPEED, vy: sin*BULLET_SPEED,
          owner: id, ttl: 1500
        });
      }
    }
  });

  ws.on('close', () => players.delete(id));
});

let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = (now - last) / 1000;
  last = now;
  for (const p of players.values()) {
    p.x = Math.max(0, Math.min(WORLD.w, p.x + p.vx*dt));
    p.y = Math.max(0, Math.min(WORLD.h, p.y + p.vy*dt));
  }
  for (let i = bullets.length-1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx*dt; b.y += b.vy*dt; b.ttl -= dt*1000;
    if (b.ttl <= 0) bullets.splice(i,1);
  }
}, 1000 / TICK_HZ);

setInterval(() => {
  const snap = {
    type:'state',
    players: Object.fromEntries([...players.entries()].map(([id,p]) => [id, {x:p.x,y:p.y,ang:p.ang}])),
    bullets: bullets.map(b => ({x:b.x,y:b.y}))
  };
  const json = JSON.stringify(snap);
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(json);
  }
}, 1000 / SNAPSHOT_HZ);

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log('Listening on '+PORT));
