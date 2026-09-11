/**
 * REST API client for supplementary endpoints:
 * System health, evaluation metrics, video upload, and diagnostics.
 */

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

export async function fetchBackendHealth() {
  try {
    const res = await fetch(`${BASE_URL}/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    return { status: 'offline', error: err.message };
  }
}

export async function fetchEvaluationMetrics() {
  try {
    const res = await fetch(`${BASE_URL}/api/evaluation`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (_err) {
    return null;
  }
}

export async function uploadEvaluationVideo(file) {
  const formData = new FormData();
  formData.append('video', file);
  
  const res = await fetch(`${BASE_URL}/api/evaluate-video`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) throw new Error(`Failed to upload: HTTP ${res.status}`);
  return await res.json();
}

