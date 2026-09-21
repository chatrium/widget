import {useEffect, useRef, useState, useMemo, cloneElement, memo} from 'react';
import { useMCPClient } from '../useMCPClient';
import {useOpenAIChat} from '../useOpenAIChat';
import { createVoiceRecognition } from '../voiceInput';
import { typesetElement } from '../mathjax';
import defaultLocales from './locales';
import styles from './ChatWidget.module.css';
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGES_PER_MESSAGE,
  formatMaxImageSize,
  getMessageImages,
  getMessageText,
  isSafeImageUrl,
  messageHasContent,
  processImageFile
} from '../chatImages';

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
  cancelButtonBackground: 'linear-gradient(145deg, #ff6b6b, #e55555)',
  cancelButtonHoverBackground: 'linear-gradient(145deg, #e55555, #c53030)',
  
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

  const mathSlots = [];
  cleanedContent = cleanedContent.replace(
    /\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[^$\n]+\$/g,
    (match) => {
      mathSlots.push(match);
      return `§§CLEANMATH${mathSlots.length - 1}§§`;
    }
  );
  
  // Remove standalone JSON blocks that look like tool calls (but not inline JSON or TeX braces)
  cleanedContent = cleanedContent.replace(/^\s*\{[\s\S]*?\}\s*$/gm, (block) => (
    /"\s*:\s*/.test(block) ? '' : block
  ));
  
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

  cleanedContent = cleanedContent.replace(/§§CLEANMATH(\d+)§§/g, (_, idx) => mathSlots[parseInt(idx, 10)] || '');
  
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

const unescapeHtml = (value) => String(value || '')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#039;/g, "'");

const looksLikeTex = (body) => {
  const trimmed = String(body || '').trim();
  if (!trimmed) return false;
  if (/^\d+([.,]\d+)?$/.test(trimmed)) return false;
  return true;
};

