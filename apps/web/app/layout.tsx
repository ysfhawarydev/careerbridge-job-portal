import './globals.css';
import Nav from '../components/Nav';
import Link from 'next/link';
import {BriefcaseBusiness} from 'lucide-react';
export const metadata={title:'CareerBridge | Find your next opportunity',description:'Find meaningful jobs, connect with employers, and take the next step in your career.'};
export default function Layout({children}:{children:React.ReactNode}){
 return <html lang="en"><body><Nav/>{children}<footer className="border-t border-slate-200 bg-white"><div className="container-wide flex flex-col justify-between gap-6 py-10 md:flex-row md:items-center"><div><Link href="/" className="flex items-center gap-2 font-extrabold text-slate-900"><BriefcaseBusiness className="text-blue-600" size={21}/> CareerBridge<span className="text-blue-600">.</span></Link><p className="mt-2 text-sm text-slate-500">A better way to connect talent and opportunity.</p></div><div className="flex flex-wrap gap-6 text-sm font-semibold text-slate-500"><Link href="/">Find jobs</Link><Link href="/dashboard">Dashboard</Link><Link href="/register">Get started</Link></div><p className="text-xs text-slate-400">© {new Date().getFullYear()} CareerBridge</p></div></footer></body></html>
}
