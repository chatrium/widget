const MCP_PROTOCOL_VERSION = "1.0.0";
const MCP_EVENT_NAME = 'mcp_message_internal';

/**
 * Generates unique ID for requests.
 * @returns {string} Unique ID.
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

class MCPBase {
  constructor(type, eventTarget = window, debug = false) {
    this.type = type;
    this.eventTarget = eventTarget;
    this.debug = debug;
    this.pendingRequests = new Map();
    this.requestHandlers = new Map();
    this.setupListeners();
  }

  setupListeners() {
    this.eventTarget.addEventListener(MCP_EVENT_NAME, (event) => {
      if (event.detail && event.detail.senderType === this.type) return;
      this.handleMessage(event.detail);
    });
  }

  handleMessage(message) {
    if (!message || typeof message !== 'object') return;

    // Handle JSON-RPC messages
    if (message.jsonrpc === "2.0") {
      if (message.method) {
        this.handleRequest(message);
      } else if (message.id) {
        this.handleResponse(message);
      }
    }
    // Handle MCP protocol messages
    else if (message.mcp) {
      this.handleProtocolMessage(message);
    }
  }

  send(message) {
    message.senderType = this.type;
    const event = new CustomEvent(MCP_EVENT_NAME, { detail: message });
    this.eventTarget.dispatchEvent(event);
  }

  sendRequest(method, params) {
    return new Promise((resolve, reject) => {
      const id = generateId();
      this.pendingRequests.set(id, { resolve, reject });

      this.send({
        jsonrpc: "2.0",
        id: id,
        method: method,
        params: params
      });
    });
  }

  handleRequest(request) {
    const { id, method, params } = request;
    const handler = this.requestHandlers.get(method);

    if (!handler) {
      if (id !== undefined) {
        this.send({
          jsonrpc: "2.0",
          id: id,
          error: {
            code: -32601,
            message: `Method '${method}' not found`
          }
        });
      }
      return;
    }

    try {
      const result = handler(params);
      if (result instanceof Promise) {
        result
          .then(res => {
            if (id !== undefined) {
              this.send({
                jsonrpc: "2.0",
                id: id,
                result: res
              });
            }
          })
          .catch(error => {
            this.handleRequestError(id, error);
          });
      } else {
        if (id !== undefined) {
          this.send({
            jsonrpc: "2.0",
            id: id,
            result: result
          });
        }
      }
    } catch (error) {
      this.handleRequestError(id, error);
    }
  }

  handleRequestError(id, error) {
    if (id !== undefined) {
      this.send({
        jsonrpc: "2.0",
        id: id,
        error: {
          code: error.code || -32000,
          message: error.message || "Internal error",
          data: error.data
        }
      });
    }
  }

  handleResponse(response) {
    const { id, result, error } = response;
    const pending = this.pendingRequests.get(id);

    if (pending) {
      this.pendingRequests.delete(id);
      if (error) {
        const err = new Error(`[${error.code}] ${error.message}`);
        err.data = error.data;
        pending.reject(err);
      } else {
        pending.resolve(result);
      }
    }
  }

  onRequest(method, handler) {
    this.requestHandlers.set(method, handler);
  }
}

class MCPServer extends MCPBase {
  constructor(eventTarget = window, debug = false) {
    super('server', eventTarget, debug);
    this.tools = [];
    this.resources = [];
    this.setupProtocolHandlers();
  }

  setupProtocolHandlers() {
    // Connection initialization
    this.onRequest('mcp.initialize', (params) => {
      if (params.version !== MCP_PROTOCOL_VERSION) {
        throw {
          code: 4001,
          message: `Unsupported protocol version. Client: ${params.version}, Server: ${MCP_PROTOCOL_VERSION}`
        };
      }

      // Spec-compliant capabilities format (2025-06-18)
      return {
        version: MCP_PROTOCOL_VERSION,
        capabilities: {
          tools: {},
          resources: {
            subscribe: false,      // subscriptions not implemented yet
            listChanged: false     // list change notifications not implemented yet
          }
        }
      };
    });

    // Return tools list
    this.onRequest('mcp.tools.list', () => {
      return this.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }));
    });

    // Tool execution
    this.onRequest('mcp.tools.call', async (params) => {
      const { name, arguments: args } = params;
      if (this.debug) {
        console.log('[Debug] MCP Server: Received tool call request:', name, 'with args:', args);
      }
      const tool = this.tools.find(t => t.name === name);

      if (!tool) {
        if (this.debug) {
          console.error('[Debug] MCP Server: Tool not found:', name);
        }
        throw {
          code: 4004,
          message: `Tool '${name}' not found`
        };
      }

      try {
        if (this.debug) {
          console.log('[Debug] MCP Server: Executing tool handler for:', name);
        }
        const result = await tool.handler(args);
        if (this.debug) {
          console.log('[Debug] MCP Server: Tool execution successful:', name, result);
        }
        return { success: true, result };
      } catch (error) {
        if (this.debug) {
          console.error('[Debug] MCP Server: Tool execution failed:', name, error);
        }
        throw {
          code: 5001,
          message: `Tool execution failed: ${error.message}`,
          data: error
        };
      }
    });

    // Return resources list (spec-compliant)
    this.onRequest('resources/list', () => {
      return {
        resources: this.resources.map(resource => ({
          uri: resource.uri,
          name: resource.name,
          title: resource.title,           // Spec 2025-06-18: human-readable title
          description: resource.description,
          mimeType: resource.mimeType,
          size: resource.size,             // Spec 2025-06-18: optional size in bytes
          annotations: resource.annotations
        }))
      };
    });

    // Return resources list (legacy)
    this.onRequest('mcp.resources.list', () => {
      return this.resources.map(resource => ({
        uri: resource.uri,
        name: resource.name,
        title: resource.title,
        description: resource.description,
        mimeType: resource.mimeType,
        size: resource.size,
        annotations: resource.annotations
      }));
    });

    // Read resource (spec-compliant 2025-06-18)
    this.onRequest('resources/read', async (params) => {
      const { uri } = params;
      const resource = this.resources.find(r => r.uri === uri);

      if (!resource) {
        throw {
          code: -32002,  // Spec error code for "Resource not found"
          message: `Resource not found`,
          data: { uri }
        };
      }

      try {
        const data = await resource.handler();
        const content = {
          uri: resource.uri,
          name: resource.name,                    // Spec 2025-06-18
          title: resource.title,                  // Spec 2025-06-18
          mimeType: resource.mimeType || 'application/json'
        };
        
        // Determine if data is text or binary
        if (typeof data === 'string') {
          content.text = data;
        } else if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
          // Binary data: encode as base64
          content.blob = btoa(String.fromCharCode(...new Uint8Array(data)));
        } else {
          // Object/JSON: stringify
          content.text = JSON.stringify(data, null, 2);
        }

        return { contents: [content] };
      } catch (error) {
        throw {
          code: -32603,  // Internal error
          message: `Resource read failed: ${error.message}`,
          data: error
        };
      }
    });

    // Read resource (legacy)
    this.onRequest('mcp.resources.read', async (params) => {
      const { uri } = params;
      const resource = this.resources.find(r => r.uri === uri);

      if (!resource) {
        throw {
          code: 4004,
          message: `Resource '${uri}' not found`
        };
      }

      try {
        const data = await resource.handler();
        return { success: true, data, mimeType: resource.mimeType || 'application/json' };
      } catch (error) {
        throw {
          code: 5001,
          message: `Resource read failed: ${error.message}`,
          data: error
        };
      }
    });
  }

  registerTool(tool) {
    if (!tool.name || !tool.handler) {
      throw new Error("Invalid tool definition");
    }

    // Check for duplicates
    if (this.tools.some(t => t.name === tool.name)) {
      this.tools = this.tools.filter(t => t.name !== tool.name);
    }

    this.tools.push({
      name: tool.name,
      description: tool.description || "",
      parameters: tool.parameters || {},
      handler: tool.handler
    });
    
    if (this.debug) {
      console.log('[Debug] MCP Server: Tool registered:', tool.name);
    }
  }

  registerTools(tools) {
    tools.forEach(tool => this.registerTool(tool));
  }

  registerResource(resource) {
    if (!resource.uri || !resource.handler) {
      throw new Error("Invalid resource definition");
    }

    // Check for duplicates
    if (this.resources.some(r => r.uri === resource.uri)) {
      this.resources = this.resources.filter(r => r.uri !== resource.uri);
    }

    this.resources.push({
      uri: resource.uri,
      name: resource.name || resource.uri,
      title: resource.title || resource.name || resource.uri,  // Spec 2025-06-18: human-readable title
      description: resource.description || "",
      mimeType: resource.mimeType || "application/json",
      size: resource.size,                                      // Spec 2025-06-18: optional size in bytes
      annotations: resource.annotations || {},
      handler: resource.handler
    });
  }

  registerResources(resources) {
    resources.forEach(resource => this.registerResource(resource));
  }
}

class MCPClient extends MCPBase {
  constructor(eventTarget = window, debug = false) {
    super('client', eventTarget, debug);
    this.initialized = false;
    this.tools = [];
    this.resources = [];
  }

  async initialize(retries = 3, delayMs = 100) {
    if (this.initialized) return;

    // Retry logic to handle race condition when server isn't ready yet
    let lastError;
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        // Add timeout to prevent infinite hang
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Initialize timeout')), 5000)
        );
        
        const initPromise = this.sendRequest('mcp.initialize', {
          version: MCP_PROTOCOL_VERSION,
          capabilities: {
            tools: {},
            resources: {}
          }
        });

        const response = await Promise.race([initPromise, timeoutPromise]);

        if (response.version !== MCP_PROTOCOL_VERSION) {
          throw new Error(`Protocol version mismatch. Server: ${response.version}, Client: ${MCP_PROTOCOL_VERSION}`);
        }

        this.initialized = true;
        return response;
      } catch (error) {
        lastError = error;
        if (attempt < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
          delayMs *= 2; // Exponential backoff
        }
      }
    }
    
    throw new Error(`Failed to initialize after ${retries} attempts: ${lastError.message}`);
  }

  async loadTools() {
    if (!this.initialized) {
      await this.initialize();
    }

    const tools = await this.sendRequest('mcp.tools.list');
    this.tools = tools;
    return tools;
  }

  async callTool(name, args) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.debug) {
      console.log('[Debug] MCP Client: Calling tool:', name, 'with args:', args);
    }
    const result = await this.sendRequest('mcp.tools.call', {
      name: name,
      arguments: args
    });
    if (this.debug) {
      console.log('[Debug] MCP Client: Tool call result:', result);
    }
    return result;
  }

  async loadResources() {
    if (!this.initialized) {
      await this.initialize();
    }

    const resources = await this.sendRequest('mcp.resources.list');
    this.resources = resources;
    return resources;
  }

  async readResource(uri) {
    if (!this.initialized) {
      await this.initialize();
    }

    return this.sendRequest('mcp.resources.read', {
      uri: uri
    });
  }
}

const MCP = {
  createServer: (eventTarget = window, debug = false) => new MCPServer(eventTarget, debug),
  createClient: (eventTarget = window, debug = false) => new MCPClient(eventTarget, debug),
  EVENT_NAME: MCP_EVENT_NAME,
  PROTOCOL_VERSION: MCP_PROTOCOL_VERSION
};

export default MCP;
export { MCP, MCPServer, MCPClient };

// --- External MCP Clients (WebSocket and SSE) ---

/**
 * Minimal transport-agnostic JSON-RPC client for external MCP servers over WebSocket or SSE.
 * Both clients implement: initialize(), loadTools(), callTool(name, args)
 */

