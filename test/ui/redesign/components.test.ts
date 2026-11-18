// @ts-ignore Node builtins are available in the supported Node 24 runtime.
import { after, before, test } from 'node:test';
// @ts-ignore
import assert from 'node:assert/strict';
// @ts-ignore
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
// @ts-ignore
import { stripTypeScriptTypes } from 'node:module';
// @ts-ignore Existing read-only CDP harness: real Chromium, no package install.
import { launchBrowser, startServer, PROJECT_ROOT } from '../../claude-check/harness.mjs';

let browser: any, server: any;
before(async () => {
  const overrides: Record<string, string> = {
    'index.html': '<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Kiểm tra thành phần UI</title><link rel="stylesheet" href="src/ui/components.css"><script type="module" src="test/ui/redesign/fixture.js"></script><body></body></html>',
  };
  for (const file of ['src/ui/components', 'src/ui/icons', 'test/ui/redesign/fixture']) {
    overrides[file + '.js'] = stripTypeScriptTypes(readFileSync(`${PROJECT_ROOT}/${file}.ts`, 'utf8'))
      .replace(/(from\s+['"][^'"]+)\.ts(['"])/g, '$1.js$2');
  }
  for (const font of ['latin', 'latin-ext', 'vietnamese', 'math', 'symbols']) {
    const rel = `public/fonts/google-sans-flex-${font}.woff2`;
    overrides[`src/${rel}`] = readFileSync(`${PROJECT_ROOT}/${rel}`) as any;
  }
  server = await startServer(PROJECT_ROOT, { overrides }); browser = await launchBrowser();
});
after(async () => { await server?.close(); await browser?.close(); });
async function page(width = 375, scheme = 'light') {
  const ctx = await browser.newContext(), p = await ctx.newPage();
  await p.setViewport(width, 900, width === 375);
  await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] });
  await p.goto(server.url + 'index.html');
  await p.waitFor(() => Boolean((window as any).fixture), 'components mounted');
  return { ctx, p };
}
for (const width of [375, 768, 1440]) for (const scheme of ['light', 'dark']) {
  test(`components: ${width}px ${scheme}: font, targets, cards, table, states, token colors`, async () => {
    const { ctx, p } = await page(width, scheme);
    try {
      const measured = await p.eval(() => {
        const visible = (node: Element) => node.getClientRects().length > 0;
        const sizes = new Set<string>(), fonts = new Set<string>(), small: string[] = [];
        for (const node of document.querySelectorAll('body *')) {
          if (!visible(node) || node.closest('svg')) continue;
          if ([...node.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim())) {
            const style = getComputedStyle(node); sizes.add(style.fontSize); fonts.add(style.fontFamily);
          }
        }
        for (const node of document.querySelectorAll('button,a,input,select,textarea')) {
          if (!visible(node)) continue;
          const r = node.getBoundingClientRect(); if (r.width < 44 || r.height < 44) small.push(node.id || node.tagName);
        }
        const cards = [...document.querySelectorAll('.exam-card')];
        return { sizes: [...sizes], fonts: [...fonts], small, overflow: document.documentElement.scrollWidth - innerWidth,
          cols: new Set(cards.slice(0, 3).map((c) => c.getBoundingClientRect().left)).size,
          bg: getComputedStyle(document.body).backgroundColor,
          description: cards[0]?.textContent, statuses: [...document.querySelectorAll('.exam-status')].map((n) => n.textContent),
          table: getComputedStyle(document.querySelector('tbody tr')!).display,
          injection: document.querySelectorAll('img').length,
          selected: document.querySelector('#nav [aria-current=page]')?.getAttribute('data-nav'),
          labels: [...document.querySelectorAll('.ui-control')].every((c) => document.querySelector(`label[for="${c.id}"]`)),
          topActionFits: (() => { const label = document.querySelector('.ui-topbar .ui-button-label')!; return label.scrollWidth <= label.clientWidth; })(),
        };
      });
      assert.deepEqual(measured.small, []); assert.ok(measured.overflow <= 1, JSON.stringify(measured));
      assert.equal(measured.fonts.length, 1);
      assert.ok(measured.sizes.every((s: string) => ['12px','14px','16px','20px','24px','32px'].includes(s)));
      assert.equal(measured.cols, width < 640 ? 1 : width < 1024 ? 2 : 3);
      assert.equal(measured.bg, scheme === 'light' ? 'rgb(246, 247, 251)' : 'rgb(15, 20, 28)');
      assert.match(measured.description, /Đề luyện tập 28 câu/); assert.match(measured.description, /28 câu · 50 phút/);
      assert.ok(!/cấu trúc tốt nghiệp THPT/.test(measured.description));
      assert.ok(measured.topActionFits, 'The ordinary top bar action must remain fully readable');
      assert.deepEqual(measured.statuses, ['Chưa làm', 'Đang làm dở', 'Đã nộp · 7,25 điểm', 'Hết hạn', 'Chưa mở']);
      assert.equal(measured.table, width < 640 ? 'block' : 'table-row');
      assert.equal(measured.injection, 0); assert.equal(measured.selected, 'lop'); assert.ok(measured.labels);
      mkdirSync(`${PROJECT_ROOT}/test/ui/redesign/artifacts`, { recursive: true });
      const screenshot = await p.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
      // @ts-ignore Node runtime Buffer.
      writeFileSync(`${PROJECT_ROOT}/test/ui/redesign/artifacts/${width}-${scheme}.png`, Buffer.from(screenshot.data, 'base64'));
    } finally { await ctx.close(); }
  });
}
test('Dialog: Tab/Shift+Tab trap, Escape, return focus, native modal and responsive sheet', async () => {
  for (const width of [375, 768, 1440]) {
    const { ctx, p } = await page(width);
    try {
      await p.click('#opener');
      assert.equal(await p.eval(() => document.activeElement?.id), 'inside');
      assert.ok(await p.eval(() => document.querySelector('#dialog')?.matches(':modal')));
      await p.eval(() => (document.getElementById('dialog-save') as HTMLElement).focus()); await p.press('Tab');
      assert.equal(await p.eval(() => document.activeElement?.getAttribute('aria-label')), 'Đóng');
      await p.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 });
      await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, modifiers: 8 });
      assert.equal(await p.eval(() => document.activeElement?.id), 'dialog-save');
      const rect = await p.eval(() => { const r = document.getElementById('dialog')!.getBoundingClientRect(); return { x: r.x, width: r.width, bottom: r.bottom }; });
      if (width < 640) { assert.equal(rect.x, 0); assert.equal(rect.width, width); assert.equal(rect.bottom, 900); }
      else assert.equal(rect.width, 560);
      await p.press('Escape');
      assert.equal(await p.eval(() => document.activeElement?.id), 'opener');
      assert.equal(await p.eval(() => (document.getElementById('dialog') as HTMLDialogElement).open), false);
      await p.press('Tab');
      assert.ok(await p.eval(() => { const s = getComputedStyle(document.activeElement!); return s.outlineStyle === 'solid' && s.outlineWidth === '2px'; }));
      await p.eval(() => { (window as any).fixture.dialog.destroy(); });
      assert.equal(await p.eval(() => Boolean(document.getElementById('dialog'))), false);
    } finally { await ctx.close(); }
  }
});
test('Button loading holds width, blocks clicks, restores caller disabled state; fields preserve raw Unicode', async () => {
  const { ctx, p } = await page();
  try {
    const result = await p.eval(() => {
      const { loading, input, textarea, select } = (window as any).fixture;
      const before = loading.getBoundingClientRect().width; loading.setLoading(true);
      const after = loading.getBoundingClientRect().width;
      const disabled = loading.disabled && loading.getAttribute('aria-disabled') === 'true' && loading.getAttribute('aria-busy') === 'true';
      loading.setDisabled(true); loading.setLoading(false); const retained = loading.disabled; loading.setDisabled(false);
      input.control.value = '  Nguyễn Thị Ánh — 1,50  '; textarea.control.value = '<script>alert(1)</script>';
      const error = input.control.getAttribute('aria-describedby'); input.setError('');
      return { before, after, disabled, retained, restored: !loading.disabled,
        error, described: input.control.getAttribute('aria-describedby'), invalid: input.control.getAttribute('aria-invalid'),
        value: input.control.value, raw: textarea.control.value, select: select.control.value };
    });
    assert.equal(result.before, result.after); assert.ok(result.disabled && result.retained && result.restored);
    assert.match(result.error, /name-hint name-error/); assert.equal(result.described, 'name-hint'); assert.equal(result.invalid, 'false');
    assert.equal(result.value, '  Nguyễn Thị Ánh — 1,50  '); assert.equal(result.raw, '<script>alert(1)</script>'); assert.equal(result.select, 'ly');
  } finally { await ctx.close(); }
});
test('Toast auto-dismisses at 4000ms, destroy cancels; reduced-motion disables spinner; unsafe nav rejected', async () => {
  const { ctx, p } = await page();
  try {
    const result = await p.eval(() => {
      const f = (window as any).fixture;
      let delay = 0, callback: (() => void) | undefined, cleared = 0;
      const original = window.setTimeout, originalClear = window.clearTimeout;
      window.setTimeout = ((fn: () => void, ms: number) => { callback = fn; delay = ms; return 123; }) as typeof window.setTimeout;
      window.clearTimeout = (() => { cleared++; }) as typeof window.clearTimeout;
      let role = '', dismissed = false;
      try { const toast = f.Toast('Đã sao chép'); toast.show(); role = toast.element.getAttribute('role'); callback?.(); dismissed = !toast.element.isConnected; toast.destroy(); }
      finally { window.setTimeout = original; window.clearTimeout = originalClear; }
      let rejected = false;
      try { f.NavRail({ active: '', items: [{ key: 'x', label: 'x', icon: 'book', href: 'javascript:alert(1)' }] }); } catch { rejected = true; }
      return { delay, role, dismissed, cleared, rejected };
    });
    assert.equal(result.delay, 4000); assert.equal(result.role, 'status'); assert.ok(result.dismissed && result.cleared > 0 && result.rejected);
    await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    assert.equal(await p.eval(() => { (window as any).fixture.loading.setLoading(true); return getComputedStyle(document.querySelector('#loading .ui-spinner')!).animationName; }), 'none');
    assert.deepEqual(p.errors, []);
  } finally { await ctx.close(); }
});

