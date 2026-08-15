export default function DashboardScreen() {
  return (
    <section className="space-y-6 p-4 md:p-8" aria-labelledby="dashboard-title">
      <h2 id="dashboard-title" className="text-xl font-semibold tracking-tight">
        Resumo do mês
      </h2>
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Em breve: total do mês e gráfico de gastos por categoria.
      </div>
    </section>
  );
}
