# Chatrium Widget

![Chatrium Logo](./logo.svg)

**Your space for AI conversations**

A modern, customizable chat widget with voice input support and MCP (Model Communication Protocol) tool integration for interacting with AI assistants.

> **Chatrium** is a family of AI conversation tools. This package (`@chatrium/widget`) provides the core React chat widget component.

## Features

- **Voice Input**: Speech-to-text functionality for hands-free messaging
- **MCP Integration**: Built-in support for Model Communication Protocol tools and resources
- **MCP Resources**: Full support for contextual data (static) and real-time data (dynamic) resources
- **Customizable UI**: Multiple positioning options and component visibility settings
- **Multi-language Support**: Localization support with custom locales
- **Tool Integration**: Built-in review form tools with DOM manipulation capabilities
- **Context Management**: Automatic resource loading into AI context for enhanced understanding
- **Responsive Design**: Works on desktop and mobile devices

## Installation

```bash
npm install @chatrium/widget
```

## Building from Source

To build the widget from source for customization or contribution:

```bash
git clone https://github.com/chatrium/widget.git
cd widget
npm install
npm run build
```

The compiled assets will be generated in the `dist/` directory and can be integrated into your project.

### Unified Application Architecture
Unlike traditional AI integrations requiring separate backend services, this widget operates as a **self-contained solution** where:
- MCP server runs directly in the browser
- Tool handlers execute within your application context
- Chat client and voice interface share the same runtime
- All components communicate through an internal protocol

This architecture provides:
- **Zero external dependencies**: No backend infrastructure needed
- **Seamless DOM integration**: Tools can directly manipulate your page elements
- **Real-time execution**: Instant feedback without network latency
- **Simplified deployment**: Single JavaScript bundle integration

This makes it an exceptionally powerful yet straightforward solution for automating workflows in any web application with minimal integration effort.

## Usage

### Quick Start

#### JavaScript (Create React App)

```bash
npm install @chatrium/widget
```

```javascript
// src/App.js
import { ChatWidget, useMCPServer } from "@chatrium/widget";
import { TOOLS } from "./mcp_tools";

function App() {
  useMCPServer(TOOLS);
  
  return (
    <div className="App">
      <ChatWidget 
        llmConfigs={[{
          modelName: "gpt-4o-mini",
          baseUrl: "http://127.0.0.1:1234/v1",
          apiKey: process.env.REACT_APP_OPENAI_API_KEY,
          temperature: 0.5,
          maxContextSize: 32000,
          maxToolLoops: 5,
          toolsMode: "api"
        }]}
        locale="en"
      />
    </div>
  );
}

export default App;
```

#### TypeScript (Create React App)

```bash
npm install @chatrium/widget
```

```typescript
// src/App.tsx
import React from 'react';
import { ChatWidget, useMCPServer } from "@chatrium/widget";
import { TOOLS } from "./mcp_tools";

function App(): JSX.Element {
  useMCPServer(TOOLS);
  
  return (
    <div className="App">
      <ChatWidget 
        llmConfigs={[{
          modelName: "gpt-4o-mini",
          baseUrl: "http://127.0.0.1:1234/v1",
          apiKey: process.env.REACT_APP_OPENAI_API_KEY,
          temperature: 0.5,
          maxContextSize: 32000,
          maxToolLoops: 5,
          toolsMode: "api"
        }]}
        locale="en"
      />
    </div>
  );
}

export default App;
```

**Tool Definition (TypeScript):**

```typescript
// src/mcp_tools.ts
interface Tool {
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, any>;
      required?: string[];
    };
  };
  handler: (args: any) => Promise<any> | any;
}

export const TOOLS: Tool[] = [
  {
    function: {
      name: "exampleTool",
      description: "Example tool description",
      parameters: {
        type: "object",
        properties: {
          param1: { 
            type: "string", 
            description: "Parameter description" 
          }
        },
        required: ["param1"]
      }
    },
    handler: async (args: { param1: string }) => {
      // Tool implementation
      return { success: true, result: args.param1 };
    }
  }
];
```

#### Vite (JavaScript + JSX)

```bash
npm install @chatrium/widget
```

```javascript
// src/App.jsx
import { ChatWidget, useMCPServer } from "@chatrium/widget";
import { TOOLS } from "./mcp_tools";

function App() {
  useMCPServer(TOOLS);
  
  return (
    <ChatWidget 
      llmConfigs={[{
        modelName: "gpt-4o-mini",
        baseUrl: import.meta.env.VITE_OPENAI_BASE_URL || "http://127.0.0.1:1234/v1",
        apiKey: import.meta.env.VITE_OPENAI_API_KEY,
        temperature: 0.5,
        maxContextSize: 32000,
        maxToolLoops: 5,
        toolsMode: "api"
      }]}
      locale="en"
    />
  );
}

export default App;
```

