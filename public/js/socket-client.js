export class ReconnectingSocket {
  constructor(role, onEvent, onConnection, options = {}) {
    this.role = role;
    this.onEvent = onEvent;
    this.onConnection = onConnection;
    this.attempt = 0;
    this.intentionalClose = false;
    this.helloData = options.helloData ?? (() => ({}));
    this.heartbeatMs = options.heartbeatMs ?? 2000;
    this.heartbeatTimer = null;
    this.connect();
  }

  connect() {
    this.onConnection('connecting');
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.socket = new WebSocket(`${protocol}//${location.host}/ws`);
    this.socket.addEventListener('open', () => {
      this.attempt = 0;
      this.onConnection('connected');
      this.send({ type: 'hello', role: this.role, ...this.helloData() });
      if (this.role === 'display') {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = window.setInterval(() => this.send({ type: 'heartbeat' }), this.heartbeatMs);
      }
    });
    this.socket.addEventListener('message', (message) => {
      try { this.onEvent(JSON.parse(message.data)); }
      catch (error) { console.error('受信データを解釈できません', error); }
    });
    this.socket.addEventListener('close', () => {
      clearInterval(this.heartbeatTimer);
      this.onConnection('disconnected');
      if (this.intentionalClose) return;
      const delay = Math.min(5000, 500 * (2 ** this.attempt++));
      window.setTimeout(() => this.connect(), delay);
    });
    this.socket.addEventListener('error', () => this.socket.close());
  }

  send(event) {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(event));
    return true;
  }
}