class MCPExternalBaseClient {
  constructor(options = {}) {
    this.initialized = false;
    this.tools = [];
    this.resources = [];
    this.pendingRequests = new Map();
    this.requestIdCounter = 1;
    this.sessionId = options.sessionId || null;
    this.protocolVersion = options.protocolVersion || '2024-11-05';
    this.options = options || {};
    this.clientInfo = options.clientInfo || {
      name: 'smart-web-app',
      title: 'AI MCP Web App',
      version: '0.0.0'
    };
  }

  nextId() {
    return this.requestIdCounter++;
  }

  buildRequest(method, params) {
    const id = this.nextId();
    // Only include params if caller provided them
    if (params !== undefined) {
      const finalParams = typeof params === 'object' ? { ...params } : params;
      if (finalParams && typeof finalParams === 'object') {
        // Inject _meta.sessionId if params is an object
        const meta = (finalParams._meta && typeof finalParams._meta === 'object') ? { ...finalParams._meta } : {};
        // Do NOT send session for initialize requests
        const isInit = method === 'initialize' || method === 'mcp.initialize';
        if (!isInit && !meta.sessionId && this.sessionId) {
          meta.sessionId = this.sessionId;
        }
        finalParams._meta = meta;
      }
      return { jsonrpc: "2.0", id, method, params: finalParams };
    }
    return { jsonrpc: "2.0", id, method };
  }

