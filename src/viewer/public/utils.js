export function humanBytes(n){ if (n==null) return '–'; const u=['B','KB','MB','GB']; let i=0; let v=n; while (v>=1024 && i<u.length-1){ v/=1024; i++; } return `${v.toFixed(v>=10?0:1)} ${u[i]}`; }
export function extOf(p){ const i=p.lastIndexOf('.'); return i>=0 ? p.slice(i+1).toLowerCase() : ''; }
export async function copyText(s){
  try {
    await navigator.clipboard.writeText(s);
    showToast('Copied to clipboard');
  } catch (e) {
    try {
      // Fallback to execCommand
      const textarea = document.createElement('textarea');
      textarea.value = s;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (success) {
        showToast('Copied to clipboard');
      } else {
        throw new Error('execCommand failed');
      }
    } catch (e2) {
      showToast('Failed to copy - please copy manually', true);
      console.error('Copy failed:', e2);
    }
  }
}

function showToast(message, isError=false) {
  const toast = document.createElement('div');
  toast.className = `toast${isError ? ' error' : ''}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => document.body.removeChild(toast), 300);
  }, 2000);
}
export function firstSegment(p){ const ix = p.indexOf('/'); return ix<0? p : p.slice(0,ix); }