**Environment Variables (.env):**
```
VITE_OPENAI_API_KEY=your-api-key
VITE_OPENAI_BASE_URL=http://127.0.0.1:1234/v1
```

#### Vite (TypeScript + TSX)

```bash
npm install @chatrium/widget
```

```typescript
// src/App.tsx
import { ChatWidget, useMCPServer } from "@chatrium/widget";
import { TOOLS } from "./mcp_tools";

function App(): JSX.Element {
  useMCPServer(TOOLS);
  
  return (
    <ChatWidget 
      llmConfigs={[{
        modelName: "gpt-4o-mini",
        baseUrl: import.meta.env.VITE_OPENAI_BASE_URL || "http://127.0.0.1:1234/v1",
        apiKey: import.meta.env.VITE_OPENAI_API_KEY,
        temperature: 0.5,
        maxContextSize: 32000,
        maxToolLoops: 5,
        toolsMode: "api"
      }]}
      locale="en"
    />
  );
}

export default App;
```

**Vite Configuration Note:**
The widget works out of the box with Vite. No additional configuration is needed.

#### Next.js (App Router - TypeScript)

```bash
npm install @chatrium/widget
```

```typescript
// app/components/ChatWidgetWrapper.tsx
'use client';

import { ChatWidget, useMCPServer } from "@chatrium/widget";
import { TOOLS } from "./mcp_tools";

export default function ChatWidgetWrapper() {
  useMCPServer(TOOLS);
  
  return (
    <ChatWidget 
      llmConfigs={[{
        modelName: "gpt-4o-mini",
        baseUrl: process.env.NEXT_PUBLIC_OPENAI_BASE_URL || "http://127.0.0.1:1234/v1",
        apiKey: process.env.NEXT_PUBLIC_OPENAI_API_KEY,
        temperature: 0.5,
        maxContextSize: 32000,
        maxToolLoops: 5,
        toolsMode: "api"
      }]}
      locale="en"
    />
  );
}
```

```typescript
// app/page.tsx
import ChatWidgetWrapper from './components/ChatWidgetWrapper';

export default function Home() {
  return (
    <main>
      <h1>My App</h1>
      <ChatWidgetWrapper />
    </main>
  );
}
```

**Important:** The widget must be wrapped in a client component with the `'use client'` directive because it uses browser APIs (speech recognition, event listeners).

**Environment Variables (.env.local):**
```
NEXT_PUBLIC_OPENAI_API_KEY=your-api-key
NEXT_PUBLIC_OPENAI_BASE_URL=http://127.0.0.1:1234/v1
```

#### Next.js (Pages Router - TypeScript)

```typescript
// pages/_app.tsx
import type { AppProps } from 'next/app';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
```

```typescript
// pages/index.tsx
import dynamic from 'next/dynamic';

const ChatWidgetWrapper = dynamic(
  () => import('../components/ChatWidgetWrapper'),
  { ssr: false }
);

export default function Home() {
  return (
    <main>
      <h1>My App</h1>
      <ChatWidgetWrapper />
    </main>
  );
}
```

**Note:** Use `dynamic` import with `ssr: false` to prevent server-side rendering of the widget, as it relies on browser-specific APIs.

### Basic Implementation

```javascript
import {ChatWidget, useMCPServer} from "@chatrium/widget";
import {TOOLS} from "./mcp_tools";

function App() {
  useMCPServer(TOOLS);
  
  return (
    <div className="App">
      <ChatWidget 
        llmConfigs={[{
          modelName: "gpt-4o-mini",
          baseUrl: "http://127.0.0.1:1234/v1",
          apiKey: "your-api-key",
          temperature: 0.5,
          maxContextSize: 32000,
          maxToolLoops: 5,
          toolsMode: "api"
        }]}
        locale="en"
      />
    </div>
  );
}
```

