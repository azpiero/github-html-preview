(() => {
  const id = 'gh-static-html-preview';
  let lastURL = '';
  let panel;
  function close() {
    panel?.remove();
    panel = null;
    document.getElementById(id)?.shadowRoot.querySelector('button')?.focus();
  }
  function mount() {
    if (location.href !== lastURL) { close(); lastURL = location.href; }
    const supported = /^\/[^/]+\/[^/]+\/blob\/.+\.html?$/i.test(location.pathname);
    if (!supported) { document.getElementById(id)?.remove(); return; }
    if (document.getElementById(id)) return;
    const host = document.createElement('div');
    host.id = id;
    host.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:2147483646';
    const root = host.attachShadow({mode:'open'});
    // アイコンと同じ記号。GitHub のライト/ダークどちらのテーマでも成立する配色にする。
    root.innerHTML = `<style>button{display:inline-flex;align-items:center;gap:8px;font:600 13px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;letter-spacing:.02em;color:#fff;background:linear-gradient(180deg,#2ea043,#1f8036);border:1px solid rgba(1,4,9,.25);border-radius:999px;padding:11px 18px 11px 15px;cursor:pointer;box-shadow:0 1px 1px rgba(1,4,9,.2),0 10px 28px rgba(1,4,9,.32);transition:background .15s ease,transform .15s ease,box-shadow .15s ease}button:hover{background:linear-gradient(180deg,#3fb950,#2ea043);transform:translateY(-1px);box-shadow:0 1px 1px rgba(1,4,9,.2),0 14px 32px rgba(1,4,9,.38)}button:active{transform:translateY(0);box-shadow:0 1px 1px rgba(1,4,9,.25),0 4px 12px rgba(1,4,9,.3)}button:focus-visible{outline:2px solid #58a6ff;outline-offset:3px}svg{flex:none}@media (prefers-reduced-motion:reduce){button{transition:none}button:hover{transform:none}}</style><button type="button"><svg width="16" height="16" viewBox="0 0 128 128" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"><path d="M46 36 L20 64 L46 92"/><path d="M82 36 L108 64 L82 92"/></g><circle cx="64" cy="64" r="11" fill="currentColor"/></svg><span>HTML Preview</span></button>`;
    root.querySelector('button').onclick = () => {
      if (panel) return;
      // A reloaded or updated extension orphans this script; getURL then yields
      // chrome-extension://invalid/ and the frame would show a bare Chrome error.
      let viewerBase = '';
      try { viewerBase = chrome.runtime?.id ? chrome.runtime.getURL('viewer.html') : ''; } catch {}
      const stale = !viewerBase || viewerBase.startsWith('chrome-extension://invalid/');
      // Prefer GitHub's Raw link: it preserves refs containing slashes.
      const rawLink = [...document.querySelectorAll('a[href]')].find(a =>
        a.textContent.trim() === 'Raw' && /^https:\/\/(github\.com|raw\.githubusercontent\.com)\//.test(a.href));
      const raw = rawLink?.href || location.origin + location.pathname.replace('/blob/', '/raw/');
      panel = document.createElement('div');
      panel.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#fff';
      const shadow = panel.attachShadow({mode:'open'});
      shadow.innerHTML = `<style>:host{color-scheme:light}header{height:52px;box-sizing:border-box;display:flex;align-items:center;gap:18px;padding:0 20px;background:#0d1117;color:#f0f6fc;font:14px system-ui}button{font:inherit;padding:6px 14px;border-radius:6px;border:1px solid #6e7681;background:#21262d;color:#fff;cursor:pointer}span{color:#8b949e}iframe{display:block;border:0;width:100%;height:calc(100vh - 52px);background:#fff}.notice{padding:32px 24px;font:15px/1.9 system-ui;color:#1f2328;max-width:640px;margin:0 auto}.notice h2{font-size:1.1rem;margin:0 0 8px}.notice p{margin:0 0 12px;color:#59636e}kbd{font:inherit;background:#f0f3f6;border:1px solid #d1d9e0;border-bottom-width:2px;border-radius:5px;padding:.1em .45em}</style><header><button type="button">← Code に戻る</button><strong>HTML Preview</strong><span>JavaScript 無効</span></header>`;
      shadow.querySelector('button').onclick = close;
      if (stale) {
        const notice = document.createElement('div');
        notice.className = 'notice';
        notice.innerHTML = '<h2>ページを再読み込みしてください</h2><p>拡張機能が更新または再読み込みされたため、このタブの状態が古くなっています。</p><p><kbd>⌘</kbd> + <kbd>R</kbd> でこのページを再読み込みすると、プレビューを開けるようになります。</p>';
        shadow.append(notice);
      } else {
        const viewerURL = viewerBase + '?raw=' + encodeURIComponent(raw) + '&source=' + encodeURIComponent(location.href);
        const separate = document.createElement('a');
        separate.href = viewerURL;
        separate.target = '_blank';
        separate.rel = 'noopener noreferrer';
        separate.textContent = '別タブで開く ↗';
        separate.style.cssText = 'color:#79c0ff;margin-left:auto;font:14px system-ui';
        shadow.querySelector('header').append(separate);
        const frame = document.createElement('iframe');
        frame.title = 'HTMLのプレビュー';
        frame.src = viewerURL;
        shadow.append(frame);
      }
      document.documentElement.append(panel);
      shadow.querySelector('button').focus();
    };
    document.documentElement.append(host);
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && panel) close(); });
  let queued = false;
  new MutationObserver(() => {
    if (!queued) { queued = true; setTimeout(() => { queued = false; mount(); }, 150); }
  }).observe(document.documentElement, {childList:true, subtree:true});
  document.addEventListener('turbo:load', mount);
  window.addEventListener('popstate', mount);
  mount();
})();
