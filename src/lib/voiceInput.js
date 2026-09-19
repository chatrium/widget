/**
 * Voice Input Module
 * Handles speech recognition functionality with proper state management
 * to prevent duplicate message delivery
 */

/**
 * Creates and configures a speech recognition instance
 * 
 * @param {string} locale - Language locale ('en', 'ru', 'zh')
 * @param {function} onTranscript - Callback when transcript is ready (transcript: string)
 * @param {function} onError - Callback when error occurs (errorCode: string)
 * @param {function} onRecordingChange - Callback when recording state changes (isRecording: boolean)
 * @returns {Object} Voice recognition controller with methods: start(), stop(), isSupported()
 */
export const createVoiceRecognition = (locale, onTranscript, onError, onRecordingChange) => {
  // Check browser support
  if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
    onError('not_supported');
    return {
      start: () => {},
      stop: () => {},
      isSupported: () => false,
      cleanup: () => {}
    };
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  
  // Configure recognition
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = locale === 'zh' ? 'zh-CN' :
                    locale === 'ru' ? 'ru-RU' : 'en-US';

  // Internal state
  let buffer = '';
  let finalDelivered = false;
  let isStarting = false;
  let hasStarted = false;
  let hasGotResult = false;
  let hasRetriedStart = false;

  /**
   * Delivers the accumulated transcript to the callback
   * Sets finalDelivered flag to prevent duplicate delivery
   */
  const deliverTranscript = () => {
    const t = (buffer || '').trim();
    if (!t) return; // Guard against empty transcript
    
    onTranscript(t);
    buffer = '';
    finalDelivered = true;
  };

  // Event handlers
  recognition.onstart = () => {
    onError(null); // Clear any previous errors
    isStarting = false;
    hasStarted = true;
    onRecordingChange(true);
  };

  recognition.onresult = (event) => {
    hasGotResult = true;
    
    // Build transcript from all results (they are cumulative)
    // Don't accumulate into buffer, rebuild it each time
    buffer = '';
    for (let i = 0; i < event.results.length; i++) {
      const res = event.results[i];
      if (res[0] && res[0].transcript) {
        buffer += res[0].transcript;
      }
    }
    
    // Check if the last result is final
    const lastResult = event.results[event.results.length - 1];
    if (lastResult && lastResult.isFinal) {
      deliverTranscript();
    }
  };

  recognition.onend = () => {
    // Deliver transcript only if no final result was already delivered
    // This prevents duplicate messages
    if (!finalDelivered && buffer.trim()) {
      deliverTranscript();
    }
    
    // Chrome sometimes ends immediately before actually starting - retry once
    if (!hasStarted && !hasGotResult && !hasRetriedStart) {
      hasRetriedStart = true;
      try {
        recognition.start();
        isStarting = true;
        return;
      } catch (e) {
        // Fall through to reset state
      }
    }
    
    // Reset state
    onRecordingChange(false);
    isStarting = false;
    buffer = '';
    finalDelivered = false;
  };

  recognition.onerror = (event) => {
    // Suppress noisy 'aborted' errors from rapid toggling
    if (event && event.error === 'aborted') {
      onRecordingChange(false);
      return;
    }
    
    onError(event?.error || 'unknown');
    onRecordingChange(false);
  };

  recognition.onnomatch = () => {
    onError('no-speech');
  };

  recognition.onspeechend = () => {
    try { 
      recognition.stop(); 
    } catch (e) {
      // Ignore errors during stop
    }
  };

  recognition.onaudioend = () => {
    // no-op, onend will handle delivery/state
  };

  // Public API
  return {
    /**
     * Starts speech recognition
     * @throws {Error} If recognition fails to start
     */
    start: () => {
      // Guard against overlapping starts
      if (isStarting) return;
      
      isStarting = true;
      hasStarted = false;
      hasGotResult = false;
      hasRetriedStart = false;
      buffer = '';
      finalDelivered = false;
      onError(null);
      
      try {
        recognition.start();
      } catch (err) {
        isStarting = false;
        const code = (err && err.name) || 'start_failed';
        onError(code);
        throw err;
      }
    },

    /**
     * Stops speech recognition
     */
    stop: () => {
      try {
        recognition.stop();
        onRecordingChange(false);
      } catch (e) {
        // Ignore errors during stop
      }
    },

    /**
     * Checks if speech recognition is supported
     * @returns {boolean}
     */
    isSupported: () => {
      return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
    },

    /**
     * Cleanup resources
     */
    cleanup: () => {
      recognition.onstart = null;
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onnomatch = null;
      recognition.onspeechend = null;
      recognition.onaudioend = null;
      try {
        recognition.stop();
      } catch (e) {
        // Ignore errors during cleanup
      }
    }
  };
};

/**
 * Get localized error message for voice recognition error codes
 * 
 * @param {string} error - Error code
 * @param {object} localeMessages - Locale-specific error messages
 * @returns {string} Localized error message
 */
export const getVoiceErrorMessage = (error, localeMessages) => {
  switch (error) {
    case 'no-speech':
      return localeMessages.noSpeech;
    case 'audio-capture':
      return localeMessages.audioCapture;
    case 'not-allowed':
      return localeMessages.notAllowed;
    case 'not-supported':
      return localeMessages.notSupported;
    case 'network':
      return localeMessages.network;
    default:
      return localeMessages.unknown;
  }
};

