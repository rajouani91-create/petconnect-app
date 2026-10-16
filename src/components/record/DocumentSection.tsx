import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent, type RefObject } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { formatIsoDateShort, localeOf, type MessageKey } from '../../i18n';
import { deleteDocument, listDocuments, signedDocumentUrl, updateDocument, uploadDocument, type DocumentRow } from '../../lib/api';
import {
  DOC_ACCEPT,
  DOC_CATEGORIES,
  DOC_CATEGORY_LABEL,
  DOC_TITLE_MAX,
  checkDocFile,
  filterDocs,
  formatDocMeta,
  isDocCategory,
  isImageMime,
  recordErrorKey,
  sortDocs,
  titleFromFilename,
  validateDocForm,
  type DocCategory,
  type DocErrors,
  type DocFormValues,
  type DocMime,
} from '../../lib/record';
import { Field } from '../Field';
import { IconPlus, IconTrash } from '../Icons';
import { Loading } from '../Loading';
import { ByLine, ConfirmDelete, StatusLine, useFocusAfter, useStatus } from './shared';

type Mode = { kind: 'upload' } | { kind: 'edit'; row: DocumentRow } | null;

const OPEN_TTL_S = 60;
const THUMB_TTL_S = 600;

/** Dokumente: ablegen (PDF/Foto), filtern, ansehen per signierter URL, umbenennen, löschen. */
export function DocumentSection({ petId, editable, today, myId, names }: { petId: string; editable: boolean; today: string; myId: string | undefined; names: ReadonlyMap<string, string> }) {
  const { t, lang } = useI18n();
  const uid = useId();
  const [rows, setRows] = useState<DocumentRow[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<DocCategory | 'all'>('all');
  const [mode, setMode] = useState<Mode>(null);
  const [toDelete, setToDelete] = useState<DocumentRow | null>(null);
  const [status, setStatus] = useStatus();
  const { register, focusLater } = useFocusAfter();

  const load = useCallback(async () => {
    try {
      setRows(sortDocs(await listDocuments(petId)));
      setLoadError(false);
    } catch (e) {
      console.error(e);
      setLoadError(true);
    }
  }, [petId]);
  useEffect(() => {
    setRows(null);
    void load();
  }, [load]);

  const all = rows ?? [];
  const shown = filterDocs(all, filter);

  async function open(doc: DocumentRow) {
    // Fenster sofort öffnen (sonst blockieren manche Browser das Pop-up nach dem Warten), dann die Adresse setzen.
    const win = window.open('', '_blank');
    try {
      const url = await signedDocumentUrl(doc.storage_path, OPEN_TTL_S);
      if (win) {
        win.opener = null;
        win.location.href = url;
      } else {
        window.location.assign(url);
      }
    } catch (e) {
      win?.close();
      console.error(e instanceof Error ? e.message : 'Dokument konnte nicht geöffnet werden');
      setStatus(t(recordErrorKey(e)), false);
    }
  }

  async function remove(doc: DocumentRow) {
    setToDelete(null);
    try {
      await deleteDocument(doc);
      setRows((cur) => (cur ?? []).filter((r) => r.id !== doc.id));
      setStatus(t('dcDeleted', { n: doc.title }));
    } catch (e) {
      console.error(e instanceof Error ? e.message : 'Dokument konnte nicht gelöscht werden');
      setStatus(t(recordErrorKey(e)), false);
    }
    focusLater('add');
  }

  return (
    <div className="stack record-panel">
      {loadError && <p className="notice notice-crit" role="alert">{t('errGeneric')}</p>}
      {!rows && !loadError && <Loading />}

      {rows && (
        <>
          {all.length > 0 && (
            <Field id={`${uid}-filter`} label={t('dcFilter')}>
              {(a) => (
                <select {...a} value={filter} onChange={(e) => setFilter(isDocCategory(e.target.value) ? e.target.value : 'all')}>
                  <option value="all">{t('dcAll')}</option>
                  {DOC_CATEGORIES.map((c) => <option key={c} value={c}>{t(DOC_CATEGORY_LABEL[c])}</option>)}
                </select>
              )}
            </Field>
          )}

          {all.length === 0 ? (
            <p className="muted">{t('dcNone')}</p>
          ) : shown.length === 0 ? (
            <p className="muted">{t('dcNoneFilter')}</p>
          ) : (
            <ul className="record-list" aria-label={t('dcListL')}>
              {shown.map((d) => (
                <li key={d.id} className="record-row doc-row">
                  {isImageMime(d.mime_type) ? <DocThumb path={d.storage_path} /> : <span className="doc-icon" aria-hidden="true">PDF</span>}
                  <div className="record-main">
                    <span className="record-title">{d.title}</span>
                    <span className="muted small">
                      {[isDocCategory(d.category) ? t(DOC_CATEGORY_LABEL[d.category]) : d.category, d.doc_date && formatIsoDateShort(d.doc_date, lang), formatDocMeta(d.mime_type, d.size_bytes, localeOf(lang))]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    <ByLine ownerId={d.owner_id} myId={myId} names={names} />
                  </div>
                  <div className="row-actions">
                    <button type="button" className="btn btn-secondary" aria-label={t('dcOpenL', { n: d.title })} onClick={() => void open(d)}>
                      {t('dcOpen')}
                    </button>
                    {editable && (
                      <>
                        <button type="button" ref={register(`edit-${d.id}`)} className="btn btn-ghost" aria-label={t('dcEditL', { n: d.title })} onClick={() => { setMode({ kind: 'edit', row: d }); setStatus(''); }}>
                          {t('dcEdit')}
                        </button>
                        <button type="button" className="btn-icon" aria-label={t('dcDelL', { n: d.title })} onClick={() => setToDelete(d)}>
                          <IconTrash size={20} />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {editable && mode === null && (
            <button type="button" ref={register('add')} className="btn btn-secondary btn-start" onClick={() => { setMode({ kind: 'upload' }); setStatus(''); }}>
              <IconPlus size={20} />
              {t('dcAdd')}
            </button>
          )}
          {editable && mode?.kind === 'upload' && (
            <UploadForm
              today={today}
              onCancel={() => { setMode(null); focusLater('add'); }}
              onUpload={async (file, mime, meta) => {
                const row = await uploadDocument(petId, file, mime, { title: meta.title.trim(), category: meta.category, doc_date: meta.docDate || null });
                setRows((cur) => sortDocs([...(cur ?? []), row]));
                setMode(null);
                setFilter('all');
                setStatus(t('dcSaved', { n: row.title }));
                focusLater('add');
              }}
            />
          )}
          {editable && mode?.kind === 'edit' && (
            <MetaForm
              key={mode.row.id}
              today={today}
              title={t('dcEditTitle')}
              initial={{ title: mode.row.title, category: isDocCategory(mode.row.category) ? mode.row.category : 'other', docDate: mode.row.doc_date ?? '' }}
              onCancel={() => { const id = mode.row.id; setMode(null); focusLater(`edit-${id}`); }}
              onSave={async (meta) => {
                const row = await updateDocument(mode.row.id, { title: meta.title.trim(), category: meta.category, doc_date: meta.docDate || null });
                setRows((cur) => sortDocs((cur ?? []).map((r) => (r.id === row.id ? row : r))));
                setMode(null);
                setStatus(t('dcUpdated', { n: row.title }));
                focusLater(`edit-${row.id}`);
              }}
            />
          )}
          <p className="muted small">{t('dcPrivacy')}</p>
        </>
      )}
      <StatusLine status={status} />

      <ConfirmDelete open={toDelete !== null} title={t('dcDelTitle')} onCancel={() => setToDelete(null)} onConfirm={() => toDelete && void remove(toDelete)}>
        {toDelete && <p>{t('dcDelAsk', { n: toDelete.title })}</p>}
      </ConfirmDelete>
    </div>
  );
}

/** Kleine Vorschau eines Bild-Dokuments über eine signierte URL */
function DocThumb({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    signedDocumentUrl(path, THUMB_TTL_S)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [path]);
  return url ? <img src={url} alt="" className="doc-thumb" width={48} height={48} loading="lazy" decoding="async" /> : <span className="doc-icon" aria-hidden="true">IMG</span>;
}

function useMetaFields(initial: DocFormValues, today: string) {
  const [v, setV] = useState<DocFormValues>(initial);
  const [errors, setErrors] = useState<DocErrors>({});
  const set = <K extends keyof DocFormValues>(k: K, val: DocFormValues[K]) => {
    setV((p) => ({ ...p, [k]: val }));
    setErrors((p) => ({ ...p, [k]: undefined }));
  };
  const validate = () => {
    const e = validateDocForm(v, today);
    setErrors((p) => ({ ...p, title: e.title, docDate: e.docDate }));
    return e;
  };
  return { v, set, setV, errors, setErrors, validate };
}

function MetaFields({
  uid,
  v,
  set,
  errors,
  today,
  titleRef,
  dateRef,
}: {
  uid: string;
  v: DocFormValues;
  set: <K extends keyof DocFormValues>(k: K, val: DocFormValues[K]) => void;
  errors: DocErrors;
  today: string;
  titleRef: RefObject<HTMLInputElement | null>;
  dateRef: RefObject<HTMLInputElement | null>;
}) {
  const { t } = useI18n();
  const fe = (k: MessageKey | undefined) => (k ? { key: k } : undefined);
  return (
    <>
      <Field id={`${uid}-title`} label={t('dcTitle')} error={fe(errors.title)} required>
        {(a) => <input {...a} ref={titleRef} type="text" maxLength={DOC_TITLE_MAX} value={v.title} onChange={(e) => set('title', e.target.value)} />}
      </Field>
      <div className="row-2">
        <Field id={`${uid}-cat`} label={t('dcCategory')}>
          {(a) => (
            <select {...a} value={v.category} onChange={(e) => isDocCategory(e.target.value) && set('category', e.target.value)}>
              {DOC_CATEGORIES.map((c) => <option key={c} value={c}>{t(DOC_CATEGORY_LABEL[c])}</option>)}
            </select>
          )}
        </Field>
        <Field id={`${uid}-date`} label={t('dcDate')} error={fe(errors.docDate)} optional>
          {(a) => <input {...a} ref={dateRef} type="date" max={today} value={v.docDate} onChange={(e) => set('docDate', e.target.value)} />}
        </Field>
      </div>
    </>
  );
}

function UploadForm({
  today,
  onUpload,
  onCancel,
}: {
  today: string;
  onUpload: (file: File, mime: DocMime, meta: DocFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const uid = useId();
  const f = useMetaFields({ title: '', category: 'other', docDate: '' }, today);
  const [file, setFile] = useState<{ file: File; mime: DocMime } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  useEffect(() => fileRef.current?.focus(), []);

  function pick(e: ChangeEvent<HTMLInputElement>) {
    const chosen = e.target.files?.[0];
    setFormError(null);
    if (!chosen) {
      setFile(null);
      return;
    }
    const check = checkDocFile(chosen);
    if (!check.ok) {
      setFile(null);
      e.target.value = '';
      f.setErrors((p) => ({ ...p, file: check.error }));
      return;
    }
    setFile({ file: chosen, mime: check.mime });
    f.setErrors((p) => ({ ...p, file: undefined, title: undefined }));
    if (!f.v.title.trim()) f.set('title', titleFromFilename(chosen.name));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const errs = f.validate();
    if (!file) {
      f.setErrors((p) => ({ ...p, file: p.file ?? 'dcErrFile' }));
      return fileRef.current?.focus();
    }
    if (errs.title) return titleRef.current?.focus();
    if (errs.docDate) return dateRef.current?.focus();
    setBusy(true);
    try {
      await onUpload(file.file, file.mime, f.v);
    } catch (err) {
      console.error(err instanceof Error ? err.message : 'Hochladen fehlgeschlagen');
      setFormError(t(recordErrorKey(err)));
      setBusy(false);
    }
  }

  return (
    <form className="add-form stack" onSubmit={submit} noValidate aria-labelledby={`${uid}-h`} aria-busy={busy}>
      <h3 id={`${uid}-h`}>{t('dcAdd')}</h3>
      <Field id={`${uid}-file`} label={t('dcFile')} hint={t('dcFileHint')} error={f.errors.file ? { key: f.errors.file } : undefined} required>
        {(a) => <input {...a} ref={fileRef} type="file" accept={DOC_ACCEPT} onChange={pick} className="file-input" />}
      </Field>
      <MetaFields uid={uid} v={f.v} set={f.set} errors={f.errors} today={today} titleRef={titleRef} dateRef={dateRef} />
      {formError && <p className="notice notice-crit" role="alert">{formError}</p>}
      {busy && <p className="notice notice-info" role="status">{t('dcUploading')}</p>}
      <div className="actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>{t('cancelBtn')}</button>
        <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>{t('dcUpload')}</button>
      </div>
    </form>
  );
}

function MetaForm({
  initial,
  today,
  title,
  onSave,
  onCancel,
}: {
  initial: DocFormValues;
  today: string;
  title: string;
  onSave: (meta: DocFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const uid = useId();
  const f = useMetaFields(initial, today);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  useEffect(() => titleRef.current?.focus(), []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const errs = f.validate();
    if (errs.title) return titleRef.current?.focus();
    if (errs.docDate) return dateRef.current?.focus();
    setBusy(true);
    try {
      await onSave(f.v);
    } catch (err) {
      console.error(err instanceof Error ? err.message : 'Ändern fehlgeschlagen');
      setFormError(t(recordErrorKey(err)));
      setBusy(false);
    }
  }

  return (
    <form className="add-form stack" onSubmit={submit} noValidate aria-labelledby={`${uid}-h`}>
      <h3 id={`${uid}-h`}>{title}</h3>
      <MetaFields uid={uid} v={f.v} set={f.set} errors={f.errors} today={today} titleRef={titleRef} dateRef={dateRef} />
      {formError && <p className="notice notice-crit" role="alert">{formError}</p>}
      <div className="actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>{t('cancelBtn')}</button>
        <button type="submit" className="btn btn-primary" disabled={busy} aria-busy={busy}>{t('saveBtn')}</button>
      </div>
    </form>
  );
}
