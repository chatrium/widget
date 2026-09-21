# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.9] - 2026-09-21

### Fixed
- Widget styles apply again on `import { ChatWidget }` without a separate CSS import
  - 3.0.8 extracted CSS to `@chatrium/widget/styles` and stopped injecting it into the JS bundle
  - Existing apps that did not add that import rendered unstyled controls
  - Styles are injected into CJS/ESM/UMD again; `import "@chatrium/widget/styles"` remains optional

## [3.0.8] - 2026-09-19

### Added
- Cancel control on the send button while the assistant is answering
  - Replaces the disabled send button with a red ×
  - Aborts the in-flight LLM request immediately
  - Removes the partial assistant reply and the last user bubble
  - Restores the last user query into the input field

### Fixed
- Tool/resource names with `_` are no longer mis-routed unless the prefix is a known MCP server
- Tool-call history stays in valid pairs (save/trim/parse) so follow-up completions do not 400
- `maxToolLoops` off-by-one no longer drops the last allowed loop
- MCP JSON-RPC method fallback only on `-32601`/`-32600`; SSE errors now propagate
- MCP client/server lifecycle: per-instance server, reconnect on config change, destroy/timeout cleanup
- Voice input: unknown locale falls back to `en-US`; handlers detach on cleanup

### Changed
- `js-tiktoken` is no longer bundled; it is an optional peer/install
- CJS build is `dist/index.cjs`; UMD uses classic JSX (`React.createElement`)
- CSS is extracted to `chat-widget.css` (`@chatrium/widget/styles`)
- Markdown messages and tool schemas are memoized; conversation loop is unified

## [3.0.3] - 2025-10-27

### Improved
- Auto-focus input field after assistant completes response
  - Input field now automatically receives focus when assistant finishes responding
  - Focus is set only when all assistant activities are complete (loading, streaming, tool execution)
  - Improves UX by allowing immediate user input without clicking the field

## [3.0.2] - 2025-10-27

### Changed
- Updated brand logos (logo.svg and logo-dark.svg) with refined design
- Removed MCP_SPEC_COMPLIANCE_REPORT.md from documentation

## [3.0.1] - 2025-10-27

### Changed
- Removed redundant documentation files (migration guides, internal plans)
- Kept only essential documentation: README, CHANGELOG, BRAND_GUIDELINES, LOGO_USAGE

## [3.0.0] - 2025-10-27

### 🎉 Major Release: Rebranding to Chatrium

This release represents a complete rebranding of the project from "ai-mcp-web-app" to "Chatrium Widget" - a name that better reflects the essence of the project as a space for AI conversations.

**Chatrium** is now a family of AI conversation tools, and this package is the first: `@chatrium/widget`.

### 🚨 Breaking Changes

**Package Name Change:**
- Old package name: `ai-mcp-web-app`
- New package name: `@chatrium/widget`
- Repository moved: `ATsepelev/ai-mcp-web-app` → `chatrium/widget`
- GitHub organization created for Chatrium ecosystem

**Migration Required:**

```bash
# Uninstall old package
npm uninstall ai-mcp-web-app

# Install new package
npm install @chatrium/widget
```

Update all imports in your code:

```javascript
// Before
import { ChatWidget, useMCPServer } from "ai-mcp-web-app";

// After
import { ChatWidget, useMCPServer } from "@chatrium/widget";
```

### Added

- **New Brand Identity**: 
  - Brand name: "Chatrium" (pronunciation: CHAT-ree-um)
  - Tagline: "Your space for AI conversations"
  - New logo with hexagonal design representing a "space" for conversations
  - Complete brand guidelines document (BRAND_GUIDELINES.md)
  - Chatrium ecosystem created for future AI conversation tools

