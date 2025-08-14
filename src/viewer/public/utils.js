export function humanBytes(n){ if (n==null) return '–'; const u=['B','KB','MB','GB']; let i=0; let v=n; while (v>=1024 && i<u.length-1){ v/=1024; i++; } return `${v.toFixed(v>=10?0:1)} ${u[i]}`; }
export function extOf(p){ const i=p.lastIndexOf('.'); return i>=0 ? p.slice(i+1).toLowerCase() : ''; }
export async function copyText(s){ await navigator.clipboard.writeText(s); }
export function firstSegment(p){ const ix = p.indexOf('/'); return ix<0? p : p.slice(0,ix); }


