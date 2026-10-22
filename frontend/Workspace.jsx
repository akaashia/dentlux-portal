import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  CalendarDays,
  Clock3,
  BarChart3,
  ShieldCheck,
  Bell,
  ArrowLeft,
  LogOut,
  Search,
  RefreshCw,
  Users,
  UserCheck,
  UserX,
  ArrowUpRight,
  Check,
  Server,
  Undo2,
} from 'lucide-react';
import { useLocale } from './i18n';
import { api, localDate, shiftDate } from './api';
import { Button, Dialog, DateSlots, ErrorMessage, Empty } from './components';

const tabs = {
  receptionist: ['dashboard', 'appointments', 'schedule', 'statistics', 'notifications'],
  doctor: ['appointments'],
  lawyer: ['audit'],
  admin: ['technical', 'audit', 'notifications'],
};
const icons = {
  dashboard: LayoutDashboard,
  appointments: CalendarDays,
  schedule: Clock3,
  statistics: BarChart3,
  audit: ShieldCheck,
  notifications: Bell,
  technical: Server,
};
export default function Workspace({ catalog, user, onBack, onLogout, locale, setLocale, logo }) {
  const { t } = useLocale();
  const [tab, setTab] = useState(tabs[user.role]?.[0] || 'appointments');
  const [date, setDate] = useState(localDate()),
    [data, setData] = useState({}),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(null),
    [version, setVersion] = useState(0);
  const [query, setQuery] = useState(''),
    [filterDoctor, setFilterDoctor] = useState('all'),
    [status, setStatus] = useState('all');
  const [message, setMessage] = useState(''),
    [undo, setUndo] = useState(null),
    [moving, setMoving] = useState(null),
    [saving, setSaving] = useState(false);
  const refresh = () => setVersion((v) => v + 1);
  useEffect(() => {
    window.addEventListener('dentlux:availability', refresh);
    return () => window.removeEventListener('dentlux:availability', refresh);
  }, []);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError(null);
    const endpoints =
      tab === 'dashboard'
        ? [`/staff/bookings?date=${date}`, `/staff/statistics?date=${date}`]
        : tab === 'appointments'
          ? [`/staff/bookings?date=${date}`]
          : tab === 'statistics'
            ? [`/staff/statistics?date=${date}`]
            : tab === 'technical'
              ? ['/health']
              : tab === 'schedule'
                ? []
                : [`/staff/${tab}`];
    Promise.all(endpoints.map((e) => api(e)))
      .then((values) => {
        if (active) setData(values.reduce((acc, value) => ({ ...acc, ...value }), {}));
      })
      .catch((e) => {
        if (active) setError(e);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [tab, date, version]);
  async function changeStatus(booking, newStatus, isUndo = false) {
    setSaving(true);
    setError(null);
    setMessage('');
    try {
      const updated = await api(`/staff/bookings/${booking.id}`, {
        method: 'PATCH',
        body: { status: newStatus, expectedUpdatedAt: booking.updatedAt },
      });
      setUndo(isUndo ? null : { booking: updated, status: booking.status });
      setMessage(t.statusSaved);
      refresh();
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }
  const label = (id) => catalog.doctors.find((d) => d.id === id)?.name[locale] || id;
  const service = (id) => catalog.services.find((s) => s.id === id)?.name[locale] || id;
  const filtered = (data.bookings || []).filter(
    (b) =>
      (filterDoctor === 'all' || b.doctorId === filterDoctor) &&
      (status === 'all' || b.status === status) &&
      `${b.name} ${b.reference}`.toLowerCase().includes(query.toLowerCase()),
  );
  const dateTabs = ['dashboard', 'appointments', 'schedule', 'statistics'].includes(tab);
  return (
    <div className="workspace">
      <aside className="workspace-sidebar">
        <div onClick={onBack}>{logo}</div>
        <p className="sidebar-caption">{t.workspace}</p>
        <nav>
          {(tabs[user.role] || []).map((id) => {
            const Icon = icons[id];
            return (
              <button
                key={id}
                className={tab === id ? 'active' : ''}
                onClick={() => {
                  setTab(id);
                  setData({});
                  setMessage('');
                  setUndo(null);
                }}
              >
                <Icon size={18} />
                {t[id]}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="staff-person">
            <span>{user.name.slice(0, 1)}</span>
            <div>
              <strong>{t[user.role]}</strong>
              <small>{user.phone}</small>
            </div>
          </div>
          <button onClick={onBack}>
            <ArrowLeft size={17} />
            {t.backSite}
          </button>
          <button onClick={onLogout}>
            <LogOut size={17} />
            {t.logout}
          </button>
        </div>
      </aside>
      <div className="workspace-content">
        <header className="workspace-header">
          <div>
            <span className="workspace-eyebrow">DENTLUX / {t.workspace}</span>
            <h1>{t[tab]}</h1>
          </div>
          <div className="workspace-tools">
            <button
              className="text-button"
              onClick={() => setLocale(locale === 'ru' ? 'kk' : 'ru')}
            >
              {locale === 'ru' ? 'ҚАЗ' : 'РУС'}
            </button>
            <Button variant="secondary" onClick={refresh} disabled={busy}>
              <RefreshCw size={16} />
              <span>{t.refresh}</span>
            </Button>
          </div>
        </header>
        {catalog.demo && (
          <div className="workspace-demo">
            <span className="demo-dot" />
            {t.demo} · {t.demoText}
          </div>
        )}
        {dateTabs && (
          <div className="date-toolbar">
            <label>
              {t.date}
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  if (e.target.value) setDate(e.target.value);
                }}
              />
            </label>
            <Button variant="secondary" onClick={() => setDate(localDate())}>
              {t.today}
            </Button>
            <span>
              <Clock3 size={14} />
              {t.timeZone}
            </span>
          </div>
        )}
        <ErrorMessage error={error} />
        {error && data.bookings && <p className="fine">{t.lastLoaded}</p>}
        {message && (
          <div role="status" className="toast">
            <Check size={17} />
            {message}
            {undo && (
              <button
                disabled={saving}
                onClick={() => changeStatus(undo.booking, undo.status, true)}
              >
                <Undo2 size={15} />
                {t.undo}
              </button>
            )}
          </div>
        )}
        {busy && (
          <div className="loading-line" role="status">
            {t.loading}
          </div>
        )}
        {['dashboard', 'statistics'].includes(tab) && data.capacity && (
          <>
            <div className="stat-grid">
              {[
                [Users, t.totalBookings, data.total],
                [Clock3, t.waiting, data.scheduled],
                [UserCheck, t.visited, data.arrived],
                [UserX, t.noShow, data.noShow],
              ].map(([Icon, title, value], i) => (
                <article className="stat-card" key={title}>
                  <span className={`stat-icon stat-${i}`}>
                    <Icon size={21} />
                  </span>
                  <span>{title}</span>
                  <strong>{value}</strong>
                </article>
              ))}
            </div>
            {tab === 'statistics' && (
              <div className="report-grid">
                <section className="panel">
                  <h2>{t.load}</h2>
                  {data.capacity.map((d) => (
                    <div className="load-row" key={d.doctorId}>
                      <div>
                        <strong>{label(d.doctorId)}</strong>
                        <span>
                          {d.booked} / {d.capacity} {t.slotUnit}
                        </span>
                      </div>
                      <progress
                        value={d.booked}
                        max={Math.max(d.capacity, 1)}
                        aria-label={label(d.doctorId)}
                      />
                    </div>
                  ))}
                </section>
                <section className="panel value-panel">
                  <BarChart3 size={28} />
                  <h2>{t.completedValue}</h2>
                  <strong>{data.completedValue.toLocaleString(locale)} ₸</strong>
                  <p>{t.noPayments}</p>
                </section>
              </div>
            )}
          </>
        )}
        {['dashboard', 'appointments'].includes(tab) && (
          <section className="panel appointments-panel">
            <div className="panel-title">
              <h2>{t.daySchedule}</h2>
              <span>
                {filtered.length} / {data.bookings?.length || 0}
              </span>
            </div>
            <div className="table-filters">
              <label className="search-input">
                <Search size={17} />
                <input
                  aria-label={t.search}
                  placeholder={t.search}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              {user.role !== 'doctor' && (
                <select
                  aria-label={t.doctorLabel}
                  value={filterDoctor}
                  onChange={(e) => setFilterDoctor(e.target.value)}
                >
                  <option value="all">{t.allDoctors}</option>
                  {catalog.doctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name[locale]}
                    </option>
                  ))}
                </select>
              )}
              <select
                aria-label={t.statusLabel}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">{t.allStatuses}</option>
                {['scheduled', 'arrived', 'completed', 'no_show', 'cancelled'].map((s) => (
                  <option key={s} value={s}>
                    {t[s]}
                  </option>
                ))}
              </select>
            </div>
            {filtered.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {[
                        t.timeLabel,
                        t.patientLabel,
                        t.serviceLabel,
                        t.doctorLabel,
                        t.statusLabel,
                        ...(user.role === 'receptionist' ? [t.actions] : []),
                      ].map((v) => (
                        <th key={v}>{v}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((b) => (
                      <tr key={b.id}>
                        <td className="time-cell">
                          {b.time}
                          <small>{b.reference}</small>
                        </td>
                        <td>
                          <strong>{b.name}</strong>
                          <small>{b.phone}</small>
                        </td>
                        <td>
                          {service(b.serviceId)}
                          <small>{b.price.toLocaleString(locale)} ₸</small>
                        </td>
                        <td>{label(b.doctorId)}</td>
                        <td>
                          {user.role === 'receptionist' ? (
                            <select
                              className={`status-select status-${b.status}`}
                              aria-label={`${t.statusLabel} — ${b.reference}`}
                              value={b.status}
                              disabled={saving}
                              onChange={(e) => changeStatus(b, e.target.value)}
                            >
                              {['scheduled', 'arrived', 'completed', 'no_show', 'cancelled'].map(
                                (s) => (
                                  <option key={s} value={s}>
                                    {t[s]}
                                  </option>
                                ),
                              )}
                            </select>
                          ) : (
                            <span className={`status-pill status-${b.status}`}>{t[b.status]}</span>
                          )}
                        </td>
                        {user.role === 'receptionist' && (
                          <td>
                            <button
                              className="text-button"
                              disabled={b.status !== 'scheduled' || saving}
                              onClick={() => setMoving(b)}
                            >
                              {t.reschedule}
                              <ArrowUpRight size={15} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              !busy && (
                <Empty
                  title={data.bookings?.length ? t.noResults : t.noBookings}
                  text={t.noBookingsText}
                />
              )
            )}
          </section>
        )}
        {tab === 'schedule' && (
          <Schedule catalog={catalog} date={date} setMessage={setMessage} onChange={refresh} />
        )}
        {tab === 'audit' && (
          <section className="panel">
            <h2>{t.auditTitle}</h2>
            <p className="panel-description">{t.auditText}</p>
            {data.entries?.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t.date}</th>
                      <th>{t.action}</th>
                      <th>{t.actor}</th>
                      <th>{t.entity}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.entries.map((e) => (
                      <tr key={e.id}>
                        <td>{formatDateTime(e.created_at, locale)}</td>
                        <td>{actionLabel(e.action, locale)}</td>
                        <td className="mono">
                          {e.actor_id === 'system' ? 'DentLux' : e.actor_id.slice(0, 8)}
                        </td>
                        <td className="mono">{e.entity_id.slice(0, 12)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              !busy && <Empty title={t.noAudit} />
            )}
          </section>
        )}
        {tab === 'notifications' && (
          <section className="panel">
            <h2>{t.notificationTitle}</h2>
            <p className="panel-description">{t.notificationText}</p>
            {data.notifications?.some((n) => n.status === 'failed') && (
              <p className="error" role="alert">
                <Bell size={17} />
                {t.failed}
              </p>
            )}
            {data.notifications?.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t.date}</th>
                      <th>{t.reference}</th>
                      <th>{t.channel}</th>
                      <th>{t.statusLabel}</th>
                      <th>{t.attempts}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.notifications.map((n) => (
                      <tr key={n.id}>
                        <td>{formatDateTime(n.due_at, locale)}</td>
                        <td className="mono">{n.booking_id.slice(0, 8)}</td>
                        <td>{n.channel === 'sms' ? 'SMS' : 'Telegram'}</td>
                        <td>
                          <span className={`status-pill status-${n.status}`}>
                            {n.status === 'demo' ? t.demoStatus : t[n.status]}
                          </span>
                        </td>
                        <td>{n.attempts} / 3</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              !busy && <Empty title={t.noNotifications} />
            )}
          </section>
        )}
        {tab === 'technical' && (
          <section className="panel technical-panel">
            <Server size={40} />
            <h2>{t.technical}</h2>
            <p>{t.technicalText}</p>
            <dl>
              <div>
                <dt>{t.statusLabel}</dt>
                <dd>
                  <span className="status-dot" /> {data.status === 'ok' ? 'OK' : '—'}
                </dd>
              </div>
              <div>
                <dt>{t.database}</dt>
                <dd>
                  {data.database === 'postgres'
                    ? 'PostgreSQL'
                    : data.database === 'sqlite'
                      ? 'SQLite'
                      : '—'}
                </dd>
              </div>
              <div>
                <dt>{t.mode}</dt>
                <dd>{data.demo ? t.demo : t.liveMode}</dd>
              </div>
            </dl>
          </section>
        )}
      </div>
      {moving && (
        <MoveBooking
          booking={moving}
          onClose={() => setMoving(null)}
          onSaved={() => {
            setMoving(null);
            setMessage(t.rescheduled);
            setUndo(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
function Schedule({ catalog, date, setMessage, onChange }) {
  const { t, locale } = useLocale();
  const [doctorId, setDoctorId] = useState(catalog.doctors[0].id),
    [start, setStart] = useState('09:00'),
    [end, setEnd] = useState('18:00'),
    [dayOff, setDayOff] = useState(false),
    [error, setError] = useState(null),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    setLoaded(false);
    setError(null);
    api(`/slots?doctorId=${doctorId}&date=${date}`)
      .then((result) => {
        if (active) {
          setStart(result.schedule.start_time);
          setEnd(result.schedule.end_time);
          setDayOff(Boolean(result.schedule.day_off));
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (active) setError(e);
      });
    return () => {
      active = false;
    };
  }, [doctorId, date]);
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/staff/schedules', {
        method: 'PUT',
        body: { doctorId, date, start, end, dayOff },
      });
      setMessage(t.scheduleSaved);
      onChange();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel schedule-panel">
      <h2>{t.scheduleTitle}</h2>
      <p className="panel-description">{t.scheduleText}</p>
      <form onSubmit={save}>
        <label>
          {t.doctorLabel}
          <select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
            {catalog.doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name[locale]}
              </option>
            ))}
          </select>
        </label>
        <div className="time-fields">
          <label>
            {t.start}
            <input
              type="time"
              step="1800"
              min="08:00"
              max="19:30"
              value={start}
              required
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            {t.end}
            <input
              type="time"
              step="1800"
              min="08:30"
              max="20:00"
              value={end}
              required
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={dayOff} onChange={(e) => setDayOff(e.target.checked)} />
          {t.dayOff}
        </label>
        <ErrorMessage error={error} />
        <Button
          type="submit"
          busy={busy}
          disabled={!loaded || date < localDate() || date > shiftDate(localDate(), 60)}
        >
          {t.save}
          <Check size={16} />
        </Button>
      </form>
    </section>
  );
}
function MoveBooking({ booking, onClose, onSaved }) {
  const { t } = useLocale();
  const [date, setDate] = useState(booking.date < localDate() ? localDate() : booking.date),
    [time, setTime] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null);
  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api(`/staff/bookings/${booking.id}`, {
        method: 'PATCH',
        body: { date, time, expectedUpdatedAt: booking.updatedAt },
      });
      onSaved();
    } catch (e) {
      setError(e);
      if (e.code === 'SLOT_UNAVAILABLE') {
        setTime('');
        window.dispatchEvent(new Event('dentlux:availability'));
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title={t.rescheduleTitle} onClose={onClose}>
      <p className="dialog-subtitle">{t.rescheduleText}</p>
      <DateSlots
        doctorId={booking.doctorId}
        date={date}
        setDate={setDate}
        time={time}
        setTime={setTime}
      />
      <ErrorMessage error={error} />
      <Button className="full" onClick={save} busy={busy} disabled={!time}>
        {t.save}
        <Check size={17} />
      </Button>
    </Dialog>
  );
}
function formatDateTime(date, locale) {
  return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'kk-KZ', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Almaty',
  }).format(new Date(date));
}
function actionLabel(action, locale) {
  const names = {
    'auth.login': ['Вход в систему', 'Жүйеге кіру'],
    'booking.created': ['Создание записи', 'Жазылуды жасау'],
    'bookings.viewed': ['Просмотр записей', 'Жазылуларды қарау'],
    'booking.status_changed': ['Изменение статуса', 'Мәртебені өзгерту'],
    'booking.rescheduled': ['Перенос приёма', 'Қабылдауды ауыстыру'],
    'schedule.updated': ['Изменение расписания', 'Кестені өзгерту'],
    'notification.failed': ['Ошибка уведомления', 'Хабарлама қатесі'],
    'notifications.preference': ['Настройка уведомлений', 'Хабарламаларды баптау'],
    'telegram.linked': ['Подключение Telegram', 'Telegram қосу'],
    'telegram.unlinked': ['Отключение Telegram', 'Telegram өшіру'],
    'import.completed': ['Импорт записей', 'Жазылуларды импорттау'],
  };
  return names[action]?.[locale === 'ru' ? 0 : 1] || action;
}
