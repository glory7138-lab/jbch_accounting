export default function StatCard({ title, value, tone = 'default' }) {
  return (
    <div className={`card stat-card ${tone}`}>
      <div className="stat-card__title">{title}</div>
      <div className="stat-card__value">{value}</div>
    </div>
  );
}
