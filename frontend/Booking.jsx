import { useState } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  Check,
  CalendarDays,
  MapPin,
  Clock3,
  Download,
  ShieldCheck,
  Send,
  Printer,
} from 'lucide-react';
import { useLocale } from './i18n';
import { api, localDate, downloadCalendar } from './api';
import { Dialog, Button, Avatar, DateSlots, PhoneAuth, ErrorMessage } from './components';

export default function Booking({
  catalog,
  user,
  onUser,
  onLogout,
  initial,
  onClose,
  openPrivacy,
}) {
  const { t, locale } = useLocale();
  const [serviceId, setServiceId] = useState(initial?.serviceId || catalog.services[0].id);
  const [doctorId, setDoctorId] = useState(
    initial?.doctorId ||
      catalog.doctors.find((d) => d.services.includes(initial?.serviceId || catalog.services[0].id))
        .id,
  );
  const [date, setDate] = useState(localDate()),
    [time, setTime] = useState(''),
    [step, setStep] = useState(0);
  const [name, setName] = useState(''),
    [consent, setConsent] = useState(false),
    [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(null),
    [booking, setBooking] = useState(null),
    [telegramUrl, setTelegramUrl] = useState('');
  const service = catalog.services.find((s) => s.id === serviceId),
    doctor = catalog.doctors.find((d) => d.id === doctorId);
  function changeService(id) {
    setServiceId(id);
    setTime('');
    if (!catalog.doctors.find((d) => d.id === doctorId).services.includes(id))
      setDoctorId(catalog.doctors.find((d) => d.services.includes(id)).id);
  }
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setBooking(
        await api('/bookings', {
          method: 'POST',
          body: { serviceId, doctorId, date, time, name, consent, notify },
        }),
      );
    } catch (e) {
      setError(e);
      if (e.code === 'SLOT_UNAVAILABLE') {
        setTime('');
        setStep(1);
        window.dispatchEvent(new Event('dentlux:availability'));
      }
      if (e.status === 401) onUser(null);
    } finally {
      setBusy(false);
    }
  }
  async function optOut() {
    setBusy(true);
    setError(null);
    try {
      await api(`/bookings/${booking.id}/notifications`, {
        method: 'PATCH',
        body: { enabled: false },
      });
      setNotify(false);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function telegram() {
    setBusy(true);
    setError(null);
    try {
      const value = await api('/telegram/link', { method: 'POST', body: {} });
      if (value.available) setTelegramUrl(value.url);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const summary = (
    <div className="booking-summary">
      <div className="summary-icon">
        <CalendarDays size={23} />
      </div>
      <p className="eyebrow">{t.summary}</p>
      <h3>{service.name[locale]}</h3>
      <p>{doctor.name[locale]}</p>
      {time && (
        <p className="summary-date">
          <CalendarDays size={16} />
          {new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'kk-KZ', {
            day: 'numeric',
            month: 'long',
            timeZone: 'Asia/Almaty',
          }).format(new Date(`${date}T12:00:00+05:00`))}
          <span>· {time}</span>
        </p>
      )}
      <p className="subtle">
        <Clock3 size={14} />
        {t.appointment}
      </p>
      <hr />
      <span className="muted">{t.total}</span>
      <strong className="price">{service.price.toLocaleString(locale)} ₸</strong>
      <p className="fine">{t.priceNote}</p>
      <p className="summary-address">
        <MapPin size={16} />
        {t.bookingSubtitle}
      </p>
    </div>
  );
  if (booking)
    return (
      <Dialog title={t.successTitle} onClose={onClose} className="success-dialog">
        <div className="success-check">
          <Check size={36} />
        </div>
        <p className="dialog-subtitle">{t.successText}</p>
        {summary}
        <div className="reference">
          <span>{t.reference}</span>
          <strong>{booking.reference}</strong>
        </div>
        <p className="fine">
          {notify ? (catalog.demo ? t.successNotify : t.notify) : t.successNoNotify}
        </p>
        <div className="success-actions">
          <Button
            variant="secondary"
            onClick={() => downloadCalendar(booking, service, doctor, locale)}
          >
            <Download size={17} />
            {t.calendar}
          </Button>
          <Button variant="ghost" onClick={() => window.print()}>
            <Printer size={17} />
            {t.print}
          </Button>
        </div>
        {notify && (
          <button className="text-button" disabled={busy} onClick={optOut}>
            {t.notificationOff}
          </button>
        )}
        {catalog.telegramAvailable && (
          <Button variant="secondary" onClick={telegram} busy={busy}>
            <Send size={16} />
            {t.telegram}
          </Button>
        )}
        {telegramUrl && (
          <p>
            <a href={telegramUrl} target="_blank" rel="noreferrer">
              {t.telegram}
            </a>
            <span className="fine">{t.telegramInstructions}</span>
          </p>
        )}
        <ErrorMessage error={error} />
        <Button className="full" onClick={onClose}>
          {t.done}
          <Check size={17} />
        </Button>
      </Dialog>
    );
  return (
    <Dialog title={t.bookingTitle} onClose={onClose} className="booking-dialog">
      <p className="dialog-subtitle">{t.bookingSubtitle}</p>
      <ol className="stepper">
        {[t.stepService, t.stepTime, t.stepDetails].map((label, i) => (
          <li
            key={i}
            className={i <= step ? 'active' : ''}
            aria-current={i === step ? 'step' : undefined}
          >
            <span>{i < step ? <Check size={14} /> : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <div className="booking-layout">
        <div className="booking-main">
          {step === 0 && (
            <>
              <label htmlFor="service-choice" className="field-heading">
                {t.selectService}
              </label>
              <select
                id="service-choice"
                value={serviceId}
                onChange={(e) => changeService(e.target.value)}
              >
                {catalog.services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name[locale]} · {s.price.toLocaleString(locale)} ₸
                  </option>
                ))}
              </select>
              <h3>{t.selectDoctor}</h3>
              <div className="doctor-options">
                {catalog.doctors
                  .filter((d) => d.services.includes(serviceId))
                  .map((d) => (
                    <button
                      key={d.id}
                      aria-pressed={doctorId === d.id}
                      className={`doctor-option ${doctorId === d.id ? 'active' : ''}`}
                      onClick={() => {
                        setDoctorId(d.id);
                        setTime('');
                      }}
                    >
                      <Avatar doctor={d} small />
                      <span>
                        <strong>{d.name[locale]}</strong>
                        <small>
                          {d.specialty[locale]} · {d.experience} {t.experience}
                        </small>
                      </span>
                      <span className="radio-dot">{doctorId === d.id && <Check size={12} />}</span>
                    </button>
                  ))}
              </div>
            </>
          )}
          {step === 1 && (
            <DateSlots
              doctorId={doctorId}
              date={date}
              setDate={setDate}
              time={time}
              setTime={setTime}
            />
          )}
          {step === 2 && (
            <>
              <h3>{t.stepDetails}</h3>
              {user?.role && user.role !== 'patient' ? (
                <div className="notice">
                  <p>{t.patientOnly}</p>
                  <Button variant="secondary" onClick={onLogout}>
                    {t.logout}
                  </Button>
                </div>
              ) : (
                <>
                  <PhoneAuth user={user} onUser={onUser} demo={catalog.demo} />
                  <form id="booking-details" onSubmit={submit} className="details-form">
                    <label htmlFor="patient-name">{t.name}</label>
                    <input
                      id="patient-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      minLength={2}
                      maxLength={100}
                      required
                      autoComplete="name"
                      placeholder={t.namePlaceholder}
                    />
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                        required
                      />
                      <span>
                        {t.consent}
                        <button type="button" className="text-button" onClick={openPrivacy}>
                          {t.consentDetails}
                        </button>
                      </span>
                    </label>
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={notify}
                        onChange={(e) => setNotify(e.target.checked)}
                      />
                      <span>{t.notify}</span>
                    </label>
                  </form>
                </>
              )}
            </>
          )}
          <ErrorMessage error={error} />
          <div className="booking-controls">
            {step > 0 && (
              <Button
                variant="ghost"
                onClick={() => {
                  setStep(step - 1);
                  setError(null);
                }}
              >
                <ArrowLeft size={17} />
                {t.back}
              </Button>
            )}
            {step < 2 ? (
              <Button onClick={() => setStep(step + 1)} disabled={step === 1 && !time}>
                {t.next}
                <ArrowRight size={17} />
              </Button>
            ) : (
              <Button
                type="submit"
                form="booking-details"
                busy={busy}
                disabled={!user || user.role !== 'patient' || !consent || name.trim().length < 2}
              >
                {t.confirm}
                <Check size={17} />
              </Button>
            )}
          </div>
          <p className="security-note">
            <ShieldCheck size={14} />
            {t.noPaid}
          </p>
        </div>
        {summary}
      </div>
    </Dialog>
  );
}
