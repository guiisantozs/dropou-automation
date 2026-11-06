import type { Metadata } from 'next';
import './globals.css';
import './workspace.css';
export const metadata: Metadata = {title:'Dropou Automação · Central de ofertas',description:'Sua operação de afiliados de tecnologia e games em um só lugar.'};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="pt-BR"><body>{children}</body></html>;}
