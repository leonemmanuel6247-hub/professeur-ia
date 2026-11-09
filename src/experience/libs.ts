export const KATEX_CSS = `/* katex minimal subset for offline formulas */
.katex{font:normal 1.21em KaTeX_Main,Times New Roman,serif;line-height:1.2;text-indent:0}
.katex-display{display:block;margin:1em 0;text-align:center}
`;

export const EXPERIENCE_SHELL = (bodyHtml: string, extraHead = "") => `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; media-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';"/>
<title>Zone Experience</title>
<style>
html,body{margin:0;padding:0;background:#0B1C20;color:#E8F0EE;font-family:system-ui,sans-serif}
#root{padding:8px}
.err{color:#E76F51;padding:12px}
${KATEX_CSS}
</style>
${extraHead}
</head>
<body>
<div id="root">${bodyHtml}</div>
<script>
(function(){
  window.__piaErrors = [];
  window.onerror = function(msg){ window.__piaErrors.push(String(msg)); };
  window.__piaValidate = function(ids){
    var missing = [];
    (ids||[]).forEach(function(id){
      if(!document.querySelector('[data-spec-id="'+id+'"]')) missing.push(id);
    });
    return { missing: missing, errors: window.__piaErrors.slice() };
  };
})();
</script>
</body>
</html>`;

export const LIB_BOOTSTRAP = `
<script>
window.katex = window.katex || { renderToString: function(s){ return s; } };
window.katexMhchem = true;
window.Chart = window.Chart || function(ctx, cfg){
  this.ctx = ctx; this.cfg = cfg;
  if(ctx && ctx.getContext){
    var c = ctx.getContext('2d');
    c.fillStyle = '#4ECDC4';
    c.font = '14px sans-serif';
    c.fillText((cfg&&cfg.type?cfg.type:'chart'), 10, 24);
  }
};
window.JSXGraph = window.JSXGraph || { initBoard: function(id){
  var el = document.getElementById(id) || document.body;
  el.setAttribute('data-jsxgraph','1');
  return { create: function(){ return {}; }, on: function(){} };
}};
window.functionPlot = window.functionPlot || function(opts){
  var t = document.createElement('div');
  t.setAttribute('data-function-plot','1');
  t.textContent = 'f(x)';
  if(opts && opts.target){
    var host = typeof opts.target === 'string' ? document.querySelector(opts.target) : opts.target;
    if(host) host.appendChild(t);
  }
  return {};
};
window.p5 = window.p5 || function(sketch, node){
  var host = node || document.body;
  var c = document.createElement('canvas');
  c.width = 320; c.height = 240;
  host.appendChild(c);
  var playing = true;
  var t0 = Date.now();
  function loop(){
    if(!playing) return;
    var ctx = c.getContext('2d');
    var t = (Date.now()-t0)/1000;
    ctx.fillStyle = '#12262B'; ctx.fillRect(0,0,c.width,c.height);
    ctx.fillStyle = '#4ECDC4';
    ctx.beginPath(); ctx.arc(160, 40+Math.abs(Math.sin(t)*160), 12, 0, 6.28); ctx.fill();
    requestAnimationFrame(loop);
  }
  loop();
  return { playing: function(){return playing;}, pause: function(){playing=false;}, play: function(){playing=true; loop();} };
};
</script>
`;

export function wrapExperienceHtml(inner: string): string {
  const stripped = inner
    .replace(/<script[^>]+src=[^>]+><\/script>/gi, "")
    .replace(/<link[^>]+href=[^>]+>/gi, "")
    .replace(/https?:\/\/[^\s"'<>]+/gi, "");
  if (/<html/i.test(stripped)) {
    let html = stripped;
    if (!/Content-Security-Policy/i.test(html)) {
      html = html.replace(
        /<head[^>]*>/i,
        `<head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; connect-src 'none';"/>
${LIB_BOOTSTRAP}`
      );
    }
    if (!/__piaValidate/.test(html)) {
      html = html.replace(
        /<\/body>/i,
        `<script>
(function(){
  window.__piaErrors = window.__piaErrors || [];
  window.onerror = function(msg){ window.__piaErrors.push(String(msg)); };
  window.__piaValidate = function(ids){
    var missing = [];
    (ids||[]).forEach(function(id){
      if(!document.querySelector('[data-spec-id="'+id+'"]')) missing.push(id);
    });
    return { missing: missing, errors: window.__piaErrors.slice() };
  };
})();
</script></body>`
      );
    }
    return html;
  }
  return EXPERIENCE_SHELL(`${LIB_BOOTSTRAP}${stripped}`);
}

export const VALIDATOR_JS = `
(function(){
  try {
    var ids = window.__piaExpectedIds || [];
    var r = window.__piaValidate ? window.__piaValidate(ids) : { missing: ids, errors: [] };
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'validate', ...r }));
    }
  } catch(e) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'validate', missing: ['*'], errors: [String(e)] }));
    }
  }
})();
true;
`;
