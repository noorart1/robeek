
import "./globals.css";

export const metadata = {
  title: "نظام إدارة المدرسة",
  description: "نظام إدارة بيانات الأطفال وأولياء الأمور"
};

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{
        margin: 0,
        backgroundColor: "#f4f6f9"
      }}>
        {children}
      </body>
    </html>
  );
}
