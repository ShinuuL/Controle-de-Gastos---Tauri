export default function ExpensesScreen() {
  return (
    <section className="space-y-6 p-4 md:p-8" aria-labelledby="expenses-title">
      <h2 id="expenses-title" className="text-xl font-semibold tracking-tight">
        Despesas
      </h2>
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Em breve: lista de gastos com adicionar, editar e excluir.
      </div>
    </section>
  );
}
