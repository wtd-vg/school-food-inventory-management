import { useEffect, useState } from "react";

type ApiResponse = {
  message: string;
  database: string;
};

export function App() {
  // Ban đầu giao diện cho người dùng biết ứng dụng đang gọi backend.
  const [status, setStatus] = useState("Đang kết nối...");

  useEffect(() => {
    // Vite chuyển /api sang Django theo cấu hình trong vite.config.ts.
    fetch("/api/hello/")
      .then((response) => {
        if (!response.ok) throw new Error("Backend trả về lỗi.");
        return response.json() as Promise<ApiResponse>;
      })
      .then((data) => setStatus(`${data.message} ${data.database}`))
      .catch(() => setStatus("Chưa kết nối được backend hoặc database."));
  }, []);

  return (
    <main className="page">
      <h1>SchoolFood</h1>
      <p>Khung cơ bản để team bắt đầu phát triển.</p>
      <section className="status-card">
        <strong>Trạng thái:</strong>
        <p>{status}</p>
      </section>
    </main>
  );
}
