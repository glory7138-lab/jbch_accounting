import './globals.css';
import Nav from '../components/Nav';

export const metadata = {
  title: 'Accounting Web App',
  description: 'Next.js + FastAPI 기반 회계 프로그램',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>
        <Nav />
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
