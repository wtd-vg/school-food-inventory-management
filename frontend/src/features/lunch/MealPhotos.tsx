/**
 * SF73: ảnh suất ăn thực tế của một ngày ăn (photo_views.py). Quản lý chụp/tải tối đa 5 ảnh; Hiệu trưởng chỉ xem.
 * Ảnh được thu nhỏ ≤ 1600px và nén JPEG ngay trên trình duyệt trước khi gửi (đỡ tốn 4G); máy chủ đọc lại,
 * xoay đúng chiều và bỏ EXIF/GPS. Ảnh chỉ xem được khi đã đăng nhập.
 * SF74: "Gửi thư cho phụ huynh" — thư thực đơn kèm các ảnh này (không tự gửi 06:30, Quản lý bấm mới gửi).
 */
import { useRef, useState } from 'react';
import { IconCamera, IconSend, IconTrash } from '../../components/icons';
import { Button, Callout, ConfirmDialog, EmptyState, Modal, SectionTitle, Stack, TextField, useToast } from '../../components/ui';
import { formatDate, formatDateTime, todayISO } from '../../lib/format';
import { messageOf } from '../../lib/http';
import { useApiQuery } from '../../lib/useApiQuery';
import { lunchApi, type MealPhoto } from '../../services/lunch';
import { SendMenuDrawer } from '../notifications/SendMenuDrawer';
import s from '../inventory/shared.module.css';
import styles from './MealPhotos.module.css';

const MAX_SIDE = 1600;
const MAX_BYTES = 8 * 1024 * 1024;