test('Light/dark text contrast is at least 4.5:1 on surfaces and the primary button', async () => {
  for (const scheme of ['light', 'dark']) {
    const { ctx, p } = await page(768, scheme);
    try {
      const ratios = await p.eval(() => {
        const root = getComputedStyle(document.documentElement);
        const luminance = (token: string) => {
          const hex = root.getPropertyValue(token).trim().slice(1);
          const values = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
            .map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
          return .2126 * values[0]! + .7152 * values[1]! + .0722 * values[2]!;
        };
        const ratio = (fg: string, bg: string) => {
          const a = luminance(fg), b = luminance(bg); return (Math.max(a,b) + .05) / (Math.min(a,b) + .05);
        };
        return [
          ...['--c-text', '--c-text-2', '--c-primary', '--c-success', '--c-warning', '--c-danger'].flatMap((fg) =>
            ['--c-surface', '--c-surface-2'].map((bg) => ({ fg, bg, ratio: ratio(fg, bg) }))),
          { fg: '--c-primary-ink', bg: '--c-primary', ratio: ratio('--c-primary-ink', '--c-primary') },
        ];
      });
      for (const item of ratios) assert.ok(item.ratio >= 4.5, `${scheme}: ${JSON.stringify(item)}`);
    } finally { await ctx.close(); }
  }
});

