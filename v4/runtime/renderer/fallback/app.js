'use strict';

const api = window.winBridgeApi;
const byId = (id) => document.getElementById(id);
const terminalLines = [];

function appendLog(line) {
  terminalLines.push(line);
  if (terminalLines.length > 240) terminalLines.splice(0, terminalLines.length - 240);
  byId('terminal').textContent = terminalLines.join('\n');
}

async function invoke(action) {
  try { return await action(); }
  catch (error) { appendLog(`[error] ${error.message}`); throw error; }
}

if (!api) {
  byId('runtimeStatus').textContent = 'Runtime bridge 不存在；本页未获得任何 Node 或 IPC 能力。';
  document.querySelectorAll('button').forEach((button) => { button.disabled = true; });
} else {
  api.getAppInfo().then((info) => {
    byId('runtimeStatus').textContent = `Runtime 已连接 · ${info.version} · Electron ${info.electron}`;
  }).catch((error) => { byId('runtimeStatus').textContent = error.message; });

  api.onEngineEvent((event) => {
    byId('stage').textContent = event.presentedStageState;
    byId('percentage').textContent = `${Math.floor(event.displayedProgress)}%`;
    byId('bar').style.width = `${event.displayedProgress}%`;
    appendLog(`[${event.kind}] ${event.message}`);
  });
  api.onLogBatch((batch) => {
    if (batch.droppedBeforeBatch) appendLog(`[backpressure] dropped ${batch.droppedBeforeBatch} old entries`);
    batch.entries.forEach((entry) => appendLog(`[${entry.level}] ${entry.category}: ${entry.message}`));
  });

  byId('diagnose').addEventListener('click', () => invoke(() => api.runDiagnosis()).then((report) => {
    byId('report').textContent = JSON.stringify(report, null, 2);
  }).catch(() => {}));
  byId('cancel').addEventListener('click', () => invoke(() => api.cancelOperation()).catch(() => {}));
  byId('refresh').addEventListener('click', () => invoke(() => api.refreshSystemProfile()).then((profile) => {
    appendLog(`[system] refreshed ${profile.detectedAt}`);
  }).catch(() => {}));
  byId('logs').addEventListener('click', () => invoke(() => api.openLogs()).catch(() => {}));
  byId('gpt').addEventListener('click', () => invoke(() => api.openGPT()).catch(() => {}));
}
