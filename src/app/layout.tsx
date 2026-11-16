import type { Metadata } from 'next';
import './globals.css';
import './workspace.css';
import './premium.css';
import './publication-workspace.css';
import './operation-theme.css';
import './refined-workspace.css';
import './general-dashboard.css';
import './general-dashboard-polish.css';
import './shopee-library.css';
import './operational-workspace.css';
import OperationTheme from '@/components/operation-theme';
import PublicationSync from '@/components/publication-sync';
export const metadata: Metadata = {title:'Dropou Automação · Central de ofertas',description:'Sua operação de afiliados de tecnologia e games em um só lugar.'};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="pt-BR"><body><OperationTheme/><PublicationSync/>{children}</body></html>;}
