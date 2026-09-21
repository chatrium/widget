/**
 * Image attachments for the chat widget: validation, compression, and
 * OpenAI-compatible vision content parts.
 */

export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_IMAGES_PER_MESSAGE = 6;
export const MAX_IMAGE_DIMENSION = 1280;
export const JPEG_QUALITY = 0.82;
export const IMAGE_TOKEN_ESTIMATE = 765;
const MAX_STORED_DATA_URL = 400000;

export const formatMaxImageSize = () => `${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB`;

export const isAcceptedImageType = (type) => {
  if (!type) return false;
  const normalized = type === 'image/jpg' ? 'image/jpeg' : type;
  return ACCEPTED_IMAGE_TYPES.includes(normalized);
};

export const isSafeImageUrl = (url) => {
  if (typeof url !== 'string' || !url.trim()) return false;
  const trimmed = url.trim();
  if (trimmed.startsWith('data:image/')) {
    return /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(trimmed);
  }
  if (trimmed.startsWith('blob:')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:';
  } catch (_) {
    return false;
  }
};

export const getMessageText = (content) => {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((part) => part && part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n');
};

export const getMessageImages = (content) => {
  if (!Array.isArray(content)) return [];
  const images = [];
  for (const part of content) {
    if (!part || part.type !== 'image_url') continue;
    const url = typeof part.image_url === 'string'
      ? part.image_url
      : part.image_url?.url;
    if (!isSafeImageUrl(url)) continue;
    images.push({
      url,
      alt: typeof part.image_url === 'object' ? (part.image_url.alt || '') : ''
    });
  }
  return images;
};

export const messageHasContent = (content) => {
  if (typeof content === 'string') return !!content;
  if (Array.isArray(content)) {
    return content.some((part) => {
      if (!part) return false;
      if (part.type === 'text' && typeof part.text === 'string' && part.text.trim()) return true;
      if (part.type === 'image_url') {
        const url = typeof part.image_url === 'string' ? part.image_url : part.image_url?.url;
        return !!url;
      }
      return false;
    });
  }
  return false;
};

const toImagePart = (image) => {
  const url = typeof image === 'string'
    ? image
    : (image?.dataUrl || image?.url || '');
  if (!isSafeImageUrl(url)) return null;
  return { type: 'image_url', image_url: { url } };
};

export const buildUserMessageContent = (text, images = []) => {
  const parts = [];
  const trimmed = typeof text === 'string' ? text.trim() : '';
  if (trimmed) {
    parts.push({ type: 'text', text: typeof text === 'string' ? text : trimmed });
  }
  for (const image of images) {
    const part = toImagePart(image);
    if (part) parts.push(part);
  }
  if (parts.length === 0) return '';
  if (parts.length === 1 && parts[0].type === 'text') return parts[0].text;
  return parts;
};

export const normalizeUserPayload = (userMessage) => {
  if (typeof userMessage === 'string') {
    return { text: userMessage, images: [] };
  }
  if (userMessage && typeof userMessage === 'object') {
    const text = typeof userMessage.text === 'string'
      ? userMessage.text
      : (typeof userMessage.content === 'string' ? userMessage.content : '');
    const images = Array.isArray(userMessage.images) ? userMessage.images : [];
    return { text, images };
  }
  return { text: '', images: [] };
};

export const countContentTokens = (content, encodeText) => {
  if (!content) return 0;
  if (typeof content === 'string') return encodeText(content);
  if (!Array.isArray(content)) return 0;
  let tokens = 0;
  for (const part of content) {
    if (!part) continue;
    if (part.type === 'text' && part.text) {
      tokens += encodeText(part.text);
    } else if (part.type === 'image_url') {
      tokens += IMAGE_TOKEN_ESTIMATE;
    }
  }
  return tokens;
};

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
  reader.readAsDataURL(file);
});

const loadHtmlImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('Failed to decode image'));
  img.src = src;
});

const canvasToDataUrl = (canvas, mime, quality) => {
  try {
    return mime === 'image/jpeg' || mime === 'image/webp'
      ? canvas.toDataURL(mime, quality)
      : canvas.toDataURL(mime);
  } catch (_) {
    return canvas.toDataURL('image/jpeg', quality);
  }
};

const compressDataUrl = async (dataUrl, originalType) => {
  const img = await loadHtmlImage(dataUrl);
  const maxSide = Math.max(img.width || 1, img.height || 1);
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / maxSide);
  const width = Math.max(1, Math.round((img.width || 1) * scale));
  const height = Math.max(1, Math.round((img.height || 1) * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;

  const outType = originalType === 'image/png' && scale === 1
    ? 'image/png'
    : (originalType === 'image/webp' ? 'image/webp' : 'image/jpeg');

  if (outType !== 'image/png') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(img, 0, 0, width, height);

  let quality = JPEG_QUALITY;
  let out = canvasToDataUrl(canvas, outType, quality);
  while (out.length > MAX_STORED_DATA_URL && quality > 0.45) {
    quality -= 0.12;
    out = canvasToDataUrl(canvas, 'image/jpeg', quality);
  }
  return out;
};

/**
 * Validate and optionally compress an image File.
 * Returns { ok, id, dataUrl, name, type } or { ok:false, error:'type'|'size'|'load' }.
 */
export const processImageFile = async (file) => {
  if (!file || !isAcceptedImageType(file.type)) {
    return { ok: false, error: 'type' };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: 'size' };
  }

  try {
    const originalDataUrl = await readFileAsDataUrl(file);
    if (typeof originalDataUrl !== 'string' || !originalDataUrl.startsWith('data:image/')) {
      return { ok: false, error: 'load' };
    }

    let dataUrl = originalDataUrl;
    const keepAnimatedGif = file.type === 'image/gif' && file.size <= MAX_IMAGE_BYTES;
    if (!keepAnimatedGif && typeof document !== 'undefined') {
      try {
        dataUrl = await compressDataUrl(originalDataUrl, file.type);
      } catch (_) {
        dataUrl = originalDataUrl;
      }
    }

    return {
      ok: true,
      id: `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      dataUrl,
      name: file.name || 'image',
      type: file.type
    };
  } catch (_) {
    return { ok: false, error: 'load' };
  }
};

export const stripOversizedImages = (messages, maxUrlLength = MAX_STORED_DATA_URL) => {
  return (messages || []).map((msg) => {
    if (!Array.isArray(msg?.content)) return msg;
    let stripped = false;
    const next = msg.content.map((part) => {
      if (part?.type !== 'image_url') return part;
      const url = typeof part.image_url === 'string' ? part.image_url : part.image_url?.url;
      if (typeof url === 'string' && url.length > maxUrlLength) {
        stripped = true;
        return null;
      }
      return part;
    }).filter(Boolean);

    if (!stripped) return msg;
    if (next.length === 0) {
      const fallback = getMessageText(msg.content);
      return { ...msg, content: fallback || '' };
    }
    if (next.length === 1 && next[0].type === 'text') {
      return { ...msg, content: next[0].text };
    }
    return { ...msg, content: next };
  });
};

export const stripAllImages = (messages) => {
  return (messages || []).map((msg) => {
    if (!Array.isArray(msg?.content)) return msg;
    const text = getMessageText(msg.content);
    return { ...msg, content: text };
  });
};
