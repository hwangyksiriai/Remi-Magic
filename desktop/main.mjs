import { app, BrowserWindow, Menu, Tray, ipcMain, screen, nativeImage, powerMonitor, session } from 'electron';
import { mkdirSync } from 'node:fs';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CompanionScheduler, DEFAULT_SETTINGS, validateSettings, workAreaBounds } from './scheduler.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const smokeMode = process.argv.includes('--smoke-test');
if (smokeMode) {
  const profile = join(root, 'artifacts', 'smoke-profile');
  mkdirSync(profile, { recursive: true });
  app.setPath('userData', profile);
}
const names = { random: '무작위', remi: '도레미', hazuki: '장메이', aiko: '유사랑', onpu: '진보라', momoko: '나모모' };
let settings = { ...DEFAULT_SETTINGS };
let scheduler;
let tray;
let controls;
let quitting = false;
let savedForQuit = false;
let saveQueue = Promise.resolve();
const overlays = new Map();
const suspendedReasons = new Set();
let activeWindow = null;
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();
app.setName('Remi Magic Desktop');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const settingsFile = () => join(app.getPath('userData'), 'companion-settings.json');

function lockNavigation(window) {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
}

function broadcastSettings() {
  for (const window of [...overlays.values(), controls]) {
    if (window && !window.isDestroyed()) window.webContents.send('companion:settings', settings);
  }
}

function setSettings(patch) {
  settings = validateSettings({ ...settings, ...(patch && typeof patch === 'object' ? patch : {}) });
  scheduler.update(settings);
  broadcastSettings();
  refreshTray();
  const snapshot = JSON.stringify(settings, null, 2);
  saveQueue = saveQueue.then(async () => {
    await mkdir(dirname(settingsFile()), { recursive: true });
    const temporary = `${settingsFile()}.tmp`;
    await writeFile(temporary, snapshot, 'utf8');
    await rename(temporary, settingsFile());
  }).catch((error) => console.error('설정을 저장하지 못했습니다:', error.message));
  return settings;
}

function createOverlay(display) {
  const window = new BrowserWindow({
    ...workAreaBounds(display), show: false, transparent: true, frame: false,
    resizable: false, movable: false, minimizable: false, maximizable: false,
    hasShadow: false, focusable: false, skipTaskbar: true, backgroundColor: '#00000000',
    webPreferences: { preload: join(root, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false, offscreen: smokeMode },
  });
  window.setAlwaysOnTop(true, 'floating');
  window.setIgnoreMouseEvents(true, { forward: true });
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  lockNavigation(window);
  window.loadFile(join(root, 'dist', 'overlay.html'));
  window.on('closed', () => overlays.delete(display.id));
  window.webContents.on('render-process-gone', () => {
    if (activeWindow === window) scheduler?.stopScene('renderer-stopped');
  });
  overlays.set(display.id, window);
  return window;
}

function syncDisplays() {
  scheduler?.stopScene('display-change');
  const displays = screen.getAllDisplays();
  const validIds = new Set(displays.map((display) => display.id));
  for (const [id, window] of overlays) if (!validIds.has(id)) window.destroy();
  for (const display of displays) {
    const window = overlays.get(display.id);
    if (window) window.setBounds(workAreaBounds(display));
    else createOverlay(display);
  }
  scheduler?.schedule();
}

function startScene(scene) {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const window = overlays.get(display.id) || overlays.values().next().value;
  if (!window || window.isDestroyed()) return;
  const reveal = () => {
    if (scheduler.active?.id !== scene.id || window.isDestroyed()) return;
    activeWindow = window;
    window.webContents.send('companion:scene', scene);
    if (!smokeMode) window.showInactive();
  };
  if (window.webContents.isLoading()) window.webContents.once('did-finish-load', reveal);
  else reveal();
}

function endScene() {
  for (const window of overlays.values()) {
    if (!window.isDestroyed()) { window.webContents.send('companion:scene', null); window.hide(); }
  }
  activeWindow = null;
}

function openControls() {
  if (controls && !controls.isDestroyed()) { controls.show(); controls.focus(); return; }
  const availableHeight = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea.height;
  const height = Math.min(880, availableHeight - 40);
  controls = new BrowserWindow({ width: 570, height, minWidth: 480, minHeight: Math.min(620, height), show: !smokeMode, title: '레미의 바탕화면 마법', autoHideMenuBar: true, backgroundColor: '#fff6fc', webPreferences: { preload: join(root, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, offscreen: smokeMode } });
  lockNavigation(controls);
  controls.loadFile(join(root, 'dist', 'controls.html'));
  controls.on('close', (event) => { if (!quitting) { event.preventDefault(); controls.hide(); } });
  controls.on('closed', () => { controls = null; });
}

function refreshTray() {
  if (!tray) return;
  tray.setToolTip(`레미의 바탕화면 마법 · ${settings.enabled ? '가끔 등장 중' : '자동 등장 일시정지'}`);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '설정 열기', click: openControls },
    { type: 'separator' },
    { label: '지금 산책하기', click: () => scheduler.show('walk') },
    { label: '다섯 명 함께 마법', click: () => scheduler.show('group') },
    { label: '지금 변신하기', click: () => scheduler.show('transform') },
    { label: '지금 숨기기', click: () => { scheduler.stopScene('hidden'); scheduler.schedule(); } },
    { type: 'separator' },
    { label: '자동 등장', type: 'checkbox', checked: settings.enabled, click: (item) => setSettings({ enabled: item.checked }) },
    { label: '등장 빈도', submenu: [['often', '30~60초'], ['normal', '1~3분'], ['quiet', '3~6분']].map(([frequency, label]) => ({ label, type: 'radio', checked: settings.frequency === frequency, click: () => setSettings({ frequency }) })) },
    { label: '캐릭터', submenu: Object.entries(names).map(([character, label]) => ({ label, type: 'radio', checked: settings.character === character, click: () => setSettings({ character }) })) },
    { label: '움직임 줄이기', type: 'checkbox', checked: settings.reducedMotion, click: (item) => setSettings({ reducedMotion: item.checked }) },
    { type: 'separator' },
    { label: '종료', click: () => app.quit() },
  ]));
}

