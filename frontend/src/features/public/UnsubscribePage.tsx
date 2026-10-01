/**
 * FE-07 /huy-nhan/:token (công khai, không cần đăng nhập): phụ huynh huỷ nhận email thực đơn.
 * Chỉ gọi POST /api/unsubscribe/<token>/ khi bấm "Xác nhận huỷ nhận" — không tự huỷ lúc mở link, vì trình
 * quét link của hộp thư có thể mở link thay người dùng. Gọi lại vẫn thành công; phản hồi không chứa email.
 */
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { IconBowl } from '../../components/icons';
import { APP_NAME, SCHOOL_NAME } from '../../components/layout/nav';
import { Button, Callout } from '../../components/ui';
import { messageOf } from '../../lib/http';
import { notificationsApi } from '../../services/notifications';
import styles from '../auth/LoginPage.module.css';

export function UnsubscribePage() {
  const { token = '' } = useParams();
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const confirm = async () => {
    setState('busy');
    try {
      const res = await notificationsApi.unsubscribe(token);
      setMessage(res.message);
      setState('done');
    } catch (err) {
      setMessage(messageOf(err));
      setState('error');
    }
  };

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="unsubscribe-title">
        <div className={styles.brand}>
          <span className={styles.logo} aria-hidden="true">
            <IconBowl size={26} />
          </span>
          <div>
            <p className={styles.brandName}>{APP_NAME}</p>
            {SCHOOL_NAME ? <p className={styles.school}>{SCHOOL_NAME}</p> : null}
          </div>
        </div>

        <div>
          <h1 className={styles.title} id="unsubscribe-title">
            Huỷ nhận email thực đơn
          </h1>
          <p className={styles.lead}>
            Sau khi huỷ, email này không nhận thư thực đơn bữa trưa hằng ngày của nhà trường nữa. Muốn nhận lại, vui lòng liên hệ nhà trường.
          </p>
        </div>

        {state === 'done' ? (
          <Callout tone="ok" role="status">
            {message}
          </Callout>
        ) : (
          <>
            {state === 'error' ? (
              <Callout tone="danger" role="alert">
                {message}
              </Callout>
            ) : null}
            <Button block busy={state === 'busy'} disabled={!token} onClick={confirm}>
              Xác nhận huỷ nhận
            </Button>
          </>
        )}

        <p className={styles.foot}>Trang này không cần đăng nhập và không hiển thị địa chỉ email.</p>
      </section>
    </main>
  );
}