### Custom Configuration
```javascript
<ChatWidget 
  position="bottom-right"
  showComponents="both" // 'both', 'chat', 'voice'
  chatTitle="My AI Assistant"
  assistantName="Assistant" // Name displayed for AI messages
  greeting="Welcome! How can I help you today?"
  debug={false} // Enable debug logging (default: false)
  llmConfigs={[
    {
      // Primary LLM configuration
      modelName: "gpt-4o-mini",
      baseUrl: "https://api.openai.com/v1",
      apiKey: process.env.REACT_APP_OPENAI_API_KEY,
      temperature: 0.5, // 0.0-2.0 (default: 0.5)
      maxContextSize: 32000, // Maximum tokens (default: 32000)
      maxToolLoops: 5, // Max tool execution cycles (default: 5)
      systemPromptAddition: "Additional instructions...", // Optional
      validationOptions: null, // Response validation
      toolsMode: "api" // 'api' (standard) or 'prompt' (legacy)
    },
    {
      // Fallback LLM configuration (optional)
      modelName: "gpt-3.5-turbo",
      baseUrl: "https://backup-api.com/v1",
      apiKey: process.env.REACT_APP_BACKUP_API_KEY,
      temperature: 0.5
    }
  ]}
  toolsSchema={[]} // Custom tools schema (overrides MCP tools)
  locale="en"
  expandedWidth={350} // Widget width when expanded (number in pixels, "350px", or "50%" converted to 50vw)
  expandedHeight={400} // Widget height when expanded (number in pixels, "400px", or "80%" converted to 80vh)
  customLocales={{
    en: {
      openChat: "Open chat",
      voiceInput: "Voice input",
      // ... other custom translations
    }
  }}
/>
```

### External MCP Servers (WSS and HTTPS SSE)

External MCP servers support **both tools and resources**. Connect to remote servers via WebSocket or Server-Sent Events:

```javascript
<ChatWidget 
  mcpServers={{
    "files": {
      "type": "ws",
      "url": "wss://mcp.example.com/files"
    },
    "audit": {
      "type": "http-stream", 
      "url": "https://mcp.example.com/audit/sse",
      "headers": {
        "Authorization": "Bearer ${API_KEY}"
      }
    }
  }}
  envVars={{
    API_KEY: process.env.REACT_APP_API_KEY
  }}
  allowedTools={["files.readFile", "audit.logEvent"]}
  locale="en"
/>
```

**Tools and Resources from External Servers:**
- **Tools** are exposed with qualified names: `files.readFile`, `audit.logEvent`
- **Resources** are exposed with qualified URIs: `files_resource://path/to/file`, `audit_resource://logs`
- AI can access both tools and resources from external servers seamlessly

**Connection Notes:**
- For WebSocket (`type: "ws"`), browsers do not support custom headers; pass tokens via query params or subprotocols.
- For SSE (`type: "http-stream"`), headers are supported for POST requests (also accepts `"sse"` for backward compatibility).
- Environment variable substitution format: `${VAR_NAME}` or `${VAR_NAME:-default_value}`
- Use `allowedTools` to whitelist specific tools (takes priority over `blockedTools`)
- Use `blockedTools` to blacklist specific tools (all others allowed)

**Spec Compliance:**
- Supports both spec-compliant methods (`resources/list`, `resources/read`) and legacy methods (`mcp.resources.list`, `mcp.resources.read`)
- Automatic fallback to legacy methods if spec methods are not supported
- Resources from external servers are categorized based on their `cachePolicy` annotation (if provided)

### Tool Filtering

Control which tools are available to the AI:

```javascript
<ChatWidget 
  // Allow only specific tools (whitelist mode)
  allowedTools={["server1.tool1", "server2.tool2"]}
  // ... or block specific tools (blacklist mode)
  blockedTools={["dangerousTool", "server.expensiveTool"]}
/>
```

- `allowedTools`: If provided, ONLY these tools will be available (takes priority)
- `blockedTools`: If provided without allowedTools, all tools EXCEPT these will be available
- Tool names must use qualified format: `"serverId.toolName"` for external servers
- Internal tools registered via `useMCPServer` use their name directly

### Backward Compatibility

The old `externalServers` array format is still supported but deprecated:

```javascript
// Deprecated format (still works)
<ChatWidget 
  externalServers={[
    { id: 'files', transport: 'ws', url: 'wss://mcp.example.com/files' },
    { id: 'audit', transport: 'sse', url: 'https://mcp.example.com/audit/sse' }
  ]}
/>
```

**Migration:** Replace `externalServers` array with `mcpServers` object format for better MCP standard compliance.

## MCP Tool Development

### Tool Definition Structure
MCP tools follow OpenAI's function calling specification with enhanced capabilities for web automation. Each tool consists of:

1. **Function Schema**: Describes the tool's interface using JSON Schema
2. **Handler Implementation**: JavaScript function that executes when called

```javascript
export const TOOLS = [
  {
    function: {
      name: "toolName",
      description: "Clear description of what the tool does",
      parameters: {
        type: "object",
        properties: {
          // Parameter definitions with validation
        },
        required: ["requiredParameters"]
      }
    },
    handler: async (args) => {
      // Implementation logic with full DOM access
      // Can interact with page elements, APIs, etc.
    }
  }
];
```

### Key Features of MCP Tools
- **Type-safe parameters**: Automatic validation based on JSON Schema
- **Full DOM access**: Handlers can directly manipulate page elements
- **Async execution**: Support for asynchronous operations
- **Error handling**: Automatic error reporting to the AI
- **Context awareness**: Access to current page state and user interactions