  buildInitializeParams() {
    const params = {
      protocolVersion: this.protocolVersion,
      capabilities: {
        sampling: {},
        elicitation: {}
        // roots capability is optional for this client
      },
      clientInfo: this.clientInfo
    };
    return params;
  }

  // Override in transport subclasses
  // Sends a JSON-RPC notification (no id) without awaiting a response
  // payload MUST include { jsonrpc: "2.0", method, params? }
  // eslint-disable-next-line no-unused-vars
  async sendNotification(payload) {
    throw new Error('sendNotification not implemented');
  }

  async initialize() {
    if (this.initialized) return;
    // Try spec method first, fallback to legacy
    let res;
    try {
      res = await this.sendRequest(this.buildRequest('initialize', this.buildInitializeParams()));
    } catch (e) {
      // fallback to legacy
      res = await this.sendRequest(this.buildRequest('mcp.initialize', { version: MCP_PROTOCOL_VERSION, capabilities: ["tools"] }));
    }
    if (res && typeof res === 'object' && typeof res.protocolVersion === 'string') {
      this.protocolVersion = res.protocolVersion;
    }
    this.initialized = true;
    // Send notifications/initialized as per lifecycle and require 202, then list tools
    try {
      const status = await this.sendNotification({ jsonrpc: '2.0', method: 'notifications/initialized' });
      if (status !== 202) {
        throw new Error(`initialized notification not accepted: HTTP ${status || 'unknown'}`);
      }
      await this.loadTools();
    } catch (_) {}
    return res;
  }

