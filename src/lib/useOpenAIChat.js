import { useCallback, useRef, useState, useMemo, useEffect } from 'react';
import openaiLocales from './locales/openai';
import { generateStorageKey, loadMessages, saveMessages, clearHistory } from './chatHistoryStorage';

// Generate unique IDs for tool calls
const generateToolCallId = () => `toolcall_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

// Try to import tiktoken (optional dependency)
let encodingForModel = null;
(async () => {
  try {
    const tiktoken = await import('js-tiktoken');
    encodingForModel = tiktoken.encodingForModel;
  } catch (e) {
    // js-tiktoken not installed - will use approximate counting
  }
})();

// Initialize tokenizer (cl100k_base encoding used by gpt-4, gpt-3.5-turbo)
let tokenizer = null;
const getTokenizer = () => {
  if (!encodingForModel) return null; // tiktoken not available
  
  if (!tokenizer) {
    try {
      // Try to get encoding for gpt-4 (cl100k_base)
      tokenizer = encodingForModel('gpt-4');
    } catch (e) {
      // Tokenizer initialization failed - return null
      // Will fall back to approximate counting
    }
  }
  return tokenizer;
};

/**
 * Approximate token count based on character length
 * Rule of thumb: ~4 characters per token for English, ~2 for other languages
 * This is less accurate but doesn't require tiktoken library
 */
const approximateTokenCount = (text) => {
  if (!text || typeof text !== 'string') return 0;
  // Use 3.5 as average (between English and other languages)
  return Math.ceil(text.length / 3.5);
};

const tokenCountCache = new WeakMap();

/**
 * Count tokens in a single message
 * Uses tiktoken if available, otherwise falls back to approximate counting
 */
const countMessageTokens = (message) => {
  if (message && typeof message === 'object' && tokenCountCache.has(message)) {
    return tokenCountCache.get(message);
  }

  const enc = getTokenizer();
  let tokens = 0;

  if (enc) {
    if (message.role) {
      tokens += enc.encode(message.role).length;
    }
    if (message.content && typeof message.content === 'string') {
      tokens += enc.encode(message.content).length;
    }
    if (message.tool_calls && Array.isArray(message.tool_calls)) {
      for (const tc of message.tool_calls) {
        if (tc.function) {
          if (tc.function.name) {
            tokens += enc.encode(tc.function.name).length;
          }
          if (tc.function.arguments) {
            const argsStr = typeof tc.function.arguments === 'string'
              ? tc.function.arguments
              : JSON.stringify(tc.function.arguments);
            tokens += enc.encode(argsStr).length;
          }
        }
      }
    }
    if (message.tool_call_id) {
      tokens += enc.encode(message.tool_call_id).length;
    }
    tokens += 4;
  } else {
    if (message.role) {
      tokens += approximateTokenCount(message.role);
    }
    if (message.content && typeof message.content === 'string') {
      tokens += approximateTokenCount(message.content);
    }
    if (message.tool_calls && Array.isArray(message.tool_calls)) {
      for (const tc of message.tool_calls) {
        if (tc.function) {
          if (tc.function.name) {
            tokens += approximateTokenCount(tc.function.name);
          }
          if (tc.function.arguments) {
            const argsStr = typeof tc.function.arguments === 'string'
              ? tc.function.arguments
              : JSON.stringify(tc.function.arguments);
            tokens += approximateTokenCount(argsStr);
          }
        }
      }
    }
    if (message.tool_call_id) {
      tokens += approximateTokenCount(message.tool_call_id);
    }
    tokens += 4;
  }

  if (message && typeof message === 'object') {
    tokenCountCache.set(message, tokens);
  }
  return tokens;
};

/**
 * Count total tokens in an array of messages
 */
const countTotalTokens = (messages) => {
  return messages.reduce((sum, msg) => sum + countMessageTokens(msg), 0);
};

const groupMessagesIntoBlocks = (messages) => {
  const blocks = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      const block = [msg];
      while (i + 1 < messages.length && messages[i + 1].role === 'tool') {
        i += 1;
        block.push(messages[i]);
      }
      blocks.push(block);
    } else {
      blocks.push([msg]);
    }
  }
  return blocks;
};

const blockTokenCount = (block) => block.reduce((sum, msg) => sum + countMessageTokens(msg), 0);

/**
 * Filter messages to fit within maxTokens context size
 * Always keeps system message (first message)
 * Treats assistant tool_calls + following tool responses as an atomic block
 */
const filterMessagesByContext = (messages, maxTokens) => {
  if (!messages || messages.length === 0) {
    return { filtered: [], allMessages: [] };
  }

  const totalTokens = countTotalTokens(messages);

  if (totalTokens <= maxTokens) {
    return {
      filtered: messages,
      allMessages: messages
    };
  }

  const systemMessage = messages[0];
  const otherMessages = messages.slice(1);
  const blocks = groupMessagesIntoBlocks(otherMessages);

  let currentTokens = countMessageTokens(systemMessage);
  const keptBlocks = [];

  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    const msgTokens = blockTokenCount(block);
    if (currentTokens + msgTokens <= maxTokens) {
      keptBlocks.unshift(block);
      currentTokens += msgTokens;
    } else {
      break;
    }
  }

  while (keptBlocks.length && keptBlocks[0].every(msg => msg.role === 'tool')) {
    keptBlocks.shift();
  }

  const keptMessages = keptBlocks.flat();
  const keptSet = new Set(keptMessages);
  const filtered = [systemMessage, ...keptMessages];

  const allMessages = messages.map((msg, index) => {
    if (index === 0) return msg;
    if (keptSet.has(msg)) {
      return { ...msg, excludedFromContext: false };
    }
    return { ...msg, excludedFromContext: true };
  });

  return {
    filtered: filtered.map(msg => {
      const { excludedFromContext, ...rest } = msg;
      return rest;
    }),
    allMessages
  };
};

const toApiToolCalls = (toolCallsJson) => toolCallsJson.map(tc => ({
  id: tc.id,
  type: 'function',
  function: {
    name: tc.name,
    arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments ?? {})
  }
}));

const toHistoryAssistantMessage = (assistantMsg, parsed) => {
  if (parsed.toolCallsJson?.length) {
    const native = Array.isArray(assistantMsg.tool_calls) && assistantMsg.tool_calls.length > 0;
    return {
      role: 'assistant',
      content: native ? (assistantMsg.content || '') : (parsed.displayContent || ''),
      tool_calls: native ? assistantMsg.tool_calls : toApiToolCalls(parsed.toolCallsJson)
    };
  }
  return {
    role: 'assistant',
    content: assistantMsg.content || parsed.displayContent || ''
  };
};

const isEmptyKeyEmptyObjectContent = (content) => {
  try {
    const raw = typeof content === 'string' ? content.trim() : '';
    if (!(raw.startsWith('{') && raw.endsWith('}'))) return false;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== 'object') return false;
    const keys = Object.keys(obj);
    return keys.length === 1 && keys[0] === '' && obj[''] && typeof obj[''] === 'object' && Object.keys(obj['']).length === 0;
  } catch (_) {
    return false;
  }
};

/**
 * Parses assistant response, supporting both formats
 */
function parseAssistantResponse(assistantMsg, availableTools = new Set()) {
  let thinkText = null;
  let toolCallsJson = null;
  let displayContent = "";

  // New format: tool_calls is present directly
  if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
    const toolCalls = assistantMsg.tool_calls.map(tc => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments
    }));

    toolCallsJson = toolCalls;

    // Process content: remove <think>...</think>
    if (typeof assistantMsg.content === 'string') {
      displayContent = assistantMsg.content;
      const thinkMatch = displayContent.match(/<think>([\s\S]*?)<\/think>/i);
      if (thinkMatch) {
        thinkText = thinkMatch[1].trim();
        displayContent = displayContent.replace(thinkMatch[0], '').trim();
      }
    }
  } else {
    // Old format: parse from content
    if (typeof assistantMsg.content === 'string') {
      displayContent = assistantMsg.content;

      const thinkMatch = displayContent.match(/<think>([\s\S]*?)<\/think>/i);
      if (thinkMatch) {
        thinkText = thinkMatch[1].trim();
        displayContent = displayContent.replace(thinkMatch[0], '').trim();
      }

      // Parse tool calls from markdown code blocks
      if (!toolCallsJson) {
        const markdownBlockRegex = /```(?:json)?\s*\n([\s\S]*?)\n\s*```/g;
        const toolCallsFromMarkdown = [];
        const blocksToRemove = [];
        
        let match;
        while ((match = markdownBlockRegex.exec(displayContent)) !== null) {
          try {
            const blockContent = match[1].trim();
            const parsed = JSON.parse(blockContent);
            
            // Validate tool call structure and registration
            if (
              parsed &&
              typeof parsed === 'object' &&
              typeof parsed.name === 'string' &&
              parsed.arguments !== undefined &&
              availableTools.has(parsed.name)
            ) {
              // Valid tool call - add to list and mark block for removal
              toolCallsFromMarkdown.push({
                id: generateToolCallId(),
                name: parsed.name,
                arguments: parsed.arguments
              });
              // Store match with position for later removal
              blocksToRemove.push({
                text: match[0],
                index: match.index
              });
            }
            // If not a valid registered tool call, leave in content for display
          } catch (e) {
            // Not valid JSON, leave in content
          }
        }
        
        if (toolCallsFromMarkdown.length > 0) {
          toolCallsJson = toolCallsFromMarkdown;
          // Remove all marked blocks in reverse order (to preserve indices)
          let contentWithoutToolBlocks = displayContent;
          blocksToRemove.sort((a, b) => b.index - a.index);
          for (const block of blocksToRemove) {
            const before = contentWithoutToolBlocks.substring(0, block.index);
            const after = contentWithoutToolBlocks.substring(block.index + block.text.length);
            contentWithoutToolBlocks = before + after;
          }
          displayContent = contentWithoutToolBlocks.trim();
        }
      }
      
      // Clean up any remaining empty markdown code blocks (multiple passes for nested cases)
      for (let i = 0; i < 3; i++) {
        // Remove completely empty blocks
        displayContent = displayContent.replace(/```[a-zA-Z]*\s*```/g, '');
        displayContent = displayContent.replace(/```\s*\n\s*\n\s*```/g, '');
        displayContent = displayContent.replace(/```\s*\n\s*```/g, '');
        // Remove blocks with only language identifier (e.g., ```json\n```)
        displayContent = displayContent.replace(/```[a-zA-Z]+\s*\n\s*```/g, '');
        // Remove blocks with only closing brace (artifacts from tool call extraction)
        displayContent = displayContent.replace(/```[a-zA-Z]*\s*\n\s*\}\s*```/g, '');
        displayContent = displayContent.replace(/```[a-zA-Z]*\s*\n\s*\}\s*\n\s*```/g, '');
        displayContent = displayContent.replace(/```[a-zA-Z]*\s*\n\s*[\{\}]\s*```/g, '');
        // Remove code blocks that contain only whitespace and/or single braces
        displayContent = displayContent.replace(/```[a-zA-Z]*\s*\n[\s\{\}]*\n\s*```/g, '');
        // Universal cleanup: remove any block that has nothing meaningful inside
        displayContent = displayContent.replace(/```[a-zA-Z]*[\s\n]*```/g, '');
      }
      
      // Final aggressive cleanup: remove ANY code fence block that only contains whitespace
      // This catches all edge cases like ```json\n\n```, ```\n  \n```, etc.
      displayContent = displayContent.replace(/```[\w]*[\s\S]*?```/g, (match) => {
        // Extract content between ``` markers
        const content = match.replace(/^```[\w]*\s*/, '').replace(/\s*```$/, '');
        // If content is only whitespace or braces, remove entire block
        if (!content.trim() || /^[\s\{\}]*$/.test(content)) {
          return '';
        }
        // Otherwise keep the block
        return match;
      });
      
      // Check if content looks like JSON before applying aggressive cleanups
      const trimmedForCheck = displayContent.trim();
      const looksLikeJson = (trimmedForCheck.startsWith('{') && trimmedForCheck.endsWith('}')) ||
                            (trimmedForCheck.startsWith('[') && trimmedForCheck.endsWith(']'));
      
      // Only apply orphaned brace cleanup if content doesn't look like JSON
      if (!looksLikeJson) {
        // Remove orphaned closing braces that may remain after tool call extraction
        displayContent = displayContent.replace(/^\s*[\{\}]\s*$/gm, '');
        // Remove lines that contain only "json" keyword (artifacts from markdown blocks)
        displayContent = displayContent.replace(/^\s*json\s*$/gm, '');
      }
      
      // Clean up multiple consecutive newlines left after block removal (multiple passes)
      displayContent = displayContent.replace(/\n{3,}/g, '\n\n');
      displayContent = displayContent.replace(/\n{3,}/g, '\n\n'); // Second pass
      displayContent = displayContent.trim();

      // gpt-oss control tags formats:
      // 1) <|constrain|>func=functions.name ... <|message|>{json}
      // 2) <|constrain|>functions.name ... <|message|>{json}
      let funcNameFromTag = null;
      const ossFuncMatchLegacy = displayContent.match(/<\|constrain\|>\s*func=([\w.\-]+)/i);
      const ossFuncMatchNoAttr = displayContent.match(/<\|constrain\|>\s*functions\.([\w.\-]+)/i);
      if (ossFuncMatchLegacy) {
        funcNameFromTag = (ossFuncMatchLegacy[1] || '').replace(/^functions\./, '');
      } else if (ossFuncMatchNoAttr) {
        funcNameFromTag = (ossFuncMatchNoAttr[1] || '').replace(/^functions\./, '');
      }
      const ossMsgIndex = displayContent.lastIndexOf('<|message|>');
      if (funcNameFromTag && ossMsgIndex !== -1) {
        try {
          const jsonText = displayContent.slice(ossMsgIndex + '<|message|>'.length).trim();
          let funcArgs = {};
          if (jsonText) {
            try {
              funcArgs = JSON.parse(jsonText);
            } catch (e) {
              // pass as string; will be parsed downstream
              funcArgs = jsonText;
            }
          }
          // Normalize shape like { name, arguments } to arguments only
          if (funcArgs && typeof funcArgs === 'object' && 'arguments' in funcArgs && Object.keys(funcArgs).length <= 2) {
            funcArgs = funcArgs.arguments;
          }

          toolCallsJson = [{
            id: generateToolCallId(),
            name: funcNameFromTag,
            arguments: funcArgs
          }];

          // Remove JSON payload from display and strip all gpt-oss control tags
          displayContent = displayContent
            .slice(0, ossMsgIndex)
            .replace(/<\|channel\|>[^<]*?/gi, '')
            .replace(/<\|constrain\|>[^<]*?/gi, '')
            .replace(/<\|message\|>/gi, '')
            .trim();
        } catch (e) {
          // Parsing error, continue with original content
        }
      }

      // Try to parse entire content as JSON array of tool calls or single object
      if (!toolCallsJson) {
        try {
          const trimmedContent = displayContent.trim();
          
          if (trimmedContent.startsWith('[') && trimmedContent.endsWith(']')) {
            const parsedJson = JSON.parse(trimmedContent);
            
            // Validate format - should be array of tool call objects
            if (Array.isArray(parsedJson) && parsedJson.length > 0) {
              const isValidToolCalls = parsedJson.every(tc => 
                tc && typeof tc === 'object' && 
                typeof tc.name === 'string' && 
                tc.arguments !== undefined
              );
              
              if (isValidToolCalls) {
                toolCallsJson = parsedJson.map(tc => ({
                  id: generateToolCallId(),
                  name: tc.name,
                  arguments: tc.arguments
                }));
                displayContent = ''; // Clear content since it's all tool calls
              }
            }
          } else if (trimmedContent.startsWith('{') && trimmedContent.endsWith('}')) {
            // Try to parse as single JSON object (potential tool call)
            const parsedJson = JSON.parse(trimmedContent);
            
            // Check if it's a tool call format with name and arguments
            if (
              parsedJson &&
              typeof parsedJson === 'object' &&
              typeof parsedJson.name === 'string' &&
              parsedJson.arguments !== undefined &&
              availableTools.has(parsedJson.name)
            ) {
              // Valid tool call
              toolCallsJson = [{
                id: generateToolCallId(),
                name: parsedJson.name,
                arguments: parsedJson.arguments
              }];
              displayContent = ''; // Clear content since it's a tool call
            }
            // If not a valid tool call, leave as display content
          }
        } catch (e) {
          // Not valid JSON, continue to bracketed format fallback
        }
      }

      // Legacy bracketed JSON format fallback: only if the entire content is the array/object
      if (!toolCallsJson) {
        const trimmedContent = displayContent.trim();
        if (
          (trimmedContent.startsWith('[') && trimmedContent.endsWith(']')) ||
          (trimmedContent.startsWith('{') && trimmedContent.endsWith('}'))
        ) {
          try {
            const parsedJson = JSON.parse(trimmedContent);
            const candidates = Array.isArray(parsedJson) ? parsedJson : [parsedJson];
            const isValidToolCalls = candidates.length > 0 && candidates.every(tc =>
              tc && typeof tc === 'object' &&
              typeof tc.name === 'string' &&
              tc.arguments !== undefined &&
              availableTools.has(tc.name)
            );

            if (isValidToolCalls) {
              toolCallsJson = candidates.map(tc => ({
                id: generateToolCallId(),
                name: tc.name,
                arguments: tc.arguments
              }));
              displayContent = '';
            }
          } catch (e) {
            // JSON parse error, continue without tool calls
          }
        }
      }
    } else if (assistantMsg.content) {
      // Convert to string if value exists
      displayContent = String(assistantMsg.content);
    }
  }

  // Map provider-specific reasoning field if present (e.g., gpt-oss)
  if (!thinkText && typeof assistantMsg.reasoning === 'string' && assistantMsg.reasoning.trim()) {
    thinkText = assistantMsg.reasoning.trim();
  }

  return {
    think: thinkText,
    toolCallsJson: toolCallsJson,
    displayContent: displayContent
  };
}

