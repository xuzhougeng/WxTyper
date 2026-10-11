// Only this document's bridge can answer native requests. No file or network APIs are exposed.
let mermaidLoading, mermaidWork = Promise.resolve(), version = 0, resourceTimer;
let mermaidPending = false, mermaidError = '';
const watchedImages = new WeakSet();
const originalMarkup = new WeakMap();
const post = value => window.chrome.webview.postMessage(value);

function reportResources() {
  const images = [...document.querySelectorAll('.wechat-content img')];
  const pendingImages = images.filter(img => !img.complete).length;
  const failedImages = images.filter(img => img.complete && img.naturalWidth === 0).length;
  post({ type: 'resources', version, pendingImages, totalImages: images.length, failedImages, mermaidPending, error: mermaidError });
}
function watchImages() {
  for (const img of document.querySelectorAll('.wechat-content img')) {
    if (watchedImages.has(img)) continue;
    watchedImages.add(img);
    img.decoding = 'async';
    const completed = () => {
      img.classList.toggle('wx-image-loading', !img.complete);
      img.classList.toggle('wx-image-error', img.complete && img.naturalWidth === 0);
      clearTimeout(resourceTimer); resourceTimer = setTimeout(reportResources, 40);
    };
    img.addEventListener('load', completed); img.addEventListener('error', completed); completed();
  }
}
async function loadMermaid() {
  mermaidLoading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/mermaid@10.9.3/dist/mermaid.min.js';
    const timeout = setTimeout(() => { script.remove(); mermaidLoading = undefined; reject(new Error('Mermaid 加载超时，请检查 jsDelivr 网络连接。')); }, 20000);
    script.onload = () => {
      clearTimeout(timeout);
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default', flowchart: { htmlLabels: false } });
      resolve();
    };
    script.onerror = () => { clearTimeout(timeout); script.remove(); mermaidLoading = undefined; reject(new Error('Mermaid 加载失败，请检查 jsDelivr 网络连接。')); };
    document.head.appendChild(script);
  });
  await mermaidLoading;
}
function startResources() {
  watchImages();
  const current = version;
  const nodes = [...document.querySelectorAll('.mermaid')].filter(node => !node.querySelector('svg'));
  for (const node of nodes) node.dataset.wxSource ??= node.textContent;
  mermaidPending = nodes.length > 0; mermaidError = '';
  reportResources();
  if (nodes.length === 0) { window.__wxtyperMermaidReady = Promise.resolve(); return; }
  window.__wxtyperMermaidReady = mermaidWork = mermaidWork.catch(() => {}).then(async () => {
    if (nodes.length === 0 || current !== version) return;
    await loadMermaid();
    if (current !== version) return;
    await mermaid.run({ nodes });
  });
  mermaidWork.then(() => {
    if (current === version) { mermaidPending = false; reportResources(); }
  }, error => {
    if (current === version) { mermaidPending = false; mermaidError = error.message || 'Mermaid 渲染失败。'; reportResources(); }
  });
}

