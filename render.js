const LIMIT = 15 * 1024 * 1024;
const MIME = {png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',avif:'image/avif',svg:'image/svg+xml',ico:'image/x-icon',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf'};

export async function renderDocument(rawURL, sourceURL, fetcher = fetch) {
  const warnings = new Set();
  const cache = new Map();
  const repoPrefix = '/' + new URL(sourceURL).pathname.split('/').slice(1,3).join('/') + '/';
  let total = 0;
  function allowed(url) {
    return url.protocol === 'https:' && ['github.com','raw.githubusercontent.com'].includes(url.hostname) && url.pathname.startsWith(repoPrefix) && (url.hostname !== 'github.com' || url.pathname.startsWith(repoPrefix+'raw/'));
  }
  function load(address) {
    const url = new URL(address);
    url.hash = '';
    if (!allowed(url)) return Promise.reject(Error('同じリポジトリ外のリソースは未対応です: '+url.hostname));
    if (!cache.has(url.href)) cache.set(url.href, (async () => {
      if (cache.size >= 200) throw Error('関連ファイルが200件を超えました。');
      const response = await fetcher(url.href, {credentials:'include',signal:AbortSignal.timeout(20000)});
      if (!response.ok) throw Error('取得失敗（HTTP '+response.status+'）');
      if (response.url && !['github.com','raw.githubusercontent.com'].includes(new URL(response.url).hostname)) throw Error('ログインまたはリダイレクト先を確認してください。');
      if (Number(response.headers.get('content-length')) > LIMIT) throw Error('ファイルが15MBを超えています。');
      const buffer = await response.arrayBuffer();
      total += buffer.byteLength;
      if (buffer.byteLength > LIMIT || total > 50*1024*1024) throw Error('読み込みサイズの上限を超えました。');
      return {buffer, type:response.headers.get('content-type') || ''};
    })());
    return cache.get(url.href);
  }
  function warn(address, error) {
    let label;
    try { label = decodeURIComponent(new URL(address).pathname); } catch { label = address; }
    warnings.add(label + ': ' + error.message);
  }
  async function dataURL(value, base) {
    if (/^data:(image\/|font\/|application\/(font-|vnd\.ms-fontobject))/i.test(value)) return value;
    const address = new URL(value, base).href;
    try {
      const {buffer,type} = await load(address);
      const ext = new URL(address).pathname.split('.').pop().toLowerCase();
      const mime = MIME[ext] || type.split(';')[0] || 'application/octet-stream';
      let binary = '';
      const bytes = new Uint8Array(buffer);
      for (let i=0;i<bytes.length;i+=8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192));
      return 'data:'+mime+';base64,'+btoa(binary) + new URL(address).hash;
    } catch(error) { warn(address,error); return 'data:,'; }
  }
  async function replaceAsync(text, pattern, replacer) {
    const matches = [...text.matchAll(pattern)];
    const replacements = await Promise.all(matches.map(replacer));
    let result = '', last = 0;
    matches.forEach((m,i) => { result += text.slice(last,m.index) + replacements[i]; last = m.index+m[0].length; });
    return result + text.slice(last);
  }
  async function css(text, base, ancestors = []) {
    // Imports are expanded first; each imported sheet uses its own relative base.
    text = text.replace(/\/\*[\s\S]*?\*\//g,'');
    const imports = [];
    text = await replaceAsync(text, /@import\s+(?:url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)|"([^"]*)"|'([^']*)')\s*([^;]*);/gi, async m => {
      const address = new URL(m[1]??m[2]??m[3]??m[4]??m[5],base).href;
      let value = '';
      try {
        if (ancestors.includes(address) || ancestors.length >= 8) throw Error('CSSの循環参照または入れ子が深すぎます。');
        const resource = await load(address);
        value = await css(new TextDecoder().decode(resource.buffer),address,[...ancestors,address]);
        const condition = m[6].trim();
        if (condition && /^(layer|supports)\b/i.test(condition)) throw Error('layer / supports付きのCSS importは未対応です。');
        if (condition) value = '@media '+condition+'{'+value+'}';
      } catch(error) { warn(address,error); }
      imports.push(value);
      return '/*__GH_IMPORT_'+(imports.length-1)+'__*/';
    });
    text = await replaceAsync(text, /url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]*))\s*\)/gi, async m => {
      const value = m[1]??m[2]??m[3];
      if (!value || value.startsWith('#')) return m[0];
      return 'url("'+await dataURL(value,base)+'")';
    });
    return text.replace(/\/\*__GH_IMPORT_(\d+)__\*\//g, (_,n) => imports[Number(n)]);
  }
  const resource = await load(rawURL);
  const markup = new TextDecoder().decode(resource.buffer);
  if (/name=["']octolytics-host["']|<title>Sign in to GitHub/i.test(markup)) throw Error('HTMLファイルの代わりにGitHubの画面が返されました。');
  const doc = new DOMParser().parseFromString(markup,'text/html');
  // Browser sandbox + restrictive CSP are the execution boundary; stripping also
  // removes redirects, embeds, handlers and network hints from the source.
  doc.querySelectorAll('script,iframe,frame,frameset,object,embed,base,meta[http-equiv],link:not([rel~="stylesheet"])').forEach(el=>el.remove());
  for (const el of doc.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name) || ['srcdoc','nonce','integrity','crossorigin','ping','autofocus','srcset','imagesrcset','background','manifest'].includes(attr.name)) el.removeAttribute(attr.name);
    }
  }
  const inlineStyles = [...doc.querySelectorAll('style')];
  await Promise.all([...doc.querySelectorAll('link[rel~="stylesheet"]')].map(async link => {
    const address = new URL(link.getAttribute('href') || '',rawURL).href;
    try {
      const sheet = await load(address);
      const style = doc.createElement('style');
      if (link.media) style.media = link.media;
      style.textContent = await css(new TextDecoder().decode(sheet.buffer),address,[address]);
      link.replaceWith(style);
    } catch(error) { warn(address,error); link.remove(); }
  }));
  // Newly inserted external styles are already processed; don't resolve them twice.
  await Promise.all(inlineStyles.map(async el => { el.textContent = await css(el.textContent,rawURL); }));
  await Promise.all([...doc.querySelectorAll('[style]')].map(async el => el.setAttribute('style',await css(el.getAttribute('style'),rawURL))));
  await Promise.all([...doc.querySelectorAll('img[src],input[type="image"][src],video[poster],svg image')].map(async el => {
    const attr = el.hasAttribute('poster') ? 'poster' : el.hasAttribute('src') ? 'src' : el.hasAttribute('href') ? 'href' : 'xlink:href';
    const value = el.getAttribute(attr);
    if (value) el.setAttribute(attr,await dataURL(value,rawURL));
    el.removeAttribute('loading');
  }));
  doc.querySelectorAll('audio,video,source,track').forEach(el=>el.removeAttribute('src'));
  for (const el of doc.querySelectorAll('a,area')) {
    const href = el.getAttribute('href') || '';
    if (href.startsWith('#')) { el.removeAttribute('target'); continue; }
    let url;
    try {
      // Relative document links lead back to the corresponding GitHub file.
      if (!/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) {
        const resolved = new URL(href,rawURL);
        if (resolved.hostname === 'github.com') resolved.pathname = resolved.pathname.replace('/raw/','/blob/').replace('/blob/refs/heads/','/blob/').replace('/blob/refs/tags/','/blob/');
        else { resolved.hostname = 'github.com'; const parts=resolved.pathname.split('/'); parts.splice(3,0,'blob'); resolved.pathname=parts.join('/'); }
        url=resolved;
      } else url = new URL(href,sourceURL);
      if (!['https:','http:','mailto:'].includes(url.protocol)) throw Error('Unsupported link');
      el.setAttribute('href',url.href);
      el.setAttribute('target','_blank');
      el.setAttribute('rel','noopener noreferrer');
    } catch { el.removeAttribute('href'); }
  }
  doc.querySelectorAll('form').forEach(el=>{el.removeAttribute('action');el.removeAttribute('target');});
  const policy = doc.createElement('meta');
  policy.httpEquiv = 'Content-Security-Policy';
  policy.content = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'";
  doc.head.prepend(policy);
  const fallback = doc.createElement('style');
  fallback.textContent='html{color-scheme:normal}body{overflow-wrap:break-word}img{max-width:100%}';
  doc.head.insertBefore(fallback,policy.nextSibling);
  return {html:'<!doctype html>\n'+doc.documentElement.outerHTML,warnings:[...warnings]};
}
