'use client';
import {useState} from 'react';
import Link from 'next/link';
import {api} from '../../lib/api';
export default function Login(){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);try{await api('/auth/login',{method:'POST',body:JSON.stringify({email,password})});location.href='/dashboard'}catch(e:any){setError(e.message)}finally{setBusy(false)}}
 return <main className="max-w-md mx-auto px-5 py-20"><div className="card"><h1 className="text-3xl font-bold mb-2">Welcome back</h1><p className="text-slate-500 mb-7">Sign in to your account</p><form onSubmit={submit} className="space-y-4"><div><label className="label">Email</label><input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></div><div><label className="label">Password</label><input type="password" required value={password} onChange={e=>setPassword(e.target.value)}/></div>{error&&<p role="alert" className="text-red-600">{error}</p>}<button disabled={busy} className="btn w-full">{busy?'Signing in…':'Sign in'}</button></form><p className="mt-5 text-sm">New here? <Link className="text-blue-600" href="/register">Create an account</Link></p></div></main>
}
