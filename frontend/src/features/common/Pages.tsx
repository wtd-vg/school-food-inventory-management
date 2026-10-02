import { Link } from 'react-router-dom';
import { EmptyState, PageHeader } from '../../components/ui';

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Không tìm thấy trang" />
      <EmptyState title="Đường dẫn này không tồn tại" action={<Link to="/bua-trua">Về trang Hôm nay</Link>} />
    </>
  );
}
