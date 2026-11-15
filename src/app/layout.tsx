import type { Metadata } from 'next';
import './globals.css';
import './workspace.css';
import './premium.css';
import './publication-workspace.css';
import PublicationSync from '@/components/publication-sync';
export const metadata: Metadata = {title:'Dropou Automação · Central de ofertas',description:'Sua operação de afiliados de tecnologia e games em um só lugar.'};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="pt-BR"><body><PublicationSync/>{children}</body></html>;}