function sameMarkup(old, next) {
  return old.nodeType === next.nodeType && (originalMarkup.get(old) === next.outerHTML || old.isEqualNode(next));
}
function rememberMarkup(node) {
  if (node.nodeType === Node.ELEMENT_NODE) {
    originalMarkup.set(node, node.outerHTML);
    for (const child of node.children) rememberMarkup(child);
  }
}
function reconcile(parent, nextParent) {
  const desired = [...nextParent.childNodes];
  for (let i = 0; i < desired.length; i++) {
    const next = desired[i];
    let old = parent.childNodes[i];
    if (old && sameMarkup(old, next)) continue;
    // Keep unchanged blocks (including image nodes) when an earlier paragraph is inserted.
    const match = [...parent.childNodes].slice(i + 1).find(node => sameMarkup(node, next));
    if (match) { parent.insertBefore(match, old || null); continue; }
    if (old && desired.slice(i + 1).some(node => sameMarkup(old, node))) {
      rememberMarkup(next); parent.insertBefore(next, old); continue;
    }
    if (old && old.nodeType === Node.ELEMENT_NODE && next.nodeType === Node.ELEMENT_NODE && old.tagName === next.tagName && !old.classList.contains('mermaid')) {
      // Preserve decoded images with the same URL, even when nearby text changes.
      if (old.tagName === 'IMG' && old.getAttribute('src') === next.getAttribute('src')) {
        old.alt = next.alt; originalMarkup.set(old, next.outerHTML); continue;
      }
      for (const attr of [...old.attributes]) if (!next.hasAttribute(attr.name)) old.removeAttribute(attr.name);
      for (const attr of next.attributes) if (old.getAttribute(attr.name) !== attr.value) old.setAttribute(attr.name, attr.value);
      reconcile(old, next); originalMarkup.set(old, next.outerHTML);
    } else {
      rememberMarkup(next);
      if (old) parent.replaceChild(next, old); else parent.appendChild(next);
    }
  }
  while (parent.childNodes.length > desired.length) parent.lastChild.remove();
}
window.wxtyperUpdate = function ({ body, css, baseHref, resetScroll, version: nextVersion }) {
  version = nextVersion;
  const root = document.querySelector('.wechat-content');
  if (baseHref) document.querySelector('base').href = baseHref;
  const style = document.getElementById('theme-style');
  if (style.textContent !== css) style.textContent = css;
  const fragment = document.createElement('template'); fragment.innerHTML = body;
  const y = resetScroll ? 0 : window.scrollY;
  if (resetScroll) { root.replaceChildren(fragment.content); for (const node of root.children) rememberMarkup(node); }
  else reconcile(root, fragment.content);
  window.scrollTo(0, y);
  startResources();
  return true; // Text is ready immediately; images and diagrams report progress separately.
};
for (const node of document.querySelector('.wechat-content').children) rememberMarkup(node);
startResources();

window.wxtyperExportMermaid = async function () {
  await window.__wxtyperMermaidReady;
  const svgs = Array.from(document.querySelectorAll('.mermaid svg'));
  return Promise.all(svgs.map(svg => new Promise((resolve, reject) => {
    const clone = svg.cloneNode(true);
    // Inline computed SVG styles before drawing the standalone SVG onto canvas.
    const copied = [clone, ...clone.querySelectorAll('*')];
    [svg, ...svg.querySelectorAll('*')].forEach((node, i) => {
      const target = copied[i];
      const style = getComputedStyle(node);
      target.setAttribute('style', Array.from(style).map(k => `${k}:${style.getPropertyValue(k)}`).join(';'));
    });
    const box = svg.getBoundingClientRect();
    clone.setAttribute('width', Math.max(1, Math.ceil(box.width)));
    clone.setAttribute('height', Math.max(1, Math.ceil(box.height)));
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.ceil(box.width * 2));
        canvas.height = Math.max(1, Math.ceil(box.height * 2));
        const ctx = canvas.getContext('2d');
        ctx.scale(2, 2); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, box.width, box.height);
        ctx.drawImage(image, 0, 0, box.width, box.height);
        resolve(canvas.toDataURL('image/png').split(',')[1]);
      } catch (error) { reject(error); }
    };
    image.onerror = () => reject(new Error('Mermaid 图片转换失败。'));
    image.src = url;
  })));
};

window.wxtyperCopyHTML = async function () {
  await window.__wxtyperMermaidReady;
  if (document.querySelector('.mermaid')) throw new Error('请先导出 Mermaid 为 PNG，再复制到公众号。');
  const source = document.querySelector('.wechat-content');
  const clone = source.cloneNode(true);
  const originals = [source, ...source.querySelectorAll('*')];
  [clone, ...clone.querySelectorAll('*')].forEach((node, i) => {
    const style = getComputedStyle(originals[i]);
    node.setAttribute('style', Array.from(style).map(name => `${name}:${style.getPropertyValue(name)}`).join(';'));
    if (node.tagName === 'IMG') node.src = originals[i].src;
  });
  // Preview viewport dimensions and card chrome must not become article formatting.
  clone.style.minHeight = '0'; clone.style.maxWidth = '100%'; clone.style.padding = '0'; clone.style.margin = '0';
  return clone.outerHTML;
};
window.chrome.webview.addEventListener('message', async event => {
  const { id, action, payload } = event.data;
  if (typeof id !== 'string') return;
  try {
    const value = action === 'update' ? window.wxtyperUpdate(payload)
      : action === 'copy' ? await window.wxtyperCopyHTML()
      : action === 'mermaid' ? await window.wxtyperExportMermaid() : null;
    post({ id, value });
  } catch (error) { post({ id, error: error.message || '预览操作失败。' }); }
});
