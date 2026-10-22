import { useEffect, useId, useRef, useState } from 'react';
import {
  X,
  ArrowRight,
  Check,
  LoaderCircle,
  AlertCircle,
  CalendarDays,
  Clock3,
} from 'lucide-react';
import { useLocale } from './i18n';
import { api, localDate, shiftDate } from './api';

export function Button({ children, variant = 'primary', busy, className = '', ...props }) {
  return (
    <button
      className={`btn btn-${variant} ${className}`}
      {...props}
      disabled={props.disabled || busy}
    >
      {busy && <LoaderCircle size={17} className="spin" />}
      {children}
    </button>
  );
}
export function Dialog({ title, children, onClose, className = '' }) {
  const ref = useRef(),
    id = useId();
  const { t } = useLocale();
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = old;
      previous?.focus?.();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${className}`}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-inner">
        <button className="icon-button dialog-close" onClick={onClose} aria-label={t.close}>
          <X size={21} />
        </button>
        <h2 id={id} className="dialog-title">
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}
export function ErrorMessage({ error }) {
  const { errorText } = useLocale();
  return error ? (
    <p role="alert" className="error">
      <AlertCircle size={17} />
      <span>{errorText(error)}</span>
    </p>
  ) : null;
}
export function Empty({ title, text }) {
  return (
    <div className="empty">
      <CalendarDays size={32} />
      <h3>{title}</h3>
      {text && <p>{text}</p>}
    </div>
  );
}
export function Avatar({ doctor, small = false }) {
  return (
    <div className={`avatar ${doctor.color} ${small ? 'small' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 200 220">
        <path d="M38 220v-42c0-39 28-58 62-58s62 19 62 58v42" fill="#faf9f4" />
        <path d="m82 133 18 34 18-34" fill="#d9e9e1" />
        <path
          d="M62 83c0-45 17-60 40-60 32 0 40 25 35 60"
          fill={doctor.id === 'arman' ? '#3a3936' : '#393c37'}
        />
        <ellipse cx="100" cy="87" rx="33" ry="43" fill="#dcb391" />
        <path
          d="M68 77c-5-34 10-49 32-49 28 0 38 21 36 49-8-4-12-18-14-23-12 17-35 19-54 23Z"
          fill="#393c37"
        />
        <path
          d="M88 99q12 12 24 0"
          stroke="#916652"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="87" cy="83" r="2.5" fill="#473b32" />
        <circle cx="113" cy="83" r="2.5" fill="#473b32" />
        <path
          d="m69 151 14 35 17-19-15-31m46 15-14 35-17-19 15-31"
          stroke="#d4ded7"
          strokeWidth="2"
          fill="none"
        />
        <path d="M136 173v22m-11-11h22" stroke="#477768" strokeWidth="3" />
      </svg>
    </div>
  );
}
export function PhoneAuth({ user, onUser, initialPhone = '', demo, onComplete }) {
  const { t } = useLocale();
  const [phone, setPhone] = useState(initialPhone),
    [challenge, setChallenge] = useState(null),
    [code, setCode] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null);
  const id = useId();
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!challenge) setChallenge(await api('/auth/request', { method: 'POST', body: { phone } }));
      else {
        const result = await api('/auth/verify', {
          method: 'POST',
          body: { phone, challengeId: challenge.challengeId, code },
        });
        onUser(result.user);
        onComplete?.(result.user);
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    setPhone(initialPhone);
    setChallenge(null);
    setCode('');
    setError(null);
  }, [initialPhone]);
  if (user)
    return (
      <div className="verified">
        <Check size={18} />
        <span>
          {t.phoneVerified}
          <strong>{user.phone}</strong>
        </span>
      </div>
    );
  return (
    <form onSubmit={submit} className="auth-form">
      <label htmlFor={`${id}-phone`}>{t.phone}</label>
      <input
        id={`${id}-phone`}
        type="tel"
        autoComplete="tel"
        placeholder={t.phonePlaceholder}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        disabled={Boolean(challenge)}
        required
        pattern="[+0-9 ()\-]{10,20}"
        maxLength={20}
      />
      {challenge && (
        <>
          <label htmlFor={`${id}-otp`}>{t.otp}</label>
          <input
            id={`${id}-otp`}
            autoFocus
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            required
            placeholder="••••••"
          />
          {demo && challenge.demoCode && (
            <p className="demo-code">
              {t.demoCode}: <strong data-testid="demo-code">{challenge.demoCode}</strong>
            </p>
          )}
          <button
            className="text-button"
            type="button"
            onClick={() => {
              setChallenge(null);
              setCode('');
              setError(null);
            }}
          >
            {t.changePhone}
          </button>
        </>
      )}
      <ErrorMessage error={error} />
      <Button type="submit" busy={busy}>
        {challenge ? t.verify : t.sendCode}
        <ArrowRight size={17} />
      </Button>
    </form>
  );
}
export function DateSlots({ doctorId, date, setDate, time, setTime }) {
  const { t, locale } = useLocale();
  const [data, setData] = useState(null),
    [error, setError] = useState(null),
    [version, setVersion] = useState(0);
  const today = localDate();
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(today, i));
  useEffect(() => {
    let active = true;
    setData(null);
    setError(null);
    api(`/slots?doctorId=${encodeURIComponent(doctorId)}&date=${date}`)
      .then((value) => {
        if (!active) return;
        setData(value);
        if (time && !value.slots.some((s) => s.time === time && s.available)) setTime('');
      })
      .catch((e) => {
        if (active) setError(e);
      });
    return () => {
      active = false;
    };
  }, [doctorId, date, version]);
  useEffect(() => {
    // Periodic revalidation also covers reconnects and proxies without WebSocket support.
    const timer = setInterval(() => setVersion((v) => v + 1), 30000);
    const onChange = () => setVersion((v) => v + 1);
    window.addEventListener('dentlux:availability', onChange);
    return () => {
      clearInterval(timer);
      window.removeEventListener('dentlux:availability', onChange);
    };
  }, []);
  const format = (day, options) =>
    new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'kk-KZ', {
      timeZone: 'Asia/Almaty',
      ...options,
    }).format(new Date(`${day}T12:00:00+05:00`));
  return (
    <div className="date-slots">
      <h3>{t.selectDate}</h3>
      <div className="day-list">
        {days.map((day) => (
          <button
            key={day}
            aria-pressed={date === day}
            className={`day ${date === day ? 'active' : ''}`}
            onClick={() => {
              setDate(day);
              setTime('');
            }}
          >
            <span>{format(day, { weekday: 'short' })}</span>
            <strong>{format(day, { day: 'numeric' })}</strong>
            <span>{format(day, { month: 'short' })}</span>
          </button>
        ))}
      </div>
      <label className="date-label">
        {t.otherDate}
        <input
          type="date"
          value={date}
          min={today}
          max={shiftDate(today, 60)}
          onChange={(e) => {
            if (e.target.value) {
              setDate(e.target.value);
              setTime('');
            }
          }}
        />
      </label>
      <div className="slots-heading">
        <h3>{t.freeTime}</h3>
        <span>
          <Clock3 size={14} />
          {t.timeZone}
        </span>
      </div>
      {error ? (
        <>
          <ErrorMessage error={error} />
          <Button variant="secondary" onClick={() => setVersion((v) => v + 1)}>
            {t.retry}
          </Button>
        </>
      ) : !data ? (
        <p role="status">{t.loading}</p>
      ) : data.slots.every((s) => !s.available) ? (
        <Empty title={t.noSlots} />
      ) : (
        <div className="slot-list">
          {data.slots.map((slot) => (
            <button
              key={slot.time}
              disabled={!slot.available}
              aria-pressed={time === slot.time}
              aria-label={`${slot.time}${slot.available ? '' : ` — ${t.busy}`}`}
              className={`slot ${time === slot.time ? 'active' : ''}`}
              onClick={() => setTime(slot.time)}
            >
              {slot.time}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