### Example: Review Form Automation Tools
```javascript
export const REVIEW_TOOLS = [
  {
    function: {
      name: "fillReviewForm",
      description: "Fills product review form with provided details",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Reviewer's name" },
          stars: { 
            type: "integer", 
            minimum: 1, 
            maximum: 5,
            description: "Rating from 1-5 stars"
          },
          review: { type: "string", description: "Review text content" }
        },
        required: ["name", "stars"]
      }
    },
    handler: fillReviewForm
  },
  {
    function: {
      name: "clickSubmitReview",
      description: "Clicks review form submit button",
      parameters: { type: "object", properties: {} }
    },
    handler: clickSubmitReview
  },
  {
    function: {
      name: "clearReviewForm",
      description: "Resets all fields in the review form",
      parameters: { type: "object", properties: {} }
    },
    handler: clearReviewForm
  }
];
```

### Implementing Tool Handlers
Handler functions receive validated parameters and can interact with the DOM:

```javascript
function fillReviewForm({ name, stars, review }) {
  document.querySelector('#review-name').value = name;
  document.querySelector(`#star-rating [data-stars="${stars}"]`).click();
  if (review) document.querySelector('#review-text').value = review;
}

function clickSubmitReview() {
  document.querySelector('#review-submit').click();
}
```

## MCP Resources Development

### What are MCP Resources?

MCP Resources are **read-only data endpoints** that provide context to AI assistants. Unlike tools (which perform actions), resources supply information that helps the AI understand your application's state, configuration, and available data.

### Resource Types

**Static Resources** - Contextual data that doesn't change frequently:
- Product catalogs
- Configuration settings
- FAQ/Help content
- Reference data

**Dynamic Resources** - Real-time data that updates based on application state:
- Form field values
- User session information
- Performance statistics
- Page snapshots

### Resource Definition Structure

```javascript
export const RESOURCES = [
  {
    uri: "resource://example/product-catalog",
    name: "product-catalog",              // ID/slug (machine-readable)
    title: "Product Catalog",             // Display name (human-readable)
    description: "List of available products with prices and availability",
    mimeType: "application/json",
    handler: async () => {
      // Return resource data
      return {
        products: [
          { id: 1, name: "Smart Watch", price: 299.99, inStock: true },
          { id: 2, name: "Wireless Headphones", price: 199.99, inStock: true }
        ]
      };
    },
    annotations: {
      audience: ["user", "assistant"],    // Who can use this resource
      priority: 0.8,                       // Importance (0.0-1.0)
      cachePolicy: "static",               // "static" or "dynamic"
      lastModified: "2025-01-15T10:00:00Z" // ISO 8601 timestamp
    }
  }
];
```

### Key Resource Fields

- **`uri`** (required): Unique identifier for the resource (RFC3986 compliant)
- **`name`** (required): Machine-readable ID/slug
- **`title`** (optional): Human-readable display name
- **`description`** (optional): Detailed description for AI understanding
- **`mimeType`** (optional): Content type (default: "application/json")
- **`size`** (optional): Size in bytes
- **`handler`** (required): Async function that returns resource data
- **`annotations`** (optional): Metadata for resource behavior

### Annotations Explained

```javascript
annotations: {
  // Who should see/use this resource
  audience: ["user", "assistant"],  // or just ["assistant"] for AI-only data
  
  // How important is this resource (0.0 = optional, 1.0 = required)
  priority: 0.8,
  
  // How should this resource be cached?
  cachePolicy: "static",   // "static" = load once into AI context
                          // "dynamic" = read on-demand when needed
  
  // When was this resource last updated?
  lastModified: "2025-01-15T10:00:00Z"  // ISO 8601 format
}
```

### How Resources Work with AI

**Static Resources:**
- Pre-loaded into AI's system prompt on initialization
- Provide immediate context without requiring tool calls
- Best for reference data that doesn't change during conversation
- Size-limited to prevent prompt overflow (5KB per resource, 20KB total)

**Dynamic Resources:**
- Exposed as `readMCPResource` tool
- AI can request current data when needed
- Best for state that changes frequently
- Always returns fresh data

### Static resources by URI pattern (heuristic)

When resources are provided by an external MCP server and do not include `annotations.cachePolicy`, the widget treats as static only those whose URI contains built-in patterns (`configuration`, `catalog`, `faq`, `config`, `settings`, etc.). To mark other resources as static (e.g. a user instruction document), pass the `staticResourcePatterns` prop: an array of URI substrings. Any resource whose URI contains one of these substrings (case-insensitive) will be loaded once into the system prompt when the chat opens.

Example: for resource `mcp://mik-api/instruction`, set `staticResourcePatterns={['instruction']}` so its content is loaded into context on startup:

