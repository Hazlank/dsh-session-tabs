window.__ModuleLoader__.load({
  id: "dsh-session-tabs",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    const React = require("react");
    const createRoot = require("react-dom/client").createRoot;
    const h = React.createElement;

    /**
     * Session tab strip for the DSH Web GUI.
     *
     * Behaviour:
     * - Opening a session from the sidebar (or any navigation that makes it the
     *   main view) pins it as a tab. Clicking a tab switches the main view back
     *   to that session.
     * - Tabs are shortcuts only: DSH itself keeps a background session running,
     *   and the global status stream feeds the badges, so a tab never retains or
     *   disposes a session.
     * - A tab shows "running" while its session works and "done" once it stopped
     *   outside the main view; an idle session shows no status.
     * - Tabs persist host-side (plus localStorage) across reloads and app
     *   restarts, and can be closed with the × button or a middle click.
     *
     * The strip is mounted as the first flex child of the frame's centre column,
     * so it consumes layout height above whatever main panel is selected and
     * never overlaps the conversation header.
     */

    const STORAGE_KEY = "dsh-session-tabs/v1";
    /** Host-side persistence: the GUI origin changes on every app launch. */
    const STATE_URL = "/api/dsh-session-tabs/state";
    const PREFS_KEY = "dsh-session-tabs/prefs/v1";
    const PREFS_URL = "/api/dsh-session-tabs/prefs";
    const DEFAULT_PREFS = { enabled: true, durationMs: 3000, sound: false, tone: "chime" };
    const TONES = ["chime", "soft", "marimba", "drop"];
    const MIN_DURATION = 1000;
    const MAX_DURATION = 30000;
    const STYLE_ID = "dsh-session-tabs/tabstrip.css";
    const GLOBAL_DISPOSE = "__dshSessionTabsDispose";

    const CSS = `
.dsh-stab-host {
  flex: 0 0 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  /* Chrome-like frame: the strip shares the DSH sidebar fill, the selected
     tab is the content surface (white in light, a raised layer in dark). */
  --dsh-stab-frame: var(--dsw-specific-sidebar-fill, var(--dsw-alias-bg-layer-2));
  --dsh-stab-active: var(--dsw-alias-bg-base);
  --dsh-stab-divider: color-mix(in srgb, var(--dsw-alias-label-primary) 9%, transparent);
}
body[data-ds-dark-theme] .dsh-stab-host {
  /* The active tab is the content surface in both palettes, so it keeps
     merging into the panel below (dark content is darker than the sidebar). */
  --dsh-stab-divider: color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent);
}
/* Blank window-chrome strip above the tabs: drags the whole desktop window. */
.dsh-stab-drag {
  flex: 0 0 auto;
  height: 6px;
  background: var(--dsh-stab-frame);
  -webkit-app-region: drag;
}
.dsh-stab-bar {
  box-sizing: border-box;
  display: flex;
  align-items: stretch;
  gap: 0;
  height: 35px;
  padding: 2px 16px 0;
  padding-left: calc(8px + max(0px, var(--dsh-frame-leading-clearance, 0px) - 20px));
  /* The row background is also window chrome; each tab opts back out. */
  -webkit-app-region: drag;
  background: var(--dsh-stab-frame);
  border-bottom: 0.5px solid var(--dsw-alias-border-l3);
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -webkit-user-select: none;
  user-select: none;
  margin-left: 12px;
}
.dsh-stab-bar::-webkit-scrollbar { display: none; }
.dsh-stab {
  position: relative;
  -webkit-app-region: no-drag;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 128px;
  max-width: 280px;
  height: 32px;
  padding: 0 6px 0 9px;
  border: 0.5px solid transparent;
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  color: var(--dsw-alias-label-secondary);
  background: transparent;
  cursor: pointer;
  outline: none;
  font-family: var(--ds-font-family-text, inherit);
  font-size: 12px;
  line-height: 16px;
  white-space: nowrap;
}
.dsh-stab:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
/* Chrome-style divider: a short vertical line between tabs, owned by the
   tab on the right. It is not a border on the tab box, so there is no
   trailing line after the last tab and none next to the active/hovered tab. */
.dsh-stab-divider {
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 1px;
  background: var(--dsh-stab-divider);
  pointer-events: none;
}
.dsh-stab:hover .dsh-stab-divider,
.dsh-stab[aria-selected="true"] .dsh-stab-divider,
.dsh-stab:hover + .dsh-stab .dsh-stab-divider,
.dsh-stab[aria-selected="true"] + .dsh-stab .dsh-stab-divider { display: none; }
.dsh-stab[aria-selected="true"] {
  background: var(--dsh-stab-active);
  border-color: var(--dsw-alias-border-l3);
  color: var(--dsw-alias-label-primary);
}
.dsh-stab[aria-selected="true"]::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 1px;
  background: var(--dsh-stab-active);
}
.dsh-stab:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: -2px; }
.dsh-stab[data-dragging="true"] {
  background: var(--dsh-stab-active) !important;
  border-color: var(--dsw-alias-border-l3) !important;
  color: var(--dsw-alias-label-primary);
  box-shadow: var(--dsw-shadow-lv2, 0 4px 12px rgb(0 0 0 / 12%));
  z-index: 2;
}

.dsh-stab-drop-before::before,
.dsh-stab-drop-after::before {
  content: "";
  position: absolute;
  top: 4px;
  bottom: 4px;
  width: 2px;
  border-radius: 1px;
  background: var(--dsw-alias-state-business-primary);
  pointer-events: none;
}
.dsh-stab-drop-before::before { left: -2px; }
.dsh-stab-drop-after::before { right: -2px; }
.dsh-stab-status {
  flex: none;
  width: 12px;
  height: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.dsh-stab-dot {
  position: relative;
  display: inline-block;
  flex: 0 0 auto;
  width: 10px;
  height: 10px;
  color: var(--dsw-alias-state-warn-primary);
}
/* 8px dot in a 10px box: 6px was too few pixels to read as a circle at 1x. */
.dsh-stab-dot::after {
  content: "";
  position: absolute;
  inset: 1px;
  border-radius: 999px;
  background: currentColor;
}
.dsh-stab-dot[data-kind="done"] {
  color: var(--dsw-alias-state-success-primary);
}
/* DSH's own 14px state spinner, scaled into the 12px status slot. */
.dsh-stab-spinner {
  flex: none;
  width: 12px;
  height: 12px;
  color: var(--dsw-alias-label-tertiary);
  overflow: visible;
}
.dsh-stab-spinner-motion {
  transform-origin: center;
  animation: dsh-stab-spin 1.5s linear infinite;
}
.dsh-stab-spinner-track,
.dsh-stab-spinner-arc {
  fill: none;
  stroke: currentColor;
  stroke-width: 2.4;
  stroke-linecap: round;
}
.dsh-stab-spinner-track { opacity: 0.25; }
.dsh-stab-spinner-arc { stroke-dasharray: 24, 150; }
@keyframes dsh-stab-spin {
  to { transform: rotate(360deg); }
}
.dsh-stab-label { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.dsh-stab-ws { color: var(--dsw-alias-label-tertiary); }
.dsh-stab-close {
  flex: none;
  width: 18px;
  height: 18px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
  font-size: 14px;
  line-height: 14px;
  visibility: hidden;
}
.dsh-stab:hover .dsh-stab-close,
.dsh-stab[aria-selected="true"] .dsh-stab-close { visibility: visible; }
.dsh-stab-close:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
/* ---- Right-side task notifications ---- */
.dsh-stab-toasts {
  position: fixed;
  top: 58px;
  right: 16px;
  bottom: auto;
  z-index: 900;
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(332px, calc(100vw - 40px));
  pointer-events: none;
}
.dsh-stab-toast {
  position: relative;
  flex: 0 0 auto;
  pointer-events: auto;
  box-sizing: border-box;
  padding: 11px 13px 9px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 12px;
  background: var(--dsw-alias-bg-base);
  box-shadow: var(--dsw-shadow-lv3, 0 12px 32px rgb(0 0 0 / 16%));
  color: var(--dsw-alias-label-primary);
  font-family: var(--ds-font-family-text, inherit);
  animation: dsh-stab-toast-in 420ms cubic-bezier(0.16, 1, 0.3, 1);
}
.dsh-stab-toast-head {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
}
.dsh-stab-toast-mark {
  position: relative;
  display: inline-block;
  flex: 0 0 auto;
  width: 10px;
  height: 10px;
  color: var(--dsw-alias-state-success-primary);
}
.dsh-stab-toast-mark::after {
  content: "";
  position: absolute;
  inset: 1px;
  border-radius: 999px;
  background: currentColor;
}
.dsh-stab-toast:not([data-kind="done"]) .dsh-stab-toast-mark {
  color: var(--dsw-alias-state-warn-primary);
}
.dsh-stab-toast-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
  line-height: 18px;
}
.dsh-stab-toast-close {
  flex: none;
  width: 18px;
  height: 18px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
  font-size: 13px;
  line-height: 13px;
}
.dsh-stab-toast-close:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dsh-stab-toast-task {
  margin-top: 5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  line-height: 17px;
  color: var(--dsw-alias-label-secondary);
}
.dsh-stab-toast-workspace {
  margin-top: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  line-height: 15px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-stab-toast-note {
  margin-top: 3px;
  font-size: 11px;
  line-height: 15px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-stab-toast-foot {
  display: flex;
  justify-content: flex-end;
  margin-top: 6px;
}
.dsh-stab-toast-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 7px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-state-business-primary);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  line-height: 17px;
}
.dsh-stab-toast-action:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-stab-toast-action:focus-visible,
.dsh-stab-toast-close:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 1px; }
@keyframes dsh-stab-toast-in {
  from { opacity: 0; transform: translateY(-8px) scale(0.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .dsh-stab-toast { animation: none; }
}

/* ---- Settings section: toast preferences ---- */
.dsh-stab-settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  max-width: 640px;
  padding: 2px 2px 28px;
  color: var(--dsw-alias-label-primary);
  font-family: var(--ds-font-family-text, inherit);
}
.dsh-stab-settings-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}
.dsh-stab-settings-hint {
  margin-top: -6px;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-stab-settings-group {
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-base);
  overflow: hidden;
}
.dsh-stab-settings-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
}
.dsh-stab-settings-row + .dsh-stab-settings-row {
  border-top: 0.5px solid var(--dsw-alias-border-l3);
}
.dsh-stab-settings-copy { flex: 1 1 auto; min-width: 0; }
.dsh-stab-settings-label { font-size: 13px; line-height: 18px; }
.dsh-stab-settings-sub {
  margin-top: 2px;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-stab-switch {
  flex: none;
  position: relative;
  width: 34px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 10px;
  background: var(--dsw-alias-border-l2);
  cursor: pointer;
  transition: background 140ms ease;
}
.dsh-stab-switch::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgb(0 0 0 / 20%);
  transition: transform 140ms ease;
}
.dsh-stab-switch[aria-checked="true"] { background: var(--dsw-alias-state-business-primary); }
.dsh-stab-switch[aria-checked="true"]::after { transform: translateX(14px); }
.dsh-stab-switch:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }
.dsh-stab-duration {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.dsh-stab-duration input {
  box-sizing: border-box;
  width: 86px;
  padding: 5px 8px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 12px;
  line-height: 18px;
}
.dsh-stab-duration input:focus { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: -1px; }
.dsh-stab-duration input:disabled { opacity: 0.5; }
.dsh-stab-duration-unit { font-size: 11px; color: var(--dsw-alias-label-tertiary); }
.dsh-stab-sound {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.dsh-stab-select {
  box-sizing: border-box;
  height: 30px;
  padding: 0 8px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 12px;
  line-height: 18px;
}
.dsh-stab-select:focus { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: -1px; }
.dsh-stab-preview {
  height: 30px;
  padding: 0 12px;
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}
.dsh-stab-preview:hover { background: var(--dsw-alias-bg-l2, rgb(0 0 0 / 4%)); }
.dsh-stab-preview:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: -1px; }
.dsh-stab-settings-status {
  min-height: 16px;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-stab-settings-status[data-tone="ok"] { color: var(--dsw-alias-state-success-primary); }
.dsh-stab-settings-status[data-tone="error"] { color: var(--dsw-alias-state-error-primary, #e5484d); }
@keyframes dsh-stab-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.8); }
}
@media (prefers-reduced-motion: reduce) {
  .dsh-stab-spinner-motion { animation: none; }
  .dsh-stab-spinner-arc { stroke-dasharray: 18, 150; stroke-dashoffset: -3; }
}
`;

    /** Inject the plugin stylesheet once per document. */
    function ensureStyle() {
      if (typeof document === "undefined") return;
      if (document.querySelector('style[data-plugin-css="' + STYLE_ID + '"]') !== null) return;
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-session-tabs";
      tag.dataset.pluginCss = STYLE_ID;
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }

    /** Whether the GUI is running in Chinese. */
    function isChinese() {
      const lang = (document.documentElement.lang || navigator.language || "").toLowerCase();
      return lang.startsWith("zh");
    }

    /** Copy for the two statuses and the controls. */
    function copy() {
      return isChinese()
        ? {
            running: "执行中",
            queued: "等待执行",
            approval: "等待审批",
            question: "等待回答",
            planReview: "计划待确认",
            pending: "等待你处理",
            done: "已完成",
            close: "关闭标签",
            untitled: "未命名任务",
            open: "切换到该会话",
            toastDoneTitle: "任务已完成",
            toastQueuedTitle: "消息已排队",
            toastQueuedHint: "当前任务结束后自动执行",
            toastApprovalTitle: "等待审批",
            toastApprovalHint: "需要你允许后继续执行",
            toastQuestionTitle: "等待你的回答",
            toastQuestionHint: "Agent 有问题需要你确认",
            toastPlanTitle: "计划待确认",
            toastPlanHint: "计划已提交，等待你批准",
            toastPendingTitle: "等待你处理",
            toastPendingHint: "会话暂停，等待你的操作",
            toastDoneAction: "查看结果",
            toastQueuedAction: "查看会话",
            toastApprovalAction: "去审批",
            toastQuestionAction: "去回答",
            toastPlanAction: "查看计划",
            toastPendingAction: "查看会话",
            toastDismiss: "关闭通知",
            toastRegion: "任务通知",
            settingsNav: "会话标签",
            settingsTitle: "会话标签",
            settingsHint: "任务完成、消息排队或会话等待你处理时，在右上角提醒你。",
            toastEnabled: "完成 / 排队 / 待办通知",
            toastEnabledHint: "任务完成、消息排队或会话等待你处理时，在右上角弹出通知。",
            toastDuration: "通知停留时长",
            toastDurationHint: "毫秒，默认 3000（1–30 秒）。",
            soundEnabled: "提示音",
            soundEnabledHint: "收到完成、排队或等待通知时播放提示音。",
            soundTone: "铃声",
            soundToneHint: "选择提示音的音色。",
            soundPreview: "试听",
            soundChime: "清脆",
            soundSoft: "柔和",
            soundMarimba: "木琴",
            soundDrop: "水滴",
            settingsSaved: "已保存",
            settingsInvalid: "请输入 1000–30000 之间的毫秒数",
            settingsFailed: "保存失败，请重试",
          }
        : {
            running: "Running",
            queued: "Queued",
            approval: "Approval needed",
            question: "Awaiting answer",
            planReview: "Plan review",
            pending: "Needs attention",
            done: "Done",
            close: "Close tab",
            untitled: "Untitled task",
            open: "Switch to this session",
            toastDoneTitle: "Task complete",
            toastQueuedTitle: "Message queued",
            toastQueuedHint: "Runs automatically after the current task",
            toastApprovalTitle: "Approval needed",
            toastApprovalHint: "Allow to continue",
            toastQuestionTitle: "Answer needed",
            toastQuestionHint: "The agent is waiting for your answer",
            toastPlanTitle: "Plan review",
            toastPlanHint: "The plan is waiting for your approval",
            toastPendingTitle: "Needs your attention",
            toastPendingHint: "The session is paused until you respond",
            toastDoneAction: "View result",
            toastQueuedAction: "View session",
            toastApprovalAction: "Review",
            toastQuestionAction: "Answer",
            toastPlanAction: "View plan",
            toastPendingAction: "View session",
            toastDismiss: "Dismiss notification",
            toastRegion: "Task notifications",
            settingsNav: "Session tabs",
            settingsTitle: "Session tabs",
            settingsHint: "Get a top-right reminder when a task completes or waits to run.",
            toastEnabled: "Completion / queue notifications",
            toastEnabledHint: "Show a top-right toast when a task completes or starts waiting.",
            toastDuration: "Toast duration",
            toastDurationHint: "Milliseconds, default 3000 (1–30 s).",
            soundEnabled: "Sound",
            soundEnabledHint: "Play a short cue for completion, queue, and waiting notifications.",
            soundTone: "Tone",
            soundToneHint: "Pick the notification cue.",
            soundPreview: "Preview",
            soundChime: "Chime",
            soundSoft: "Soft",
            soundMarimba: "Marimba",
            soundDrop: "Drop",
            settingsSaved: "Saved",
            settingsInvalid: "Enter a number of milliseconds between 1000 and 30000",
            settingsFailed: "Save failed, please retry",
          };
    }

    /** Basename of a workspace path. */
    function basename(path) {
      if (typeof path !== "string" || path === "") return "";
      const parts = path.split(/[\\/]+/).filter(Boolean);
      return parts.length === 0 ? "" : parts[parts.length - 1];
    }

    /** Normalize a persisted tab array. */
    function sanitizeItems(raw) {
      if (!Array.isArray(raw)) return [];
      const seen = new Set();
      const items = [];
      for (const item of raw) {
        if (items.length >= 50) break;
        if (!item || typeof item.id !== "string" || item.id === "" || seen.has(item.id)) continue;
        seen.add(item.id);
        items.push({
          id: item.id,
          label: typeof item.label === "string" ? item.label : "",
          workspace: typeof item.workspace === "string" ? item.workspace : "",
        });
      }
      return items;
    }

    /** Normalize one toast-preference snapshot. */
    function normalizePrefs(raw) {
      const source = raw !== null && typeof raw === "object" ? raw : {};
      const enabled = typeof source.enabled === "boolean" ? source.enabled : DEFAULT_PREFS.enabled;
      const sound = typeof source.sound === "boolean" ? source.sound : DEFAULT_PREFS.sound;
      const tone = TONES.includes(source.tone) ? source.tone : DEFAULT_PREFS.tone;
      const parsed = Number(source.durationMs);
      const durationMs = Number.isFinite(parsed)
        ? Math.min(MAX_DURATION, Math.max(MIN_DURATION, Math.round(parsed)))
        : DEFAULT_PREFS.durationMs;
      return { enabled, durationMs, sound, tone };
    }

    /** Load the locally cached toast preferences (an instant fallback before the host answers). */
    function loadCachedPrefs() {
      try {
        const raw = window.localStorage.getItem(PREFS_KEY);
        if (raw === null) return { ...DEFAULT_PREFS };
        return normalizePrefs(JSON.parse(raw));
      } catch {
        return { ...DEFAULT_PREFS };
      }
    }

    /** Load the locally cached tab list (survives a page refresh). */
    function loadState() {
      const empty = { items: [], lastActiveId: null, updatedAt: 0 };
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw === null) return empty;
        const parsed = JSON.parse(raw);
        const items = sanitizeItems(parsed.items);
        const lastActiveId = items.some((item) => item.id === parsed.lastActiveId)
          ? parsed.lastActiveId
          : items.length > 0
            ? items[items.length - 1].id
            : null;
        return { items, lastActiveId, updatedAt: Number(parsed.updatedAt) || 0 };
      } catch {
        return empty;
      }
    }

    /** Find the frame's centre column: the DOM sibling before the right bar. */
    function findCenterColumn() {
      const rightbar = document.querySelector("[data-rightbar-col]");
      if (rightbar !== null && rightbar.parentElement !== null) {
        const previous = rightbar.previousElementSibling;
        if (previous !== null) return previous;
      }
      const byClass = document.querySelector('[class*="centerCol"]');
      return byClass;
    }

    // ---- Notification cue (Web Audio; no external audio files) ----
    let audioContext = null;
    let lastCueAt = 0;

    /** Short synthesized cues, tuned to stay quiet under voice/chat audio. */
    const SOUND_PRESETS = {
      chime: [
        [880, 0, 0.32, "sine", 0.5],
        [1318.51, 0.055, 0.36, "sine", 0.28],
      ],
      soft: [
        [587.33, 0, 0.5, "sine", 0.45],
        [880, 0.09, 0.55, "sine", 0.22],
      ],
      marimba: [
        [523.25, 0, 0.26, "triangle", 0.5],
        [659.25, 0.075, 0.28, "triangle", 0.34],
        [783.99, 0.15, 0.32, "sine", 0.22],
      ],
      drop: [
        [1400, 0, 0.18, "sine", 0.42],
        [700, 0.07, 0.26, "sine", 0.3],
        [350, 0.14, 0.4, "sine", 0.2],
      ],
    };

    /** Lazily create the shared AudioContext; null when Web Audio is unavailable. */
    function ensureAudio() {
      if (audioContext !== null) return audioContext;
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (typeof Ctor !== "function") return null;
      try {
        audioContext = new Ctor();
      } catch {
        return null;
      }
      return audioContext;
    }

    /** Schedule one cue; notes are [frequency, offset, duration, oscillator type, gain]. */
    function emitCue(context, tone) {
      const notes = SOUND_PRESETS[tone] || SOUND_PRESETS.chime;
      const base = context.currentTime + 0.02;
      const master = context.createGain();
      master.gain.setValueAtTime(0.12, base);
      master.connect(context.destination);
      for (const [frequency, offset, duration, type, level] of notes) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = base + offset;
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(level, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain);
        gain.connect(master);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.03);
      }
    }

    /** Play a cue, throttled so a burst of toasts makes one sound. */
    function playCue(tone, force = false) {
      const now = Date.now();
      if (!force && now - lastCueAt < 700) return;
      lastCueAt = now;
      const context = ensureAudio();
      if (context === null) return;
      const start = () => {
        try {
          emitCue(context, tone);
        } catch {
          /* audio unavailable; a toast without sound is still useful */
        }
      };
      if (context.state === "suspended") context.resume().then(start).catch(() => {});
      else start();
    }

    /** Required Cordis services: session controller, UI status, navigation, layout, slots. */
    const inject = ["sessions", "uiSession", "uiWorkspace", "workspaces", "layout", "slots"];

    /**
     * Mount the tab strip for one client generation.
     * @param ctx - client root context.
     */
    function apply(ctx) {
      const sessions = ctx.get("sessions");
      const uiSession = ctx.get("uiSession");
      const uiWorkspace = ctx.get("uiWorkspace");
      const workspaces = ctx.get("workspaces");
      const layout = ctx.get("layout");
      if (sessions === undefined || uiSession === undefined || uiWorkspace === undefined || layout === undefined) {
        console.warn("[session-tabs] required services are not available yet");
        return;
      }

      const text = copy();
      const unlockAudio = () => {
        const context = ensureAudio();
        if (context !== null && context.state === "suspended") context.resume().catch(() => {});
      };
      window.addEventListener("pointerdown", unlockAudio, { capture: true, once: true });
      window.addEventListener("keydown", unlockAudio, { capture: true, once: true });
      const listeners = new Set();
      let snapshot = loadState();
      let lastMainId = null;
      let disposed = false;
      /** Local edit clock, compared with the host copy on startup. */
      let localUpdatedAt = snapshot.updatedAt;
      /** Suppress pushes until the host copy has been read/merged. */
      let hydrating = true;
      let pushTimer = null;
      /** Set once the host route answers; avoids 404 noise on older hosts. */
      let hostAvailable = false;

      // ---- Toast preferences (host-backed, cached locally) ----
      let prefs = loadCachedPrefs();
      const prefsListeners = new Set();
      const subscribePrefs = (fn) => {
        prefsListeners.add(fn);
        return () => {
          prefsListeners.delete(fn);
        };
      };
      const getPrefs = () => prefs;
      const notifyPrefs = () => {
        for (const fn of prefsListeners) {
          try {
            fn();
          } catch (error) {
            console.warn("[session-tabs] prefs listener failed", String(error));
          }
        }
      };
      function applyPrefs(next) {
        prefs = normalizePrefs(next);
        try {
          window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
        } catch {
          /* private mode: the host copy still persists */
        }
        if (!prefs.enabled) clearToasts();
        notifyPrefs();
      }
      async function hydratePrefs() {
        try {
          const response = await fetch(PREFS_URL, { headers: { accept: "application/json" } });
          if (!response.ok || disposed) return;
          const data = await response.json();
          const value = data !== null && typeof data === "object" ? data.prefs : undefined;
          if (value !== undefined && value !== null) applyPrefs(value);
        } catch {
          /* offline: cached prefs keep working */
        }
      }
      async function savePrefs(patch) {
        applyPrefs({ ...prefs, ...patch });
        try {
          const response = await fetch(PREFS_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              enabled: prefs.enabled,
              durationMs: prefs.durationMs,
              sound: prefs.sound,
              tone: prefs.tone,
            }),
          });
          if (!response.ok) return false;
          const data = await response.json();
          const saved = data !== null && typeof data === "object" ? data.prefs : undefined;
          if (saved !== undefined && saved !== null) applyPrefs(saved);
          return true;
        } catch {
          return false;
        }
      }

      // ---- Right-side notification toasts ----
      let toasts = [];
      const toastListeners = new Set();
      const toastTimers = new Map();
      const subscribeToasts = (fn) => {
        toastListeners.add(fn);
        return () => {
          toastListeners.delete(fn);
        };
      };
      const getToasts = () => toasts;
      const notifyToasts = () => {
        for (const fn of toastListeners) {
          try {
            fn();
          } catch (error) {
            console.warn("[session-tabs] toast listener failed", String(error));
          }
        }
      };
      function clearToasts() {
        for (const timer of toastTimers.values()) window.clearTimeout(timer);
        toastTimers.clear();
        if (toasts.length === 0) return;
        toasts = [];
        notifyToasts();
      }
      function dismissToast(id) {
        const timer = toastTimers.get(id);
        if (timer !== undefined) {
          window.clearTimeout(timer);
          toastTimers.delete(id);
        }
        const next = toasts.filter((toast) => toast.id !== id);
        if (next.length === toasts.length) return;
        toasts = next;
        notifyToasts();
      }
      /** Show (or refresh) one toast for a session; returns silently when disabled. */
      function pushToast(kind, id) {
        if (prefs.enabled && prefs.sound) playCue(prefs.tone);
        if (!prefs.enabled) return;
        if (typeof id !== "string" || id === "") return;
        const timer = toastTimers.get(id);
        if (timer !== undefined) window.clearTimeout(timer);
        toasts = [{ id, kind }, ...toasts.filter((toast) => toast.id !== id)].slice(0, 3);
        toastTimers.set(
          id,
          window.setTimeout(() => {
            toastTimers.delete(id);
            dismissToast(id);
          }, prefs.durationMs),
        );
        notifyToasts();
      }

      const subscribeTabs = (fn) => {
        listeners.add(fn);
        return () => {
          listeners.delete(fn);
        };
      };
      const getTabs = () => snapshot;
      const notify = () => {
        for (const fn of listeners) {
          try {
            fn();
          } catch (error) {
            console.warn("[session-tabs] listener failed", String(error));
          }
        }
      };

      const listSnapshot = () => sessions.list.getSnapshot();
      const subscribeList = (fn) => sessions.list.subscribe(fn);
      const getList = () => listSnapshot();

      const workspaceSnapshot = () => (workspaces === undefined ? { items: [] } : workspaces.list.getSnapshot());
      const subscribeWorkspaces = (fn) => (workspaces === undefined ? () => {} : workspaces.list.subscribe(fn));
      const getWorkspaces = () => workspaceSnapshot();

      const statusSnapshot = () => uiSession.sessionStatus.getSnapshot();
      const subscribeStatus = (fn) => uiSession.sessionStatus.subscribe(fn);
      const getStatus = () => statusSnapshot();

      const subscribePanel = (fn) => layout.panelInfo.subscribe(fn);
      const getActivePanel = () => layout.panelInfo.getSnapshot().activePanelId;

      /** One session row from the list snapshot. */
      const summaryOf = (id, snapshotList) => {
        const rows = snapshotList.byId;
        return rows[id];
      };

      /** Human workspace label: the registered title, with the default localized. */
      function workspaceTitleOf(id, snapshotList) {
        const row = summaryOf(id, snapshotList);
        const cwd = row !== undefined && typeof row.cwd === "string" ? row.cwd : "";
        const items = workspaceSnapshot().items || [];
        const owner = items.find((item) => Array.isArray(item.sessionIds) && item.sessionIds.includes(id))
          || (cwd === "" ? undefined : items.find((item) => item.path === cwd));
        if (owner !== undefined && typeof owner.title === "string" && owner.title !== "") {
          return owner.title === "default-workspace"
            ? isChinese() ? "默认工作区" : "Default Workspace"
            : owner.title;
        }
        return basename(cwd);
      }

      /** Label parts for one tab: workspace name and task title. */
      function labelFor(id, snapshotList) {
        const row = summaryOf(id, snapshotList);
        const cached = snapshot.items.find((item) => item.id === id);
        const task = row !== undefined && row.displayTitle !== undefined && row.displayTitle !== ""
          ? row.displayTitle
          : row !== undefined && typeof row.title === "string" && row.title !== ""
            ? row.title
            : cached !== undefined && cached.label !== ""
              ? cached.label
              : text.untitled;
        const workspace = row !== undefined && typeof row.cwd === "string"
          ? workspaceTitleOf(id, snapshotList)
          : (cached !== undefined ? cached.workspace : "");
        return { task, workspace };
      }

      /** Status key for one tab: running, done, or null. */
      /** Messages accepted by the Host but not started yet (durable inbox queue). */
      function queuedCountOf(id, snapshotList) {
        const projections = snapshotList !== null && snapshotList !== undefined ? snapshotList.projectionsBySession : undefined;
        const values = projections !== undefined && projections !== null ? projections[id] : undefined;
        const inbox =
          values !== undefined && values !== null && values.values !== undefined ? values.values.inbox : undefined;
        if (inbox === undefined || inbox === null) return 0;
        let count = 0;
        for (const key of ["next-turn", "next-step"]) {
          const rows = inbox[key];
          if (Array.isArray(rows)) count += rows.length;
        }
        return count;
      }

      /** Pending interaction kind: approval / question / plan-review / other, or null. */
      function pendingKindOf(id, statusMap) {
        const status = statusMap.get(id);
        if (status === undefined || status === null) return null;
        const interaction = status.pendingInteraction;
        if (interaction === undefined || interaction === null || interaction === false) return null;
        const kind = interaction.kind;
        return typeof kind === "string" && kind !== "" ? kind : "pending";
      }

      function statusOf(id, snapshotList, statusMap) {
        const status = statusMap.get(id);
        const row = summaryOf(id, snapshotList);
        const running = status !== undefined && typeof status.running === "boolean" ? status.running : row !== undefined ? row.running === true : false;
        // A paused interaction is waiting on the user, not executing.
        const pending = pendingKindOf(id, statusMap);
        if (pending !== null) return pending;
        if (running) return "running";
        // Not running but holding admitted messages: the Host will start a turn.
        if (queuedCountOf(id, snapshotList) > 0) return "queued";
        if (status !== undefined && status.completionUnread === true) return "done";
        return null;
      }

      /** Session currently shown by the conversation main panel, if any. */
      function currentMainId() {
        const list = listSnapshot();
        for (const row of Object.values(list.byId)) {
          if ((row.retainedBy !== undefined && (row.retainedBy.mainView || 0) > 0)) return row.id;
        }
        return null;
      }

      /** Current state in the exact shape the host persists. */
      function currentPayload() {
        const list = listSnapshot();
        const items = snapshot.items.map((item) => {
          const label = labelFor(item.id, list);
          return { id: item.id, label: label.task, workspace: label.workspace };
        });
        return { version: 1, items, lastActiveId: snapshot.lastActiveId, updatedAt: localUpdatedAt };
      }

      /** Persist tabs plus the live labels they were showing. */
      function persist() {
        localUpdatedAt = Date.now();
        const payload = currentPayload();
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch {
          /* private mode or quota: tabs still persist host-side */
        }
        if (!hydrating && !disposed) schedulePush();
      }

      /** Debounced host write: tab clicks are bursty, disk writes need not be. */
      function schedulePush() {
        if (pushTimer !== null) clearTimeout(pushTimer);
        pushTimer = setTimeout(() => {
          pushTimer = null;
          void pushState();
        }, 200);
      }

      /** Send the current tab set to the host store. */
      async function pushState() {
        if (!hostAvailable) return;
        const payload = currentPayload();
        if (payload.updatedAt === 0 && payload.items.length === 0) return;
        try {
          const response = await fetch(STATE_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (!response.ok) return;
          const data = await response.json();
          const saved = data !== null && typeof data === "object" ? data.state : undefined;
          if (saved !== undefined && saved !== null && typeof saved.updatedAt === "number") {
            localUpdatedAt = Math.max(localUpdatedAt, saved.updatedAt);
          }
        } catch {
          /* host offline: localStorage remains the fallback */
        }
      }

      /**
       * Adopt the host tab set when it is newer than the local cache. This is
       * what makes tabs survive a desktop-app restart, where the loopback port
       * (and therefore the page origin holding localStorage) changes.
       */
      async function hydrateFromHost() {
        let adopted = false;
        try {
          const response = await fetch(STATE_URL, { headers: { accept: "application/json" } });
          if (!response.ok || disposed) return;
          hostAvailable = true;
          const data = await response.json();
          const state = data !== null && typeof data === "object" ? data.state : undefined;
          if (state !== undefined && state !== null && Array.isArray(state.items)) {
            const items = sanitizeItems(state.items);
            const updatedAt = Number(state.updatedAt) || 0;
            if (disposed) return;
            if (updatedAt > localUpdatedAt) {
              localUpdatedAt = updatedAt;
              const lastActiveId = items.some((item) => item.id === state.lastActiveId)
                ? state.lastActiveId
                : items.length > 0
                  ? items[items.length - 1].id
                  : null;
              setSnapshot({ items, lastActiveId });
              prune(listSnapshot());
              adopted = true;
              return;
            }
            if (updatedAt === localUpdatedAt) return;
          }
          // Nothing stored yet (or this client is newer): publish our copy.
          void pushState();
        } catch {
          /* host offline: keep the localStorage view */
        } finally {
          hydrating = false;
          // A prune during hydration may have dropped sessions that no longer
          // exist; write the cleaned set back once the read is complete.
          if (adopted) schedulePush();
        }
      }

      function setSnapshot(next) {
        snapshot = next;
        persist();
        notify();
      }

      /*
       * Tabs are navigation shortcuts only: they never retain, open, or dispose
       * a session. DSH already keeps sessions running while another one is in
       * the main view, and the global status stream feeds the running/done
       * badges, so pinning background references would only add history opens
       * (and, on 0.2.1, risk tripping unrelated projection subscribers).
       */

      /** Add a session as a tab unless present; optionally make it the active tab. */
      function addTab(id, activate) {
        if (typeof id !== "string" || id === "") return;
        const exists = snapshot.items.some((item) => item.id === id);
        if (!exists) {
          const label = labelFor(id, listSnapshot());
          const items = snapshot.items.concat({ id, label: label.task, workspace: label.workspace });
          setSnapshot({ items, lastActiveId: activate === true ? id : snapshot.lastActiveId });
        } else if (activate === true && snapshot.lastActiveId !== id) {
          setSnapshot({ items: snapshot.items, lastActiveId: id });
        }
      }

      /** Move one tab to another position (drag reorder). */
      function move(from, to) {
        if (from < 0 || from >= snapshot.items.length) return;
        const items = snapshot.items.slice();
        const [item] = items.splice(from, 1);
        const target = Math.max(0, Math.min(items.length, to));
        if (target === from) return;
        items.splice(target, 0, item);
        setSnapshot({ items, lastActiveId: snapshot.lastActiveId });
      }

      /** Switch the main view to one tab's session. */
      function activate(id) {
        addTab(id, true);
        setSnapshot({ items: snapshot.items, lastActiveId: id });
        try {
          layout.selectPanel(null);
        } catch (error) {
          console.warn("[session-tabs] selectPanel failed", String(error));
        }
        try {
          uiWorkspace.openSession(id);
        } catch (error) {
          console.warn("[session-tabs] openSession failed", String(error));
        }
      }

      /** Close one tab; the session itself keeps running in DSH. */
      function close(id) {
        const index = snapshot.items.findIndex((item) => item.id === id);
        if (index < 0) return;
        const wasActive = activeId() === id;
        const items = snapshot.items.filter((item) => item.id !== id);
        const neighbour = items.length === 0 ? null : items[Math.min(index, items.length - 1)];
        setSnapshot({ items, lastActiveId: neighbour === null ? null : neighbour.id });
        if (wasActive && neighbour !== null) activate(neighbour.id);
      }

      /** Active tab identity: exactly the main-view session when it is pinned. */
      function activeId() {
        if (layout.panelInfo.getSnapshot().activePanelId !== null) return null;
        const main = currentMainId();
        if (main !== null && snapshot.items.some((item) => item.id === main)) return main;
        return null;
      }

      /** Drop tabs whose sessions no longer exist once the catalog is authoritative. */
      function prune(list) {
        if (list.phase !== "ready") return;
        const keep = [];
        let changed = false;
        for (const item of snapshot.items) {
          if (list.byId[item.id] !== undefined || list.ids.includes(item.id)) keep.push(item);
          else changed = true;
        }
        if (!changed) return;
        const lastActiveId = keep.some((item) => item.id === snapshot.lastActiveId)
          ? snapshot.lastActiveId
          : keep.length === 0
            ? null
            : keep[keep.length - 1].id;
        setSnapshot({ items: keep, lastActiveId });
      }

      /** Whether a session is a blank placeholder (no task yet). */
      function isBlank(list, id) {
        const row = list.byId[id];
        return row !== undefined && row.blank === true;
      }

      /** Track the main-view session so any navigation pins a tab. */
      const unsubscribeList = sessions.list.subscribe(() => {
        if (disposed) return;
        const list = listSnapshot();
        prune(list);
        const main = currentMainId();
        if (main !== null && main !== lastMainId) {
          // A blank "new session" is navigated to automatically; pinning it
          // would leave an empty workspace tab on every fresh window. It earns
          // a tab once it has a task (the catalog refreshes its title) or when
          // the user clicks its row explicitly.
          if (isBlank(list, main)) return;
          lastMainId = main;
          addTab(main, false);
          if (snapshot.lastActiveId === null) setSnapshot({ items: snapshot.items, lastActiveId: main });
        }
      });

      /** A sidebar row click pins its session even when it is already the main view. */
      const onDocumentClick = (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const row = target.closest('[data-row-key^="session:"]');
        if (row === null) return;
        const key = row.getAttribute("data-row-key") || "";
        const id = key.slice("session:".length);
        if (id === "" || isBlank(listSnapshot(), id)) return;
        addTab(id, true);
      };
      document.addEventListener("click", onDocumentClick, false);
      void hydrateFromHost();
      void hydratePrefs();

      const api = {
        subscribeTabs,
        getTabs,
        subscribeList,
        getList,
        subscribeWorkspaces,
        getWorkspaces,
        subscribeStatus,
        getStatus,
        subscribePanel,
        getActivePanel,
        summaryOf,
        labelFor,
        statusOf,
        pendingKindOf,
        queuedCountOf,
        activeId,
        activate,
        close,
        move,
        subscribePrefs,
        getPrefs,
        savePrefs,
        subscribeToasts,
        getToasts,
        pushToast,
        dismissToast,
        clearToasts,
        previewSound: (tone) => playCue(tone, true),
        text,
      };

      /** Contribute the toast settings section to Settings → 会话标签. */
      let disposeSettings = null;
      try {
        const slots = ctx.slots;
        if (slots !== undefined && typeof slots.inject === "function") {
          disposeSettings = slots.inject("settings.section", () =>
            slots.register(
              {
                name: "settings.section",
                id: "session-tabs",
                order: 55,
                label: () => text.settingsNav,
              },
              SettingsSection,
            ),
          );
        }
      } catch (error) {
        console.warn("[session-tabs] settings section registration failed", String(error));
      }

      /** Chrome-like tab strip bound to the plugin API. */
      function TabStrip() {
        const state = React.useSyncExternalStore(api.subscribeTabs, api.getTabs, api.getTabs);
        const list = React.useSyncExternalStore(api.subscribeList, api.getList, api.getList);
        React.useSyncExternalStore(api.subscribeWorkspaces, api.getWorkspaces, api.getWorkspaces);
        const statusMap = React.useSyncExternalStore(api.subscribeStatus, api.getStatus, api.getStatus);
        React.useSyncExternalStore(api.subscribePanel, api.getActivePanel, api.getActivePanel);
        const active = api.activeId();
        const [dragIndex, setDragIndex] = React.useState(null);
        const [dropAt, setDropAt] = React.useState(null);
        const draggingRef = React.useRef(false);
        const draggedAtRef = React.useRef(0);

        if (state.items.length === 0) return null;

        const onWheel = (event) => {
          if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
            event.currentTarget.scrollLeft += event.deltaY;
          }
        };

        /** Insertion slot under the pointer: before or after the hovered tab. */
        const slotAt = (event, index) => {
          const rect = event.currentTarget.getBoundingClientRect();
          return index + (event.clientX > rect.left + rect.width / 2 ? 1 : 0);
        };

        /**
         * Paint the drag image on a canvas. Chromium/Electron snapshot the
         * source element at dragstart; an inactive tab has a transparent
         * background, so a DOM snapshot lets its label blend into the tabs
         * underneath. A canvas painted with the palette tokens is always
         * opaque and keeps the ghost readable.
         */
        const buildDragImage = (node) => {
          const rect = node.getBoundingClientRect();
          const width = Math.max(1, Math.round(rect.width));
          const height = Math.max(1, Math.round(rect.height));
          const style = getComputedStyle(node);
          const token = (name, fallback) => {
            const value = style.getPropertyValue(name).trim();
            return value === "" ? fallback : value;
          };
          const dpr = Math.min(2, window.devicePixelRatio || 1);
          const canvas = document.createElement("canvas");
          canvas.width = width * dpr;
          canvas.height = height * dpr;
          canvas.style.width = width + "px";
          canvas.style.height = height + "px";
          const g = canvas.getContext("2d");
          if (g === null) return null;
          g.scale(dpr, dpr);
          const radius = 8;
          g.beginPath();
          g.moveTo(0, height);
          g.lineTo(0, radius);
          g.arcTo(0, 0, radius, 0, radius);
          g.lineTo(width - radius, 0);
          g.arcTo(width, 0, width, radius, radius);
          g.lineTo(width, height);
          g.closePath();
          g.fillStyle = token("--dsw-alias-bg-base", "#ffffff");
          g.fill();
          g.strokeStyle = token("--dsw-alias-border-l3", "rgba(0,0,0,0.12)");
          g.lineWidth = 0.5;
          g.stroke();
          const status = node.getAttribute("data-status");
          if (status !== null) {
            g.beginPath();
            g.arc(15, height / 2, 3, 0, Math.PI * 2);
            g.fillStyle =
              status === "running"
                ? token("--dsw-alias-state-business-primary", "#4d6bfe")
                : status === "done"
                  ? token("--dsw-alias-state-success-primary", "#0ca678")
                  : token("--dsw-alias-state-warn-primary", "#f59e0b");
            g.fill();
          }
          const labelNode = node.querySelector(".dsh-stab-label");
          const raw = (labelNode === null ? node.textContent : labelNode.textContent).replace(/\u00d7/g, "").trim();
          g.font = style.fontSize + " " + style.fontFamily;
          g.textBaseline = "middle";
          g.fillStyle = token("--dsw-alias-label-primary", "#0f1115");
          const left = 9 + 12 + 6;
          const maxWidth = width - left - 8;
          let text = raw;
          while (text.length > 1 && g.measureText(text).width > maxWidth) {
            text = text.slice(0, -1);
          }
          if (text !== raw) text = text.trimEnd() + "\u2026";
          g.fillText(text, left, height / 2);
          canvas.style.position = "fixed";
          canvas.style.top = "-10000px";
          canvas.style.left = "-10000px";
          canvas.style.pointerEvents = "none";
          document.body.appendChild(canvas);
          return canvas;
        };

        const onDragStart = (event, index) => {
          const image = buildDragImage(event.currentTarget);
          if (image !== null) {
            try {
              event.dataTransfer.setDragImage(image, image.offsetWidth / 2, image.offsetHeight / 2);
            } catch (error) {
              /* setDragImage is optional in some webviews */
            }
            setTimeout(() => image.remove(), 1000);
          }
          setDragIndex(index);
          setDropAt(index);
          draggingRef.current = true;
          draggedAtRef.current = Date.now();
          event.dataTransfer.effectAllowed = "move";
          try {
            event.dataTransfer.setData("text/plain", String(index));
          } catch (error) {
            /* some webviews reject custom payloads; the index is in state */
          }
        };

        const onDragOver = (event, index) => {
          if (dragIndex === null) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          const at = slotAt(event, index);
          if (at !== dropAt) setDropAt(at);
        };

        const onDrop = (event, index) => {
          if (dragIndex === null) return;
          event.preventDefault();
          api.move(dragIndex, slotAt(event, index));
          setDragIndex(null);
          setDropAt(null);
          draggingRef.current = false;
        };

        const onDragEnd = () => {
          setDragIndex(null);
          setDropAt(null);
          draggingRef.current = false;
        };

        const activate = (item) => {
          // A tab drop may still emit a click on some engines; ignore it.
          if (draggingRef.current || Date.now() - draggedAtRef.current < 300) return;
          api.activate(item.id);
        };

        return h(
          React.Fragment,
          null,
          // Blank chrome above the tabs. DSH's base CSS turns
          // `data-window-drag` into the darwin drag rule; the local CSS also
          // sets app-region directly so Windows/Electron behaves the same.
          h("div", {
            className: "dsh-stab-drag",
            "data-window-drag": "",
            "aria-hidden": "true",
          }),
          h(
            "div",
            { className: "dsh-stab-bar", role: "tablist", "data-dsh-session-tabs": "", "data-window-drag": "", onWheel },
            state.items.map((item, index) => {
              const label = api.labelFor(item.id, list);
              const status = api.statusOf(item.id, list, statusMap);
              const selected = item.id === active;
              const showWorkspace = label.workspace !== "" && label.workspace !== label.task;
              const statusLabel =
                status === "running"
                  ? text.running
                  : status === "queued"
                    ? text.queued
                    : status === "approval"
                      ? text.approval
                      : status === "question"
                        ? text.question
                        : status === "plan-review"
                          ? text.planReview
                          : status === "done"
                            ? text.done
                            : status === null
                              ? ""
                              : text.pending;
              const full = showWorkspace ? label.workspace + " - " + label.task : label.task;
              const dropClass =
                dragIndex === null
                  ? ""
                  : dropAt === index
                    ? " dsh-stab-drop-before"
                    : dropAt === index + 1
                      ? " dsh-stab-drop-after"
                      : "";
              return h(
                "div",
                {
                  key: item.id,
                  role: "tab",
                  tabIndex: 0,
                  draggable: true,
                  "aria-selected": selected,
                  "data-session-id": item.id,
                  "data-status": status === null ? undefined : status,
                  "data-dragging": dragIndex === index ? "true" : undefined,
                  className: "dsh-stab" + dropClass,
                  title: statusLabel === "" ? full : full + " · " + statusLabel,
                  onClick: () => activate(item),
                  onDragStart: (event) => onDragStart(event, index),
                  onDragOver: (event) => onDragOver(event, index),
                  onDrop: (event) => onDrop(event, index),
                  onDragEnd,
                  onAuxClick: (event) => {
                    if (event.button === 1) {
                      event.preventDefault();
                      api.close(item.id);
                    }
                  },
                  onKeyDown: (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      api.activate(item.id);
                    }
                  },
                },
                index > 0 ? h("span", { className: "dsh-stab-divider", "aria-hidden": "true" }) : null,
                h(
                  "span",
                  {
                    className: "dsh-stab-status",
                    "data-status": status === null ? undefined : status,
                    role: status === null ? undefined : "img",
                    "aria-label": status === null ? undefined : statusLabel,
                    title: status === null ? undefined : statusLabel,
                  },
                  status === "running"
                    ? h(
                        "svg",
                        {
                          className: "dsh-stab-spinner",
                          width: 12,
                          height: 12,
                          viewBox: "0 0 24 24",
                          "aria-hidden": "true",
                        },
                        h(
                          "g",
                          { className: "dsh-stab-spinner-motion" },
                          h("circle", { className: "dsh-stab-spinner-track", cx: 12, cy: 12, r: 9.5 }),
                          h("circle", { className: "dsh-stab-spinner-arc", cx: 12, cy: 12, r: 9.5 }),
                        ),
                      )
                    : status === "done"
                      ? h("span", { className: "dsh-stab-dot", "data-kind": "done", "aria-hidden": "true" })
                      : status !== null
                        ? h("span", { className: "dsh-stab-dot", "data-kind": "waiting", "aria-hidden": "true" })
                        : null,
                ),
                h(
                  "span",
                  { className: "dsh-stab-label" },
                  showWorkspace ? h("span", { className: "dsh-stab-ws" }, label.workspace + " - ") : null,
                  h("span", { className: "dsh-stab-task" }, label.task),
                ),
                h(
                  "button",
                  {
                    type: "button",
                    className: "dsh-stab-close",
                    "aria-label": text.close,
                    title: text.close,
                    onClick: (event) => {
                      event.stopPropagation();
                      api.close(item.id);
                    },
                  },
                  "×",
                ),
              );
            }),
          ),
        );
      }

      /** Right-side toasts for completion and waiting transitions. */
      function ToastLayer() {
        const state = React.useSyncExternalStore(api.subscribeTabs, api.getTabs, api.getTabs);
        const list = React.useSyncExternalStore(api.subscribeList, api.getList, api.getList);
        const statusMap = React.useSyncExternalStore(api.subscribeStatus, api.getStatus, api.getStatus);
        React.useSyncExternalStore(api.subscribePanel, api.getActivePanel, api.getActivePanel);
        const items = React.useSyncExternalStore(api.subscribeToasts, api.getToasts, api.getToasts);
        const prefs = React.useSyncExternalStore(api.subscribePrefs, api.getPrefs, api.getPrefs);
        const prevRef = React.useRef(null);
        const queueTimers = React.useRef(new Map());
        const active = api.activeId();

        React.useEffect(() => {
          const timers = queueTimers.current;
          return () => {
            for (const timer of timers.values()) window.clearTimeout(timer);
            timers.clear();
          };
        }, []);

        React.useEffect(() => {
          if (!prefs.enabled) {
            for (const timer of queueTimers.current.values()) window.clearTimeout(timer);
            queueTimers.current.clear();
            return;
          }
          const next = new Map();
          for (const item of state.items) {
            next.set(item.id, {
              status: api.statusOf(item.id, list, statusMap),
              queue: api.queuedCountOf(item.id, list),
              pending: api.pendingKindOf(item.id, statusMap),
            });
          }
          const prev = prevRef.current;
          prevRef.current = next;
          if (prev === null) return;
          for (const [id, now] of next) {
            const before = prev.get(id);
            if (before === undefined) {
              // A tab pinned while its session already waits: one reminder.
              if (id !== active) {
                if (now.pending !== null) api.pushToast(now.pending, id);
                else if (now.status === "done") api.pushToast("done", id);
                else if (now.queue > 0) api.pushToast("queued", id);
              }
              continue;
            }
            // A session that starts blocking on approval / a question / a plan
            // needs the user; a changed kind replaces the previous card.
            if (now.pending !== null && now.pending !== before.pending) api.pushToast(now.pending, id);
            if (now.pending === null && before.pending !== null) {
              const existing = api.getToasts().find((toast) => toast.id === id);
              if (existing !== undefined && existing.kind !== "done" && existing.kind !== "queued") {
                api.dismissToast(id);
              }
            }
            // Queue growth is the reliable signal: a running session keeps its
            // blue dot, so a status transition alone never shows "waiting".
            // Queue messages are auto-drained at the turn boundary. Wait a
            // moment before notifying: a message that starts immediately never
            // produces a misleading "waiting" toast.
            if (now.queue > before.queue && before.status === "running") {
              // Only a message added *behind a turn that is already running*
              // is a real queue. A freshly submitted prompt also appears in the
              // inbox for a moment while the turn boots; that must stay silent.
              const pending = queueTimers.current.get(id);
              if (pending !== undefined) window.clearTimeout(pending);
              const timer = window.setTimeout(() => {
                queueTimers.current.delete(id);
                api.pushToast("queued", id);
              }, 1200);
              queueTimers.current.set(id, timer);
            }
            if (now.queue === 0) {
              const pending = queueTimers.current.get(id);
              if (pending !== undefined) {
                window.clearTimeout(pending);
                queueTimers.current.delete(id);
              }
              const existing = api.getToasts().find((toast) => toast.id === id);
              if (existing !== undefined && existing.kind === "queued") api.dismissToast(id);
            }
            if (now.status === before.status) continue;
            if (now.status === "running") {
              const existing = api.getToasts().find((toast) => toast.id === id);
              if (existing !== undefined && existing.kind === "done") api.dismissToast(id);
              continue;
            }
            if (id === active) {
              if (now.status === "done") api.dismissToast(id);
              continue;
            }
            if (now.status === "done") api.pushToast("done", id);
            else if (now.status === "queued" && before.status !== "queued" && before.queue === 0) {
              api.pushToast("queued", id);
            }
          }
          for (const [id, timer] of queueTimers.current) {
            if (next.has(id)) continue;
            window.clearTimeout(timer);
            queueTimers.current.delete(id);
          }
          for (const toast of api.getToasts()) {
            if (!next.has(toast.id)) api.dismissToast(toast.id);
          }
        }, [state, list, statusMap, active, prefs.enabled]);

        if (!prefs.enabled || items.length === 0) return null;
        return h(
          "div",
          { className: "dsh-stab-toasts", role: "region", "aria-label": text.toastRegion },
          items.slice().reverse().map((toast) => {
            const label = api.labelFor(toast.id, list);
            let title = text.toastPendingTitle;
            let hint = text.toastPendingHint;
            let action = text.toastPendingAction;
            if (toast.kind === "done") {
              title = text.toastDoneTitle;
              hint = null;
              action = text.toastDoneAction;
            } else if (toast.kind === "queued") {
              title = text.toastQueuedTitle;
              hint = text.toastQueuedHint;
              action = text.toastQueuedAction;
            } else if (toast.kind === "approval") {
              title = text.toastApprovalTitle;
              hint = text.toastApprovalHint;
              action = text.toastApprovalAction;
            } else if (toast.kind === "question") {
              title = text.toastQuestionTitle;
              hint = text.toastQuestionHint;
              action = text.toastQuestionAction;
            } else if (toast.kind === "plan-review") {
              title = text.toastPlanTitle;
              hint = text.toastPlanHint;
              action = text.toastPlanAction;
            }
            return h(
              "div",
              { className: "dsh-stab-toast", "data-kind": toast.kind, role: "status", key: toast.id },
              h(
                "div",
                { className: "dsh-stab-toast-head" },
                h("span", { className: "dsh-stab-toast-mark", "aria-hidden": "true" }),
                h("span", { className: "dsh-stab-toast-title" }, title),
                h(
                  "button",
                  {
                    type: "button",
                    className: "dsh-stab-toast-close",
                    title: text.toastDismiss,
                    "aria-label": text.toastDismiss,
                    onClick: () => api.dismissToast(toast.id),
                  },
                  "×",
                ),
              ),
              h("div", { className: "dsh-stab-toast-task" }, label.task),
              label.workspace === "" ? null : h("div", { className: "dsh-stab-toast-workspace" }, label.workspace),
              hint === null ? null : h("div", { className: "dsh-stab-toast-note" }, hint),
              h(
                "div",
                { className: "dsh-stab-toast-foot" },
                h(
                  "button",
                  {
                    type: "button",
                    className: "dsh-stab-toast-action",
                    onClick: () => {
                      api.activate(toast.id);
                      api.dismissToast(toast.id);
                    },
                  },
                  action,
                  h("span", { "aria-hidden": "true" }, "→"),
                ),
              ),
            );
          }),
        );
      }

      /** Settings section for toast preferences (Settings → 会话标签). */
      function SettingsSection() {
        const prefs = React.useSyncExternalStore(api.subscribePrefs, api.getPrefs, api.getPrefs);
        const [draft, setDraft] = React.useState(String(prefs.durationMs));
        const [status, setStatus] = React.useState({ tone: "", message: "" });

        React.useEffect(() => {
          setDraft(String(prefs.durationMs));
        }, [prefs.durationMs]);

        const flash = (tone, message) => setStatus({ tone, message });
        const commitDuration = async () => {
          const parsed = Math.round(Number(draft));
          if (!Number.isFinite(parsed) || parsed < MIN_DURATION || parsed > MAX_DURATION) {
            flash("error", text.settingsInvalid);
            setDraft(String(prefs.durationMs));
            return;
          }
          if (parsed === prefs.durationMs) {
            flash("ok", text.settingsSaved);
            return;
          }
          const ok = await api.savePrefs({ durationMs: parsed });
          flash(ok ? "ok" : "error", ok ? text.settingsSaved : text.settingsFailed);
        };
        const toggle = async () => {
          const ok = await api.savePrefs({ enabled: !prefs.enabled });
          flash(ok ? "ok" : "error", ok ? text.settingsSaved : text.settingsFailed);
        };
        const toggleSound = async () => {
          const next = !prefs.sound;
          const ok = await api.savePrefs({ sound: next });
          if (ok && next) api.previewSound(prefs.tone);
          flash(ok ? "ok" : "error", ok ? text.settingsSaved : text.settingsFailed);
        };
        const changeTone = async (event) => {
          const tone = event.target.value;
          if (!TONES.includes(tone)) return;
          const ok = await api.savePrefs({ tone });
          if (ok) api.previewSound(tone);
          flash(ok ? "ok" : "error", ok ? text.settingsSaved : text.settingsFailed);
        };

        return h(
          "div",
          { className: "dsh-stab-settings" },
          h("div", { className: "dsh-stab-settings-title" }, text.settingsTitle),
          h("div", { className: "dsh-stab-settings-hint" }, text.settingsHint),
          h(
            "div",
            { className: "dsh-stab-settings-group" },
            h(
              "div",
              { className: "dsh-stab-settings-row" },
              h(
                "div",
                { className: "dsh-stab-settings-copy" },
                h("div", { className: "dsh-stab-settings-label" }, text.toastEnabled),
                h("div", { className: "dsh-stab-settings-sub" }, text.toastEnabledHint),
              ),
              h("button", {
                type: "button",
                className: "dsh-stab-switch",
                role: "switch",
                "aria-checked": prefs.enabled,
                "aria-label": text.toastEnabled,
                onClick: toggle,
              }),
            ),
            h(
              "div",
              { className: "dsh-stab-settings-row" },
              h(
                "div",
                { className: "dsh-stab-settings-copy" },
                h("div", { className: "dsh-stab-settings-label" }, text.toastDuration),
                h("div", { className: "dsh-stab-settings-sub" }, text.toastDurationHint),
              ),
              h(
                "div",
                { className: "dsh-stab-duration" },
                h("input", {
                  type: "number",
                  min: MIN_DURATION,
                  max: MAX_DURATION,
                  step: 500,
                  value: draft,
                  disabled: !prefs.enabled,
                  "aria-label": text.toastDuration,
                  onChange: (event) => setDraft(event.target.value),
                  onBlur: commitDuration,
                  onKeyDown: (event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void commitDuration();
                    }
                  },
                }),
                h("span", { className: "dsh-stab-duration-unit" }, "ms"),
              ),
            ),
            h(
              "div",
              { className: "dsh-stab-settings-row" },
              h(
                "div",
                { className: "dsh-stab-settings-copy" },
                h("div", { className: "dsh-stab-settings-label" }, text.soundEnabled),
                h("div", { className: "dsh-stab-settings-sub" }, text.soundEnabledHint),
              ),
              h("button", {
                type: "button",
                className: "dsh-stab-switch",
                role: "switch",
                "aria-checked": prefs.sound,
                "aria-label": text.soundEnabled,
                onClick: toggleSound,
              }),
            ),
            prefs.sound
              ? h(
                  "div",
                  { className: "dsh-stab-settings-row" },
                  h(
                    "div",
                    { className: "dsh-stab-settings-copy" },
                    h("div", { className: "dsh-stab-settings-label" }, text.soundTone),
                    h("div", { className: "dsh-stab-settings-sub" }, text.soundToneHint),
                  ),
                  h(
                    "div",
                    { className: "dsh-stab-sound" },
                    h(
                      "select",
                      {
                        className: "dsh-stab-select",
                        value: prefs.tone,
                        "aria-label": text.soundTone,
                        onChange: changeTone,
                      },
                      TONES.map((tone) =>
                        h(
                          "option",
                          { value: tone, key: tone },
                          { chime: text.soundChime, soft: text.soundSoft, marimba: text.soundMarimba, drop: text.soundDrop }[tone],
                        ),
                      ),
                    ),
                    h(
                      "button",
                      {
                        type: "button",
                        className: "dsh-stab-preview",
                        onClick: () => api.previewSound(prefs.tone),
                      },
                      text.soundPreview,
                    ),
                  ),
                )
              : null,
          ),
          h(
            "div",
            {
              className: "dsh-stab-settings-status",
              "data-tone": status.tone === "" ? undefined : status.tone,
              role: "status",
              "aria-live": "polite",
            },
            status.message,
          ),
        );
      }

      let root = null;
      let host = null;
      let toastRoot = null;
      let toastHost = null;
      let observer = null;

      function cleanup() {
        disposed = true;
        if (pushTimer !== null) {
          clearTimeout(pushTimer);
          pushTimer = null;
        }
        document.removeEventListener("click", onDocumentClick, false);
        unsubscribeList();
        if (observer !== null) {
          observer.disconnect();
          observer = null;
        }
        if (root !== null) {
          try {
            root.unmount();
          } catch (error) {
            console.warn("[session-tabs] unmount failed", String(error));
          }
          root = null;
        }
        if (host !== null) {
          host.remove();
          host = null;
        }
        if (toastRoot !== null) {
          try {
            toastRoot.unmount();
          } catch (error) {
            console.warn("[session-tabs] toast unmount failed", String(error));
          }
          toastRoot = null;
        }
        if (toastHost !== null) {
          toastHost.remove();
          toastHost = null;
        }
        if (disposeSettings !== null) {
          try {
            disposeSettings();
          } catch (error) {
            console.warn("[session-tabs] settings dispose failed", String(error));
          }
          disposeSettings = null;
        }
        if (window[GLOBAL_DISPOSE] === cleanup) delete window[GLOBAL_DISPOSE];
      }

      // A hot reload can run apply again before (or after) the old generation
      // disposes; collapse the previous instance first so the strip never doubles.
      const previousDispose = window[GLOBAL_DISPOSE];
      if (typeof previousDispose === "function") {
        try {
          previousDispose();
        } catch (error) {
          console.warn("[session-tabs] previous instance cleanup failed", String(error));
        }
      }
      window[GLOBAL_DISPOSE] = cleanup;

      ctx.effect(() => {
        ensureStyle();

        const mount = () => {
          if (disposed || host !== null) return true;
          const center = findCenterColumn();
          if (center === null) return false;
          host = document.createElement("div");
          host.className = "dsh-stab-host";
          host.setAttribute("data-dsh-session-tabs-host", "");
          center.insertBefore(host, center.firstChild);
          root = createRoot(host);
          root.render(h(TabStrip));
          toastHost = document.createElement("div");
          toastHost.className = "dsh-stab-toast-host";
          toastHost.setAttribute("data-dsh-session-tabs-toasts", "");
          document.body.appendChild(toastHost);
          toastRoot = createRoot(toastHost);
          toastRoot.render(h(ToastLayer));
          console.info("[session-tabs] tab strip mounted");
          return true;
        };

        if (!mount()) {
          observer = new MutationObserver(() => {
            if (disposed) return;
            if (mount() && observer !== null) {
              observer.disconnect();
              observer = null;
            }
          });
          observer.observe(document.documentElement, { childList: true, subtree: true });
        }

        // Seed the current main-view session once the catalog settles.
        const seed = () => {
          if (disposed) return;
          const list = listSnapshot();
          if (list.phase !== "ready") return;
          const main = currentMainId();
          if (main !== null && !isBlank(list, main)) {
            lastMainId = main;
            addTab(main, false);
            if (snapshot.lastActiveId === null) setSnapshot({ items: snapshot.items, lastActiveId: main });
          }
        };
        seed();
        const seedTimer = window.setTimeout(seed, 1500);

        return () => {
          window.clearTimeout(seedTimer);
          cleanup();
        };
      }, "session-tabs: tab strip");
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
