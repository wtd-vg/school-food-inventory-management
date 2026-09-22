import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Lấy URL từ biến môi trường Docker, nếu chạy local thì mới tự dùng http://127.0.0.1:8000
const backendUrl = process.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: backendUrl,
        changeOrigin: true,
      },
    },
  },
})