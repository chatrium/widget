const DEFAULT_MATHJAX_URL = 'https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-chtml.js';

let loadPromise = null;
let typesetQueue = Promise.resolve();

const hasMath = (el) => !!(el && el.querySelector && el.querySelector('[data-math], .math-inline, .math-display'));

export const ensureMathJax = (url = DEFAULT_MATHJAX_URL) => {
  if (typeof window === 'undefined') {
    return Promise.resolve(null);
  }
  if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
    return Promise.resolve(window.MathJax);
  }
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    if (!window.MathJax || !window.MathJax.tex) {
      window.MathJax = {
        tex: {
          inlineMath: [['\\(', '\\)']],
          displayMath: [['\\[', '\\]']]
        },
        startup: { typeset: false },
        options: {
          skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']
        }
      };
    }

    const script = document.createElement('script');
    script.src = url || DEFAULT_MATHJAX_URL;
    script.async = true;
    script.onload = () => {
      const ready = window.MathJax && window.MathJax.startup && window.MathJax.startup.promise
        ? window.MathJax.startup.promise
        : Promise.resolve();
      ready.then(() => resolve(window.MathJax)).catch(reject);
    };
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Failed to load MathJax'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
};

export const typesetElement = (el, options = {}) => {
  if (!el || !hasMath(el)) {
    return Promise.resolve();
  }

  typesetQueue = typesetQueue
    .then(async () => {
      const mathJax = await ensureMathJax(options.url);
      if (!mathJax || typeof mathJax.typesetPromise !== 'function') {
        return;
      }
      if (typeof mathJax.typesetClear === 'function') {
        mathJax.typesetClear([el]);
      }
      await mathJax.typesetPromise([el]);
    })
    .catch(() => {});

  return typesetQueue;
};
