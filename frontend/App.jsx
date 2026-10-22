import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  Heart,
  ShieldCheck,
  CalendarDays,
  MapPin,
  Clock3,
  Menu,
  X,
  Sparkles,
  Search,
  Smile,
  Stethoscope,
  Check,
  LogOut,
  LayoutDashboard,
  Plus,
} from 'lucide-react';
import { LocaleContext, messages, errors } from './i18n';
import { api } from './api';
import { Avatar, Button, Dialog, ErrorMessage, PhoneAuth } from './components';
import Booking from './Booking';
import Workspace from './Workspace';

function Logo() {
  return (
    <a href="#" className="logo" aria-label="DentLux">
      <span className="logo-symbol">
        <svg viewBox="0 0 40 40">
          <path
            d="M10 9c5-4 7 0 10 0s5-4 10 0c8 7-2 25-5 25-4 0-1-13-5-13s-1 13-5 13c-3 0-13-18-5-25Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      </span>
      Dent<span className="logo-light">Lux</span>
      <i>✦</i>
    </a>
  );
}
const serviceIcons = {
  search: Search,
  sparkles: Sparkles,
  tooth: Stethoscope,
  smile: Smile,
  shield: ShieldCheck,
  heart: Heart,
};

export default function App() {
  const [locale, setLocale] = useState(() => localStorage.getItem('dentlux-locale') || 'ru');
  const safeLocale = ['ru', 'kk'].includes(locale) ? locale : 'ru';
  const t = messages[safeLocale];
  const [catalog, setCatalog] = useState(null),
    [user, setUser] = useState(null),
    [loadError, setLoadError] = useState(null),
    [reload, setReload] = useState(0);
  const [booking, setBooking] = useState(null),
    [login, setLogin] = useState(false),
    [privacy, setPrivacy] = useState(false),
    [profile, setProfile] = useState(null),
    [workspace, setWorkspace] = useState(false),
    [menu, setMenu] = useState(false),
    [category, setCategory] = useState('all');
  const [demoPhone, setDemoPhone] = useState(''),
    [loginError, setLoginError] = useState('');
  const [actionError, setActionError] = useState(null);
  const errorText = (error) =>
    error?.code === 'NETWORK_ERROR'
      ? t.loadError
      : errors[safeLocale][error?.code] || errors[safeLocale].DEFAULT;
  useEffect(() => {
    localStorage.setItem('dentlux-locale', safeLocale);
    document.documentElement.lang = safeLocale;
    document.title =
      safeLocale === 'ru' ? 'DentLux — забота о вашей улыбке' : 'DentLux — күлкіңізге қамқорлық';
  }, [safeLocale]);
  useEffect(() => {
    let active = true;
    setLoadError(null);
    Promise.all([api('/catalog'), api('/me')])
      .then(([data, me]) => {
        if (active) {
          setCatalog(data);
          setUser(me.user);
        }
      })
      .catch((e) => {
        if (active) setLoadError(e);
      });
    return () => {
      active = false;
    };
  }, [reload]);
  useEffect(() => {
    const socket = new WebSocket(
      `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`,
    );
    socket.onmessage = () => window.dispatchEvent(new Event('dentlux:availability'));
    return () => socket.close();
  }, []);
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST', body: {} });
      setUser(null);
      setWorkspace(false);
      setActionError(null);
    } catch (e) {
      setActionError(e);
    }
  }
  const nav = () => (
    <>
      {[
        ['services', t.navServices],
        ['doctors', t.navDoctors],
        ['about', t.navAbout],
        ['contacts', t.navContacts],
      ].map(([id, label]) => (
        <a key={id} href={`#${id}`} onClick={() => setMenu(false)}>
          {label}
        </a>
      ))}
    </>
  );
  return (
    <LocaleContext.Provider value={{ locale: safeLocale, t, errorText }}>
      {actionError && (
        <div className="container">
          <ErrorMessage error={actionError} />
        </div>
      )}
      {workspace && user && catalog ? (
        <Workspace
          catalog={catalog}
          user={user}
          onBack={() => setWorkspace(false)}
          onLogout={logout}
          locale={safeLocale}
          setLocale={setLocale}
          logo={<Logo />}
        />
      ) : (
        <>
          {catalog?.demo && (
            <div className="demo-banner">
              <span className="demo-dot" />
              <strong>{t.demo}</strong>
              <span>{t.demoText}</span>
            </div>
          )}
          <header className="site-header">
            <div className="container header-inner">
              <Logo />
              <nav className="desktop-nav" aria-label={t.navServices}>
                {nav()}
              </nav>
              <div className="header-actions">
                <div className="language" aria-label="Language">
                  <button onClick={() => setLocale('kk')} aria-pressed={safeLocale === 'kk'}>
                    ҚАЗ
                  </button>
                  <span>/</span>
                  <button onClick={() => setLocale('ru')} aria-pressed={safeLocale === 'ru'}>
                    РУС
                  </button>
                </div>
                {user ? (
                  <>
                    <button
                      className="staff-link"
                      onClick={() =>
                        user.role === 'patient' ? setLogin(true) : setWorkspace(true)
                      }
                    >
                      <LayoutDashboard size={15} />
                      {user.role === 'patient' ? t.signedIn : t.workspace}
                    </button>
                    <button className="icon-button logout" onClick={logout} aria-label={t.logout}>
                      <LogOut size={17} />
                    </button>
                  </>
                ) : (
                  <button
                    className="staff-link"
                    onClick={() => {
                      setLogin(true);
                      setLoginError('');
                    }}
                  >
                    {t.staff}
                    <ArrowUpRight size={14} />
                  </button>
                )}
                <button
                  className="icon-button menu-toggle"
                  aria-label={menu ? t.close : 'Menu'}
                  aria-expanded={menu}
                  onClick={() => setMenu(!menu)}
                >
                  {menu ? <X /> : <Menu />}
                </button>
              </div>
            </div>
            {menu && <nav className="mobile-nav">{nav()}</nav>}
          </header>
          <main>
            {loadError ? (
              <div className="container load-failure">
                <ErrorMessage error={loadError} />
                <Button onClick={() => setReload((v) => v + 1)}>{t.retry}</Button>
              </div>
            ) : !catalog ? (
              <div className="container loading" role="status">
                {t.loading}
              </div>
            ) : (
              <>
                <section className="hero container">
                  <div className="hero-copy">
                    <p className="eyebrow">
                      <span />
                      {t.eyebrow}
                    </p>
                    <h1>
                      {t.hero1}
                      <br />
                      <em>{t.hero2}</em>
                    </h1>
                    <p className="hero-description">{t.heroText}</p>
                    <div className="hero-buttons">
                      <Button onClick={() => setBooking({})}>
                        {t.book}
                        <ArrowUpRight size={20} />
                      </Button>
                      <a className="hero-link" href="#doctors">
                        {t.meetDoctors}
                        <ArrowRight size={16} />
                      </a>
                    </div>
                    <p className="hero-note">
                      <Clock3 size={14} />
                      {t.heroNote}
                    </p>
                    <div className="hero-facts">
                      <div>
                        <strong>
                          8–12<span>+</span>
                        </strong>
                        <span>{t.years}</span>
                      </div>
                      <div>
                        <strong>6</strong>
                        <span>{t.directions}</span>
                      </div>
                      <div>
                        <strong>24/7</strong>
                        <span>{t.online}</span>
                      </div>
                    </div>
                  </div>
                  <div className="hero-visual">
                    <div className="hero-image">
                      <img
                        src="/clinic.svg"
                        alt={
                          safeLocale === 'ru'
                            ? 'Иллюстрация светлого стоматологического кабинета с зелёным креслом'
                            : 'Жасыл креслосы бар жарық стоматологиялық кабинеттің иллюстрациясы'
                        }
                        fetchPriority="high"
                      />
                    </div>
                    <div className="image-caption">
                      <span className="status-dot" />
                      DentLux · Astana
                    </div>
                    <div className="hero-badge">
                      <span className="badge-heart">
                        <Heart size={25} />
                      </span>
                      <span>
                        <strong>{t.badgeTitle}</strong>
                        <small>{t.badgeText}</small>
                      </span>
                      <Sparkles size={18} />
                    </div>
                    <span className="hero-sparkle" aria-hidden="true">
                      ✳
                    </span>
                  </div>
                </section>
                <section id="about" className="care-section">
                  <div className="container">
                    <div className="care-heading">
                      <div>
                        <p className="eyebrow">{t.welcome}</p>
                        <h2>{t.careTitle}</h2>
                      </div>
                      <p>{t.careText}</p>
                    </div>
                    <div className="care-grid">
                      {[
                        [Heart, t.care1, t.care1Text],
                        [ShieldCheck, t.care2, t.care2Text],
                        [CalendarDays, t.care3, t.care3Text],
                      ].map(([Icon, title, text], i) => (
                        <article key={i}>
                          <span className="care-number">0{i + 1}</span>
                          <Icon size={25} />
                          <h3>{title}</h3>
                          <p>{text}</p>
                        </article>
                      ))}
                    </div>
                  </div>
                </section>
                <section id="services" className="section container">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">{t.servicesEyebrow}</p>
                      <h2>{t.servicesTitle}</h2>
                    </div>
                    <p>{t.servicesText}</p>
                  </div>
                  <div className="filters" role="group" aria-label={t.navServices}>
                    {[
                      'all',
                      'diagnostics',
                      'prevention',
                      'therapy',
                      'orthodontics',
                      'surgery',
                      'children',
                    ].map((c) => (
                      <button
                        key={c}
                        className={category === c ? 'active' : ''}
                        aria-pressed={category === c}
                        onClick={() => setCategory(c)}
                      >
                        {t[c]}
                      </button>
                    ))}
                  </div>
                  <div className="service-grid">
                    {catalog.services
                      .filter((s) => category === 'all' || s.category === category)
                      .map((s) => {
                        const Icon = serviceIcons[s.icon] || Plus;
                        return (
                          <article className="service-card" key={s.id}>
                            <div className="service-top">
                              <span className="service-icon">
                                <Icon size={26} strokeWidth={1.5} />
                              </span>
                              <span className="service-index">
                                0{catalog.services.indexOf(s) + 1}
                              </span>
                            </div>
                            <h3>{s.name[safeLocale]}</h3>
                            <p>{s.description[safeLocale]}</p>
                            <div className="service-bottom">
                              <div>
                                <strong>{s.price.toLocaleString(safeLocale)} ₸</strong>
                                <small>{t.appointment}</small>
                              </div>
                              <button
                                className="circle-button"
                                aria-label={`${t.choose} — ${s.name[safeLocale]}`}
                                onClick={() => setBooking({ serviceId: s.id })}
                              >
                                <ArrowUpRight size={22} />
                              </button>
                            </div>
                          </article>
                        );
                      })}
                  </div>
                </section>
                <section id="doctors" className="doctors-section">
                  <div className="container">
                    <div className="section-heading">
                      <div>
                        <p className="eyebrow">{t.doctorsEyebrow}</p>
                        <h2>{t.doctorsTitle}</h2>
                      </div>
                      <p>{t.doctorsText}</p>
                    </div>
                    <div className="doctors-grid">
                      {catalog.doctors.map((d) => (
                        <article className="doctor-card" key={d.id}>
                          <button
                            className="portrait-button"
                            onClick={() => setProfile(d)}
                            aria-label={`${t.doctorAbout} — ${d.name[safeLocale]}`}
                          >
                            <Avatar doctor={d} />
                            <span className="experience-tag">
                              {d.experience} {t.experience}
                            </span>
                            <span className="portrait-arrow">
                              <ArrowUpRight size={22} />
                            </span>
                          </button>
                          <div className="doctor-info">
                            <h3>{d.name[safeLocale]}</h3>
                            <p>{d.specialty[safeLocale]}</p>
                            <button
                              className="text-button"
                              onClick={() =>
                                setBooking({ doctorId: d.id, serviceId: d.services[0] })
                              }
                            >
                              {t.book}
                              <ArrowRight size={16} />
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                </section>
                <section className="container cta-wrap">
                  <div className="cta">
                    <div>
                      <p className="eyebrow">DENTLUX · ASTANA</p>
                      <h2>{t.ctaTitle}</h2>
                      <p>{t.ctaText}</p>
                      <Button variant="cream" onClick={() => setBooking({})}>
                        {t.book}
                        <ArrowUpRight size={20} />
                      </Button>
                    </div>
                    <div className="cta-art" aria-hidden="true">
                      <svg viewBox="0 0 200 200">
                        <path
                          d="M55 47c25-19 34 0 45 0s20-19 45 0c45 33-8 124-20 124-18 0-4-65-25-65s-7 65-25 65C63 171 10 80 55 47Z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                        />
                        <path
                          d="M41 36c32-25 45-1 59-1s27-24 59 1c57 43-10 156-27 156-22 0-5-82-32-82s-10 82-32 82C51 192-16 79 41 36Z"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth=".6"
                        />
                      </svg>
                      <Sparkles size={36} />
                    </div>
                  </div>
                </section>
                <section id="contacts" className="container contact-section">
                  <div>
                    <p className="eyebrow">DENTLUX · ASTANA</p>
                    <h2>{t.addressTitle}</h2>
                    <p className="contact-intro">{t.contactText}</p>
                    <div className="contact-row">
                      <MapPin size={23} />
                      <div>
                        <span>{t.addressLabel}</span>
                        <strong>{catalog.clinic.address[safeLocale]}</strong>
                      </div>
                    </div>
                    <div className="contact-row">
                      <Clock3 size={23} />
                      <div>
                        <span>{t.hours}</span>
                        <strong>{t.hoursValue}</strong>
                        <small>{t.break}</small>
                      </div>
                    </div>
                    <p className="fine">{t.phoneUnset}</p>
                  </div>
                  <div className="map-illustration">
                    <div className="map-grid" />
                    <div className="map-park" />
                    <span className="map-street">МӘҢГІЛІК ЕЛ</span>
                    <div className="map-marker">
                      <span>
                        <MapPin size={29} />
                      </span>
                      <strong>DentLux</strong>
                      <small>26</small>
                    </div>
                    <a
                      href="https://www.google.com/maps/search/?api=1&query=Astana+Mangilik+El+26"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t.mapLink}
                      <ArrowUpRight size={16} />
                    </a>
                  </div>
                </section>
              </>
            )}
          </main>
          <footer className="container footer">
            <div>
              <Logo />
              <p>{t.footer}</p>
            </div>
            <span>
              {t.copyright} · {new Date().getFullYear()}
            </span>
            <button className="text-button" onClick={() => setPrivacy(true)}>
              {t.privacy}
              <ArrowUpRight size={14} />
            </button>
          </footer>
        </>
      )}
      {booking && catalog && (
        <Booking
          catalog={catalog}
          user={user}
          onUser={setUser}
          onLogout={logout}
          initial={booking}
          onClose={() => setBooking(null)}
          openPrivacy={() => setPrivacy(true)}
        />
      )}
      {login && (
        <Dialog title={t.loginTitle} onClose={() => setLogin(false)} className="login-dialog">
          <p className="dialog-subtitle">{t.loginText}</p>
          {user ? (
            <div className="notice">
              <p>
                {t[user.role]} · {user.phone}
              </p>
              {user.role !== 'patient' && (
                <Button
                  onClick={() => {
                    setWorkspace(true);
                    setLogin(false);
                  }}
                >
                  {t.workspace}
                  <ArrowRight size={16} />
                </Button>
              )}
              <Button variant="secondary" onClick={logout}>
                {t.logout}
              </Button>
            </div>
          ) : (
            <PhoneAuth
              user={null}
              onUser={setUser}
              initialPhone={demoPhone}
              demo={catalog?.demo}
              onComplete={(u) => {
                if (u.role === 'patient') setLoginError(t.staffOnly);
                else {
                  setWorkspace(true);
                  setLogin(false);
                }
              }}
            />
          )}{' '}
          {loginError && (
            <p className="error" role="alert">
              {loginError}
            </p>
          )}
          {catalog?.demo && !user && (
            <div className="demo-accounts">
              <p>{t.demoAccounts}</p>
              {[
                ['receptionist', '01'],
                ['doctor', '02'],
                ['lawyer', '03'],
                ['admin', '04'],
              ].map(([role, n]) => (
                <button key={role} onClick={() => setDemoPhone(`+770000000${n}`)}>
                  {t[role]}
                  <span>…{n}</span>
                </button>
              ))}
            </div>
          )}
        </Dialog>
      )}
      {profile && (
        <Dialog
          title={profile.name[safeLocale]}
          onClose={() => setProfile(null)}
          className="profile-dialog"
        >
          <Avatar doctor={profile} />
          <p className="eyebrow">
            {profile.specialty[safeLocale]} · {profile.experience} {t.experience}
          </p>
          <p>{t.doctorBio}</p>
          <h3>{t.doctorServices}</h3>
          <ul>
            {catalog.services
              .filter((s) => profile.services.includes(s.id))
              .map((s) => (
                <li key={s.id}>{s.name[safeLocale]}</li>
              ))}
          </ul>
          <Button
            onClick={() => {
              setBooking({ doctorId: profile.id, serviceId: profile.services[0] });
              setProfile(null);
            }}
          >
            {t.book}
            <ArrowRight size={16} />
          </Button>
        </Dialog>
      )}
      {privacy && <Privacy onClose={() => setPrivacy(false)} user={user} t={t} />}
    </LocaleContext.Provider>
  );
}
function Privacy({ onClose, user, t }) {
  const [message, setMessage] = useState(''),
    [error, setError] = useState(null);
  async function unlink() {
    try {
      await api('/telegram/link', { method: 'DELETE', body: {} });
      setMessage(t.unlinked);
    } catch (e) {
      setError(e);
    }
  }
  return (
    <Dialog title={t.privacyTitle} onClose={onClose} className="privacy-dialog">
      <p>{t.privacyText}</p>
      <p>{t.privacyTelegram}</p>
      <p>{t.privacyExtra}</p>
      <p>{t.privacyContact}</p>
      {user?.role === 'patient' && (
        <Button variant="secondary" onClick={unlink}>
          {t.unlinkTelegram}
        </Button>
      )}
      <p role="status">{message}</p>
      <ErrorMessage error={error} />
      <Button onClick={onClose}>
        {t.close}
        <Check size={16} />
      </Button>
    </Dialog>
  );
}