test('Dialog reopening ignores queued close events; destroy and repeated close notify once', async () => {
  const { ctx, p } = await page();
  try {
    const result = await p.eval(async () => {
      const { Dialog, Button } = (window as any).fixture;
      let closed = 0;
      const trigger = Button({ label: 'Mở' }); document.body.append(trigger); trigger.focus();
      const dialog = Dialog({ title: 'Thông tin', content: 'Nội dung', onClose() { closed++; } });
      dialog.open(trigger); dialog.close(); dialog.open(trigger);
      await new Promise((resolve) => setTimeout(resolve, 50));
      const stillOpen = dialog.element.open && dialog.element.contains(document.activeElement);
      dialog.close(); dialog.close(); dialog.destroy();
      return { stillOpen, closed, focus: document.activeElement === trigger, removed: !dialog.element.isConnected };
    });
    assert.deepEqual(result, { stillOpen: true, closed: 2, focus: true, removed: true });
  } finally { await ctx.close(); }
});

test('Long names, actions and unbroken table values fit the mobile viewport', async () => {
  const { ctx, p } = await page();
  try {
    const result = await p.eval(() => {
      const { TopBar, Table } = (window as any).fixture;
      document.body.replaceChildren(
        TopBar({ role: 'Giáo viên', name: 'Tên rất dài '.repeat(20), action: { label: 'Thoát tài khoản giáo viên đang đăng nhập' } }),
        Table({ caption: 'Kết quả', columns: [{ key: 'name', label: 'Tên học sinh', cell: (name: string) => name }], rows: ['N'.repeat(500)] }),
      );
      const action = document.querySelector('button')!.getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth - innerWidth, actionRight: action.right, actionHeight: action.height };
    });
    assert.ok(result.overflow <= 1, JSON.stringify(result));
    assert.ok(result.actionRight <= 375, JSON.stringify(result));
    assert.ok(result.actionHeight >= 44);
  } finally { await ctx.close(); }
});
