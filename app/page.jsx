import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="rounded-lg bg-white p-6 shadow">
        <h1 className="text-xl font-semibold text-slate-800">Proyecto URLRedireccion</h1>
        <p className="mt-2 text-sm text-slate-600">
          Abre la pagina de comprobante en:
        </p>
        <Link
          href="/comprobante?token=TOKEN_DE_PRUEBA&order=ORDEN-001"
          className="mt-4 inline-block rounded bg-[#00478F] px-4 py-2 text-sm font-medium text-white"
        >
          Ir a comprobante
        </Link>
      </div>
    </main>
  );
}
