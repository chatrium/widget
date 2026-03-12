import {useEffect, useRef, useState, useMemo} from 'react';
import { useMCPClient } from '../useMCPClient';
import {useOpenAIChat} from '../useOpenAIChat';
import { createVoiceRecognition } from '../voiceInput';
import defaultLocales from './locales';
import styles from './ChatWidget.module.css';

/**
 * Application version and repository URL (replaced during build from package.json)
 */
/* eslint-disable no-undef */
const APP_VERSION = __APP_VERSION__;
const REPO_URL = __REPO_URL__;
/* eslint-enable no-undef */

/**
 * Default theme configuration with all current colors
 */
const defaultTheme = {
  // Collapsed state
  mainButtonBackground: 'linear-gradient(145deg, #6bb4e3, #4a9fe3)',
  mainButtonColor: 'white',
  voiceButtonBackground: 'linear-gradient(145deg, #a3b1c6, #8a97ad)',
  voiceButtonColor: 'white',
  voiceButtonDisabledBackground: 'linear-gradient(145deg, #c5cacf, #a8acb3)',
  recordingButtonBackground: 'linear-gradient(145deg, #ff6b6b, #e55555)',
  
  // Expanded state - header
  headerBackground: 'linear-gradient(135deg, #edf2f7, #dbe4ee)',
  headerTextColor: '#2d3748',
  headerButtonBackground: 'linear-gradient(145deg, rgba(107, 180, 227, 0.2), rgba(74, 159, 227, 0.2))',
  headerButtonColor: '#4a5568',
  headerButtonHoverBackground: 'linear-gradient(145deg, rgba(107, 180, 227, 0.3), rgba(74, 159, 227, 0.3))',
  
  // Messages area
  messagesBackground: '#f8fafc',
  userMessageBackground: 'linear-gradient(135deg, #bee3f8, #90cdf4)',
  userMessageColor: '#2c5282',
  assistantMessageBackground: 'white',
  assistantMessageBorder: '#e2e8f0',
  assistantMessageColor: '#4a5568',
  greetingMessageBackground: 'linear-gradient(135deg, #e6fffa, #b2f5ea)',
  greetingMessageBorder: '#9ae6b4',
  greetingMessageColor: '#234e52',
  infoMessageBackground: 'linear-gradient(135deg, #c6f6d5, #9ae6b4)',
  infoMessageBorder: '#9ae6b4',
  infoMessageColor: '#2f855a',
  errorMessageBackground: 'linear-gradient(135deg, #fed7d7, #fbb6b6)',
  errorMessageBorder: '#feb2b2',
  errorMessageColor: '#c53030',
  
  // Input area
  inputBackground: '#f8fafc',
  inputBorder: '#e2e8f0',
  inputFocusBorder: '#90cdf4',
  inputAreaBackground: 'white',
  inputAreaBorderTop: '#edf2f7',
  sendButtonBackground: 'linear-gradient(145deg, #6bb4e3, #4a9fe3)',
  sendButtonColor: 'white',
  sendButtonHoverBackground: 'linear-gradient(145deg, #4a9fe3, #2b6cb0)',
  sendButtonDisabledBackground: 'linear-gradient(145deg, #c5cacf, #a8acb3)',
  
  // Tooltip
  tooltipBackground: 'linear-gradient(135deg, #ffffff, #f8f9fa)',
  tooltipBorder: '#e2e8f0',
  tooltipColor: '#2d3748',
  
  // Expanded window
  expandedBackground: 'white',
  expandedBorder: '#e2e8f0',
  
  // Images (optional)
  headerIcon: null,
  botAvatar: null,
  userAvatar: null,
  expandedBackgroundImage: null
};

/**
 * Clean assistant content from service tags
 */
const cleanAssistantContent = (content) => {
  if (!content || typeof content !== 'string') {
    return content || '';
  }
  let cleanedContent = content.replace(/<think\b[^>]*>[\s\S]*?<\/think\b[^>]*>/gi, '').trim();
  
  // Remove tool call JSON blocks
  cleanedContent = cleanedContent.replace(/<\|constrain\|>[\s\S]*?<\|message\|>[\s\S]*?<\/message>/gi, '');
  cleanedContent = cleanedContent.replace(/<\|constrain\|>[\s\S]*?<\|message\|>[\s\S]*?$/gi, '');
  
  // Remove standalone JSON blocks that look like tool calls (but not inline JSON)
  cleanedContent = cleanedContent.replace(/^\s*\{[\s\S]*?\}\s*$/gm, '');
  
  // Remove empty markdown code blocks (multiple passes for cases with multiple blocks)
  for (let i = 0; i < 3; i++) {
    // Remove completely empty blocks
    cleanedContent = cleanedContent.replace(/```[a-zA-Z]*\s*```/g, '');
    // Remove any remaining empty code fences with newlines
    cleanedContent = cleanedContent.replace(/```\s*\n\s*\n\s*```/g, '');
    cleanedContent = cleanedContent.replace(/```\s*\n\s*```/g, '');
    // Remove blocks with only language identifier (e.g., ```json\n```)
    cleanedContent = cleanedContent.replace(/```[a-zA-Z]+\s*\n\s*```/g, '');
    // Remove blocks with only closing brace (artifacts from tool call extraction)
    cleanedContent = cleanedContent.replace(/```[a-zA-Z]*\s*\n\s*\}\s*```/g, '');
    cleanedContent = cleanedContent.replace(/```[a-zA-Z]*\s*\n\s*\}\s*\n\s*```/g, '');
    cleanedContent = cleanedContent.replace(/```[a-zA-Z]*\s*\n\s*[\{\}]\s*```/g, '');
    // Remove code blocks that contain only whitespace and/or single braces
    cleanedContent = cleanedContent.replace(/```[a-zA-Z]*\s*\n[\s\{\}]*\n\s*```/g, '');
    // Universal cleanup: remove any block that has nothing meaningful inside
    cleanedContent = cleanedContent.replace(/```[a-zA-Z]*[\s\n]*```/g, '');
  }
  
  // Final aggressive cleanup: remove ANY code fence block that only contains whitespace
  // This catches all edge cases like ```json\n\n```, ```\n  \n```, etc.
  cleanedContent = cleanedContent.replace(/```[\w]*[\s\S]*?```/g, (match) => {
    // Extract content between ``` markers
    const content = match.replace(/^```[\w]*\s*/, '').replace(/\s*```$/, '');
    // If content is only whitespace or braces, remove entire block
    if (!content.trim() || /^[\s\{\}]*$/.test(content)) {
      return '';
    }
    // Otherwise keep the block
    return match;
  });
  
  // Remove orphaned closing braces that may remain after tool call extraction
  cleanedContent = cleanedContent.replace(/^\s*[\{\}]\s*$/gm, '');
  // Remove lines that contain only "json" keyword (artifacts from markdown blocks)
  cleanedContent = cleanedContent.replace(/^\s*json\s*$/gm, '');
  
  // Clean up multiple consecutive newlines left after block removal (multiple passes)
  cleanedContent = cleanedContent.replace(/\n{3,}/g, '\n\n');
  cleanedContent = cleanedContent.replace(/\n{3,}/g, '\n\n'); // Second pass
  
  cleanedContent = cleanedContent.replace(/^\s*\n|\n\s*$/g, '');
  return cleanedContent;
};

