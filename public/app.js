// CareerPilot TrackFlow Frontend Application Logic
const API_BASE = window.location.origin.includes('localhost') ? '/api' : '';

let allApplications = [];

document.addEventListener('DOMContentLoaded', () => {
  fetchApplications();

  document.getElementById('refreshBtn').addEventListener('click', fetchApplications);
  document.getElementById('searchInput').addEventListener('input', renderTable);
  document.getElementById('statusFilter').addEventListener('change', renderTable);
});

async function fetchApplications() {
  try {
    const res = await fetch(`${API_BASE}/applications`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    allApplications = data.applications || [];
    renderDashboard();
  } catch (err) {
    console.error('Failed to fetch applications:', err);
    document.getElementById('appTableBody').innerHTML = 
      `<tr><td colspan="7" class="empty-state">Error loading applications: ${err.message}</td></tr>`;
  }
}

function renderDashboard() {
  renderKPIs();
  renderFollowUpQueue();
  renderTable();
}

function renderKPIs() {
  const total = allApplications.length;
  const followUps = allApplications.filter(a => a.followUpEligible && a.followUpStatus !== 'SENT' && a.followUpStatus !== 'DISMISSED').length;
  const oas = allApplications.filter(a => a.status === 'OA_RECEIVED').length;
  const interviews = allApplications.filter(a => a.status === 'INTERVIEW').length;

  document.getElementById('kpiTotal').textContent = total;
  document.getElementById('kpiFollowUps').textContent = followUps;
  document.getElementById('kpiOas').textContent = oas;
  document.getElementById('kpiInterviews').textContent = interviews;
}

function renderFollowUpQueue() {
  const container = document.getElementById('followUpList');
  const badge = document.getElementById('followUpCountBadge');
  
  const eligibleApps = allApplications.filter(a => a.followUpEligible && a.followUpStatus !== 'SENT' && a.followUpStatus !== 'DISMISSED');
  
  badge.textContent = `${eligibleApps.length} Pending`;

  if (eligibleApps.length === 0) {
    container.innerHTML = `<div class="empty-state">🎉 All follow-up tasks completed! No applications currently require a follow-up email.</div>`;
    return;
  }

  container.innerHTML = eligibleApps.map(app => {
    const subject = app.followUpDraft ? app.followUpDraft.subject : `Following Up: ${app.role} Application - ${app.company}`;
    const body = app.followUpDraft ? app.followUpDraft.body : `Dear Hiring Team,\n\nI hope this email finds you well. I am following up on my application for the ${app.role} position at ${app.company}.\n\nBest regards,\nCandidate`;

    return `
      <div class="follow-up-card" data-id="${app.applicationId}">
        <div class="follow-up-card-header">
          <div class="follow-up-title">
            <h3>${escapeHtml(app.company)} — ${escapeHtml(app.role)}</h3>
            <p>Reason: ${escapeHtml(app.followUpReason || 'Waiting threshold passed')}</p>
          </div>
          <span class="status-pill status-${app.status}">${app.status}</span>
        </div>

        <div class="draft-box">
          <div class="draft-field">
            <label>Subject Line</label>
            <input type="text" class="draft-input input-subject" value="${escapeHtml(subject)}">
          </div>
          <div class="draft-field">
            <label>Draft Body (Editable)</label>
            <textarea class="draft-textarea textarea-body">${escapeHtml(body)}</textarea>
          </div>
        </div>

        <div class="card-actions">
          <button class="btn btn-primary btn-copy" onclick="copyDraft('${app.applicationId}')">📋 Copy Draft</button>
          <button class="btn btn-success btn-sent" onclick="markAsSent('${app.applicationId}')">✅ Mark as Sent</button>
          <button class="btn btn-danger btn-dismiss" onclick="dismissFollowUp('${app.applicationId}')">🗑️ Dismiss</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderTable() {
  const tbody = document.getElementById('appTableBody');
  const search = document.getElementById('searchInput').value.toLowerCase().trim();
  const filter = document.getElementById('statusFilter').value;

  const filtered = allApplications.filter(app => {
    const matchesSearch = app.company.toLowerCase().includes(search) || app.role.toLowerCase().includes(search);
    const matchesStatus = filter === 'ALL' || app.status === filter;
    return matchesSearch && matchesStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No matching applications found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(app => {
    const lastActive = app.lastActivityAt ? new Date(app.lastActivityAt).toLocaleDateString() : 'N/A';
    const deadlineStr = app.deadline ? new Date(app.deadline).toLocaleDateString() : '—';
    const eventStr = app.eventDate ? new Date(app.eventDate).toLocaleDateString() : '—';

    let followUpBadge = '<span style="color: var(--text-muted);">None</span>';
    if (app.followUpStatus === 'SENT') {
      followUpBadge = '<span style="color: var(--color-success); font-weight: 600;">✓ Sent</span>';
    } else if (app.followUpStatus === 'DISMISSED') {
      followUpBadge = '<span style="color: var(--text-muted);">Dismissed</span>';
    } else if (app.followUpEligible) {
      followUpBadge = '<span style="color: var(--color-warning); font-weight: 600;">⚠️ Follow-up Due</span>';
    }

    return `
      <tr>
        <td><strong>${escapeHtml(app.company)}</strong></td>
        <td>${escapeHtml(app.role)}</td>
        <td><span class="status-pill status-${app.status}">${app.status}</span></td>
        <td>${lastActive}</td>
        <td>${deadlineStr}</td>
        <td>${eventStr}</td>
        <td>${followUpBadge}</td>
      </tr>
    `;
  }).join('');
}

async function copyDraft(appId) {
  const card = document.querySelector(`.follow-up-card[data-id="${appId}"]`);
  if (!card) return;

  const subject = card.querySelector('.input-subject').value;
  const body = card.querySelector('.textarea-body').value;

  const textToCopy = `Subject: ${subject}\n\n${body}`;

  try {
    await navigator.clipboard.writeText(textToCopy);
    showToast('Draft copied to clipboard!');
  } catch {
    showToast('Failed to copy to clipboard');
  }

  // Also silently save updated draft text to DB if user edited
  await saveDraftEdit(appId, subject, body);
}

async function saveDraftEdit(appId, subject, body) {
  try {
    await fetch(`${API_BASE}/applications/${appId}/follow-up`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'UPDATE_DRAFT',
        draft: { subject, body }
      })
    });
  } catch (err) {
    console.warn('Could not auto-save draft edit:', err);
  }
}

async function markAsSent(appId) {
  try {
    const card = document.querySelector(`.follow-up-card[data-id="${appId}"]`);
    const subject = card ? card.querySelector('.input-subject').value : '';
    const body = card ? card.querySelector('.textarea-body').value : '';

    const res = await fetch(`${API_BASE}/applications/${appId}/follow-up`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'MARK_SENT',
        draft: { subject, body }
      })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    showToast('Marked as sent in DynamoDB!');
    await fetchApplications();
  } catch (err) {
    alert('Failed to update follow-up status: ' + err.message);
  }
}

async function dismissFollowUp(appId) {
  try {
    const res = await fetch(`${API_BASE}/applications/${appId}/follow-up`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'DISMISS' })
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    showToast('Follow-up draft dismissed');
    await fetchApplications();
  } catch (err) {
    alert('Failed to dismiss follow-up: ' + err.message);
  }
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
