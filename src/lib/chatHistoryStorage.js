/**
 * Chat History Storage using IndexedDB
 * 
 * This module provides persistent storage for chat conversations with automatic
 * age-based cleanup and context size management.
 */

const DB_NAME = 'chatHistoryDB';
const STORE_NAME = 'conversations';
const DB_VERSION = 1;

let dbInstance = null;
let dbInitPromise = null;

/**
 * Generate a unique storage key based on configuration
 * This ensures different configurations store their history separately
 * Accepts either llmConfigs array (new format) or individual params (for backwards compatibility)
 */
export const generateStorageKey = (llmConfigsOrModelName, baseUrl, apiKey) => {
  let modelName, url, key;
  
  // Check if first parameter is an array (new llmConfigs format)
  if (Array.isArray(llmConfigsOrModelName) && llmConfigsOrModelName.length > 0) {
    const firstConfig = llmConfigsOrModelName[0];
    modelName = firstConfig.modelName;
    url = firstConfig.baseUrl;
    key = firstConfig.apiKey;
  } else {
    // Old format: individual parameters
    modelName = llmConfigsOrModelName;
    url = baseUrl;
    key = apiKey;
  }
  
  // Create a unique key from configuration
  // Use a hash of apiKey if present (for privacy) or just use the config
  const apiKeyHash = key ? hashString(key) : 'no-key';
  const sanitizedUrl = (url || 'default').replace(/[^a-zA-Z0-9]/g, '_');
  const sanitizedModel = (modelName || 'default').replace(/[^a-zA-Z0-9]/g, '_');
  
  return `${sanitizedModel}_${sanitizedUrl}_${apiKeyHash}`;
};

/**
 * Simple string hash function for API key anonymization
 */
const hashString = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
};

/**
 * Initialize IndexedDB database
 * Returns a promise that resolves to the database instance
 */
export const initDB = () => {
  // Return existing promise if initialization is in progress
  if (dbInitPromise) {
    return dbInitPromise;
  }

  // Return cached instance if available
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  // Check if IndexedDB is available
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB not available'));
  }

  dbInitPromise = new Promise((resolve, reject) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        dbInitPromise = null;
        reject(request.error);
      };

      request.onsuccess = () => {
        dbInstance = request.result;
        dbInitPromise = null;
        resolve(dbInstance);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'storageKey' });
        }
      };
    } catch (error) {
      dbInitPromise = null;
      reject(error);
    }
  });

  return dbInitPromise;
};

const hasToolCalls = (msg) => Array.isArray(msg?.tool_calls) && msg.tool_calls.length > 0;

const messageIdentity = (msg) => JSON.stringify({
  role: msg?.role,
  content: msg?.content || '',
  tool_call_id: msg?.tool_call_id || '',
  tool_calls: (msg?.tool_calls || []).map(tc => tc?.id || tc?.function?.name || '')
});

const isPersistableMessage = (msg) => {
  if (!msg || msg.role === 'system') return false;
  if (msg.role === 'assistant') return hasToolCalls(msg) || !!msg.content;
  if (msg.role === 'tool') return !!(msg.content || msg.tool_call_id);
  if (msg.role === 'user') return !!msg.content;
  return false;
};

/**
 * Save messages to IndexedDB with timestamps
 * Keeps assistant tool_calls (even with empty content) and matching tool responses.
 * Preserves original timestamps so historyDepthHours can expire inactive messages.
 */