```javascript
<ChatWidget
  llmConfigs={[{ modelName: "gpt-4o-mini", baseUrl: "https://...", apiKey: "..." }]}
  staticResourcePatterns={['instruction']}
/>
```

### Example: Complete Resource Set

```javascript
// src/mcp_resources.js
export const RESOURCES = [
  // Static: Product catalog
  {
    uri: "resource://app/products",
    name: "products",
    title: "Product Catalog",
    description: "Available products with pricing",
    mimeType: "application/json",
    handler: async () => ({
      products: [
        { id: 1, name: "Item A", price: 99.99 },
        { id: 2, name: "Item B", price: 149.99 }
      ]
    }),
    annotations: {
      audience: ["assistant"],
      priority: 0.9,
      cachePolicy: "static",
      lastModified: "2025-01-15T10:00:00Z"
    }
  },
  
  // Dynamic: Current form state
  {
    uri: "resource://app/form-state",
    name: "form-state",
    title: "Current Form State",
    description: "Real-time form field values and validation",
    mimeType: "application/json",
    handler: async () => {
      const nameInput = document.querySelector('#name');
      const emailInput = document.querySelector('#email');
      return {
        fields: {
          name: nameInput?.value || "",
          email: emailInput?.value || ""
        },
        isValid: nameInput?.value && emailInput?.value
      };
    },
    annotations: {
      audience: ["assistant"],
      priority: 0.95,
      cachePolicy: "dynamic",
      lastModified: new Date().toISOString()  // Always current
    }
  }
];
```

### Using Resources

```javascript
import { ChatWidget, useMCPServer } from "@chatrium/widget";
import { TOOLS } from "./mcp_tools";
import { RESOURCES } from "./mcp_resources";

function App() {
  // Register both tools and resources
  useMCPServer(TOOLS, RESOURCES);
  
  return (
    <ChatWidget 
      llmConfigs={[{
        modelName: "gpt-4o-mini",
        baseUrl: "http://127.0.0.1:1234/v1",
        apiKey: process.env.REACT_APP_OPENAI_API_KEY,
        temperature: 0.5,
        maxContextSize: 32000,
        maxToolLoops: 5,
        toolsMode: "api"
      }]}
      locale="en"
    />
  );
}
```

### Benefits of MCP Resources

1. **Enhanced AI Context**: AI has immediate access to your app's data
2. **Reduced Prompt Engineering**: No need to manually describe your data in prompts
3. **Real-time Data Access**: Dynamic resources always return current state
4. **Standardized Protocol**: Follows MCP 2025-06-18 specification
5. **Performance Optimized**: Automatic size limiting and caching strategies

## Internal MCP Server Integration

Initialize the MCP server with your tool and resource definitions:

```javascript
// Tools only
useMCPServer(TOOLS);

// Tools and resources
useMCPServer(TOOLS, RESOURCES);

// Resources only
useMCPServer([], RESOURCES);
```

## API Configuration

### LLM Configuration (Breaking Change in v2.0)

**New Format (v2.0+):** The widget now uses an `llmConfigs` array for LLM configuration, replacing individual props. This enables multiple LLM configurations with automatic fallback.

```javascript
llmConfigs={[
  {
    modelName: "gpt-4o-mini",        // AI model name
    baseUrl: "https://api.openai.com/v1", // API endpoint URL
    apiKey: "your-api-key",          // Authentication key
    temperature: 0.5,                // Generation temperature (0.0-2.0)
    maxContextSize: 32000,           // Maximum context tokens
    maxToolLoops: 5,                 // Max tool execution cycles
    systemPromptAddition: null,      // Optional system prompt addition
    validationOptions: null,         // Response validation options
    toolsMode: "api"                 // 'api' (standard) or 'prompt' (legacy)
  }
]}
```

### LLM Configuration Properties

Each configuration object in the `llmConfigs` array supports:

- **modelName** (string): AI model identifier (default: 'gpt-4o-mini')
- **baseUrl** (string): API endpoint URL (default: 'http://127.0.0.1:1234/v1')
- **apiKey** (string|null): Authentication key for API access
- **temperature** (number): Generation temperature 0.0-2.0 (default: 0.5)
- **maxContextSize** (number): Maximum context size in tokens (default: 32000)
- **maxToolLoops** (number): Maximum tool execution cycles (default: 5)
- **systemPromptAddition** (string|null): Additional system prompt text
- **validationOptions** (object|null): Response validation configuration
- **toolsMode** (string): Tools integration mode (default: 'api')
  - `'api'`: Standard mode - tools passed via OpenAI API `tools` parameter only (recommended for GPT-4, Claude, and other modern models)
  - `'prompt'`: Legacy mode - tools passed via API parameter AND listed in system prompt (for compatibility with older/custom models that need tools described in prompt)