/**
 * Escape HTML special characters to prevent injection
 */
const escapeHtml = (unsafe) => {
  if (unsafe == null) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

/**
 * Render a safe subset of Markdown to HTML with custom code block containers.
 * - Supports: headings, bold/italic, inline code, fenced code blocks, lists, links.
 * - No raw HTML allowed; input is escaped first.
 */
const renderMarkdown = (content, styles = {}) => {
  const text = escapeHtml(content || '');

  // Extract fenced code blocks first to avoid formatting inside them
  const codeBlocks = [];
  const fencedRegex = /```([a-zA-Z0-9_+-]*)\r?\n([\s\S]*?)```/g;
  let preprocessed = text.replace(fencedRegex, (_, lang = '', code = '') => {
    const language = (lang || '').trim() || 'text';
    const escapedCode = code.replace(/\n$/, '');
    const idx = codeBlocks.push({ language, code: escapedCode }) - 1;
    // Use a placeholder that won't be affected by markdown emphasis rules
    return `§§CBLOCK${idx}§§`;
  });

  // Basic block elements
  // Headings: ###### to # at line starts
  preprocessed = preprocessed
    .replace(/^######\s?(.+)$/gm, '<h6>$1</h6>')
    .replace(/^#####\s?(.+)$/gm, '<h5>$1</h5>')
    .replace(/^####\s?(.+)$/gm, '<h4>$1</h4>')
    .replace(/^###\s?(.+)$/gm, '<h3>$1</h3>')
    .replace(/^##\s?(.+)$/gm, '<h2>$1</h2>')
    .replace(/^#\s?(.+)$/gm, '<h1>$1</h1>');

  // GitHub-style tables - process line by line
  const lines = preprocessed.split('\n');
  const processedLines = [];
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i];
    
    // Check if this line starts a table
    if (line.trim().match(/^\|.*\|$/)) {
      const tableLines = [line];
      i++;
      
      // Collect separator line
      if (i < lines.length && lines[i].trim().match(/^\|[ \-:|]+\|$/)) {
        tableLines.push(lines[i]);
        i++;
        
        // Collect body lines
        while (i < lines.length && lines[i].trim().match(/^\|.*\|$/)) {
          tableLines.push(lines[i]);
          i++;
        }
        
        // Process the table
        if (tableLines.length >= 2) {
          const headerLine = tableLines[0];
          const sepLine = tableLines[1];
          const bodyLines = tableLines.slice(2);
          
          const splitRow = (line) => line
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split(/\|/)
            .map((c) => c.trim());
          
          const headers = splitRow(headerLine);
          const separators = splitRow(sepLine);
          
          if (separators.every((s) => /^:?-{3,}:?$/.test(s.replace(/\s+/g, '')))) {
            const thead = `<thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>`;
            const tbody = bodyLines.length
              ? `<tbody>${bodyLines
                  .map((line) => {
                    const cells = splitRow(line);
                    return `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
                  })
                  .join('')}</tbody>`
              : '<tbody></tbody>';
            
            processedLines.push(`<div class="${styles['table-container'] || 'table-container'}"><table class="${styles['md-table'] || 'md-table'}">${thead}${tbody}</table></div>`);
            continue;
          }
        }
      }
      
      // If table processing failed, add lines as-is
      processedLines.push(...tableLines);
    } else {
      processedLines.push(line);
      i++;
    }
  }
  
  preprocessed = processedLines.join('\n');

  // Checkboxes: [ ] and [x] - handle both list items and standalone
  preprocessed = preprocessed.replace(/^\s*-\s+\[([ x])\]\s+(.+)$/gm, (match, checked, text) => {
    const isChecked = checked === 'x';
    return `<div class="${styles['checkbox-item'] || 'checkbox-item'}">
      <input type="checkbox" ${isChecked ? 'checked' : ''} disabled class="${styles['checkbox-input'] || 'checkbox-input'}" />
      <span class="${styles['checkbox-text'] || 'checkbox-text'}">${text}</span>
    </div>`;
  });

  // Also handle checkboxes in regular text (not just list items)
  preprocessed = preprocessed.replace(/(^|\n)\s*\[([ x])\]\s+(.+?)(?=\n|$)/g, (match, prefix, checked, text) => {
    const isChecked = checked === 'x';
    return `${prefix}<div class="${styles['checkbox-item'] || 'checkbox-item'}">
      <input type="checkbox" ${isChecked ? 'checked' : ''} disabled class="${styles['checkbox-input'] || 'checkbox-input'}" />
      <span class="${styles['checkbox-text'] || 'checkbox-text'}">${text}</span>
    </div>`;
  });

  // Lists (ordered) - numbered lists - process all list items together
  const orderedListLines = preprocessed.split('\n');
  const orderedListProcessedLines = [];
  let l = 0;
  
  while (l < orderedListLines.length) {
    const line = orderedListLines[l];
    
    // Check if this line starts an ordered list
    if (line.trim().match(/^\d+\.\s+/)) {
      const orderedListItems = [];
      
      // Collect all consecutive ordered list lines (including nested ones)
      while (l < orderedListLines.length && (orderedListLines[l].trim().match(/^\d+\.\s+/) || orderedListLines[l].trim() === '')) {
        if (orderedListLines[l].trim() !== '') {
          orderedListItems.push(orderedListLines[l]);
        }
        l++;
      }
      
      // Process the collected ordered list items
      if (orderedListItems.length > 0) {
        const result = [];
        const stack = [];
        
        for (const orderedListLine of orderedListItems) {
          const match = orderedListLine.trim().match(/^(\d+)\.\s+(.+)$/);
          if (!match) continue;
          
          const [, number, content] = match;
          const indent = orderedListLine.length - orderedListLine.trimStart().length;
          const level = Math.floor(indent / 2);
          
          // Close deeper levels
          while (stack.length > level) {
            const closed = stack.pop();
            result.push(closed);
          }
          
          // Open new level if needed
          while (stack.length < level) {
            result.push('<ol>');
            stack.push('</ol>');
          }
          
          // Add current item
          const item = `<li>${content}</li>`;
          result.push(item);
        }
        
        // Close all remaining levels
        while (stack.length > 0) {
          result.push(stack.pop());
        }
        
        // Wrap in root ol if needed
        const html = result.join('');
        const finalResult = html.startsWith('<ol>') ? html : `<ol>${html}</ol>`;
        orderedListProcessedLines.push(finalResult);
      }
    } else {
      orderedListProcessedLines.push(line);
      l++;
    }
  }
  
  preprocessed = orderedListProcessedLines.join('\n');

  // Lists (unordered) - process all list items together
  const listLines = preprocessed.split('\n');
  const listProcessedLines = [];
  let k = 0;
  
  while (k < listLines.length) {
    const line = listLines[k];
    
    // Check if this line starts a list
    if (line.trim().match(/^[-*+]\s+/)) {
      const listItems = [];
      
      // Collect all consecutive list lines (including nested ones)
      while (k < listLines.length && (listLines[k].trim().match(/^[-*+]\s+/) || listLines[k].trim() === '')) {
        if (listLines[k].trim() !== '') {
          listItems.push(listLines[k]);
        }
        k++;
      }
      
      // Process the collected list items
      if (listItems.length > 0) {
        const result = [];
        const stack = [];
        
        for (const listLine of listItems) {
          const match = listLine.trim().match(/^([-*+])\s+(.+)$/);
          if (!match) continue;
          
          const [, marker, content] = match;
          const indent = listLine.length - listLine.trimStart().length;
          const level = Math.floor(indent / 2);
          
          // Close deeper levels
          while (stack.length > level) {
            const closed = stack.pop();
            result.push(closed);
          }
          
          // Open new level if needed
          while (stack.length < level) {
            result.push('<ul>');
            stack.push('</ul>');
          }
          
          // Add current item
          const item = `<li>${content}</li>`;
          result.push(item);
        }
        
        // Close all remaining levels
        while (stack.length > 0) {
          result.push(stack.pop());
        }
        
        // Wrap in root ul if needed
        const html = result.join('');
        const finalResult = html.startsWith('<ul>') ? html : `<ul>${html}</ul>`;
        listProcessedLines.push(finalResult);
      }
    } else {
      listProcessedLines.push(line);
      k++;
    }
  }
  
  preprocessed = listProcessedLines.join('\n');


  // Horizontal rules: --- or *** or ___
  preprocessed = preprocessed.replace(/^(?:---|\*\*\*|___)$/gm, '<hr>');

  // Process blockquotes - handle escaped > symbols and multi-line blockquotes
  const blockquoteLines = preprocessed.split('\n');
  const blockquoteProcessedLines = [];
  let j = 0;
  
  while (j < blockquoteLines.length) {
    const line = blockquoteLines[j];
    
    // Check if this line starts a blockquote
    if (line.trim().match(/^&gt;\s*(.*)$/)) {
      const quoteContent = [];
      
      // Collect all consecutive blockquote lines
      while (j < blockquoteLines.length && blockquoteLines[j].trim().match(/^&gt;\s*(.*)$/)) {
        const match = blockquoteLines[j].trim().match(/^&gt;\s*(.*)$/);
        if (match) {
          // Handle empty lines in blockquotes
          const content = match[1] || '';
          quoteContent.push(content);
        }
        j++;
      }
      
      // Create blockquote
      if (quoteContent.length > 0) {
        const content = quoteContent.join('<br />');
        blockquoteProcessedLines.push(`<blockquote>${content}</blockquote>`);
      }
    } else {
      blockquoteProcessedLines.push(line);
      j++;
    }
  }
  
  preprocessed = blockquoteProcessedLines.join('\n');


  // Links: [text](url)
  preprocessed = preprocessed.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Inline code: `code`
  preprocessed = preprocessed.replace(/`([^`]+)`/g, `<code class="${styles['inline-code'] || 'inline-code'}">$1</code>`);

  // Bold and italic
  preprocessed = preprocessed
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Only process underscores as markdown if they're surrounded by whitespace or punctuation
    .replace(/(^|\s|>|\(|\[)__([^_\n]+)__(\s|<|\)|\]|$)/g, '$1<strong>$2</strong>$3')
    .replace(/(^|\s|>|\(|\[)_([^_\n]+)_(\s|<|\)|\]|$)/g, '$1<em>$2</em>$3')
    // Strikethrough: ~~text~~
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // Paragraphs: wrap plain lines separated by blank lines
  preprocessed = preprocessed
    .split(/\n{2,}/)
    .map((chunk) => {
      if (/^\s*<\/(?:h\d|ul|ol|hr|blockquote)>/i.test(chunk) || /^(?:<h\d|<ul|<ol|<div|<pre|<blockquote|<hr)/i.test(chunk.trim())) {
        return chunk;
      }
      if (chunk.trim().startsWith('<')) return chunk; // already a block
      const lines = chunk.split(/\n/).map((l) => l.trim()).filter(Boolean);
      return lines.length ? `<p>${lines.join('<br />')}</p>` : '';
    })
    .join('\n');

  // Re-insert code blocks as styled containers
  const withCode = preprocessed.replace(/§§CBLOCK(\d+)§§/g, (_, idxStr) => {
    const idx = parseInt(idxStr, 10);
    const block = codeBlocks[idx];
    if (!block) return '';
    
    // Skip rendering if code block is empty or contains only whitespace/braces
    const trimmedCode = block.code.trim();
    if (!trimmedCode || /^[\s\{\}]*$/.test(trimmedCode)) {
      return '';
    }
    
    const header = escapeHtml(block.language);
    return (
      `<div class="${styles['code-block'] || 'code-block'}">` +
        `<div class="${styles['code-block-header'] || 'code-block-header'}">${header}</div>` +
        `<pre class="${styles['code-block-body'] || 'code-block-body'}"><code>${block.code}</code></pre>` +
      `</div>`
    );
  });

  return withCode;
};

/**
 * Check if display content is empty
 * Expects already cleaned content (no need to clean again)
 */
const isDisplayContentEmpty = (content) => {
  if (!content || typeof content !== 'string') return true;
  const trimmed = content.trim();
  if (!trimmed) return true;

  // Remove HTML tags to check if there's actual text content
  const textOnly = trimmed.replace(/<[^>]*>/g, '').trim();
  
  // Also remove common whitespace characters and check if anything remains
  const meaningful = textOnly.replace(/[\s\u00A0\u200B\u200C\u200D\uFEFF]/g, '');
  
  return !meaningful || meaningful === '';
};

/**
 * Parse size value to CSS string
 * Accepts: number (as pixels), "100px", "50%"
 * Percentages are converted to viewport units (vw/vh) for proper viewport-relative sizing
 */
const parseSizeValue = (value, isHeight = false) => {
  if (typeof value === 'number') return `${value}px`;
  if (typeof value === 'string') {
    value = value.trim();
    if (value.endsWith('%')) {
      // Convert percentage to viewport units (vw for width, vh for height)
      const numValue = parseFloat(value);
      if (!isNaN(numValue)) {
        return isHeight ? `${numValue}vh` : `${numValue}vw`;
      }
    }
    if (value.endsWith('px') || value.endsWith('vw') || value.endsWith('vh')) return value;
    // If it's just a number string, treat as pixels
    const numValue = parseFloat(value);
    if (!isNaN(numValue)) return `${numValue}px`;
  }
  return value; // fallback
};

const ChatWidget = ({
                      position = 'bottom-right',
                      showComponents = 'both',
                      customComponent = null,
                      greeting = null,
                      chatTitle = 'AI Assistant Chat',
                      assistantName = 'AI',
                      // LLM configuration array (replaces individual modelName, baseUrl, apiKey, etc.)
                      llmConfigs = [{
                        modelName: 'gpt-4o-mini',
                        baseUrl: 'http://127.0.0.1:1234/v1',
                        apiKey: null,
                        temperature: 0.5,
                        maxContextSize: 32000,
                        maxToolLoops: 5,
                        systemPromptAddition: null,
                        validationOptions: null,
                        toolsMode: 'api'
                      }],
                      toolsSchema = [],
                      locale = 'en',
                  customLocales = {},
                  mcpServers = {},
                  envVars = {},
                  allowedTools = null,
                  blockedTools = [],
                  // Backward compatibility
                  externalServers = null,
                  // Widget size parameters
                  expandedWidth = 350,
                  expandedHeight = 400,
                  // Theme customization
                  theme = {},
                  // Chat history persistence
                  persistChatHistory = true,
                  historyDepthHours = 24,
                  // Debug logging
                  debug = false,
                  // Called when a tool execution fails (e.g. 401); use for redirect/login UI
                  onToolError = null,
                  // URI substrings for heuristic static resources (e.g. ['instruction'] for mcp://mik-api/instruction)
                  staticResourcePatterns = null
                    }) => {
  const [inputValue, setInputValue] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recognitionError, setRecognitionError] = useState(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipMessage, setTooltipMessage] = useState('');
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const tooltipTimeoutRef = useRef(null);
  const notificationTimeoutRef = useRef(null);
  const recognitionRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const isExpandedRef = useRef(false);
  const latestSendMessageRef = useRef(null);
  const lastMicActionAtRef = useRef(0);
  const wasAtBottomRef = useRef(true);
  const lastProcessedMessageIndexRef = useRef(-1);
  const historyJustLoadedRef = useRef(false);

  // Merge theme with defaults
  const mergedTheme = useMemo(() => ({
    ...defaultTheme,
    ...theme
  }), [theme]);

  const mergedLocales = {
    ...defaultLocales,
    ...customLocales
  };

  const currentLocale = mergedLocales[locale] || mergedLocales.en;

  // Backward compatibility: convert externalServers array to mcpServers object
  const finalMcpServers = useMemo(() => {
    if (externalServers && Array.isArray(externalServers)) {
      const converted = {};
      externalServers.forEach(server => {
        if (server.id) {
          converted[server.id] = {
            type: server.transport === 'ws' ? 'ws' : 'sse',
            url: server.url,
            headers: server.headers,
            protocols: server.protocols,
            withCredentials: server.withCredentials,
            postUrl: server.postUrl,
            timeoutMs: server.timeoutMs
          };
        }
      });
      return converted;
    }
    return mcpServers;
  }, [externalServers, mcpServers]);

  const { client, tools, resources, status, readResource } = useMCPClient({ 
    mcpServers: finalMcpServers,
    envVars,
    allowedTools,
    blockedTools,
    debug
  });

  const actualToolsSchema = toolsSchema.length > 0
  ? toolsSchema
  : tools.map(tool => ({
      type: "function",
      function: {
        name: tool.qualifiedName || tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));

  const {
    messages,
    isLoading,
    error,
    sendMessage,
    sendMessageStream,
    isStreaming,
    streamingMessage,
    isExecutingTools,
    clearChat,
    isLoadingHistory
  } = useOpenAIChat(
    client,
    llmConfigs,
    actualToolsSchema,
    locale,
    resources,
    readResource,
    persistChatHistory,
    historyDepthHours,
    debug,
    { onToolError, staticResourcePatterns }
  );


  useEffect(() => {
    // Keep refs in sync with latest values without re-initializing recognition
    isExpandedRef.current = isExpanded;
  }, [isExpanded]);

  useEffect(() => {
    latestSendMessageRef.current = sendMessage;
  }, [sendMessage]);

  useEffect(() => {
    // Handle transcript delivery
    const handleTranscript = (transcript) => {
      if (isExpandedRef.current) {
        setInputValue(prev => prev + (prev ? ' ' : '') + transcript);
      } else if (typeof latestSendMessageRef.current === 'function') {
        latestSendMessageRef.current(transcript);
      }
    };

    // Handle recognition errors
    const handleError = (errorCode) => {
      setRecognitionError(errorCode);
    };

    // Handle recording state changes
    const handleRecordingChange = (isRecording) => {
      setIsRecording(isRecording);
    };

    // Create voice recognition instance
    const voiceRecognition = createVoiceRecognition(
      locale,
      handleTranscript,
      handleError,
      handleRecordingChange
    );

    recognitionRef.current = voiceRecognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.cleanup();
      }
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
      }
    };
  }, [locale]);

  const getErrorMessage = (error) => {
    switch (error) {
      case 'no-speech':
        return currentLocale.noSpeech;
      case 'audio-capture':
        return currentLocale.audioCapture;
      case 'not-allowed':
        return currentLocale.notAllowed;
      case 'not-supported':
        return currentLocale.notSupported;
      case 'network':
        return currentLocale.network;
      default:
        return currentLocale.unknown;
    }
  };

  const handleSend = () => {
    if (inputValue.trim()) {
      sendMessageStream(inputValue);
      setInputValue('');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  const showTemporaryTooltip = (message) => {
    if (showComponents === 'chat') return;

    setTooltipMessage(message);
    setShowTooltip(true);
    if (tooltipTimeoutRef.current) {
      clearTimeout(tooltipTimeoutRef.current);
    }
    tooltipTimeoutRef.current = setTimeout(() => {
      setShowTooltip(false);
    }, 2000);
  };

  const showNotificationPopup = (message) => {
    if (!message || isDisplayContentEmpty(message)) return;
    
    setNotificationMessage(message);
    setShowNotification(true);
    
    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
    }
    
    notificationTimeoutRef.current = setTimeout(() => {
      setShowNotification(false);
    }, 8000); // Auto-dismiss after 8 seconds
  };

  const dismissNotification = () => {
    setShowNotification(false);
    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
    }
  };

  const handleNotificationClick = () => {
    dismissNotification();
    setIsExpanded(true);
  };

  const toggleVoiceRecording = () => {
    if (showComponents === 'chat') return;

    if (!recognitionRef.current || !recognitionRef.current.isSupported()) {
      showTemporaryTooltip(currentLocale.voiceNotSupported);
      return;
    }

    // Cooldown disabled per user request; keep timestamp for potential diagnostics
    lastMicActionAtRef.current = Date.now();

    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.start();
      } catch (err) {
        const code = (err && err.name) || 'start_failed';
        setRecognitionError(code);
        showTemporaryTooltip(getErrorMessage(code));
      }
    }
  };

  useEffect(() => {
    if (recognitionError && recognitionError !== 'not_supported') {
      showTemporaryTooltip(getErrorMessage(recognitionError));
    }

    if (recognitionError === 'not_supported') {
      showTemporaryTooltip(currentLocale.voiceNotSupported);
    }
  }, [recognitionError, currentLocale]);

  // Smart auto-scroll function
  const isNearBottom = () => {
    if (!messagesContainerRef.current) return true;
    const container = messagesContainerRef.current;
    const threshold = 50; // pixels from bottom
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  };

  // Smooth scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({behavior: 'smooth'});
  };

  // Track scroll position to remember if user was at bottom
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      wasAtBottomRef.current = isNearBottom();
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll on messages change if user was at bottom
  useEffect(() => {
    if (wasAtBottomRef.current) {
      scrollToBottom();
    }

    // Auto-focus input when assistant is done and ready for user input
    if (isExpanded && !isLoading && !isStreaming && !isExecutingTools && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [messages, isExpanded, isLoading, isStreaming, isExecutingTools]);

  // Auto-scroll during streaming messages if user was at bottom
  useEffect(() => {
    if (streamingMessage && wasAtBottomRef.current) {
      scrollToBottom();
    }
  }, [streamingMessage]);

  // Auto-scroll when loading/executing tools starts (user just sent a message)
  useEffect(() => {
    if ((isLoading || isExecutingTools) && wasAtBottomRef.current) {
      scrollToBottom();
    }
  }, [isLoading, isExecutingTools]);

  useEffect(() => {
    if (isExpanded && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 300);
    }
  }, [isExpanded]);

  useEffect(() => {
    return () => {
      if (tooltipTimeoutRef.current) {
        clearTimeout(tooltipTimeoutRef.current);
      }
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
      }
    };
  }, []);

  // Track when history loading completes and initialize message index
  useEffect(() => {
    // When loading starts, set the flag
    if (isLoadingHistory) {
      historyJustLoadedRef.current = true;
    }
    
    // When loading completes, initialize the index
    if (!isLoadingHistory && historyJustLoadedRef.current && messages && messages.length > 0) {
      // Find last assistant message index and set it
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant' && messages[i].content) {
          const cleaned = cleanAssistantContent(messages[i].content);
          if (cleaned && !isDisplayContentEmpty(cleaned)) {
            lastProcessedMessageIndexRef.current = i;
            break;
          }
        }
      }
      // Reset the flag - history has been processed
      historyJustLoadedRef.current = false;
    }
  }, [isLoadingHistory, messages]);

  // Detect new assistant messages and show notification when chat is collapsed
  useEffect(() => {
    // Skip if chat is expanded, no messages, loading history, or history just loaded
    if (isExpanded || !messages || messages.length === 0 || isLoadingHistory || historyJustLoadedRef.current) {
      return;
    }

    // Find the last assistant message
    let lastAssistantMessageIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && messages[i].content) {
        const cleaned = cleanAssistantContent(messages[i].content);
        if (cleaned && !isDisplayContentEmpty(cleaned)) {
          lastAssistantMessageIndex = i;
          break;
        }
      }
    }

    // If we found a new assistant message, show notification
    if (lastAssistantMessageIndex > lastProcessedMessageIndexRef.current && lastAssistantMessageIndex >= 0) {
      lastProcessedMessageIndexRef.current = lastAssistantMessageIndex;
      const message = messages[lastAssistantMessageIndex];
      const cleanedContent = cleanAssistantContent(message.content);
      showNotificationPopup(cleanedContent);
    }
  }, [messages, isExpanded, isLoadingHistory]);

  // Clear notification when chat is expanded
  useEffect(() => {
    if (isExpanded) {
      dismissNotification();
    }
  }, [isExpanded]);

  const getPositionStyles = () => {
    const baseStyles = {
      position: 'fixed',
      zIndex: 1000
    };

    switch (position) {
      case 'top-left':
        return {...baseStyles, top: '20px', left: '20px'};
      case 'top-right':
        return {...baseStyles, top: '20px', right: '20px'};
      case 'bottom-left':
        return {...baseStyles, bottom: '20px', left: '20px'};
      case 'bottom-right':
      default:
        return {...baseStyles, bottom: '20px', right: '20px'};
    }
  };

  const getTooltipPositionStyles = () => {
    const baseStyles = {
      position: 'fixed',
      zIndex: 1001
    };

    switch (position) {
      case 'top-left':
        return {...baseStyles, top: '90px', left: '20px'};
      case 'top-right':
        return {...baseStyles, top: '90px', right: '20px'};
      case 'bottom-left':
        return {...baseStyles, bottom: '90px', left: '20px'};
      case 'bottom-right':
      default:
        return {...baseStyles, bottom: '90px', right: '20px'};
    }
  };

  const getNotificationPositionStyles = () => {
    const baseStyles = {
      position: 'fixed',
      zIndex: 1002
    };

    // Calculate vertical offset based on buttons visibility
    const buttonHeight = 50;
    const buttonGap = 10;
    const margin = 20;
    
    let offset = margin + buttonHeight; // One button
    if (showChat && showVoice) {
      offset = margin + buttonHeight + buttonGap + buttonHeight; // Two buttons stacked
    }
    
    offset += 10; // Additional gap between buttons and notification

    switch (position) {
      case 'top-left':
        return {...baseStyles, top: `${offset}px`, left: '20px'};
      case 'top-right':
        return {...baseStyles, top: `${offset}px`, right: '20px'};
      case 'bottom-left':
        return {...baseStyles, bottom: `${offset}px`, left: '20px'};
      case 'bottom-right':
      default:
        return {...baseStyles, bottom: `${offset}px`, right: '20px'};
    }
  };

  const showChat = showComponents === 'both' || showComponents === 'chat';
  const showVoice = showComponents === 'both' || showComponents === 'voice';

  if (customComponent) {
    const customProps = {
      isExpanded,
      setIsExpanded,
      isRecording,
      toggleVoiceRecording,
      toggleExpand,
      showTooltip,
      tooltipMessage,
      position,
      showComponents,
      greeting,
      chatTitle,
      inputValue,
      setInputValue,
      messages,
      isLoading,
      error,
      sendMessage,
      clearChat,
      handleSend,
      handleKeyPress,
      llmConfigs,
      toolsSchema,
      locale,
      currentLocale,
      assistantName,
      customLocales,
      mcpServers: finalMcpServers,
      envVars,
      allowedTools,
      blockedTools,
      inputRef,
      messagesEndRef,
      showTemporaryTooltip,
      getErrorMessage,
      expandedWidth,
      expandedHeight,
      theme: mergedTheme,
      persistChatHistory,
      historyDepthHours,
      isLoadingHistory,
      debug
    };

    return React.cloneElement(customComponent, customProps);
  }

  // Ensure CSS Modules processes all classes used in markdown
  const _ = styles['inline-code'] || styles['code-block'] || styles['code-block-header'] || styles['code-block-body'] || styles['md-table'] || styles['checkbox-item'] || styles['checkbox-input'] || styles['checkbox-text'];

  return (
    <div className={styles['chat-widget-wrapper']}>
      {showTooltip && showVoice && (
        <div
          className={styles['global-voice-tooltip']}
          style={{
            ...getTooltipPositionStyles(),
            background: mergedTheme.tooltipBackground,
            border: `1px solid ${mergedTheme.tooltipBorder}`,
            color: mergedTheme.tooltipColor
          }}
        >
          <div className={styles['tooltip-content']}>
            {tooltipMessage}
          </div>
        </div>
      )}

      {showNotification && !isExpanded && notificationMessage && (
        <div
          className={styles['notification-popup']}
          style={{
            ...getNotificationPositionStyles(),
            background: mergedTheme.assistantMessageBackground,
            border: `1px solid ${mergedTheme.assistantMessageBorder}`,
            color: mergedTheme.assistantMessageColor
          }}
        >
          <div className={styles['notification-header']}>
            <strong>{assistantName || 'AI'}</strong>
            <button
              className={styles['notification-close']}
              onClick={dismissNotification}
              title={currentLocale.close || 'Close'}
              style={{
                background: mergedTheme.headerButtonBackground,
                color: mergedTheme.headerButtonColor
              }}
            >
              ×
            </button>
          </div>
          <div 
            className={styles['notification-content']}
            onClick={handleNotificationClick}
          >
            <div className={styles['markdown-body']} dangerouslySetInnerHTML={{
              __html: renderMarkdown(
                notificationMessage.length > 150 
                  ? notificationMessage.substring(0, 150) + '...' 
                  : notificationMessage,
                styles
              )
            }} />
          </div>
        </div>
      )}

      <div
        className={`${styles['chat-widget-container']} ${isExpanded ? styles['expanded'] : styles['collapsed']}`}
        style={getPositionStyles()}
      >
        {!isExpanded ? (
          <div className={styles['chat-collapsed']}>
            {showChat && (
              <button
                className={`${styles['chat-toggle-button']} ${styles['main-button']} ${isLoading ? styles['thinking'] : ''}`}
                onClick={toggleExpand}
                title={currentLocale.openChat}
                style={{
                  background: mergedTheme.mainButtonBackground,
                  color: mergedTheme.mainButtonColor
                }}
              >
                {mergedTheme.headerIcon ? (
                  <img 
                    src={mergedTheme.headerIcon} 
                    alt="Chat" 
                    style={{ width: '24px', height: '24px', objectFit: 'contain' }}
                  />
                ) : '💬'}
              </button>
            )}
            {showVoice && (
              <button
                className={`${styles['chat-toggle-button']} ${styles['voice-button']} ${isRecording ? styles['recording'] : ''}`}
                onClick={toggleVoiceRecording}
                title={isRecording ? currentLocale.stopRecording : currentLocale.voiceInput}
                disabled={recognitionError === 'not_supported'}
                style={{
                  background: recognitionError === 'not_supported' 
                    ? mergedTheme.voiceButtonDisabledBackground 
                    : isRecording 
                      ? mergedTheme.recordingButtonBackground 
                      : mergedTheme.voiceButtonBackground,
                  color: mergedTheme.voiceButtonColor
                }}
              >
                🎤
              </button>
            )}
          </div>
        ) : (
          <div 
            className={styles['chat-expanded']}
            style={{
              width: parseSizeValue(expandedWidth, false),
              height: parseSizeValue(expandedHeight, true),
              background: mergedTheme.expandedBackground,
              border: `1px solid ${mergedTheme.expandedBorder}`,
              backgroundImage: mergedTheme.expandedBackgroundImage 
                ? `url(${mergedTheme.expandedBackgroundImage})` 
                : 'none',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat'
            }}
          >
            <div 
              className={styles['chat-header']}
              style={{
                background: mergedTheme.headerBackground,
                color: mergedTheme.headerTextColor
              }}
            >
              <h3>{chatTitle}</h3>
              <div className={styles['chat-header-buttons']}>
                {showVoice && (
                  <button
                    className={`${styles['voice-button-header']} ${isRecording ? styles['recording'] : ''}`}
                    onClick={toggleVoiceRecording}
                    title={isRecording ? currentLocale.stopRecording : currentLocale.voiceInput}
                    disabled={recognitionError === 'not_supported'}
                    style={{
                      background: isRecording 
                        ? mergedTheme.recordingButtonBackground 
                        : mergedTheme.headerButtonBackground,
                      color: mergedTheme.headerButtonColor
                    }}
                  >
                    🎤
                  </button>
                )}
                <button 
                  onClick={clearChat} 
                  title={currentLocale.clearChat}
                  style={{
                    background: mergedTheme.headerButtonBackground,
                    color: mergedTheme.headerButtonColor
                  }}
                >🗑️</button>
                <button 
                  onClick={toggleExpand} 
                  title={currentLocale.collapseChat}
                  style={{
                    background: mergedTheme.headerButtonBackground,
                    color: mergedTheme.headerButtonColor
                  }}
                >−</button>
              </div>
            </div>

            <div 
              ref={messagesContainerRef} 
              className={styles['chat-messages']}
              style={{
                backgroundColor: mergedTheme.messagesBackground
              }}
            >
              {greeting && (
                <div 
                  className={`${styles['message']} ${styles['message-greeting']}`}
                  style={{
                    background: mergedTheme.greetingMessageBackground,
                    border: `1px solid ${mergedTheme.greetingMessageBorder}`,
                    color: mergedTheme.greetingMessageColor
                  }}
                >
                  <strong>{currentLocale.greetingTitle}</strong>
                  <div className={styles['markdown-body']} dangerouslySetInnerHTML={{
                    __html: renderMarkdown(greeting, styles)
                  }} />
                </div>
              )}

              {messages.map((msg, index) => {
                // Clean content first for assistant messages
                let displayContent = msg.content;
                if (msg.role === 'assistant') {
                  // During tool calls, suppress assistant content; status bubble shows action
                  if (msg.tool_calls && msg.tool_calls.length > 0) {
                    displayContent = '';
                  } else if (msg.content) {
                    displayContent = cleanAssistantContent(msg.content);
                  }
                } else if (msg.content) {
                  displayContent = cleanAssistantContent(msg.content);
                }

                const shouldDisplayMessage = () => {
                  // Hide tool role messages entirely
                  if (msg.role === 'tool') return false;

                  // Suppress listing of tool calls as separate message; status bubble will reflect state
                  if (msg.tool_calls && msg.tool_calls.length > 0) return false;

                  if (msg.role === 'assistant') {
                    // Check if cleaned content is empty
                    if (!displayContent || isDisplayContentEmpty(displayContent)) {
                      return false;
                    }
                    // Double-check by rendering markdown and checking if result has text
                    const rendered = renderMarkdown(displayContent, styles);
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = rendered;
                    const textContent = tempDiv.textContent || tempDiv.innerText || '';
                    return textContent.trim().length > 0;
                  }

                  return !!msg.content;
                };

                if (!shouldDisplayMessage()) {
                  return null;
                }

                const isExcluded = msg.excludedFromContext === true;
                const tooltipText = isExcluded ? currentLocale.messageExcludedFromContext : '';

                const messageStyle = msg.role === 'user' 
                  ? {
                      background: mergedTheme.userMessageBackground,
                      color: mergedTheme.userMessageColor
                    }
                  : msg.role === 'assistant'
                  ? {
                      background: mergedTheme.assistantMessageBackground,
                      border: `1px solid ${mergedTheme.assistantMessageBorder}`,
                      color: mergedTheme.assistantMessageColor
                    }
                  : {};

                const avatarUrl = msg.role === 'user' 
                  ? mergedTheme.userAvatar 
                  : msg.role === 'assistant' 
                    ? mergedTheme.botAvatar 
                    : null;

                const messageClasses = `${styles['message']} ${styles[`message-${msg.role}`]} ${isExcluded ? styles['message-excluded'] : ''}`;

                return (
                  <div key={index} className={messageClasses} style={messageStyle} title={tooltipText}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      {avatarUrl && (
                        <img 
                          src={avatarUrl} 
                          alt={msg.role} 
                          style={{ 
                            width: '28px', 
                            height: '28px', 
                            borderRadius: '50%', 
                            objectFit: 'cover',
                            flexShrink: 0,
                            marginTop: '2px'
                          }}
                        />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <strong>
                          {msg.role === 'user' ? currentLocale.user :
                            msg.role === 'assistant' ? (assistantName || 'AI') :
                              msg.role === 'tool' ? currentLocale.tool : msg.role}
                        </strong>:
                        {displayContent && displayContent.trim() ? (
                          <div className={styles['markdown-body']} dangerouslySetInnerHTML={{
                            __html: renderMarkdown(displayContent, styles)
                          }} />
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
              {streamingMessage && streamingMessage.content && streamingMessage.content.trim() && (
                <div 
                  className={`${styles['message']} ${styles['message-assistant']}`}
                  style={{
                    background: mergedTheme.assistantMessageBackground,
                    border: `1px solid ${mergedTheme.assistantMessageBorder}`,
                    color: mergedTheme.assistantMessageColor
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    {mergedTheme.botAvatar && (
                      <img 
                        src={mergedTheme.botAvatar} 
                        alt="assistant" 
                        style={{ 
                          width: '28px', 
                          height: '28px', 
                          borderRadius: '50%', 
                          objectFit: 'cover',
                          flexShrink: 0,
                          marginTop: '2px'
                        }}
                      />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong>{assistantName || 'AI'}:</strong>
                      <div className={styles['markdown-body']} dangerouslySetInnerHTML={{
                        __html: renderMarkdown(streamingMessage.content, styles)
                      }} />
                    </div>
                  </div>
                </div>
              )}
              {isExecutingTools && (
                <div 
                  className={`${styles['message']} ${styles['message-info']}`}
                  style={{
                    background: mergedTheme.infoMessageBackground,
                    border: `1px solid ${mergedTheme.infoMessageBorder}`,
                    color: mergedTheme.infoMessageColor
                  }}
                >
                  <em>{currentLocale.callingToolGeneric}</em>
                </div>
              )}
              {isLoading && !isExecutingTools && !(streamingMessage && streamingMessage.content && streamingMessage.content.trim()) && (
                <div 
                  className={`${styles['message']} ${styles['message-info']}`}
                  style={{
                    background: mergedTheme.infoMessageBackground,
                    border: `1px solid ${mergedTheme.infoMessageBorder}`,
                    color: mergedTheme.infoMessageColor
                  }}
                >
                  <em>{`${assistantName || 'AI'} ${currentLocale.thinking}`}</em>
                </div>
              )}
              {error && (
                <div 
                  className={`${styles['message']} ${styles['message-error']}`}
                  style={{
                    background: mergedTheme.errorMessageBackground,
                    border: `1px solid ${mergedTheme.errorMessageBorder}`,
                    color: mergedTheme.errorMessageColor
                  }}
                >
                  <strong>{currentLocale.error}:</strong> {typeof error === 'string' ? error : (error?.message ?? '')}
                </div>
              )}
              <div ref={messagesEndRef}/>
            </div>

            <div 
              className={styles['chat-input-area']}
              style={{
                background: mergedTheme.inputAreaBackground,
                borderTop: `1px solid ${mergedTheme.inputAreaBorderTop}`
              }}
            >
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={isRecording ? currentLocale.speaking : currentLocale.enterMessage}
                disabled={isLoading || isRecording}
                rows="2"
                style={{
                  background: mergedTheme.inputBackground,
                  borderColor: mergedTheme.inputBorder
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = mergedTheme.inputFocusBorder;
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = mergedTheme.inputBorder;
                }}
              />
              <button 
                onClick={handleSend} 
                disabled={isLoading || !inputValue.trim() || isRecording}
                style={{
                  background: (isLoading || !inputValue.trim() || isRecording) 
                    ? mergedTheme.sendButtonDisabledBackground 
                    : mergedTheme.sendButtonBackground,
                  color: mergedTheme.sendButtonColor
                }}
              >
                {isLoading ? '...' : '➤'}
              </button>
            </div>

            {/* Version info in bottom-right corner */}
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={styles['version-info']}
              title="View on GitHub"
            >
              v{APP_VERSION}
            </a>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatWidget;