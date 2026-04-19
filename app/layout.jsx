import "./globals.css";

export const metadata = {
  title: "Comprobante Pagadito",
  description: "URL de retorno para comprobante de pago",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