### Automatic Fallback

When multiple configurations are provided, the widget automatically tries each one in order if an error occurs:

```javascript
llmConfigs={[
  {
    modelName: "gpt-4o",
    baseUrl: "https://primary-api.com/v1",
    apiKey: "primary-key"
  },
  {
    modelName: "gpt-3.5-turbo",
    baseUrl: "https://backup-api.com/v1",
    apiKey: "backup-key"
  }
]}
```

- If the first config fails, automatically switches to the second
- On successful request, resets back to the first (primary) config
- Only shows error when all configs have failed
- Fallback messages logged to console for debugging

### Migration Guide (v1.x → v2.0)

**Old Format (v1.x - DEPRECATED):**
```javascript
<ChatWidget 
  modelName="gpt-4o-mini"
  baseUrl="http://127.0.0.1:1234/v1"
  apiKey="your-api-key"
  temperature={0.5}
  maxContextSize={32000}
  maxToolLoops={5}
  toolsMode="api"
/>
```

**New Format (v2.0+):**
```javascript
<ChatWidget 
  llmConfigs={[{
    modelName: "gpt-4o-mini",
    baseUrl: "http://127.0.0.1:1234/v1",
    apiKey: "your-api-key",
    temperature: 0.5,
    maxContextSize: 32000,
    maxToolLoops: 5,
    toolsMode: "api"
  }]}
/>
```

**Migration Steps:**
1. Wrap all LLM-related props in an `llmConfigs` array
2. Move the following props into the config object:
   - `modelName`, `baseUrl`, `apiKey`
   - `temperature`, `maxContextSize`, `maxToolLoops`
   - `systemPromptAddition`, `validationOptions`, `toolsMode`
3. Remove individual props from the widget level
4. Optionally add fallback configurations to the array

### System Prompts

The widget uses localized system prompts that instruct the AI on how to use tools properly. The prompts vary based on the `toolsMode`:

**Standard Mode (`toolsMode: 'api'`):**
```
You are a browser assistant. You can perform actions on web pages using strictly defined tools.

Rules:
1. All actions are performed ONLY through tool calls.
2. If there is not enough information - clarify with the user.
3. Respond in [language based on locale].
4. When requesting a tool, use standard tool_calls only.
```

**Legacy Mode (`toolsMode: 'prompt'`):**
```
You are a browser assistant. You can perform actions on web pages using strictly defined tools.

Available tools:
[List of available tools with descriptions]

Rules:
1. All actions are performed ONLY through tool calls.
2. If there is not enough information - clarify with the user.
3. Respond in [language based on locale].
4. When requesting a tool, use format: [{"name": "tool_name", "arguments": {...}}]
```

System prompts are automatically localized for `en`, `ru`, and `zh` locales and can be customized if needed

### Widget Configuration

#### Positioning
Available positions:
- `top-left`
- `top-right` 
- `bottom-left`
- `bottom-right` (default)

#### Component Visibility
- `showComponents`: Controls which components are visible
  - `'both'` (default): Show both chat and voice buttons
  - `'chat'`: Show only chat button
  - `'voice'`: Show only voice button

#### Widget Sizing
- `expandedWidth`: Width of expanded chat widget (default: 350)
  - Accepts: number (pixels), "350px", "50%" (converted to 50vw viewport width), or "50vw"
- `expandedHeight`: Height of expanded chat widget (default: 400)
  - Accepts: number (pixels), "400px", "80%" (converted to 80vh viewport height), or "80vh"

#### Context Management

Context size is configured per LLM config in the `llmConfigs` array (see API Configuration section above):
- When the conversation exceeds the `maxContextSize` limit, oldest messages are automatically excluded from being sent to the LLM
- System message (first message) is always preserved
- Excluded messages remain visible in the UI but are dimmed and marked with a warning icon
- Hovering over excluded messages shows a tooltip explaining they won't be sent to the AI assistant
- Token counting: Uses accurate tiktoken (cl100k_base) if installed, otherwise falls back to approximate counting (~3.5 chars per token)
- **Note**: For accurate token counting, install `js-tiktoken` as an optional dependency: `npm install js-tiktoken` (~21MB). Without it, the widget uses approximate counting and is ~20MB smaller.

#### Tool Execution Control

Tool execution limits are configured per LLM config in the `llmConfigs` array (see API Configuration section above):
- `maxToolLoops` controls how many times the AI assistant can call tools in a single conversation turn
- Prevents infinite loops and excessive API calls
- Each cycle: AI calls tools → tools execute → AI processes results → (repeat if needed)
- When limit is reached, the conversation ends with an error message
- Recommended range: 3-10 depending on task complexity

