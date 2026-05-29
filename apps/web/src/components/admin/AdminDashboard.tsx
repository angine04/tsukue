export default function AdminDashboard() {
  return (
    <div className="admin-dashboard p-8">
      <h1 className="text-2xl font-bold text-[var(--color-ink)] mb-6">Admin Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-4 rounded-lg">
          <h2 className="font-medium text-[var(--color-ink)]">Pending Comments</h2>
          <p className="text-[var(--color-muted)]">0</p>
        </div>
        <div className="card p-4 rounded-lg">
          <h2 className="font-medium text-[var(--color-ink)]">Subscribers</h2>
          <p className="text-[var(--color-muted)]">0</p>
        </div>
      </div>
    </div>
  );
}