- **Visual Assets**:
  - New logo in SVG format with gradient design (blue to purple)
  - Hexagonal icon symbolizing conversation space
  - Modern color palette: Deep Blue (#2563EB) to Purple (#7C3AED)

- **Brand Guidelines**: Comprehensive documentation including:
  - Logo usage rules and variations
  - Color palette (primary, functional, neutral)
  - Typography guidelines (Inter, Space Grotesk, JetBrains Mono)
  - Voice and tone guidelines
  - UI design system

### Changed

- **Package Metadata**:
  - Version bumped to 3.0.0
  - Package name: `@chatrium/widget` (scoped package)
  - Description updated to "Chatrium Widget"
  - Keywords updated with "chatrium", "chat-widget", "conversational-ai"
  - Repository moved to GitHub organization: `chatrium/widget`

- **Documentation**:
  - README.md updated with Chatrium branding
  - All references to "ai-mcp-web-app" replaced with "Chatrium"
  - New brand guidelines section added
  - Updated examples with new import statements

### Technical

- All core functionality remains unchanged
- No API changes - fully compatible with v2.0.0 code (except package name)
- Build configuration unchanged
- All features from v2.0.0 preserved

### Migration from v2.0.0

**Step 1: Update package.json**
```json
{
  "dependencies": {
    "@chatrium/widget": "^3.0.0"
  }
}
```

**Step 2: Update imports throughout your codebase**
```bash
# Find and replace in all files
ai-mcp-web-app → @chatrium/widget
```

**Step 3: Install and test**
```bash
npm install
npm start
```

### Why Chatrium?

The name "Chatrium" combines "Chat" with the suffix "-rium" (as in auditorium, aquarium), creating an association with a **space** or **room** for conversations. It's:
- Modern and memorable
- Easy to pronounce in multiple languages
- Unique and brandable
- Reflects the core purpose: a space for AI conversations
- Scalable as an ecosystem of AI conversation tools

### Chatrium Ecosystem

**@chatrium/widget** is the first package in the Chatrium family. Future packages will include:
- `@chatrium/server` - Backend MCP server implementation
- `@chatrium/cli` - Development and deployment tools
- `@chatrium/tools` - Reusable MCP tool library
- And more...

### Links

- **NPM Package**: https://www.npmjs.com/package/@chatrium/widget
- **GitHub Organization**: https://github.com/chatrium
- **Widget Repository**: https://github.com/chatrium/widget
- **Documentation**: https://github.com/chatrium/widget#readme
- **Brand Guidelines**: [BRAND_GUIDELINES.md](./BRAND_GUIDELINES.md)

---

## [2.0.0] - 2025-01-27

### 🎉 Breaking Changes: LLM Configuration Refactor

This major release consolidates LLM configuration into an OpenAI-style array format and adds automatic fallback support.

### Added
- **Debug Mode**: New `debug` prop for detailed console logging (default: false)
  - MCP protocol initialization and server connections
  - LLM API requests and responses
  - Tool execution with arguments and results
  - Fallback events and config switching
  - Formatted output with `[Debug]` prefix for easy filtering
  - Development-only feature, should be disabled in production

### Changed
- **LLM Configuration Structure** (BREAKING): Individual LLM props replaced with `llmConfigs` array
  - Old props removed: `modelName`, `baseUrl`, `apiKey`, `temperature`, `maxContextSize`, `maxToolLoops`, `systemPromptAddition`, `validationOptions`, `toolsMode`
  - New prop: `llmConfigs` - array of configuration objects
  - Each config object contains all LLM-related settings
  - OpenAI-style configuration format for familiarity
  - See migration guide in README for conversion instructions

### Added
- **Automatic Fallback Support**: Multiple LLM configurations with automatic failover
  - Supports multiple API endpoints in priority order
  - Automatically tries next config when current one fails
  - Resets to primary config on successful request
  - Fallback progression logged to console for debugging
  - Enables high-availability deployments with backup LLMs
  
- **Per-Config Settings**: Each LLM configuration can have different:
  - Model name and API endpoint
  - Temperature and context size
  - Tool execution limits
  - System prompt additions
  - Validation options
  - Tools mode (api/prompt)

### Technical
- Updated `ChatWidget.js` to accept `llmConfigs` prop
- Refactored `useOpenAIChat.js` hook:
  - New function signature with `llmConfigs` parameter
  - State management for current config index
  - Fallback logic in error handlers
  - Config normalization with defaults
  - Success reset to primary config
- Updated `chatHistoryStorage.js`:
  - `generateStorageKey()` accepts llmConfigs array
  - Backwards compatible with old format
  - Uses first config for key generation
- Updated example applications to use new format
- Comprehensive README documentation with migration guide

### Migration from v1.x

**Before (v1.x):**
```javascript
<ChatWidget 
  modelName="gpt-4o-mini"
  baseUrl="http://127.0.0.1:1234/v1"
  apiKey="your-api-key"
  temperature={0.5}
  maxContextSize={32000}
/>
```

**After (v2.0):**
```javascript
<ChatWidget 
  llmConfigs={[{
    modelName: "gpt-4o-mini",
    baseUrl: "http://127.0.0.1:1234/v1",
    apiKey: "your-api-key",
    temperature: 0.5,
    maxContextSize: 32000
  }]}
/>
```

**With Fallback (v2.0):**
```javascript
<ChatWidget 
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
/>
```

## [1.6.3] - 2025-01-26

### Fixed
- **Critical: Internal MCP Tool Call Recognition**: Fixed issue where internal MCP server tools were not being invoked
  - Root cause: `parseAssistantResponse` was incorrectly removing opening `{` and closing `}` from JSON tool calls
  - Added check to skip aggressive brace cleanup if content looks like JSON (starts with `{` and ends with `}`)
  - LLM tool call responses now correctly recognized and parsed
  - Tools execute properly on first attempt without fallback/retry logic
  - Significantly improved tool invocation reliability for models that return JSON in content field

### Changed
- **Production Optimization**: Removed all debug console.log statements from production code
  - Cleaned up `useOpenAIChat.js`: removed initialization, streaming, and parsing debug logs
  - Cleaned up `useMCPClient.js`: removed client initialization and tool routing debug logs
  - Cleaned up `ChatWidget.js`: removed MCP client status debug logs
  - Cleaner console output in production environments
  - Slightly improved runtime performance

### Technical
- Modified `parseAssistantResponse()` to preserve JSON structure when detecting tool calls
- Added `looksLikeJson` check before applying orphaned brace cleanup regex
- Ensures tool call JSON is parsed correctly even when sent in `content` field instead of `tool_calls`
- Removed 60+ debug log statements across core modules

## [1.6.2] - 2025-01-26

### Fixed
- **Chat History Notification**: Fixed notification popup appearing on page reload when history is loaded from IndexedDB
  - Added `isLoadingHistory` flag to distinguish between loading history and receiving new messages
  - Notification popup now only appears for genuinely new assistant messages, not for loaded history
  - Flag automatically resets after history is loaded (100ms delay)
  - Exported `isLoadingHistory` from `useOpenAIChat` hook for custom component support

### Technical
- Added `isLoadingHistory` state to `useOpenAIChat` hook
- Updated notification detection logic in `ChatWidget` to check `isLoadingHistory` flag
- Added `isLoadingHistory` to custom component props for advanced users

## [1.6.1] - 2025-01-26

### Added
- **Chat History Persistence**: Automatic chat history storage using IndexedDB
  - History persists across page reloads
  - Per-configuration storage (separate for each model + baseUrl + apiKey combination)
  - Age-based filtering with configurable depth (default: 24 hours)
  - Automatic cleanup of old messages
  - Context size aware (respects `maxContextSize` parameter)
  - Enabled by default with `persistChatHistory={true}`
  
- **New Props for ChatWidget**:
  - `persistChatHistory` (boolean, default: `true`) - Enable/disable history persistence
  - `historyDepthHours` (number, default: `24`) - Maximum age of messages to keep (in hours)
  
- **New Utility Module**: `chatHistoryStorage.js` with public API:
  - `generateStorageKey(modelName, baseUrl, apiKey)` - Generate unique storage keys
  - `loadMessages(storageKey, historyDepthHours, maxContextSize)` - Load history
  - `saveMessages(storageKey, messages, maxContextSize)` - Save history
  - `clearHistory(storageKey)` - Clear history for specific configuration
  - `clearAllHistory()` - Clear all stored history (for maintenance)

### Changed
- History automatically saved after each message exchange
- "Clear Chat" button now also clears history from IndexedDB
- All exports added to main index for advanced users

### Fixed
- Graceful degradation when IndexedDB is unavailable (e.g., private browsing mode)
- All IndexedDB operations wrapped in error handlers
- No breaking changes - fully backward compatible

### Technical
- IndexedDB database: `chatHistoryDB` with object store `conversations`
- Messages stored with timestamps for age filtering
- Only user and assistant messages stored (system messages excluded)
- Storage key generation uses API key hashing for privacy
- Comprehensive console logging with `[ChatHistory]` prefix

## [1.6.0] - 2025-01-22

### 🎉 Major Release: Production-Ready MCP Implementation

This release represents a complete overhaul of MCP client/server initialization, external server connectivity, and resource management. All critical race conditions, timeout issues, and reconnection problems have been resolved.

### Added
- **Incremental External Server Loading**: External MCP servers now load independently without blocking each other
  - Fast servers appear immediately while slow servers load in background
  - Tools/resources from each server added progressively as they connect
  - 10-second timeout per server (configurable via `timeoutMs`)
  - Graceful degradation when some servers fail
  
- **Client Initialize Retry Logic**: Automatic retry with exponential backoff for race conditions
  - 3 retry attempts with 100ms → 200ms → 400ms delays
  - 5-second timeout per attempt
  - Handles server initialization race conditions gracefully
  
- **Full MCP Resources Support**: Complete implementation of MCP Resources specification (2025-06-18)
  - Static resources pre-loaded into system prompt
  - Dynamic resources exposed as tools for on-demand access
  - Context size limits (5KB per resource, 20KB total)
  - Support for both text and binary (base64) content

### Fixed
- **Critical: Client/Server Race Condition**: Client no longer hangs when initializing before server is ready
- **Critical: External Server Blocking**: Slow/failing external servers no longer block fast ones
- **Critical: Infinite Reconnection Loops**: Properly cancelled reconnection timers on disconnect
- **Critical: Excessive Re-initialization**: Stable dependencies prevent unnecessary client recreation
- **Partial Server Failures**: Failure of one external server no longer breaks all external tools
- **Empty Server Array Handling**: Client properly handles case with no external servers configured
- **Unhandled Promise Rejections**: All async operations properly wrapped with error handlers

### Changed
- **Removed Debug Logging**: All console.log statements removed for production
- **Improved Error Handling**: Silent fallbacks for non-critical errors
- **Better Status Management**: Accurate status reporting (disconnected, connecting, connected, partial_connected, error)
- **Optimized Performance**: Eliminated unnecessary re-renders and state updates

### Technical Improvements
- `MCPClient.initialize()` with timeout and retry logic
- `Promise.race()` for timeout handling in all async operations
- `useRef` for stable external clients map (prevents re-initialization)
- `useMemo` with JSON.stringify for stable useEffect dependencies
- Independent async loops replace blocking `Promise.all()`
- Proper cleanup in all useEffect hooks
- Server config validation (checks for `srv.id` and `srv.url`)

### Breaking Changes
None - fully backward compatible with v1.5.x

### Migration from v1.5.x
Simply update the package version - no code changes required:
```bash
npm install ai-mcp-web-app@1.6.0
```
  
## [1.5.11] - 2025-01-22

### Fixed
- **Critical: Client Initialize Race Condition**: Fixed infinite hang when client initializes before server is ready
  - Added timeout (5 seconds) to prevent infinite waiting
  - Added retry logic with exponential backoff (3 attempts: 100ms, 200ms, 400ms delays)
  - Client now successfully connects even if server initializes slightly later
  - Logs retry attempts for debugging
  - Prevents "connecting" status getting stuck forever
  - Fixes the root cause of tools not loading

### Technical
- Modified `MCPClient.initialize()` to use `Promise.race()` with timeout
- Retry loop with exponential backoff for race condition tolerance
- Clear error messages after all retry attempts exhausted
- Race condition between `useMCPClient` and `useMCPServer` now handled gracefully

## [1.5.10] - 2025-01-22

### Fixed
- **Enhanced Diagnostic Logging**: Added detailed step-by-step logging throughout client initialization
  - Now logs each step of internal client creation and initialization
  - Shows exact point where initialization might hang or fail
  - Added proper error handler for `initClient()` call to catch unhandled rejections
  - Logs tool names after loading to verify what was actually loaded
  - Helps identify exactly where in the initialization pipeline the process stops

### Technical
- Added 8 additional console.log statements in `initClient()` function
- Added `.catch()` handler for `initClient()` promise to prevent silent failures
- Each async operation now logs before and after completion

## [1.5.9] - 2025-01-22

### Added
- **Diagnostic Logging**: Comprehensive console logging for troubleshooting MCP client/server initialization
  - `[MCP Server]` logs show tool and resource registration process
  - `[MCP]` logs track client initialization, tool merging, and state updates
  - Logs show counts at each step: registration → loading → merging → filtering → final state
  - Helps identify where tools/resources are lost in the pipeline
  - Can be used to verify configuration and debug connectivity issues

### Fixed
- **Empty Server Array Handling**: Client now properly handles case with no external servers
  - Status set to 'connected' immediately when no external servers configured
  - Prevents stuck 'connecting' status
- **Server Config Validation**: Added validation for server ID and URL before initialization
  - Invalid configs logged as warnings and skipped
  - Prevents crashes from malformed server configurations
- **Unhandled Promise Rejections**: Added catch handler for async IIFE in external server initialization
  - All errors properly caught and logged
  - No more silent failures

### Technical
- Added 10+ strategic console.log statements throughout initialization flow
- Server validation: checks for `srv.id` and `srv.url` existence
- Safe URL check: `srv.url && srv.url.startsWith('wss:')` prevents undefined errors
- Async IIFE wrapped in `.catch()` to prevent unhandled rejections

## [1.5.7] - 2025-01-22

### Fixed
- **Critical: Slow External Servers Blocking Fast Ones**: Completely redesigned external server initialization to be truly asynchronous and non-blocking
  - Removed `Promise.all()` waiting - no longer blocks on slowest/failing server
  - Each external server initializes independently with its own timeout (10 seconds default)
  - Tools/resources from fast servers appear **immediately** as they connect
  - Slow servers add their tools when ready, without blocking UI
  - Failed servers timeout gracefully without affecting successful connections
  - State updates incrementally as each server completes
  - Client with internal tools available instantly, external tools added progressively

### Changed
- **Incremental Tool Loading**: Tools now appear progressively instead of all-at-once
  - Internal tools available immediately on page load
  - Each external server's tools added as soon as that server connects
  - User can start working with fast servers while slow ones are still connecting
  - Much better UX when dealing with multiple external servers of varying speeds

### Technical
- Replaced `Promise.all()` with independent `forEach()` async loops
- Each server has `Promise.race()` between initialization and timeout
- `externalResultsMap` populated incrementally as servers complete
- `updateMergedState()` helper called after each server (success or failure)
- `routedClient` created immediately, references live `externalResultsMap`
- Console logs success/failure for each server individually

## [1.5.6] - 2025-01-22

### Fixed
- **Critical: Partial MCP Server Failures Breaking All Tools**: Fixed issue where failure of one external MCP server would prevent all external tools from working
  - External clients now added to Map only after successful initialization
  - Failed connections are properly logged with warnings but don't block successful servers
  - Tools and resources from successfully connected servers remain fully functional
  - Graceful degradation: system works with partial connectivity
  - Status correctly shows `partial_connected` when some servers fail

### Technical
- Moved `externalClients.current.set()` to execute only after successful `initialize()`
- Added console warnings for failed server connections with server ID and error message
- Each external server initializes independently in try-catch block
- Failed servers return `{ client: null, tools: [], resources: [], error }` without affecting others

## [1.5.5] - 2025-01-22

### Fixed
- **Dependency Stabilization**: Memoize useMCPClient dependencies to prevent unnecessary reinitialization
  - Added JSON.stringify memoization for mcpServers, envVars, allowedTools, blockedTools, externalServers
  - Dependencies now compared by value, not by reference
  - Prevents client reinitialization when parent component passes new object/array instances with same data
  - Significantly reduces unnecessary useEffect triggers
  - External MCP clients remain connected when widget state changes

### Technical
- All object/array dependencies memoized via `JSON.stringify`
- useEffect dependencies changed to JSON strings for deep comparison
- No client disconnection when equivalent data is passed with different references

## [1.5.4] - 2025-01-22

### Fixed
- **Critical: Excessive Reinitialization**: Fixed constant client recreation causing infinite reconnection loops
  - Reverted to `if (!client)` check to prevent unnecessary reinitialization
  - Changed `externalClients` from `useMemo` to `useRef` for stable reference
  - Added `initializingRef` to prevent concurrent initialization attempts
  - Reset `initializingRef` in cleanup and after initialization completes
  - Completely prevents client recreation when dependencies change unnecessarily
  - Eliminates reconnection attempts triggered by component re-renders

### Technical
- `externalClients` now uses `useRef` instead of `useMemo` for persistent Map
- `initializingRef` guards prevent duplicate parallel initializations
- Cleanup properly resets `initializingRef.current` to allow reinitialization if needed
- Only initialize once when client is null, not on every dependency change

## [1.5.3] - 2025-01-22 (REVERTED)

### Fixed
- **Critical: useEffect Race Condition**: Fixed stale client state and race conditions in useMCPClient
  - Reset client/tools/resources state at the start of useEffect
  - Always reinitialize clients when dependencies change (removed `if (!client)` check)
  - Added cancellation flag to prevent stale initialization from completing
  - Prevents race conditions when dependencies change rapidly
  - Ensures cleanup properly disconnects clients before new initialization
  - Completely eliminates reconnection attempts after component updates

### Technical
- State reset at useEffect start prevents stale client usage
- Cancellation flag (`cancelled`) stops async initialization if unmounted
- Cleanup sets `cancelled = true` and disconnects all clients synchronously
- Initialization checks `cancelled` flag before updating state
- Fixes issue where old initialization would complete after cleanup

## [1.5.2] - 2025-01-22

### Fixed
- **Critical: Reconnection Timers Not Canceled**: Fixed reconnection attempts continuing after disconnect()
  - Added `reconnectTimer` property to track scheduled reconnections
  - Timers are now properly canceled in `disconnect()` method
  - Prevents reconnection attempts from accumulating in background
  - Fixes continuous reconnection attempts when typing in chat
  - Both WebSocket and SSE clients now check `shouldReconnect` before scheduling timers

### Technical
- `MCPWebSocketClient` and `MCPSseClient` now store reconnect timer reference
- Timers are cleared via `clearTimeout()` when `disconnect()` is called
- Reconnection scheduling only occurs if `shouldReconnect` flag is true
- Prevents orphaned timers from continuing to fire after client cleanup

## [1.5.1] - 2025-01-22

### Fixed
- **Critical: Infinite Reconnection Loop**: Fixed infinite reconnection attempts from external MCP servers
  - Added `shouldReconnect` flag to control reconnection behavior
  - Added `disconnect()` method to properly stop WebSocket and SSE clients
  - Added cleanup in `useMCPClient` to disconnect clients on unmount or prop changes
  - Prevents exponential growth of reconnection attempts when typing or changing props
  - Fixes browser freeze when external servers are unavailable
- **TypeError in disconnect()**: Fixed `pending.reject is not a function` error
  - Added type check before calling `reject()` on pending requests
  - SSE client stores empty objects `{}` for some requests, now handles gracefully

### Technical
- `MCPWebSocketClient` now has `disconnect()` method and checks `shouldReconnect` flag
- `MCPSseClient` now has `disconnect()` method and checks `shouldReconnect` flag
- `useMCPClient` cleanup properly disconnects all external clients
- Pending requests validation before rejection to handle empty objects
- All pending requests are rejected when client disconnects

## [1.5.0] - 2025-01-22

### Added
- **MCP Resources Support**: Full implementation of MCP Resources specification (2025-06-18)
  - Static resources for contextual data (product catalogs, configuration, FAQ)
  - Dynamic resources for real-time data (form state, session info, statistics)
  - Automatic categorization via `cachePolicy` annotation
  - Spec-compliant resource descriptors with `uri`, `name`, `title`, `description`, `mimeType`, `size`
  - Support for both text and binary (base64) content
  - `resources/list` and `resources/read` protocol methods
  - Legacy method support: `mcp.resources.list` and `mcp.resources.read`
  
- **AI Integration of Resources**: 
  - Static resources pre-loaded into system prompt for immediate context
  - Dynamic resources exposed as `readMCPResource` tool for on-demand access
  - Context size limits (5KB per resource, 20KB total) to prevent prompt overflow
  - Efficient resource categorization based on `cachePolicy` metadata
  
- **New React Hooks**:
  - `useMCPServer` now accepts `resources` parameter for resource registration
  - `useMCPClient` returns `resources` array and `readResource` function
  - Resources merged from internal and external MCP servers
  
- **Spec Compliance (MCP 2025-06-18)**:
  - Proper capabilities format: `{ tools: {}, resources: { subscribe, listChanged } }`
  - Complete resource annotations: `audience`, `priority`, `lastModified`
  - Binary data support via `blob` field (base64 encoding)
  - Spec-compliant error codes: `-32002` (not found), `-32603` (internal error)

### Changed
- **Capabilities Format**: Updated from array to object structure per MCP spec
- **Resource Descriptors**: Enhanced with `title` (display name) and `size` (bytes) fields
- **Annotations**: Added `lastModified` (ISO 8601) timestamp field
- **Resource Contents**: Now include `name` and `title` fields in response
- **Performance**: Optimized resource loading with ref-based flags to prevent infinite loops

### Fixed
- **Infinite Loop Prevention**: Added `resourcesLoadedRef` to ensure static resources load only once
- **Stable Function References**: Wrapped `readResource` in `useCallback` to prevent re-renders
- **Context Management**: Implemented size limits to prevent excessively large prompts

### Technical
- Complete MCP Resources protocol implementation in `mcp_core.js`
- Resource merging and routing logic in `useMCPClient.js`
- Resource registration and handler management in `useMCPServer.js`
- AI context integration in `useOpenAIChat.js`
- Example resources in `src/examples/mcp_resources_en.js`
- Comprehensive spec compliance documentation

## [1.4.1] - 2025-10-21

### Added
- **Markdown Code Block Tool Calls**: Support for parsing tool calls from markdown JSON code blocks
  - LLMs can now wrap tool calls in \`\`\`json blocks for better formatting
  - Validates tool registration before execution
  - Supports multiple tool calls in single response
  - Automatic extraction and cleanup of markdown blocks

### Fixed
- **Empty JSON Blocks Display**: Fixed issue where empty JSON markdown blocks appeared in chat after tool execution
  - Comprehensive 5-level cleanup system: parse → clean → render → validate → display
  - Added validation in `renderMarkdown` to skip empty code blocks
  - Improved `cleanAssistantContent` with aggressive empty block removal
  - Multiple cleanup passes to handle edge cases with multiple tool calls
  
- **Empty Assistant Messages**: Fixed display of empty assistant messages after content cleanup
  - Reordered logic to clean content before checking emptiness
  - Added DOM-based validation to verify rendered content has actual text
  - Enhanced `isDisplayContentEmpty` to detect invisible Unicode characters
  - Messages with only whitespace/braces now properly hidden

### Changed
- **Enhanced System Prompts**: Updated for all locales (English, Russian, Chinese) with explicit tool call format instructions
  - Clear examples of correct vs incorrect tool call format
  - Support for both native OpenAI tool_calls and markdown-wrapped alternatives
  - Emphasis that "name" field must contain tool name, not user data
  - Better guidance for models without native tool_calls support

### Technical
- Improved tool call extraction with index-based removal for multiple blocks
- Added Unicode whitespace detection (zero-width spaces, non-breaking spaces, etc.)
- Optimized `isDisplayContentEmpty` to avoid double-cleaning content
- Multi-pass cleanup regex patterns for complex edge cases
- Better separation between content cleaning and validation logic

## [1.4.0] - 2025-10-21

### Added
- **Voice Input Module**: Extracted voice recognition logic into separate `voiceInput.js` module
  - New `createVoiceRecognition()` function for encapsulated voice input management
  - Clean API: `start()`, `stop()`, `isSupported()`, `cleanup()`
  - Improved code organization and maintainability

### Fixed
- **Voice Input Duplication Bug**: Fixed issue where spoken words were being duplicated
  - Root cause: Speech Recognition API returns cumulative results, old code was accumulating duplicates
  - Solution: Buffer is now rebuilt from scratch on each result event instead of appending
  - Added `finalDelivered` flag to prevent double delivery in `onresult` and `onend` handlers
  - Improved transcript delivery logic to handle all edge cases properly

### Changed
- Refactored `ChatWidget.js` voice recognition initialization (~95 lines reduced to ~40 lines)
- Simplified `toggleVoiceRecording()` function (~30 lines reduced to ~15 lines)
- Removed unused internal refs: `isStartingRef`, `hasStartedRef`, `hasGotResultRef`, `hasRetriedStartRef`
- Voice recognition state management now handled by dedicated module

### Technical
- Better separation of concerns: voice logic isolated from UI component
- Enhanced error handling in voice recognition module
- Cleaner component lifecycle management
- No breaking changes - fully backward compatible

## [1.3.2] - 2025-10-17

### Changed
- **Optimized package size**: Reduced bundle size by ~20MB
  - Made `js-tiktoken` an optional dependency instead of required
  - Added fallback to approximate token counting (~3.5 chars per token)
  - Users can choose: accurate counting with tiktoken or lightweight approximate counting
  - Install tiktoken separately for accurate counting: `npm install js-tiktoken`

### Technical
- Token counting now has dual mode: accurate (with tiktoken) or approximate (without)
- Approximate counting uses ~3.5 characters per token heuristic
- Console info message when using approximate counting

## [1.3.1] - 2025-10-17

### Added
- **Context Size Management**: New `maxContextSize` parameter (default: 32000 tokens) for automatic context window management
  - Accurately counts tokens using tiktoken library (cl100k_base encoding)
  - Automatically excludes oldest messages when context limit is exceeded
  - System message is always preserved in the first position
  - Excluded messages remain visible in UI with visual indicators (dimmed, dashed border, warning icon)
  - Localized tooltips explain excluded messages won't be sent to AI assistant
  - Supports English, Russian, and Chinese locales

### Fixed
- System messages are now properly filtered from UI display
- System message always maintains first position in filtered message arrays
- Fixed duplicate variable declarations in message filtering logic

### Dependencies
- Added `js-tiktoken` ^1.0.15 for accurate token counting

## [1.2.0] - 2025-01-27

### Added
- Enhanced MCP (Model Communication Protocol) core functionality
- Improved tool integration capabilities
- New tools mode guide for better developer experience
- Enhanced localization support for all supported languages

### Changed
- Updated ChatWidget component with new features and improvements
- Enhanced OpenAI chat hook with better error handling and functionality
- Improved localization files for English, Russian, and Chinese languages
- Updated MCP client and server implementations for better reliability

### Fixed
- Various bug fixes and stability improvements
- Enhanced error handling across components
- Improved tool execution reliability

### Technical Improvements
- Better TypeScript support and type safety
- Enhanced build configuration
- Improved code organization and structure
- Better documentation and examples

## [1.1.6] - Previous Release

### Features
- Initial release with basic chat widget functionality
- Voice input support
- MCP tool integration
- Multi-language localization
- Customizable UI components