const extractInlineCode = (text) => {
  const inlineCodes = [];
  const next = text.replace(/`([^`]+)`/g, (_, code) => {
    const idx = inlineCodes.push(code) - 1;
    return `§§ICODE${idx}§§`;
  });
  return { text: next, inlineCodes };
};

const extractMath = (text) => {
  const mathBlocks = [];
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('$$', i)) {
      const end = text.indexOf('$$', i + 2);
      if (end !== -1) {
        const body = text.slice(i + 2, end);
        if (looksLikeTex(body)) {
          const idx = mathBlocks.push({ display: true, tex: body }) - 1;
          out += `§§MATH${idx}§§`;
          i = end + 2;
          continue;
        }
      }
    }
    if (text.startsWith('\\[', i)) {
      const end = text.indexOf('\\]', i + 2);
      if (end !== -1) {
        const body = text.slice(i + 2, end);
        if (looksLikeTex(body)) {
          const idx = mathBlocks.push({ display: true, tex: body }) - 1;
          out += `§§MATH${idx}§§`;
          i = end + 2;
          continue;
        }
      }
    }
    if (text.startsWith('\\(', i)) {
      const end = text.indexOf('\\)', i + 2);
      if (end !== -1) {
        const body = text.slice(i + 2, end);
        if (looksLikeTex(body)) {
          const idx = mathBlocks.push({ display: false, tex: body }) - 1;
          out += `§§MATH${idx}§§`;
          i = end + 2;
          continue;
        }
      }
    }
    if (text[i] === '$' && text[i + 1] !== '$' && (i === 0 || text[i - 1] !== '\\')) {
      const end = text.indexOf('$', i + 1);
      if (end > i + 1 && text[end - 1] !== '\\' && !text.slice(i + 1, end).includes('\n')) {
        const body = text.slice(i + 1, end);
        const trimmed = body.trim();
        const hasEdgeSpace = body.startsWith(' ') || body.endsWith(' ');
        if (!hasEdgeSpace && looksLikeTex(trimmed)) {
          const idx = mathBlocks.push({ display: false, tex: body }) - 1;
          out += `§§MATH${idx}§§`;
          i = end + 1;
          continue;
        }
      }
    }
    out += text[i];
    i += 1;
  }
  return { text: out, mathBlocks };
};

const escapeXml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const cellToPlainText = (cell) => {
  if (!cell) return '';
  const clone = cell.cloneNode(true);
  clone.querySelectorAll('script, style').forEach((node) => node.remove());
  clone.querySelectorAll('[data-tex]').forEach((el) => {
    const tex = (el.getAttribute('data-tex') || '').trim();
    if (!tex) return;
    const isDisplay = el.getAttribute('data-math') === 'display';
    el.replaceWith(document.createTextNode(isDisplay ? `$$${tex}$$` : `$${tex}$`));
  });
  clone.querySelectorAll('mjx-container').forEach((el) => {
    const label = (el.getAttribute('aria-label') || '').trim();
    el.replaceWith(document.createTextNode(label || (el.textContent || '').trim()));
  });
  clone.querySelectorAll('mjx-assistive-mml').forEach((node) => node.remove());
  return (clone.textContent || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
};

const collectTableMatrix = (table) => {
  const rows = [];
  const pushRow = (tr) => {
    const cells = Array.from(tr.children).filter((el) => el.tagName === 'TH' || el.tagName === 'TD');
    if (cells.length) rows.push(cells.map(cellToPlainText));
  };
  if (table.tHead && table.tHead.rows.length) {
    Array.from(table.tHead.rows).forEach(pushRow);
  }
  Array.from(table.tBodies).forEach((body) => {
    Array.from(body.rows).forEach(pushRow);
  });
  if (!rows.length) {
    Array.from(table.rows).forEach(pushRow);
  }
  return rows;
};

const inferSpreadsheetType = (text) => {
  if (text !== '' && !/^0\d/.test(text) && /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) {
    return 'Number';
  }
  return 'String';
};

const tableToSpreadsheetML = (table) => {
  const matrix = collectTableMatrix(table);
  const rowsXml = matrix.map((row) => {
    const cellsXml = row.map((text) => {
      const type = inferSpreadsheetType(text);
      return `<Cell><Data ss:Type="${type}">${escapeXml(text)}</Data></Cell>`;
    }).join('');
    return `<Row>${cellsXml}</Row>`;
  }).join('');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<?mso-application progid="Excel.Sheet"?>\n' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"' +
    ' xmlns:o="urn:schemas-microsoft-com:office:office"' +
    ' xmlns:x="urn:schemas-microsoft-com:office:excel"' +
    ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"' +
    ' xmlns:html="http://www.w3.org/TR/REC-html40">' +
    `<Worksheet ss:Name="Sheet1"><Table>${rowsXml}</Table></Worksheet>` +
    '</Workbook>'
  );
};

const downloadTableAsExcel = (table) => {
  if (!table || typeof document === 'undefined') return;
  const xml = `\uFEFF${tableToSpreadsheetML(table)}`;
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'table.xls';
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

const unescapeTex = (tex) => String(tex || '')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#039;/g, "'");

const restoreMath = (html, mathBlocks, styles = {}) => html.replace(/§§MATH(\d+)§§/g, (_, idxStr) => {
  const block = mathBlocks[parseInt(idxStr, 10)];
  if (!block) return '';
  const tex = unescapeTex(block.tex);
  const texAttr = escapeHtml(tex);
  if (block.display) {
    return `<div class="${styles['math-display'] || 'math-display'}" data-math="display" data-tex="${texAttr}">\\[${tex}\\]</div>`;
  }
  return `<span class="${styles['math-inline'] || 'math-inline'}" data-math="inline" data-tex="${texAttr}">\\(${tex}\\)</span>`;
});

/**
 * Render a safe subset of Markdown to HTML with custom code block containers.
 * - Supports: headings, bold/italic, inline code, fenced code blocks, lists, links, LaTeX.
 * - No raw HTML allowed; input is escaped first.
 */
const renderMarkdown = (content, styles = {}, locale = {}) => {
  const text = escapeHtml(content || '');
  const exportLabel = escapeHtml(locale.downloadExcel || 'Download Excel');
  const exportBarClass = styles['table-export-bar'] || 'table-export-bar';
  const exportBtnClass = styles['table-export-btn'] || 'table-export-btn';
  const tableScrollClass = styles['table-scroll'] || 'table-scroll';
  const exportIcon =
    '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
  const exportBar =
    `<div class="${exportBarClass}">` +
    `<button type="button" class="${exportBtnClass}" data-export="excel" title="${exportLabel}" aria-label="${exportLabel}">${exportIcon}${exportLabel}</button>` +
    '</div>';

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

  const inlineExtracted = extractInlineCode(preprocessed);
  preprocessed = inlineExtracted.text;
  const { inlineCodes } = inlineExtracted;

  const mathExtracted = extractMath(preprocessed);
  preprocessed = mathExtracted.text;
  const { mathBlocks } = mathExtracted;

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
            
            processedLines.push(
              `<div class="${styles['table-container'] || 'table-container'}" data-md-table="1">` +
              `${exportBar}` +
              `<div class="${tableScrollClass}"><table class="${styles['md-table'] || 'md-table'}">${thead}${tbody}</table></div>` +
              '</div>'
            );
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

  const mdImageClass = styles['md-image-thumb'] || 'md-image-thumb';
  const mdImageLinkClass = styles['md-image-link'] || 'md-image-link';
  preprocessed = preprocessed.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, rawUrl) => {
    const url = unescapeHtml(rawUrl);
    if (!isSafeImageUrl(url)) return alt || '';
    const src = escapeHtml(url);
    return `<a href="${src}" class="${mdImageLinkClass}" data-image-preview="1" target="_blank" rel="noopener noreferrer"><img class="${mdImageClass}" src="${src}" alt="${escapeHtml(alt || '')}" /></a>`;
  });

  // Links: [text](url)
  preprocessed = preprocessed.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Bold and italic (math and inline code already extracted)
  preprocessed = preprocessed
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Only process underscores as markdown if they're surrounded by whitespace or punctuation
    .replace(/(^|\s|>|\(|\[)__([^_\n]+)__(\s|<|\)|\]|$)/g, '$1<strong>$2</strong>$3')
    .replace(/(^|\s|>|\(|\[)_([^_\n]+)_(\s|<|\)|\]|$)/g, '$1<em>$2</em>$3')
    // Strikethrough: ~~text~~
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');

  const isDisplayMathPlaceholder = (token) => {
    const match = String(token || '').trim().match(/^§§MATH(\d+)§§$/);
    if (!match) return false;
    const block = mathBlocks[parseInt(match[1], 10)];
    return !!(block && block.display);
  };

  const isBlockChunk = (chunk) => {
    const trimmed = chunk.trim();
    if (/^§§CBLOCK\d+§§$/.test(trimmed) || isDisplayMathPlaceholder(trimmed)) return true;
    return /^\s*<\/(?:h\d|ul|ol|hr|blockquote)>/i.test(chunk)
      || /^(?:<h\d|<ul|<ol|<div|<pre|<blockquote|<hr)/i.test(trimmed);
  };

  const wrapInlineParagraph = (text) => {
    const lines = String(text || '').split(/\n/).map((l) => l.trim()).filter(Boolean);
    return lines.length ? `<p>${lines.join('<br />')}</p>` : '';
  };

  const splitDisplayPlaceholders = (line) => {
    const parts = [];
    const re = /§§MATH(\d+)§§/g;
    let lastIndex = 0;
    let foundDisplay = false;
    let match;
    while ((match = re.exec(line))) {
      const block = mathBlocks[parseInt(match[1], 10)];
      if (!(block && block.display)) continue;
      foundDisplay = true;
      if (match.index > lastIndex) {
        parts.push({ type: 'text', value: line.slice(lastIndex, match.index) });
      }
      parts.push({ type: 'display', value: match[0] });
      lastIndex = match.index + match[0].length;
    }
    if (!foundDisplay) return null;
    if (lastIndex < line.length) {
      parts.push({ type: 'text', value: line.slice(lastIndex) });
    }
    return parts;
  };

  // Paragraphs: wrap plain lines, but keep display math and fenced code out of <p>
  preprocessed = preprocessed
    .split(/\n{2,}/)
    .map((chunk) => {
      if (isBlockChunk(chunk) && !chunk.includes('\n')) return chunk;
      if (chunk.trim().startsWith('<') && isBlockChunk(chunk.split('\n')[0])) return chunk;

      const out = [];
      let buffer = [];
      const flush = () => {
        const wrapped = wrapInlineParagraph(buffer.join('\n'));
        if (wrapped) out.push(wrapped);
        buffer = [];
      };

      for (const line of chunk.split('\n')) {
        if (isBlockChunk(line)) {
          flush();
          out.push(line.trim());
          continue;
        }
        const split = splitDisplayPlaceholders(line);
        if (split) {
          for (const part of split) {
            if (part.type === 'display') {
              flush();
              out.push(part.value);
            } else {
              buffer.push(part.value);
            }
          }
          continue;
        }
        buffer.push(line);
      }
      flush();
      return out.join('\n');
    })
    .join('\n');

  preprocessed = restoreMath(preprocessed, mathBlocks, styles);

  preprocessed = preprocessed.replace(/§§ICODE(\d+)§§/g, (_, idxStr) => {
    const code = inlineCodes[parseInt(idxStr, 10)];
    if (code == null) return '';
    return `<code class="${styles['inline-code'] || 'inline-code'}">${code}</code>`;
  });

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

const htmlToPlainText = (html) => {
  if (!html) return '';
  return String(html)
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/[\s\u00A0\u200B\u200C\u200D\uFEFF]/g, '');
};

const ImageLightbox = ({ src, alt, onClose, closeLabel }) => {
  useEffect(() => {
    if (!src) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [src, onClose]);

  if (!src || !isSafeImageUrl(src)) return null;

  return (
    <div
      className={styles['image-lightbox']}
      role="dialog"
      aria-modal="true"
      aria-label={alt || closeLabel}
      onClick={onClose}
    >
      <button
        type="button"
        className={styles['image-lightbox-close']}
        onClick={onClose}
        title={closeLabel}
        aria-label={closeLabel}
      >
        ×
      </button>
      <img
        src={src}
        alt={alt || ''}
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
};

const ImageThumbs = ({ images, onOpen, openLabel }) => {
  if (!images || images.length === 0) return null;
  return (
    <div className={styles['image-thumbs']}>
      {images.map((image, index) => (
        <button
          type="button"
          key={`${image.url}-${index}`}
          className={styles['image-thumb-btn']}
          onClick={() => onOpen(image)}
          title={openLabel}
          aria-label={openLabel}
        >
          <img src={image.url} alt={image.alt || ''} className={styles['image-thumb']} />
        </button>
      ))}
    </div>
  );
};

const MarkdownBody = ({ html, mathJaxUrl, debounceMs = 0, closeImageLabel = 'Close' }) => {
  const ref = useRef(null);
  const [preview, setPreview] = useState(null);

  const handleClick = (event) => {
    const target = event.target instanceof Element ? event.target : event.target.parentElement;
    const previewLink = target && target.closest('[data-image-preview]');
    if (previewLink) {
      event.preventDefault();
      event.stopPropagation();
      const img = previewLink.querySelector('img');
      const src = previewLink.getAttribute('href') || img?.getAttribute('src');
      if (src && isSafeImageUrl(src)) {
        setPreview({ src, alt: img?.getAttribute('alt') || '' });
      }
      return;
    }
    const btn = target && target.closest('[data-export="excel"]');
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    const wrap = btn.closest('[data-md-table]');
    const table = wrap && wrap.querySelector('table');
    if (table) downloadTableAsExcel(table);
  };

  useEffect(() => {
    const el = ref.current;
    if (!el || !html) return undefined;

    let cancelled = false;
    const run = () => {
      if (cancelled || !el) return;
      el.innerHTML = html;
      typesetElement(el, { url: mathJaxUrl });
    };

    if (debounceMs > 0) {
      const timer = setTimeout(run, debounceMs);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [html, mathJaxUrl, debounceMs]);

  if (!html) return null;
  return (
    <>
      <div
        ref={ref}
        className={styles['markdown-body']}
        onClick={handleClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {preview ? (
        <ImageLightbox
          src={preview.src}
          alt={preview.alt}
          onClose={() => setPreview(null)}
          closeLabel={closeImageLabel}
        />
      ) : null}
    </>
  );
};

const ChatMessage = memo(function ChatMessage({
  msg,
  styles,
  currentLocale,
  assistantName,
  mergedTheme,
  mathJaxUrl
}) {
  const [preview, setPreview] = useState(null);
  const images = useMemo(() => getMessageImages(msg.content), [msg.content]);
  const textContent = useMemo(() => getMessageText(msg.content), [msg.content]);

  const displayContent = useMemo(() => {
    if (msg.role === 'assistant') {
      if (msg.tool_calls && msg.tool_calls.length > 0) return '';
      if (textContent) return cleanAssistantContent(textContent);
      return textContent;
    }
    if (textContent) return cleanAssistantContent(textContent);
    return textContent;
  }, [msg.role, textContent, msg.tool_calls]);

  const html = useMemo(() => {
    if (!displayContent || !String(displayContent).trim()) return '';
    return renderMarkdown(displayContent, styles, currentLocale);
  }, [displayContent, styles, currentLocale]);

  const hasVisual = images.length > 0 || (html && /<img\b/i.test(html));

  if (msg.role === 'tool') return null;
  if (msg.tool_calls && msg.tool_calls.length > 0) return null;
  if (msg.role === 'assistant') {
    if ((!displayContent || isDisplayContentEmpty(displayContent)) && !hasVisual) return null;
    if (!htmlToPlainText(html) && !hasVisual) return null;
  } else if (!messageHasContent(msg.content)) {
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
    <div className={messageClasses} style={messageStyle} title={tooltipText}>
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
          {html ? (
            <MarkdownBody html={html} mathJaxUrl={mathJaxUrl} closeImageLabel={currentLocale.closeImage} />
          ) : null}
          <ImageThumbs
            images={images}
            openLabel={currentLocale.openImage}
            onOpen={(image) => setPreview(image)}
          />
        </div>
      </div>
      {preview ? (
        <ImageLightbox
          src={preview.url || preview.src}
          alt={preview.alt}
          onClose={() => setPreview(null)}
          closeLabel={currentLocale.closeImage}
        />
      ) : null}
    </div>
  );
});

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
                  staticResourcePatterns = null,
                  // Optional MathJax script URL (self-host / CSP). Defaults to jsDelivr MathJax 3.
                  mathJaxUrl
                    }) => {
  const [inputValue, setInputValue] = useState('');
  const [attachedImages, setAttachedImages] = useState([]);
  const [attachError, setAttachError] = useState('');
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
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
  const fileInputRef = useRef(null);
  const dragDepthRef = useRef(0);
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

  const mergedLocales = useMemo(() => ({
    ...defaultLocales,
    ...customLocales
  }), [customLocales]);

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

  const actualToolsSchema = useMemo(() => (
    toolsSchema.length > 0
      ? toolsSchema
      : tools.map(tool => ({
          type: "function",
          function: {
            name: tool.qualifiedName || tool.name,
            description: tool.description,
            parameters: tool.parameters
          }
        }))
  ), [toolsSchema, tools]);

  const {
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

  const streamingHtml = useMemo(() => {
    if (!streamingMessage?.content?.trim()) return '';
    return renderMarkdown(streamingMessage.content, styles, currentLocale);
  }, [streamingMessage?.content, currentLocale]);

  const greetingHtml = useMemo(
    () => (greeting ? renderMarkdown(greeting, styles, currentLocale) : ''),
    [greeting, currentLocale]
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

  const addImageFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;

    const remaining = MAX_IMAGES_PER_MESSAGE - attachedImages.length;
    if (remaining <= 0) {
      setAttachError((currentLocale.tooManyImages || '').replace('{count}', String(MAX_IMAGES_PER_MESSAGE)));
      return;
    }

    const accepted = [];
    let errorKey = '';
    for (const file of files) {
      if (accepted.length >= remaining) {
        errorKey = 'tooMany';
        break;
      }
      const result = await processImageFile(file);
      if (!result.ok) {
        errorKey = result.error || 'load';
        continue;
      }
      accepted.push(result);
    }

    if (accepted.length) {
      setAttachedImages((prev) => {
        const room = MAX_IMAGES_PER_MESSAGE - prev.length;
        return room > 0 ? [...prev, ...accepted.slice(0, room)] : prev;
      });
    }

    if (errorKey === 'type') {
      setAttachError(currentLocale.unsupportedImageType);
    } else if (errorKey === 'size') {
      setAttachError((currentLocale.imageTooLarge || '').replace('{size}', formatMaxImageSize()));
    } else if (errorKey === 'load') {
      setAttachError(currentLocale.imageLoadError);
    } else if (errorKey === 'tooMany') {
      setAttachError((currentLocale.tooManyImages || '').replace('{count}', String(MAX_IMAGES_PER_MESSAGE)));
    } else {
      setAttachError('');
    }
  };

  const handleSend = () => {
    if (isLoading || isRecording) {
      return;
    }
    const hasText = !!inputValue.trim();
    const hasImages = attachedImages.length > 0;
    if (!hasText && !hasImages) {
      return;
    }
    sendMessageStream(hasImages ? { text: inputValue, images: attachedImages } : inputValue);
    setInputValue('');
    setAttachedImages([]);
    setAttachError('');
  };

  const handleCancel = () => {
    const restored = stop();
    if (typeof restored === 'string') {
      setInputValue(restored);
      setAttachedImages([]);
    } else if (restored && typeof restored === 'object') {
      setInputValue(restored.text || '');
      setAttachedImages(Array.isArray(restored.images) ? restored.images : []);
    } else {
      setInputValue('');
      setAttachedImages([]);
    }
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const len = inputRef.current.value.length;
        try {
          inputRef.current.setSelectionRange(len, len);
        } catch (_) { /* ignore */ }
      }
    }, 0);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files = [];
    for (const item of items) {
      if (item.kind === 'file' && item.type && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length) {
      e.preventDefault();
      addImageFiles(files);
    }
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    if (e.dataTransfer?.types && Array.from(e.dataTransfer.types).includes('Files')) {
      setIsDraggingFiles(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDraggingFiles(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);
    if (isLoading || isRecording) return;
    addImageFiles(e.dataTransfer?.files);
  };

  const handleAttachClick = () => {
    if (isLoading || isRecording) return;
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e) => {
    addImageFiles(e.target.files);
    e.target.value = '';
  };

  const removeAttachedImage = (id) => {
    setAttachedImages((prev) => prev.filter((img) => img.id !== id));
    setAttachError('');
  };

  const canSend = (!!inputValue.trim() || attachedImages.length > 0) && !isRecording;

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
          const cleaned = cleanAssistantContent(getMessageText(messages[i].content));
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
        const cleaned = cleanAssistantContent(getMessageText(messages[i].content));
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
      const cleanedContent = cleanAssistantContent(getMessageText(message.content));
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
      attachedImages,
      setAttachedImages,
      messages,
      isLoading,
      error,
      sendMessage,
      clearChat,
      handleSend,
      handleCancel,
      stop,
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

    return cloneElement(customComponent, customProps);
  }

  // Ensure CSS Modules processes all classes used in markdown
  const _ = styles['inline-code'] || styles['code-block'] || styles['code-block-header'] || styles['code-block-body'] || styles['md-table'] || styles['table-container'] || styles['table-scroll'] || styles['table-export-bar'] || styles['table-export-btn'] || styles['checkbox-item'] || styles['checkbox-input'] || styles['checkbox-text'] || styles['math-inline'] || styles['math-display'] || styles['image-thumb'] || styles['image-thumbs'] || styles['image-thumb-btn'] || styles['md-image-thumb'] || styles['md-image-link'] || styles['image-lightbox'] || styles['image-lightbox-close'] || styles['attach-previews'] || styles['attach-preview'] || styles['attach-remove'] || styles['attach-button'] || styles['attach-input'] || styles['attach-error'] || styles['chat-composer-row'] || styles['chat-input-area-drop'] || styles['composer-action'];

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
            <MarkdownBody
              html={renderMarkdown(
                notificationMessage.length > 150
                  ? notificationMessage.substring(0, 150) + '...'
                  : notificationMessage,
                styles,
                currentLocale
              )}
              mathJaxUrl={mathJaxUrl}
            />
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
                  <MarkdownBody html={greetingHtml} mathJaxUrl={mathJaxUrl} closeImageLabel={currentLocale.closeImage} />
                </div>
              )}

              {messages.map((msg, index) => (
                <ChatMessage
                  key={`${index}-${msg.role}-${msg.tool_call_id || ''}`}
                  msg={msg}
                  styles={styles}
                  currentLocale={currentLocale}
                  assistantName={assistantName}
                  mergedTheme={mergedTheme}
                  mathJaxUrl={mathJaxUrl}
                />
              ))}
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
                      <MarkdownBody html={streamingHtml} mathJaxUrl={mathJaxUrl} debounceMs={200} closeImageLabel={currentLocale.closeImage} />
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
              className={`${styles['chat-input-area']}${isDraggingFiles ? ` ${styles['chat-input-area-drop']}` : ''}`}
              style={{
                background: mergedTheme.inputAreaBackground,
                borderTop: `1px solid ${mergedTheme.inputAreaBorderTop}`
              }}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              {attachedImages.length > 0 && (
                <div className={styles['attach-previews']}>
                  {attachedImages.map((image) => (
                    <div key={image.id} className={styles['attach-preview']}>
                      <img src={image.dataUrl} alt={image.name || ''} />
                      <button
                        type="button"
                        className={styles['attach-remove']}
                        onClick={() => removeAttachedImage(image.id)}
                        title={currentLocale.removeImage}
                        aria-label={currentLocale.removeImage}
                        disabled={isLoading || isRecording}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className={styles['chat-composer-row']}>
                <input
                  ref={fileInputRef}
                  type="file"
                  className={styles['attach-input']}
                  accept={ACCEPTED_IMAGE_TYPES.join(',')}
                  multiple
                  onChange={handleFileInputChange}
                  tabIndex={-1}
                />
                <button
                  type="button"
                  className={`${styles['composer-action']} ${styles['attach-button']}`}
                  onClick={handleAttachClick}
                  disabled={isLoading || isRecording}
                  title={currentLocale.attachImage}
                  aria-label={currentLocale.attachImage}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyPress}
                  onPaste={handlePaste}
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
                {isLoading ? (
                  <button
                    type="button"
                    className={`${styles['composer-action']} ${styles['cancel-request']}`}
                    onClick={handleCancel}
                    title={currentLocale.cancelRequest}
                    aria-label={currentLocale.cancelRequest}
                    style={{
                      background: mergedTheme.cancelButtonBackground,
                      color: mergedTheme.sendButtonColor
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = mergedTheme.cancelButtonHoverBackground;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = mergedTheme.cancelButtonBackground;
                    }}
                  >
                    ×
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles['composer-action']}
                    onClick={handleSend}
                    disabled={!canSend}
                    title={currentLocale.send}
                    aria-label={currentLocale.send}
                    style={{
                      background: !canSend
                        ? mergedTheme.sendButtonDisabledBackground
                        : mergedTheme.sendButtonBackground,
                      color: mergedTheme.sendButtonColor
                    }}
                  >
                    ➤
                  </button>
                )}
              </div>
              {attachError ? (
                <div className={styles['attach-error']} role="alert">{attachError}</div>
              ) : null}
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