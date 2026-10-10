/* 本轮草稿独立于听写、语音和词库。原始应用不需要修改。 */
(() => {
  'use strict';
  const WIDTH = 1000;
  const HEIGHT = 700;
  const MAX_PAGES = 30;
  let active = null;

  function createScratchpad(session) {
    const panel = document.createElement('section');
    panel.className = 'scratchpad-panel';
    panel.setAttribute('aria-label', '本轮听写草稿纸');
    panel.innerHTML = `
      <div class="scratchpad-heading">
        <div><h2>本轮草稿</h2><p>听到后，直接在这里写</p></div>
        <button type="button" data-action="fold" aria-expanded="true">收起草稿</button>
      </div>
      <div class="scratchpad-body">
        <div class="scratchpad-transport" role="group" aria-label="草稿区播放控制">
          <span class="scratchpad-progress"></span>
          <button type="button" data-action="playback">开始播放</button>
          <button type="button" data-action="relisten" aria-label="草稿区重听当前词">重听</button>
        </div>
        <div class="scratchpad-toolbar" role="group" aria-label="书写工具">
          <button type="button" data-action="pen" aria-pressed="true">写字</button>
          <button type="button" data-action="eraser" aria-pressed="false">橡皮</button>
          <label class="scratchpad-width">笔粗
            <select aria-label="笔画粗细"><option value="3">细</option><option value="5" selected>中</option><option value="8">粗</option></select>
          </label>
          <button type="button" data-action="undo" disabled>撤销</button>
          <button type="button" data-action="redo" disabled>重做</button>
          <button type="button" data-action="clear" disabled>清空本页</button>
        </div>
        <label class="scratchpad-pen-only"><input type="checkbox">仅手写笔 <span>防止手掌留下笔迹</span></label>
        <div class="scratchpad-paper">
          <canvas role="img" aria-label="草稿书写区域，可用手指、手写笔或鼠标书写"></canvas>
        </div>
        <div class="scratchpad-pages" role="group" aria-label="草稿翻页">
          <button type="button" data-action="previous" aria-label="上一页草稿" disabled>上一页</button>
          <span class="scratchpad-page-number">第 1 / 1 页</span>
          <button type="button" data-action="next" aria-label="下一页草稿" disabled>下一页</button>
          <button type="button" data-action="add">加一页</button>
          <button type="button" data-action="save">保存本页图片</button>
        </div>
        <output class="scratchpad-status" aria-live="polite"></output>
        <p class="scratchpad-note">切词、暂停和核对答案会保留草稿。离开本轮或再练时清空，请先保存图片。草稿不会自动识别或判分。</p>
      </div>`;
    session.classList.add('scratch-enabled');
    session.appendChild(panel);
    const canvas = panel.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const committed = document.createElement('canvas');
    const committedContext = committed.getContext('2d');
    const body = panel.querySelector('.scratchpad-body');
    const status = panel.querySelector('.scratchpad-status');
    const penOnly = panel.querySelector('input');
    const widthSelect = panel.querySelector('select');
    const button = name => panel.querySelector(`[data-action="${name}"]`);
    const pages = [{ strokes: [], redo: [] }];
    let pageIndex = 0;
    let mode = 'pen';
    let currentStroke = null;
    let pointerId = null;
    let pointerKind = null;
    let drawFrame = 0;
    let committedDirty = true;
    let closed = false;
    const disposers = [];
    const page = () => pages[pageIndex];
    const listen = (target, event, callback, options) => {
      target.addEventListener(event, callback, options);
      disposers.push(() => target.removeEventListener(event, callback, options));
    };
    const say = text => { status.textContent = text; };

    function refreshPractice() {
      const controls = session.querySelectorAll('.session-card .session-actions button');
      const progress = session.querySelector('.progress-label > span');
      const label = progress ? progress.textContent.replace(/\s+/g, ' ').trim() : '本轮完成，可核对答案';
      const progressElement = panel.querySelector('.scratchpad-progress');
      if (progressElement.textContent !== label) progressElement.textContent = label;
      const playLabel = controls[0] ? controls[0].textContent.trim() : '本轮完成';
      if (button('playback').textContent !== playLabel) button('playback').textContent = playLabel;
      button('playback').setAttribute('aria-label', '草稿区' + playLabel);
      button('playback').disabled = !controls[0] || controls[0].disabled;
      button('relisten').disabled = !controls[1] || controls[1].disabled;
    }

    function updateTools() {
      button('undo').disabled = !page().strokes.length;
      button('redo').disabled = !page().redo.length;
      button('clear').disabled = !page().strokes.length;
      button('previous').disabled = pageIndex === 0;
      button('next').disabled = pageIndex === pages.length - 1;
      button('add').disabled = pages.length >= MAX_PAGES;
      button('pen').setAttribute('aria-pressed', String(mode === 'pen'));
      button('eraser').setAttribute('aria-pressed', String(mode === 'eraser'));
      canvas.classList.toggle('scratchpad-erasing', mode === 'eraser');
      panel.querySelector('.scratchpad-page-number').textContent = `第 ${pageIndex + 1} / ${pages.length} 页`;
    }

    function drawStroke(context, stroke) {
      const points = stroke.points;
      if (!points.length) return;
      context.save();
      context.globalCompositeOperation = stroke.mode === 'eraser' ? 'destination-out' : 'source-over';
      context.strokeStyle = context.fillStyle = '#263dd1';
      context.lineCap = context.lineJoin = 'round';
      const lineWidth = point => stroke.width * (stroke.pressure ? 0.5 + point.pressure : 1);
      if (points.length === 1) {
        context.beginPath();
        context.arc(points[0].x, points[0].y, lineWidth(points[0]) / 2, 0, Math.PI * 2);
        context.fill();
      } else {
        for (let i = 1; i < points.length; i++) {
          context.lineWidth = lineWidth(points[i]);
          context.beginPath();
          context.moveTo(points[i - 1].x, points[i - 1].y);
          context.lineTo(points[i].x, points[i].y);
          context.stroke();
        }
      }
      context.restore();
    }

    function redraw() {
      if (closed) return;
      if (committedDirty) {
        committed.width = canvas.width;
        committed.height = canvas.height;
        committedContext.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);
        page().strokes.forEach(stroke => drawStroke(committedContext, stroke));
        committedDirty = false;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(committed, 0, 0);
      ctx.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);
      if (currentStroke) drawStroke(ctx, currentStroke);
    }

    function scheduleDraw() {
      if (!drawFrame) drawFrame = requestAnimationFrame(() => { drawFrame = 0; redraw(); });
    }

    function resize() {
      if (closed || body.hidden) return;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        finishStroke();
        canvas.width = w;
        canvas.height = h;
        committedDirty = true;
        redraw();
      }
    }

    function point(event) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(WIDTH, (event.clientX - rect.left) / rect.width * WIDTH)),
        y: Math.max(0, Math.min(HEIGHT, (event.clientY - rect.top) / rect.height * HEIGHT)),
        pressure: Number.isFinite(event.pressure) && event.pressure > 0 ? event.pressure : 0.5
      };
    }

    function addPoint(event) {
      const p = point(event);
      const last = currentStroke.points[currentStroke.points.length - 1];
      if (!last || Math.abs(last.x - p.x) + Math.abs(last.y - p.y) > 0.2) currentStroke.points.push(p);
    }

    function finishStroke() {
      const captured = pointerId;
      pointerId = null;
      pointerKind = null;
      if (currentStroke) {
        page().strokes.push(currentStroke);
        page().redo = [];
        currentStroke = null;
        committedDirty = true;
        updateTools();
        scheduleDraw();
      }
      if (captured !== null && canvas.hasPointerCapture(captured)) canvas.releasePointerCapture(captured);
    }

    listen(canvas, 'pointerdown', event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (penOnly.checked && event.pointerType === 'touch') return;
      // 笔优先；一个 pointerId 对应一条笔画，忽略另一只手指和掌触。
      if (pointerId !== null) {
        if (event.pointerType === 'pen' && pointerKind === 'touch') finishStroke();
        else return;
      }
      if (event.pointerType === 'touch' && !event.isPrimary) return;
      event.preventDefault();
      pointerId = event.pointerId;
      pointerKind = event.pointerType;
      currentStroke = { mode, width: mode === 'eraser' ? 30 : Number(widthSelect.value), pressure: event.pointerType === 'pen' && mode === 'pen', points: [] };
      addPoint(event);
      try { canvas.setPointerCapture(pointerId); } catch (_) { /* 合成事件或设备不支持 capture */ }
      scheduleDraw();
    }, { passive: false });

    listen(canvas, 'pointermove', event => {
      if (event.pointerId !== pointerId || !currentStroke) return;
      event.preventDefault();
      const samples = event.getCoalescedEvents ? event.getCoalescedEvents() : [];
      (samples.length ? samples : [event]).forEach(addPoint);
      scheduleDraw();
    }, { passive: false });
    const end = event => {
      if (event.pointerId !== pointerId) return;
      if (event.type === 'pointerup' && currentStroke) addPoint(event);
      finishStroke();
    };
    listen(canvas, 'pointerup', end);
    listen(canvas, 'pointercancel', end);
    listen(canvas, 'lostpointercapture', end);
    listen(document, 'visibilitychange', () => { if (document.hidden) finishStroke(); });
    listen(window, 'blur', finishStroke);
    listen(penOnly, 'change', () => {
      finishStroke();
      say(penOnly.checked ? '仅手写笔：手指仍可操作按钮和滚动页面。' : '可以用手指、手写笔或鼠标书写。');
    });

    function saveImage() {
      finishStroke();
      const exportPage = pageIndex + 1;
      const output = document.createElement('canvas');
      output.width = WIDTH * 2;
      output.height = HEIGHT * 2;
      const out = output.getContext('2d');
      out.scale(2, 2);
      out.fillStyle = '#ffffff';
      out.fillRect(0, 0, WIDTH, HEIGHT);
      out.strokeStyle = '#e6ebf6';
      out.lineWidth = 1;
      for (let y = 70; y < HEIGHT; y += 70) {
        out.beginPath(); out.moveTo(0, y); out.lineTo(WIDTH, y); out.stroke();
      }
      // 先在透明墨迹层擦除，再合成白纸，保证橡皮不会擦掉背景横线。
      const ink = document.createElement('canvas');
      ink.width = WIDTH * 2; ink.height = HEIGHT * 2;
      const inkContext = ink.getContext('2d');
      inkContext.scale(2, 2);
      page().strokes.forEach(stroke => drawStroke(inkContext, stroke));
      out.drawImage(ink, 0, 0, WIDTH, HEIGHT);
      output.toBlob(blob => {
        if (closed) return;
        if (!blob) { say('图片生成失败，请再试一次。'); return; }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `听写草稿-第${exportPage}页-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        say('已生成本页图片。iPad 可在 Safari 下载中打开，再存储到“照片”或“文件”。');
      }, 'image/png');
    }

    listen(panel, 'click', event => {
      const target = event.target.closest('button[data-action]');
      if (!target || target.disabled) return;
      const action = target.dataset.action;
      finishStroke();
      if (action === 'playback' || action === 'relisten') {
        const controls = session.querySelectorAll('.session-card .session-actions button');
        const control = controls[action === 'playback' ? 0 : 1];
        if (control && !control.disabled) control.click();
        return;
      }
      if (action === 'pen' || action === 'eraser') mode = action;
      if (action === 'undo') {
        const stroke = page().strokes.pop();
        if (stroke) page().redo.push(stroke);
      }
      if (action === 'redo') {
        const stroke = page().redo.pop();
        if (stroke) page().strokes.push(stroke);
      }
      if (action === 'clear') {
        if (!window.confirm('清空这一页草稿？其他页会保留。')) return;
        page().strokes = []; page().redo = []; say('本页已清空。');
      }
      if (action === 'previous' || action === 'next') pageIndex += action === 'previous' ? -1 : 1;
      if (action === 'add') {
        pages.push({ strokes: [], redo: [] }); pageIndex = pages.length - 1;
        say(pages.length === MAX_PAGES ? '本轮最多 30 页，请保存图片后开启新一轮。' : '已增加一页空白草稿。');
      }
      if (action === 'fold') {
        body.hidden = !body.hidden;
        target.setAttribute('aria-expanded', String(!body.hidden));
        target.textContent = body.hidden ? '展开草稿' : '收起草稿';
        if (!body.hidden) resize();
      }
      if (action === 'save') saveImage();
      committedDirty = true;
      updateTools();
      scheduleDraw();
    });
    listen(window, 'resize', resize);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    if (observer) observer.observe(canvas);
    resize();
    return {
      session, panel, refreshPractice,
      destroy() {
        finishStroke(); closed = true;
        if (drawFrame) cancelAnimationFrame(drawFrame);
        if (observer) observer.disconnect();
        disposers.forEach(dispose => dispose());
        panel.remove(); session.classList.remove('scratch-enabled');
      }
    };
  }

  function sync() {
    const session = document.querySelector('.session-area');
    const paper = session && session.querySelector('.session-heading .eyebrow')?.textContent.trim() === 'PAPER & PEN';
    if (active && (active.session !== session || !paper)) { active.destroy(); active = null; }
    if (paper && !active) active = createScratchpad(session);
    // React 切换核对视图时可能移动子节点；同一轮使用同一个草稿容器。
    if (active && active.panel.parentNode !== session) session.appendChild(active.panel);
    if (active) active.refreshPractice();
  }
  const start = () => {
    const root = document.getElementById('root');
    if (!root) return;
    new MutationObserver(sync).observe(root, { childList: true, subtree: true, characterData: true });
    sync();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
