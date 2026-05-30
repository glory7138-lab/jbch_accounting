import './globals.css';
import Nav from '../components/Nav';
import { YearProvider } from '../lib/YearContext';

export const metadata = {
  title: 'Accounting Web App',
  description: 'Next.js + FastAPI 기반 회계 프로그램',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>
        <YearProvider>
          <Nav />
          <main className="container">{children}</main>
        </YearProvider>
      </body>
    </html>
  );
}
