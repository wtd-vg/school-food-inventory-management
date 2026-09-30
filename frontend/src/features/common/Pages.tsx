import { Link } from 'react-router-dom';
import { IconClock } from '../../components/icons';
import { EmptyState, PageHeader } from '../../components/ui';

export function ComingSoon({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState icon={<IconClock size={32} />} title="Màn này đang được làm lại">
        Chức năng sẽ có trong bản cập nhật tới.
      </EmptyState>
    </>
  );
}

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
