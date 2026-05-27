const fs = require('fs'); 
const path = 'c:/Users/arnol/OneDrive/Documents/NewV/ndglc/src/pages/dashboard/invoices/index.astro'; 
let code = fs.readFileSync(path, 'utf8'); 

// 1. Replace the modal HTML
const startHTML = code.indexOf('<!-- Hidden High-Fidelity Printable Receipt'); 
const endHTML = code.indexOf('<!-- Hidden products list JSON payload'); 

if (startHTML > -1 && endHTML > -1) { 
  const modalHTML = `
  <div id="audit-modal" class="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm hidden items-center justify-center p-4">
    <div class="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
      <div class="p-4 bg-slate-50 border-b border-slate-200 flex justify-between">
        <h3 class="font-black text-slate-800 uppercase tracking-wider text-xs">Order Audit Trail</h3>
        <button type="button" onclick="document.getElementById('audit-modal').classList.add('hidden');document.getElementById('audit-modal').classList.remove('flex')" class="text-slate-400 hover:text-slate-800">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>
      <div class="p-6">
        <div class="text-xs font-bold text-slate-500 mb-4" id="audit-num"></div>
        <div class="space-y-4 border-l-2 border-slate-100 pl-4" id="audit-timeline">
        </div>
      </div>
    </div>
  </div>
`;
  code = code.slice(0, startHTML) + modalHTML + code.slice(endHTML); 
} 

// 2. Add showAuditModal function
const scriptTag = code.indexOf('<script>');
if (scriptTag > -1) {
  const auditFn = `
    const showAuditModal = (num, status, date, timeline) => {
      document.getElementById('audit-num').textContent = \`REF: \${num}\`;
      const tContainer = document.getElementById('audit-timeline');
      tContainer.innerHTML = '';
      timeline.forEach((t, i) => {
        const item = document.createElement('div');
        item.className = 'relative';
        item.innerHTML = \`
          <div class="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full \${i === timeline.length - 1 ? 'bg-cyan-500 border-2 border-cyan-100' : 'bg-slate-300'}"></div>
          <p class="font-bold text-slate-800 text-xs">\${t}</p>
        \`;
        tContainer.appendChild(item);
      });
      const modal = document.getElementById('audit-modal');
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    };
  `;
  code = code.slice(0, scriptTag + 8) + auditFn + code.slice(scriptTag + 8);
}

// 3. Remove all old print JS
const startJS = code.indexOf('// Custom signatures memory storage');
const endJS = code.indexOf('// Product Images Live Toggle');
if (startJS > -1 && endJS > -1) {
  // We remove up to the end of that section. Actually, let's just use string replace.
  code = code.slice(0, startJS) + '\n' + code.slice(endJS + 172); // approximate offset to skip the rest of the block
}

// 4. Remove print specific global styles
code = code.replace(/<style is:global>[\s\S]*?<\/style>/m, '<style is:global></style>');

fs.writeFileSync(path, code);
console.log('Done');
