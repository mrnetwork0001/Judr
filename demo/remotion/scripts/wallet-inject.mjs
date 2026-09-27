/**
 * The page side of the film's wallet: a minimal EIP-1193 provider on window.ethereum,
 * exactly what the app looks for. Accounts and chain are answered here; signatures
 * go to scripts/signer.mjs, which holds the key. Returned as a string so Playwright
 * can add it before any app script runs.
 */
export const walletScript = (address, signerUrl, chainHex = '0x2105') => `
(() => {
  const ADDRESS = ${JSON.stringify(address)};
  const SIGNER = ${JSON.stringify(signerUrl)};
  let chainId = ${JSON.stringify(chainHex)};
  const listeners = {};
  const emit = (ev, ...args) => (listeners[ev] || []).forEach((fn) => { try { fn(...args) } catch {} });
  const provider = {
    isMetaMask: true,
    isJudrDemo: true,
    async request({ method, params }) {
      switch (method) {
        case 'eth_requestAccounts':
        case 'eth_accounts': return [ADDRESS];
        case 'eth_chainId': return chainId;
        case 'net_version': return String(parseInt(chainId, 16));
        case 'wallet_switchEthereumChain': chainId = params[0].chainId; emit('chainChanged', chainId); return null;
        case 'wallet_addEthereumChain': return null;
        case 'personal_sign': {
          const [msg] = params;
          const message = typeof msg === 'string' && msg.startsWith('0x') ? new TextDecoder().decode(Uint8Array.from(msg.slice(2).match(/../g).map((h) => parseInt(h, 16)))) : msg;
          // Signing happens in node through a Playwright binding; the key never enters the page.
          if (typeof window.__judrSign === 'function') return window.__judrSign(message);
          const r = await fetch(SIGNER + '/sign', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message }) });
          if (!r.ok) throw new Error('signer ' + r.status);
          return (await r.json()).signature;
        }
        default: throw Object.assign(new Error('unsupported method ' + method), { code: 4200 });
      }
    },
    on(ev, fn) { (listeners[ev] ||= []).push(fn); return provider },
    removeListener(ev, fn) { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); return provider },
  };
  Object.defineProperty(window, 'ethereum', { value: provider, configurable: true, writable: false });
})();
`
