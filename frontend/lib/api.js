let apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

if (!apiBaseUrl && typeof window !== 'undefined') {
  // 브라우저 환경에서 명시적인 API 주소가 없는 경우, 현재 접속한 호스트명에 백엔드 포트(8500)를 연결합니다.
  apiBaseUrl = `${window.location.protocol}//${window.location.hostname}:8500/api`;
} else if (!apiBaseUrl) {
  apiBaseUrl = 'http://127.0.0.1:8500/api';
}

const API_BASE = apiBaseUrl;


export async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `API request failed: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

export { API_BASE };