function controlSender(event) { return controls && !controls.isDestroyed() && event.sender === controls.webContents; }
function knownSender(event) { return controlSender(event) || [...overlays.values()].some((window) => !window.isDestroyed() && event.sender === window.webContents); }

if (singleInstance) {
  app.on('second-instance', () => openControls());
  app.whenReady().then(async () => {
    try { settings = validateSettings(JSON.parse(await readFile(settingsFile(), 'utf8'))); } catch { settings = { ...DEFAULT_SETTINGS }; }
    // Local code and generated media only: no renderer network or permission grants.
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: !/^(file|data|blob):/.test(details.url) }));
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    scheduler = new CompanionScheduler({ settings, onStart: startScene, onEnd: endScene });
    syncDisplays();
    const icon = nativeImage.createFromPath(join(root, 'dist', 'tray.png'));
    if (!smokeMode) { tray = new Tray(icon); tray.on('click', openControls); }
    refreshTray();
    ipcMain.handle('companion:get-settings', (event) => { if (!knownSender(event)) throw new Error('Unknown renderer'); return settings; });
    ipcMain.handle('companion:set-settings', (event, patch) => { if (!controlSender(event)) throw new Error('Controls only'); return setSettings(patch); });
    ipcMain.handle('companion:show', (event, mode) => { if (!controlSender(event)) throw new Error('Controls only'); scheduler.show(mode); return true; });
    ipcMain.handle('companion:hide', (event) => { if (!controlSender(event)) throw new Error('Controls only'); scheduler.stopScene('hidden'); scheduler.schedule(); return true; });
    ipcMain.handle('companion:quit', (event) => { if (!controlSender(event)) throw new Error('Controls only'); app.quit(); });
    screen.on('display-added', syncDisplays);
    screen.on('display-removed', syncDisplays);
    screen.on('display-metrics-changed', syncDisplays);
    const suspend = (reason) => { suspendedReasons.add(reason); scheduler.suspend(); };
    const resume = (reason) => { suspendedReasons.delete(reason); if (!suspendedReasons.size) scheduler.resume(); };
    powerMonitor.on('lock-screen', () => suspend('locked'));
    powerMonitor.on('suspend', () => suspend('sleeping'));
    powerMonitor.on('unlock-screen', () => resume('locked'));
    powerMonitor.on('resume', () => resume('sleeping'));
    openControls();
    scheduler.start();
    if (smokeMode) {
      const { runSmoke } = await import('./smoke.mjs');
      try {
        await runSmoke({ controls, overlays, scheduler, screen, directory: join(root, 'artifacts') });
        await saveQueue;
        console.log('DESKTOP_SMOKE_PASS');
        app.quit();
      } catch (error) {
        console.error('DESKTOP_SMOKE_FAIL', error);
        scheduler.destroy();
        app.exit(1);
      }
    }
  }).catch((error) => { console.error(error); app.quit(); });
  app.on('window-all-closed', () => {});
  app.on('before-quit', (event) => {
    quitting = true;
    scheduler?.destroy();
    if (tray && !tray.isDestroyed()) tray.destroy();
    if (!savedForQuit) {
      event.preventDefault();
      saveQueue.finally(() => { savedForQuit = true; app.quit(); });
    }
  });
  app.on('activate', openControls);
}
