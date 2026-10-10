// Minimal RFC6455 client over node:net, enough for CDP on loopback.
//
// Why not the `ws` package: this host's node is 20.5.1, which has no global
// WebSocket (unflagged in 22), and a board layout test is not worth a new
// dependency in the workspace. Scope is deliberately narrow — loopback only,
// no TLS, no permessage-deflate, no ping/pong beyond an auto-reply, and
// continuation frames are reassembled but control frames interleaved inside a
// fragmented message are not. Chrome's CDP endpoint never sends either on
// loopback. If this ever talks to anything but local Chrome, use a real client.
import net from "node:net";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";

export function connect(url) {
  const u = new URL(url);
  const key = crypto.randomBytes(16).toString("base64");
  const em = new EventEmitter();
  const sock = net.connect(Number(u.port || 80), u.hostname);
  let handshook = false;
  let buf = Buffer.alloc(0);
  const frags = [];

  sock.on("error", (e) => em.emit("error", e));
  sock.on("close", () => em.emit("close"));

  sock.on("connect", () => {
    sock.write(
      `GET ${u.pathname}${u.search} HTTP/1.1\r\n` +
        `Host: ${u.host}\r\n` +
        "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
        `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`
    );
  });

  sock.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    if (!handshook) {
      const end = buf.indexOf("\r\n\r\n");
      if (end < 0) return;
      const head = buf.subarray(0, end).toString("latin1");
      if (!/^HTTP\/1\.1 101/.test(head)) {
        em.emit("error", new Error(`handshake failed: ${head.split("\r\n")[0]}`));
        return sock.destroy();
      }
      buf = buf.subarray(end + 4);
      handshook = true;
      em.emit("open");
    }
    // Server-to-client frames are never masked.
    for (;;) {
      if (buf.length < 2) return;
      const fin = (buf[0] & 0x80) !== 0;
      const op = buf[0] & 0x0f;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) {
        if (buf.length < 4) return;
        len = buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (buf.length < 10) return;
        const big = buf.readBigUInt64BE(2);
        if (big > 268435456n) {
          em.emit("error", new Error(`frame too large: ${big}`));
          return sock.destroy();
        }
        len = Number(big);
        off = 10;
      }
      if (buf.length < off + len) return;
      const payload = buf.subarray(off, off + len);
      buf = buf.subarray(off + len);
      if (op === 0x8) return sock.destroy(); // close
      if (op === 0x9) {
        send(payload, 0xa); // pong
        continue;
      }
      if (op === 0xa) continue;
      frags.push(payload);
      if (fin) {
        const msg = Buffer.concat(frags).toString("utf8");
        frags.length = 0;
        em.emit("message", msg);
      }
    }
  });

  function send(data, op = 0x1) {
    const body = Buffer.isBuffer(data) ? data : Buffer.from(String(data), "utf8");
    const mask = crypto.randomBytes(4);
    let head;
    if (body.length < 126) head = Buffer.from([0x80 | op, 0x80 | body.length]);
    else if (body.length < 65536) {
      head = Buffer.alloc(4);
      head[0] = 0x80 | op;
      head[1] = 0x80 | 126;
      head.writeUInt16BE(body.length, 2);
    } else {
      head = Buffer.alloc(10);
      head[0] = 0x80 | op;
      head[1] = 0x80 | 127;
      head.writeBigUInt64BE(BigInt(body.length), 2);
    }
    const masked = Buffer.allocUnsafe(body.length);
    for (let i = 0; i < body.length; i++) masked[i] = body[i] ^ mask[i & 3];
    sock.write(Buffer.concat([head, mask, masked]));
  }

  em.send = send;
  em.close = () => sock.destroy();
  return em;
}
