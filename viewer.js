import { renderDocument } from './render.js';
const status = document.getElementById('status');
const preview = document.getElementById('preview');
const args = new URLSearchParams(location.search);
try {
  const source = new URL(args.get('source'));
  const raw = new URL(args.get('raw'));
  if (source.origin !== 'https://github.com' || !/^\/[^/]+\/[^/]+\/blob\//.test(source.pathname)) throw Error('GitHubのHTMLファイルから開いてください。');
  const repo = source.pathname.split('/').slice(1,3).join('/');
  if (raw.protocol !== 'https:' || !['github.com','raw.githubusercontent.com'].includes(raw.hostname) || !raw.pathname.startsWith('/'+repo+'/') || (raw.hostname === 'github.com' && !raw.pathname.startsWith('/'+repo+'/raw/'))) throw Error('Raw URLを確認できませんでした。');
  const {html, warnings} = await renderDocument(raw.href, source.href);
  preview.srcdoc = html;
  preview.hidden = false;
  if (warnings.length) status.textContent = '一部の装飾・画像を読み込めませんでした。\n' + warnings.join('\n');
  else status.hidden = true;
} catch (error) {
  status.className = 'error';
  status.textContent = 'プレビューを表示できませんでした。\n' + error.message + '\n非公開リポジトリでは、このChromeでGitHubにログインし、元のファイルの「Raw」が開けることを確認してください。';
}
