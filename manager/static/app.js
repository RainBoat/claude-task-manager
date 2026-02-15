/* === Claude Parallel Dev — Frontend === */

const API = '';
let currentPlanTaskId = null;
let logWebSocket = null;

// ============================================================
// Polling
// ============================================================

async function fetchTasks() {
    try {
        const res = await fetch(`${API}/api/tasks`);
        const tasks = await res.json();
        renderTasks(tasks);
        document.getElementById('task-count').textContent = tasks.length;
    } catch (e) {
        console.error('Failed to fetch tasks:', e);
    }
}

async function fetchWorkers() {
    try {
        const res = await fetch(`${API}/api/workers`);
        const workers = await res.json();
        renderWorkers(workers);
        document.getElementById('worker-count').textContent = workers.length;
    } catch (e) {
        console.error('Failed to fetch workers:', e);
    }
}

function startPolling() {
    fetchTasks();
    fetchWorkers();
    setInterval(fetchTasks, 5000);
    setInterval(fetchWorkers, 5000);
}

// ============================================================
// Render
// ============================================================

const STATUS_COLORS = {
    pending: '#6b7280',
    claimed: '#f59e0b',
    running: '#3b82f6',
    plan_pending: '#a855f7',
    plan_approved: '#8b5cf6',
    merging: '#f97316',
    testing: '#06b6d4',
    completed: '#22c55e',
    failed: '#ef4444',
};

function renderTasks(tasks) {
    const list = document.getElementById('task-list');
    if (!tasks.length) {
        list.innerHTML = '<div class="empty">No tasks in queue</div>';
        return;
    }

    list.innerHTML = tasks.map(t => `
        <div class="task-card" data-status="${t.status}">
            <div class="task-header">
                <span class="task-status" style="background:${STATUS_COLORS[t.status] || '#6b7280'}">${t.status}</span>
                <span class="task-id">#${t.id}</span>
                ${t.priority > 0 ? `<span class="task-priority">P${t.priority}</span>` : ''}
            </div>
            <div class="task-title">${esc(t.title)}</div>
            <div class="task-desc">${esc(t.description).substring(0, 120)}</div>
            <div class="task-meta">
                ${t.worker_id ? `<span>Worker: ${t.worker_id}</span>` : ''}
                ${t.branch ? `<span>Branch: ${t.branch}</span>` : ''}
                ${t.commit_id ? `<span>Commit: ${t.commit_id.substring(0, 8)}</span>` : ''}
            </div>
            <div class="task-actions">
                ${t.status === 'pending' ? `<button class="btn btn-sm btn-plan" onclick="generatePlan('${t.id}')">Generate Plan</button>` : ''}
                ${t.status === 'plan_pending' ? `<button class="btn btn-sm btn-plan" onclick="showPlanModal('${t.id}')">Review Plan</button>` : ''}
                ${['pending','plan_pending','plan_approved','failed'].includes(t.status) ? `<button class="btn btn-sm btn-danger" onclick="deleteTask('${t.id}')">Delete</button>` : ''}
            </div>
            ${t.error ? `<div class="task-error">Error: ${esc(t.error)}</div>` : ''}
        </div>
    `).join('');
}

function renderWorkers(workers) {
    const list = document.getElementById('worker-list');
    if (!workers.length) {
        list.innerHTML = '<div class="empty">No workers registered</div>';
        return;
    }

    list.innerHTML = workers.map(w => `
        <div class="worker-card" data-status="${w.status}">
            <div class="worker-header">
                <span class="worker-name">${w.id}</span>
                <span class="worker-status status-${w.status}">${w.status}</span>
            </div>
            ${w.current_task_title ? `<div class="worker-task">Task: ${esc(w.current_task_title)} (#${w.current_task_id})</div>` : ''}
            <div class="worker-meta">
                <span>Completed: ${w.tasks_completed}</span>
                ${w.pid ? `<span>PID: ${w.pid}</span>` : ''}
            </div>
            <div class="worker-actions">
                <button class="btn btn-sm" onclick="openLogModal('${w.id}')">Logs</button>
                <button class="btn btn-sm btn-warning" onclick="restartWorker('${w.id}')">Restart</button>
            </div>
        </div>
    `).join('');
}

function esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

// ============================================================
// Task Actions
// ============================================================

document.getElementById('task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = document.getElementById('task-title').value.trim();
    const desc = document.getElementById('task-desc').value.trim();
    const priority = parseInt(document.getElementById('task-priority').value);

    if (!title || !desc) return;

    try {
        await fetch(`${API}/api/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, description: desc, priority }),
        });
        document.getElementById('task-title').value = '';
        document.getElementById('task-desc').value = '';
        fetchTasks();
    } catch (e) {
        alert('Failed to add task: ' + e.message);
    }
});

async function deleteTask(id) {
    if (!confirm('Delete this task?')) return;
    await fetch(`${API}/api/tasks/${id}`, { method: 'DELETE' });
    fetchTasks();
}

// ============================================================
// Worker Actions
// ============================================================

async function restartWorker(id) {
    if (!confirm(`Restart ${id}?`)) return;
    await fetch(`${API}/api/workers/${id}/restart`, { method: 'POST' });
    fetchWorkers();
}

// ============================================================
// Plan Mode
// ============================================================