export const useOpenAIChat = (mcpClient, llmConfigs, actualToolsSchema, locale = 'en', mcpResources = [], readResourceFn = null, persistChatHistory = true, historyDepthHours = 24, debug = false, options = {}) => {
  const { onToolError, staticResourcePatterns } = options;
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState(null);
  const [isExecutingTools, setIsExecutingTools] = useState(false);
  const [loadedStaticResources, setLoadedStaticResources] = useState('');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false); // Flag to indicate history is being loaded
  const [currentConfigIndex, setCurrentConfigIndex] = useState(0); // Track current LLM config for fallback
  const resourcesLoadedRef = useRef(false); // Flag to prevent multiple loads
  const readResourceFnRef = useRef(readResourceFn);
  const historyLoadedRef = useRef(false); // Flag to prevent multiple history loads
  const storageKeyRef = useRef(null); // Storage key for IndexedDB
  const retryMessageRef = useRef(null); // Store message for retry on config change
  const isRetryingRef = useRef(false); // Flag to indicate we're in retry mode
  const sendMessageStreamRef = useRef(null);
  const sendMessageRef = useRef(null);
  const retryStreamingRef = useRef(true);
  const abortControllerRef = useRef(null);
  const userCancelledRef = useRef(false);
  const turnStartIndexRef = useRef(null);
  const inFlightUserMessageRef = useRef(null);
  const requestGenRef = useRef(0);
  
  // Ensure llmConfigs is an array with at least one config
  const normalizedConfigs = useMemo(() => {
    if (!llmConfigs || !Array.isArray(llmConfigs) || llmConfigs.length === 0) {
      return [{
        modelName: 'gpt-4o-mini',
        baseUrl: 'http://127.0.0.1:1234/v1',
        apiKey: null,
        temperature: 0.5,
        maxContextSize: 32000,
        maxToolLoops: 5,
        systemPromptAddition: null,
        validationOptions: null,
        toolsMode: 'api'
      }];
    }
    // Apply defaults to each config
    return llmConfigs.map(config => ({
      modelName: config.modelName || 'gpt-4o-mini',
      baseUrl: config.baseUrl || 'http://127.0.0.1:1234/v1',
      apiKey: config.apiKey || null,
      temperature: config.temperature !== undefined ? config.temperature : 0.5,
      maxContextSize: config.maxContextSize || 32000,
      maxToolLoops: config.maxToolLoops || 5,
      systemPromptAddition: config.systemPromptAddition || null,
      validationOptions: config.validationOptions || null,
      toolsMode: config.toolsMode || 'api'
    }));
  }, [llmConfigs]);
  
  // Extract current config
  const currentConfig = normalizedConfigs[currentConfigIndex] || normalizedConfigs[0];
  const {
    modelName,
    baseUrl,
    apiKey,
    temperature,
    maxContextSize,
    maxToolLoops,
    systemPromptAddition,
    validationOptions,
    toolsMode
  } = currentConfig;
  
  // Update ref when function changes
  useEffect(() => {
    readResourceFnRef.current = readResourceFn;
  }, [readResourceFn]);
  
  // Handle automatic retry when config changes
  useEffect(() => {
    if (isRetryingRef.current && retryMessageRef.current && !isLoading) {
      const messageToRetry = retryMessageRef.current;
      const useStream = retryStreamingRef.current;
      retryMessageRef.current = null;
      isRetryingRef.current = false;

      if (debug) {
        console.info(`[LLM Fallback] Retrying with config ${currentConfigIndex} (${normalizedConfigs[currentConfigIndex].modelName})`);
      }

      const timer = setTimeout(() => {
        const fn = useStream ? sendMessageStreamRef.current : sendMessageRef.current;
        if (fn) fn(messageToRetry);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [currentConfigIndex, isLoading, normalizedConfigs, debug]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Get current localization
  const currentLocale = openaiLocales[locale] || openaiLocales.en;

  // Categorize resources into static and dynamic
  const { staticResources, dynamicResources } = useMemo(() => {
    if (!mcpResources || mcpResources.length === 0) {
      return { staticResources: [], dynamicResources: [] };
    }

    const defaultPatterns = ['configuration', 'product-catalog', 'catalog', 'faq', 'config', 'settings'];
    const patterns = [...defaultPatterns, ...(Array.isArray(staticResourcePatterns) ? staticResourcePatterns : [])];

    const staticRes = mcpResources.filter(r => {
      if (r.annotations && r.annotations.cachePolicy) {
        return r.annotations.cachePolicy === 'static';
      }
      return patterns.some(pattern => String(pattern && r.uri).toLowerCase().includes(String(pattern).toLowerCase()));
    });

    const dynamicRes = mcpResources.filter(r => {
      if (r.annotations && r.annotations.cachePolicy) {
        return r.annotations.cachePolicy === 'dynamic';
      }
      return !patterns.some(pattern => String(pattern && r.uri).toLowerCase().includes(String(pattern).toLowerCase()));
    });

    return { staticResources: staticRes, dynamicResources: dynamicRes };
  }, [mcpResources, staticResourcePatterns]);

  // System prompt with localization (recomputed when tools or locale/mode change)
  // Must be declared before effects that read it (avoid TDZ / always-undefined deps)
  const systemPrompt = useMemo(() => {
    let basePrompt;
    if (toolsMode === 'prompt') {
      const toolsList = (actualToolsSchema || [])
        .map(t => `• ${t.function.name}: ${t.function.description}`)
        .join('\n');
      basePrompt = (currentLocale.systemPromptWithTools || currentLocale.systemPrompt)
        .replace('{toolsList}', toolsList);
    } else {
      basePrompt = currentLocale.systemPrompt;
    }

    if (loadedStaticResources) {
      basePrompt = `${basePrompt}${loadedStaticResources}`;
    }

    if (systemPromptAddition && typeof systemPromptAddition === 'string' && systemPromptAddition.trim()) {
      return `${basePrompt}\n\n${systemPromptAddition.trim()}`;
    }

    return basePrompt;
  }, [currentLocale, toolsMode, actualToolsSchema, systemPromptAddition, loadedStaticResources]);

  const conversationHistoryRef = useRef([{ role: "system", content: systemPrompt }]);

  useEffect(() => {
    if (
      Array.isArray(conversationHistoryRef.current) &&
      conversationHistoryRef.current.length > 0 &&
      conversationHistoryRef.current[0] &&
      conversationHistoryRef.current[0].role === 'system'
    ) {
      conversationHistoryRef.current[0] = { role: 'system', content: systemPrompt };
    }
  }, [systemPrompt]);

  // Load static resources on mount and add to context (ONCE)
  useEffect(() => {
    const loadStaticResourcesData = async () => {
      // Skip if already loaded or no resources
      if (resourcesLoadedRef.current) {
        return;
      }
      
      if (!staticResources || staticResources.length === 0 || !readResourceFnRef.current) {
        setLoadedStaticResources('');
        resourcesLoadedRef.current = true;
        return;
      }

      try {
        if (debug) {
          console.log('[Debug] Resources: Loading static resources...', staticResources.length);
        }
        // Static context: up to 20% of model context (tokens); ~3.5 chars per token
        const MAX_TOTAL_SIZE = Math.floor((maxContextSize || 32000) * 0.2 * 3.5);
        const MAX_RESOURCE_SIZE = Math.max(5000, Math.floor(MAX_TOTAL_SIZE / 4));
        const resourceDataPromises = staticResources.map(async (resource) => {
          try {
            const result = await readResourceFnRef.current(resource.uri);
            const mimeType = (result.contents?.[0]?.mimeType || resource.mimeType || '').toLowerCase();

            let dataStr;
            if (result.contents && Array.isArray(result.contents) && result.contents.length > 0) {
              const content = result.contents[0];
              if (content.text != null && content.text !== '') {
                try {
                  const data = JSON.parse(content.text);
                  dataStr = JSON.stringify(data, null, 2);
                } catch (_) {
                  if (mimeType === 'text/markdown' || mimeType === 'text/plain' || !mimeType.includes('application/json')) {
                    dataStr = String(content.text);
                  } else {
                    throw new Error('Invalid JSON and not plain text resource');
                  }
                }
              } else {
                dataStr = JSON.stringify(content, null, 2);
              }
            } else if (result.data) {
              dataStr = JSON.stringify(result.data, null, 2);
            } else {
              dataStr = JSON.stringify(result, null, 2);
            }

            if (dataStr.length > MAX_RESOURCE_SIZE) {
              dataStr = dataStr.substring(0, MAX_RESOURCE_SIZE) + '\n... (truncated)';
              if (debug) {
                console.warn(`[Debug] Resources: Resource ${resource.uri} truncated (${dataStr.length} chars)`);
              }
            }

            return {
              name: resource.name || resource.uri,
              uri: resource.uri,
              data: dataStr
            };
          } catch (err) {
            if (debug) {
              console.warn(`[Debug] Resources: Failed to load resource ${resource.uri}:`, err);
            }
            return null;
          }
        });

        const loadedData = await Promise.all(resourceDataPromises);
        const validData = loadedData.filter(d => d !== null);

        if (validData.length > 0) {
          const resourceContext = validData
            .map(r => `📦 Resource: ${r.name} (${r.uri})\n${r.data}`)
            .join('\n\n---\n\n');
          
          const totalSize = resourceContext.length;
          if (totalSize > MAX_TOTAL_SIZE) {
            if (debug) {
              console.warn(`[Debug] Resources: Total context too large (${totalSize} chars), limiting...`);
            }
            setLoadedStaticResources(`\n\n## Available Context Data\n\n${resourceContext.substring(0, MAX_TOTAL_SIZE)}\n... (truncated)`);
          } else {
            setLoadedStaticResources(`\n\n## Available Context Data\n\n${resourceContext}`);
          }
          
          if (debug) {
            console.log(`[Debug] Resources: Loaded ${validData.length} static resources (${totalSize} chars)`);
          }
        } else {
          setLoadedStaticResources('');
        }
        
        resourcesLoadedRef.current = true;
      } catch (error) {
        if (debug) {
          console.error('[Debug] Resources: Error loading static resources:', error);
        }
        setLoadedStaticResources('');
        resourcesLoadedRef.current = true;
      }
    };

    // Trigger load when resources become available (but only once)
    if (staticResources.length > 0 && readResourceFnRef.current && !resourcesLoadedRef.current) {
      loadStaticResourcesData();
    }
  }, [staticResources.length, maxContextSize]); // Only depend on count to avoid re-triggers

  // Load chat history from IndexedDB on mount
  useEffect(() => {
    let cancelled = false;
    let timeoutId = null;

    const loadChatHistory = async () => {
      // Skip if already loaded or persistence is disabled
      if (historyLoadedRef.current || !persistChatHistory) {
        return;
      }

      try {
        setIsLoadingHistory(true);
        
        storageKeyRef.current = generateStorageKey(normalizedConfigs);
        
        if (debug) {
          console.info('[Debug] ChatHistory: Loading chat history for key:', storageKeyRef.current);
        }
        
        const loadedMessages = await loadMessages(
          storageKeyRef.current, 
          historyDepthHours, 
          maxContextSize
        );

        if (cancelled) return;

        if (loadedMessages && loadedMessages.length > 0) {
          const systemMessage = { role: 'system', content: systemPrompt };
          const historyWithSystem = [systemMessage, ...loadedMessages];
          const { filtered, allMessages } = filterMessagesByContext(historyWithSystem, maxContextSize);
          
          conversationHistoryRef.current = filtered;
          
          const uiMessages = allMessages.filter(msg => msg.role !== 'system');
          setMessages(uiMessages);
          
          if (debug) {
            console.info(`[Debug] ChatHistory: Loaded ${loadedMessages.length} messages from history`);
          }
        } else {
          conversationHistoryRef.current = [{ role: 'system', content: systemPrompt }];
          if (debug) {
            console.info('[Debug] ChatHistory: No history found, starting fresh');
          }
        }
        
        historyLoadedRef.current = true;
        
        timeoutId = setTimeout(() => {
          if (!cancelled) setIsLoadingHistory(false);
        }, 100);
      } catch (error) {
        if (debug) {
          console.error('[Debug] ChatHistory: Error loading chat history:', error);
        }
        conversationHistoryRef.current = [{ role: 'system', content: systemPrompt }];
        historyLoadedRef.current = true;
        if (!cancelled) setIsLoadingHistory(false);
      }
    };

    if (systemPrompt && !historyLoadedRef.current) {
      loadChatHistory();
    }

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [systemPrompt, persistChatHistory, historyDepthHours, maxContextSize, modelName, baseUrl, apiKey]);

  const isProcessingRef = useRef(false);
  const usedFollowUpRef = useRef(false);

  // Create tool for dynamic resources (if any exist)
  const dynamicResourceTool = useMemo(() => {
    if (!dynamicResources || dynamicResources.length === 0) {
      return null;
    }

    const resourcesList = dynamicResources
      .map(r => `  - ${r.uri}: ${r.description || r.name}`)
      .join('\n');

    return {
      type: "function",
      function: {
        name: "readMCPResource",
        description: `Read real-time data from MCP resources. Use this to get current state information.\n\nAvailable dynamic resources:\n${resourcesList}`,
        parameters: {
          type: "object",
          properties: {
            uri: {
              type: "string",
              enum: dynamicResources.map(r => r.uri),
              description: "URI of the resource to read"
            }
          },
          required: ["uri"]
        }
      }
    };
  }, [dynamicResources]);

  // Extended tools schema including dynamic resource tool
  const extendedToolsSchema = useMemo(() => {
    const tools = actualToolsSchema || [];
    if (dynamicResourceTool) {
      return [...tools, dynamicResourceTool];
    }
    return tools;
  }, [actualToolsSchema, dynamicResourceTool]);
  
  const availableTools = useMemo(
    () => new Set((extendedToolsSchema || []).map(t => t.function.name)),
    [extendedToolsSchema]
  );

  const clearChat = useCallback(async () => {
    setMessages([]);
    conversationHistoryRef.current = [{ role: "system", content: systemPrompt }];
    setError(null);
    setIsStreaming(false);
    setStreamingMessage(null);
    
    // Clear history from IndexedDB
    if (persistChatHistory && storageKeyRef.current) {
      try {
        await clearHistory(storageKeyRef.current);
        if (debug) {
          console.info('[Debug] ChatHistory: Cleared history from IndexedDB');
        }
      } catch (error) {
        if (debug) {
          console.error('[Debug] ChatHistory: Error clearing history:', error);
        }
      }
    }
  }, [systemPrompt, persistChatHistory]);

  const handleToolCalls = useCallback(async (toolCallsArray) => {
    const genAtStart = requestGenRef.current;
    setIsExecutingTools(true);
    const toolResponses = [];

    if (debug) {
      console.log('[Debug] Executing Tool Calls:', {
        count: toolCallsArray.length,
        tools: toolCallsArray.map(tc => tc.name)
      });
    }

    try {
    // Create array of promises for parallel tool execution
    const toolPromises = toolCallsArray.map(async (toolCall) => {
      const funcName = toolCall.name;
      const toolCallId = toolCall.id;
      let funcArgs = toolCall.arguments;
      
      if (debug) {
        console.log(`[Debug] Tool Call: ${funcName}`, {
          id: toolCallId,
          args: funcArgs
        });
      }

      // Parse arguments from string to object
      if (typeof funcArgs === 'string') {
        try {
          funcArgs = JSON.parse(funcArgs);
        } catch (e) {
          return {
            role: "tool",
            tool_call_id: toolCallId,
            content: JSON.stringify({ error: currentLocale.invalidArgumentsFormat.replace('{errorMessage}', e.message) })
          };
        }
      }

      // Normalize shape like { name, arguments } -> arguments
      if (funcArgs && typeof funcArgs === 'object' && 'arguments' in funcArgs && Object.keys(funcArgs).length <= 2) {
        funcArgs = funcArgs.arguments;
      }

      // Check tool availability
      if (!availableTools.has(funcName)) {
        return {
          role: "tool",
          tool_call_id: toolCallId,
          content: JSON.stringify({
            error: currentLocale.toolNotRegistered.replace('{toolName}', funcName)
          })
        };
      }

      try {
        // Special handling for readMCPResource tool
        if (funcName === 'readMCPResource' && readResourceFnRef.current) {
          const uri = funcArgs.uri;
          const result = await readResourceFnRef.current(uri);
          
          // Handle both spec-compliant and legacy response formats
          let data;
          if (result.contents && Array.isArray(result.contents) && result.contents.length > 0) {
            // Spec-compliant format: { contents: [{ uri, mimeType, text }] }
            const content = result.contents[0];
            if (content.text) {
              try {
                data = JSON.parse(content.text);
              } catch (_) {
                data = content.text;
              }
            } else {
              data = content;
            }
          } else if (result.data) {
            // Legacy format: { success: true, data: {...} }
            data = result.data;
          } else {
            data = result;
          }

          return {
            role: "tool",
            tool_call_id: toolCallId,
            content: JSON.stringify({ success: true, resource: uri, data })
          };
        }

        // Regular tool execution
        const result = await mcpClient.callTool(funcName, funcArgs);

        if (debug) {
          console.log(`[Debug] Tool Result: ${funcName}`, {
            id: toolCallId,
            success: !result.error,
            resultKeys: Object.keys(result)
          });
        }

        return {
          role: "tool",
          tool_call_id: toolCallId,
          content: JSON.stringify(result)
        };
      } catch (err) {
        if (debug) {
          console.error('[Debug] Tool execution error:', err);
          console.log(`[Debug] Tool Error: ${funcName}`, {
            id: toolCallId,
            error: err.message
          });
        }
        const statusCode = err.statusCode ?? err.data?.statusCode ?? (() => {
          const m = err.message && (err.message.match(/HTTP (\d{3})/) || err.message.match(/\[(\d{3})\]/));
          return m ? parseInt(m[1], 10) : undefined;
        })();
        const isAuthError = statusCode === 401 || (err.message && /unauthorized|401/i.test(err.message));
        const code = isAuthError ? 'TOOL_AUTH_ERROR' : 'TOOL_ERROR';
        const context = { toolName: funcName, toolCallId, statusCode, code };
        try {
          onToolError?.(err, context);
        } catch (_) {}
        setError({
          message: err.message,
          code,
          statusCode,
          toolName: funcName
        });
        return {
          role: "tool",
          tool_call_id: toolCallId,
          content: JSON.stringify({ error: currentLocale.toolExecutionError.replace('{errorMessage}', err.message) })
        };
      }
    });

    // Execute all tools in parallel
    const results = await Promise.allSettled(toolPromises);

    // Process results
    for (const result of results) {
      if (result.status === 'fulfilled') {
        toolResponses.push(result.value);
      } else {
        toolResponses.push({
          role: "tool",
          tool_call_id: 'unknown',
          content: JSON.stringify({ error: currentLocale.systemError.replace('{errorMessage}', result.reason.message) })
        });
      }
    }

    if (debug) {
      const hasError = (r) => {
        try {
          return !!JSON.parse(r.content).error;
        } catch (_) {
          return false;
        }
      };
      console.log('[Debug] Tool Calls Completed:', {
        totalCalls: toolCallsArray.length,
        successfulResponses: toolResponses.filter(r => !hasError(r)).length,
        failedResponses: toolResponses.filter(hasError).length
      });
    }

    return toolResponses;
    } finally {
      if (requestGenRef.current === genAtStart) {
        setIsExecutingTools(false);
      }
    }
  }, [mcpClient, actualToolsSchema, currentLocale, availableTools, debug, onToolError]);

  const callOpenAI = useCallback(async (history, options = {}) => {
    // Use provided parameters or defaults
    const actualModelName = modelName || 'gpt-4o-mini';
    const actualBaseUrl = baseUrl || 'http://127.0.0.1:1234/v1';
    const actualApiKey = apiKey;
    const toolsSchema = options.toolsOverride !== undefined ? options.toolsOverride : (extendedToolsSchema || []);
    const actualToolChoice = options.toolChoiceOverride !== undefined ? options.toolChoiceOverride : 'auto';

    const requestBody = {
      model: actualModelName,
      messages: history,
      temperature: temperature
    };

    // Always include tools in API request when available
    if (toolsSchema.length > 0) {
      requestBody.tools = toolsSchema;
      requestBody.tool_choice = actualToolChoice;
    }

    if (debug) {
      console.log('[Debug] OpenAI API Request:', {
        model: actualModelName,
        baseUrl: actualBaseUrl,
        messageCount: history.length,
        toolsCount: toolsSchema.length,
        temperature
      });
    }

    const headers = {
      'Content-Type': 'application/json'
    };

    if (actualApiKey) {
      headers['Authorization'] = `Bearer ${actualApiKey}`;
    }

    const response = await fetch(`${actualBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody),
      signal: options.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      const status = response.status;

      let errorMsg = currentLocale.apiError.replace('{status}', status);
      if (status === 401) {
        errorMsg += currentLocale.invalidApiKey;
      } else if (status === 404) {
        errorMsg += currentLocale.invalidEndpoint;
      } else if (status === 429) {
        errorMsg += currentLocale.rateLimitExceeded;
      } else if (status === 400) {
        // Try to extract error details
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error?.message) {
            errorMsg += ` - ${errorData.error.message}`;
          }
        } catch {
          errorMsg += currentLocale.invalidRequest;
        }
      } else if (status === 500) {
        errorMsg += currentLocale.internalServerError;
      }

      throw new Error(`${errorMsg}`);
    }

    const result = await response.json();
    
    if (debug) {
      console.log('[Debug] OpenAI API Response:', {
        model: result.model,
        finishReason: result.choices?.[0]?.finish_reason,
        hasToolCalls: !!result.choices?.[0]?.message?.tool_calls,
        toolCallsCount: result.choices?.[0]?.message?.tool_calls?.length || 0,
        contentLength: result.choices?.[0]?.message?.content?.length || 0
      });
    }
    
    return result;
  }, [modelName, baseUrl, apiKey, extendedToolsSchema, currentLocale, toolsMode, debug]);

  // Streaming version of OpenAI API call
  const callOpenAIStream = useCallback(async (history, options = {}, onChunk) => {
    // Use provided parameters or defaults
    const actualModelName = modelName || 'gpt-4o-mini';
    const actualBaseUrl = baseUrl || 'http://127.0.0.1:1234/v1';
    const actualApiKey = apiKey;
    const toolsSchema = options.toolsOverride !== undefined ? options.toolsOverride : (extendedToolsSchema || []);
    const actualToolChoice = options.toolChoiceOverride !== undefined ? options.toolChoiceOverride : 'auto';

    const requestBody = {
      model: actualModelName,
      messages: history,
      stream: true,
      temperature: temperature
    };

    // Always include tools in API request when available
    if (toolsSchema.length > 0) {
      requestBody.tools = toolsSchema;
      requestBody.tool_choice = actualToolChoice;
    }

    if (debug) {
      console.log('[Debug] OpenAI Stream API Request:', {
        model: actualModelName,
        baseUrl: actualBaseUrl,
        messageCount: history.length,
        toolsCount: toolsSchema.length,
        temperature,
        streaming: true
      });
    }

    const headers = {
      'Content-Type': 'application/json'
    };

    if (actualApiKey) {
      headers['Authorization'] = `Bearer ${actualApiKey}`;
    }

    const response = await fetch(`${actualBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody),
      signal: options.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      const status = response.status;

      let errorMsg = currentLocale.apiError.replace('{status}', status);
      if (status === 401) {
        errorMsg += currentLocale.invalidApiKey;
      } else if (status === 404) {
        errorMsg += currentLocale.invalidEndpoint;
      } else if (status === 429) {
        errorMsg += currentLocale.rateLimitExceeded;
      } else if (status === 400) {
        // Try to extract error details
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error?.message) {
            errorMsg += ` - ${errorData.error.message}`;
          }
        } catch {
          errorMsg += currentLocale.invalidRequest;
        }
      } else if (status === 500) {
        errorMsg += currentLocale.internalServerError;
      }

      throw new Error(`${errorMsg}`);
    }

    // Handle streaming response
    if (!response.body) {
      throw new Error('Streaming response body is empty');
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const onAbort = () => {
      try { reader.cancel(); } catch (_) { /* no-op */ }
    };
    options.signal?.addEventListener('abort', onAbort);

    try {
      while (true) {
        if (options.signal?.aborted) {
          const err = new Error('Aborted');
          err.name = 'AbortError';
          throw err;
        }
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              return;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta) {
                onChunk(parsed.choices[0].delta);
              }
            } catch (e) {
              // Failed to parse chunk, continue
            }
          }
        }
      }
    } finally {
      options.signal?.removeEventListener('abort', onAbort);
      try { await reader.cancel(); } catch (_) { /* no-op */ }
      try { reader.releaseLock(); } catch (_) { /* no-op */ }
    }
  }, [modelName, baseUrl, apiKey, extendedToolsSchema, currentLocale, toolsMode, debug]);

  // Optional validator: checks assistant display content and can warn or request a revision
  const validateAssistantContent = useCallback(async (assistantText, options = {}) => {
    try {
      if (!validationOptions || !validationOptions.enabled) return { valid: true };
      const mode = validationOptions.mode === 'revise' ? 'revise' : 'warn';
      const customPrompt = validationOptions.validatorPrompt;
      const sysPrompt = customPrompt || (
        locale === 'ru'
          ? 'Ты валидатор ответа. Проверь последний ответ ассистента на пустоту/мусор и очевидные ошибки разметки JSON. Ответь строго в JSON: {"valid": true|false, "note": "кратко", "revision": "если не валидно – исправленный текст или пусто"}. Без пояснений.'
          : (locale === 'zh'
            ? '你是回答验证器。检查助手上个回复是否为空/无意义以及JSON标记是否明显错误。只用JSON回复：{"valid": true|false, "note": "简要", "revision": "若无效给出修正文本或留空"}。不要解释。'
            : 'You are an answer validator. Check the last assistant reply for emptiness/noise and obvious JSON markup issues. Reply strictly as JSON: {"valid": true|false, "note": "short", "revision": "if invalid – corrected text or empty"}. No explanations.'));

      const validationHistory = [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: `Assistant reply to validate:\n\n\n${assistantText}` }
      ];

      const res = await callOpenAI(validationHistory, { toolsOverride: [], toolChoiceOverride: 'none', signal: options.signal });
      if (userCancelledRef.current || options.signal?.aborted) {
        return { valid: true };
      }
      const msg = res.choices?.[0]?.message;
      const raw = msg?.content || '';
      let verdict;
      try {
        verdict = JSON.parse(raw);
      } catch (_) {
        // If the model did not return JSON, treat as valid to avoid accidental loops
        return { valid: true };
      }
      if (verdict && verdict.valid === false) {
        if (userCancelledRef.current || options.signal?.aborted) {
          return { valid: true };
        }
        if (mode === 'warn') {
          const note = typeof verdict.note === 'string' ? verdict.note : 'Validation failed.';
          const warnText = locale === 'ru' ? `⚠️ Проверка ответа: ${note}` : (locale === 'zh' ? `⚠️ 校验提示：${note}` : `⚠️ Validation: ${note}`);
          setMessages(prev => [...prev, { role: 'assistant', content: warnText }]);
          conversationHistoryRef.current.push({ role: 'assistant', content: warnText });
          return { valid: false, warned: true };
        }
        // revise mode: append a revised assistant response when provided
        if (typeof verdict.revision === 'string' && verdict.revision.trim()) {
          const revised = verdict.revision.trim();
          setMessages(prev => [...prev, { role: 'assistant', content: revised }]);
          conversationHistoryRef.current.push({ role: 'assistant', content: revised });
          return { valid: false, revised: true };
        }
        return { valid: false };
      }
      return { valid: true };
    } catch (_) {
      return { valid: true };
    }
  }, [validationOptions, locale, callOpenAI]);

  const sendWithMode = useCallback(async (userMessage, { streaming } = { streaming: false }) => {
    if (!userMessage.trim() || isLoading || isProcessingRef.current) {
      return;
    }

    const originalUserMessage = userMessage;
    isProcessingRef.current = true;
    requestGenRef.current += 1;
    const myGen = requestGenRef.current;
    userCancelledRef.current = false;
    setIsLoading(true);
    if (streaming) {
      setIsStreaming(true);
      setStreamingMessage(null);
    }
    setError(null);

    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const { signal } = abortController;

    const retryInstruction = locale === 'ru'
      ? 'Предыдущий ответ содержал неверный JSON вида {"": {}}. Сформируй корректный ответ: либо понятный текст для пользователя, либо корректные tool_calls.'
      : (locale === 'zh'
        ? '上一次回复包含无效的 JSON（{"": {}}）。请生成正确的回复：要么是用户可读的文本，要么是标准的 tool_calls。'
        : 'Previous reply contained invalid JSON of the form {"": {}}. Generate a correct reply: either a user-facing message or proper tool_calls.');
    const convertInstruction = locale === 'ru'
      ? 'Преобразуй свой предыдущий ответ в корректный формат tool_calls OpenAI без <|...|> тегов. Верни только tool_calls.'
      : (locale === 'zh'
        ? '将你之前的回复转换为没有 <|...|> 标签的标准 OpenAI tool_calls 格式。只返回 tool_calls。'
        : 'Convert your previous reply into proper OpenAI tool_calls format without <|...|> tags. Return tool_calls only.');
    const followupInstruction = locale === 'ru'
      ? 'Сформулируй краткий, конкретный вопрос пользователю о недостающих данных/доступах, необходимых для продолжения. Без тегов <think> и без кода. Одна короткая фраза.'
      : 'Write a brief, specific question to the user asking for the exact missing info or access required to proceed. No <think> tags, no code. One concise sentence.';

    const throwIfCancelled = () => {
      if (userCancelledRef.current || signal.aborted) {
        const err = new Error('Aborted');
        err.name = 'AbortError';
        throw err;
      }
    };

    try {
      if (conversationHistoryRef.current.length > 0 && conversationHistoryRef.current[0]?.role === 'system') {
        conversationHistoryRef.current[0] = { role: 'system', content: systemPrompt };
      }
      turnStartIndexRef.current = conversationHistoryRef.current.length;
      inFlightUserMessageRef.current = originalUserMessage;
      conversationHistoryRef.current.push({ role: 'user', content: originalUserMessage });

      const { allMessages: initialMessages } = filterMessagesByContext(conversationHistoryRef.current, maxContextSize);
      setMessages(initialMessages.filter(msg => msg.role !== 'system'));

      usedFollowUpRef.current = false;

      let loopCount = 0;
      const MAX_LOOPS = maxToolLoops;
      const usedControlTagRetryRef = { current: false };
      const usedEmptyJsonRetryRef = { current: false };
      let completed = false;

      while (loopCount < MAX_LOOPS) {
        throwIfCancelled();
        loopCount++;
        const { filtered } = filterMessagesByContext(conversationHistoryRef.current, maxContextSize);
        let assistantMsg;

        if (streaming) {
          setStreamingMessage({ role: 'assistant', content: '' });
          let accumulatedContent = '';
          let toolCalls = null;

          await callOpenAIStream(filtered, { signal }, (delta) => {
            if (userCancelledRef.current || signal.aborted) {
              return;
            }
            if (delta.content) {
              accumulatedContent += delta.content;
              setStreamingMessage(prev => ({
                ...prev,
                content: accumulatedContent
              }));
            }
            if (delta.tool_calls) {
              if (!toolCalls) toolCalls = [];
              delta.tool_calls.forEach(tc => {
                const existingIndex = toolCalls.findIndex(t => t.index === tc.index);
                if (existingIndex >= 0) {
                  if (tc.function) {
                    if (!toolCalls[existingIndex].function) {
                      toolCalls[existingIndex].function = {};
                    }
                    if (tc.function.name) {
                      toolCalls[existingIndex].function.name = tc.function.name;
                    }
                    if (tc.function.arguments) {
                      toolCalls[existingIndex].function.arguments =
                        (toolCalls[existingIndex].function.arguments || '') + tc.function.arguments;
                    }
                  }
                  if (tc.id) {
                    toolCalls[existingIndex].id = tc.id;
                  }
                  if (!toolCalls[existingIndex].type) {
                    toolCalls[existingIndex].type = 'function';
                  }
                } else {
                  toolCalls.push({
                    type: 'function',
                    index: tc.index,
                    id: tc.id || generateToolCallId(),
                    function: tc.function || {}
                  });
                }
              });
            }
          });

          assistantMsg = {
            role: 'assistant',
            content: accumulatedContent,
            ...(toolCalls && { tool_calls: toolCalls })
          };
        } else {
          const response = await callOpenAI(filtered, { signal });
          assistantMsg = response.choices[0].message;
        }

        throwIfCancelled();

        if (isEmptyKeyEmptyObjectContent(assistantMsg.content) && !usedEmptyJsonRetryRef.current) {
          usedEmptyJsonRetryRef.current = true;
          conversationHistoryRef.current.push({ role: 'system', content: retryInstruction });
          continue;
        }

        const parsed = parseAssistantResponse(assistantMsg, availableTools);
        conversationHistoryRef.current.push(toHistoryAssistantMessage(assistantMsg, parsed));

        if (parsed.toolCallsJson?.length) {
          const toolResponses = await handleToolCalls(parsed.toolCallsJson);
          throwIfCancelled();
          conversationHistoryRef.current.push(...toolResponses);

          if ((parsed.displayContent || '').trim()) {
            setMessages(prev => [...prev, { role: 'assistant', content: parsed.displayContent }]);
            await validateAssistantContent(parsed.displayContent, { signal });
            throwIfCancelled();
          } else {
            setMessages(prev => [...prev, {
              role: 'assistant',
              tool_calls: parsed.toolCallsJson.map(tc => ({ function: { name: tc.name } }))
            }]);
          }
          continue;
        }

        if ((parsed.displayContent || '').trim()) {
          setMessages(prev => [...prev, { role: 'assistant', content: parsed.displayContent }]);
          await validateAssistantContent(parsed.displayContent, { signal });
          throwIfCancelled();
        }

        const contentStr = typeof assistantMsg.content === 'string' ? assistantMsg.content : '';
        const hasControlTags = /<\|constrain\|>|<\|message\|>|<\|channel\|>/i.test(contentStr);
        if (hasControlTags && !usedControlTagRetryRef.current) {
          usedControlTagRetryRef.current = true;
          conversationHistoryRef.current.push({ role: 'system', content: convertInstruction });
          continue;
        }

        if (!(parsed.displayContent || '').trim() && !usedFollowUpRef.current) {
          usedFollowUpRef.current = true;
          conversationHistoryRef.current.push({ role: 'system', content: followupInstruction });
          continue;
        }

        completed = true;
        break;
      }

      if (!completed) {
        throw new Error(currentLocale.loopLimitReached);
      }

      throwIfCancelled();

      turnStartIndexRef.current = null;
      inFlightUserMessageRef.current = null;

      const { allMessages } = filterMessagesByContext(conversationHistoryRef.current, maxContextSize);
      setMessages(allMessages.filter(msg => msg.role !== 'system'));

      if (persistChatHistory && storageKeyRef.current) {
        try {
          await saveMessages(storageKeyRef.current, conversationHistoryRef.current, maxContextSize);
        } catch (error) {
          if (debug) {
            console.error('[Debug] ChatHistory: Error saving messages:', error);
          }
        }
      }

      if (currentConfigIndex !== 0) {
        if (debug) {
          console.info('[Debug] LLM Fallback: Request successful. Resetting to primary config.');
        }
        setCurrentConfigIndex(0);
      }
    } catch (err) {
      if (err?.name === 'AbortError' || userCancelledRef.current) {
        return;
      }

      if (currentConfigIndex < normalizedConfigs.length - 1) {
        if (debug) {
          console.warn(`[Debug] LLM Fallback: Config ${currentConfigIndex} (${normalizedConfigs[currentConfigIndex].modelName}) failed: ${err.message}. Trying next config...`);
        }

        if (conversationHistoryRef.current.length > 0 &&
            conversationHistoryRef.current[conversationHistoryRef.current.length - 1].role === 'user') {
          conversationHistoryRef.current.pop();
        }

        retryMessageRef.current = originalUserMessage;
        retryStreamingRef.current = streaming;
        isRetryingRef.current = true;

        setError(null);
        isProcessingRef.current = false;
        setIsLoading(false);
        setIsStreaming(false);
        setStreamingMessage(null);

        setCurrentConfigIndex(prev => prev + 1);
        return;
      }

      if (debug) {
        console.error(`[Debug] LLM Fallback: All configs failed. Last error: ${err.message}`);
      }
      setError({ message: err.message, code: 'LLM_ERROR' });

      const errorMsg = {
        role: 'assistant',
        content: currentLocale.errorMessage.replace('{message}', err.message)
      };
      conversationHistoryRef.current.push(errorMsg);

      const { allMessages } = filterMessagesByContext(conversationHistoryRef.current, maxContextSize);
      setMessages(allMessages.filter(msg => msg.role !== 'system'));
    } finally {
      if (requestGenRef.current === myGen && !isRetryingRef.current) {
        setIsLoading(false);
        setIsStreaming(false);
        setStreamingMessage(null);
        isProcessingRef.current = false;
        if (!userCancelledRef.current) {
          turnStartIndexRef.current = null;
          inFlightUserMessageRef.current = null;
        }
      }
    }
  }, [isLoading, callOpenAI, callOpenAIStream, handleToolCalls, availableTools, currentLocale, locale, validateAssistantContent, maxContextSize, persistChatHistory, currentConfigIndex, normalizedConfigs, systemPrompt, maxToolLoops, debug]);

  const sendMessage = useCallback((userMessage) => sendWithMode(userMessage, { streaming: false }), [sendWithMode]);
  const sendMessageStream = useCallback((userMessage) => sendWithMode(userMessage, { streaming: true }), [sendWithMode]);

  useEffect(() => {
    sendMessageStreamRef.current = sendMessageStream;
  }, [sendMessageStream]);

  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  const stop = useCallback(() => {
    const restored = inFlightUserMessageRef.current || '';
    userCancelledRef.current = true;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    const start = turnStartIndexRef.current;
    if (typeof start === 'number' && start >= 0) {
      conversationHistoryRef.current = conversationHistoryRef.current.slice(0, start);
    }
    turnStartIndexRef.current = null;
    inFlightUserMessageRef.current = null;

    const { allMessages } = filterMessagesByContext(conversationHistoryRef.current, maxContextSize);
    setMessages(allMessages.filter(msg => msg.role !== 'system'));
    setStreamingMessage(null);
    setIsStreaming(false);
    setIsLoading(false);
    setIsExecutingTools(false);
    setError(null);
    isProcessingRef.current = false;
    isRetryingRef.current = false;
    retryMessageRef.current = null;

    return restored;
  }, [maxContextSize]);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    sendMessageStream,
    stop,
    isStreaming,
    streamingMessage,
    isExecutingTools,
    clearChat,
    isLoadingHistory
  };
};
