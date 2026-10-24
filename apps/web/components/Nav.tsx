'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {BriefcaseBusiness, Menu, X, ArrowUpRight, LayoutDashboard, LogOut} from 'lucide-react';
import {api,User} from '../lib/api';
export default function Nav(){
 const [user,setUser]=useState<User|null>(null),[open,setOpen]=useState(false);
 useEffect(()=>{api<{user:User|null}>('/auth/me').then(x=>setUser(x.user)).catch(()=>{})},[]);
 async function logout(){try{await api('/auth/logout',{method:'POST'});window.location.assign('/')}catch(e){console.error(e)}}
 return <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur"><nav className="container-wide flex h-20 items-center justify-between gap-4">
 <Link href="/" className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight text-slate-950" aria-label="CareerBridge home"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white"><BriefcaseBusiness size={22}/></span>Career<span className="text-blue-600">Bridge</span><span className="text-blue-600">.</span></Link>
 <div className="hidden items-center gap-8 text-sm font-semibold text-slate-600 md:flex"><Link className="hover:text-blue-600" href="/">Find jobs</Link><Link className="hover:text-blue-600" href="/#how-it-works">How it works</Link><Link className="hover:text-blue-600" href="/#opportunities">Explore opportunities</Link></div>
 <div className="hidden items-center gap-3 md:flex">{user?<><Link href="/dashboard" className="btn-secondary inline-flex items-center gap-2"><LayoutDashboard size={16}/> Dashboard</Link><button onClick={logout} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-red-600"><LogOut size={16}/> Logout</button></>:<><Link href="/login" className="px-4 py-2 text-sm font-semibold text-slate-700">Sign in</Link><Link href="/register" className="btn inline-flex items-center gap-2">Get started <ArrowUpRight size={16}/></Link></>}</div>
 <button type="button" className="rounded-xl border border-slate-200 p-2 md:hidden" aria-label={open?'Close navigation':'Open navigation'} aria-expanded={open} onClick={()=>setOpen(v=>!v)}>{open?<X/>:<Menu/>}</button></nav>
 {open&&<div className="border-t border-slate-100 bg-white px-5 py-4 md:hidden"><div className="flex flex-col gap-4 text-sm font-semibold"><Link onClick={()=>setOpen(false)} href="/">Find jobs</Link><Link onClick={()=>setOpen(false)} href="/#how-it-works">How it works</Link><Link onClick={()=>setOpen(false)} href="/dashboard">Dashboard</Link>{user?<button className="text-left" onClick={logout}>Logout</button>:<><Link href="/login">Sign in</Link><Link className="text-blue-600" href="/register">Create account</Link></>}</div></div>}</header>
}