export const saveMessages = async (storageKey, messages, maxContextSize) => {
  try {
    const db = await initDB();

    let previousItems = [];
    try {
      previousItems = await new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_NAME], 'readonly');
        const req = tx.objectStore(STORE_NAME).get(storageKey);
        req.onsuccess = () => resolve(req.result?.messages || []);
        req.onerror = () => reject(req.error);
      });
    } catch (_) {
      previousItems = [];
    }

    const previousTimestamps = new Map();
    for (const item of previousItems) {
      const key = messageIdentity(item.message);
      if (!previousTimestamps.has(key)) {
        previousTimestamps.set(key, item.timestamp);
      }
    }

    const persistable = (messages || []).filter(isPersistableMessage);
    const keptToolCallIds = new Set();
    for (const msg of persistable) {
      if (hasToolCalls(msg)) {
        for (const tc of msg.tool_calls) {
          if (tc?.id) keptToolCallIds.add(tc.id);
        }
      }
    }

    const paired = persistable.filter(msg => {
      if (msg.role !== 'tool') return true;
      return !msg.tool_call_id || keptToolCallIds.has(msg.tool_call_id);
    });

    const cap = typeof maxContextSize === 'number' && maxContextSize > 0
      ? Math.min(paired.length, Math.max(50, Math.floor(maxContextSize / 20)))
      : paired.length;
    const capped = paired.slice(-cap);

    const messagesToSave = capped.map(msg => ({
      message: msg,
      timestamp: previousTimestamps.get(messageIdentity(msg)) || Date.now()
    }));

    if (messagesToSave.length === 0) {
      return;
    }

    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const data = {
      storageKey,
      messages: messagesToSave,
      lastUpdated: Date.now()
    };

    const request = store.put(data);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (error) {
    // Don't throw - fail gracefully
  }
};

/**
 * Load messages from IndexedDB, filtering by age and context size
 * Returns messages that are within the history depth limit
 */
export const loadMessages = async (storageKey, historyDepthHours, maxContextSize) => {
  try {
    const db = await initDB();
    
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(storageKey);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const data = request.result;
        
        if (!data || !data.messages || data.messages.length === 0) {
          resolve([]);
          return;
        }

        // Filter messages by age
        const now = Date.now();
        const maxAge = historyDepthHours * 60 * 60 * 1000; // Convert hours to milliseconds
        
        const validMessages = data.messages
          .filter(item => {
            const age = now - item.timestamp;
            return age <= maxAge;
          })
          .map(item => item.message);
        
        // Note: Context size filtering will be applied by the caller using filterMessagesByContext
        resolve(validMessages);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (error) {
    return []; // Return empty array on error
  }
};

/**
 * Delete messages older than the specified depth
 * This is called automatically during load, but can also be called manually
 */
export const deleteOldMessages = async (storageKey, historyDepthHours) => {
  try {
    const db = await initDB();
    
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const getRequest = store.get(storageKey);

    return new Promise((resolve, reject) => {
      getRequest.onsuccess = () => {
        const data = getRequest.result;
        
        if (!data || !data.messages) {
          resolve();
          return;
        }

        // Filter out old messages
        const now = Date.now();
        const maxAge = historyDepthHours * 60 * 60 * 1000;
        
        const validMessages = data.messages.filter(item => {
          const age = now - item.timestamp;
          return age <= maxAge;
        });

        if (validMessages.length === 0) {
          // Delete the entire record if no messages remain
          const deleteRequest = store.delete(storageKey);
          deleteRequest.onsuccess = () => {
            resolve();
          };
          deleteRequest.onerror = () => reject(deleteRequest.error);
        } else if (validMessages.length < data.messages.length) {
          // Update with filtered messages
          const updateRequest = store.put({
            storageKey,
            messages: validMessages,
            lastUpdated: Date.now()
          });
          
          updateRequest.onsuccess = () => {
            resolve();
          };
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          resolve();
        }
      };

      getRequest.onerror = () => reject(getRequest.error);
    });
  } catch (error) {
    // Fail gracefully
  }
};

/**
 * Clear all history for a specific configuration
 * Called when user clicks "Clear Chat"
 */
export const clearHistory = async (storageKey) => {
  try {
    const db = await initDB();
    
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(storageKey);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (error) {
    // Don't throw - fail gracefully
  }
};

/**
 * Clear all history from the database (for debugging/maintenance)
 */
export const clearAllHistory = async () => {
  try {
    const db = await initDB();
    
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (error) {
    // Fail gracefully
  }
};