async function generatePlan(taskId) {
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = 'Generating...';

    try {
        const res = await fetch(`${API}/api/plan/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ task_id: taskId }),
        });
        const data = await res.json();
        if (res.ok) {
            showPlanModal(taskId, data.plan);
        } else {
            alert('Plan generation failed: ' + (data.error || 'unknown'));
        }
    } catch (e) {
        alert('Error: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Generate Plan';
        fetchTasks();
    }
}

async function showPlanModal(taskId, planText) {
    currentPlanTaskId = taskId;

    if (!planText) {
        const res = await fetch(`${API}/api/tasks/${taskId}`);
        const task = await res.json();
        planText = task.plan || 'No plan generated yet.';
        document.getElementById('plan-task-info').innerHTML =
            `<strong>${esc(task.title)}</strong> <span class="task-id">#${task.id}</span>`;
    } else {
        document.getElementById('plan-task-info').innerHTML = `<span class="task-id">#${taskId}</span>`;
    }

    document.getElementById('plan-content').innerHTML = formatPlan(planText);
    document.getElementById('plan-modal').classList.remove('hidden');
}

function closePlanModal() {
    document.getElementById('plan-modal').classList.add('hidden');
    currentPlanTaskId = null;
}

async function approvePlan(approved) {
    if (!currentPlanTaskId) return;

    let feedback = null;
    if (!approved) {
        feedback = prompt('Rejection reason (optional):');
    }

    await fetch(`${API}/api/plan/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: currentPlanTaskId, approved, feedback }),
    });

    closePlanModal();
    fetchTasks();
}

function formatPlan(text) {
    // Basic markdown-like rendering
    return text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/^### (.+)$/gm, '<h4>$1</h4>')
        .replace(/^## (.+)$/gm, '<h3>$1</h3>')
        .replace(/^# (.+)$/gm, '<h2>$1</h2>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        .replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>')
        .replace(/\n/g, '<br>');
}

// ============================================================
// Log Viewer
// ============================================================

function openLogModal(workerId) {
    document.getElementById('log-worker-name').textContent = workerId;
    document.getElementById('log-output').innerHTML = '<div class="empty">Connecting...</div>';
    document.getElementById('log-modal').classList.remove('hidden');

    // Close existing WebSocket
    if (logWebSocket) {
        logWebSocket.close();
    }

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    logWebSocket = new WebSocket(`${proto}//${location.host}/ws/logs/${workerId}`);

    logWebSocket.onopen = () => {
        document.getElementById('log-output').innerHTML = '';
    };

    logWebSocket.onmessage = (e) => {
        const event = JSON.parse(e.data);
        appendLogEvent(event);
    };

    logWebSocket.onerror = () => {
        appendLogEvent({ type: 'error', error: 'WebSocket connection error' });
    };

    logWebSocket.onclose = () => {
        appendLogEvent({ type: 'system', text: '--- Connection closed ---' });
    };
}

function closeLogModal() {
    document.getElementById('log-modal').classList.add('hidden');
    if (logWebSocket) {
        logWebSocket.close();
        logWebSocket = null;
    }
}

function appendLogEvent(event) {
    const output = document.getElementById('log-output');
    const div = document.createElement('div');
    div.className = `log-event log-${event.type}`;

    if (event.type === 'assistant' && event.text) {
        div.textContent = event.text;
    } else if (event.type === 'assistant' && event.tool_uses) {
        div.innerHTML = event.tool_uses.map(t =>
            `<span class="log-tool">[${esc(t.tool)}]</span> ${esc(t.input_preview)}`
        ).join('<br>');
    } else if (event.type === 'result') {
        div.innerHTML = `<span class="log-result">Done</span> Cost: $${event.cost || '?'} | Turns: ${event.turns || '?'}`;
    } else if (event.type === 'error') {
        div.textContent = `ERROR: ${event.error}`;
    } else if (event.type === 'system') {
        div.textContent = event.text;
    } else if (event.type === 'raw') {
        div.textContent = event.text;
    }

    output.appendChild(div);
    output.scrollTop = output.scrollHeight;
}

// ============================================================
// Voice Input (Web Speech API)
// ============================================================

const voiceBtn = document.getElementById('voice-btn');
const voiceStatus = document.getElementById('voice-status');
let recognition = null;
let isListening = false;

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'zh-CN'; // Default to Chinese, toggle with click

    let currentLang = 'zh-CN';

    recognition.onstart = () => {
        isListening = true;
        voiceBtn.classList.add('listening');
        voiceStatus.classList.remove('hidden');
        voiceStatus.textContent = `Listening (${currentLang})...`;
    };

    recognition.onresult = (e) => {
        const transcript = Array.from(e.results)
            .map(r => r[0].transcript)
            .join('');
        document.getElementById('task-desc').value = transcript;
        voiceStatus.textContent = transcript;
    };

    recognition.onend = () => {
        isListening = false;
        voiceBtn.classList.remove('listening');
        setTimeout(() => voiceStatus.classList.add('hidden'), 2000);
    };

    recognition.onerror = (e) => {
        voiceStatus.textContent = `Error: ${e.error}`;
        isListening = false;
        voiceBtn.classList.remove('listening');
    };

    voiceBtn.addEventListener('click', () => {
        if (isListening) {
            recognition.stop();
        } else {
            recognition.start();
        }
    });

    // Right-click to toggle language
    voiceBtn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        currentLang = currentLang === 'zh-CN' ? 'en-US' : 'zh-CN';
        recognition.lang = currentLang;
        voiceStatus.classList.remove('hidden');
        voiceStatus.textContent = `Language: ${currentLang}`;
        setTimeout(() => voiceStatus.classList.add('hidden'), 1500);
    });
} else {
    voiceBtn.title = 'Speech recognition not supported in this browser';
    voiceBtn.style.opacity = '0.3';
}

// ============================================================
// Init
// ============================================================

startPolling();