  async loadTools() {
    if (!this.initialized) await this.initialize();
    // Try spec list first
    let result;
    try {
      result = await this.sendRequest(this.buildRequest('tools/list'));
    } catch (e) {
      // fallback legacy
      result = await this.sendRequest(this.buildRequest('mcp.tools.list'));
    }
    // Normalize result: spec -> { tools: [...] }, legacy -> [...]
    const tools = Array.isArray(result) ? result : (result && Array.isArray(result.tools) ? result.tools : []);
    this.tools = tools;
    return this.tools;
  }

  async loadResources() {
    if (!this.initialized) await this.initialize();
    // Try spec list first
    let result;
    try {
      result = await this.sendRequest(this.buildRequest('resources/list'));
    } catch (e) {
      // fallback legacy
      result = await this.sendRequest(this.buildRequest('mcp.resources.list'));
    }
    // Normalize result: spec -> { resources: [...] }, legacy -> [...]
    const resources = Array.isArray(result) ? result : (result && Array.isArray(result.resources) ? result.resources : []);
    this.resources = resources;
    return this.resources;
  }

  async readResource(uri) {
    if (!this.initialized) await this.initialize();
    // Try spec read first, fallback to legacy
    try {
      const res = await this.sendRequest(this.buildRequest('resources/read', { uri }));
      return res;
    } catch (e) {
      return this.sendRequest(this.buildRequest('mcp.resources.read', { uri }));
    }
  }