#### Assistant Customization
- `assistantName`: Name displayed for AI assistant messages (default: 'AI')
- `chatTitle`: Title shown in chat header (default: 'AI Assistant Chat')
- `greeting`: Welcome message displayed when chat opens

#### Tools Configuration
- `toolsSchema`: Custom tools schema array (overrides MCP tools if provided)
- Tool-related settings (`toolsMode`, `validationOptions`) are configured per LLM in the `llmConfigs` array

#### MCP Resources
- `staticResourcePatterns` (array of strings, optional): URI substrings for heuristic static resource detection. If a resource's URI (case-insensitive) contains any of these substrings, the resource is treated as static and loaded into the system prompt once when the chat opens. Use when resources come from an external MCP server without `annotations.cachePolicy`. Example: `staticResourcePatterns={['instruction']}` makes `mcp://mik-api/instruction` load into context on startup.

#### Debug Mode
- `debug` (boolean, default: `false`): Enable detailed console logging

When enabled, logs the following to browser console:
- **MCP Protocol**: Client initialization, server connections, tool/resource loading
- **LLM API Calls**: Request parameters, response metadata, streaming status
- **Tool Execution**: Tool calls with arguments, execution results, errors
- **Fallback Events**: Config switching, retry attempts, success/failure status

Example:
```javascript
<ChatWidget 
  debug={true}  // Enable debug logging
  llmConfigs={[...]}
/>
```

Debug output format:
```
[Debug] MCP Client: Initializing...
[Debug] MCP Client: Protocol initialized
[Debug] MCP Client: Internal tools loaded { count: 3, tools: ['tool1', 'tool2', 'tool3'] }
[Debug] OpenAI API Request: { model: 'gpt-4o-mini', messageCount: 5, toolsCount: 3 }
[Debug] Executing Tool Calls: { count: 1, tools: ['getTool'] }
[Debug] Tool Call: getTool { id: 'call_123', args: {...} }
[Debug] Tool Result: getTool { id: 'call_123', success: true }
[Debug] OpenAI API Response: { model: 'gpt-4o-mini', finishReason: 'stop', contentLength: 145 }
```

**Note:** Debug mode is for development only. Disable in production to reduce console noise and improve performance.

## Localization

### Supported Languages
The widget includes built-in localization for:
- **English** (`en`)
- **Russian** (`ru`)
- **Chinese** (`zh`)

Set the locale using the `locale` prop:
```javascript
<ChatWidget locale="ru" />
```

### Custom Locales

You can add custom translations or override existing ones:

```javascript
const customLocales = {
  fr: {
    // Chat widget labels
    openChat: "Ouvrir le chat",
    voiceInput: "Entrée vocale",
    stopRecording: "Arrêter l'enregistrement",
    voiceNotSupported: "Reconnaissance vocale non prise en charge",
    clearChat: "Effacer le chat",
    collapseChat: "Réduire le chat",
    
    // Message placeholders and status
    enterMessage: "Tapez votre message...",
    speaking: "En train de parler...",
    thinking: "réfléchit...",
    user: "Utilisateur",
    tool: "Outil",
    error: "Erreur",
    greetingTitle: "Bienvenue",
    
    // Tool execution messages
    callingToolGeneric: "Exécution de l'outil...",
    
    // Error messages (voice recognition)
    noSpeech: "Aucun son détecté",
    audioCapture: "Erreur de capture audio",
    notAllowed: "Microphone non autorisé",
    notSupported: "Reconnaissance vocale non prise en charge",
    network: "Erreur réseau",
    unknown: "Erreur inconnue"
  }
};

<ChatWidget 
  customLocales={customLocales} 
  locale="fr" 
/>
```

**Note:** Custom locales are merged with built-in translations, so you only need to specify the keys you want to override or add

## Styling

The widget uses **CSS Modules** for scoped styling, ensuring no conflicts with your application's styles.

### Built-in Features
- Gradient backgrounds
- Smooth animations and transitions
- Responsive shadows
- Mobile-friendly design
- Markdown rendering support (headings, lists, code blocks, tables, checkboxes)

### Theme Customization

You can customize the widget's appearance using the `theme` prop:

