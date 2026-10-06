import { Link } from 'react-router-dom';
import { EmptyState, PageHeader } from '../../components/ui';

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Không tìm thấy trang" />
      <EmptyState title="Đường dẫn này không tồn tại" action={<Link to="/kho">Về trang Kho hàng</Link>}>
        Có thể trang đã được đổi tên hoặc bạn gõ nhầm địa chỉ.
      </EmptyState>
    </>
  );
}
