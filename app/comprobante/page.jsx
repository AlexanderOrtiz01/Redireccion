const PAGADITO_SOAP_URL = "https://sandbox.pagadito.com/comercios/wspg/charges.php";
const FAILED_STATUSES = new Set(["FAILED", "EXPIRED", "CANCELED", "REVOKED"]);

import CloseAppButton from "./CloseAppButton";

export const dynamic = "force-dynamic";

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function decodeXmlEntities(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function extractReturnJson(xmlText) {
  // 1. Extraemos el contenido entre <return> y </return>
  const match = xmlText.match(/<return[^>]*>(.*?)<\/return>/is);
  if (!match || !match[1]) {
    throw new Error("No fue posible extraer la etiqueta <return> de Pagadito.");
  }

  // 2. Limpiamos espacios y decodificamos las entidades XML (como &quot;)
  let rawValue = match[1].trim();
  let jsonText = decodeXmlEntities(rawValue);

  // 3. Intentamos parsear el JSON
  try {
    return JSON.parse(jsonText);
  } catch (error) {
    console.error("Error al parsear el JSON de Pagadito:", jsonText);
    throw new Error("Pagadito devolvio un JSON invalido dentro de <return>.");
  }
}

function buildConnectEnvelope(uid, wsk) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:SoapControllerwsdl">
  <soapenv:Header/>
  <soapenv:Body>
    <urn:connect>
      <uid>${escapeXml(uid)}</uid>
      <wsk>${escapeXml(wsk)}</wsk>
    </urn:connect>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function buildGetStatusEnvelope(connectionToken, tokenTrans) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:SoapControllerwsdl">
  <soapenv:Header/>
  <soapenv:Body>
    <urn:get_status>
      <token>${escapeXml(connectionToken)}</token>
      <token_trans>${escapeXml(tokenTrans)}</token_trans>
    </urn:get_status>
  </soapenv:Body>
</soapenv:Envelope>`;
}

async function postSoapRequest(bodyXml) {
  const response = await fetch(PAGADITO_SOAP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      Accept: "text/xml",
    },
    body: bodyXml,
    cache: "no-store",
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`Pagadito respondio con HTTP ${response.status}.`);
  }

  return responseText;
}

async function getPagaditoStatus(tokenTrans) {
  const uid = process.env.PAGADITO_UID;
  const wsk = process.env.PAGADITO_WSK;

  if (!uid || !wsk) {
    throw new Error("Faltan las variables de entorno PAGADITO_UID o PAGADITO_WSK.");
  }

  const connectXml = buildConnectEnvelope(uid, wsk);
  const connectResponseXml = await postSoapRequest(connectXml);
  const connectResponse = extractReturnJson(connectResponseXml);
  const connectionToken = connectResponse?.token || connectResponse?.value;

  if (!connectionToken) {
    throw new Error("No se recibio token de conexion desde Pagadito.");
  }

  const statusXml = buildGetStatusEnvelope(connectionToken, tokenTrans);
  const statusResponseXml = await postSoapRequest(statusXml);
  const statusResponse = extractReturnJson(statusResponseXml);
  const statusPayload =
    statusResponse?.value && typeof statusResponse.value === "object" ? statusResponse.value : statusResponse;

  return {
    status: String(statusPayload?.status || "").toUpperCase(),
    reference: statusPayload?.reference || statusPayload?.authorization || statusPayload?.auth || "No disponible",
    amount: statusPayload?.amount || statusPayload?.total || statusPayload?.trans_amount || "No disponible",
    orderFromGateway: statusPayload?.ern || statusPayload?.order || statusPayload?.order_id || undefined,
  };
}

function formatAmount(amount) {
  const numericAmount = Number(amount);

  if (Number.isFinite(numericAmount)) {
    return new Intl.NumberFormat("es-SV", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numericAmount);
  }

  return String(amount || "No disponible");
}

function StatusIcon({ success }) {
  if (success) {
    return (
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
        <svg viewBox="0 0 24 24" className="h-9 w-9 text-green-600" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }

  return (
    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
      <svg viewBox="0 0 24 24" className="h-9 w-9 text-red-600" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M12 8v5" strokeLinecap="round" />
        <circle cx="12" cy="16.5" r="1" fill="currentColor" stroke="none" />
        <path d="M10.3 3.5L2.7 17a2 2 0 001.7 3h15.2a2 2 0 001.7-3L13.7 3.5a2 2 0 00-3.4 0z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-3">
      <span className="text-sm font-medium text-slate-500">{label}</span>
      <span className="ml-4 text-right text-sm font-semibold text-slate-800">{value}</span>
    </div>
  );
}

function ResultCard({ order, status, reference, amount, isError, errorMessage }) {
  const isSuccess = status === "COMPLETED";
  const title = isSuccess ? "¡Pago Exitoso!" : "Pago no procesado";
  const message = isSuccess
    ? "Tu transaccion fue aprobada correctamente."
    : errorMessage || "No fue posible completar el pago. Intenta nuevamente o contacta a soporte.";

  return (
    <div
      className={`w-full max-w-md rounded-lg bg-white p-6 shadow-lg sm:p-8 ${
        isError ? "border-2 border-red-200" : "border border-slate-100"
      }`}
    >
      <StatusIcon success={isSuccess} />

      <h1 className={`text-center text-2xl font-bold ${isSuccess ? "text-slate-800" : "text-red-700"}`}>{title}</h1>
      <p className="mt-2 text-center text-sm text-slate-600">{message}</p>

      <div className="mt-6 rounded-md bg-slate-50 px-4">
        <InfoRow label="Numero de Orden" value={order || "No disponible"} />
        <InfoRow label="Aprobacion" value={reference || "No disponible"} />
        <InfoRow label="Monto Pagado" value={formatAmount(amount)} />
      </div>

      <CloseAppButton
        className="mt-7 block w-full rounded-md bg-[#00478F] px-4 py-3 text-center text-base font-semibold text-white transition hover:bg-[#003b75] active:scale-[0.99]"
      />
    </div>
  );
}

function ErrorCard({ title, message }) {
  return (
    <div className="w-full max-w-md rounded-lg border-2 border-red-200 bg-white p-6 shadow-lg sm:p-8">
      <StatusIcon success={false} />
      <h1 className="text-center text-2xl font-bold text-red-700">{title}</h1>
      <p className="mt-2 text-center text-sm text-slate-600">{message}</p>

      <CloseAppButton
        className="mt-7 block w-full rounded-md bg-[#00478F] px-4 py-3 text-center text-base font-semibold text-white transition hover:bg-[#003b75] active:scale-[0.99]"
      />
    </div>
  );
}

export default async function ComprobantePage({ searchParams }) {
  const resolvedSearchParams = typeof searchParams?.then === "function" ? await searchParams : searchParams || {};

  const tokenTrans = resolvedSearchParams.token;
  const order = resolvedSearchParams.order;

  if (!tokenTrans || !order) {
    return (
      <div className="flex min-h-screen flex-col bg-gray-50">
        <header className="h-16 bg-[#00478F]" />
        <main className="flex flex-1 items-center justify-center px-4 py-10">
          <ErrorCard
            title="Datos incompletos"
            message="La URL de retorno no contiene los parametros requeridos (token y order)."
          />
        </main>
        <footer className="bg-[#00478F] px-4 py-3 text-center text-xs text-white/90">
          Tus pagos en linea son seguros con Pagadito
        </footer>
      </div>
    );
  }

  try {
    const { status, reference, amount, orderFromGateway } = await getPagaditoStatus(tokenTrans);
    const isFailure = FAILED_STATUSES.has(status);

    return (
      <div className="flex min-h-screen flex-col bg-gray-50">
        <header className="h-16 bg-[#00478F]" />

        <main className="flex flex-1 items-center justify-center px-4 py-10">
          <ResultCard
            order={orderFromGateway || order}
            status={status}
            reference={reference}
            amount={amount}
            isError={isFailure}
            errorMessage={
              isFailure
                ? "El pago fue rechazado o ya no esta vigente. Verifica el estado en tu app e intenta nuevamente."
                : undefined
            }
          />
        </main>

        <footer className="bg-[#00478F] px-4 py-3 text-center text-xs text-white/90">
          Tus pagos en linea son seguros con Pagadito
        </footer>
      </div>
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No fue posible validar el pago con Pagadito en este momento.";

    return (
      <div className="flex min-h-screen flex-col bg-gray-50">
        <header className="h-16 bg-[#00478F]" />
        <main className="flex flex-1 items-center justify-center px-4 py-10">
          <ErrorCard title="Error al validar el pago" message={message} />
        </main>
        <footer className="bg-[#00478F] px-4 py-3 text-center text-xs text-white/90">
          Tus pagos en linea son seguros con Pagadito
        </footer>
      </div>
    );
  }
}