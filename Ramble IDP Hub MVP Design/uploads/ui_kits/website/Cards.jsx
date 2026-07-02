/* global React, IconArrowRight */

export function ServiceCard({ icon, title, desc, onClick }) {
  return (
    <article className="svc" onClick={onClick}>
      <div className="svc__icon">{icon}</div>
      <h3 className="svc__title">{title}</h3>
      <p className="svc__desc">{desc}</p>
      <div className="svc__arrow">Explore →</div>
    </article>
  );
}

export function ProjectCard({ kicker, title, desc, location, year, photoVariant, onClick }) {
  const photoClass = `pj__photo placeholder-photo ${photoVariant ? `placeholder-photo--${photoVariant}` : ''}`;
  return (
    <article className="pj" onClick={onClick}>
      <div className={photoClass}></div>
      <div className="pj__body">
        <div className="pj__kicker">{kicker}</div>
        <h3 className="pj__title">{title}</h3>
        <p className="pj__desc">{desc}</p>
        <div className="pj__meta">
          <span>{location}</span>
          <span>·</span>
          <span>{year}</span>
        </div>
      </div>
    </article>
  );
}

window.ServiceCard = ServiceCard;
window.ProjectCard = ProjectCard;