  async callTool(name, args) {
    if (!this.initialized) await this.initialize();
    // Try spec call first, fallback to legacy
    try {
      const res = await this.sendRequest(this.buildRequest('tools/call', { name, arguments: args }));
      return res;
    } catch (e) {
      return this.sendRequest(this.buildRequest('mcp.tools.call', { name, arguments: args }));
    }
  }
}

// Helper to append query param to URL
// Query-string helpers removed; session identifiers are not sent via URL parameters.

/**
 * WebSocket client for external MCP servers.
 * Note: In browsers, custom headers aren't supported for WebSocket. Use query params or subprotocols if needed.
 */
class MCPWebSocketClient extends MCPExternalBaseClient {
  constructor(url, options = {}) {
    super(options);
    this.url = url;
    this.options = options;
    this.ws = null;
    this.connecting = false;
    this.shouldReconnect = true;  // Control reconnection attempts
    this.reconnectTimer = null;   // Store reconnect timer to cancel it
    this.backoffMs = 500;
    this.maxBackoffMs = 8000;
    this.queue = [];
    this.sessionId = options.sessionId || null;
    this._connect();
  }

  disconnect() {
    this.shouldReconnect = false;
    
    // Cancel pending reconnection timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) { /* no-op */ }
      this.ws = null;
    }
    
    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests.entries()) {
      if (pending && typeof pending.reject === 'function') {
        pending.reject(new Error('Client disconnected'));
      }
    }
    this.pendingRequests.clear();
  }

  _connect() {
    // Don't reconnect if explicitly disconnected
    if (!this.shouldReconnect) return;
    
    if (this.connecting || (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING))) {
      return;
    }
    this.connecting = true;
    try {
      const protocols = this.options.protocols || undefined;
      this.ws = new WebSocket(this.url, protocols);
      this.ws.onopen = () => {
        this.connecting = false;
        this.backoffMs = 500;
        // flush queue
        while (this.queue.length) {
          const msg = this.queue.shift();
          try { this.ws.send(JSON.stringify(msg)); } catch (e) { /* no-op */ }
        }
      };
      this.ws.onmessage = (event) => {
        try {
          const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
          if (data && data.id !== undefined && data.jsonrpc === '2.0') {
            const pending = this.pendingRequests.get(data.id);
            if (pending) {
              this.pendingRequests.delete(data.id);
              if (data.error) {
                const err = new Error(`[${data.error.code}] ${data.error.message}`);
                err.data = data.error.data;
                pending.reject(err);
              } else {
                pending.resolve(data.result);
              }
            }
          }
        } catch (e) {
          // ignore malformed
        }
      };
      this.ws.onclose = () => {
        this.connecting = false;
        if (this.shouldReconnect) {
          this.reconnectTimer = setTimeout(() => this._connect(), this.backoffMs);
          this.backoffMs = Math.min(this.backoffMs * 2, this.maxBackoffMs);
        }
      };
      this.ws.onerror = () => {
        try { this.ws.close(); } catch (e) { /* no-op */ }
      };
    } catch (e) {
      this.connecting = false;
      if (this.shouldReconnect) {
        this.reconnectTimer = setTimeout(() => this._connect(), this.backoffMs);
        this.backoffMs = Math.min(this.backoffMs * 2, this.maxBackoffMs);
      }
    }
  }

  sendRequest(payload) {
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(payload.id, { resolve, reject });
      const sendNow = () => {
        try {
          this.ws.send(JSON.stringify(payload));
        } catch (e) {
          reject(e);
        }
      };
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        sendNow();
      } else {
        this.queue.push(payload);
        this._connect();
      }
    });
  }

  async sendNotification(notification) {
    // Ensure has no id
    const payload = { jsonrpc: '2.0', method: notification.method };
    if (notification.params !== undefined) payload.params = notification.params;
    const sendNow = () => {
      try { this.ws.send(JSON.stringify(payload)); } catch (e) { /* ignore */ }
    };
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      sendNow();
    } else {
      this.queue.push(payload);
      this._connect();
    }
  }
}

/**
 * SSE client for external MCP servers.
 * Uses EventSource for incoming events, and POST fetch for requests.
 * Assumes server emits JSON-RPC responses on SSE 'message' events with matching id.
 */