```javascript
<ChatWidget 
  theme={{
    // Collapsed state buttons
    mainButtonBackground: 'linear-gradient(145deg, #667eea, #764ba2)',
    mainButtonColor: 'white',
    voiceButtonBackground: 'linear-gradient(145deg, #f093fb, #f5576c)',
    
    // Expanded state - header
    headerBackground: 'linear-gradient(135deg, #667eea, #764ba2)',
    headerTextColor: 'white',
    
    // Messages
    messagesBackground: '#f5f5f5',
    userMessageBackground: 'linear-gradient(135deg, #667eea, #764ba2)',
    userMessageColor: 'white',
    assistantMessageBackground: 'white',
    assistantMessageColor: '#333',
    
    // Input area
    inputBackground: 'white',
    sendButtonBackground: 'linear-gradient(145deg, #667eea, #764ba2)',
    
    // Custom images (optional)
    headerIcon: '/path/to/icon.png',
    botAvatar: '/path/to/bot-avatar.png',
    userAvatar: '/path/to/user-avatar.png',
    expandedBackgroundImage: '/path/to/background.png'
  }}
/>
```

All theme properties are optional and will fall back to default values if not specified.

### Custom Component

For complete control over the UI, you can provide a custom component:

```javascript
<ChatWidget 
  customComponent={<YourCustomChatUI />}
/>
```

Your custom component will receive all widget props and state as props, allowing you to build a completely custom interface while leveraging the widget's logic

## Browser Support
- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## Development

### Project Structure
```
src/
├── index.js                      # Main export file
├── lib/
│   ├── ChatWidget/
│   │   ├── ChatWidget.js         # Main chat widget component
│   │   ├── ChatWidget.module.css # CSS modules for styling
│   │   └── locales/              # Widget UI translations
│   │       ├── index.js
│   │       ├── en.js
│   │       ├── ru.js
│   │       └── zh.js
│   ├── locales/
│   │   └── openai/               # System prompt translations
│   │       ├── index.js
│   │       ├── en.js
│   │       ├── ru.js
│   │       └── zh.js
│   ├── mcp_core.js               # MCP protocol implementation (tools & resources)
│   ├── useMCPClient.js           # React hook for MCP client
│   ├── useMCPServer.js           # React hook for MCP server
│   ├── useOpenAIChat.js          # Chat logic and OpenAI integration
│   └── voiceInput.js             # Voice recognition module
└── examples/                      # Example implementations (not included in build)
    ├── mcp_tools_en.js           # Example MCP tools
    ├── mcp_resources_en.js       # Example MCP resources (new in v1.5.0)
    └── ...
```

### Build System

The project uses Rollup for bundling with automatic version injection:

- **Version and Repository URL**: Automatically injected from `package.json` during build using `@rollup/plugin-replace`
- **CSS Modules**: Scoped styles with hash-based class names for isolation
- **Multiple Output Formats**: CommonJS, ES Modules, and UMD for maximum compatibility
- **Tree Shaking**: Dead code elimination in ES module build
- **Minification**: Optimized production bundles with Terser

**Build Configuration**: `rollup.config.cjs`
```javascript
// Version and repository URL are automatically replaced from package.json
replace({
  preventAssignment: true,
  values: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __REPO_URL__: JSON.stringify(pkg.repository.url)
  }
})
```

### Key Components
- **ChatWidget**: Main UI component
- **useOpenAIChat**: Chat logic and message handling
- **voiceInput**: Speech recognition module
  - Isolated voice recognition logic with clean API
  - Prevents duplicate message delivery
  - Handles all Speech Recognition API edge cases
- **MCP Core**: Protocol implementation for tool and resource communication
- **MCP Tools**: Built-in DOM manipulation tools
- **MCP Resources**: Read-only data endpoints for AI context (new in v1.5.0)
  - Static resources: Pre-loaded contextual data
  - Dynamic resources: Real-time on-demand data
  - Spec-compliant with MCP 2025-06-18
- **useMCPClient/Server**: React hooks for MCP integration

## Contributing
1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

MIT License - see LICENSE file for details.

## Brand Guidelines

For information about using the Chatrium brand, logo, and visual identity, please see our [Brand Guidelines](./BRAND_GUIDELINES.md).

## Chatrium Ecosystem

**Chatrium** is a family of tools for building AI-powered conversational interfaces:

- **@chatrium/widget** (this package) - React chat widget with voice input and MCP integration
- **@chatrium/server** _(coming soon)_ - Backend MCP server implementation
- **@chatrium/cli** _(coming soon)_ - Command-line tools for Chatrium development
- **@chatrium/tools** _(coming soon)_ - Reusable MCP tool collection

## Support

For issues and feature requests, please use the [GitHub issue tracker](https://github.com/chatrium/widget/issues).

## Links

- **NPM Package**: https://www.npmjs.com/package/@chatrium/widget
- **GitHub Organization**: https://github.com/chatrium
- **Widget Repository**: https://github.com/chatrium/widget
- **Documentation**: https://github.com/chatrium/widget#readme
- **Brand Guidelines**: [BRAND_GUIDELINES.md](./BRAND_GUIDELINES.md)