const url = "https://sandbox.pagadito.com/comercios/wspg/charges.php";

const uid = process.env.PAGADITO_UID;
const wsk = process.env.PAGADITO_WSK;
const tokenTrans = process.argv[2];

if (!uid || !wsk || !tokenTrans) {
  console.error("Usage: PAGADITO_UID=... PAGADITO_WSK=... node debug-pagadito.mjs <token_trans>");
  process.exit(1);
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
  const match = xmlText.match(/<return[^>]*>(.*?)<\/return>/is);
  if (!match?.[1]) {
    throw new Error("No <return> in SOAP response");
  }

  const raw = match[1].trim();
  const cdata = raw.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i);
  const jsonText = decodeXmlEntities((cdata?.[1] ?? raw).trim());
  return JSON.parse(jsonText);
}

function buildConnectXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:SoapControllerwsdl">
  <soapenv:Header/>
  <soapenv:Body>
    <urn:connect>
      <uid>${uid}</uid>
      <wsk>${wsk}</wsk>
    </urn:connect>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function buildStatusXml(token) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:SoapControllerwsdl">
  <soapenv:Header/>
  <soapenv:Body>
    <urn:get_status>
      <token>${token}</token>
      <token_trans>${tokenTrans}</token_trans>
    </urn:get_status>
  </soapenv:Body>
</soapenv:Envelope>`;
}

async function postXml(xml) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      Accept: "text/xml",
    },
    body: xml,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return text;
}

const connectXml = await postXml(buildConnectXml());
const connect = extractReturnJson(connectXml);
console.log("CONNECT:", connect);

const connToken = connect.token || connect.value;
const statusXml = await postXml(buildStatusXml(connToken));
const status = extractReturnJson(statusXml);
console.log("STATUS:", status);
