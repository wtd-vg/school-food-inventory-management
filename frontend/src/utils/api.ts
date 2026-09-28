export function getCookie(name: string): string {
  let cookieValue = '';
  if (document.cookie && document.cookie !== '') {
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (cookie.substring(0, name.length + 1) === (name + '=')) {
        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
        break;
      }
    }
  }
  return cookieValue;
}

export async function fetchApi(url: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('X-CSRFToken', getCookie('csrftoken'));
  headers.set('Content-Type', 'application/json');

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Bắt buộc để gửi kèm session cookie
  });

  if (response.status === 401) {
    // Hết session hoặc chưa đăng nhập, phát sự kiện để App.tsx bắt và chuyển về login
    window.dispatchEvent(new Event('session-expired'));
  }

  return response;
}