class MCPSseClient extends MCPExternalBaseClient {
  constructor(url, options = {}) {
    super(options);
    this.url = url; // SSE endpoint for events
    this.options = options;
    this.eventSource = null;
    this.shouldReconnect = true;  // Control reconnection attempts
    this.reconnectTimer = null;   // Store reconnect timer to cancel it
    this.backoffMs = 1000;
    this.maxBackoffMs = 10000;
    this.sessionId = options.sessionId || null;
    // Optional pre-initialization POST for servers requiring session setup (POST-only flow)
    if (options.initUrl) {
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        ...(options.headers || {})
      };
      // Do not include any session headers or _meta before initialization
      const body = { jsonrpc: '2.0', id: this.nextId(), method: 'initialize', params: {} };
      fetch(options.initUrl, { method: 'POST', headers, body: JSON.stringify(body) }).catch(() => {});
    }
    // By default, do NOT open GET EventSource stream. Allow only if explicitly enabled.
    if (options.listenViaGet === true) {
      this._openEventStream();
    }
  }

  disconnect() {
    this.shouldReconnect = false;
    
    // Cancel pending reconnection timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.eventSource) {
      try {
        this.eventSource.close();
      } catch (e) { /* no-op */ }
      this.eventSource = null;
    }
    
    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests.entries()) {
      if (pending && typeof pending.reject === 'function') {
        pending.reject(new Error('Client disconnected'));
      }
    }
    this.pendingRequests.clear();
  }

  async initialize() {
    if (this.initialized) return;
    // POST-first initialization via base class
    try {
      return await super.initialize();
    } catch (_) {
      // On failure, attempt a GET probe, then retry POST initialize
      try {
        const initGetUrl = this.options.initUrl || this.url;
        await fetch(initGetUrl, {
          method: 'GET',
          headers: { 'Accept': 'text/event-stream, application/json' }
        });
      } catch (_) { /* ignore GET errors */ }
      return await super.initialize();
    }
  }

  _openEventStream() {
    // Don't reconnect if explicitly disconnected
    if (!this.shouldReconnect) return;
    try {
      // Native EventSource doesn't support headers. For auth, use query params or a polyfill if needed.
      this.eventSource = new EventSource(this.url, { withCredentials: !!this.options.withCredentials });
      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.id !== undefined && data.jsonrpc === '2.0') {
            const pending = this.pendingRequests.get(data.id);
            if (pending) {
              this.pendingRequests.delete(data.id);
              if (data.error) {
                const err = new Error(`[${data.error.code}] ${data.error.message}`);
                err.data = data.error.data;
                pending.reject(err);
              } else {
                pending.resolve(data.result);
              }
            }
          }
        } catch (e) {
          // ignore
        }
      };
      this.eventSource.onerror = () => {
        try { this.eventSource.close(); } catch (e) { /* no-op */ }
        if (this.shouldReconnect) {
          this.reconnectTimer = setTimeout(() => this._openEventStream(), this.backoffMs);
          this.backoffMs = Math.min(this.backoffMs * 2, this.maxBackoffMs);
        }
      };
    } catch (e) {
      if (this.shouldReconnect) {
        this.reconnectTimer = setTimeout(() => this._openEventStream(), this.backoffMs);
        this.backoffMs = Math.min(this.backoffMs * 2, this.maxBackoffMs);
      }
    }
  }

  async sendRequest(payload) {
    // POST to the provided postUrl if set, otherwise use the original url as-is (no automatic replacement)
    const postUrl = this.options.postUrl || this.url;
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'MCP-Protocol-Version': this.protocolVersion,
      ...(this.options.headers || {})
    };
    // Do NOT send session header on initialize; set after server assigns it
    const isInit = payload && (payload.method === 'initialize' || payload.method === 'mcp.initialize');
    if (this.sessionId && !isInit) {
      if (!headers['Mcp-Session-Id']) headers['Mcp-Session-Id'] = this.sessionId;
      if (!headers['X-Session-Id']) headers['X-Session-Id'] = this.sessionId; // compatibility
    }
    this.pendingRequests.set(payload.id, {});
    try {
      const res = await fetch(postUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      // Capture session id from response if present
      try {
        const sid = res.headers && (res.headers.get('Mcp-Session-Id') || res.headers.get('mcp-session-id'));
        if (sid) this.sessionId = sid;
      } catch (_) {}
      // Reject immediately on HTTP error (e.g. 401) so caller can react
      if (res && !res.ok) {
        const body = await res.text();
        const err = new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
        err.statusCode = res.status;
        err.responseBody = body;
        this.pendingRequests.delete(payload.id);
        return Promise.reject(err);
      }
      // Some servers may respond immediately with JSON-RPC result
      if (res && res.ok) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const json = await res.json();
          if (json && json.id === payload.id) {
            const pending = this.pendingRequests.get(payload.id);
            if (pending) this.pendingRequests.delete(payload.id);
            if (json.error) {
              const err = new Error(`[${json.error.code}] ${json.error.message}`);
              err.data = json.error.data;
              return Promise.reject(err);
            }
            return json.result;
          }
        }
        if (contentType.includes('text/event-stream') && res.body) {
          // Parse SSE from the POST response body and resolve when matching id arrives
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let eventData = '';
          const processLines = () => {
            let idx;
            while ((idx = buffer.indexOf('\n')) !== -1) {
              const line = buffer.slice(0, idx).replace(/\r$/, '');
              buffer = buffer.slice(idx + 1);
              if (line.startsWith('data:')) {
                eventData += line.slice(5).trimStart() + '\n';
              } else if (line === '') {
                const dataStr = eventData.trim();
                eventData = '';
                if (dataStr) {
                  try {
                    const msg = JSON.parse(dataStr);
                    if (msg && msg.jsonrpc === '2.0' && msg.id === payload.id) {
                      const pending = this.pendingRequests.get(payload.id);
                      if (pending) this.pendingRequests.delete(payload.id);
                      if (msg.error) {
                        const err = new Error(`[${msg.error.code}] ${msg.error.message}`);
                        err.data = msg.error.data;
                        throw err;
                      }
                      throw { __resolve: msg.result };
                    }
                  } catch (e) {
                    if (e && e.__resolve !== undefined) {
                      throw e; // bubble to outer to resolve
                    }
                    // ignore non-matching or malformed events
                  }
                }
              }
            }
          };
          try {
            // eslint-disable-next-line no-constant-condition
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              processLines();
            }
          } catch (e) {
            if (e && e.__resolve !== undefined) {
              return e.__resolve;
            }
            throw e;
          }
          // If stream ended without matching response, timeout fallback
        }
      }
      // Otherwise, await SSE resolution
      return new Promise((resolve, reject) => {
        this.pendingRequests.set(payload.id, { resolve, reject });
        // Optional timeout to avoid hanging forever
        const timeoutMs = this.options.timeoutMs || 30000;
        setTimeout(() => {
          const pending = this.pendingRequests.get(payload.id);
          if (pending) {
            this.pendingRequests.delete(payload.id);
            reject(new Error('SSE request timeout'));
          }
        }, timeoutMs);
      });
    } catch (e) {
      this.pendingRequests.delete(payload.id);
      throw e;
    }
  }

  async sendNotification(notification) {
    const postUrl = this.options.postUrl || this.url;
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'MCP-Protocol-Version': this.protocolVersion,
      ...(this.options.headers || {})
    };
    // Always include session header if present (initialized must carry it)
    if (this.sessionId) {
      if (!headers['Mcp-Session-Id']) headers['Mcp-Session-Id'] = this.sessionId;
      if (!headers['X-Session-Id']) headers['X-Session-Id'] = this.sessionId;
    }
    const payload = { jsonrpc: '2.0', method: notification.method };
    if (notification.params !== undefined) payload.params = notification.params;
    try {
      const res = await fetch(postUrl, { method: 'POST', headers, body: JSON.stringify(payload) });
      return res && typeof res.status === 'number' ? res.status : undefined;
    } catch (_) { return undefined; }
  }
}

export { MCPWebSocketClient, MCPSseClient };