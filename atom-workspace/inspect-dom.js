const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:4200', { waitUntil: 'networkidle' });
  
  const result = await page.evaluate(() => {
    const el = document.querySelector('app-node-editor');
    if (!el) return { error: 'app-node-editor not found' };

    const nodes = Array.from(el.querySelectorAll('.glass-panel')).map(n => {
      const computed = window.getComputedStyle(n);
      return {
        text: n.innerText.replace(/\s+/g, ' ').trim().slice(0, 30),
        rect: n.getBoundingClientRect(),
        computed: {
          display: computed.display,
          visibility: computed.visibility,
          opacity: computed.opacity,
          zIndex: computed.zIndex,
          color: computed.color,
          backgroundColor: computed.backgroundColor
        }
      };
    });

    const svgs = Array.from(el.querySelectorAll('path')).map(p => ({
      d: p.getAttribute('d'),
      rect: p.getBoundingClientRect(),
      style: p.style.cssText
    }));

    const editorRect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);

    return {
      editor: { rect: editorRect, display: style.display, width: style.width, height: style.height, position: style.position, opacity: style.opacity },
      hasNodes: nodes.length > 0,
      nodes,
      svgs
    };
  });

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
