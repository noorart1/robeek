
export const metadata = {
  title: "سامانه مدیریت مدرسه",
  description: "سامانه مدیریت دانش‌آموزان"
};

export default function RootLayout({ children }) {
  return (
    <html lang="fa" dir="rtl">
      <body style={{
        margin: 0,
        fontFamily: "Tahoma, Arial, sans-serif",
        backgroundColor: "#f4f6f9"
      }}>
        {children}
      </body>
    </html>
  );
}
