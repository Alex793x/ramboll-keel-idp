/* global React, IconClose, IconCheck */

export function ContactModal({ open, onClose }) {
  const { IconClose, IconCheck } = window;
  const [sent, setSent] = React.useState(false);
  const [form, setForm] = React.useState({ name: '', email: '', service: 'Buildings', message: '' });

  if (!open) return null;

  function update(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  function submit(e) {
    e.preventDefault();
    setSent(true);
  }

  function handleClose() {
    setSent(false);
    setForm({ name: '', email: '', service: 'Buildings', message: '' });
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal__close" onClick={handleClose} aria-label="Close">
          <IconClose size={18} strokeWidth={2.25} />
        </button>
        {sent ? (
          <div className="modal__success">
            <div className="icon"><IconCheck /></div>
            <h2 className="h2">Thank you.</h2>
            <p className="lead">A Ramboll specialist in {form.service} will reach out within two working days.</p>
            <button className="btn btn--ghost" onClick={handleClose} style={{ marginTop: 16 }}>Close</button>
          </div>
        ) : (
          <>
            <div className="sec__kicker" style={{ marginBottom: 12 }}>Get in touch</div>
            <h2 className="h2">Tell us what you're working on.</h2>
            <p className="lead">Share a few details and we'll connect you with the right specialist.</p>
            <form className="modal__form" onSubmit={submit}>
              <div className="modal__field">
                <label>Your name</label>
                <input required value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Jane Doe" />
              </div>
              <div className="modal__field">
                <label>Work email</label>
                <input required type="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="jane@company.com" />
              </div>
              <div className="modal__field">
                <label>Service area</label>
                <select value={form.service} onChange={(e) => update('service', e.target.value)}>
                  <option>Buildings</option>
                  <option>Transport</option>
                  <option>Energy</option>
                  <option>Water</option>
                  <option>Environment & Health</option>
                  <option>Management Consulting</option>
                  <option>Architecture & Landscape</option>
                </select>
              </div>
              <div className="modal__field">
                <label>What can we help with?</label>
                <textarea rows={3} value={form.message} onChange={(e) => update('message', e.target.value)} placeholder="A few sentences about your project, timing, and goals." />
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="btn btn--ghost" onClick={handleClose}>Cancel</button>
                <button type="submit" className="btn">Send enquiry</button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

window.ContactModal = ContactModal;