/** Thu nhỏ + nén JPEG bằng canvas. Trình duyệt không đọc được (vd. HEIC trên máy tính) thì gửi file gốc. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.85));
  } catch {
    return file;
  }
}

function readDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => resolve('');
    reader.readAsDataURL(blob);
  });
}

export function MealPhotos({ date, dayOpen, closed }: { date: string; dayOpen: boolean; closed: boolean }) {
  const photos = useApiQuery(() => lunchApi.photos(date), [date]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ blob: Blob; preview: string } | null>(null);
  const [viewing, setViewing] = useState<MealPhoto | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [pickError, setPickError] = useState('');
  const [sending, setSending] = useState(false);
  const toast = useToast();

  const list = photos.data?.results ?? [];
  const max = photos.data?.max ?? 5;
  const future = date > todayISO();
  const blocked = future
    ? 'Ngày chưa tới, chưa tải ảnh được.'
    : !dayOpen
      ? 'Ngày chưa mở số suất, chưa tải ảnh được.'
      : closed
        ? 'Ngày đã đóng; mở lại ngày để thêm hoặc xóa ảnh.'
        : list.length >= max
          ? `Đã đủ ${max} ảnh cho ngày này.`
          : '';

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setPickError('');
    setPreparing(true);
    const blob = await shrink(file);
    setPreparing(false);
    if (blob.size > MAX_BYTES) {
      setPickError('Ảnh quá lớn (tối đa 8 MB). Hãy chụp lại hoặc chọn ảnh JPEG/PNG.');
      return;
    }
    setPending({ blob, preview: await readDataUrl(blob) });
  };

  return (
    <section aria-labelledby="anh-suat-an">
      <div className={styles.head}>
        <SectionTitle id="anh-suat-an">
          Ảnh suất ăn thực tế ({list.length}/{max})
        </SectionTitle>
        <div className={styles.actions}>
          <Button
            write
            variant="secondary"
            icon={<IconCamera size={18} />}
            busy={preparing}
            disabled={Boolean(blocked) || photos.loading}
            title={blocked || undefined}
            onClick={() => inputRef.current?.click()}
          >
            Chụp / tải ảnh
          </Button>
          <Button write icon={<IconSend size={18} />} disabled={future} title={future ? 'Ngày chưa tới, chưa gửi thư được.' : undefined} onClick={() => setSending(true)}>
            Gửi thư cho phụ huynh
          </Button>
        </div>
        <input
          ref={inputRef}
          className={styles.fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          capture="environment"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
      {blocked && list.length < max ? <p className={s.muted}>{blocked}</p> : null}
      {pickError ? (
        <Callout tone="danger" role="alert">
          {pickError}
        </Callout>
      ) : null}
      {photos.loading ? (
        <p className={s.muted}>Đang tải ảnh…</p>
      ) : photos.error ? (
        <Callout tone="danger" role="alert" action={<Button variant="ghost" onClick={photos.reload}>Thử lại</Button>}>
          {photos.error}
        </Callout>
      ) : list.length ? (
        <ul className={styles.grid}>
          {list.map((p) => (
            <li key={p.id}>
              <button type="button" className={styles.thumb} onClick={() => setViewing(p)} aria-label={`Xem ảnh ${p.note || p.id}`}>
                <img src={p.url} alt={p.note || `Suất ăn ngày ${formatDate(p.date)}`} loading="lazy" width={p.width} height={p.height} />
              </button>
              {p.note ? <span className={styles.caption}>{p.note}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<IconCamera size={32} />} title="Chưa có ảnh suất ăn">
          Quản lý chụp khay cơm thực tế khi phát suất để lưu làm bằng chứng.
        </EmptyState>
      )}

      {pending ? (
        <UploadModal
          date={date}
          blob={pending.blob}
          preview={pending.preview}
          onClose={() => setPending(null)}
          onDone={() => {
            setPending(null);
            toast.show('Đã lưu ảnh suất ăn.');
            photos.reload();
          }}
        />
      ) : null}
      {sending ? (
        <SendMenuDrawer
          date={date}
          onClose={() => setSending(false)}
          onSent={(message) => {
            setSending(false);
            toast.show(message);
          }}
        />
      ) : null}
      {viewing ? (
        <ViewModal
          photo={viewing}
          canDelete={!closed}
          onClose={() => setViewing(null)}
          onDeleted={() => {
            setViewing(null);
            toast.show('Đã xóa ảnh.');
            photos.reload();
          }}
        />
      ) : null}
    </section>
  );
}

function UploadModal({ date, blob, preview, onClose, onDone }: { date: string; blob: Blob; preview: string; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await lunchApi.uploadPhoto(date, blob, note.trim());
      onDone();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={`Lưu ảnh suất ăn ngày ${formatDate(date)}`}
      onClose={busy ? () => undefined : onClose}
      actions={
        <>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Huỷ
          </Button>
          <Button write busy={busy} onClick={submit}>
            Lưu ảnh
          </Button>
        </>
      }
    >
      <Stack>
        {preview ? <img className={styles.preview} src={preview} alt="Ảnh vừa chọn" /> : <p className={s.muted}>Đã chọn ảnh ({Math.round(blob.size / 1024)} KB).</p>}
        {error ? (
          <Callout tone="danger" role="alert">
            {error}
          </Callout>
        ) : null}
        <TextField label="Ghi chú" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} hint="Không bắt buộc, ví dụ: khay cơm lớp 1A." />
      </Stack>
    </Modal>
  );
}

function ViewModal({ photo, canDelete, onClose, onDeleted }: { photo: MealPhoto; canDelete: boolean; onClose: () => void; onDeleted: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await lunchApi.deletePhoto(photo.id);
      onDeleted();
    } catch (err) {
      setError(messageOf(err));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Modal
        title={`Ảnh suất ăn ngày ${formatDate(photo.date)}`}
        onClose={onClose}
        actions={
          <>
            {canDelete ? (
              <Button write variant="danger" icon={<IconTrash size={18} />} onClick={() => setConfirm(true)}>
                Xóa ảnh
              </Button>
            ) : null}
            <Button variant="outline" onClick={onClose}>
              Đóng
            </Button>
          </>
        }
      >
        <Stack>
          <img className={styles.full} src={photo.url} alt={photo.note || `Suất ăn ngày ${formatDate(photo.date)}`} />
          {photo.note ? <p>{photo.note}</p> : null}
          <p className={s.muted}>
            {photo.uploaded_by} · {formatDateTime(photo.created_at)}
          </p>
          {error ? (
            <Callout tone="danger" role="alert">
              {error}
            </Callout>
          ) : null}
        </Stack>
      </Modal>
      {confirm ? (
        <ConfirmDialog title="Xóa ảnh này?" confirmLabel="Xóa ảnh" tone="danger" busy={busy} onConfirm={remove} onCancel={() => setConfirm(false)}>
          Ảnh bị xóa hẳn khỏi máy chủ; nhật ký vẫn ghi lại thao tác xóa.
        </ConfirmDialog>
      ) : null}
    </>
  );
}
